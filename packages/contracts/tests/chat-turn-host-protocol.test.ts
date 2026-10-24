import { describe, expect, it } from 'vitest';

import {
  HOST_PROTOCOL_KEY_PLACEHOLDER,
  renderChatTurnHostProtocolInstructions,
  renderChatTurnHostProtocolTemplate,
  renderChatTurnKeyLine,
} from '../src/prompts/chat-turn-host-protocol.js';

const KEY = '0123456789abcdef';

describe('chat turn host protocol', () => {
  it('renders the same keyed done, next-step, and focus protocol for ordinary chat', () => {
    const result = renderChatTurnHostProtocolInstructions(KEY);

    expect(result.doneMarker).toContain(`<od-done key="${KEY}"/>`);
    expect(result.nextSteps).toContain(`<od-next key="${KEY}" value="Add an orders list page"/>`);
    expect(result.nextSteps).not.toContain('</od-next>');
    expect(result.artifactFocus).toContain(`<od-focus key="${KEY}"`);
    expect(result.text).not.toContain('OD Next host handoff gate');
  });

  it('gives the planning turn one keyed continuation marker and no other output protocol', () => {
    const result = renderChatTurnHostProtocolInstructions(KEY, 'od_next_request');
    expect(result.text).toContain(`<od-production-ready key="${KEY}" />`);
    expect(result.text).toContain('last');
    expect(result.doneMarker).toBe('');
    expect(result.nextSteps).toBe('');
    expect(result.artifactFocus).toBe('');
  });
  it('describes production completion without requiring retired model state declarations', () => {
    const result = renderChatTurnHostProtocolInstructions(KEY, 'od_next_production');

    expect(result.text).not.toContain('response declares');
    expect(result.text).not.toContain('inputStage=');
    expect(result.text).not.toContain('outcome=');
    expect(result.text).toContain('omit all three protocols');
    expect(result.text).toContain(`<od-next key="${KEY}" value="Add an orders list page"/>`);
    expect(renderChatTurnHostProtocolInstructions('', 'od_next_production')).toEqual({
      doneMarker: '',
      nextSteps: '',
      artifactFocus: '',
      text: '',
    });
  });
});

describe('chat turn host protocol, split into a fixed template and a per-turn key', () => {
  const full = renderChatTurnHostProtocolInstructions(KEY);

  it('keeps every word of the three protocols: template with the key put back is the old text', () => {
    const template = renderChatTurnHostProtocolTemplate();
    const restored = template.text.replaceAll(HOST_PROTOCOL_KEY_PLACEHOLDER, KEY);
    expect(restored).toContain(full.doneMarker);
    expect(restored).toContain(full.nextSteps);
    expect(restored).toContain(full.artifactFocus);
  });

  it('carries the locale rule in the template exactly as the inline text does', () => {
    const inline = renderChatTurnHostProtocolInstructions(KEY, 'ordinary', 'zh-CN');
    const template = renderChatTurnHostProtocolTemplate('zh-CN');
    expect(template.text.replaceAll(HOST_PROTOCOL_KEY_PLACEHOLDER, KEY)).toContain(inline.nextSteps);
  });

  it('never puts a real key in the template, so it can sit in the cached prefix', () => {
    const template = renderChatTurnHostProtocolTemplate();
    expect(template.text).not.toContain(KEY);
    expect(template.text).toContain(`<od-done key="${HOST_PROTOCOL_KEY_PLACEHOLDER}"/>`);
    expect(renderChatTurnHostProtocolTemplate().text).toBe(template.text);
  });

  it('tells the model where this turn\'s key will arrive', () => {
    const template = renderChatTurnHostProtocolTemplate();
    expect(template.text).toMatch(/Turn key:/);
    expect(template.text).toContain(HOST_PROTOCOL_KEY_PLACEHOLDER);
  });

  it('sends only the key each turn, a small fraction of the full protocol', () => {
    const line = renderChatTurnKeyLine(KEY);
    expect(line).toContain(`Turn key: ${KEY}`);
    expect(line.length).toBeLessThan(full.text.length / 8);
    expect(renderChatTurnKeyLine('')).toBe('');
  });
});
