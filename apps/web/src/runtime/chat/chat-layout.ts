import type { ChatSessionMode } from '@open-design/contracts';

/**
 * Whether the project page shows only the chat (no workspace column).
 *
 * Ask conversations are a chat of their own, so the design workspace stays out
 * of the way. Opening a file from the chat (a PDF the user attached, a file
 * card) brings the workspace in beside the chat to show it, without changing
 * the conversation's mode: that is what `previewOpen` records. Focus mode hides
 * the chat instead, so it never counts as chat-only.
 */
export function isChatOnlyLayout(input: {
  sessionMode: ChatSessionMode;
  workspaceFocused: boolean;
  previewOpen: boolean;
}): boolean {
  return input.sessionMode === 'chat' && !input.workspaceFocused && !input.previewOpen;
}

/**
 * Whether a request to open a file from the chat should bring the preview in.
 * Only an Ask conversation has a workspace to bring in; in Design and Plan it is
 * already there, and a flag set there would resurface later, on the way back to
 * Ask, as a preview nobody asked for.
 */
export function shouldOpenPreviewForFile(sessionMode: ChatSessionMode): boolean {
  return sessionMode === 'chat';
}
