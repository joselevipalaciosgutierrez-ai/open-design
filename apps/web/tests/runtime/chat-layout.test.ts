import { describe, expect, it } from 'vitest';

import { isChatOnlyLayout, shouldOpenPreviewForFile } from '../../src/runtime/chat/chat-layout';

describe('isChatOnlyLayout', () => {
  const base = { sessionMode: 'chat' as const, workspaceFocused: false, previewOpen: false };

  it('is chat only for an Ask conversation with nothing to preview', () => {
    expect(isChatOnlyLayout(base)).toBe(true);
  });

  it('brings the workspace in while a file is being previewed', () => {
    expect(isChatOnlyLayout({ ...base, previewOpen: true })).toBe(false);
  });

  it('is never chat only in Design or Plan', () => {
    expect(isChatOnlyLayout({ ...base, sessionMode: 'design' })).toBe(false);
    expect(isChatOnlyLayout({ ...base, sessionMode: 'plan' })).toBe(false);
  });

  it('is not chat only in focus mode, which hides the chat instead', () => {
    expect(isChatOnlyLayout({ ...base, workspaceFocused: true })).toBe(false);
  });
});

describe('shouldOpenPreviewForFile', () => {
  it('only an Ask conversation needs the preview brought in', () => {
    expect(shouldOpenPreviewForFile('chat')).toBe(true);
    expect(shouldOpenPreviewForFile('design')).toBe(false);
    expect(shouldOpenPreviewForFile('plan')).toBe(false);
  });
});
