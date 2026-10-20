import { describe, expect, it } from 'vitest';
import {
  AURA_PRESETS,
  AURA_PRESET_IDS,
  DEFAULT_AURA_COLOR,
  DEFAULT_AURA_PRESET,
  auraPalette,
  normalizeAuraColor,
  normalizeAuraPreset,
  resolveAuraTones,
} from '../../src/runtime/assistant/aura-colors';

const HEX = /^#[0-9a-f]{6}$/;

describe('aura colours', () => {
  it('accepts a 6-digit hex and rejects anything else', () => {
    expect(normalizeAuraColor(' #5EEAD4 ')).toBe('#5eead4');
    expect(normalizeAuraColor('#fff')).toBeNull();
    expect(normalizeAuraColor('teal')).toBeNull();
    expect(normalizeAuraColor(undefined)).toBeNull();
  });

  it('pairs a chosen colour with a different neighbour, and keeps white neutral', () => {
    const { primary, secondary } = auraPalette('#5eead4');
    expect(primary).toBe('#5eead4');
    expect(secondary).toMatch(HEX);
    expect(secondary).not.toBe(primary);
    expect(auraPalette('#ffffff')).toEqual({ primary: '#ffffff', secondary: '#ffffff' });
    expect(auraPalette('nope').primary).toBe(DEFAULT_AURA_COLOR);
  });

  it('is Siri by default, with three valid tones in every preset', () => {
    expect(DEFAULT_AURA_PRESET).toBe('siri');
    expect(AURA_PRESET_IDS).toEqual(['siri', 'neon', 'ocean', 'sunset']);
    for (const id of AURA_PRESET_IDS) {
      expect(AURA_PRESETS[id]).toHaveLength(3);
      for (const tone of AURA_PRESETS[id]) expect(tone).toMatch(HEX);
    }
  });

  it('knows a preset when it is named, and falls back to Siri otherwise', () => {
    expect(normalizeAuraPreset('ocean')).toBe('ocean');
    expect(normalizeAuraPreset('custom')).toBe('custom');
    expect(normalizeAuraPreset('rainbow')).toBe('siri');
    expect(normalizeAuraPreset(undefined)).toBe('siri');
  });

  it('draws a preset\'s own tones, or three tones built from a custom colour', () => {
    expect(resolveAuraTones('neon', '#123456')).toEqual(AURA_PRESETS.neon);
    const custom = resolveAuraTones('custom', '#f472b6');
    expect(custom[0]).toBe('#f472b6');
    expect(new Set(custom).size).toBe(3);
    for (const tone of custom) expect(tone).toMatch(HEX);
    expect(resolveAuraTones('custom', '#ffffff')).toEqual(['#ffffff', '#ffffff', '#ffffff']);
  });
});
