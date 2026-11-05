// validate(table, spec) → ValidateReceipt（§5.1）：角色缺失/歧义、非法选项、adapter 质量问题、可执行建议。
import type { Table, ViewSpec, ValidateReceipt, QualityIssue, ViewId } from '@virta/contracts';
import { getContract } from '@virta/contracts';
import { normKey } from './aliases.js';
import { profileTable } from './profile.js';
import { tableToRaw, TO_MODEL } from './families/index.js';
import { projectQuality } from './families/index.js';

export function validate(table: Table, spec: ViewSpec): ValidateReceipt {
  const view = spec.view as ViewId;
  const contract = getContract(view);
  const profile = profileTable(table);
  const mapping: Record<string, string | string[]> = { ...(spec.mapping ?? {}) };
  const missingRoles: string[] = [];
  const ambiguous: { role: string; columns: string[] }[] = [];
  const suggestions: string[] = [];
  const issues: QualityIssue[] = [];

  if (!contract) {
    issues.push({ code: 'VARIANT_DISABLED', level: 'error', message: `未知视图 ${view}` });
    return { view, valid: false, mapping, missingRoles: [view], ambiguous, issues, suggestions };
  }

  // 角色映射：显式 mapping > 别名命中（唯一才自动采用，多列命中记歧义）
  for (const role of contract.roles) {
    if (mapping[role.role]) continue;
    const hits = table.columns.filter((c) => role.aliases.map(normKey).includes(normKey(c)));
    if (hits.length === 1) mapping[role.role] = hits[0];
    else if (hits.length > 1) {
      ambiguous.push({ role: role.role, columns: hits });
      suggestions.push(`列 ${hits.map((h) => `「${h}」`).join('、')} 都匹配 ${role.label}：--set mapping.${role.role}=${hits[0]}`);
    }
  }
  for (const role of contract.roles) {
    if (!role.required) continue;
    const bound = mapping[role.role];
    if (!bound || (Array.isArray(bound) && !bound.length)) {
      missingRoles.push(role.role);
      const cands = table.columns.filter((c) => !Object.values(mapping).flat().includes(c));
      const hint = cands[0] ? `，如 --set mapping.${role.role}=${cands[0]}` : '';
      suggestions.push(`缺少必需角色 ${role.role}（${role.label}）${hint}`);
    } else {
      const cols = Array.isArray(bound) ? bound : [bound];
      for (const c of cols) {
        if (!table.columns.includes(c)) {
          issues.push({ code: 'MISSING_VALUES', level: 'error', message: `mapping.${role.role} 指向不存在的列「${c}」`, column: c });
          missingRoles.push(role.role);
          const cand = table.columns.find((x) => !Object.values(mapping).flat().includes(x));
          suggestions.push(`列「${c}」不存在：--set mapping.${role.role}=${cand ?? table.columns[0]}`);
        }
      }
    }
  }

  // 选项合法性
  for (const [key, val] of Object.entries(spec.options ?? {})) {
    const opt = contract.options.find((o) => o.key === key);
    if (!opt) {
      issues.push({ code: 'VARIANT_DISABLED', level: 'error', message: `选项 ${key} 未在 ${view} 契约中声明` });
      suggestions.push(`移除未知选项：--unset options.${key}`);
      continue;
    }
    if (opt.type === 'enum' && opt.values && !opt.values.some((v) => v.value === val)) {
      issues.push({ code: 'VARIANT_DISABLED', level: 'error', message: `选项 ${key}=${String(val)} 非法（可选 ${opt.values.map((v) => v.value).join('/')}）` });
      suggestions.push(`改为合法值：--set options.${key}=${opt.values[0].value}`);
    }
    if (opt.type === 'number' && typeof val === 'number') {
      if ((opt.min !== undefined && val < opt.min) || (opt.max !== undefined && val > opt.max)) {
        issues.push({ code: 'VARIANT_DISABLED', level: 'error', message: `选项 ${key}=${val} 越界 [${opt.min ?? '-∞'}, ${opt.max ?? '+∞'}]` });
      }
    }
  }
  if (spec.variant && !contract.variants.some((v) => v.id === spec.variant)) {
    issues.push({ code: 'VARIANT_DISABLED', level: 'error', message: `变体 ${spec.variant} 未声明（可选 ${contract.variants.map((v) => v.id).join('/')}）` });
  }

  // adapter 数据质量（映射补全后仍跑 to_*，其 quality 作为数据问题来源）
  let mode: string | undefined;
  const toModel = TO_MODEL[view];
  if (toModel) {
    try {
      const model = toModel(tableToRaw(table)) as { quality?: { warnings?: string[]; mode?: string } };
      mode = model?.quality?.mode;
      const qr = projectQuality(model?.quality);
      issues.push(...qr.issues);
    } catch (e) {
      issues.push({ code: 'INVALID_NUMBERS', level: 'error', message: (e as Error).message });
    }
  }

  const errors = issues.filter((i) => i.level === 'error').length;
  return {
    view, valid: errors === 0 && missingRoles.length === 0,
    mode, mapping, missingRoles, ambiguous, issues, suggestions,
  };
}
