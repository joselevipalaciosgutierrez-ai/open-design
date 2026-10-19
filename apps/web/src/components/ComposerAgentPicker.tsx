// Composer footer "Agentes" picker — sits next to the mode picker and reuses its
// chip and menu styles (`.composer-mode*`) so it reads as part of the same bar.
//
// Pick one agent profile or none. The host owns the value: the project chat
// stores it on the conversation, Home carries it into the first conversation of
// the project it creates. Either way the daemon applies the profile's runtime,
// model, instructions, skills and design system when the run is created.
import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from 'react';
import { createPortal } from 'react-dom';
import type { AgentProfile } from '@open-design/contracts';
import { useI18n } from '../i18n';
import { navigate } from '../router';
import { listAgentProfiles } from '../state/agent-profiles';
import { getAgentsCopy } from './agents/agents-copy';
import { Icon } from './Icon';
import styles from './ComposerAgentPicker.module.css';

const MENU_WIDTH = 300;
const MENU_MARGIN = 12;
const MENU_GAP = 8;
const MENU_EST_HEIGHT = 260;

export interface ComposerAgentPickerProps {
  /** Selected agent profile id, or null for no agent. */
  value: string | null;
  onChange: (agentProfileId: string | null) => void;
}

function profileLabel(profile: AgentProfile): string {
  return [profile.emoji, profile.name].filter(Boolean).join(' ');
}

export function ComposerAgentPicker({ value, onChange }: ComposerAgentPickerProps) {
  const { locale } = useI18n();
  const copy = useMemo(() => getAgentsCopy(locale), [locale]);
  const [profiles, setProfiles] = useState<AgentProfile[]>([]);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<CSSProperties | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  // Refetched on every open so an agent created a moment ago is already there.
  useEffect(() => {
    let cancelled = false;
    listAgentProfiles()
      .then((list) => {
        if (!cancelled) setProfiles(list);
      })
      .catch(() => {
        // The picker degrades to an empty list; the Agents screen shows the error.
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  // Same auto-flip as the mode picker: below the trigger when there is room
  // (Home), above it when the composer is docked at the bottom (project chat).
  useLayoutEffect(() => {
    if (!open) {
      setPos(null);
      return;
    }
    const update = () => {
      const rect = triggerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const vw = window.innerWidth || document.documentElement.clientWidth || 1024;
      const vh = window.innerHeight || document.documentElement.clientHeight || 768;
      const width = Math.min(MENU_WIDTH, Math.max(0, vw - MENU_MARGIN * 2));
      const left = Math.min(
        Math.max(MENU_MARGIN, rect.left),
        Math.max(MENU_MARGIN, vw - MENU_MARGIN - width),
      );
      const spaceBelow = vh - rect.bottom - MENU_MARGIN;
      const spaceAbove = rect.top - MENU_GAP - MENU_MARGIN;
      if (spaceBelow >= MENU_EST_HEIGHT || spaceBelow >= spaceAbove) {
        const top = rect.bottom + MENU_GAP;
        setPos({ left, top, width, maxHeight: Math.max(0, vh - top - MENU_MARGIN) });
      } else {
        const bottom = Math.max(MENU_MARGIN, vh - rect.top + MENU_GAP);
        setPos({ left, bottom, width, maxHeight: Math.max(0, spaceAbove) });
      }
    };
    update();
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: MouseEvent) => {
      const target = event.target as Node;
      if (rootRef.current?.contains(target)) return;
      if (menuRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const selected = value ? (profiles.find((p) => p.id === value) ?? null) : null;
  const hasValue = Boolean(value);

  return (
    <div
      className={`composer-mode ${styles.root}${hasValue ? ' is-selected' : ''}`}
      ref={rootRef}
    >
      <button
        ref={triggerRef}
        type="button"
        className={`composer-mode__trigger${open ? ' is-open' : ''}${hasValue ? ' is-selected' : ''}`}
        data-testid="composer-agent-trigger"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        title={selected?.role ?? copy.switcherTitle}
      >
        <span className="composer-mode__icon" aria-hidden>
          {selected?.emoji ? (
            <span className="composer-mode__emoji">{selected.emoji}</span>
          ) : (
            <Icon name="users" size={16} />
          )}
        </span>
        <span className="composer-mode__label">
          {selected ? selected.name : hasValue ? '…' : copy.switcherLabel}
        </span>
      </button>
      {hasValue ? (
        <button
          type="button"
          className="composer-mode__clear"
          data-testid="composer-agent-clear"
          aria-label={copy.switcherClear}
          title={copy.switcherClear}
          onClick={() => onChange(null)}
        >
          <Icon name="close" size={16} strokeWidth={2.2} />
        </button>
      ) : null}
      {open && typeof document !== 'undefined'
        ? createPortal(
            <div
              ref={menuRef}
              className="composer-mode-menu"
              role="menu"
              style={pos ?? undefined}
              data-testid="composer-agent-menu"
            >
              {profiles.length === 0 ? (
                <div className="composer-mode-menu__desc">{copy.switcherEmpty}</div>
              ) : null}
              {hasValue ? (
                <button
                  type="button"
                  role="menuitemradio"
                  aria-checked={false}
                  className="composer-mode-menu__item"
                  data-testid="composer-agent-default"
                  onClick={() => {
                    setOpen(false);
                    onChange(null);
                  }}
                >
                  <span className="composer-mode-menu__head">
                    <span className="composer-mode-menu__name">{copy.switcherNone}</span>
                  </span>
                  <span className="composer-mode-menu__desc">{copy.switcherNoneHint}</span>
                </button>
              ) : null}
              {profiles.map((profile) => (
                <button
                  key={profile.id}
                  type="button"
                  role="menuitemradio"
                  aria-checked={value === profile.id}
                  className={`composer-mode-menu__item${value === profile.id ? ' is-selected' : ''}`}
                  data-testid={`composer-agent-option-${profile.id}`}
                  onClick={() => {
                    setOpen(false);
                    if (profile.id !== value) onChange(profile.id);
                  }}
                >
                  <span className="composer-mode-menu__head">
                    <span className="composer-mode-menu__name">{profileLabel(profile)}</span>
                    {value === profile.id ? (
                      <span className="composer-mode-menu__check" aria-hidden>
                        <Icon name="check" size={16} />
                      </span>
                    ) : null}
                  </span>
                  <span className="composer-mode-menu__desc">
                    {[profile.role, profile.runtimeId].filter(Boolean).join(' · ')}
                  </span>
                </button>
              ))}
              <button
                type="button"
                role="menuitem"
                className="composer-mode-menu__item"
                data-testid="composer-agent-all"
                onClick={() => {
                  setOpen(false);
                  navigate({ kind: 'home', view: 'agents' });
                }}
              >
                <span className="composer-mode-menu__head">
                  <span className="composer-mode-menu__name">{copy.switcherAll}</span>
                </span>
              </button>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
