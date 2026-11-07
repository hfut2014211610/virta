// 运行期入口源码 + esbuild 选项的唯一来源（E3）：
// scripts/build.ts（构建期）与 source 模式 assets.runtimeScript（运行期）共用；
// dist 模式不经过本模块——直接读 dist/runtime/ 预构建产物（T2 逐字节锁定两者一致）。
import { fail } from './errors.js';

export interface ViewMapEntry {
  charts: string;
  renderer: string;
  adapter: string;
  toModel: string;
  toModelCurve?: string;
  post?: string;
}
export type ViewMap = Record<string, ViewMapEntry>;

/** per-view 入口源码：只打包本视图的 renderer + toModel(+post) + runtime。
 *  ADR-0012：adapt 走统一管线 runPipeline。 */
export function viewEntrySource(view: string, viewMap: ViewMap): string {
  const m = viewMap[view];
  if (!m) fail('UNKNOWN_VIEW', `view-map 缺少 ${view}`);
  const isDoc = view === 'report';
  return `import { boot } from './packages/viewer/src/runtime.js';
import { ${m.renderer} } from './packages/charts/src/${m.charts}.js';
import { ${[m.toModel, m.toModelCurve].filter(Boolean).join(', ')} } from './packages/data-engine/src/${m.adapter}.js';
${isDoc ? '' : `import { runPipeline } from './packages/data-engine/src/pipeline.js';
${m.post ? `import { ${m.post} } from './packages/data-engine/src/families/post.js';` : ''}`}
${view === 'grid' ? `import { renderFlowTable } from './packages/viewer/src/flow-table.js';` : ''}
${isDoc ? `import { renderFlowDoc } from './packages/viewer/src/flow-doc.js';` : ''}
const deps = {
  renderer: ${m.renderer},
  ${view === 'grid' ? 'renderFlowTable,' : ''}
  ${isDoc ? 'renderFlowDoc,' : ''}
  ${isDoc
    ? `buildDoc: (text, name) => ${m.toModel}(text, name),`
    : `adapt: (t, s) => runPipeline(t, s, ${JSON.stringify(view)}, (raw) => ${m.toModelCurve ? `(s?.variant === 'curve' ? ${m.toModelCurve} : ${m.toModel})` : m.toModel}(raw)${m.post ? `, ${m.post}` : ''}).model,`}
};
boot(window.__VIRTA__, deps);
`;
}

/** compose 运行期入口：runtime-compose + 用到的视图集合。
 *  flowOf 由调用方注入（构建期/CLI 均可用 getContract(flow)）。
 *  ADR-0012：面板 adapt 走统一管线 runPipeline（映射/派生/缺失值与 CLI 同一条路径）。 */
export function composeEntrySource(views: string[], viewMap: ViewMap, flowOf: (view: string) => boolean): string {
  const uniq = [...new Set(views)];
  const imps = uniq.map((v, i) => {
    const m = viewMap[v];
    if (!m) fail('UNKNOWN_VIEW', `view-map 缺少 ${v}`);
    return `import { ${m.renderer} as R${i} } from './packages/charts/src/${m.charts}.js';
import { ${m.toModel} as A${i}${m.toModelCurve ? `, ${m.toModelCurve} as C${i}` : ''} } from './packages/data-engine/src/${m.adapter}.js';${m.post ? `
import { ${m.post} as P${i} } from './packages/data-engine/src/families/post.js';` : ''}`;
  }).join('\n');
  const map = uniq.map((v, i) => {
    const m = viewMap[v]!;
    const tm = m.toModelCurve ? `(s?.variant === 'curve' ? C${i} : A${i})` : `A${i}`;
    return `${JSON.stringify(v)}:{renderer:R${i},flow:${flowOf(v)},adapt:(i,s)=>i.doc!==undefined?A${i}(i.doc,'doc'):runPipeline(i.table,s,${JSON.stringify(v)},(raw)=>${tm}(raw)${m.post ? `,P${i}` : ''}).model}`;
  }).join(',');
  return `import { bootCompose } from './packages/viewer/src/runtime-compose.js';
import { runPipeline } from './packages/data-engine/src/pipeline.js';
${imps}
const views = {${map}};
bootCompose(window.__VIRTA__, views);
`;
}

/** 运行期 esbuild 选项（T2：dist 产物与 source 模式现场编译逐字节一致的保证）。 */
export const RUNTIME_BUILD_OPTIONS = {
  bundle: true,
  format: 'iife',
  platform: 'browser',
  target: 'es2020',
  write: false,
  minify: true,
  globalName: '__VIRTA_RT',
  define: { 'import.meta.url': '"http://localhost/__bundle__/"' },
} as const;
