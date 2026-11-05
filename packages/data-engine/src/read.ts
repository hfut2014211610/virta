// 读取层（同构）：文本 → Raw。文件 IO 在 ./node。
import Papa from 'papaparse';
import type { RawRow } from './legacy-core.js';
import type { EchartsWrap } from './families/barline.js';

export type Raw = RawRow[] | EchartsWrap;

export interface ReadResult {
  raw: Raw;
  /** 判定的输入形态 */
  kind: 'rows' | 'echarts';
}

/** CSV 文本 → 行（papaparse 自动分隔符，跳全空行，首行表头）。 */
export function parseCsvText(text: string): RawRow[] {
  const t = text.replace(/^﻿/, '');
  const out = Papa.parse<RawRow>(t, { header: true, skipEmptyLines: 'greedy' });
  return out.data;
}

/** JSON → 行或 ECharts 透传（read_raw 的 .json 分支移植）。 */
export function parseJsonText(text: string): ReadResult {
  const data = JSON.parse(text);
  return jsonToRaw(data);
}

export function jsonToRaw(data: unknown): ReadResult {
  if (data !== null && typeof data === 'object' && !Array.isArray(data)) {
    const d = data as Record<string, unknown>;
    if ('xAxis' in d && 'series' in d) return { raw: { __echarts: d }, kind: 'echarts' };
    if ('series' in d && !d['labels']) return { raw: { __echarts: d }, kind: 'echarts' };
    const rows = (d['data'] ?? d['rows'] ?? d['result'] ?? []) as RawRow[];
    return { raw: rows, kind: 'rows' };
  }
  if (Array.isArray(data)) return { raw: data as RawRow[], kind: 'rows' };
  throw new Error('JSON 需为数组，或含 data/rows 字段的对象');
}

/** 未知内容嗅探：先试 JSON，失败回退 CSV（stdin 未指定 --format 时的语义）。 */
export function sniffText(text: string): ReadResult {
  try {
    return parseJsonText(text);
  } catch {
    return { raw: parseCsvText(text), kind: 'rows' };
  }
}
