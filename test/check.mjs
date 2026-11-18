/**
 * Offline checks for dsh-enhance-prompt: loads the client module through a
 * stubbed __ModuleLoader__, exercises the pure helpers, and loads the Host half
 * to exercise its normalization helpers. Run with `node test/check.mjs`.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import vm from 'node:vm';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');

let passed = 0;
const check = (name, fn) => {
  fn();
  passed += 1;
  console.log(`ok ${name}`);
};

// --- Client half ------------------------------------------------------------

/** Minimal React stand-in: the factory builds static elements at module scope. */
const reactStub = {
  createElement: (type, props, ...children) => ({ type, props, children }),
  useState: value => [value, () => {}],
  useRef: value => ({ current: value }),
  useEffect: () => {},
};

let clientModule;
const sandbox = {
  window: {
    __ModuleLoader__: {
      load({ id, factory }) {
        clientModule = { id, module: factory(() => reactStub) };
      },
    },
  },
  console,
  requestAnimationFrame: fn => fn(),
  setTimeout,
  clearTimeout,
};
vm.runInNewContext(readFileSync(join(root, 'client.js'), 'utf8'), sandbox, { filename: 'client.js' });

const helpers = clientModule.module._internals;

check('client module id matches the package name', () => {
  assert.equal(clientModule.id, 'dsh-enhance-prompt');
});

check('orderedRefs accepts ordered, in-span occurrences', () => {
  const draft = 'see @a.txt and @b.txt';
  const refs = helpers.orderedRefs(draft, [
    { source: 'file', ref: 'a', label: 'a.txt', offset: 4, clipboardText: '@a.txt' },
    { source: 'file', ref: 'b', label: 'b.txt', offset: 15, clipboardText: '@b.txt' },
  ]);
  assert.equal(refs.length, 2);
});

check('orderedRefs rejects a span that does not match the draft', () => {
  const refs = helpers.orderedRefs('see @a.txt', [
    { source: 'file', ref: 'a', label: 'a.txt', offset: 4, clipboardText: '@other' },
  ]);
  assert.equal(refs, null);
});

check('orderedRefs rejects overlapping occurrences', () => {
  const refs = helpers.orderedRefs('@@@@', [
    { source: 'file', ref: 'a', label: 'a', offset: 0, clipboardText: '@@' },
    { source: 'file', ref: 'b', label: 'b', offset: 1, clipboardText: '@@' },
  ]);
  assert.equal(refs, null);
});

check('splitForModel marks every reference in order', () => {
  const draft = 'sum @a @b';
  const refs = helpers.orderedRefs(draft, [
    { source: 'file', ref: 'a', label: 'a', offset: 4, clipboardText: '@a' },
    { source: 'file', ref: 'b', label: 'b', offset: 7, clipboardText: '@b' },
  ]);
  const { prompt, marks } = helpers.splitForModel(draft, refs);
  assert.equal(prompt, 'sum [[DSH_REF_0]] [[DSH_REF_1]]');
  assert.equal(marks.length, 2);
});

check('rebuildSnapshot restores chips at their new offsets', () => {
  const draft = 'sum @a';
  const refs = helpers.orderedRefs(draft, [
    { source: 'file', ref: 'a', label: 'a', offset: 4, clipboardText: '@a' },
  ]);
  const { marks } = helpers.splitForModel(draft, refs);
  const rebuilt = helpers.rebuildSnapshot('Goal:\n- sum [[DSH_REF_0]]', marks);
  assert.equal(rebuilt.text, 'Goal:\n- sum @a');
  assert.equal(rebuilt.references[0].offset, 'Goal:\n- sum '.length);
});

check('rebuildSnapshot refuses a dropped marker', () => {
  const refs = helpers.orderedRefs('sum @a', [
    { source: 'file', ref: 'a', label: 'a', offset: 4, clipboardText: '@a' },
  ]);
  const { marks } = helpers.splitForModel('sum @a', refs);
  assert.equal(helpers.rebuildSnapshot('Goal:\n- sum the file', marks), null);
});

check('rebuildSnapshot refuses a leftover marker variant', () => {
  const refs = helpers.orderedRefs('sum @a', [
    { source: 'file', ref: 'a', label: 'a', offset: 4, clipboardText: '@a' },
  ]);
  const { marks } = helpers.splitForModel('sum @a', refs);
  assert.equal(helpers.rebuildSnapshot('Goal:\n- sum 【DSH_REF_9】 [[DSH_REF_0]]', marks), null);
});

check('sameDraft ignores re-flowed whitespace but not wording', () => {
  assert.equal(helpers.sameDraft('a\n\n\nb', 'a b'), true);
  assert.equal(helpers.sameDraft('a b', 'a c'), false);
});

check('messageFor names transport failures', () => {
  const t = key => key;
  assert.equal(helpers.messageFor('', 401, '', t), 'unauthorized');
  assert.equal(helpers.messageFor('', 404, '', t), 'noRoute');
  assert.equal(helpers.messageFor('timeout', 504, '', t), 'timeout');
  assert.equal(helpers.messageFor('output-truncated', 502, '', t), 'truncated');
  assert.equal(helpers.messageFor('references-lost', 502, '', t), 'refLost');
  assert.equal(helpers.messageFor('no-model', 503, '', t), 'noModel');
});

check('restoreAttachments re-adds only missing ids', () => {
  const added = [];
  helpers.restoreAttachments({ addAttachments: ids => { added.push(...ids); return true; } }, ['a', 'b'], ['a']);
  assert.deepEqual(added, ['b']);
});

// --- Host half --------------------------------------------------------------

const host = await import(pathToFileURL(join(root, 'index.js')).href);
const hostHelpers = host._internals;

check('host exports the route path and inject list', () => {
  assert.equal(host.ENHANCE_PROMPT_PATH, '/__local/enhance-prompt');
  assert.deepEqual(host.inject, ['webServer', 'connection', 'llm']);
});

check('canonicalMarkers repairs reformatted markers', () => {
  assert.equal(hostHelpers.canonicalMarkers('a 【DSH_REF_0】 b'), 'a [[DSH_REF_0]] b');
  assert.equal(hostHelpers.canonicalMarkers('a [DSH_REF 1] b'), 'a [[DSH_REF_1]] b');
  assert.equal(hostHelpers.canonicalMarkers('a [[DSH_REF_2]] b'), 'a [[DSH_REF_2]] b');
});

check('collapseBlankRuns keeps exactly one blank line between sections', () => {
  assert.equal(hostHelpers.collapseBlankRuns('Goal:\n\n\n\n\nTasks:\n- x'), 'Goal:\n\nTasks:\n- x');
});

check('normalizeOutput strips fences, headings, and blank runs', () => {
  const out = hostHelpers.normalizeOutput('```text\n## 目标：\n\n\n\n- 做一件事\n```');
  assert.equal(out, '目标：\n\n- 做一件事');
});

check('normalizeOutput preserves markers after repair', () => {
  const out = hostHelpers.normalizeOutput('目标：\n- 总结 【DSH_REF_0】');
  assert.deepEqual(hostHelpers.markersOf(out), ['[[DSH_REF_0]]']);
});

check('normalizeConfig clamps and defaults', () => {
  const c = hostHelpers.normalizeConfig({ maxOutputTokens: 1, timeoutMs: 999999999, temperature: '', maxInputChars: -5 });
  assert.equal(c.maxOutputTokens, 64);
  // The per-attempt timeout stays below the client deadline / attempts.
  assert.equal(c.timeoutMs, 120000);
  assert.equal(c.temperature, '');
  assert.equal(c.maxInputChars, 1);
  assert.equal(c.structured, true);
});

check('normalizeConfig keeps a valid temperature', () => {
  assert.equal(hostHelpers.normalizeConfig({ temperature: 0.3 }).temperature, 0.3);
  assert.equal(hostHelpers.normalizeConfig({ temperature: 9 }).temperature, 2);
});

// --- Rewrite pipeline (fake ctx.llm) ---------------------------------------

/** Build a ctx whose llm.stream replays one scripted answer per call. */
function fakeCtx(answers, config = {}) {
  const calls = [];
  const ctx = {
    get: name => (name === 'agentDefaultModel'
      ? { currentSelection: () => ({ provider: 'p', model: 'm', reasoningEffort: 'high' }) }
      : undefined),
    llm: {
      async *stream(options) {
        const index = calls.length;
        calls.push({ system: options.system, maxTokens: options.maxTokens, reasoningEffort: options.reasoningEffort, temperature: options.temperature });
        const answer = answers[Math.min(index, answers.length - 1)];
        if (answer.throws !== undefined) throw new Error(answer.throws);
        if (answer.text !== '') yield { type: 'text-delta', index: 0, text: answer.text };
        yield { type: 'finish', reason: answer.reason ?? { kind: 'stop' } };
      },
    },
  };
  return { ctx, calls, config };
}

const baseConfig = hostHelpers.normalizeConfig({});

{
  const { ctx, calls } = fakeCtx([{ text: '目标：\n\n\n\n- 做事' }]);
  const result = await hostHelpers.rewrite(ctx, baseConfig, 'do it');
  check('rewrite normalizes a successful answer', () => {
    assert.equal(result.text, '目标：\n\n- 做事');
    assert.equal(calls.length, 1);
  });
}

{
  const { ctx, calls } = fakeCtx([{ text: '总结所附材料' }, { text: '总结 [[DSH_REF_0]]' }]);
  const result = await hostHelpers.rewrite(ctx, baseConfig, 'sum [[DSH_REF_0]]');
  check('rewrite retries a lost marker and appends the repair instruction', () => {
    assert.equal(result.text, '总结 [[DSH_REF_0]]');
    assert.equal(calls.length, 2);
    assert.match(calls[1].system, /DSH_REF_n/u);
    assert.doesNotMatch(calls[0].system, /重要：上一次输出/u);
  });
}

{
  const { ctx, calls } = fakeCtx([{ text: 'short', reason: { kind: 'max-tokens' } }, { text: '完整答案' }]);
  const result = await hostHelpers.rewrite(ctx, baseConfig, 'do it');
  check('rewrite doubles the output cap after a truncation', () => {
    assert.equal(result.text, '完整答案');
    assert.equal(calls[0].maxTokens, baseConfig.maxOutputTokens);
    assert.equal(calls[1].maxTokens, baseConfig.maxOutputTokens * 2);
  });
}

{
  const { ctx, calls } = fakeCtx([{ throws: 'provider "p" model "m" does not support reasoning effort "high"' }, { text: 'ok' }]);
  const result = await hostHelpers.rewrite(ctx, baseConfig, 'do it');
  check('rewrite drops an unsupported inherited reasoning effort', () => {
    assert.equal(result.text, 'ok');
    assert.equal(calls[0].reasoningEffort, 'high');
    assert.equal(calls[1].reasoningEffort, undefined);
  });
}

{
  const { ctx, calls } = fakeCtx([{ text: '' }, { text: '' }, { text: '' }]);
  const result = await hostHelpers.rewrite(ctx, baseConfig, 'do it');
  check('rewrite gives up after three attempts with the last failure code', () => {
    assert.equal(result.code, 'empty-result');
    assert.equal(calls.length, 3);
  });
}

{
  const { ctx, calls } = fakeCtx([{ text: 'ok' }]);
  const config = hostHelpers.normalizeConfig({ temperature: 0.3 });
  const result = await hostHelpers.rewrite(ctx, config, 'do it');
  check('rewrite sends temperature only when configured', () => {
    assert.equal(result.text, 'ok');
    assert.equal(calls[0].temperature, 0.3);
  });
}

{
  const { ctx, calls } = fakeCtx([{ text: 'ok' }]);
  await hostHelpers.rewrite(ctx, baseConfig, 'do it');
  check('rewrite omits temperature by default', () => {
    assert.equal(calls[0].temperature, undefined);
  });
}

{
  const { ctx } = fakeCtx([{ text: 'ok' }]);
  const noModel = { ...ctx, get: () => undefined };
  const result = await hostHelpers.rewrite(noModel, baseConfig, 'do it');
  check('rewrite reports no-model when the route cannot resolve', () => {
    assert.equal(result.code, 'no-model');
    assert.equal(result.status, 503);
  });
}

console.log(`\n${passed} checks passed`);
