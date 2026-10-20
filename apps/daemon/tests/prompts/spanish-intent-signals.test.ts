import { describe, expect, it } from 'vitest';

import {
  detectDeckIntentSignal,
  detectMediaIntentSignal,
  detectPlatformIntentSignal,
} from '../../src/prompts/system.js';

describe('intent signals in Spanish', () => {
  it('see a deck brief, with or without accents', () => {
    expect(detectDeckIntentSignal('hazme una presentación para inversores')).toBe(true);
    expect(detectDeckIntentSignal('una presentacion de 10 diapositivas')).toBe(true);
    expect(detectDeckIntentSignal('un carrusel para Instagram')).toBe(true);
  });

  it('see media, including accented plurals', () => {
    expect(detectMediaIntentSignal('genera unas imágenes del producto')).toBe(true);
    expect(detectMediaIntentSignal('quiero un vídeo corto')).toBe(true);
    expect(detectMediaIntentSignal('una foto de portada')).toBe(true);
    expect(detectMediaIntentSignal('ponle música de fondo')).toBe(true);
    expect(detectMediaIntentSignal('una ilustración para el hero')).toBe(true);
  });

  it('see a delivery platform', () => {
    expect(detectPlatformIntentSignal('una app para el móvil')).toBe(true);
    expect(detectPlatformIntentSignal('que sea responsiva y multiplataforma')).toBe(true);
  });

  it('stay quiet on ordinary design requests', () => {
    const plain = 'cambia el color del botón a verde y centra el título';
    expect(detectDeckIntentSignal(plain)).toBe(false);
    expect(detectMediaIntentSignal(plain)).toBe(false);
    expect(detectPlatformIntentSignal(plain)).toBe(false);
  });

  it('do not match inside longer words', () => {
    expect(detectMediaIntentSignal('fotosíntesis')).toBe(false);
    expect(detectPlatformIntentSignal('automóviles')).toBe(false);
    expect(detectDeckIntentSignal('representación')).toBe(false);
  });
});
