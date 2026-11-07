// skill 命令（E10/§3）：Agent 技能文件的定位与安装。
// skill install 在源文件头部注入 YAML front matter（Devin/Claude/Codex 技能格式）。
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { assets } from './assets.js';
import { fail } from './errors.js';

export const SKILL_DESCRIPTION =
  '用 virta CLI 把 CSV/JSON/Excel/Markdown 数据渲染成离线交互 HTML 和 SVG/PNG 图表，包括推荐、校验和组合仪表盘';

export const SKILL_FRONT_MATTER = `---\nname: virta\ndescription: ${SKILL_DESCRIPTION}\n---\n\n`;

export function skillPath(): string {
  if (!existsSync(assets.skillFile)) {
    fail('INTERNAL', `内置 SKILL.md 缺失：${assets.skillFile}`, '安装包不完整，重新安装或运行 virta doctor 检查');
  }
  return assets.skillFile;
}

export interface SkillInstallResult { path: string; bytes: number }

export function skillInstall(dir: string, force: boolean): SkillInstallResult {
  const src = skillPath();
  const target = join(dir, 'virta', 'SKILL.md');
  if (existsSync(target) && !force) {
    fail('INVALID_OPTION', `目标已存在：${target}`, '加 --force 覆盖，或换 --dir');
  }
  const body = SKILL_FRONT_MATTER + readFileSync(src, 'utf8');
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, body, 'utf8');
  return { path: target, bytes: Buffer.byteLength(body) };
}
