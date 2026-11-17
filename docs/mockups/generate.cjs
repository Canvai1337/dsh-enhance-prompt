/**
 * Render the README mockups for dsh-enhance-prompt.
 *
 * These are mockups, not screenshots. They reproduce the DSH composer from the
 * real sources in the running installation:
 *
 *   @deepseek-ai/dsh-client-ui-conversation  InputBar.module.css,
 *                                            ReferenceChip.module.css,
 *                                            composer-editor.module.css
 *   @deepseek-ai/dsh-client-ui-model-selection  ModelSelect.module.css
 *   @deepseek-ai/dsh-client-ui-permission-presets  PermissionSelect.module.css
 *   @deepseek-ai/dsh-client-ui-attachment    AttachmentRail.module.css, FileCard.module.css
 *   @deepseek-ai/dsh-client-ui-theme         design-platform.css, base.css
 *   @deepseek-ai/dsh-web-frontend            tooltip bubble
 *
 * Every length and color below is copied from those sheets; the plugin's own
 * rules come from client.js. Tokens are resolved for the dark theme
 * (body[data-ds-dark-theme]).
 *
 *   node docs/mockups/generate.cjs
 *
 * Needs Node 20+, Google Chrome or Edge (or CHROME_PATH) and pngjs.
 * HTML scratch files and the 2x renders land in docs/mockups/.build/.
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..', '..');
const BUILD = path.join(__dirname, '.build');
const IMAGES = path.join(ROOT, 'docs', 'images');
fs.mkdirSync(BUILD, { recursive: true });
fs.mkdirSync(IMAGES, { recursive: true });

/* --- design-platform.css + base.css, dark theme, resolved --------------- */
/* Both palettes, resolved straight from design-platform.css. The README uses
 * the dark one; set THEME=light to render the light appearance instead. */
const PALETTES = {
  dark: {
    'bg-base': '#151517',          // alias-bg-base            = neutral-bluish-950
    'input-major': '#2c2c2e',      // specific-input-major     = neutral-bluish-850
    'selector': '#353638',         // specific-selector        = neutral-bluish-800
    'tooltip-bg': '#43454a',       // alias-tooltip-bg         = neutral-bluish-750
    'tooltip-label': '#ffffff',    // alias-tooltip-label      = neutral-bluish-00
    'overlay': '#61666b',          // alias-bg-overlay         = neutral-bluish-700 (the plugin's own bubble)
    'label-primary': '#f9fafb',    // alias-label-primary      = neutral-bluish-50
    'label-secondary': '#cfd3d6',  // alias-label-secondary    = neutral-bluish-300
    'label-tertiary': '#adb2b8',   // alias-label-tertiary     = neutral-bluish-400
    'label-caption': '#81858c',    // alias-label-caption      = neutral-bluish-600
    'business': '#7aaaff',         // alias-state-business-primary = deepseek-400
    'info-fill': '#7aaaff',        // alias-button-info-fill   = deepseek-400
    'on-color': '#ffffff',         // alias-label-on-color     = neutral-bluish-00
    'border-l2': 'rgba(255,255,255,.12)',
    'hover': 'rgba(255,255,255,.08)',
  },
  light: {
    'bg-base': '#ffffff',          // alias-bg-base            = neutral-bluish-00
    'input-major': '#ffffff',      // specific-input-major     = neutral-bluish-00
    'selector': '#f5f6f7',         // specific-selector        = neutral-bluish-60
    'tooltip-bg': '#61666b',       // alias-tooltip-bg         = neutral-bluish-700
    'tooltip-label': '#ffffff',    // alias-tooltip-label      = neutral-bluish-00
    'overlay': '#e9ecf2',          // alias-bg-overlay         = neutral-bluish-150 (the plugin's own bubble)
    'label-primary': '#0f1115',    // alias-label-primary      = neutral-bluish-1000
    'label-secondary': '#61666b',  // alias-label-secondary    = neutral-bluish-700
    'label-tertiary': '#81858c',   // alias-label-tertiary     = neutral-bluish-600
    'label-caption': '#adb2b8',    // alias-label-caption      = neutral-bluish-400
    'business': '#4176e6',         // alias-state-business-primary = deepseek-500
    'info-fill': '#4176e6',        // alias-button-info-fill   = deepseek-500
    'on-color': '#ffffff',         // alias-label-on-color     = neutral-bluish-00
    'border-l2': 'rgba(0,0,0,.10)',
    'hover': 'rgba(38,49,72,.06)',
  },
};

/* The README images use the light appearance (this profile's ui-theme
 * preference); set THEME=dark to render the dark one instead. */
const THEME = process.env.THEME === 'dark' ? 'dark' : 'light';
const T = {
  ...PALETTES[THEME],
  'radius-sm': '8px',
  'radius-lg': '16px',
  'radius-panel': '28px',
  'font': "-apple-system,BlinkMacSystemFont,'Segoe UI','PingFang SC','Hiragino Sans GB','Microsoft YaHei','Helvetica Neue',Helvetica,Arial,sans-serif",
};

/* elevation-soft: 0 0 0 .5px stroke, 0 4px 16px rgba(0,0,0,.03), 0 0 24px rgba(0,0,0,.03) */
const SOFT_SHADOW = `0 0 0 0.5px ${T['border-l2']}, 0 4px 16px 0 rgba(0,0,0,.03), 0 0 24px 0 rgba(0,0,0,.03)`;

/* --- Composer chrome: InputBar.module.css ------------------------------- */
const shell = `
*{box-sizing:border-box;margin:0;padding:0;}
html,body{background:${T['bg-base']};font-family:${T['font']};-webkit-font-smoothing:antialiased;}
.page{position:relative;background:${T['bg-base']};}
/* .card: padding-top 8, gap 12, radius panel, input surface, elevation-soft */
.card{position:absolute;left:12px;top:12px;display:flex;flex-direction:column;gap:12px;
  padding-top:8px;border-radius:${T['radius-panel']};background:${T['input-major']};
  box-shadow:${SOFT_SHADOW};font-size:14px;line-height:24px;}
/* .input: min-height 36, padding 4px 8px 0 14px */
.input{min-height:36px;padding:4px 8px 0 14px;white-space:pre-wrap;word-break:break-word;
  color:${T['label-primary']};}
.caret{display:inline-block;width:1px;height:16px;background:${T['business']};vertical-align:-3px;margin-left:1px;}
/* .row: padding 2px 8px 6px, space-between, gap 12 */
.row{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:2px 8px 6px;}
.tools,.modes,.trailing,.standardControls{display:flex;align-items:center;min-width:0;}
.tools{gap:12px;}
.modes{gap:12px;}
.trailing{gap:12px;margin-left:auto;flex:none;}
.standardControls{gap:12px;}
/* .add: 28px circle, selector fill, primary glyph */
.add{display:grid;place-items:center;flex:none;width:28px;height:28px;border:none;border-radius:999px;
  background:${T['selector']};color:${T['label-primary']};}
/* .trigger (permission): 28px, radius sm, 13/20 500 secondary, chevron caption */
.trigger{display:inline-flex;align-items:center;gap:4px;min-width:0;height:28px;padding:0 4px 0 8px;
  border:none;border-radius:${T['radius-sm']};background:transparent;color:${T['label-secondary']};
  font-size:13px;line-height:20px;font-weight:500;}
.trigger .glyph{display:inline-flex;flex:none;}
.trigger .glyph svg{width:14px;height:14px;}
.chev{display:inline-flex;flex:none;color:${T['label-caption']};}
/* model trigger: same seat, 13/20 400 */
.model{display:inline-flex;align-items:center;gap:4px;height:28px;padding:0 4px 0 8px;border:none;
  border-radius:${T['radius-sm']};background:transparent;color:${T['label-secondary']};
  font-size:13px;line-height:20px;font-weight:400;}
/* .primary: 34px circle, info fill, on-color glyph, translateY(-2px) */
.primary{display:grid;place-items:center;flex:none;width:34px;height:34px;border:none;border-radius:999px;
  background:${T['info-fill']};color:${T['on-color']};transform:translateY(-2px);}
/* AttachmentRail .rail + FileCard .card */
.rail{display:flex;align-items:stretch;gap:10px;padding:2px 10px 0;margin-bottom:-6px;}
.filecard{position:relative;display:inline-flex;align-items:center;gap:10px;width:240px;height:64px;
  padding:0 12px;border:0.5px solid ${T['border-l2']};border-radius:${T['radius-lg']};
  background:${T['input-major']};}
.filecard .ficon{display:inline-flex;flex:none;align-items:center;justify-content:center;width:28px;height:28px;
  color:${T['label-tertiary']};}
.filecard .fbody{display:flex;flex:1;flex-direction:column;min-width:0;padding:8px 0;}
.filecard .fname{overflow:hidden;white-space:nowrap;text-overflow:ellipsis;color:${T['label-primary']};
  font-size:14px;font-weight:500;line-height:22px;}
.filecard .fmeta{overflow:hidden;white-space:nowrap;text-overflow:ellipsis;color:${T['label-tertiary']};
  font-size:12px;line-height:15px;}
/* Inline reference chip: composer-editor .reference + ReferenceChip .chip */
.ref{display:inline-flex;align-items:baseline;gap:3px;max-width:240px;padding:0 4px;
  border-radius:${T['radius-sm']};color:${T['business']};line-height:inherit;vertical-align:baseline;}
.ref .ricon{align-self:center;display:inline-flex;flex:none;}
.ref .rlabel{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
`;

/* --- The plugin's own rules, copied from client.js STYLE ---------------- */
const plugin = `
.dsh-ep-root{position:relative;display:inline-flex;align-items:center;flex:0 0 auto;}
.dsh-ep-btn{position:relative;display:inline-flex;align-items:center;justify-content:center;
  width:28px;height:28px;padding:0;border:none;border-radius:999px;background:transparent;
  color:${T['label-secondary']};cursor:pointer;outline:none;}
.dsh-ep-btn.hov{background:${T['hover']};color:${T['label-primary']};}
/* The plugin's own bubble is alias-bg-overlay with an alias-label-primary
   label, not the primitive tooltip pair. */
.dsh-ep-btn::after{content:attr(data-tip);position:absolute;bottom:calc(100% + 8px);left:50%;
  transform:translateX(-50%);padding:3px 7px;border-radius:${T['radius-sm']};white-space:nowrap;
  font-size:13px;line-height:20px;background:${T['overlay']};color:${T['label-primary']};
  box-shadow:0 0 0 0.5px ${T['border-l2']};opacity:0;visibility:hidden;pointer-events:none;
  transition:opacity 120ms ease;z-index:1100;}
.dsh-ep-btn.tip::after{opacity:1;visibility:visible;}
.dsh-ep-note{position:absolute;bottom:calc(100% + 8px);right:0;z-index:1100;display:flex;align-items:center;
  gap:8px;max-width:min(300px,70vw);padding:3px 7px 3px 9px;border-radius:${T['radius-sm']};
  font-size:13px;line-height:20px;background:${T['overlay']};color:${T['label-primary']};
  box-shadow:0 0 0 0.5px ${T['border-l2']};}
.dsh-ep-note-text{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.dsh-ep-note-btn{flex:0 0 auto;border:none;background:transparent;color:${T['business']};
  font-size:13px;line-height:20px;padding:0 2px;cursor:pointer;}
.dsh-ep-note-close{flex:0 0 auto;border:none;background:transparent;color:inherit;opacity:.7;
  font-size:14px;line-height:20px;padding:0 2px;cursor:pointer;}
`;

/* --- Glyphs: the two the plugin draws, plus the composer's own ---------- */
const SPARKLE = '<svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor" xmlns="http://www.w3.org/2000/svg" style="display:block"><path d="M6.35 1.9c.27 2.24 1.34 3.31 3.58 3.58-2.24.27-3.31 1.34-3.58 3.58-.27-2.24-1.34-3.31-3.58-3.58 2.24-.27 3.31-1.34 3.58-3.58Z"/><path d="M12.1 8.9c.16 1.22.73 1.79 1.95 1.95-1.22.16-1.79.73-1.95 1.95-.16-1.22-.73-1.79-1.95-1.95 1.22-.16 1.79-.73 1.95-1.95Z"/></svg>';
const SPINNER = '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" xmlns="http://www.w3.org/2000/svg" style="display:block"><circle cx="8" cy="8" r="6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-dasharray="22 16"/></svg>';
/* IconPlusOutlineMedium, 14px, drawn on the 16px grid */
const PLUS = '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M8 3v10M3 8h10"/></svg>';
/* Shield-ish permission glyph, 14px */
const SHIELD = '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"><path d="M8 1.9 13 3.6v4.2c0 3-2.1 5.3-5 6.3-2.9-1-5-3.3-5-6.3V3.6L8 1.9Z"/></svg>';
const CHEV = '<svg viewBox="0 0 12 12" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 4.5 6 7.5 9 4.5"/></svg>';
/* Send arrow, 16px grid, from InputBar primary */
const SEND = '<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path d="M8.3125 0.980183C8.66767 1.0531 8.97902 1.20418 9.2627 1.43233C9.48724 1.61297 9.73029 1.85793 9.97949 2.10714L14.707 6.83468L13.293 8.24874L9 3.95577V15.0417H7V3.95577L2.70703 8.24874L1.29297 6.83468L6.02051 2.10714C6.26971 1.85793 6.51277 1.61297 6.7373 1.43233C6.97662 1.23986 7.28445 1.04402 7.6875 0.980183C7.8973 0.947006 8.1031 0.95516 8.3125 0.980183Z" fill="currentColor"/></svg>';
/* Document glyph for the file card / reference chip */
const DOC = '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"><path d="M4.2 1.8h5.1l2.9 2.9v9.5H4.2z"/><path d="M9.3 1.8v2.9h2.9"/></svg>';

const FILE_NAME = '桌面整理报告_20261109.md';

const fileCard = `<div class="rail"><div class="filecard">
  <span class="ficon">${DOC}</span>
  <span class="fbody"><span class="fname">${FILE_NAME}</span><span class="fmeta">Markdown · 12.4 KB</span></span>
</div></div>`;

const refChip = `<span class="ref"><span class="ricon">${DOC}</span><span class="rlabel">${FILE_NAME}</span></span>`;

function html(o) {
  const btn = ['dsh-ep-btn', o.hover ? 'hov' : '', o.tip ? 'tip' : ''].filter(Boolean).join(' ');
  return `<!doctype html><html><head><meta charset="utf-8"><style>${shell}${plugin}</style></head><body>
<div class="page" style="width:${o.w}px;height:${o.h}px">
  <div class="card" style="width:${o.cw}px;height:${o.ch}px">
    ${o.rail ? fileCard : ''}
    <div class="input">${o.draft}</div>
    <div class="row">
      <div class="tools">
        <span class="add">${PLUS}</span>
        <div class="modes">
          <span class="trigger"><span class="glyph">${SHIELD}</span><span>完全权限</span><span class="chev">${CHEV}</span></span>
        </div>
      </div>
      <div class="trailing">
        <div class="standardControls">
          <div class="dsh-ep-root">
            <button class="${btn}" data-tip="${o.tipLabel || '增强提示词'}">${o.busy ? SPINNER : SPARKLE}</button>
            ${o.note ? `<div class="dsh-ep-note"><span class="dsh-ep-note-text">${o.note}</span><button class="dsh-ep-note-btn">撤销</button><button class="dsh-ep-note-close">×</button></div>` : ''}
          </div>
          <span class="model">DeepSeek-V4.1-Flash<span class="chev">${CHEV}</span></span>
        </div>
        <span class="primary">${SEND}</span>
      </div>
    </div>
  </div>
</div></body></html>`;
}

const SCENES = [
  {
    file: 'button-tooltip', out: 'button-tooltip.png',
    o: {
      w: 800, h: 152, cw: 776, ch: 98,
      draft: '帮我把这段需求整理成结构清晰的提示词<span class="caret"></span>',
      hover: true, tip: true,
    },
  },
  {
    file: 'draft-with-file', out: 'draft-with-file.png',
    o: {
      w: 830, h: 190, cw: 806, ch: 166,
      rail: true,
      draft: '把这份报告压缩成三条结论，并指出最需要马上处理的一项<span class="caret"></span>',
    },
  },
  {
    file: 'enhancing', out: 'enhancing.png',
    o: {
      w: 800, h: 152, cw: 776, ch: 98,
      draft: '帮我把这段需求整理成结构清晰的提示词',
      busy: true, hover: true, tip: true, tipLabel: '取消增强',
    },
  },
  {
    file: 'enhanced-result', out: 'enhanced-result.png',
    o: {
      w: 880, h: 400, cw: 856, ch: 376,
      draft: `目标：
- 把所附报告压缩成三条结论，并指出最需要马上处理的一项。

任务：
1. 阅读参考资料中的报告内容。
2. 提炼三条最重要的结论。
3. 判断其中哪一项最需要马上处理，并说明理由。

输出格式：
- 先列出三条结论，再给出最紧急的一项与处理建议。

参考资料：
${refChip}`,
      note: '已增强文字，文件与引用保持原样',
    },
  },
];

function chromePath() {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;
  const candidates = [
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  ];
  const found = candidates.find(candidate => fs.existsSync(candidate));
  if (found === undefined) throw new Error('generate.cjs: set CHROME_PATH to a Chrome or Edge executable');
  return found;
}

/* pngjs is not a dependency of this plugin; use a workspace copy if present. */
function pngjs() {
  const candidates = [
    'pngjs',
    path.join(process.env.DSH_PROFILE_DIR || '', 'node_modules', 'pngjs'),
  ];
  for (const candidate of candidates) {
    try { return require(candidate); } catch { /* try the next one */ }
  }
  throw new Error('generate.cjs: pngjs is required to downscale the 2x render (npm i -D pngjs)');
}

/** Box-filter 2x downscale, so the README gets a 1x image with 2x detail. */
function halve(inPath, outPath) {
  const { PNG } = pngjs();
  const img = PNG.sync.read(fs.readFileSync(inPath));
  const w = img.width / 2, h = img.height / 2;
  const out = new PNG({ width: w, height: h });
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const di = (w * y + x) * 4;
      let r = 0, g = 0, b = 0, a = 0;
      for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
        const si = (img.width * (y * 2 + dy) + (x * 2 + dx)) * 4;
        r += img.data[si]; g += img.data[si + 1]; b += img.data[si + 2]; a += img.data[si + 3];
      }
      out.data[di] = Math.round(r / 4);
      out.data[di + 1] = Math.round(g / 4);
      out.data[di + 2] = Math.round(b / 4);
      out.data[di + 3] = Math.round(a / 4);
    }
  }
  fs.writeFileSync(outPath, PNG.sync.write(out));
  console.log(path.basename(outPath) + '  ' + w + 'x' + h + '  ' + fs.statSync(outPath).size + ' bytes');
}

const chrome = chromePath();
for (const scene of SCENES) {
  const htmlPath = path.join(BUILD, scene.file + '.html');
  const shotPath = path.join(BUILD, scene.file + '.png');
  fs.writeFileSync(htmlPath, html(scene.o));
  execFileSync(chrome, [
    '--headless=new', '--disable-gpu', '--hide-scrollbars',
    '--force-device-scale-factor=2',
    '--window-size=' + scene.o.w + ',' + scene.o.h,
    '--screenshot=' + shotPath,
    'file:///' + htmlPath.replace(/\\/g, '/'),
  ], { stdio: 'ignore' });
  halve(shotPath, path.join(IMAGES, scene.out));
}
