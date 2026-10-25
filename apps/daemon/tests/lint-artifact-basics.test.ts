import { describe, expect, it } from 'vitest';

import { lintArtifact } from '../src/lint-artifact.js';

const ids = (html: string) => lintArtifact(html).map((f) => f.id);

const CLEAN = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<style>
  a:hover, button:hover { opacity: .9 }
  a:focus-visible, button:focus-visible, input:focus-visible { outline: 2px solid #111; outline-offset: 2px }
  .card { transition: transform .2s }
  @media (prefers-reduced-motion: reduce) { .card { transition: none } }
</style></head>
<body><main><h1>Ember &amp; Oak</h1>
<img src="a.jpg" alt="Roaster at work">
<label for="mail">Email</label><input id="mail" type="email">
<label>Name <input type="text"></label>
<button>Subscribe</button>
<button aria-label="Close"><svg></svg></button>
<a href="#menu">Menu</a>
</main></body></html>`;

const NEW_IDS = ['no-viewport-meta', 'no-lang', 'img-no-alt', 'unnamed-control', 'input-no-label', 'no-h1', 'no-focus-style', 'outline-removed', 'no-reduced-motion', 'no-hover-state'];

describe('usability basics', () => {
  it('a clean, complete page raises none of the new findings', () => {
    const got = ids(CLEAN).filter((id) => NEW_IDS.includes(id));
    expect(got).toEqual([]);
  });

  it('flags a page with no viewport meta and no lang, as P1 and P2', () => {
    const html = CLEAN.replace(/<meta name="viewport"[^>]*>/, '').replace(' lang="en"', '');
    const f = lintArtifact(html);
    expect(f.find((x) => x.id === 'no-viewport-meta')?.severity).toBe('P1');
    expect(f.find((x) => x.id === 'no-lang')?.severity).toBe('P2');
  });

  it('does not ask a fragment for a viewport, lang or h1', () => {
    const got = ids('<section><p>Just a block</p></section>');
    for (const id of ['no-viewport-meta', 'no-lang', 'no-h1', 'no-focus-style', 'no-reduced-motion', 'no-hover-state']) expect(got).not.toContain(id);
  });

  it('flags an image with no alt, but accepts alt=""', () => {
    expect(ids(CLEAN.replace('alt="Roaster at work"', ''))).toContain('img-no-alt');
    expect(ids(CLEAN.replace('alt="Roaster at work"', 'alt=""'))).not.toContain('img-no-alt');
  });

  it('flags a button or link with no text and no accessible name', () => {
    expect(ids(CLEAN.replace('<button aria-label="Close"><svg></svg></button>', '<button><svg></svg></button>'))).toContain('unnamed-control');
    expect(ids(CLEAN.replace('<a href="#menu">Menu</a>', '<a href="#menu"><svg></svg></a>'))).toContain('unnamed-control');
    expect(ids(CLEAN.replace('<button>Subscribe</button>', '<button><span class="sr-only">Subscribe</span></button>'))).not.toContain('unnamed-control');
  });

  it('flags an input with no label, accepts wrapping label, for/id, aria-label and hidden inputs', () => {
    expect(ids(CLEAN.replace('<label for="mail">Email</label>', ''))).toContain('input-no-label');
    expect(ids(CLEAN.replace('<label for="mail">Email</label><input id="mail" type="email">', '<input type="email" aria-label="Email">'))).not.toContain('input-no-label');
    expect(ids(CLEAN.replace('<button>Subscribe</button>', '<input type="hidden" name="t" value="1"><input type="submit" value="Go">'))).not.toContain('input-no-label');
  });

  it('flags a page with no h1', () => {
    expect(ids(CLEAN.replace('<h1>Ember &amp; Oak</h1>', '<h2>Ember</h2>'))).toContain('no-h1');
  });

  it('flags removed outlines with no focus-visible replacement, and missing focus styles', () => {
    const noFocus = CLEAN.replace(/a:focus-visible[^}]*}/, '');
    expect(ids(noFocus)).toContain('no-focus-style');
    const removed = noFocus.replace('<style>', '<style> button { outline: none }');
    expect(ids(removed)).toContain('outline-removed');
    expect(ids(CLEAN.replace('<style>', '<style> button { outline: none }'))).not.toContain('outline-removed');
  });

  it('flags motion without a reduced-motion rule, and links with no hover state', () => {
    const noRm = CLEAN.replace(/@media \(prefers-reduced-motion[^}]*}[^}]*}/, '');
    expect(ids(noRm)).toContain('no-reduced-motion');
    expect(ids(CLEAN.replace(/a:hover, button:hover \{[^}]*\}/, ''))).toContain('no-hover-state');
  });

  it('keeps severities advisory except the ones that block use', () => {
    const bad = lintArtifact('<html><body><img src="x"><button></button><input type="text"></body></html>');
    for (const id of ['img-no-alt', 'unnamed-control', 'input-no-label']) expect(bad.find((f) => f.id === id)?.severity).toBe('P1');
    expect(bad.some((f) => NEW_IDS.includes(f.id) && f.severity === 'P0')).toBe(false);
  });

  it('every new finding says how to fix it', () => {
    const bad = lintArtifact('<html><body><img src="x"><button></button><input type="text"><a href="#"><svg></svg></a></body></html>');
    for (const f of bad.filter((x) => NEW_IDS.includes(x.id))) expect(f.fix.length).toBeGreaterThan(20);
  });

  it('does not read tags written inside CSS comments, style rules or scripts', () => {
    const html = CLEAN.replace('<style>', '<style>\n/* height:auto beats an <img height="x"> attribute; <button></button> too */')
      .replace('</body>', '<script>const tpl = \'<img src="a"><button></button><input type="text">\';</script></body>');
    const got = ids(html);
    for (const id of ['img-no-alt', 'unnamed-control', 'input-no-label']) expect(got).not.toContain(id);
  });

  it('does not take a CSS comment for a focus, hover or motion rule', () => {
    const bare = '<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width"><style>/* a:hover a:focus-visible prefers-reduced-motion */ a { transition: color .2s }</style></head><body><h1>T</h1><a href="#x">Go</a></body></html>';
    const got = ids(bare);
    expect(got).toContain('no-focus-style');
    expect(got).toContain('no-hover-state');
    expect(got).toContain('no-reduced-motion');
  });

  it('skips the CSS-based checks when the styles live in a file it cannot read, but not for web fonts', () => {
    const bare = '<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width">LINK</head><body><h1>T</h1><a href="#x">Go</a></body></html>';
    const local = ids(bare.replace('LINK', '<link rel="stylesheet" href="styles.css">'));
    for (const id of ['no-focus-style', 'no-hover-state', 'no-reduced-motion', 'outline-removed']) expect(local).not.toContain(id);
    const fonts = ids(bare.replace('LINK', '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter">'));
    expect(fonts).toContain('no-focus-style');
  });

  it('does not take an <html> written inside a script string for the page element', () => {
    const fragment = '<section><p>Block</p><script>const t = "<html><body></body></html>";</script></section>';
    const got = ids(fragment);
    for (const id of ['no-viewport-meta', 'no-lang', 'no-h1']) expect(got).not.toContain(id);
  });
});
