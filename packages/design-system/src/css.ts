// buildCss：token → CSS 变量 + 组件基础样式，由 viewer/CLI 内联进产物页面（§5.2、§6）。
import { fontFaceCss, loadFontData } from './fonts.js';
import { accentFor, PALETTE_IDS } from './palettes.js';
import { SKINS } from './skins.js';
import { FONTS, MOTION, RADII, SPACING, THEMES, THEME_IDS, type ThemeId, type ThemeTokens } from './tokens.js';

const SEMANTIC_KEYS: (keyof ThemeTokens)[] = [
  'bg', 'paper', 'panel', 'ink', 'muted', 'faint',
  'line', 'line2', 'grid', 'acc', 'neg', 'pos', 'warn', 'tip', 'tipInk',
];

function themeRule(theme: ThemeId): string {
  const t = THEMES[theme];
  const s = SKINS[theme];
  const vars = SEMANTIC_KEYS.map((k) => `--${k === 'tipInk' ? 'tipink' : k}:${t[k]}`).join(';');
  return `html[data-theme="${theme}"]{${vars};--shadow:${t.shadow};color-scheme:${s.colorScheme};` +
    `--r-card:${s.cardRadius}px;--r-panel:${s.panelRadius}px;--r-table:${s.tableRadius}px;--r-tip:${s.tipRadius}px;` +
    `--grid-size:${s.bgGridSize}px;--grid-opacity:${s.bgGridOpacity}}`;
}

function paletteRules(): string {
  // ADR-0008：每个 (theme, palette) 对都输出 --acc 覆盖，与 accentFor() 同一解析链。
  const rules: string[] = [];
  for (const theme of THEME_IDS) {
    for (const p of PALETTE_IDS) {
      rules.push(`html[data-theme="${theme}"][data-palette="${p}"]{--acc:${accentFor(p, theme)}}`);
    }
  }
  return rules.join('\n');
}

function rootVars(): string {
  const sp = SPACING.map((v, i) => `--space-${i}:${v}px`).join(';');
  const rd = `--radius-sm:${RADII.sm}px;--radius-md:${RADII.md}px;--radius-lg:${RADII.lg}px;--radius-xl:${RADII.xl}px;--radius-pill:${RADII.pill}px`;
  const mo = `--dur-fast:${MOTION.fast}ms;--dur-base:${MOTION.base}ms;--dur-enter:${MOTION.enter}ms;--ease:${MOTION.ease}`;
  const ft = `--font-display:${FONTS.display};--font-body:${FONTS.body};--font-mono:${FONTS.mono};` +
    `--serif:${FONTS.display};--sans:${FONTS.body};--mono:${FONTS.mono}`;
  return `:root{${sp};${rd};${mo};${ft};color-scheme:light dark}`;
}

/** §6 组件基础样式（移植 _shared.css，变量名对齐 tokens）。 */
const COMPONENT_CSS = `*{box-sizing:border-box;margin:0;padding:0}
::selection{background:var(--acc);color:var(--tipink)}
:focus-visible{outline:2px solid var(--acc);outline-offset:3px;border-radius:4px}
body::before{content:"";position:fixed;inset:0;pointer-events:none;background-image:linear-gradient(var(--grid) 1px,transparent 1px),linear-gradient(90deg,var(--grid) 1px,transparent 1px);background-size:var(--grid-size,56px) var(--grid-size,56px);opacity:var(--grid-opacity,.6)}
.wrap{max-width:1080px;margin:0 auto;position:relative}
header{display:flex;justify-content:space-between;align-items:flex-end;gap:16px;flex-wrap:wrap;border-bottom:1.5px solid var(--ink);padding-bottom:10px}
.eyebrow{font-family:var(--mono);font-size:11px;letter-spacing:.22em;color:var(--acc);text-transform:uppercase}
h1{font-family:var(--serif);font-weight:300;font-size:clamp(32px,5vw,52px);letter-spacing:-.02em}
h1 em{font-style:normal;color:var(--acc);font-weight:500}
.subtitle{color:var(--muted);font-size:15px;line-height:1.6;max-width:64ch}
.seg{display:flex;background:var(--paper);border:1px solid var(--line2);border-radius:99px;padding:3px;box-shadow:var(--shadow)}
.seg button{appearance:none;border:0;background:transparent;color:var(--muted);font-size:13px;padding:8px 14px;border-radius:99px;cursor:pointer}
.seg button.on{background:var(--ink);color:var(--paper)}
.deck{display:flex;flex-direction:column;gap:10px;margin:16px 0}
.trow{display:flex;flex-wrap:wrap;gap:8px 12px;align-items:center;background:var(--paper);border:1px solid var(--line);border-radius:var(--r-panel,16px);padding:9px 12px}
.trow .label{min-width:34px;font-family:var(--mono);font-size:10px;letter-spacing:.14em;color:var(--faint);text-transform:uppercase}
.trow .spacer{flex:1}
.trow .seg{box-shadow:none}
.toggle{appearance:none;border:1px solid var(--line2);background:var(--paper);color:var(--muted);border-radius:99px;padding:8px 14px;font-size:13px;cursor:pointer;transition:background var(--dur-fast) var(--ease)}
.toggle.on{background:var(--acc);border-color:var(--acc);color:var(--paper);font-weight:700}
.chip{display:inline-flex;align-items:center;gap:7px;border:1px solid var(--line2);background:transparent;color:var(--ink);border-radius:99px;padding:6px 12px;font-size:12px;cursor:pointer;transition:all var(--dur-fast) var(--ease)}
.card{background:var(--paper);border:1px solid var(--line);border-radius:var(--r-card,20px);padding:20px;box-shadow:var(--shadow);position:relative}
#tooltip{position:absolute;pointer-events:none;background:var(--tip);color:var(--tipink);padding:10px 12px;border-radius:var(--r-tip,10px);font-family:var(--mono);font-size:12px;line-height:1.7;display:none;z-index:10;min-width:160px;box-shadow:0 10px 30px rgba(0,0,0,.25)}
#tooltip b{color:var(--acc)}
#detail{font-family:var(--mono);font-size:12px;color:var(--muted);margin-top:12px;border-top:1px dashed var(--line);padding-top:10px;min-height:22px}
#detail b{color:var(--ink)}
.table{width:100%;border-collapse:collapse;font-size:13px;margin-top:18px;background:var(--paper);border:1px solid var(--line);border-radius:var(--r-table,14px);overflow:hidden}
.table th{font-family:var(--mono);font-size:11px;letter-spacing:.08em;text-align:left;color:var(--muted);border-bottom:1.5px solid var(--ink);padding:10px}
.table td{border-bottom:1px solid var(--line);padding:9px 10px}
.table td.num,.table th.num{text-align:right;font-family:var(--mono)}
footer{margin-top:18px;font-family:var(--mono);font-size:11px;color:var(--faint);display:flex;justify-content:space-between;flex-wrap:wrap;gap:10px}
.quality-head{display:flex;justify-content:space-between;gap:14px;align-items:center;border-bottom:1px dashed var(--line);padding-bottom:10px;margin-bottom:10px}
.quality-head h2{font-family:var(--serif);font-size:20px;font-weight:420;letter-spacing:-.02em}
.quality-score{font-family:var(--mono);font-size:10px;color:var(--muted);text-align:right;line-height:1.6}
.quality-score b{display:block;color:var(--acc);font-size:13px}
.quality-grid{display:flex;gap:8px;flex-wrap:wrap}
.qs{border:1px solid var(--line2);border-radius:999px;padding:5px 9px;font-family:var(--mono);font-size:11px;color:var(--muted)}
.qs b{color:var(--ink);font-weight:500}
.quality-ok{margin:11px 0 0;color:var(--acc);font-size:12px}
.hint{font-size:12px;color:var(--faint);margin-top:8px}
.summary{display:flex;flex-wrap:wrap;gap:10px;margin:4px 0 14px}
.sum-card{display:inline-flex;align-items:baseline;gap:8px;border:1px solid var(--line2);border-radius:var(--r-table,14px);padding:9px 12px;font-family:var(--mono);font-size:11px;color:var(--muted)}
.sum-card b{color:var(--ink);font-size:19px;font-weight:500;letter-spacing:-.02em}
.quality{border:1px solid var(--line);border-left:4px solid var(--acc);background:var(--paper);border-radius:var(--r-panel,16px);padding:14px;margin:16px 0 8px;box-shadow:0 1px 0 rgba(0,0,0,.02) inset}
.quality.warn{border-left-color:var(--neg)}
.quality.warn .quality-score b{color:var(--neg)}
.quality-warnings{margin:11px 0 0;padding-left:18px;color:var(--neg);font-size:12px;line-height:1.75}
@media(prefers-reduced-motion:reduce){*,*::before,*::after{animation-duration:.01ms !important;transition-duration:.01ms !important}}`;

export interface BuildCssOptions {
  /** true = 内联子集字体的 @font-face（仅 Node 可用；产物离线自包含） */
  fonts?: boolean;
}

export function buildCss(opts: BuildCssOptions = {}): string {
  const parts = [rootVars(), ...THEME_IDS.map(themeRule), paletteRules(), COMPONENT_CSS];
  if (opts.fonts) parts.unshift(fontFaceCss(loadFontData()));
  return parts.join('\n');
}
