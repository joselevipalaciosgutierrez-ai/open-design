/**
 * The Home headline: a greeting for the time of day, with the user's first name
 * when the app knows it, and a short question under it. Pure, so the wording
 * rules are testable and the component only draws.
 *
 * Spanish and English only. Every other locale keeps its translated headline
 * (`homeHero.title`), because a greeting written in two languages would show as
 * English in the rest.
 */

export type DayPart = 'morning' | 'afternoon' | 'evening';

export interface HomeGreeting {
  heading: string;
  subtitle: string;
}

/** 05:00–11:59 morning, 12:00–19:59 afternoon, otherwise evening. */
export function dayPartOf(hour: number): DayPart {
  if (hour >= 5 && hour < 12) return 'morning';
  if (hour >= 12 && hour < 20) return 'afternoon';
  return 'evening';
}

/** The name as it is greeted: the first word, trimmed. Null when there is none. */
export function greetingNameOf(displayName: string | null | undefined): string | null {
  const first = (displayName ?? '').trim().split(/\s+/)[0] ?? '';
  return first.length > 0 ? first : null;
}

interface Copy {
  greeting: Record<DayPart, string>;
  /** Alternative headings, `{name}` filled in only when there is a name. */
  withName: string[];
  withoutName: string[];
  subtitles: Record<DayPart, string[]>;
}

const ES: Copy = {
  greeting: { morning: 'Buenos días', afternoon: 'Buenas tardes', evening: 'Buenas noches' },
  withName: ['{greeting}, {name}', '{greeting}, {name}', '¿Qué haremos hoy, {name}?'],
  withoutName: ['{greeting}', '{greeting}', '¿Qué haremos hoy?'],
  subtitles: {
    morning: ['¿Qué vamos a crear hoy?', 'Un buen día para empezar algo nuevo'],
    afternoon: ['¿Qué vamos a crear esta tarde?', 'Sigamos con lo que importa'],
    evening: ['¿Qué vamos a crear esta noche?', 'Un buen momento para terminar lo pendiente'],
  },
};

const EN: Copy = {
  greeting: { morning: 'Good morning', afternoon: 'Good afternoon', evening: 'Good evening' },
  withName: ['{greeting}, {name}', '{greeting}, {name}', 'What shall we make today, {name}?'],
  withoutName: ['{greeting}', '{greeting}', 'What shall we make today?'],
  subtitles: {
    morning: ['What are we creating today?', 'A good day to start something new'],
    afternoon: ['What are we creating this afternoon?', 'Let’s keep going on what matters'],
    evening: ['What are we creating tonight?', 'A good time to finish what is pending'],
  },
};

/** Whether this locale has greeting copy. */
export function hasHomeGreeting(locale: string): boolean {
  const l = locale.toLowerCase();
  return l.startsWith('es') || l.startsWith('en');
}

/**
 * `seed` picks among the variants and must be stable for the session (the
 * calendar day works), so the headline does not change under the user's eyes.
 */
export function homeGreeting(input: {
  locale: string;
  hour: number;
  name?: string | null | undefined;
  seed: number;
}): HomeGreeting {
  const copy = input.locale.toLowerCase().startsWith('es') ? ES : EN;
  const part = dayPartOf(input.hour);
  const name = greetingNameOf(input.name);
  const pool = name ? copy.withName : copy.withoutName;
  const pick = <T,>(list: T[], offset = 0): T => list[(Math.abs(input.seed) + offset) % list.length]!;
  const heading = pick(pool)
    .replace('{greeting}', copy.greeting[part])
    .replace('{name}', name ?? '');
  const subtitles = copy.subtitles[part];
  // A heading that already asks the question must not be followed by another.
  const asksQuestion = heading.endsWith('?');
  return { heading, subtitle: asksQuestion ? subtitles[1]! : pick(subtitles, 1) };
}
