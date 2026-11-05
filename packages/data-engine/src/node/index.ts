// @virta/data-engine/node · 文件/stdin 读取（read_raw 移植 + GBK 回退 + xlsx）。
import * as fs from 'node:fs';
import * as path from 'node:path';
import { readSheet } from 'read-excel-file/node';
import { parseCsvText, parseJsonText, sniffText, type ReadResult } from '../read.js';
import type { RawRow } from '../legacy-core.js';
import type { SourceMeta } from '@virta/contracts';

export interface ReadOptions {
  format?: 'csv' | 'json' | 'xlsx' | 'md' | 'txt';
  sheet?: string | number;
}

export interface LoadedInput {
  result?: ReadResult;
  /** md/txt 走 doc 管线 */
  docText?: string;
  source: SourceMeta;
}

/** UTF-8 解码；替换字符比例 >1% 时回退 GB18030（标注 encoding）。 */
function decodeBuffer(buf: Uint8Array): { text: string; encoding: string } {
  const text = new TextDecoder('utf-8', { fatal: false }).decode(buf);
  const bad = (text.match(/�/g) ?? []).length;
  if (bad / Math.max(1, text.length) > 0.01) {
    return { text: new TextDecoder('gb18030').decode(buf), encoding: 'gb18030' };
  }
  return { text, encoding: 'utf-8' };
}

export async function readXlsx(filePath: string, sheet?: string | number): Promise<RawRow[]> {
  // read-excel-file@9：readSheet(input, sheet) → 首行表头，缺省第一表；跳全空行
  const rows = await readSheet(filePath, sheet) as unknown[][];
  if (!rows.length) return [];
  const head = rows[0].map((c) => String(c ?? '').trim());
  return rows.slice(1)
    .filter((r) => r.some((v) => v !== null && v !== undefined))
    .map((r) => Object.fromEntries(head.map((h, i) => [h, r[i] ?? null])));
}

export async function readInput(filePath: string, opts: ReadOptions = {}): Promise<LoadedInput> {
  const name = path.basename(filePath);
  const ext = (opts.format ?? path.extname(filePath).slice(1)).toLowerCase();
  const base: SourceMeta = { name, format: ext as SourceMeta['format'], rows: 0 };
  if (ext === 'md' || ext === 'txt') {
    const { text } = decodeBuffer(fs.readFileSync(filePath));
    return { docText: text, source: { ...base, format: ext as 'md' | 'txt', rows: 0 } };
  }
  if (ext === 'xlsx') {
    const rows = await readXlsx(filePath, opts.sheet);
    return { result: { raw: rows, kind: 'rows' }, source: { ...base, rows: rows.length, sheet: opts.sheet?.toString() } };
  }
  if (!fs.existsSync(filePath)) {
    const err = new Error(`输入文件不存在：${filePath}`) as Error & { code?: string };
    err.code = 'INPUT_NOT_FOUND';
    throw err;
  }
  const { text, encoding } = decodeBuffer(fs.readFileSync(filePath));
  const result = ext === 'json' ? parseJsonText(text) : ext === 'csv' ? { raw: parseCsvText(text), kind: 'rows' as const } : sniffText(text);
  return { result, source: { ...base, format: ext as SourceMeta['format'], rows: result.kind === 'rows' ? (result.raw as RawRow[]).length : 0, encoding } };
}

/** stdin / --data 内联：text + 可选 format。 */
export function readInline(text: string, format?: string): ReadResult {
  if (format === 'json') return parseJsonText(text);
  if (format === 'csv') return { raw: parseCsvText(text), kind: 'rows' };
  return sniffText(text);
}
