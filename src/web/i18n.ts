// The languages the interface speaks, and every string it shows in each.

/** Each language the interface speaks, with its name in itself for the language switch. */
export const LANGUAGES = { ca: 'Català', es: 'Castellano', en: 'English' };
export type Language = keyof typeof LANGUAGES;

/**
 * Every interface string, in each language. Names aren't here, as they read the same in every
 * language: Stations and Lines are shown as their operators publish them, and the credits name
 * their sources as those sources do.
 */
const STRINGS = {
  language: { ca: 'Idioma', es: 'Idioma', en: 'Language' },
  map: { ca: 'Mapa', es: 'Mapa', en: 'Map' },
  showCredits: { ca: 'Mostra o amaga els crèdits', es: 'Mostrar u ocultar los créditos', en: 'Show or hide the credits' },
  // As OpenStreetMap's own site words it.
  osmContributors: { ca: "© Els col·laboradors de l'OpenStreetMap", es: '© Colaboradores de OpenStreetMap', en: '© OpenStreetMap contributors' },
} satisfies Record<string, Record<Language, string>>;

/** What the viewer's choice is kept under on their device, in local storage, which takes no cookie. */
const CHOICE_KEY = 'language';

const speaks = (code: string): code is Language => Object.hasOwn(LANGUAGES, code);

/**
 * The language to speak to a viewer: the one they've `chosen` on this device, or else the first of
 * the languages their browser `prefers` that the interface speaks, in any region, or else English.
 */
export function pickLanguage(chosen: string | null, prefers: readonly string[]): Language {
  const preferred = prefers.map((tag) => tag.toLowerCase().split('-')[0] ?? '');
  return [chosen ?? '', ...preferred].find(speaks) ?? 'en';
}

let current: Language | undefined;

/** The language the interface speaks now. */
export function language(): Language {
  return (current ??= pickLanguage(remembered(), navigator.languages));
}

/** Speaks `choice` from now on, and remembers it on this device. */
export function setLanguage(choice: Language) {
  current = choice;
  try {
    localStorage.setItem(CHOICE_KEY, choice);
  } catch {
    // Storage is off, as in some private windows: the choice lasts until the page closes.
  }
}

/** An interface string, in the language the interface speaks now. */
export const t = (key: keyof typeof STRINGS): string => STRINGS[key][language()];

/** What this device remembers the viewer chose, if its storage can be read. */
function remembered(): string | null {
  try {
    return localStorage.getItem(CHOICE_KEY);
  } catch {
    return null;
  }
}
