/**
 * Turns a chat reply into something worth saying out loud: no code, links,
 * markdown or emoji, with a breath after greetings, and short enough to listen
 * to. The full reply stays in the chat.
 */

export function cleanTextForSpeech(input: string, lang = 'es'): string {
  if (!input) return '';
  const es = !lang.toLowerCase().startsWith('en');
  let text = input;
  // The host's own markers (mode switches, done keys) are not words.
  text = text.replace(/<od-[a-z-]+[^>]*>[\s\S]*?<\/od-[a-z-]+>/gi, ' ');
  text = text.replace(/<od-[a-z-]+[^>]*\/>/gi, ' ');
  text = text.replace(/```[a-zA-Z0-9_-]*\n?[\s\S]*?```/g, es ? ' ... el código está en el chat. ' : ' ... the code is in the chat. ');
  text = text.replace(/`([^`]+)`/g, '$1');
  text = text.replace(/!\[[^\]]*\]\([^)]*\)/g, ' ');
  text = text.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');
  text = text.replace(/https?:\/\/\S+/g, es ? 'el enlace' : 'the link');
  text = text.replace(/(\*\*|__)(.*?)\1/g, '$2');
  text = text.replace(/(\*|_)(.*?)\1/g, '$2');
  text = text.replace(/~~(.*?)~~/g, '$1');
  text = text.replace(/^#{1,6}\s+/gm, '');
  text = text.replace(/^>\s+/gm, '');
  text = text.replace(/^\s*\|.*\|\s*$/gm, ' ');
  text = text.replace(/^\s*[-*•]\s+/gm, ', ');
  text = text.replace(/^\s*\d+\.\s+/gm, ', ');
  text = text.replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/gu, '');
  text = text.replace(/^(¡?hola!?[,.]?|buenos días[,.]?|buenas tardes[,.]?|buenas noches[,.]?|hello[,.!]?|hi[,.!]?)\s*/i, '$1 ... ');
  text = text.replace(/\s+/g, ' ').trim();
  text = text.replace(/(,\s*){2,}/g, ', ').replace(/^,\s*/, '');
  text = text.replace(/\.{4,}/g, '...');
  return text;
}

/** The first sentences that fit in `maxChars`, plus a pointer to the chat if cut. */
export function speakableSummary(input: string, options: { maxChars?: number; lang?: string } = {}): string {
  const lang = options.lang ?? 'es';
  const max = options.maxChars ?? 420;
  const clean = cleanTextForSpeech(input, lang);
  if (clean.length <= max) return clean;
  const slice = clean.slice(0, max);
  const cut = Math.max(slice.lastIndexOf('. '), slice.lastIndexOf('? '), slice.lastIndexOf('! '), slice.lastIndexOf('... '));
  const head = (cut > max * 0.4 ? slice.slice(0, cut + 1) : slice.replace(/\s+\S*$/, '')).trim();
  const tail = lang.toLowerCase().startsWith('en') ? ' The rest is in the chat.' : ' El resto está en el chat.';
  return `${head}${/[.!?…]$/.test(head) ? '' : '.'}${tail}`;
}
