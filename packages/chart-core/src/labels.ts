// placeLabels：贪心标签避让（§5.3）。按优先级（值）降序，每个标签试 4-8 个候选位，
// 放不下可引出线，否则隐藏（tooltip 保留信息）。sankey/pie/scatter/treemap/network 必用。
export interface LabelCandidate {
  /** 锚点 */
  x: number; y: number;
  text: string;
  width: number; height: number;
  /** 优先级：大的先放 */
  priority: number;
  /** 候选相对偏移（默认 8 向） */
  offsets?: [number, number][];
  /** 是否允许引出线 */
  leader?: boolean;
  datum?: import('./scene.js').DatumRef;
}
export interface PlacedLabel {
  x: number; y: number; w: number; h: number;
  text: string; anchorX: number; anchorY: number;
  leader: [number, number, number, number] | null;
  datum?: import('./scene.js').DatumRef;
}
export interface PlacedResult { placed: PlacedLabel[]; hidden: LabelCandidate[] }

const DEFAULT_OFFSETS: [number, number][] = [
  [0, -8], [8, -4], [8, 4], [0, 8], [-8, 4], [-8, -4], [12, 0], [-12, 0],
];
const overlap = (a: [number, number, number, number], b: [number, number, number, number], pad = 2) =>
  !(a[2] + pad < b[0] || b[2] + pad < a[0] || a[3] + pad < b[1] || b[3] + pad < a[1]);

export function placeLabels(cands: LabelCandidate[], bounds: [number, number, number, number], pad = 4): PlacedResult {
  const placed: PlacedLabel[] = [];
  const hidden: LabelCandidate[] = [];
  const boxes: [number, number, number, number][] = [];
  const sorted = [...cands].sort((a, b) => b.priority - a.priority);
  for (const c of sorted) {
    const offs = c.offsets ?? DEFAULT_OFFSETS;
    let ok: PlacedLabel | null = null;
    for (const [dx, dy] of offs) {
      const x = c.x + dx - c.width / 2, y = c.y + dy - c.height / 2;
      const box: [number, number, number, number] = [x, y, x + c.width, y + c.height];
      if (box[0] < bounds[0] + pad || box[2] > bounds[2] - pad || box[1] < bounds[1] + pad || box[3] > bounds[3] - pad) continue;
      if (boxes.some((b) => overlap(box, b))) continue;
      ok = { x, y, w: c.width, h: c.height, text: c.text, anchorX: c.x, anchorY: c.y, leader: c.leader ? [c.x, c.y, x + c.width / 2, y + c.height / 2] : null, datum: c.datum };
      break;
    }
    if (ok) { placed.push(ok); boxes.push([ok.x, ok.y, ok.x + ok.w, ok.y + ok.h]); }
    else hidden.push(c);
  }
  return { placed, hidden };
}
