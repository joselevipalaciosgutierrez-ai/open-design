import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import type { AgentInfo } from '../../types';
import { AgentIcon } from '../AgentIcon';
import { Icon } from '../Icon';
import { useAgentsCopy } from './use-agents-copy';

const MENU_WIDTH = 260;
const MENU_MARGIN = 12;
const MENU_GAP = 8;
const MENU_EST_HEIGHT = 260;

/**
 * The list of local coding-agent CLIs, opened by holding the model chip. The
 * chip itself only switches the model of the current CLI; this is the way to
 * change the CLI without going through Settings. Styled with the composer
 * mode picker's menu classes so it reads as part of the same family.
 */
export function CliPickerMenu({
  anchor,
  agents,
  currentAgentId,
  onSelect,
  onClose,
}: {
  anchor: HTMLElement | null;
  agents: AgentInfo[];
  currentAgentId: string | null | undefined;
  onSelect: (agentId: string) => void;
  onClose: () => void;
}) {
  const copy = useAgentsCopy();
  const [pos, setPos] = useState<CSSProperties | null>(null);
  // Only CLIs that are installed: the registry lists dozens, and offering the
  // ones that cannot run just buries the few that can. Installing or rescanning
  // stays in Settings.
  const installed = useMemo(() => agents.filter((agent) => agent.available), [agents]);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useLayoutEffect(() => {
    const rect = anchor?.getBoundingClientRect();
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
  }, [anchor]);

  useEffect(() => {
    const onPointer = (event: MouseEvent) => {
      const target = event.target as Node;
      if (menuRef.current?.contains(target)) return;
      onClose();
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  if (typeof document === 'undefined') return null;
  return createPortal(
    <div
      ref={menuRef}
      className="composer-mode-menu"
      role="menu"
      style={pos ?? undefined}
      data-testid="cli-picker-menu"
    >
      <div className="composer-mode-menu__desc">{copy.cliMenuTitle}</div>
      {installed.length === 0 ? (
        <div className="composer-mode-menu__desc">{copy.cliNoneInstalled}</div>
      ) : null}
      {installed.map((agent) => {
        const selected = agent.id === currentAgentId;
        return (
          <button
            key={agent.id}
            type="button"
            role="menuitemradio"
            aria-checked={selected}
            className={`composer-mode-menu__item${selected ? ' is-selected' : ''}`}
            data-testid={`cli-picker-option-${agent.id}`}
            onClick={() => {
              onSelect(agent.id);
              onClose();
            }}
          >
            <span className="composer-mode-menu__head">
              <span className="composer-mode-menu__icon" aria-hidden>
                <AgentIcon id={agent.id} size={18} />
              </span>
              <span className="composer-mode-menu__name">{agent.name}</span>
              {selected ? (
                <span className="composer-mode-menu__check" aria-hidden>
                  <Icon name="check" size={16} />
                </span>
              ) : null}
            </span>
          </button>
        );
      })}
    </div>,
    document.body,
  );
}
