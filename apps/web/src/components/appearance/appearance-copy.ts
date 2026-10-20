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
  assistantTitle: string;
  assistantHint: string;
  auraTitle: string;
  auraHint: string;
  auraCustom: string;
  auraPresets: Record<'siri' | 'neon' | 'ocean' | 'sunset', string>;
  voiceTitle: string;
  voiceHint: string;
  voiceAuto: string;
  voicePremiumTip: string;
  voiceTest: string;
  voiceTestSample: string;
  voiceNone: string;
  rateTitle: string;
  speakReplies: string;
  listenTitle: string;
  listenReady: (engine: string) => string;
  listenMissing: string;
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
  assistantTitle: 'Asistente',
  assistantHint: 'El mono del chat: cómo se ve cuando escucha y cómo suena.',
  auraTitle: 'Aura',
  auraHint: 'La gota de luz que rodea al mono mientras escucha y habla.',
  auraCustom: 'Otro color',
  auraPresets: { siri: 'Siri', neon: 'Neón', ocean: 'Océano', sunset: 'Atardecer' },
  voiceTitle: 'Voz',
  voiceHint: 'Las voces vienen de tu Mac. Las de calidad Premium suenan mucho más naturales.',
  voiceAuto: 'Automática (la mejor disponible)',
  voicePremiumTip: 'Para más voces: Ajustes del Sistema, Accesibilidad, Contenido hablado, Voz del sistema, Administrar voces.',
  voiceTest: 'Probar voz',
  voiceTestSample: 'Hola, soy tu asistente. ¿En qué trabajamos hoy?',
  voiceNone: 'Este equipo no tiene voces del sistema disponibles.',
  rateTitle: 'Velocidad',
  speakReplies: 'Leer en voz alta las respuestas a lo que digo',
  listenTitle: 'Escucha',
  listenReady: (engine) => `Lista: ${engine}, en este equipo.`,
  listenMissing: 'Sin instalar: aún no puedo entender lo que dices.',
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
  assistantTitle: 'Assistant',
  assistantHint: 'The chat monkey: how it looks when it listens and how it sounds.',
  auraTitle: 'Aura',
  auraHint: 'The drop of light around the monkey while it listens and speaks.',
  auraCustom: 'Other colour',
  auraPresets: { siri: 'Siri', neon: 'Neon', ocean: 'Ocean', sunset: 'Sunset' },
  voiceTitle: 'Voice',
  voiceHint: 'Voices come from your Mac. Premium-quality ones sound far more natural.',
  voiceAuto: 'Automatic (best available)',
  voicePremiumTip: 'For more voices: System Settings, Accessibility, Spoken Content, System Voice, Manage Voices.',
  voiceTest: 'Test voice',
  voiceTestSample: 'Hi, I’m your assistant. What shall we work on today?',
  voiceNone: 'This machine has no system voices available.',
  rateTitle: 'Speed',
  speakReplies: 'Read replies aloud when I speak a request',
  listenTitle: 'Listening',
  listenReady: (engine) => `Ready: ${engine}, on this machine.`,
  listenMissing: 'Not installed: I can’t understand speech yet.',
};

export function getAppearanceCopy(locale: string): AppearanceCopy {
  return locale.toLowerCase().startsWith('es') ? ES : EN;
}
