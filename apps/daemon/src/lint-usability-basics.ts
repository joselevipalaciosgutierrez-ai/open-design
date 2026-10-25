/**
 * Usability checks a script can verify without a browser: the accessibility and
 * state basics a design review keeps finding missing (alt text, control names,
 * labels, focus, reduced motion, viewport). They are structural, so they never
 * judge taste and are cheap enough to run on every artifact.
 *
 * Page-level checks only fire on a whole document (`<html`), so a streamed
 * fragment is not asked for a viewport or a language.
 */

import { HTML_TAG_PATTERNS, endOfTag, findRealTagOffset, type ArtifactLintFinding } from '@open-design/contracts';

const snippet = (text: string) => text.replace(/\s+/g, ' ').trim().slice(0, 120);
const INTERACTIVE_RE = /<(?:button|select|textarea)\b|<a\b[^>]*\bhref\s*=|<input\b(?![^>]*type\s*=\s*["']hidden["'])/i;
const UNLABELLED_EXEMPT_TYPES = new Set(['hidden', 'submit', 'button', 'reset', 'image']);

function attr(tag: string, name: string): string | null {
  const m = new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i').exec(tag);
  return m ? (m[1] ?? m[2] ?? m[3] ?? '') : null;
}

export function lintUsabilityBasics(source: string): ArtifactLintFinding[] {
  const out: ArtifactLintFinding[] = [];
  // The page element is found structurally: an `<html` inside a script string is text.
  const htmlStart = findRealTagOffset(source, HTML_TAG_PATTERNS.htmlOpen);
  const fullDocument = htmlStart >= 0;
  const htmlTag = fullDocument ? source.slice(htmlStart, endOfTag(source, htmlStart) + 1) : '';
  // Tag checks read the markup only: a tag written inside a style rule, a CSS
  // comment or a script string is text, not an element.
  const html = source.replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '');
  const stripCssComments = (text: string) => text.replace(/\/\*[\s\S]*?\*\//g, '');
  const css = stripCssComments(
    [...source.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)].map((m) => m[1]).join('\n')
      + '\n' + [...html.matchAll(/\bstyle\s*=\s*"([^"]*)"/gi)].map((m) => m[1]).join('\n'),
  ).toLowerCase();
  const lower = css;
  // Styles in a file we cannot read: say nothing about focus, hover or motion.
  const externalCss = [...html.matchAll(/<link\b[^>]*>/gi)].some((m) => /rel\s*=\s*["']?stylesheet/i.test(m[0]) && !/fonts\.(?:googleapis|gstatic)\.com/i.test(m[0]));

  if (fullDocument && !/<meta\b[^>]*name\s*=\s*["']viewport["']/i.test(html)) {
    out.push({
      severity: 'P1', id: 'no-viewport-meta',
      message: 'The page has no <meta name="viewport">, so phones render it at desktop width.',
      fix: 'Add <meta name="viewport" content="width=device-width, initial-scale=1"> to the <head>.',
    });
  }
  if (fullDocument && attr(htmlTag, 'lang') === null) {
    out.push({
      severity: 'P2', id: 'no-lang',
      message: 'The <html> element has no lang attribute.',
      fix: 'Set lang on <html> to the page language, for example <html lang="en">.',
    });
  }

  const noAlt = (html.match(/<img\b[^>]*>/gi) ?? []).filter((tag) => attr(tag, 'alt') === null);
  if (noAlt.length > 0) {
    out.push({
      severity: 'P1', id: 'img-no-alt',
      message: `${noAlt.length} <img> without an alt attribute.`,
      fix: 'Give every image alt text that says what it shows, or alt="" when it is purely decorative.',
      snippet: snippet(noAlt[0]!),
    });
  }

  const unnamed: string[] = [];
  for (const m of html.matchAll(/<(button|a)\b([^>]*)>([\s\S]*?)<\/\1>/gi)) {
    const [whole, tagName, attrs, inner] = [m[0], m[1]!.toLowerCase(), m[2] ?? '', m[3] ?? ''];
    if (tagName === 'a' && attr(attrs, 'href') === null) continue;
    const named = attr(attrs, 'aria-label') || attr(attrs, 'aria-labelledby') || attr(attrs, 'title');
    const text = inner.replace(/<[^>]*>/g, '').replace(/&nbsp;|\s+/g, '').trim();
    if (!named && text === '') unnamed.push(whole);
  }
  if (unnamed.length > 0) {
    out.push({
      severity: 'P1', id: 'unnamed-control',
      message: `${unnamed.length} button or link with no text and no accessible name (icon-only controls need one).`,
      fix: 'Add aria-label="what it does" to icon-only buttons and links, or include visually hidden text inside them.',
      snippet: snippet(unnamed[0]!),
    });
  }

  const labelRanges = [...html.matchAll(/<label\b[\s\S]*?<\/label>/gi)].map((m) => [m.index ?? 0, (m.index ?? 0) + m[0].length] as const);
  const labelFor = new Set([...html.matchAll(/<label\b[^>]*\bfor\s*=\s*["']([^"']+)["']/gi)].map((m) => m[1]));
  const unlabelled: string[] = [];
  for (const m of html.matchAll(/<(input|select|textarea)\b([^>]*)>/gi)) {
    const attrs = m[2] ?? '';
    const type = (attr(attrs, 'type') ?? 'text').toLowerCase();
    if (m[1]!.toLowerCase() === 'input' && UNLABELLED_EXEMPT_TYPES.has(type)) continue;
    const at = m.index ?? 0;
    const inside = labelRanges.some(([from, to]) => at > from && at < to);
    const id = attr(attrs, 'id');
    const named = attr(attrs, 'aria-label') || attr(attrs, 'aria-labelledby') || attr(attrs, 'title');
    if (!inside && !named && !(id && labelFor.has(id))) unlabelled.push(m[0]);
  }
  if (unlabelled.length > 0) {
    out.push({
      severity: 'P1', id: 'input-no-label',
      message: `${unlabelled.length} form field with no label (a placeholder is not a label).`,
      fix: 'Give each field a <label for="id">, wrap it in a <label>, or add aria-label.',
      snippet: snippet(unlabelled[0]!),
    });
  }

  if (fullDocument && !/<h1\b/i.test(html)) {
    out.push({
      severity: 'P2', id: 'no-h1',
      message: 'The page has no <h1>.',
      fix: 'Use one <h1> for the page title so the heading outline starts at the top.',
    });
  }

  const interactive = INTERACTIVE_RE.test(html);
  if (fullDocument && !externalCss && interactive && !/:focus/.test(css)) {
    out.push({
      severity: 'P2', id: 'no-focus-style',
      message: 'Interactive elements exist but no :focus or :focus-visible style is defined.',
      fix: 'Add a visible :focus-visible style (outline or ring) for buttons, links and fields.',
    });
  }
  if (!externalCss && /outline\s*:\s*(?:none|0)\b/.test(css) && !/:focus-visible/.test(css)) {
    out.push({
      severity: 'P1', id: 'outline-removed',
      message: 'An outline is removed and there is no :focus-visible replacement, so keyboard users lose their place.',
      fix: 'Keep the outline, or replace it with a :focus-visible ring of equal visibility.',
    });
  }
  if (fullDocument && !externalCss && /(?:animation\s*:|animation-name\s*:|transition\s*:|@keyframes)/.test(css) && !/prefers-reduced-motion/.test(lower)) {
    out.push({
      severity: 'P2', id: 'no-reduced-motion',
      message: 'The page animates but has no prefers-reduced-motion rule.',
      fix: 'Add @media (prefers-reduced-motion: reduce) that removes or shortens animations and transitions.',
    });
  }
  if (fullDocument && !externalCss && interactive && !/:hover/.test(css)) {
    out.push({
      severity: 'P2', id: 'no-hover-state',
      message: 'Interactive elements have no :hover style.',
      fix: 'Give buttons and links a visible :hover state so they read as clickable.',
    });
  }
  return out;
}
