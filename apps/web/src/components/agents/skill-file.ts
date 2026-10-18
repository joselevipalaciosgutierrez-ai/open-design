import type { SkillImportInput } from '../../providers/registry';

/**
 * Turns the text of an uploaded SKILL.md into the body `/api/skills/import`
 * expects. Reads `name` and `description` from the YAML frontmatter when there
 * is one; the rest of the file is the skill body.
 */
export function parseSkillFile(
  text: string,
  fileName: string,
): SkillImportInput | { error: 'empty' | 'noName' } {
  const fallbackName = fileName.replace(/\.md$/i, '').replace(/^SKILL$/i, '');
  const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  const block = match?.[1] ?? '';
  const body = (match ? text.slice(match[0].length) : text).trim();
  const read = (key: string) => {
    const line = block.split(/\r?\n/).find((l) => l.startsWith(`${key}:`));
    return (line?.slice(key.length + 1) ?? '').trim().replace(/^["']|["']$/g, '');
  };
  const name = read('name') || fallbackName;
  if (!body) return { error: 'empty' };
  if (!name) return { error: 'noName' };
  return { name, description: read('description'), body, triggers: [] };
}
