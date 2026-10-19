/**
 * Texts of the Appearance settings page. Kept out of the 19-locale dictionary on
 * purpose (same approach as `agents/agents-copy.ts`): the page is new and still
 * growing, and Spanish / English are the languages it ships in. Other locales
 * read the English copy.
 */
export interface AppearanceCopy {
  navTitle: string;
  navHint: string;
  title: string;
  hint: string;
  themeTitle: string;
  themeHint: string;
  light: string;
  dark: string;
  system: string;
  systemHint: string;
}

const ES: AppearanceCopy = {
  navTitle: 'Apariencia',
  navHint: 'Tema y aspecto de la app',
  title: 'Apariencia',
  hint: 'Cómo se ve la app. Aquí irán más ajustes de aspecto.',
  themeTitle: 'Tema',
  themeHint: 'Elige claro, oscuro, o deja que la app siga el modo de tu sistema.',
  light: 'Claro',
  dark: 'Oscuro',
  system: 'Sistema',
  systemHint: 'Sigue tu sistema',
};

const EN: AppearanceCopy = {
  navTitle: 'Appearance',
  navHint: 'Theme and look of the app',
  title: 'Appearance',
  hint: 'How the app looks. More appearance settings will live here.',
  themeTitle: 'Theme',
  themeHint: 'Pick light, dark, or let the app follow your system.',
  light: 'Light',
  dark: 'Dark',
  system: 'System',
  systemHint: 'Follows your system',
};

export function getAppearanceCopy(locale: string): AppearanceCopy {
  return locale.toLowerCase().startsWith('es') ? ES : EN;
}
