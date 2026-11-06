// contracts v1 · ViewSpec 的手写 JSON Schema（供 `virta schema --spec-schema` 输出）。
// 与 spec.ts 的 ViewSpec 保持一致；契约变更须同步更新本文件（ADR-0004）。
import { THEME_IDS } from './spec.js';
import { VIEW_IDS } from './views.js';

const PALETTES = ['signal', 'cinnabar', 'patina', 'blueprint', 'inkwash', 'mono', 'sundown', 'dunhuang', 'aurora', 'morandi'];

const ANNOTATION = {
  type: 'object',
  required: ['type'],
  properties: {
    type: { enum: ['refLine', 'band', 'marker', 'event'] },
    axis: { enum: ['x', 'y', 'y2'] },
    value: {},
    from: {},
    to: {},
    label: { type: 'string' },
    at: {},
    text: { type: 'string' },
  },
  additionalProperties: true,
} as const;

export const VIEW_SPEC_SCHEMA = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $id: 'https://virta.dev/schemas/viewspec-v1.json',
  title: 'Virta ViewSpec v1',
  type: 'object',
  required: ['version', 'view'],
  additionalProperties: false,
  properties: {
    version: { const: 1 },
    view: { enum: [...VIEW_IDS, 'auto'] },
    variant: { type: 'string', description: '变体 id，见各 contract.variants' },
    mode: { type: 'string', description: '强制输入模式 id，见各 contract.modes' },
    mapping: {
      type: 'object',
      description: 'role → 列名，覆盖自动识别',
      additionalProperties: { anyOf: [{ type: 'string' }, { type: 'array', items: { type: 'string' } }] },
    },
    theme: { enum: [...THEME_IDS] },
    palette: { enum: PALETTES },
    options: {
      type: 'object',
      description: '键必须在对应 contract.options 中声明',
      additionalProperties: { anyOf: [{ type: 'string' }, { type: 'number' }, { type: 'boolean' }] },
    },
    state: {
      type: 'object',
      additionalProperties: false,
      properties: {
        sort: { enum: ['none', 'asc', 'desc'] },
        hiddenSeries: { type: 'array', items: { type: 'string' } },
        filter: { type: 'object', additionalProperties: { type: 'array', items: { type: 'string' } } },
        range: { type: 'array', items: { type: 'number' }, minItems: 2, maxItems: 2 },
        focus: { type: ['string', 'null'] },
        azimuth: { type: 'number' },
        tilt: { type: 'number' },
        zoom: { type: 'number' },
        explode: { type: 'number' },
        time: { type: ['string', 'number'] },
      },
    },
    text: {
      type: 'object',
      additionalProperties: false,
      properties: {
        title: { type: 'string' },
        subtitle: { type: 'string' },
        note: { type: 'string' },
        source: { type: 'string' },
        unit: { type: 'string' },
      },
    },
    annotations: { type: 'array', items: ANNOTATION },
    format: {
      type: 'object',
      additionalProperties: false,
      properties: {
        style: { enum: ['auto', 'raw', 'thousands', 'wan', 'percent', 'currency'] },
        currency: { enum: ['CNY', 'USD', 'EUR'] },
        decimals: { type: 'number' },
      },
    },
    facet: {
      type: 'object',
      required: ['column'],
      additionalProperties: false,
      properties: {
        column: { type: 'string' },
        columns: { type: 'number' },
        sharedScale: { type: 'boolean' },
      },
    },
    layout: { enum: ['read', 'edit'] },
    size: {
      type: 'object',
      required: ['width', 'height'],
      additionalProperties: false,
      properties: { width: { type: 'number' }, height: { type: 'number' } },
    },
  },
} as const;

export type ViewSpecSchema = typeof VIEW_SPEC_SCHEMA;
