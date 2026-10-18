import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useState,
  type FormEvent,
} from 'react';
import type {
  AgentProfile,
  AgentProfileInput,
  DesignSystemSummary,
  SkillSummary,
} from '@open-design/contracts';

import { useI18n } from '../i18n';
import { fetchDesignSystems, fetchSkills } from '../providers/registry';
import { navigate } from '../router';
import {
  createAgentProfile,
  deleteAgentProfile,
  listAgentProfiles,
  updateAgentProfile,
} from '../state/agent-profiles';
import { createConversation, createProject, patchConversation } from '../state/projects';
import type { AgentInfo, Project } from '../types';
import { getAgentsCopy, type AgentsCopy } from './agents/agents-copy';
import styles from './AgentsView.module.css';

const CUSTOM_MODEL = '__custom__';
const NEW_PROJECT = '__new__';

interface Props {
  isActive?: boolean;
  /** Runtimes (coding-agent CLIs) the daemon detected. */
  agents: AgentInfo[];
  projects: Project[];
  onOpenProject: (id: string) => Promise<boolean | void> | boolean | void;
}

function runtimeOf(agents: AgentInfo[], runtimeId: string): AgentInfo | undefined {
  return agents.find((agent) => agent.id === runtimeId);
}

function modelLabel(agents: AgentInfo[], profile: AgentProfile, copy: AgentsCopy): string {
  if (!profile.model) return copy.modelDefault;
  const known = runtimeOf(agents, profile.runtimeId)?.models?.find((m) => m.id === profile.model);
  return known?.label ?? profile.model;
}

export function AgentsView({ isActive = true, agents, projects, onOpenProject }: Props) {
  const { locale } = useI18n();
  const copy = useMemo(() => getAgentsCopy(locale), [locale]);
  const [profiles, setProfiles] = useState<AgentProfile[] | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [editor, setEditor] = useState<AgentProfile | 'new' | null>(null);
  const [chatFor, setChatFor] = useState<AgentProfile | null>(null);

  const refresh = useCallback(async () => {
    try {
      setProfiles(await listAgentProfiles());
      setLoadFailed(false);
    } catch {
      setLoadFailed(true);
    }
  }, []);

  // Views stay mounted behind the tab bar, so reload whenever this one is shown.
  useEffect(() => {
    if (isActive) void refresh();
  }, [isActive, refresh]);

  const startChat = useCallback(
    async (profile: AgentProfile, target: string) => {
      let projectId = target;
      let conversationId: string | null = null;
      if (target === NEW_PROJECT) {
        const created = await createProject({
          name: profile.name,
          skillId: null,
          designSystemId: profile.designSystemId,
          metadata: { kind: 'other', nameSource: 'generated' },
        });
        projectId = created.project.id;
        const linked = await patchConversation(projectId, created.conversationId, {
          agentProfileId: profile.id,
          title: profile.name,
        });
        if (!linked) throw new Error('could not link the conversation to the agent');
        conversationId = created.conversationId;
      } else {
        const conversation = await createConversation(projectId, profile.name, {
          sessionMode: 'design',
          agentProfileId: profile.id,
          throwOnError: true,
        });
        if (!conversation) throw new Error('could not create the conversation');
        conversationId = conversation.id;
      }
      await onOpenProject(projectId);
      navigate({ kind: 'project', projectId, conversationId, fileName: null });
      setChatFor(null);
      void refresh();
    },
    [onOpenProject, refresh],
  );

  return (
    <section className={styles.root} data-testid="agents-view" aria-label={copy.title}>
      <header className={styles.header}>
        <div>
          <h1 className={styles.title}>{copy.title}</h1>
          <p className={styles.subtitle}>{copy.subtitle}</p>
        </div>
        <button
          type="button"
          className={styles.primary}
          data-testid="agents-new"
          onClick={() => setEditor('new')}
        >
          {copy.newAgent}
        </button>
      </header>

      {loadFailed ? (
        <div className={styles.notice} role="alert">
          <span>{copy.loadError}</span>
          <button type="button" className={styles.secondary} onClick={() => void refresh()}>
            {copy.retry}
          </button>
        </div>
      ) : profiles === null ? (
        <p className={styles.notice}>{copy.loading}</p>
      ) : profiles.length === 0 ? (
        <p className={styles.notice} data-testid="agents-empty">{copy.empty}</p>
      ) : (
        <ul className={styles.grid}>
          {profiles.map((profile) => {
            const runtime = runtimeOf(agents, profile.runtimeId);
            return (
              <li key={profile.id} className={styles.card} data-testid={`agent-card-${profile.id}`}>
                <div className={styles.cardHead}>
                  <span className={styles.avatar} aria-hidden>
                    {profile.emoji || profile.name.slice(0, 1).toUpperCase()}
                  </span>
                  <div className={styles.cardTitles}>
                    <h2 className={styles.cardName}>{profile.name}</h2>
                    {profile.role ? <p className={styles.cardRole}>{profile.role}</p> : null}
                  </div>
                </div>
                <p
                  className={styles.chip}
                  title={runtime ? undefined : copy.runtimeUnavailable}
                  data-unavailable={runtime ? undefined : 'true'}
                >
                  {(runtime?.name ?? profile.runtimeId)} · {modelLabel(agents, profile, copy)}
                </p>
                <p className={styles.activity}>
                  {profile.lastActiveAt
                    ? copy.activeAgo(Math.max(0, Date.now() - profile.lastActiveAt))
                    : copy.noActivity}
                </p>
                <div className={styles.cardActions}>
                  <button
                    type="button"
                    className={styles.primary}
                    data-testid={`agent-open-chat-${profile.id}`}
                    onClick={() => setChatFor(profile)}
                  >
                    {copy.openChat}
                  </button>
                  <button
                    type="button"
                    className={styles.secondary}
                    data-testid={`agent-edit-${profile.id}`}
                    onClick={() => setEditor(profile)}
                  >
                    {copy.edit}
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {editor ? (
        <AgentEditor
          profile={editor === 'new' ? null : editor}
          agents={agents}
          copy={copy}
          onClose={() => setEditor(null)}
          onChanged={() => {
            setEditor(null);
            void refresh();
          }}
        />
      ) : null}

      {chatFor ? (
        <AgentChatDialog
          profile={chatFor}
          projects={projects}
          copy={copy}
          onClose={() => setChatFor(null)}
          onStart={(target) => startChat(chatFor, target)}
        />
      ) : null}
    </section>
  );
}

// ---------------------------------------------------------------------------

function AgentEditor({
  profile,
  agents,
  copy,
  onClose,
  onChanged,
}: {
  profile: AgentProfile | null;
  agents: AgentInfo[];
  copy: AgentsCopy;
  onClose: () => void;
  onChanged: () => void;
}) {
  const ids = useId();
  const usable = useMemo(() => agents.filter((agent) => agent.available), [agents]);
  const [emoji, setEmoji] = useState(profile?.emoji ?? '');
  const [name, setName] = useState(profile?.name ?? '');
  const [role, setRole] = useState(profile?.role ?? '');
  const [runtimeId, setRuntimeId] = useState(profile?.runtimeId ?? usable[0]?.id ?? '');
  const [instructions, setInstructions] = useState(profile?.instructions ?? '');
  const [designSystemId, setDesignSystemId] = useState(profile?.designSystemId ?? '');
  const [skillIds, setSkillIds] = useState<string[]>(profile?.skillIds ?? []);
  const [skills, setSkills] = useState<SkillSummary[] | null>(null);
  const [designSystems, setDesignSystems] = useState<DesignSystemSummary[]>([]);

  useEffect(() => {
    let cancelled = false;
    void fetchSkills().then((list) => {
      if (!cancelled) setSkills(list);
    });
    fetchDesignSystems()
      .then((list) => {
        if (!cancelled) setDesignSystems(list);
      })
      .catch(() => {
        // Optional picker: an unreachable catalog just leaves it on "None".
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const toggleSkill = (id: string) =>
    setSkillIds((current) =>
      current.includes(id) ? current.filter((x) => x !== id) : [...current, id],
    );
  const runtime = runtimeOf(agents, runtimeId);
  const models = useMemo(
    () => (runtime?.models ?? []).filter((model) => model.enabled !== false),
    [runtime],
  );
  const allowCustom = runtime?.supportsCustomModel !== false;
  const initialModel = profile?.model ?? '';
  const initialIsListed = !initialModel || models.some((m) => m.id === initialModel);
  const [modelChoice, setModelChoice] = useState(
    initialIsListed ? initialModel : allowCustom ? CUSTOM_MODEL : '',
  );
  const [customModel, setCustomModel] = useState(initialIsListed ? '' : initialModel);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Runtimes do not share models, so changing the CLI resets the model choice.
  const changeRuntime = (next: string) => {
    setRuntimeId(next);
    setModelChoice('');
    setCustomModel('');
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!name.trim()) return setError(copy.needName);
    if (!runtimeId) return setError(copy.needRuntime);
    const model =
      modelChoice === CUSTOM_MODEL ? customModel.trim() || null : modelChoice || null;
    const input: AgentProfileInput & { name: string; runtimeId: string } = {
      name: name.trim(),
      runtimeId,
      role: role.trim() || null,
      emoji: emoji.trim() || null,
      model,
      instructions: instructions.trim() || null,
      designSystemId: designSystemId || null,
      skillIds,
    };
    setBusy(true);
    setError(null);
    try {
      if (profile) await updateAgentProfile(profile.id, input);
      else await createAgentProfile(input);
      onChanged();
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : copy.saveError);
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!profile || !window.confirm(copy.removeConfirm(profile.name))) return;
    setBusy(true);
    try {
      await deleteAgentProfile(profile.id);
      onChanged();
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : copy.saveError);
      setBusy(false);
    }
  };

  return (
    <div className={styles.scrim} role="presentation" onMouseDown={onClose}>
      <form
        className={styles.dialog}
        role="dialog"
        aria-modal="true"
        aria-label={profile ? copy.editorTitleEdit : copy.editorTitleNew}
        onMouseDown={(event) => event.stopPropagation()}
        onSubmit={(event) => void submit(event)}
      >
        <h2 className={styles.dialogTitle}>
          {profile ? copy.editorTitleEdit : copy.editorTitleNew}
        </h2>

        <div className={styles.row}>
          <label className={styles.field} htmlFor={`${ids}-emoji`}>
            <span>{copy.emojiLabel}</span>
            <input
              id={`${ids}-emoji`}
              className={styles.input}
              value={emoji}
              maxLength={16}
              onChange={(event) => setEmoji(event.target.value)}
            />
          </label>
          <label className={`${styles.field} ${styles.grow}`} htmlFor={`${ids}-name`}>
            <span>{copy.nameLabel}</span>
            <input
              id={`${ids}-name`}
              className={styles.input}
              value={name}
              maxLength={60}
              onChange={(event) => setName(event.target.value)}
            />
          </label>
        </div>

        <label className={styles.field} htmlFor={`${ids}-role`}>
          <span>{copy.roleLabel}</span>
          <input
            id={`${ids}-role`}
            className={styles.input}
            value={role}
            maxLength={160}
            placeholder={copy.rolePlaceholder}
            onChange={(event) => setRole(event.target.value)}
          />
        </label>

        <div className={styles.row}>
          <label className={`${styles.field} ${styles.grow}`} htmlFor={`${ids}-runtime`}>
            <span>{copy.runtimeLabel}</span>
            <select
              id={`${ids}-runtime`}
              className={styles.input}
              value={runtimeId}
              onChange={(event) => changeRuntime(event.target.value)}
            >
              {!usable.some((agent) => agent.id === runtimeId) ? (
                <option value={runtimeId}>{runtime?.name ?? (runtimeId || '—')}</option>
              ) : null}
              {usable.map((agent) => (
                <option key={agent.id} value={agent.id}>
                  {agent.name}
                </option>
              ))}
            </select>
          </label>
          <label className={`${styles.field} ${styles.grow}`} htmlFor={`${ids}-model`}>
            <span>{copy.modelLabel}</span>
            <select
              id={`${ids}-model`}
              className={styles.input}
              value={modelChoice}
              onChange={(event) => setModelChoice(event.target.value)}
            >
              <option value="">{copy.modelDefault}</option>
              {models.map((model) => (
                <option key={model.id} value={model.id}>
                  {model.label}
                </option>
              ))}
              {allowCustom ? <option value={CUSTOM_MODEL}>{copy.modelOther}</option> : null}
            </select>
          </label>
        </div>

        {modelChoice === CUSTOM_MODEL ? (
          <input
            className={styles.input}
            aria-label={copy.modelOther}
            value={customModel}
            placeholder={copy.modelOtherPlaceholder}
            onChange={(event) => setCustomModel(event.target.value)}
          />
        ) : null}

        <label className={styles.field} htmlFor={`${ids}-ds`}>
          <span>{copy.designSystemLabel}</span>
          <select
            id={`${ids}-ds`}
            className={styles.input}
            value={designSystemId}
            onChange={(event) => setDesignSystemId(event.target.value)}
          >
            <option value="">{copy.designSystemNone}</option>
            {designSystemId && !designSystems.some((ds) => ds.id === designSystemId) ? (
              <option value={designSystemId}>{designSystemId}</option>
            ) : null}
            {designSystems.map((ds) => (
              <option key={ds.id} value={ds.id}>
                {ds.title}
              </option>
            ))}
          </select>
        </label>

        <fieldset className={styles.field}>
          <legend>{copy.skillsLabel}</legend>
          {skills === null ? (
            <small className={styles.hint}>{copy.skillsLoading}</small>
          ) : (
            <div className={styles.skillList}>
              {[
                ...skills,
                ...skillIds
                  .filter((id) => !skills.some((skill) => skill.id === id))
                  .map((id) => ({ id, name: id }) as SkillSummary),
              ].map((skill) => (
                <label key={skill.id} className={styles.skillOption}>
                  <input
                    type="checkbox"
                    checked={skillIds.includes(skill.id)}
                    onChange={() => toggleSkill(skill.id)}
                  />
                  <span>{skill.name}</span>
                </label>
              ))}
            </div>
          )}
          <small className={styles.hint}>{copy.skillsHint}</small>
        </fieldset>

        <label className={styles.field} htmlFor={`${ids}-instructions`}>
          <span>{copy.instructionsLabel}</span>
          <textarea
            id={`${ids}-instructions`}
            className={`${styles.input} ${styles.textarea}`}
            value={instructions}
            maxLength={8000}
            rows={6}
            placeholder={copy.instructionsPlaceholder}
            onChange={(event) => setInstructions(event.target.value)}
          />
          <small className={styles.hint}>{copy.instructionsHint}</small>
        </label>

        {error ? <p className={styles.error} role="alert">{error}</p> : null}

        <div className={styles.dialogActions}>
          {profile ? (
            <button
              type="button"
              className={styles.danger}
              disabled={busy}
              onClick={() => void remove()}
            >
              {copy.remove}
            </button>
          ) : null}
          <span className={styles.spacer} />
          <button type="button" className={styles.secondary} disabled={busy} onClick={onClose}>
            {copy.cancel}
          </button>
          <button type="submit" className={styles.primary} disabled={busy}>
            {busy ? copy.saving : copy.save}
          </button>
        </div>
      </form>
    </div>
  );
}

// ---------------------------------------------------------------------------

function AgentChatDialog({
  profile,
  projects,
  copy,
  onClose,
  onStart,
}: {
  profile: AgentProfile;
  projects: Project[];
  copy: AgentsCopy;
  onClose: () => void;
  onStart: (target: string) => Promise<void>;
}) {
  const id = useId();
  const ordered = useMemo(
    () => [...projects].sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0)),
    [projects],
  );
  const [target, setTarget] = useState(ordered[0]?.id ?? NEW_PROJECT);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const start = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await onStart(target);
    } catch {
      setError(copy.chatError);
      setBusy(false);
    }
  };

  return (
    <div className={styles.scrim} role="presentation" onMouseDown={onClose}>
      <form
        className={styles.dialog}
        role="dialog"
        aria-modal="true"
        aria-label={copy.chatTitle(profile.name)}
        onMouseDown={(event) => event.stopPropagation()}
        onSubmit={(event) => void start(event)}
      >
        <h2 className={styles.dialogTitle}>{copy.chatTitle(profile.name)}</h2>
        <label className={styles.field} htmlFor={`${id}-project`}>
          <span>{copy.chatProjectLabel}</span>
          <select
            id={`${id}-project`}
            className={styles.input}
            value={target}
            onChange={(event) => setTarget(event.target.value)}
          >
            {ordered.map((project) => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
            <option value={NEW_PROJECT}>{copy.chatNewProject}</option>
          </select>
        </label>
        {error ? <p className={styles.error} role="alert">{error}</p> : null}
        <div className={styles.dialogActions}>
          <span className={styles.spacer} />
          <button type="button" className={styles.secondary} disabled={busy} onClick={onClose}>
            {copy.cancel}
          </button>
          <button type="submit" className={styles.primary} disabled={busy}>
            {busy ? copy.chatStarting : copy.chatStart}
          </button>
        </div>
      </form>
    </div>
  );
}
