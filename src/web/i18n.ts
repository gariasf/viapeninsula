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
  // Before the day an operator last updated its data, in the credits.
  updated: { ca: 'actualitzat el', es: 'actualizado el', en: 'updated' },
  // The legend's two markers, and what each means.
  live: { ca: 'En directe', es: 'En directo', en: 'Live' },
  liveMeans: { ca: 'posició confirmada per dades en temps real', es: 'posición confirmada por datos en tiempo real', en: 'position confirmed by live data' },
  scheduled: { ca: 'Programat', es: 'Programado', en: 'Scheduled' },
  scheduledMeans: { ca: "posició segons l'horari", es: 'posición según el horario', en: 'position from the timetable' },
  // After a Network's name in the banner, while its live data is unavailable.
  liveUnavailable: {
    ca: "dades en temps real no disponibles, posicions segons l'horari",
    es: 'datos en tiempo real no disponibles, posiciones según el horario',
    en: 'live data unavailable, positions from the timetable',
  },
  // The banner alone, while the map has never got live data, and so can't name a Network.
  noLive: {
    ca: "Dades en temps real no disponibles, posicions segons l'horari",
    es: 'Datos en tiempo real no disponibles, posiciones según el horario',
    en: 'Live data unavailable, positions from the timetable',
  },
  // The follow panel. {n} is a number of minutes, and {ago} how long ago, as ago() words it.
  stopFollowing: { ca: 'Deixa de seguir aquest tren', es: 'Dejar de seguir este tren', en: 'Stop following this train' },
  onTime: { ca: 'Puntual', es: 'Puntual', en: 'On time' },
  late: { ca: '{n} min de retard', es: '{n} min de retraso', en: '{n} min late' },
  early: { ca: "{n} min d'avançament", es: '{n} min de adelanto', en: '{n} min early' },
  confirmed: { ca: 'confirmat fa {ago}', es: 'confirmado hace {ago}', en: 'confirmed {ago} ago' },
  lastConfirmed: { ca: 'confirmat en directe per última vegada fa {ago}', es: 'confirmado en directo por última vez hace {ago}', en: 'last confirmed live {ago} ago' },
  noLiveTrain: { ca: 'sense dades en temps real per a aquest tren', es: 'sin datos en tiempo real para este tren', en: 'no live data for this train' },
  speed: { ca: 'Velocitat estimada', es: 'Velocidad estimada', en: 'Estimated speed' },
  unit: { ca: 'Unitat', es: 'Unidad', en: 'Unit' },
  nextStations: { ca: 'Properes estacions', es: 'Próximas estaciones', en: 'Next stations' },
  // A Station's board.
  closeBoard: { ca: 'Tanca el panell de sortides', es: 'Cerrar el panel de salidas', en: 'Close the departures board' },
  nextDepartures: { ca: 'Properes sortides', es: 'Próximas salidas', en: 'Next departures' },
  noDepartures: { ca: 'Cap sortida propera', es: 'Ninguna salida próxima', en: 'No upcoming departures' },
  cancelled: { ca: 'Cancel·lat', es: 'Cancelado', en: 'Cancelled' },
  // Nearby Trains: the button that opens them, and their panel.
  nearby: { ca: 'Trens a prop', es: 'Trenes cercanos', en: 'Nearby trains' },
  closeNearby: { ca: 'Tanca els trens a prop', es: 'Cerrar los trenes cercanos', en: 'Close nearby trains' },
  passingNearby: { ca: "Passen a menys d'1,5 km en la pròxima hora", es: 'Pasan a menos de 1,5 km en la próxima hora', en: 'Passing within 1.5 km in the next hour' },
  noneNearby: { ca: "Cap tren no passa a menys d'1,5 km en la pròxima hora", es: 'Ningún tren pasa a menos de 1,5 km en la próxima hora', en: 'No trains pass within 1.5 km in the next hour' },
  locating: { ca: 'Buscant on ets…', es: 'Buscando dónde estás…', en: 'Finding where you are…' },
  noLocation: {
    ca: "No s'ha pogut saber on ets, així que no es poden mostrar els trens a prop",
    es: 'No se ha podido saber dónde estás, así que no se pueden mostrar los trenes cercanos',
    en: "Your location isn't available, so nearby trains can't be shown",
  },
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
