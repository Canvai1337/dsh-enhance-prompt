/**
 * Browser half of the Enhance prompt bundle.
 *
 * Registers one compact icon button in `conversation.input.right`, the list
 * slot rendered immediately before the composer's model selector. Clicking it
 * rewrites only the user's typed text through the configured model. Inline
 * references become opaque `[[DSH_REF_n]]` markers for the round trip and are
 * rebuilt as reference chips on writeback; images and files stay in the
 * composer's attachment rail and are restored if a draft swap drops them.
 * An Undo action restores the exact original draft.
 *
 * Every failure path names its cause: the Host reports a code, this half maps
 * it to localized copy, and transport-level failures (auth, missing route,
 * non-JSON body, timeout) get their own messages instead of a generic retry
 * hint the user cannot act on.
 */
window.__ModuleLoader__.load({
  id: 'dsh-enhance-prompt',
  factory(require) {
    const React = require('react');
    const h = React.createElement;

    const NS = 'enhancePrompt';
    const ROUTE = '__local/enhance-prompt';
    /**
     * Client deadline. It must outlive the Host's own per-attempt timeout times
     * its attempt count, otherwise the browser gives up first and reports a
     * timeout for work the Host would have finished (or explained). The Host
     * makes three attempts, so 300 s covers the shipped 75 s default and the
     * 90 s a profile may raise it to.
     */
    const CLIENT_TIMEOUT_MS = 300000;
    /** Whole-state selector; a stable identity avoids resubscribing each render. */
    const selectAll = s => s;

    const zh = {
      'label': '增强提示词',
      'busy': '正在优化提示词…',
      'cancel': '取消增强',
      'empty': '请先输入提示词',
      'noText': '请先输入一些文字（当前只有文件）',
      'failed': '增强失败，请重试',
      'timeout': '增强超时，请重试',
      'cancelled': '已取消增强',
      'tooLong': '草稿过长，请精简后再试',
      'truncated': '模型输出被截断，请重试（或换用输出上限更高的模型）',
      'modelFailed': '模型请求失败，请重试',
      'emptyResult': '模型没有返回内容，请重试',
      'noModel': '未配置可用模型，请在设置中选择模型',
      'notReady': '当前输入状态暂不支持增强，请稍候再试',
      'done': '已替换为优化后的提示词',
      'kept': '已增强文字，文件与引用保持原样',
      'unchanged': '模型没有改写内容，草稿未改动',
      'changed': '草稿已改变，未覆盖你的输入',
      'refLost': '模型未保留文件引用，已取消替换，原草稿未改动',
      'refUnsupported': '当前草稿结构暂不支持增强',
      'commandMode': '命令模式下暂不支持增强提示词',
      'unauthorized': '登录状态已失效，请刷新页面后重试',
      'noRoute': '增强接口不可用，请重启 DSH 后重试',
      'offline': '连接已断开，请检查 DSH 是否仍在运行',
      'undo': '撤销',
      'dismiss': '关闭',
    };
    const en = {
      'label': 'Enhance prompt',
      'busy': 'Enhancing prompt…',
      'cancel': 'Cancel enhancement',
      'empty': 'Type a prompt first',
      'noText': 'Type some text first (only files are attached)',
      'failed': 'Could not enhance the prompt. Try again.',
      'timeout': 'Enhancement timed out. Try again.',
      'cancelled': 'Enhancement cancelled',
      'tooLong': 'Draft is too long. Shorten it and try again.',
      'truncated': 'The model output hit the token limit. Try again, or use a model with a larger output cap.',
      'modelFailed': 'The model request failed. Try again.',
      'emptyResult': 'The model returned nothing. Try again.',
      'noModel': 'No model is configured. Choose one in Settings.',
      'notReady': 'This input state cannot be enhanced right now; try again shortly',
      'done': 'Draft replaced with the enhanced prompt',
      'kept': 'Text enhanced; files and references kept as-is',
      'unchanged': 'The model made no change; draft left as it was',
      'changed': 'Draft changed while enhancing; nothing was replaced',
      'refLost': 'The model dropped a file reference; replacement cancelled, draft unchanged',
      'refUnsupported': 'This draft structure cannot be enhanced yet',
      'commandMode': 'Enhance prompt is unavailable in command mode',
      'unauthorized': 'Your session expired. Refresh the page and try again.',
      'noRoute': 'The enhance endpoint is unavailable. Restart DSH and try again.',
      'offline': 'The connection dropped. Check that DSH is still running.',
      'undo': 'Undo',
      'dismiss': 'Dismiss',
    };

    /** Bound once in apply; stable identity, reads the active locale at call time. */
    let boundT = key => key;

    const MARK_OF = index => `[[DSH_REF_${index}]]`;
    const ANY_MARK = /\[\[DSH_REF_\d+\]\]/u;
    /** The Host canonicalizes markers; this mirror keeps client-side checks tolerant. */
    const ANY_MARK_LOOSE = /[[【⟦]\s*DSH[\s_-]*REF[\s_-]*\d+\s*[\]】⟧]/iu;

    // --- Pure helpers (no React, unit-tested offline) -----------------------

    /**
     * Validate and order reference occurrences against the clipboard text
     * projection. Every occurrence must occupy exactly its clipboardText span;
     * an unexpected shape makes enhancement unsafe, so callers bail out.
     * @returns ordered occurrences, or null when the draft cannot be rebuilt.
     */
    function orderedRefs(draft, occurrences) {
      const refs = [...(occurrences ?? [])].sort((a, b) => a.offset - b.offset);
      let end = 0;
      for (const occ of refs) {
        const start = occ.offset;
        const length = typeof occ.clipboardText === 'string' ? occ.clipboardText.length : 0;
        if (!Number.isInteger(start) || start < end || length <= 0) return null;
        if (start + length > draft.length) return null;
        if (draft.slice(start, start + length) !== occ.clipboardText) return null;
        if (typeof occ.source !== 'string' || typeof occ.ref !== 'string' || typeof occ.label !== 'string') return null;
        end = start + length;
      }
      return refs;
    }

    /** Convert one runtime occurrence into an editor-independent DraftReference. */
    function toReference(occ, offset) {
      return {
        source: occ.source,
        ref: occ.ref,
        offset,
        length: occ.clipboardText.length,
        label: occ.label,
        clipboardText: occ.clipboardText,
        ...occ.appearance === undefined ? {} : { appearance: occ.appearance },
        ...occ.invalid === undefined ? {} : { invalid: occ.invalid },
      };
    }

    /** The exact semantic draft, so Undo restores chips instead of flattening them. */
    function toSnapshot(draft, refs) {
      return { text: draft, references: refs.map(occ => toReference(occ, occ.offset)) };
    }

    /** Replace every reference span with an opaque marker for the model round trip. */
    function splitForModel(draft, refs) {
      const parts = [];
      const marks = [];
      let cursor = 0;
      refs.forEach((occ, index) => {
        parts.push(draft.slice(cursor, occ.offset));
        const mark = MARK_OF(index);
        parts.push(mark);
        marks.push({ mark, occ });
        cursor = occ.offset + occ.clipboardText.length;
      });
      parts.push(draft.slice(cursor));
      return { prompt: parts.join(''), marks };
    }

    /**
     * Rebuild a semantic draft from the model output. Markers must appear
     * exactly once, in order, with no leftovers; otherwise return null so the
     * caller cancels the replacement instead of losing an attached file.
     */
    function rebuildSnapshot(enhanced, marks) {
      let rest = enhanced;
      const textParts = [];
      for (const { mark } of marks) {
        const index = rest.indexOf(mark);
        if (index === -1) return null;
        textParts.push(rest.slice(0, index));
        rest = rest.slice(index + mark.length);
      }
      textParts.push(rest);
      if (textParts.some(part => ANY_MARK.test(part) || ANY_MARK_LOOSE.test(part))) return null;

      let text = '';
      const references = [];
      textParts.forEach((part, index) => {
        text += part;
        if (index < marks.length) {
          const occ = marks[index].occ;
          references.push(toReference(occ, text.length));
          text += occ.clipboardText;
        }
      });
      return { text, references };
    }

    /**
     * Re-add any draft attachment ids a programmatic draft replace dropped.
     * DSH keeps images/files in `attachmentIds` outside the editor document, so
     * a text rewrite must never lose them; this restores whatever went missing.
     */
    function restoreAttachments(inputActions, before, current) {
      if (!Array.isArray(before) || before.length === 0) return;
      if (inputActions === undefined || typeof inputActions.addAttachments !== 'function') return;
      const have = new Set(Array.isArray(current) ? current : []);
      const missing = before.filter(id => !have.has(id));
      if (missing.length === 0) return;
      try { inputActions.addAttachments(missing); } catch { /* admission locked */ }
    }

    /** Run after the composer publishes the replaced draft (two paints). */
    function afterNextPaints(fn) {
      if (typeof requestAnimationFrame === 'function') requestAnimationFrame(() => { requestAnimationFrame(fn); });
      else setTimeout(fn, 0);
    }

    /** Compare drafts ignoring the whitespace the model re-flows around sections. */
    function sameDraft(a, b) {
      const squeeze = value => String(value).replace(/\s+/gu, ' ').trim();
      return squeeze(a) === squeeze(b);
    }

    /** Map a Host failure to a localized message. */
    function messageFor(code, status, serverMessage, t) {
      if (status === 401 || status === 403) return t('unauthorized');
      if (status === 404 || status === 405) return t('noRoute');
      if (status === 504 || code === 'timeout') return t('timeout');
      if (code === 'payload-too-large' || status === 413) return t('tooLong');
      if (code === 'no-model' || status === 503) return t('noModel');
      if (code === 'empty-draft') return t('empty');
      // Truncation is an output-cap problem, not a draft-length problem: telling
      // the user to shorten the draft would not fix it.
      if (code === 'output-truncated') return t('truncated');
      if (code === 'empty-result') return t('emptyResult');
      if (code === 'references-lost') return t('refLost');
      // Host messages are English diagnostics; a Chinese UI must not leak them.
      if (code === 'model-failed') return t('modelFailed');
      if (typeof serverMessage === 'string' && serverMessage !== '') return t('failed');
      return t('failed');
    }

    // --- Presentation -------------------------------------------------------

    const STYLE = [
      '.dsh-ep-root{position:relative;display:inline-flex;align-items:center;flex:0 0 auto;}',
      '.dsh-ep-btn{position:relative;display:inline-flex;align-items:center;justify-content:center;width:28px;height:28px;padding:0;border:none;border-radius:999px;background:transparent;color:var(--dsw-alias-label-secondary,#9a9a9a);cursor:pointer;outline:none;}',
      '@media (hover:hover){.dsh-ep-btn:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(127,127,127,.14));color:var(--dsw-alias-label-primary,CanvasText);}}',
      '.dsh-ep-btn:focus-visible{box-shadow:0 0 0 2px var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary,#4f7bd8));}',
      '.dsh-ep-btn[aria-busy="true"]{color:var(--dsw-alias-state-business-primary,#4f7bd8);}',
      '.dsh-ep-btn::after{content:attr(data-tip);position:absolute;bottom:calc(100% + 8px);left:50%;transform:translateX(-50%);padding:4px 8px;border-radius:6px;white-space:nowrap;font-size:12px;line-height:18px;background:var(--dsw-alias-bg-overlay,Canvas);color:var(--dsw-alias-label-primary,CanvasText);border:1px solid var(--dsw-alias-border-l1,rgba(127,127,127,.35));box-shadow:0 4px 16px rgba(0,0,0,.18);opacity:0;visibility:hidden;pointer-events:none;transition:opacity 120ms ease;z-index:1100;}',
      '@media (hover:hover){.dsh-ep-btn:hover::after{opacity:1;visibility:visible;}}',
      '.dsh-ep-btn:focus-visible::after{opacity:1;visibility:visible;}',
      '.dsh-ep-root[data-note="1"] .dsh-ep-btn::after{display:none;}',
      '@keyframes dsh-ep-spin{to{transform:rotate(360deg);}}',
      '.dsh-ep-spin{animation:dsh-ep-spin .9s linear infinite;transform-origin:center;}',
      '@media (prefers-reduced-motion:reduce){.dsh-ep-spin{animation:none;}}',
      '.dsh-ep-live{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap;border:0;}',
      '.dsh-ep-note{position:absolute;bottom:calc(100% + 8px);right:0;z-index:1100;display:flex;align-items:center;gap:8px;max-width:min(320px,70vw);padding:6px 8px 6px 10px;border-radius:8px;font-size:12px;line-height:18px;background:var(--dsw-alias-bg-overlay,Canvas);color:var(--dsw-alias-label-primary,CanvasText);border:1px solid var(--dsw-alias-border-l1,rgba(127,127,127,.35));box-shadow:0 4px 16px rgba(0,0,0,.2);}',
      '.dsh-ep-note[data-tone="error"]{border-color:var(--dsw-alias-state-error-primary,rgba(214,73,73,.6));}',
      '.dsh-ep-note-text{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}',
      '.dsh-ep-note-btn{flex:0 0 auto;border:none;background:transparent;color:var(--dsw-alias-state-business-primary,#4f7bd8);font-size:12px;line-height:18px;padding:0 2px;cursor:pointer;}',
      '.dsh-ep-note-close{flex:0 0 auto;border:none;background:transparent;color:inherit;opacity:.7;font-size:14px;line-height:18px;padding:0 2px;cursor:pointer;}',
    ].join('\n');
    /** Injected once per instance; a stable element avoids rebuilding it per render. */
    const STYLE_ELEMENT = h('style', null, STYLE);
    const SPARKLE = h('svg', {
      viewBox: '0 0 16 16', width: 14, height: 14, 'aria-hidden': true,
      fill: 'currentColor', xmlns: 'http://www.w3.org/2000/svg', style: { display: 'block' },
    },
      h('path', { d: 'M6.35 1.9c.27 2.24 1.34 3.31 3.58 3.58-2.24.27-3.31 1.34-3.58 3.58-.27-2.24-1.34-3.31-3.58-3.58 2.24-.27 3.31-1.34 3.58-3.58Z' }),
      h('path', { d: 'M12.1 8.9c.16 1.22.73 1.79 1.95 1.95-1.22.16-1.79.73-1.95 1.95-.16-1.22-.73-1.79-1.95-1.95 1.22-.16 1.79-.73 1.95-1.95Z' }),
    );
    const SPINNER = h('svg', {
      className: 'dsh-ep-spin', viewBox: '0 0 16 16', width: 14, height: 14,
      'aria-hidden': true, fill: 'none', xmlns: 'http://www.w3.org/2000/svg', style: { display: 'block' },
    }, h('circle', {
      cx: 8, cy: 8, r: 6, stroke: 'currentColor', 'stroke-width': 1.8, 'stroke-linecap': 'round', 'stroke-dasharray': '22 16',
    }));

    function EnhanceButton(props) {
      const t = boundT;
      const inputState = props.useInput(selectAll);
      const draft = inputState === undefined ? '' : inputState.draft;
      const draftRev = inputState === undefined ? 0 : inputState.draftRev;
      const phaseName = inputState === undefined ? 'plain' : inputState.phase;
      const claim = inputState === undefined ? undefined : inputState.claim;
      const attachmentIds = inputState === undefined || !Array.isArray(inputState.attachmentIds) ? [] : inputState.attachmentIds;

      const [busy, setBusy] = React.useState(false);
      /** null or { text, tone, undo? } — undo holds the exact original semantic draft. */
      const [note, setNote] = React.useState(null);
      const mounted = React.useRef(true);
      const busyRef = React.useRef(false);
      const controller = React.useRef(null);
      /** Wall clock of the current request start, for double-click throttling. */
      const startedAt = React.useRef(0);
      const noteTimer = React.useRef(null);
      const latest = React.useRef({ draft: '', rev: -1, phase: 'plain', attachmentIds: [] });
      latest.current = { draft, rev: draftRev, phase: phaseName, attachmentIds };

      React.useEffect(() => () => {
        mounted.current = false;
        if (controller.current !== null) controller.current.abort();
        if (noteTimer.current !== null) clearTimeout(noteTimer.current);
      }, []);

      const clearNote = () => {
        if (noteTimer.current !== null) clearTimeout(noteTimer.current);
        noteTimer.current = null;
        if (mounted.current) setNote(null);
      };

      const flash = (text, undo, tone) => {
        if (!mounted.current) return;
        if (noteTimer.current !== null) clearTimeout(noteTimer.current);
        setNote({ text, tone, undo });
        noteTimer.current = setTimeout(() => {
          noteTimer.current = null;
          if (mounted.current) setNote(null);
        }, undo === undefined ? 5000 : 12000);
      };

      /** Re-run after a programmatic draft replace: restore dropped attachments. */
      const guardAttachments = before => afterNextPaints(() => {
        if (mounted.current) restoreAttachments(props.inputActions, before, latest.current.attachmentIds);
      });

      const undo = () => {
        if (note === null || note.undo === undefined) return;
        if (latest.current.phase === 'plain' && typeof props.inputActions?.setDraft === 'function') {
          const before = Array.isArray(latest.current.attachmentIds) ? [...latest.current.attachmentIds] : [];
          try { props.inputActions.setDraft(note.undo); } catch { /* editor refused */ }
          guardAttachments(before);
        }
        clearNote();
      };

      /** Validate the current draft and produce the model prompt plus writeback data. */
      const prepare = () => {
        const draftText = draft;
        if (draftText.trim() === '') return { error: t('empty') };
        if (claim !== undefined) return { error: t('commandMode') };
        if (phaseName !== 'plain') return { error: t('notReady') };
        const refs = orderedRefs(draftText, inputState === undefined ? [] : inputState.occurrences);
        if (refs === null) return { error: t('refUnsupported') };
        const hasRefs = refs.length > 0;
        const { prompt, marks } = splitForModel(draftText, refs);
        const textOnly = marks.reduce((acc, item) => acc.replace(item.mark, ''), prompt);
        if (textOnly.trim() === '') return { error: hasRefs ? t('noText') : t('empty') };
        return {
          draftText,
          revision: draftRev,
          hasRefs,
          prompt,
          marks,
          attachments: [...attachmentIds],
          undo: hasRefs ? toSnapshot(draftText, refs) : draftText,
        };
      };

      const run = () => {
        // A second activation while busy cancels the in-flight request, but a
        // habitual double click must not silently cancel the work it just
        // started, so activations inside the first 400ms are ignored.
        if (busyRef.current) {
          if (Date.now() - startedAt.current < 400) return;
          const inflight = controller.current;
          if (inflight !== null) inflight.abort();
          return;
        }
        const prepared = prepare();
        if (prepared.error !== undefined) {
          flash(prepared.error, undefined, 'error');
          return;
        }

        const request = new AbortController();
        let timedOut = false;
        startedAt.current = Date.now();
        const timeout = setTimeout(() => { timedOut = true; request.abort(); }, CLIENT_TIMEOUT_MS);
        controller.current = request;
        busyRef.current = true;
        setBusy(true);
        setNote(null);
        let failure = t('failed');

        void (async () => {
          try {
            let response;
            try {
              response = await fetch(new URL(ROUTE, document.baseURI).toString(), {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ text: prepared.prompt }),
                signal: request.signal,
                credentials: 'same-origin',
              });
            } catch (error) {
              if (request.signal.aborted) throw error;
              failure = t('offline');
              throw error;
            }
            let payload = null;
            try { payload = await response.json(); } catch { /* non-JSON failure body */ }
            const code = payload !== null && typeof payload.code === 'string' ? payload.code : '';
            const serverMessage = payload !== null && typeof payload.message === 'string' ? payload.message.trim() : '';
            if (!response.ok) {
              failure = messageFor(code, response.status, serverMessage, t);
              throw new Error('request-failed');
            }
            if (payload === null || typeof payload.text !== 'string' || payload.text.trim() === '') {
              failure = t('emptyResult');
              throw new Error('empty-result');
            }
            if (!mounted.current || request.signal.aborted) return;
            const target = prepared.hasRefs ? rebuildSnapshot(payload.text, prepared.marks) : payload.text;
            if (target === null) {
              flash(t('refLost'), undefined, 'error');
              return;
            }
            if (latest.current.draft !== prepared.draftText || latest.current.rev !== prepared.revision) {
              flash(t('changed'), undefined, 'error');
              return;
            }
            if (latest.current.phase !== 'plain' || typeof props.inputActions?.setDraft !== 'function') {
              failure = t('notReady');
              throw new Error('draft-unavailable');
            }
            // Nothing to write back: keep the user's own wording and say so
            // instead of flashing a success note over an identical draft.
            const targetText = typeof target === 'string' ? target : target.text;
            if (sameDraft(targetText, prepared.draftText)) {
              flash(t('unchanged'));
              return;
            }
            props.inputActions.setDraft(target);
            const kept = prepared.hasRefs || prepared.attachments.length > 0;
            if (kept) guardAttachments(prepared.attachments);
            flash(kept ? t('kept') : t('done'), prepared.undo);
          } catch {
            if (!mounted.current) return;
            if (request.signal.aborted) {
              flash(timedOut ? t('timeout') : t('cancelled'), undefined, 'error');
              return;
            }
            flash(failure, undefined, 'error');
          } finally {
            clearTimeout(timeout);
            if (controller.current === request) controller.current = null;
            busyRef.current = false;
            if (mounted.current) setBusy(false);
          }
        })();
      };

      return h('div', { className: 'dsh-ep-root', 'data-note': note !== null ? '1' : '0' },
        STYLE_ELEMENT,
        h('button', {
          type: 'button',
          className: 'dsh-ep-btn',
          'data-tip': busy ? t('cancel') : t('label'),
          'aria-label': busy ? t('busy') : t('label'),
          'aria-busy': busy ? 'true' : undefined,
          onMouseDown: event => { event.preventDefault(); },
          onClick: run,
        }, busy ? SPINNER : SPARKLE),
        h('div', { className: 'dsh-ep-live', role: 'status', 'aria-live': 'polite' }, note === null ? '' : note.text),
        // The note stays in the accessibility tree so its Undo / Dismiss buttons
        // are reachable; only the text is hidden because the live region above
        // already announces it (avoids double speech).
        note === null ? null : h('div', { className: 'dsh-ep-note', 'data-tone': note.tone ?? 'info' },
          h('span', { className: 'dsh-ep-note-text', 'aria-hidden': 'true' }, note.text),
          note.undo !== undefined
            ? h('button', { type: 'button', className: 'dsh-ep-note-btn', onClick: undo }, t('undo'))
            : null,
          h('button', { type: 'button', className: 'dsh-ep-note-close', 'aria-label': t('dismiss'), onClick: clearNote }, '×')),
      );
    }

    return {
      inject: ['slots', 'locale'],
      apply(ctx) {
        // A reload can re-enter apply before the previous dictionary disposer
        // runs; keep the second mount harmless instead of failing the plugin.
        ctx.effect(() => {
          try { return ctx.locale.register(NS, { zh, en }); }
          catch { return () => {}; }
        });
        boundT = ctx.locale.bind(NS);
        // `locale: NS` makes the renderer supply its own revision-aware `t`
        // and re-render on language switches; avoid overriding that prop.
        ctx.slots.inject('conversation.input.right', () => ctx.slots.register({
          name: 'conversation.input.right',
          id: 'enhance-prompt',
          order: 10,
          locale: NS,
        }, EnhanceButton));
      },
      /** Pure helpers exposed for offline logic tests; the Loader ignores extra exports. */
      _internals: { orderedRefs, toSnapshot, splitForModel, rebuildSnapshot, restoreAttachments, sameDraft, messageFor },
    };
  },
});
