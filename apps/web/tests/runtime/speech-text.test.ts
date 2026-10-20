import { describe, expect, it } from 'vitest';
import { cleanTextForSpeech, speakableSummary } from '../../src/runtime/assistant/speech-text';

describe('cleanTextForSpeech', () => {
  it('drops code, links, markdown and emoji', () => {
    const out = cleanTextForSpeech(
      'Mira **esto**: `npm test`, [la guía](https://x.dev/a) y https://y.dev 🎉\n```ts\nconst a = 1\n```\n# Título',
    );
    expect(out).not.toMatch(/[`*#]|https?:|const a|🎉/);
    expect(out).toContain('esto');
    expect(out).toContain('la guía');
    expect(out).toContain('el enlace');
    expect(out).toContain('el código está en el chat');
  });

  it('turns lists into pauses and removes host markers and tables', () => {
    const out = cleanTextForSpeech('Listo:\n- uno\n- dos\n1. tres\n| a | b |\n<od-switch-mode>design</od-switch-mode>');
    expect(out).toBe('Listo: , uno , dos , tres');
  });

  it('takes a breath after a greeting, in either language', () => {
    expect(cleanTextForSpeech('Hola, ¿qué tal?')).toContain('Hola, ... ');
    expect(cleanTextForSpeech('Hello there', 'en')).toContain('Hello ... ');
    expect(cleanTextForSpeech('x ```a``` y', 'en')).toContain('the code is in the chat');
  });

  it('is empty for nothing', () => {
    expect(cleanTextForSpeech('')).toBe('');
  });
});

describe('speakableSummary', () => {
  it('leaves a short reply whole', () => {
    expect(speakableSummary('Listo. Quedó guardado.')).toBe('Listo. Quedó guardado.');
  });

  it('cuts a long reply at a sentence and points to the chat', () => {
    const long = Array.from({ length: 30 }, (_, i) => `Esta es la frase número ${i}.`).join(' ');
    const out = speakableSummary(long, { maxChars: 120 });
    expect(out.length).toBeLessThan(160);
    expect(out.endsWith('El resto está en el chat.')).toBe(true);
    expect(out).toMatch(/número \d+\. El resto/);
  });

  it('points to the chat in English too', () => {
    const long = 'One two three four five six seven eight nine ten. '.repeat(20);
    expect(speakableSummary(long, { maxChars: 80, lang: 'en' }).endsWith('The rest is in the chat.')).toBe(true);
  });
});
