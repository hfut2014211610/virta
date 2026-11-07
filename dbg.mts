import { readFileSync } from 'node:fs';
import { adaptInput, runPipeline } from '@virta/data-engine';
import { modelHash } from '@virta/chart-core';
import { toGrid } from './packages/data-engine/src/families/grid.js';
const html = readFileSync('out/visual/parity/deadline-grid-detail-light.html','utf8');
const m = /window\.__VIRTA__=(\{[\s\S]*?\});<\/script>/.exec(html)!;
const payload = JSON.parse(m[1]);
console.log('spec', JSON.stringify(payload.spec).slice(0,400));
const a = adaptInput({table: payload.table}, 'grid', payload.spec).model;
console.log('node adaptInput hash', modelHash(a));
const p = runPipeline(payload.table, payload.spec, 'grid', (r)=>toGrid(r)).model;
console.log('node runPipeline hash', modelHash(p));
// 找出两行差异
const rowsA = a.rows, rowsB = p.rows;
for (let i=0;i<rowsA.length;i++){ if(JSON.stringify(rowsA[i])!==JSON.stringify(rowsB[i])){console.log('row diff',i,JSON.stringify(rowsA[i]),JSON.stringify(rowsB[i]));break;} }
