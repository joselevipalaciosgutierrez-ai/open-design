/**
 * The colours of the assistant's aura. The person picks one; the aura blends it
 * with a close neighbour so the glow has depth instead of one flat tint.
 */

/** The colour a custom aura starts from. */
export const DEFAULT_AURA_COLOR = '#ff4fa3';

/**
 * The aura blends three tones. Each preset names them: a main colour, a second
 * that it drifts into, and a deep one at the edge. `siri` is the default.
 */
export type AuraPresetId = 'siri' | 'neon' | 'ocean' | 'sunset';
export type AuraTones = readonly [string, string, string];

export const AURA_PRESETS: Record<AuraPresetId, AuraTones> = {
  siri: ['#ff4fa3', '#4cc2ff', '#7a4dff'],
  neon: ['#00ff08', '#00fbff', '#0a8f4a'],
  ocean: ['#3d8bff', '#5eead4', '#1d2f9a'],
  sunset: ['#ff7a45', '#ff4fa3', '#7a2bd1'],
};
export const AURA_PRESET_IDS = Object.keys(AURA_PRESETS) as AuraPresetId[];
export const DEFAULT_AURA_PRESET: AuraPresetId | 'custom' = 'siri';

export function normalizeAuraPreset(value: unknown): AuraPresetId | 'custom' {
  return value === 'custom' || (typeof value === 'string' && value in AURA_PRESETS)
    ? (value as AuraPresetId | 'custom')
    : DEFAULT_AURA_PRESET;
}

export function normalizeAuraColor(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const v = value.trim().toLowerCase();
  return /^#[0-9a-f]{6}$/.test(v) ? v : null;
}

function hexToHsl(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  const r = ((n >> 16) & 255) / 255;
  const g = ((n >> 8) & 255) / 255;
  const b = (n & 255) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  if (d === 0) return [0, 0, l];
  const s = d / (1 - Math.abs(2 * l - 1));
  let h: number;
  if (max === r) h = ((g - b) / d) % 6;
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return [(h * 60 + 360) % 360, s, l];
}

function hslToHex(h: number, s: number, l: number): string {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  const [r, g, b] =
    h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  const to = (v: number) => Math.round((v + m) * 255).toString(16).padStart(2, '0');
  return `#${to(r)}${to(g)}${to(b)}`;
}

/** The aura's two tones: the chosen colour and a neighbour 60 degrees along the wheel (neon green becomes the app's cyan). */
export function auraPalette(color: string | null | undefined): { primary: string; secondary: string } {
  const primary = normalizeAuraColor(color) ?? DEFAULT_AURA_COLOR;
  const [h, s, l] = hexToHsl(primary);
  // A white or grey choice has no hue to shift: keep the glow neutral.
  const secondary = s < 0.08 ? primary : hslToHex((h + 60) % 360, Math.min(1, s), Math.min(0.75, l));
  return { primary, secondary };
}

/**
 * The three tones to draw: a preset's own, or, for a custom colour, that colour
 * with a neighbour 60 degrees along the wheel and a deeper shade at the edge.
 */
export function resolveAuraTones(
  preset: string | null | undefined,
  custom: string | null | undefined,
): AuraTones {
  const id = normalizeAuraPreset(preset);
  if (id !== 'custom') return AURA_PRESETS[id];
  const { primary, secondary } = auraPalette(custom);
  const [h, s, l] = hexToHsl(primary);
  const deep = s < 0.08 ? primary : hslToHex((h + 300) % 360, Math.min(1, s), Math.max(0.3, l * 0.6));
  return [primary, secondary, deep];
}
