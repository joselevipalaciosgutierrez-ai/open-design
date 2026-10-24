import {
  renderChatTurnHostProtocolInstructions,
  renderChatTurnHostProtocolTemplate,
  renderChatTurnKeyLine,
} from '@open-design/contracts';

/**
 * How a chat turn receives its keyed host protocols (done marker, follow-up
 * suggestions, artifact focus).
 *
 * `split` (default) puts the rules in the stable slice, which a resumed session
 * already holds, and sends only the key each turn. `inline` is the old
 * behaviour: the full text every turn, because the key sits inside it.
 * Rollback: `OD_HOST_PROTOCOL=inline`.
 */
export type HostProtocolMode = 'split' | 'inline';

export function resolveHostProtocolMode(raw: string | undefined): HostProtocolMode {
  return raw === 'inline' ? 'inline' : 'split';
}

export function hostProtocolDelivery(input: {
  mode: HostProtocolMode;
  key: string;
  locale: string | undefined;
}): { stable: string; perTurn: string[] } {
  if (!input.key) return { stable: '', perTurn: [] };
  if (input.mode === 'inline') {
    const full = renderChatTurnHostProtocolInstructions(input.key, 'ordinary', input.locale);
    return { stable: '', perTurn: [full.doneMarker, full.nextSteps, full.artifactFocus] };
  }
  return {
    stable: renderChatTurnHostProtocolTemplate(input.locale).text,
    perTurn: [renderChatTurnKeyLine(input.key)],
  };
}
