import { cleanTextForSpeech } from './speech-text';

/**
 * Reads a reply aloud while it is still being written: each finished sentence
 * is handed out as soon as it lands, instead of waiting for the whole answer
 * (and for the run to close, which can take seconds more).
 */
export interface SpeechStream {
  /**
   * The reply as it stands now. Returns what can be said now, in order (often
   * nothing). Once `done`, the rest is flushed and the stream is finished.
   */
  push(text: string, done: boolean): string[];
}

/** A sentence end followed by a space: `3.5` and a period still being typed do not count. */
const SENTENCE_END = /[.!?…:](?=\s)/g;

export function createSpeechStream(options: { lang?: string; maxChars?: number } = {}): SpeechStream {
  const lang = options.lang ?? 'es';
  const max = options.maxChars ?? 420;
  let consumed = 0;
  let spoken = 0;
  let finished = false;

  return {
    push(text, done) {
      if (finished) return [];
      if (done) finished = true;
      if (text.length < consumed) return [];
      const pending = text.slice(consumed);
      // Code is never read out; wait for a fence to close before cutting.
      const openFence = (pending.match(/```/g)?.length ?? 0) % 2 === 1;
      let cut = -1;
      if (done) {
        cut = pending.length;
      } else {
        // Inside an unclosed code fence nothing is cut; before it, sentences are.
        const searchable = openFence ? pending.slice(0, pending.lastIndexOf('```')) : pending;
        for (const match of searchable.matchAll(SENTENCE_END)) cut = (match.index ?? 0) + 1;
      }
      if (cut <= 0) return [];
      consumed += cut;
      const clean = cleanTextForSpeech(pending.slice(0, cut), lang);
      if (!clean) return [];
      if (spoken + clean.length <= max) {
        spoken += clean.length;
        return [clean];
      }
      // Long answers: say the start, point to the chat for the rest, then stop.
      finished = true;
      const room = Math.max(0, max - spoken);
      const head = room > 60 ? clean.slice(0, room).replace(/\s+\S*$/, '').trim() : '';
      const tail = lang.toLowerCase().startsWith('en') ? 'The rest is in the chat.' : 'El resto está en el chat.';
      return [head ? `${head}${/[.!?…]$/.test(head) ? '' : '.'} ${tail}` : tail];
    },
  };
}
