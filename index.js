/**
 * Host half of the Enhance prompt bundle.
 *
 * Owns one authenticated HTTP route. The browser control posts the current
 * composer draft; this plugin rewrites it through the configured LLM provider
 * (`ctx.llm`) using the deployment's default model, then returns plain text.
 * Nothing is appended to a Session log and no Agent is activated.
 *
 * The trust fence is the same one `dsh-host-open-in-app` uses: the
 * composition's `connection` service rejects cross-site, DNS-rebound, and
 * unauthenticated callers before any model work starts.
 */

export const inject = ['webServer', 'connection', 'llm'];

/** Absolute pathname registered with the web server. */
export const ENHANCE_PROMPT_PATH = '/__local/enhance-prompt';

/** Request bodies are short prompts; anything larger is hostile. */
const MAX_BODY_BYTES = 96 * 1024;

const DEFAULT_MAX_INPUT_CHARS = 8000;
const DEFAULT_MAX_OUTPUT_TOKENS = 2048;
const DEFAULT_TIMEOUT_MS = 75000;

const DEFAULTS = {
  /** Empty provider/model fall back to the deployment's default model. */
  provider: '',
  model: '',
  reasoningEffort: '',
  maxInputChars: DEFAULT_MAX_INPUT_CHARS,
  maxOutputTokens: DEFAULT_MAX_OUTPUT_TOKENS,
  timeoutMs: DEFAULT_TIMEOUT_MS,
  /** Section the result into readable blocks instead of one paragraph. */
  structured: true,
  /** Non-empty overrides every built-in prompt. */
  system: '',
};

// --- Built-in prompts -------------------------------------------------------
// One language per request keeps the system prompt (and its cost) roughly
// halved versus a bilingual prompt; the model is told to answer in the draft's
// own language either way.

const REF_RULE_ZH = '标记 [[DSH_REF_0]] 代表用户附加的文件或引用：必须原样、按原顺序保留，不得写出文件名或路径，也不得替换成任何文字。';
const REF_RULE_EN = 'Markers like [[DSH_REF_0]] stand for attached files or references: keep each one verbatim and in order, never write file names or paths, never replace a marker with text.';

function promptZh(structured) {
  if (structured) {
    return [
      '你是提示词改写助手。把用户草稿改写为结构清晰、易于阅读、可直接发送的提示词。',
      '输出格式：',
      '- 用小节组织：小节标题单独占一行，用普通词语并在末尾加冒号（如「目标：」「背景：」「任务：」「要求：」「输出格式：」「参考资料：」）；只保留草稿真正需要的小节，不要为凑小节编造内容。',
      '- 严禁使用 # 或任何 Markdown 标题符号，也不要给标题加粗、加星号或加框。',
      '- 小节之间空一行；要点用「- 」或「1. 」列表。',
      '- 只输出提示词正文：不要开场白、不要结尾总结、不要整体包进代码块、不要整段加引号，也不要复述这些格式要求。',
      '内容规则：',
      '1. 严格保留原始意图，不添加用户未提出的目标、事实或数据；缺少的信息用概括性表述，不编造具体数值。',
      '2. 使用与用户输入相同的语言。',
      `3. ${REF_RULE_ZH}`,
    ].join('\n');
  }
  return [
    '你是提示词改写助手。把用户草稿改写为更清晰、具体、可执行的提示词。',
    '规则：保留原始意图，不编造；可补充必要的角色、背景、任务拆解、约束、输出格式与验收标准；使用与用户输入相同的语言；只输出提示词正文（无解释、无前后缀、无标题、无代码围栏、无引号）。',
    REF_RULE_ZH,
  ].join('\n');
}

function promptEn(structured) {
  if (structured) {
    return [
      'You are a prompt rewriter. Rewrite the draft into a clear, well-organized prompt that is easy to read and ready to send.',
      'Format:',
      '- Use sections: put each section title on its own line as plain words ending with a colon (e.g. "Goal:", "Context:", "Tasks:", "Requirements:", "Output format:", "References:"); include only the sections the draft needs, never invent content to fill one.',
      '- Never use "#" or any Markdown heading syntax, and never bold, star, or box the titles.',
      '- Put one blank line between sections; use "- " or "1. " lists for points.',
      '- Output only the prompt body: no preamble, no closing summary, no outer code fence, no surrounding quotes, and do not restate these formatting instructions.',
      'Content rules:',
      '1. Keep the original intent; never add goals, facts, or numbers the user did not provide. Use general wording for missing details.',
      '2. Answer in the draft language.',
      `3. ${REF_RULE_EN}`,
    ].join('\n');
  }
  return [
    'You are a prompt rewriter. Rewrite the draft into a clearer, more specific, actionable prompt.',
    'Rules: keep the original intent and never invent facts; you may add necessary role, context, task breakdown, constraints, output format, and acceptance criteria; answer in the draft language; output only the rewritten prompt (no explanation, headings, code fences, or quotes).',
    REF_RULE_EN,
  ].join('\n');
}

/** Built-in prompts, computed once per language and shape. */
const BUILTIN_SYSTEM = {
  zh: { structured: promptZh(true), plain: promptZh(false) },
  en: { structured: promptEn(true), plain: promptEn(false) },
};

/** A reference marker stands for one attached file or inline reference chip. */
const REF_MARKER_RE = /\[\[DSH_REF_\d+\]\]/gu;

/** Ordered markers in one text, used for round-trip integrity checks. */
function markersOf(text) {
  return String(text).match(REF_MARKER_RE) ?? [];
}

/** True when the draft is mostly CJK, so the Chinese prompt fits. */
function isCJKDraft(text) {
  return /[\u3040-\u30FF\u3400-\u9FFF\uF900-\uFAFF]/u.test(text);
}

// --- HTTP helpers -----------------------------------------------------------

/** JSON response; outcomes are live facts, never cached. */
function sendJson(res, status, payload) {
  res.statusCode = status;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.setHeader('cache-control', 'no-store');
  res.end(JSON.stringify(payload));
}

/** Refuse a non-POST request with its one supported method. */
function sendMethodNotAllowed(res) {
  res.statusCode = 405;
  res.setHeader('allow', 'POST');
  res.end();
}

/** Collect a bounded UTF-8 body; null past the ceiling, draining the remainder. */
async function readBoundedBody(req, limit) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.byteLength;
    if (size > limit) {
      req.resume();
      return null;
    }
    chunks.push(buffer);
  }
  return Buffer.concat(chunks, size).toString('utf8');
}

/** The exact essence of the content type (`application/json`, ignoring params). */
function contentEssence(req) {
  return String(req.headers['content-type']).split(';', 1)[0].trim().toLowerCase();
}

// --- Domain helpers ---------------------------------------------------------

/** Clamp one numeric config value into a sane range. */
function bounded(value, fallback, min, max) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
}

/** Merge user config over the defaults and normalize types/ranges. */
function normalizeConfig(raw) {
  const c = { ...DEFAULTS, ...(raw !== null && typeof raw === 'object' ? raw : {}) };
  return {
    provider: typeof c.provider === 'string' ? c.provider : '',
    model: typeof c.model === 'string' ? c.model : '',
    reasoningEffort: typeof c.reasoningEffort === 'string' ? c.reasoningEffort : '',
    maxInputChars: bounded(c.maxInputChars, DEFAULT_MAX_INPUT_CHARS, 1, 200000),
    maxOutputTokens: bounded(c.maxOutputTokens, DEFAULT_MAX_OUTPUT_TOKENS, 16, 32000),
    timeoutMs: bounded(c.timeoutMs, DEFAULT_TIMEOUT_MS, 1000, 600000),
    structured: c.structured !== false,
    system: typeof c.system === 'string' ? c.system : '',
  };
}

/** Resolve the provider/model route used for the one-shot rewrite. */
function resolveRoute(ctx, config) {
  if (config.provider !== '' && config.model !== '') {
    return {
      provider: config.provider,
      model: config.model,
      ...config.reasoningEffort !== '' ? { reasoningEffort: config.reasoningEffort } : {},
    };
  }
  const defaults = ctx.get('agentDefaultModel');
  const current = defaults && typeof defaults.currentSelection === 'function'
    ? defaults.currentSelection()
    : undefined;
  if (!current || !current.provider || !current.model) return undefined;
  return {
    provider: current.provider,
    model: current.model,
    ...current.reasoningEffort === undefined ? {} : { reasoningEffort: current.reasoningEffort },
  };
}

/** Remove leading `#` heading marks and unwrap a whole-line `**bold**` label. */
function stripHeadingMarks(text) {
  return String(text)
    .replace(/^[ \t]*#{1,6}[ \t]+/gmu, '')            // "## 目标" -> "目标"
    .replace(/^[ \t]*\*\*([^\n*]+)\*\*[ \t]*$/gmu, '$1'); // a whole-line **文字** -> 文字
}

/** Strip wrappers a model sometimes adds despite the system prompt. */
function normalizeOutput(text) {
  let out = String(text).trim();
  const fenced = /^```[^\n]*\n([\s\S]*?)\n?```$/.exec(out);
  if (fenced !== null) out = fenced[1].trim();
  const quoted = /^(?:"([\s\S]*)"|'([\s\S]*)'|“([\s\S]*)”)$/.exec(out);
  if (quoted !== null) out = (quoted[1] ?? quoted[2] ?? quoted[3] ?? out).trim();
  out = out.replace(
    /^(?:优化(?:后)?的?提示词|改写(?:后)?的?提示词|提示词|Enhanced prompt|Rewritten prompt|Prompt)\s*[:：]\s*/iu,
    '',
  ).trim();
  return stripHeadingMarks(out).trim();
}

/**
 * Run one rewrite. Returns `{ text }` on success or `{ status, code, message }`.
 * @param ctx - Host runtime.
 * @param config - normalized config.
 * @param input - draft text with reference markers.
 */
async function rewrite(ctx, config, input) {
  const route = resolveRoute(ctx, config);
  if (route === undefined) {
    return { status: 503, code: 'no-model', message: 'no default model is configured for prompt enhancement' };
  }
  const system = config.system !== ''
    ? config.system
    : BUILTIN_SYSTEM[isCJKDraft(input) ? 'zh' : 'en'][config.structured ? 'structured' : 'plain'];

  const controller = new AbortController();
  const timer = setTimeout(() => { controller.abort(); }, config.timeoutMs);
  try {
    let output = '';
    let finish;
    for await (const chunk of ctx.llm.stream({
      ...route,
      messages: [{ role: 'user', content: [{ type: 'text', text: input }] }],
      system,
      maxTokens: config.maxOutputTokens,
      temperature: 0.3,
      signal: controller.signal,
    })) {
      if (chunk.type === 'text-delta') output += chunk.text;
      else if (chunk.type === 'finish') finish = chunk.reason;
    }
    if (finish !== undefined && finish.kind === 'max-tokens') {
      return { status: 502, code: 'output-truncated', message: 'the enhanced prompt exceeded the output limit' };
    }
    if (finish !== undefined && (finish.kind === 'error' || finish.kind === 'aborted')) {
      const failure = finish.failure ?? {};
      return { status: 502, code: 'model-failed', message: String(failure.message || failure.code || 'model request failed') };
    }
    const text = normalizeOutput(output);
    if (text === '') return { status: 502, code: 'empty-result', message: 'the model returned no text' };
    // A lost or reordered marker would silently drop the user's attached file
    // when the client rebuilds the semantic draft; refuse it instead.
    const requested = markersOf(input);
    const returned = markersOf(text);
    if (requested.length !== returned.length || requested.some((marker, i) => marker !== returned[i])) {
      return { status: 502, code: 'references-lost', message: 'the model did not preserve the attached file markers' };
    }
    return { text };
  } catch (error) {
    return { status: 502, code: 'model-failed', message: error instanceof Error ? error.message : String(error) };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Mount the route.
 * @param ctx - Host runtime owning the web server, trust fence, and LLM service.
 * @param rawConfig - optional per-row overrides from the bundle patch.
 */
export function apply(ctx, rawConfig) {
  const config = normalizeConfig(rawConfig);
  const connection = ctx.get('connection');

  /** Answer an untrusted or unauthenticated request; true when rejected. */
  const rejected = (req, res) => {
    const rejection = connection && typeof connection.requestRejection === 'function'
      ? connection.requestRejection(req)
      : undefined;
    if (rejection === undefined) return false;
    res.statusCode = rejection;
    res.end();
    return true;
  };

  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: ENHANCE_PROMPT_PATH,
    handler: async (req, res) => {
      if (rejected(req, res)) return;
      if (req.method !== 'POST') return sendMethodNotAllowed(res);
      if (contentEssence(req) !== 'application/json') {
        return sendJson(res, 415, { code: 'unsupported-media-type', message: 'content-type must be application/json' });
      }
      let bodyText;
      try {
        bodyText = await readBoundedBody(req, MAX_BODY_BYTES);
      } catch {
        return sendJson(res, 400, { code: 'bad-request', message: 'request body unreadable' });
      }
      if (bodyText === null) {
        return sendJson(res, 413, { code: 'payload-too-large', message: 'request body is too large' });
      }
      let body;
      try {
        body = JSON.parse(bodyText);
      } catch {
        return sendJson(res, 400, { code: 'bad-request', message: 'request body must be JSON' });
      }
      const input = body !== null && typeof body === 'object' && typeof body.text === 'string' ? body.text : '';
      if (input.trim() === '') {
        return sendJson(res, 400, { code: 'empty-draft', message: 'text must be a non-empty string' });
      }
      if (input.length > config.maxInputChars) {
        return sendJson(res, 413, { code: 'payload-too-large', message: 'draft exceeds maxInputChars' });
      }

      const result = await rewrite(ctx, config, input);
      if (result.text !== undefined) return sendJson(res, 200, { text: result.text });
      return sendJson(res, result.status, { code: result.code, message: result.message });
    },
  }), `enhance-prompt: POST ${ENHANCE_PROMPT_PATH}`);
}
