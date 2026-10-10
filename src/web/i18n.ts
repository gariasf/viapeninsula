// The languages the interface speaks, every string it shows in each, and the basemap's labels in them.

import type { ExpressionSpecification } from '@maplibre/maplibre-gl-style-spec';

/** Each language the interface speaks, with its name in itself for the language switch: Spain's, then English. */
export const LANGUAGES = { ca: 'Català', es: 'Castellano', eu: 'Euskara', gl: 'Galego', en: 'English' };
export type Language = keyof typeof LANGUAGES;

/**
 * Every interface string, in each language. Names aren't here, as they read the same in every
 * language: Stations and Lines are shown as their operators publish them, and the credits name
 * their sources as those sources do. The Basque and Galician are machine-translated, as About says
 * (MACHINE_TRANSLATED). Basque writes one in words, after its noun ("geltoki bat"), as Euskaltzaindia's
 * norm 203 has it.
 */
const STRINGS = {
  language: { ca: 'Idioma', es: 'Idioma', eu: 'Hizkuntza', gl: 'Idioma', en: 'Language' },
  map: { ca: 'Mapa', es: 'Mapa', eu: 'Mapa', gl: 'Mapa', en: 'Map' },
  showCredits: { ca: 'Mostra o amaga els crèdits', es: 'Mostrar u ocultar los créditos', eu: 'Erakutsi edo ezkutatu kredituak', gl: 'Amosar ou agochar os créditos', en: 'Show or hide the credits' },
  // As OpenStreetMap's own site words it.
  osmContributors: {
    ca: "© Els col·laboradors de l'OpenStreetMap",
    es: '© Colaboradores de OpenStreetMap',
    eu: '© OpenStreetMap laguntzaileak',
    gl: '© Colaboradores do OpenStreetMap',
    en: '© OpenStreetMap contributors',
  },
  // Before the day an operator last updated its data, in the credits.
  updated: { ca: 'actualitzat el', es: 'actualizado el', eu: 'azken eguneratzea:', gl: 'actualizado o', en: 'updated' },
  // Live and Scheduled, and what each means in About's key. Alone, they're the followed Train's status, and what a Train's pill tells a screen reader.
  live: { ca: 'En directe', es: 'En directo', eu: 'Zuzenean', gl: 'En directo', en: 'Live' },
  liveMeans: {
    ca: 'posició confirmada per dades en temps real',
    es: 'posición confirmada por datos en tiempo real',
    eu: 'denbora errealeko datuek baieztatutako posizioa',
    gl: 'posición confirmada por datos en tempo real',
    en: 'position confirmed by live data',
  },
  scheduled: { ca: 'Programat', es: 'Programado', eu: 'Programatuta', gl: 'Programado', en: 'Scheduled' },
  scheduledMeans: { ca: "posició segons l'horari", es: 'posición según el horario', eu: 'ordutegiaren araberako posizioa', gl: 'posición segundo o horario', en: 'position from the timetable' },
  // The legend's counts of every Train on the map, Live and Scheduled. {n} is how many.
  liveCount: { ca: '{n} en directe', es: '{n} en directo', eu: '{n} zuzenean', gl: '{n} en directo', en: '{n} live' },
  scheduledCount: { ca: '{n} programats', es: '{n} programados', eu: '{n} programatuta', gl: '{n} programados', en: '{n} scheduled' },
  oneScheduledCount: { ca: '{n} programat', es: '{n} programado', eu: '{n} programatuta', gl: '{n} programado', en: '{n} scheduled' },
  // The banner, while a Network's live data is unavailable: {network} is its name.
  liveUnavailable: {
    ca: '{network}: sense dades en temps real',
    es: '{network}: sin datos en tiempo real',
    eu: '{network}: denbora errealeko daturik ez',
    gl: '{network}: sen datos en tempo real',
    en: '{network} live data unavailable',
  },
  // After a Network's name in the banner, while its timetable has no Trips today, so it has no Trains on the map (#226).
  noTimetable: { ca: 'sense horari avui', es: 'sin horario hoy', eu: 'gaur ordutegirik ez', gl: 'sen horario hoxe', en: 'no timetable today' },
  // The banner alone, while the map has never got live data, and so can't name a Network.
  noLive: {
    ca: "Dades en temps real no disponibles, posicions segons l'horari",
    es: 'Datos en tiempo real no disponibles, posiciones según el horario',
    eu: 'Denbora errealeko daturik ez, posizioak ordutegiaren arabera',
    gl: 'Datos en tempo real non dispoñibles, posicións segundo o horario',
    en: 'Live data unavailable, positions from the timetable',
  },
  // The follow panel. {n} is a number of minutes, and {ago} how long ago, as ago() words it.
  stopFollowing: { ca: 'Deixa de seguir aquest tren', es: 'Dejar de seguir este tren', eu: 'Utzi tren honi jarraitzeari', gl: 'Deixar de seguir este tren', en: 'Stop following this train' },
  onTime: { ca: 'puntual', es: 'puntual', eu: 'garaiz', gl: 'puntual', en: 'on time' },
  late: { ca: '{n} min de retard', es: '{n} min de retraso', eu: '{n} min atzeratuta', gl: '{n} min de atraso', en: '{n} min late' },
  early: { ca: "{n} min d'avançament", es: '{n} min de adelanto', eu: '{n} min aurreratuta', gl: '{n} min de adianto', en: '{n} min early' },
  confirmed: { ca: 'confirmat fa {ago}', es: 'confirmado hace {ago}', eu: 'duela {ago} baieztatua', gl: 'confirmado hai {ago}', en: 'confirmed {ago} ago' },
  lastConfirmed: {
    ca: 'confirmat en directe per última vegada fa {ago}',
    es: 'confirmado en directo por última vez hace {ago}',
    eu: 'zuzenean azkenekoz duela {ago} baieztatua',
    gl: 'confirmado en directo por última vez hai {ago}',
    en: 'last confirmed live {ago} ago',
  },
  noLiveTrain: { ca: 'sense dades en temps real', es: 'sin datos en tiempo real', eu: 'denbora errealeko daturik ez', gl: 'sen datos en tempo real', en: 'no live data' },
  speed: { ca: 'Velocitat estimada', es: 'Velocidad estimada', eu: 'Kalkulatutako abiadura', gl: 'Velocidade estimada', en: 'Estimated speed' },
  unit: { ca: 'Unitat', es: 'Unidad', eu: 'Unitatea', gl: 'Unidade', en: 'Unit' },
  nextStations: { ca: 'Properes estacions', es: 'Próximas estaciones', eu: 'Hurrengo geltokiak', gl: 'Próximas estacións', en: 'Next stations' },
  nextStation: { ca: 'Propera estació', es: 'Próxima estación', eu: 'Hurrengo geltokia', gl: 'Próxima estación', en: 'Next station' },
  // The followed Train's strip's name with its fold open, as it lists the Stations the Train has already left too; and what a screen reader hears after each of those, whose subject is the Train, so that it needn't agree with a Station's name.
  stations: { ca: 'Estacions', es: 'Estaciones', eu: 'Geltokiak', gl: 'Estacións', en: 'Stations' },
  passed: { ca: 'ja hi ha passat', es: 'ya ha pasado', eu: 'dagoeneko igaro da', gl: 'xa pasou', en: 'passed' },
  // Where the followed Train's next Stations start: the Station it last left.
  left: { ca: 'Ha sortit de {station}', es: 'Ha salido de {station}', eu: '{station} geltokitik irten da', gl: 'Saíu de {station}', en: 'Left {station}' },
  // How long until a Train comes: under a time on a board or in Nearby, and under the followed Train's next Station's.
  minutes: { ca: '{n} min', es: '{n} min', eu: '{n} min', gl: '{n} min', en: '{n} min' },
  inMinutes: { ca: "d'aquí a {n} min", es: 'en {n} min', eu: '{n} min barru', gl: 'en {n} min', en: 'in {n} min' },
  now: { ca: 'ara', es: 'ahora', eu: 'orain', gl: 'agora', en: 'now' },
  // At the foot of a peeking followed Train: how many Stations it has still to come after the next, and the last of them, where it's headed, and when it's due there.
  moreStations: {
    ca: '{n} estacions més, fins a {headsign} ({time})',
    es: '{n} estaciones más, hasta {headsign} ({time})',
    eu: '{n} geltoki gehiago, {headsign} arte ({time})',
    gl: '{n} estacións máis, ata {headsign} ({time})',
    en: '{n} more stations, to {headsign} at {time}',
  },
  oneMoreStation: {
    ca: '{n} estació més, fins a {headsign} ({time})',
    es: '{n} estación más, hasta {headsign} ({time})',
    eu: 'Geltoki bat gehiago, {headsign} arte ({time})',
    gl: '{n} estación máis, ata {headsign} ({time})',
    en: '{n} more station, to {headsign} at {time}',
  },
  // The fold atop a pulled-up followed Train's strip: how many Stations it has already left, which shows them, and once shown hides them.
  earlierStations: { ca: '{n} estacions anteriors', es: '{n} estaciones anteriores', eu: 'Aurreko {n} geltoki', gl: '{n} estacións anteriores', en: '{n} earlier stations' },
  oneEarlierStation: { ca: '{n} estació anterior', es: '{n} estación anterior', eu: 'Aurreko geltoki bat', gl: '{n} estación anterior', en: '{n} earlier station' },
  hideEarlierStations: {
    ca: 'Amaga les {n} estacions anteriors',
    es: 'Ocultar las {n} estaciones anteriores',
    eu: 'Ezkutatu aurreko {n} geltokiak',
    gl: 'Agochar as {n} estacións anteriores',
    en: 'Hide {n} earlier stations',
  },
  oneHideEarlierStation: { ca: "Amaga l'estació anterior", es: 'Ocultar la estación anterior', eu: 'Ezkutatu aurreko geltokia', gl: 'Agochar a estación anterior', en: 'Hide {n} earlier station' },
  // A Station's board.
  closeBoard: { ca: 'Tanca el panell de sortides', es: 'Cerrar el panel de salidas', eu: 'Itxi irteeren panela', gl: 'Pechar o panel de saídas', en: 'Close the departures board' },
  nextDepartures: { ca: 'Properes sortides', es: 'Próximas salidas', eu: 'Hurrengo irteerak', gl: 'Próximas saídas', en: 'Next departures' },
  noDepartures: { ca: 'Cap sortida propera', es: 'Ninguna salida próxima', eu: 'Ez dago hurrengo irteerarik', gl: 'Ningunha saída próxima', en: 'No upcoming departures' },
  cancelled: { ca: 'Cancel·lat', es: 'Cancelado', eu: 'Bertan behera', gl: 'Cancelado', en: 'Cancelled' },
  // A departure at a Station its Train won't stop at, as one cut short doesn't run to (#346).
  notStopping: { ca: "No s'atura aquí", es: 'No para aquí', eu: 'Ez da hemen gelditzen', gl: 'Non para aquí', en: "Doesn't stop here" },
  // At the foot of a peeking board: how many departures more it lists.
  moreDepartures: { ca: '{n} sortides més', es: '{n} salidas más', eu: '{n} irteera gehiago', gl: '{n} saídas máis', en: '{n} more departures' },
  oneMoreDeparture: { ca: '{n} sortida més', es: '{n} salida más', eu: 'Irteera bat gehiago', gl: '{n} saída máis', en: '{n} more departure' },
  // A followed Train's and a board's Alerts (#342): how many, in the line they're folded into; when each began, {date}; and when they were read, {time}, where that's long ago.
  alerts: { ca: '{n} avisos', es: '{n} avisos', eu: '{n} abisu', gl: '{n} avisos', en: '{n} alerts' },
  oneAlert: { ca: '{n} avís', es: '{n} aviso', eu: 'Abisu bat', gl: '{n} aviso', en: '{n} alert' },
  since: { ca: 'Des del {date}', es: 'Desde el {date}', eu: 'Hasiera: {date}', gl: 'Desde o {date}', en: 'From {date}' },
  alertsAsOf: {
    ca: 'Darrera actualització dels avisos: {time}',
    es: 'Última actualización de los avisos: {time}',
    eu: 'Abisuen azken eguneratzea: {time}',
    gl: 'Última actualización dos avisos: {time}',
    en: 'Alerts as of {time}',
  },
  // A tap on a Closure from the timetable (#341): its Line's buses in place of its Trains between two Stations, {a} and {b} (busesReplace()).
  busesReplace: {
    ca: 'Autobusos en lloc de trens entre {a} i {b}',
    es: 'Autobuses en lugar de trenes entre {a} y {b}',
    eu: 'Autobusak trenen ordez {a} eta {b} artean',
    gl: 'Autobuses no canto de trens entre {a} e {b}',
    en: 'Buses replace trains between {a} and {b}',
  },
  // Nearby Trains: their panel's title, and the button that opens them.
  nearby: { ca: 'Trens a prop', es: 'Trenes cercanos', eu: 'Inguruko trenak', gl: 'Trens próximos', en: 'Nearby trains' },
  nearbyButton: { ca: 'A prop', es: 'Cerca', eu: 'Inguruan', gl: 'Preto', en: 'Nearby' },
  closeNearby: { ca: 'Tanca els trens a prop', es: 'Cerrar los trenes cercanos', eu: 'Itxi inguruko trenak', gl: 'Pechar os trens próximos', en: 'Close nearby trains' },
  passingNearby: {
    ca: "Passen a menys d'1,5 km en la pròxima hora",
    es: 'Pasan a menos de 1,5 km en la próxima hora',
    eu: 'Datorren orduan 1,5 km baino gutxiagora igaroko dira',
    gl: 'Pasan a menos de 1,5 km na próxima hora',
    en: 'Passing within 1.5 km in the next hour',
  },
  noneNearby: {
    ca: "Cap tren no passa a menys d'1,5 km en la pròxima hora",
    es: 'Ningún tren pasa a menos de 1,5 km en la próxima hora',
    eu: 'Datorren orduan ez da trenik igaroko 1,5 km baino gutxiagora',
    gl: 'Ningún tren pasa a menos de 1,5 km na próxima hora',
    en: 'No trains pass within 1.5 km in the next hour',
  },
  locating: { ca: 'Buscant on ets…', es: 'Buscando dónde estás…', eu: 'Non zauden bilatzen…', gl: 'Buscando onde estás…', en: 'Finding where you are…' },
  noLocation: {
    ca: "No s'ha pogut saber on ets, així que no es poden mostrar els trens a prop",
    es: 'No se ha podido saber dónde estás, así que no se pueden mostrar los trenes cercanos',
    eu: 'Ezin izan da jakin non zauden; beraz, ezin dira inguruko trenak erakutsi',
    gl: 'Non se puido saber onde estás, así que non se poden amosar os trens próximos',
    en: "Your location isn't available, so nearby trains can't be shown",
  },
  // Nearby, where the viewer refused to say where they are: that the browser isn't sharing it, and how to allow it (#324).
  locationBlocked: {
    ca: 'El navegador no comparteix la teva ubicació amb aquest mapa',
    es: 'El navegador no comparte tu ubicación con este mapa',
    eu: 'Nabigatzaileak ez du zure kokapena mapa honekin partekatzen',
    gl: 'O navegador non comparte a túa localización con este mapa',
    en: "Your browser isn't sharing your location with this map",
  },
  allowLocation: {
    ca: 'Per veure els trens a prop, permet la ubicació per a aquest lloc a la configuració del navegador i torna-ho a provar',
    es: 'Para ver los trenes cercanos, permite la ubicación para este sitio en la configuración del navegador y vuelve a intentarlo',
    eu: 'Inguruko trenak ikusteko, baimendu kokapena gune honetarako nabigatzailearen ezarpenetan, eta saiatu berriro',
    gl: 'Para ver os trens próximos, permite a localización para este sitio na configuración do navegador e téntao de novo',
    en: "To see nearby trains, allow location for this site in your browser's settings, then try again",
  },
  // The button under Nearby's message that asks the browser again where the viewer is.
  tryAgain: { ca: 'Torna-ho a provar', es: 'Volver a intentarlo', eu: 'Saiatu berriro', gl: 'Tentar de novo', en: 'Try again' },
  // The button beside Nearby's that follows a random Train.
  followRandom: { ca: "Segueix un tren a l'atzar", es: 'Seguir un tren al azar', eu: 'Jarraitu ausazko tren bati', gl: 'Seguir un tren ao chou', en: 'Follow a random train' },
  // The handle at the top of the panel on a phone, which pulls it up or lets it down.
  showMore: { ca: 'Mostra més', es: 'Mostrar más', eu: 'Erakutsi gehiago', gl: 'Amosar máis', en: 'Show more' },
  showLess: { ca: 'Mostra menys', es: 'Mostrar menos', eu: 'Erakutsi gutxiago', gl: 'Amosar menos', en: 'Show less' },
  // The About dialog, and the legend's button that opens it.
  about: { ca: 'Quant a aquest mapa', es: 'Acerca de este mapa', eu: 'Mapa honi buruz', gl: 'Sobre este mapa', en: 'About this map' },
  close: { ca: 'Tanca', es: 'Cerrar', eu: 'Itxi', gl: 'Pechar', en: 'Close' },
  estimates: {
    ca: "Via Península mostra els trens, metros i tramvies de Catalunya, i els trens de Cercanías de Renfe a la resta d'Espanya, mentre circulen. Les posicions són estimacions derivades de les dades dels operadors, calculades a partir dels horaris i de les dades en temps real.",
    es: 'Via Península muestra los trenes, metros y tranvías de Cataluña, y los trenes de Cercanías de Renfe en el resto de España, mientras circulan. Las posiciones son estimaciones derivadas de los datos de los operadores, calculadas a partir de los horarios y de los datos en tiempo real.',
    eu: 'Via Penínsulak Kataluniako trenak, metroak eta tranbiak erakusten ditu, baita Renferen Cercanías trenak ere Espainiako gainerako lekuetan, dabiltzan bitartean. Posizioak operadoreen datuetatik ateratako zenbatespenak dira, ordutegietatik eta denbora errealeko datuetatik kalkulatuak.',
    gl: 'Via Península amosa os trens, metros e tranvías de Cataluña, e os trens de Cercanías de Renfe no resto de España, mentres circulan. As posicións son estimacións derivadas dos datos dos operadores, calculadas a partir dos horarios e dos datos en tempo real.',
    en: "Via Península shows Catalonia's trains, metros and trams, and Renfe's Cercanías trains in the rest of Spain, as they run. Their positions are estimates derived from the operators' data, built from timetables and live data.",
  },
  // After estimates: what a Train's pill says zoomed in, as pillOf() outlines it.
  outlines: {
    ca: 'Amb el mapa ampliat, cada tren és una etiqueta amb el nom de la seva línia, i la seva forma indica el tipus de servei: arrodonida per a les línies de rodalia i les suburbanes, acabada en punta als dos extrems per a les regionals, i quadrada amb les cantonades arrodonides per a les del metro de TMB, del TRAM, del tren-tramvia de Cadis, del cremallera i dels funiculars.',
    es: 'Con el mapa ampliado, cada tren es una etiqueta con el nombre de su línea, y su forma indica el tipo de servicio: redondeada para las líneas de cercanías y las suburbanas, acabada en punta por ambos extremos para las regionales, y cuadrada con las esquinas redondeadas para las del metro de TMB, del TRAM, del tren-tranvía de Cádiz, del cremallera y de los funiculares.',
    eu: 'Mapa handituta, tren bakoitza bere linearen izena daraman etiketa bat da, eta haren formak zerbitzu mota adierazten du: biribildua aldiriko eta hiri-inguruko lineetan, bi muturretan puntaduna eskualdeko lineetan, eta izkina biribilduko karratua TMBren metroko, TRAMeko, Cadizko tren-tranbiako, kremailerako eta funikularretako lineetan.',
    gl: 'Co mapa ampliado, cada tren é unha etiqueta co nome da súa liña, e a súa forma indica o tipo de servizo: arredondada para as liñas de proximidade e as suburbanas, rematada en punta polos dous extremos para as rexionais, e cadrada coas esquinas arredondadas para as do metro de TMB, do TRAM, do tren-tranvía de Cádiz, do tren de cremalleira e dos funiculares.',
    en: "Zoomed in, each train is a label with its line's name, shaped by the line's kind of service: rounded for commuter and suburban lines, pointed at both ends for regional lines, and a rounded square for the lines of TMB's metro, TRAM, Cádiz's tram-train, the rack railway and the funiculars.",
  },
  // About's key: the pills a Train is drawn as, Live and Scheduled, and its outlines.
  readingTheMap: { ca: 'Com llegir el mapa', es: 'Cómo leer el mapa', eu: 'Nola irakurri mapa', gl: 'Como ler o mapa', en: 'Reading the map' },
  credits: { ca: 'Crèdits', es: 'Créditos', eu: 'Kredituak', gl: 'Créditos', en: 'Credits' },
  sourceCode: { ca: 'Codi font', es: 'Código fuente', eu: 'Iturburu-kodea', gl: 'Código fonte', en: 'Source code' },
  privacy: { ca: 'Privadesa', es: 'Privacidad', eu: 'Pribatutasuna', gl: 'Privacidade', en: 'Privacy' },
  noCookies: {
    ca: "Aquest web no fa servir galetes: només desa al teu dispositiu l'idioma que triïs i el lloc on deixis el mapa.",
    es: 'Esta web no usa cookies: solo guarda en tu dispositivo el idioma que elijas y el lugar donde dejes el mapa.',
    eu: 'Webgune honek ez du cookierik erabiltzen: zure gailuan, aukeratzen duzun hizkuntza eta mapa uzten duzun lekua baino ez ditu gordetzen.',
    gl: 'Esta web non usa cookies: só garda no teu dispositivo o idioma que escollas e o lugar onde deixes o mapa.',
    en: 'This site uses no cookies: all it keeps on your device is the language you choose and where you leave the map.',
  },
  // After noCookies. Cloudflare Web Analytics goes by that name in every language, and About links it where the sentence names it.
  visitsCounted: {
    ca: 'Les visites es compten amb Cloudflare Web Analytics, que no fa servir galetes ni desa res al teu dispositiu.',
    es: 'Las visitas se cuentan con Cloudflare Web Analytics, que no usa cookies ni guarda nada en tu dispositivo.',
    eu: 'Bisitak Cloudflare Web Analytics bidez zenbatzen dira, eta tresna horrek ez du cookierik erabiltzen, ezta ezer gordetzen ere zure gailuan.',
    gl: 'As visitas cóntanse con Cloudflare Web Analytics, que non usa cookies nin garda nada no teu dispositivo.',
    en: 'Visits are counted with Cloudflare Web Analytics, which uses no cookies and keeps nothing on your device.',
  },
} satisfies Record<string, Record<Language, string>>;

/**
 * Atop About, in each language whose texts are machine-translated, that they are, naming GitHub, which
 * About links to the project's issues, for corrections (#327). A language's note goes once a speaker
 * has checked its texts.
 */
export const MACHINE_TRANSLATED: Partial<Record<Language, string>> = {
  eu: 'Euskarazko testuak itzulpen automatikoz eginak dira, eta hiztun batek ez ditu oraindik berrikusi. Zuzendu beharreko zerbait ikusten baduzu, jakinarazi iezaguzu GitHub-en.',
  gl: 'Os textos en galego son unha tradución automática, e aínda non os revisou ningún falante. Se ves algo que corrixir, avísanos en GitHub.',
};

/**
 * Whether the basemap names a feature in the viewer's language, where the tiles have it, or for Galician
 * in Spanish (basemapLabel()): countries, regions, seas, rivers and airports, which are the features
 * with an IATA code. Everything else it labels, from towns and their districts to streets, goes by its
 * own name, as its signs and Stations have it: the tiles' Spanish names for Catalan towns are mostly
 * old Castilian ones, such as Lérida and Sardañola del Vallés.
 */
const TRANSLATED: ExpressionSpecification = ['any', ['in', ['get', 'class'], ['literal', ['country', 'state', 'ocean', 'sea', 'river']]], ['has', 'iata']];

/**
 * A basemap label, from `own`, the label by a feature's own name: where it's TRANSLATED, by its name
 * in the language the style's `language` state holds, as the tiles' `name:<code>` has it, or for
 * Galician, which they have none in, by its Spanish name (#327); or else by its own name.
 */
export const basemapLabel = (own: ExpressionSpecification): ExpressionSpecification => [
  'case',
  TRANSLATED,
  ['coalesce', ['get', ['concat', 'name:', ['match', ['global-state', 'language'], 'gl', 'es', ['global-state', 'language']]]], own],
  own,
];

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

/** An interface string, in `lang`, or else the language the interface speaks now. */
export const t = (key: keyof typeof STRINGS, lang = language()): string => STRINGS[key][lang];

/**
 * The locale to write dates, times and numbers in, for `lang`, or else the language the interface speaks
 * now: its own, or Spanish's where the browser has no data for it, as Chrome has none for Basque or
 * Galician, which would otherwise take the browser's own locale's, such as "6:05 PM", or raw ones, such
 * as "2026 M10 7" (#327).
 */
export const locale = (lang = language()): string => (Intl.DateTimeFormat.supportedLocalesOf(lang).length ? lang : 'es');

/**
 * A string that counts `n` of something, in `lang`: `one` where `n` is 1, and `other` otherwise.
 * ponytail: one is singular and any other number plural, as in every language the interface speaks,
 * as a test checks against Intl.PluralRules. Pick the string by Intl.PluralRules if a language with
 * other plural forms joins them.
 */
const counting = (n: number, one: keyof typeof STRINGS, other: keyof typeof STRINGS, lang: Language): string => STRINGS[n === 1 ? one : other][lang].replace('{n}', String(n));

/** How many Trains on the map are Live, and how many Scheduled, in `lang`, or else the language the interface speaks now. */
export const trainCounts = (live: number, scheduled: number, lang = language()): [live: string, scheduled: string] => [
  STRINGS.liveCount[lang].replace('{n}', String(live)),
  counting(scheduled, 'oneScheduledCount', 'scheduledCount', lang),
];

/** How long until a Train comes, `minutes` from now, in `lang`, or else the language the interface speaks now: as `minutes` has it, or for the next Station `inMinutes`, or now. */
export const toGo = (minutes: number, phrase: 'minutes' | 'inMinutes', lang = language()): string =>
  minutes > 0 ? STRINGS[phrase][lang].replace('{n}', String(minutes)) : STRINGS.now[lang];

/** The banner's short form, saying that a Network's live data is unavailable, by its name, in `lang`, or else the language the interface speaks now. */
export const liveUnavailable = (network: string, lang = language()): string => STRINGS.liveUnavailable[lang].replace('{network}', network);

/** How many Stations a followed Train has still to come after its next, `n`, to its last, where it's headed, and when it's due there, in `lang`, or else the language the interface speaks now. */
export const moreStations = (n: number, headsign: string, time: string, lang = language()): string =>
  counting(n, 'oneMoreStation', 'moreStations', lang).replace('{headsign}', headsign).replace('{time}', time);

/** How many Stations a followed Train has already left, `n`, atop its strip: while they're folded away, or hiding them once they're `shown`, in `lang`, or else the language the interface speaks now. */
export const earlierStations = (n: number, shown: boolean, lang = language()): string =>
  shown ? counting(n, 'oneHideEarlierStation', 'hideEarlierStations', lang) : counting(n, 'oneEarlierStation', 'earlierStations', lang);

/** How many departures more a board lists than it shows peeking, in `lang`, or else the language the interface speaks now. */
export const moreDepartures = (n: number, lang = language()): string => counting(n, 'oneMoreDeparture', 'moreDepartures', lang);

/** How many Alerts a card has, `n`, in the line they're folded into, in `lang`, or else the language the interface speaks now. */
export const alertCount = (n: number, lang = language()): string => counting(n, 'oneAlert', 'alerts', lang);

/**
 * That buses run in a Line's Trains' place between two Stations, as the timetable's Closures say (#341),
 * in `lang`, or else the language the interface speaks now: in Spanish with "e" for "y" before a name
 * starting with an i sound, as in "Hernani e Irun", but not "hie", as the RAE has it.
 */
export const busesReplace = (a: string, b: string, lang = language()): string => {
  const text = STRINGS.busesReplace[lang].replace('{a}', a);
  return (lang === 'es' && /^h?[iíIÍ](?![aeoáéó])/i.test(b) ? text.replace(' y {b}', ' e {b}') : text).replace('{b}', b);
};

/**
 * Why Nearby can't show the viewer's nearby Trains: the browser is finding where they are, as Nearby's
 * button asked it, or again, as Try again did; it couldn't say, as its error's code tells, the viewer
 * having refused (PERMISSION_DENIED, which a dismissed prompt gives too) or it having had no fix in time
 * (TIMEOUT, POSITION_UNAVAILABLE); or it has no geolocation at all (#324).
 */
export type Unlocated = 'locating' | 'retrying' | 'refused' | 'failed' | 'unsupported';

/**
 * What Nearby says for each, and whether Try again follows: where trying again could help, and while
 * it's asked again, so that the keyboard's focus stays on the button.
 */
const UNLOCATED: Record<Unlocated, [says: (keyof typeof STRINGS)[], tryAgain: boolean]> = {
  locating: [['locating'], false],
  retrying: [['locating'], true],
  refused: [['locationBlocked', 'allowLocation'], true],
  failed: [['noLocation'], true],
  unsupported: [['noLocation'], false],
};

/** What Nearby says while it can't show the viewer's nearby Trains, in `lang`, or else the language the interface speaks now, and Try again's label where it follows. */
export function unlocated(why: Unlocated, lang = language()): { says: string[]; tryAgain?: string } {
  const [says, tryAgain] = UNLOCATED[why];
  return { says: says.map((key) => STRINGS[key][lang]), ...(tryAgain && { tryAgain: STRINGS.tryAgain[lang] }) };
}

/** What this device remembers the viewer chose, if its storage can be read. */
function remembered(): string | null {
  try {
    return localStorage.getItem(CHOICE_KEY);
  } catch {
    return null;
  }
}
