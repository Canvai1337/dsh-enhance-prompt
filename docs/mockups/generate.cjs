/**
 * Render the README mockups for dsh-enhance-prompt.
 *
 * The images under `docs/images/` are mockups, not screenshots: this script
 * draws the composer exactly as the plugin renders it (the CSS below is a
 * verbatim translation of `client.js` STYLE with the dark-theme tokens of
 * `@deepseek-ai/dsh-client-ui-theme` resolved to literal values), then asks
 * headless Chrome for a 2x screenshot and box-filters it back down.
 *
 * Requirements: Node 20+, Google Chrome (or set CHROME_PATH).
 *
 *   node docs/mockups/generate.cjs
 *
 * The HTML scratch files and the 2x renders land in `docs/mockups/.build/`
 * (git-ignored); the four final PNGs replace `docs/images/*.png`.
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..', '..');
const BUILD = path.join(__dirname, '.build');
const IMAGES = path.join(ROOT, 'docs', 'images');
fs.mkdirSync(BUILD, { recursive: true });
fs.mkdirSync(IMAGES, { recursive: true });

/* --- Dark-theme tokens (neutral-bluish scale, deepseek-400 accent) --------- */
const T = {
  'bg-base': '#151517',
  'bg-overlay': '#61666b',
  'border-l1': 'rgba(255,255,255,.06)',
  'label-primary': '#f9fafb',
  'label-secondary': '#cfd3d6',
  'interactive-hover': 'rgba(255,255,255,.08)',
  'business': '#7aaaff',
};

/* --- Composer chrome (the surrounding DSH UI, drawn for context) ----------- */
const shell = `
*{box-sizing:border-box;margin:0;padding:0;}
html,body{background:#141414;font-family:"Segoe UI","Microsoft YaHei UI","Microsoft YaHei",system-ui,sans-serif;-webkit-font-smoothing:antialiased;}
.page{position:relative;background:#141414;}
.card{position:absolute;left:12px;top:12px;background:#1f1f1f;border-radius:22px;}
.draft{position:absolute;left:17px;right:17px;top:14px;font-size:14px;line-height:23px;color:#ededed;white-space:pre-wrap;}
.caret{display:inline-block;width:1px;height:15px;background:#ededed;vertical-align:-2px;margin-left:1px;}
.bar{position:absolute;left:0;right:0;bottom:0;height:46px;display:flex;align-items:center;justify-content:space-between;padding:0 10px 0 8px;}
.left,.right{display:flex;align-items:center;gap:2px;}
.iconbtn{display:inline-flex;align-items:center;justify-content:center;width:28px;height:28px;border:none;background:transparent;color:#9d9d9d;border-radius:999px;}
.perm{display:inline-flex;align-items:center;gap:5px;color:#fb3838;font-size:13px;line-height:20px;padding:0 8px 0 6px;}
.model{display:inline-flex;align-items:center;gap:5px;border:none;background:transparent;color:#ededed;font-size:13px;line-height:20px;padding:4px 6px;border-radius:8px;}
.model .chev{color:#b9b9b9;display:inline-flex;}
.send{display:inline-flex;align-items:center;justify-content:center;width:30px;height:30px;border-radius:999px;background:#ededed;color:#1f1f1f;margin-left:6px;}
.chip{display:inline-flex;align-items:center;gap:6px;height:22px;padding:0 8px 0 3px;border-radius:6px;background:#313131;vertical-align:-4px;margin-right:6px;}
.chip .cico{display:inline-flex;align-items:center;justify-content:center;width:16px;height:16px;border-radius:4px;background:#0f2f33;}
.chip .clabel{font-size:12px;line-height:16px;color:#efefef;}
`;

/* --- The plugin's own stylesheet, variables resolved ---------------------- */
const plugin = `
.dsh-ep-root{position:relative;display:inline-flex;align-items:center;flex:0 0 auto;}
.dsh-ep-btn{position:relative;display:inline-flex;align-items:center;justify-content:center;width:28px;height:28px;padding:0;border:none;border-radius:999px;background:transparent;color:${T['label-secondary']};cursor:pointer;outline:none;}
.dsh-ep-btn.hov{background:${T['interactive-hover']};color:${T['label-primary']};}
.dsh-ep-btn::after{content:attr(data-tip);position:absolute;bottom:calc(100% + 8px);left:50%;transform:translateX(-50%);padding:4px 8px;border-radius:6px;white-space:nowrap;font-size:12px;line-height:18px;background:${T['bg-overlay']};color:${T['label-primary']};border:1px solid ${T['border-l1']};box-shadow:0 4px 16px rgba(0,0,0,.18);opacity:0;visibility:hidden;pointer-events:none;transition:opacity 120ms ease;z-index:1100;}
.dsh-ep-btn.tip::after{opacity:1;visibility:visible;}
.dsh-ep-note{position:absolute;bottom:calc(100% + 8px);right:0;z-index:1100;display:flex;align-items:center;gap:8px;max-width:min(300px,70vw);padding:6px 8px 6px 10px;border-radius:8px;font-size:12px;line-height:18px;background:${T['bg-overlay']};color:${T['label-primary']};border:1px solid ${T['border-l1']};box-shadow:0 4px 16px rgba(0,0,0,.2);}
.dsh-ep-note-text{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.dsh-ep-note-btn{flex:0 0 auto;border:none;background:transparent;color:${T['business']};font-size:12px;line-height:18px;padding:0 2px;cursor:pointer;}
.dsh-ep-note-close{flex:0 0 auto;border:none;background:transparent;color:inherit;opacity:.7;font-size:14px;line-height:18px;padding:0 2px;cursor:pointer;}
`;

/* --- Icons (the plugin's own two are copied from client.js) --------------- */
const SPARKLE = '<svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor" xmlns="http://www.w3.org/2000/svg" style="display:block"><path d="M6.35 1.9c.27 2.24 1.34 3.31 3.58 3.58-2.24.27-3.31 1.34-3.58 3.58-.27-2.24-1.34-3.31-3.58-3.58 2.24-.27 3.31-1.34 3.58-3.58Z"/><path d="M12.1 8.9c.16 1.22.73 1.79 1.95 1.95-1.22.16-1.79.73-1.95 1.95-.16-1.22-.73-1.79-1.95-1.95 1.22-.16 1.79-.73 1.95-1.95Z"/></svg>';
const SPINNER = '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" xmlns="http://www.w3.org/2000/svg" style="display:block"><circle cx="8" cy="8" r="6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-dasharray="22 16"/></svg>';
const PLUS = '<svg viewBox="0 0 16 16" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M8 3.2v9.6M3.2 8h9.6"/></svg>';
const INFO = '<svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.3"><circle cx="8" cy="8" r="6"/><path d="M8 7.2v4" stroke-linecap="round"/><circle cx="8" cy="5.1" r=".75" fill="currentColor" stroke="none"/></svg>';
const CHEV = '<svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M4.2 6.4 8 10.2l3.8-3.8"/></svg>';
const MIC = '<svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"><rect x="6" y="1.8" width="4" height="7.2" rx="2"/><path d="M3.8 7.4a4.2 4.2 0 0 0 8.4 0M8 11.6v2.4"/></svg>';
const SEND = '<svg viewBox="0 0 16 16" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M8 12.4V4M4.2 7.6 8 3.8l3.8 3.8"/></svg>';
const DOC = '<svg viewBox="0 0 16 16" width="11" height="11" fill="none" stroke="#2fd4e1" stroke-width="1.2" stroke-linejoin="round"><path d="M4 1.8h5l3 3v9.4H4z"/><path d="M9 1.8v3h3"/></svg>';

const CHIP = `<span class="chip"><span class="cico">${DOC}</span><span class="clabel">桌面整理报告_20261109.md</span></span>`;

function html(o) {
  const cls = ['dsh-ep-btn', o.hover ? 'hov' : '', o.tip ? 'tip' : ''].filter(Boolean).join(' ');
  return `<!doctype html><html><head><meta charset="utf-8"><style>${shell}${plugin}</style></head><body>
<div class="page" style="width:${o.w}px;height:${o.h}px">
  <div class="card" style="width:${o.cw}px;height:${o.ch}px">
    <div class="draft">${o.draft}</div>
    <div class="bar">
      <div class="left"><span class="iconbtn">${PLUS}</span><span class="perm">${INFO}允许完全访问${CHEV}</span></div>
      <div class="right">
        <div class="dsh-ep-root">
          <button class="${cls}" data-tip="${o.tipLabel || '增强提示词'}">${o.busy ? SPINNER : SPARKLE}</button>
          ${o.note ? `<div class="dsh-ep-note"><span class="dsh-ep-note-text">${o.note}</span><button class="dsh-ep-note-btn">撤销</button><button class="dsh-ep-note-close">×</button></div>` : ''}
        </div>
        <span class="model">DeepSeek-V4.1-Flash<span class="chev">${CHEV}</span></span>
        <span class="iconbtn">${MIC}</span>
        <span class="send">${SEND}</span>
      </div>
    </div>
  </div>
</div></body></html>`;
}

const SCENES = [
  {
    file: 'button-tooltip',
    out: 'button-tooltip.png',
    o: {
      w: 800, h: 160, cw: 776, ch: 132,
      draft: '帮我把这段需求整理成结构清晰的提示词<span class="caret"></span>',
      hover: true, tip: true,
    },
  },
  {
    file: 'draft-with-file',
    out: 'draft-with-file.png',
    o: {
      w: 830, h: 168, cw: 806, ch: 140,
      draft: CHIP + '把这份报告压缩成三条结论，并指出最需要马上处理的一项<span class="caret"></span>',
    },
  },
  {
    file: 'enhancing',
    out: 'enhancing.png',
    o: {
      w: 800, h: 160, cw: 776, ch: 132,
      draft: '帮我把这段需求整理成结构清晰的提示词',
      busy: true, hover: true, tip: true, tipLabel: '取消增强',
    },
  },
  {
    file: 'enhanced-result',
    out: 'enhanced-result.png',
    o: {
      w: 880, h: 396, cw: 856, ch: 372,
      draft: `目标：
- 把所附报告压缩成三条结论，并指出最需要马上处理的一项。

任务：
1. 阅读参考资料中的报告内容。
2. 提炼三条最重要的结论。
3. 判断其中哪一项最需要马上处理，并说明理由。

输出格式：
- 先列出三条结论，再给出最紧急的一项与处理建议。

参考资料：
${CHIP}`,
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

/* pngjs is not a dependency of this plugin; use the workspace copy if present. */
function pngjs() {
  const candidates = [
    'pngjs',
    path.join(process.env.DSH_PROFILE_DIR || '', 'node_modules', 'pngjs'),
    'D:/DeepSeekHarness/home/profiles/desktop/node_modules/pngjs',
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
