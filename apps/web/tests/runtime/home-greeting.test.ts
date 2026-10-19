import { describe, expect, it } from 'vitest';
import {
  dayPartOf,
  greetingNameOf,
  hasHomeGreeting,
  homeGreeting,
} from '../../src/runtime/home-greeting';

describe('home greeting', () => {
  it('splits the day into morning, afternoon and evening', () => {
    expect([4, 5, 11, 12, 19, 20, 23, 0].map(dayPartOf)).toEqual([
      'evening', 'morning', 'morning', 'afternoon', 'afternoon', 'evening', 'evening', 'evening',
    ]);
  });

  it('greets by the first name, and without a name when there is none', () => {
    expect(greetingNameOf('  Levi Palacios ')).toBe('Levi');
    expect(greetingNameOf('')).toBeNull();
    expect(greetingNameOf(undefined)).toBeNull();
    expect(homeGreeting({ locale: 'es-ES', hour: 15, name: 'Levi Palacios', seed: 0 }).heading).toBe('Buenas tardes, Levi');
    expect(homeGreeting({ locale: 'es-ES', hour: 15, name: null, seed: 0 }).heading).toBe('Buenas tardes');
    expect(homeGreeting({ locale: 'en', hour: 8, name: 'Levi', seed: 0 }).heading).toBe('Good morning, Levi');
  });

  it('is stable for a seed and never stacks two questions', () => {
    const a = homeGreeting({ locale: 'es', hour: 9, name: 'Levi', seed: 2 });
    expect(a).toEqual(homeGreeting({ locale: 'es', hour: 9, name: 'Levi', seed: 2 }));
    expect(a.heading).toBe('¿Qué haremos hoy, Levi?');
    expect(a.subtitle.startsWith('¿')).toBe(false);
    const bare = homeGreeting({ locale: 'es', hour: 9, name: null, seed: 2 });
    expect(bare.heading).toBe('¿Qué haremos hoy?');
    expect(bare.subtitle.endsWith('?')).toBe(false);
  });

  it('only covers Spanish and English', () => {
    expect(hasHomeGreeting('es-ES')).toBe(true);
    expect(hasHomeGreeting('en')).toBe(true);
    expect(hasHomeGreeting('ja')).toBe(false);
  });
});
