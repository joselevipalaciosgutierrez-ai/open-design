import { useCallback, useEffect, useState } from 'react';
import { Button } from '@open-design/components';
import type { AgentProfile } from '@open-design/contracts';
import { useI18n } from '../i18n';
import styles from './SkillScopesPanel.module.css';

/** What `/api/skill-library/discover` reports for one skill. */
interface DiscoveredSkill {
  source: string;
  name: string;
  description: string;
  path: string;
  bytes: number;
  imported: boolean;
}

interface Copy {
  scopesTitle: string;
  scopes: Array<[string, string]>;
  cliTitle: string;
  cliHint: string;
  cliEmpty: string;
  cliShow: string;
  cliHide: string;
  imported: string;
  import: string;
  forEveryone: string;
  libraryOnly: string;
  forAgent: (name: string) => string;
  failed: string;
}

const ES: Copy = {
  scopesTitle: 'Quién puede usar cada skill',
  scopes: [
    ['Global', 'la usan todos los agentes y el asistente. Ideal para reglas de ahorro de tokens o de estilo.'],
    ['Del agente', 'solo ese agente puede leerla (se elige en el agente). Ningún otro la ve: lo impide el sistema, no una instrucción.'],
    ['Del proyecto', 'la skill activa del proyecto, para quien trabaje en él.'],
  ],
  cliTitle: 'Encontradas en tus CLI',
  cliHint: 'Skills que instalaste directamente en Antigravity, Claude, Codex… Impórtalas una vez y sirven con cualquier CLI.',
  cliEmpty: 'No hay skills instaladas en tus CLI.',
  cliShow: 'Ver skills de tus CLI',
  cliHide: 'Ocultar',
  imported: 'Ya importada',
  import: 'Importar',
  forEveryone: 'Global (todos)',
  libraryOnly: 'Solo a la biblioteca',
  forAgent: (name) => `Solo para ${name}`,
  failed: 'No se pudo importar.',
};

const EN: Copy = {
  scopesTitle: 'Who may use each skill',
  scopes: [
    ['Global', 'every agent and the assistant use it. Good for token-saving or style rules.'],
    ["The agent's", 'only that agent can read it (chosen on the agent). No other agent sees it: the system enforces it, not an instruction.'],
    ["The project's", "the project's active skill, for whoever works on it."],
  ],
  cliTitle: 'Found in your CLIs',
  cliHint: 'Skills you installed straight into Antigravity, Claude, Codex… Import them once and they work with any CLI.',
  cliEmpty: 'No skills are installed in your CLIs.',
  cliShow: 'Show skills in your CLIs',
  cliHide: 'Hide',
  imported: 'Already imported',
  import: 'Import',
  forEveryone: 'Global (everyone)',
  libraryOnly: 'Library only',
  forAgent: (name) => `Only for ${name}`,
  failed: 'It could not be imported.',
};

export function useSkillScopesCopy(): Copy {
  const { locale } = useI18n();
  return locale.toLowerCase().startsWith('es') ? ES : EN;
}

/**
 * Above the skills list: the three scopes in one line each, and the skills
 * found in the person's CLIs, ready to import for everyone or for one agent.
 */
export function SkillScopesPanel({ onImported }: { onImported: () => void }) {
  const copy = useSkillScopesCopy();
  const [open, setOpen] = useState(false);
  const [found, setFound] = useState<DiscoveredSkill[] | null>(null);
  const [agents, setAgents] = useState<AgentProfile[]>([]);
  const [scopeByPath, setScopeByPath] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [skills, profiles] = await Promise.all([
        fetch('/api/skill-library/discover').then((r) => (r.ok ? r.json() : { skills: [] })),
        fetch('/api/agent-profiles').then((r) => (r.ok ? r.json() : { profiles: [] })),
      ]);
      setFound((skills as { skills: DiscoveredSkill[] }).skills ?? []);
      const list = (profiles as { profiles?: AgentProfile[]; agents?: AgentProfile[] });
      setAgents(list.profiles ?? list.agents ?? []);
    } catch {
      setFound([]);
    }
  }, []);

  useEffect(() => {
    if (open && found === null) void load();
  }, [open, found, load]);

  const importSkill = async (skill: DiscoveredSkill) => {
    const choice = scopeByPath[skill.path] ?? 'global';
    const body = choice.startsWith('agent:')
      ? { path: skill.path, scope: 'agent', agentId: choice.slice('agent:'.length) }
      : { path: skill.path, scope: choice };
    setBusy(skill.path);
    setError(null);
    try {
      const resp = await fetch('/api/skill-library/import', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!resp.ok) throw new Error(String(resp.status));
      setFound((list) => (list ?? []).map((s) => (s.path === skill.path ? { ...s, imported: true } : s)));
      onImported();
    } catch {
      setError(copy.failed);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className={styles.panel} data-testid="skill-scopes-panel">
      <div className={styles.scopes}>
        <strong className={styles.title}>{copy.scopesTitle}</strong>
        <ul className={styles.scopeList}>
          {copy.scopes.map(([name, text]) => (
            <li key={name}>
              <b>{name}:</b> {text}
            </li>
          ))}
        </ul>
      </div>

      <div className={styles.cli}>
        <div className={styles.cliHead}>
          <div>
            <strong className={styles.title}>{copy.cliTitle}</strong>
            <p className={styles.hint}>{copy.cliHint}</p>
          </div>
          <Button size="sm" variant="ghost" onClick={() => setOpen((v) => !v)} data-testid="skill-cli-toggle">
            {open ? copy.cliHide : copy.cliShow}
          </Button>
        </div>
        {open ? (
          found && found.length === 0 ? (
            <p className={styles.hint}>{copy.cliEmpty}</p>
          ) : (
            <ul className={styles.found} data-testid="skill-cli-list">
              {(found ?? []).map((skill) => (
                <li key={skill.path} className={styles.item}>
                  <div className={styles.meta}>
                    <span className={styles.name}>{skill.name}</span>
                    <span className={styles.source}>{skill.source}</span>
                    {skill.description ? <span className={styles.desc}>{skill.description}</span> : null}
                  </div>
                  {skill.imported ? (
                    <span className={styles.done}>{copy.imported}</span>
                  ) : (
                    <div className={styles.actions}>
                      <select
                        className={styles.select}
                        aria-label={copy.import}
                        value={scopeByPath[skill.path] ?? 'global'}
                        onChange={(e) => setScopeByPath((m) => ({ ...m, [skill.path]: e.target.value }))}
                      >
                        <option value="global">{copy.forEveryone}</option>
                        <option value="library">{copy.libraryOnly}</option>
                        {agents.map((agent) => (
                          <option key={agent.id} value={`agent:${agent.id}`}>
                            {copy.forAgent(agent.name)}
                          </option>
                        ))}
                      </select>
                      <Button
                        size="sm"
                        disabled={busy === skill.path}
                        onClick={() => void importSkill(skill)}
                        data-testid="skill-cli-import"
                      >
                        {copy.import}
                      </Button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )
        ) : null}
        {error ? <p className={styles.hint} role="status">{error}</p> : null}
      </div>
    </div>
  );
}
