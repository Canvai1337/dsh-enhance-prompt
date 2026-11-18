/**
 * Host-half HTTP checks: mount the real `apply()` on a real http server and
 * drive it with real requests, so the body ceiling, the drain behaviour and the
 * keep-alive reuse are exercised the way the browser hits them.
 *
 * The DSH runtime is stubbed at its three seams (`webServer`, `connection`,
 * `llm`); everything below them is the shipped code.
 */
import assert from 'node:assert/strict';
import http from 'node:http';
import { pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const host = await import(pathToFileURL(join(here, '..', 'index.js')).href);

let passed = 0;
const check = async (name, fn) => {
  await fn();
  passed += 1;
  console.log(`ok ${name}`);
};

/** Mount the plugin's route on a throwaway server; `llmAnswer` scripts the model. */
async function mount({ llmAnswer = () => '目标：\n- 做事', authenticated = true } = {}) {
  const routes = [];
  const ctx = {
    get: name => {
      if (name === 'connection') {
        return {
          requestRejection: request => (authenticated ? undefined : 401),
        };
      }
      if (name === 'agentDefaultModel') {
        return { currentSelection: () => ({ provider: 'p', model: 'm' }) };
      }
      return undefined;
    },
    effect: fn => fn(),
    webServer: {
      register: route => {
        routes.push(route);
        return () => {};
      },
    },
    llm: {
      async *stream(options) {
        const answer = llmAnswer(options);
        yield { type: 'text-delta', index: 0, text: answer };
        yield { type: 'finish', reason: { kind: 'stop' } };
      },
    },
  };
  host.apply(ctx, { maxInputChars: 32000 });
  assert.equal(routes.length, 1, 'exactly one route is registered');
  const route = routes[0];
  assert.equal(route.path, host.ENHANCE_PROMPT_PATH);

  const server = http.createServer((req, res) => {
    void route.handler(req, res);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  return { server, port, route };
}

/** One POST over an explicit keep-alive agent, so reuse is observable. */
function post(port, agent, { body, headers = {}, method = 'POST' } = {}) {
  return new Promise(resolve => {
    const payload = body === undefined ? null : Buffer.from(body, 'utf8');
    const request = http.request({
      host: '127.0.0.1', port, path: host.ENHANCE_PROMPT_PATH, method, agent,
      headers: {
        'content-type': 'application/json',
        ...payload === null ? {} : { 'content-length': payload.length },
        ...headers,
      },
    }, response => {
      let data = '';
      response.on('data', chunk => { data += chunk });
      response.on('end', () => resolve({ status: response.statusCode, data, reused: request.reusedSocket }));
    });
    request.on('error', error => resolve({ error: error.code ?? error.message, reused: request.reusedSocket }));
    request.end(payload ?? undefined);
  });
}

const { server, port } = await mount();
const agent = new http.Agent({ keepAlive: true, maxSockets: 1 });

try {
  await check('rejects a non-POST method with 405', async () => {
    const result = await post(port, agent, { method: 'GET' });
    assert.equal(result.status, 405);
  });

  await check('rejects a non-JSON content type with 415', async () => {
    const result = await post(port, agent, { body: 'hi', headers: { 'content-type': 'text/plain' } });
    assert.equal(result.status, 415);
  });

  await check('rejects malformed JSON with 400', async () => {
    const result = await post(port, agent, { body: '{"text":' });
    assert.equal(result.status, 400);
    assert.match(result.data, /must be JSON/u);
  });

  await check('rejects a blank draft with 400', async () => {
    const result = await post(port, agent, { body: JSON.stringify({ text: '   ' }) });
    assert.equal(result.status, 400);
    assert.match(result.data, /empty-draft/u);
  });

  await check('answers a normal draft with 200 and normalized text', async () => {
    const result = await post(port, agent, { body: JSON.stringify({ text: '写个待办清单' }) });
    assert.equal(result.status, 200);
    assert.equal(JSON.parse(result.data).text, '目标：\n- 做事');
  });

  await check('refuses an oversized body with 413', async () => {
    const result = await post(port, agent, { body: JSON.stringify({ text: 'x'.repeat(3 * 1024 * 1024) }) });
    assert.equal(result.status, 413);
    assert.match(result.data, /request body is too large/u);
  });

  await check('keeps the connection usable after an oversized body', async () => {
    // The bug this guards: answering before the upload finished destroyed the
    // socket, so the next request on the same keep-alive connection failed.
    const followUp = await post(port, agent, { body: JSON.stringify({ text: '写个待办清单' }) });
    assert.equal(followUp.error, undefined, `follow-up failed: ${followUp.error}`);
    assert.equal(followUp.status, 200);
  });

  await check('refuses a draft past maxInputChars with 413', async () => {
    const result = await post(port, agent, { body: JSON.stringify({ text: 'y'.repeat(33000) }) });
    assert.equal(result.status, 413);
    assert.match(result.data, /maxInputChars/u);
    const followUp = await post(port, agent, { body: JSON.stringify({ text: '写个待办清单' }) });
    assert.equal(followUp.status, 200);
  });

  await check('answers an upload far past the drain ceiling with 413, not a reset', async () => {
    // A cut drain cannot be drained to the end, but the client must still read
    // the refusal instead of a connection reset.
    const result = await post(port, agent, { body: JSON.stringify({ text: 'z'.repeat(20 * 1024 * 1024) }) });
    assert.equal(result.status, 413);
    assert.match(result.data, /request body is too large/u);
  });
} finally {
  agent.destroy();
  await new Promise(resolve => server.close(resolve));
}

{
  const unauthenticated = await mount({ authenticated: false });
  try {
    await check('answers 401 when the trust fence rejects the caller', async () => {
      const result = await post(unauthenticated.port, null, { body: JSON.stringify({ text: 'hi' }) });
      assert.equal(result.status, 401);
    });
  } finally {
    await new Promise(resolve => unauthenticated.server.close(resolve));
  }
}

{
  // A model that drops the marker first and repairs it on the retry.
  let call = 0;
  const scripted = await mount({
    llmAnswer: () => {
      call += 1;
      return call === 1 ? '总结材料' : '总结 [[DSH_REF_0]]';
    },
  });
  try {
    await check('repairs a lost marker and answers 200', async () => {
      const result = await post(scripted.port, null, { body: JSON.stringify({ text: '总结 [[DSH_REF_0]]' }) });
      assert.equal(result.status, 200);
      assert.match(JSON.parse(result.data).text, /\[\[DSH_REF_0\]\]/u);
      assert.equal(call, 2);
    });
  } finally {
    await new Promise(resolve => scripted.server.close(resolve));
  }
}

{
  const failing = await mount({ llmAnswer: () => '' });
  try {
    await check('answers 502 empty-result when the model returns nothing', async () => {
      const result = await post(failing.port, null, { body: JSON.stringify({ text: '写个待办清单' }) });
      assert.equal(result.status, 502);
      assert.match(result.data, /empty-result/u);
    });
  } finally {
    await new Promise(resolve => failing.server.close(resolve));
  }
}

console.log(`\n${passed} host HTTP checks passed`);
