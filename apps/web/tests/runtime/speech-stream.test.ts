import { describe, expect, it } from 'vitest';

import { createSpeechStream } from '../../src/runtime/assistant/speech-stream';

describe('createSpeechStream', () => {
  it('hands out each sentence as soon as it is finished', () => {
    const s = createSpeechStream({ lang: 'es' });
    // A greeting gets a breath after it.
    expect(s.push('¡Hola! Todo muy bi', false)).toEqual(['¡Hola! ...']);
    expect(s.push('¡Hola! Todo muy bien por aquí. ¿Qué', false)).toEqual(['Todo muy bien por aquí.']);
    expect(s.push('¡Hola! Todo muy bien por aquí. ¿Qué diseñamos hoy?', true)).toEqual(['¿Qué diseñamos hoy?']);
    expect(s.push('¡Hola! Todo muy bien por aquí. ¿Qué diseñamos hoy?', true)).toEqual([]);
  });

  it('does not cut a number or a period still being typed', () => {
    const s = createSpeechStream();
    expect(s.push('Cuesta 3.5 dólares.', false)).toEqual([]);
    expect(s.push('Cuesta 3.5 dólares. Y', false)).toEqual(['Cuesta 3.5 dólares.']);
  });

  it('waits for a code block to close and never reads the code', () => {
    const s = createSpeechStream();
    expect(s.push('Mira esto. ```js\nconst a = 1. b', false)).toEqual(['Mira esto.']);
    const rest = s.push('Mira esto. ```js\nconst a = 1. b\n``` Listo.', true).join(' ');
    expect(rest).not.toContain('const');
    expect(rest).toMatch(/Listo\.$/);
  });

  it('says the start of a long answer and points to the chat for the rest', () => {
    const s = createSpeechStream({ lang: 'es', maxChars: 80 });
    const long = 'Primera frase bastante larga para llenar espacio. Segunda frase que también ocupa mucho sitio. Tercera.';
    const pieces = s.push(long, true);
    expect(pieces.join(' ')).toMatch(/El resto está en el chat\.$/);
    expect(s.push(`${long} Más.`, true)).toEqual([]);
  });
});
