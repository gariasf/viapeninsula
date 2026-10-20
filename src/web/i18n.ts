// The languages the interface speaks, every string it shows in each, and the basemap's labels in them.

import type { ExpressionSpecification } from '@maplibre/maplibre-gl-style-spec';

/** Each language the interface speaks, with its name in itself for the language switch: Spain's, then English. */
export const LANGUAGES = { ca: 'Català', es: 'Castellano', eu: 'Euskara', gl: 'Galego', en: 'English' };
export type Language = keyof typeof LANGUAGES;

/**
 * Every interface string, in each language. Names aren't here, as they read the same in every
 * language: Stations and Lines are shown as their operators publish them, but for the word before a
 * Station's name in Catalan and Galician, which runs into its article or elides before its vowel, and
 * a Catalan name's La, Les or L' that goes in lower case after it (named(), #606), and the credits name
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
  // After the text of a link that opens in a new tab, for a screen reader alone (opensInNewTab()): the credits', About's and an Alert's words' (#585).
  opensInNewTab: { ca: "(s'obre en una pestanya nova)", es: '(se abre en una pestaña nueva)', eu: '(fitxa berri batean irekitzen da)', gl: '(ábrese nunha lapela nova)', en: '(opens in a new tab)' },
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
    en: '{network}: no live data',
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
  // The banner, while the page's first manifest has failed and is asked for again, so the map has no Lines and no Trains yet (#658).
  timetableComing: { ca: "Carregant l'horari…", es: 'Cargando el horario…', eu: 'Ordutegia kargatzen…', gl: 'Cargando o horario…', en: 'Loading the timetable…' },
  // The follow panel. {n} is a number of minutes, or of seconds where a string says so, and {ago} how long ago, as ago() words it.
  // A departure's button, naming what it follows (#322); where a Trip still to come leaves; and Back, to a place or to Nearby, or to the Train it was opened from.
  followDeparture: { ca: 'Segueix el tren {line} cap a {headsign}, {time}', es: 'Seguir el tren {line} hacia {headsign}, {time}', eu: 'Jarraitu {line} trena, {headsign} aldera, {time}', gl: 'Seguir o tren {line} cara a {headsign}, {time}', en: 'Follow the {line} train to {headsign}, {time}' },
  leavesAt: { ca: 'Surt de {station} a les {time}', es: 'Sale de {station} a las {time}', eu: '{station} geltokitik irtengo da, {time}', gl: 'Sae de {station} ás {time}', en: 'Leaves {station} at {time}' },
  backTo: { ca: 'Torna a {place}', es: 'Volver a {place}', eu: 'Itzuli: {place}', gl: 'Volver a {place}', en: 'Back to {place}' },
  backToTrain: { ca: 'Torna al tren cap a {headsign}', es: 'Volver al tren hacia {headsign}', eu: 'Itzuli {headsign} aldeko trenera', gl: 'Volver ao tren cara a {headsign}', en: 'Back to the train to {headsign}' },
  stopFollowing: { ca: 'Deixa de seguir aquest tren', es: 'Dejar de seguir este tren', eu: 'Utzi tren honi jarraitzeari', gl: 'Deixar de seguir este tren', en: 'Stop following this train' },
  onTime: { ca: 'puntual', es: 'puntual', eu: 'garaiz', gl: 'puntual', en: 'on time' },
  late: { ca: '{n} min de retard', es: '{n} min de retraso', eu: '{n} min atzeratuta', gl: '{n} min de atraso', en: '{n} min late' },
  early: { ca: "{n} min d'avançament", es: '{n} min de adelanto', eu: '{n} min aurreratuta', gl: '{n} min de adianto', en: '{n} min early' },
  confirmed: { ca: 'confirmat fa {ago}', es: 'confirmado hace {ago}', eu: 'duela {ago} baieztatua', gl: 'confirmado hai {ago}', en: 'confirmed {ago} ago' },
  // Where Renfe's last report named the Train at a Station it isn't held at, and its Delay draws it (#458).
  pinnedAt: { ca: 'Renfe el situa a {station}, fa {ago}', es: 'Renfe lo sitúa en {station}, hace {ago}', eu: 'Renfek {station} geltokian kokatzen du, duela {ago}', gl: 'Renfe sitúao en {station}, hai {ago}', en: 'Renfe has it at {station}, {ago} ago' },
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
  // The label instead, as the followed Train is arriving at it or stands at it (#455), and what goes before the time it leaves at then.
  nextStationArriving: { ca: 'Arribant a', es: 'Llegando a', eu: 'Iristen', gl: 'Chegando a', en: 'Arriving at' },
  nextStationStanding: { ca: "A l'estació", es: 'En la estación', eu: 'Geltokian', gl: 'Na estación', en: 'At station' },
  leaves: { ca: 'surt', es: 'sale', eu: 'irteera', gl: 'sae', en: 'leaves' },
  // In place of when it leaves, where the followed Train is held at the Station it stands at, its time to leave one its operator keeps moving or that has come already (#689).
  waiting: { ca: 'esperant per sortir', es: 'esperando para salir', eu: 'irteteko zain', gl: 'agardando para saír', en: 'waiting to leave' },
  // The followed Train's strip's name with its fold open, as it lists the Stations the Train has already left too, and Search's section of the Stations it finds (#471); and what a screen reader hears after each of those the Train has left, whose subject is the Train, so that it needn't agree with a Station's name.
  stations: { ca: 'Estacions', es: 'Estaciones', eu: 'Geltokiak', gl: 'Estacións', en: 'Stations' },
  passed: { ca: 'ja hi ha passat', es: 'ya ha pasado', eu: 'dagoeneko igaro da', gl: 'xa pasou', en: 'passed' },
  // Where the followed Train's next Stations start: where it is by how it's drawn (#455), arriving at the Station it comes to, leaving the one it left, passing one it doesn't call at (#457), or between the two, {a} and {b}.
  arriving: { ca: 'Arribant a {station}', es: 'Llegando a {station}', eu: '{station} geltokira iristen', gl: 'Chegando a {station}', en: 'Arriving at {station}' },
  leaving: { ca: 'Sortint de {station}', es: 'Saliendo de {station}', eu: '{station} geltokitik irteten', gl: 'Saíndo de {station}', en: 'Leaving {station}' },
  passing: { ca: 'Passant per {station}', es: 'Pasando por {station}', eu: '{station} geltokitik igarotzen', gl: 'Pasando por {station}', en: 'Passing {station}' },
  between: { ca: 'Entre {a} i {b}', es: 'Entre {a} y {b}', eu: '{a} eta {b} artean', gl: 'Entre {a} e {b}', en: 'Between {a} and {b}' },
  // How long until a Train comes: under a time on a board or in Nearby, and under the followed Train's next Station's, which counts in seconds in its last minute (#456). Their units are symbols, min and s, which have no plural,
  // and a no-break space (U+00A0) joins each to its number, so that a line of a card's paragraph never ends between them (#612).
  minutes: { ca: '{n}\u00A0min', es: '{n}\u00A0min', eu: '{n}\u00A0min', gl: '{n}\u00A0min', en: '{n}\u00A0min' },
  inMinutes: { ca: "d'aquí a {n}\u00A0min", es: 'en {n}\u00A0min', eu: '{n}\u00A0min barru', gl: 'en {n}\u00A0min', en: 'in {n}\u00A0min' },
  inSeconds: { ca: "d'aquí a {n}\u00A0s", es: 'en {n}\u00A0s', eu: '{n}\u00A0s barru', gl: 'en {n}\u00A0s', en: 'in {n}\u00A0s' },
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
  // A departure at a Station its Train won't stop at, as one cut short doesn't run to (#346) or within a closed Closure (#345), and that Station in the Train's strip (#420).
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
  // Over a card's Alerts, where an operator's file of them last changed over a day ago, {time} (alertsChanged(), #390). {by} is the operator's name, Renfe or TRAM, so Catalan's "de" needs no elision.
  alertsChanged: {
    ca: 'Avisos de {by}: darrer canvi el {time}',
    es: 'Avisos de {by}: último cambio el {time}',
    eu: 'Abisuak ({by}): azken aldaketa {time}',
    gl: 'Avisos de {by}: último cambio o {time}',
    en: "{by}'s alerts: last changed {time}",
  },
  // A tap on a Closure from the timetable (#341): its Line's buses in place of its Trains between two Stations, {a} and {b} (busesReplace()).
  busesReplace: {
    ca: 'Autobusos en lloc de trens entre {a} i {b}',
    es: 'Autobuses en lugar de trenes entre {a} y {b}',
    eu: 'Autobusak trenen ordez {a} eta {b} artean',
    gl: 'Autobuses no canto de trens entre {a} e {b}',
    en: 'Buses replace trains between {a} and {b}',
  },
  // A followed Train within a closed Closure that hides Trains, which the map doesn't draw there (#420): that it doesn't run between {a} and {b}, the Closure's Stations in the order it meets them (notRunning()).
  notRunning: {
    ca: 'No circula entre {a} i {b}',
    es: 'No circula entre {a} y {b}',
    eu: 'Ez da {a} eta {b} artean ibiltzen',
    gl: 'Non circula entre {a} e {b}',
    en: "Doesn't run between {a} and {b}",
  },
  // A tap on a Closure an Alert makes, once a Live Train of its Line has been seen within it (#422): {line}'s Trains run there, since {time}.
  trainsRunHere: {
    ca: '{line}: els trens hi circulen des de {time}',
    es: '{line}: los trenes circulan aquí desde {time}',
    eu: '{line}: trenak hemen ibiltzen dira {time} geroztik',
    gl: '{line}: os trens circulan aquí desde {time}',
    en: "{line}'s Trains have run here since {time}",
  },
  // The tab bar on a phone and the rail on a wide window (#470): its name, which a screen reader reads, and its tabs' labels, Nearby's being nearbyButton. Now's and Favourites' are for their tabs, which #474 and #472 add.
  tabBar: { ca: 'Principal', es: 'Principal', eu: 'Nagusia', gl: 'Principal', en: 'Main' },
  search: { ca: 'Cerca', es: 'Buscar', eu: 'Bilatu', gl: 'Buscar', en: 'Search' },
  nowTab: { ca: 'Ara', es: 'Ahora', eu: 'Orain', gl: 'Agora', en: 'Now' },
  favourites: { ca: 'Preferits', es: 'Favoritos', eu: 'Gogokoak', gl: 'Favoritos', en: 'Favourites' },
  // Search's sheet, which its tab opens: the button that closes it.
  closeSearch: { ca: 'Tanca la cerca', es: 'Cerrar la búsqueda', eu: 'Itxi bilaketa', gl: 'Pechar a busca', en: 'Close search' },
  // Its field (#471): what it says while it's empty, its name for a screen reader, and the button that clears it.
  searchPlaceholder: { ca: 'Estació, línia o número de tren', es: 'Estación, línea o número de tren', eu: 'Geltokia, linea edo tren-zenbakia', gl: 'Estación, liña ou número de tren', en: 'Station, line or train number' },
  searchLabel: {
    ca: 'Cerca una estació, una línia o un número de tren',
    es: 'Buscar una estación, una línea o un número de tren',
    eu: 'Bilatu geltoki bat, linea bat edo tren-zenbaki bat',
    gl: 'Buscar unha estación, unha liña ou un número de tren',
    en: 'Search for a station, a line or a train number',
  },
  clearSearch: { ca: 'Esborra la cerca', es: 'Borrar la búsqueda', eu: 'Ezabatu bilaketa', gl: 'Borrar a busca', en: 'Clear the search' },
  // Under the empty field, what it finds, beside examples, which are names: a Station, and a Train number, which only Renfe's Trains have, and which it finds among the Trips of the regions the map has loaded. A Line comes with a Line's screen (#473).
  find: { ca: 'Troba', es: 'Encuentra', eu: 'Aurkitu', gl: 'Atopa', en: 'Find' },
  // And a Line, with its screen (#473), before them, as Search lists Lines first; and the section of the Lines it finds.
  aLine: { ca: 'Una línia', es: 'Una línea', eu: 'Linea bat', gl: 'Unha liña', en: 'A line' },
  lines: { ca: 'Línies', es: 'Líneas', eu: 'Lineak', gl: 'Liñas', en: 'Lines' },
  aStation: { ca: 'Una estació', es: 'Una estación', eu: 'Geltoki bat', gl: 'Unha estación', en: 'A station' },
  aTrainNumber: { ca: 'Un número de tren', es: 'Un número de tren', eu: 'Tren-zenbaki bat', gl: 'Un número de tren', en: 'A train number' },
  renfeOnly: {
    ca: "Només trens de Renfe, de les zones del mapa ja carregades: cap d'FGC, del TRAM ni del metro no en té",
    es: 'Solo trenes de Renfe, de las zonas del mapa ya cargadas: ninguno de FGC, del TRAM ni del metro tiene',
    eu: 'Renferen trenak bakarrik, maparen kargatutako eremuetakoak: FGC, TRAM eta metroko trenek ez dute zenbakirik',
    gl: 'Só trens de Renfe, das zonas do mapa xa cargadas: ningún de FGC, do TRAM nin do metro ten',
    en: "Renfe's trains only, in the parts of the map loaded so far: none of FGC, TRAM or the Metro has one",
  },
  // Its section of the Train numbers it finds, after that of the Stations (`stations`); and under it, how many more it found, {n}, whose numbers start with what was typed, {query}.
  trainNumbers: { ca: 'Números de tren', es: 'Números de tren', eu: 'Tren-zenbakiak', gl: 'Números de tren', en: 'Train numbers' },
  moreNumbers: { ca: '{n} més amb un número que comença per {query}', es: '{n} más con un número que empieza por {query}', eu: 'Beste {n}, {query} hasierako zenbakiarekin', gl: '{n} máis cun número que comeza por {query}', en: '{n} more with a number starting {query}' },
  oneMoreNumber: { ca: '{n} més amb un número que comença per {query}', es: '{n} más con un número que empieza por {query}', eu: 'Beste bat, {query} hasierako zenbakiarekin', gl: '{n} máis cun número que comeza por {query}', en: '{n} more with a number starting {query}' },
  // What it says where it finds nothing for what was typed, {query}.
  nothingFound: { ca: "No s'ha trobat res per a «{query}».", es: 'No se ha encontrado nada para «{query}».', eu: 'Ez da ezer aurkitu «{query}» bilaketarako.', gl: 'Non se atopou nada para «{query}».', en: 'Nothing found for “{query}”.' },
  // A Train number's row: the number, {number}, and where its Train is headed, {headsign}; under them, after Live or Scheduled, its next Station, {station}, and when it's due there, {time}; or when it reached its last Station, once it has ended. One still to leave says where and when with leavesAt.
  trainTo: { ca: '{number} cap a {headsign}', es: '{number} hacia {headsign}', eu: '{number}, {headsign} aldera', gl: '{number} cara a {headsign}', en: '{number} to {headsign}' },
  nextAt: { ca: 'propera: {station}, {time}', es: 'próxima: {station}, {time}', eu: 'hurrengoa: {station}, {time}', gl: 'próxima: {station}, {time}', en: 'next {station}, {time}' },
  // A Line's screen (#473): its state under its header, where {n} is how many, and its worst Delay in minutes; under a Train's row on its strip, the Station it stands at; and how its strip marks a Station
  // where {n} of the {m} Trains that call there start or end, the end a spur goes on from, and the spur's own end. A number keeps its unit on its line (U+00A0).
  trainsNow: { ca: '{n} trens ara', es: '{n} trenes ahora', eu: '{n} tren orain', gl: '{n} trens agora', en: '{n} trains now' },
  oneTrainNow: { ca: '{n} tren ara', es: '{n} tren ahora', eu: 'Tren bat orain', gl: '{n} tren agora', en: '{n} train now' },
  noTrainsNow: { ca: 'Cap tren ara', es: 'Ningún tren ahora', eu: 'Trenik ez orain', gl: 'Ningún tren agora', en: 'No trains now' },
  worst: { ca: 'el pitjor +{n}\u00A0min', es: 'el peor +{n}\u00A0min', eu: 'okerrena +{n}\u00A0min', gl: 'o peor +{n}\u00A0min', en: 'worst +{n}\u00A0min' },
  allScheduled: { ca: 'tots programats', es: 'todos programados', eu: 'denak programatuta', gl: 'todos programados', en: 'all scheduled' },
  lateCount: { ca: '{n} amb retard', es: '{n} con retraso', eu: '{n} atzeratuta', gl: '{n} con atraso', en: '{n} late' },
  cancelledCount: { ca: '{n} cancel·lats', es: '{n} cancelados', eu: '{n} bertan behera', gl: '{n} cancelados', en: '{n} cancelled' },
  oneCancelled: { ca: '{n} cancel·lat', es: '{n} cancelado', eu: '{n} bertan behera', gl: '{n} cancelado', en: '{n} cancelled' },
  standingAt: { ca: 'Aturat a {station}', es: 'Detenido en {station}', eu: '{station} geltokian geldirik', gl: 'Parado en {station}', en: 'Standing at {station}' },
  turnsHere: { ca: '{n} de {m} trens surten o acaben aquí', es: '{n} de {m} trenes salen o terminan aquí', eu: '{m} trenetatik {n} hemen hasi edo amaitzen dira', gl: '{n} de {m} trens saen ou rematan aquí', en: '{n} of {m} trains start or end here' },
  goOn: { ca: '{n} trens continuen fins a {station}', es: '{n} trenes siguen hasta {station}', eu: '{n} tren {station} arte jarraitzen dute', gl: '{n} trens seguen ata {station}', en: '{n} trains go on to {station}' },
  oneGoesOn: { ca: '{n} tren continua fins a {station}', es: '{n} tren sigue hasta {station}', eu: 'Tren bat {station} arte jarraitzen du', gl: '{n} tren segue ata {station}', en: '{n} train goes on to {station}' },
  endsHere: { ca: 'Final: {n} trens al dia', es: 'Final: {n} trenes al día', eu: 'Amaiera: {n} tren egunean', gl: 'Final: {n} trens ao día', en: 'Ends here: {n} trains a day' },
  oneEndsHere: { ca: 'Final: {n} tren al dia', es: 'Final: {n} tren al día', eu: 'Amaiera: tren bat egunean', gl: 'Final: {n} tren ao día', en: 'Ends here: {n} train a day' },
  closeLine: { ca: 'Tanca la línia', es: 'Cerrar la línea', eu: 'Itxi linea', gl: 'Pechar a liña', en: 'Close the line' },
  endedAt: { ca: 'Ha acabat a les {time}', es: 'Terminó a las {time}', eu: 'Amaitu da: {time}', gl: 'Rematou ás {time}', en: 'Ended at {time}' },
  // Nearby Trains: their panel's title, and the tab that opens them (#470).
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
  // The button that tilts the map, pressed from half the tilt up (#326, #440).
  tilt: { ca: 'Inclina el mapa', es: 'Inclinar el mapa', eu: 'Okertu mapa', gl: 'Inclinar o mapa', en: 'Tilt the map' },
  // The button that follows a random Train, under Tilt and Centre.
  followRandom: { ca: "Segueix un tren a l'atzar", es: 'Seguir un tren al azar', eu: 'Jarraitu ausazko tren bati', gl: 'Seguir un tren ao chou', en: 'Follow a random train' },
  // The button that takes a followed Train back to the middle of the map, once the viewer has dragged the map off it.
  centre: { ca: 'Centra el mapa en el tren', es: 'Centrar el mapa en el tren', eu: 'Zentratu mapa trenean', gl: 'Centrar o mapa no tren', en: 'Centre the map on the train' },
  // The handle at the top of the panel on a phone, which pulls it up or lets it down.
  showMore: { ca: 'Mostra més', es: 'Mostrar más', eu: 'Erakutsi gehiago', gl: 'Amosar máis', en: 'Show more' },
  showLess: { ca: 'Mostra menys', es: 'Mostrar menos', eu: 'Erakutsi gutxiago', gl: 'Amosar menos', en: 'Show less' },
  // The About dialog, and the legend's button that opens it.
  about: { ca: 'Quant a aquest mapa', es: 'Acerca de este mapa', eu: 'Mapa honi buruz', gl: 'Sobre este mapa', en: 'About this map' },
  close: { ca: 'Tanca', es: 'Cerrar', eu: 'Itxi', gl: 'Pechar', en: 'Close' },
  estimates: {
    ca: "Via Península mostra els trens, metros i tramvies de Catalunya, els trens de Cercanías de Renfe a la resta d'Espanya, i els trens AVE, de llarga distància, de mitja distància i Avant de Renfe, mentre circulen. Les posicions són estimacions derivades de les dades dels operadors, calculades a partir dels horaris i de les dades en temps real.",
    es: 'Via Península muestra los trenes, metros y tranvías de Cataluña, los trenes de Cercanías de Renfe en el resto de España, y los trenes AVE, de larga distancia, de media distancia y Avant de Renfe, mientras circulan. Las posiciones son estimaciones derivadas de los datos de los operadores, calculadas a partir de los horarios y de los datos en tiempo real.',
    eu: 'Via Penínsulak Kataluniako trenak, metroak eta tranbiak erakusten ditu, baita Renferen Cercanías trenak ere Espainiako gainerako lekuetan, eta Renferen AVE, distantzia luzeko, distantzia ertaineko eta Avant trenak, dabiltzan bitartean. Posizioak operadoreen datuetatik ateratako zenbatespenak dira, ordutegietatik eta denbora errealeko datuetatik kalkulatuak.',
    gl: 'Via Península amosa os trens, metros e tranvías de Cataluña, os trens de Cercanías de Renfe no resto de España, e os trens AVE, de longa distancia, de media distancia e Avant de Renfe, mentres circulan. As posicións son estimacións derivadas dos datos dos operadores, calculadas a partir dos horarios e dos datos en tempo real.',
    en: "Via Península shows Catalonia's trains, metros and trams, Renfe's Cercanías trains in the rest of Spain, and Renfe's AVE, long-distance, Media Distancia and Avant trains, as they run. Their positions are estimates derived from the operators' data, built from timetables and live data.",
  },
  // After estimates: why Iryo's high-speed trains aren't on the map (ADR-0010).
  noIryo: {
    ca: 'Iryo no publica cap dada dels seus trens, de manera que no surten al mapa.',
    es: 'Iryo no publica ningún dato de sus trenes, así que no aparecen en el mapa.',
    eu: 'Iryok ez du bere trenei buruzko daturik argitaratzen, eta, beraz, ez dira mapan agertzen.',
    gl: 'Iryo non publica ningún dato dos seus trens, así que non aparecen no mapa.',
    en: "Iryo publishes no data on its trains, so they aren't on the map.",
  },
  // After noIryo: that Ouigo's Trains are only ever Scheduled, as Ouigo publishes no live data (ADR-0010, #264).
  noLiveOuigo: {
    ca: "Ouigo no publica dades en temps real dels seus trens, de manera que surten al mapa només segons l'horari.",
    es: 'Ouigo no publica datos en tiempo real de sus trenes, así que aparecen en el mapa solo según su horario.',
    eu: 'Ouigok ez du bere trenei buruzko denbora errealeko daturik argitaratzen, eta, beraz, mapan ordutegiaren arabera bakarrik agertzen dira.',
    gl: 'Ouigo non publica datos en tempo real dos seus trens, así que aparecen no mapa só segundo o seu horario.',
    en: 'Ouigo publishes no live data on its trains, so the map shows them by their timetable alone.',
  },
  // After estimates: what a Train's pill says zoomed in, as pillOf() outlines it.
  outlines: {
    ca: 'Amb el mapa ampliat, cada tren és una etiqueta amb el nom de la seva línia, i la seva forma indica el tipus de servei: arrodonida per a les línies de rodalia i les suburbanes, acabada en punta als dos extrems per a les regionals, tallada en diagonal als dos extrems per a les de llarga distància, i quadrada amb les cantonades arrodonides per a les del metro de TMB, del TRAM, del tren-tramvia de Cadis, del cremallera i dels funiculars.',
    es: 'Con el mapa ampliado, cada tren es una etiqueta con el nombre de su línea, y su forma indica el tipo de servicio: redondeada para las líneas de cercanías y las suburbanas, acabada en punta por ambos extremos para las regionales, cortada en diagonal por ambos extremos para las de larga distancia, y cuadrada con las esquinas redondeadas para las del metro de TMB, del TRAM, del tren-tranvía de Cádiz, del cremallera y de los funiculares.',
    eu: 'Mapa handituta, tren bakoitza bere linearen izena daraman etiketa bat da, eta haren formak zerbitzu mota adierazten du: biribildua aldiriko eta hiri-inguruko lineetan, bi muturretan puntaduna eskualdeko lineetan, bi muturretan zeiharka moztua distantzia luzeko lineetan, eta izkina biribilduko karratua TMBren metroko, TRAMeko, Cadizko tren-tranbiako, kremailerako eta funikularretako lineetan.',
    gl: 'Co mapa ampliado, cada tren é unha etiqueta co nome da súa liña, e a súa forma indica o tipo de servizo: arredondada para as liñas de proximidade e as suburbanas, rematada en punta polos dous extremos para as rexionais, cortada en diagonal polos dous extremos para as de longa distancia, e cadrada coas esquinas arredondadas para as do metro de TMB, do TRAM, do tren-tranvía de Cádiz, do tren de cremalleira e dos funiculares.',
    en: "Zoomed in, each train is a label with its line's name, shaped by the line's kind of service: rounded for commuter and suburban lines, pointed at both ends for regional lines, slanted at both ends for long-distance lines, and a rounded square for the lines of TMB's metro, TRAM, Cádiz's tram-train, the rack railway and the funiculars.",
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

/**
 * How long until a Train comes, `n` from now, in `lang`, or else the language the interface speaks now: `n` minutes as
 * `minutes` has it, or for the followed Train's next Station `inMinutes`, or its seconds in its last minute `inSeconds`
 * (#456); or now, for none.
 */
export const toGo = (n: number, phrase: 'minutes' | 'inMinutes' | 'inSeconds', lang = language()): string =>
  n > 0 ? STRINGS[phrase][lang].replace('{n}', String(n)) : STRINGS.now[lang];

/** The banner's short form, saying that a Network's live data is unavailable, by its name, in `lang`, or else the language the interface speaks now. */
export const liveUnavailable = (network: string, lang = language()): string => STRINGS.liveUnavailable[lang].replace('{network}', network);

/**
 * What Catalan and Galician make of a preposition and the article a name starts with, by the article and
 * then the preposition: Catalan's "al Prat" (El Prat), "als Monjos" (Els Monjos), "del", "dels", "pel" and
 * "pels"; Galician's "á Coruña" (A Coruña), "ao Porriño" (O Porriño), "ás", "aos", "da", "do", "das",
 * "dos", "na", "no", "nas", "nos", "pola", "polo", "polas" and "polos" (#606).
 */
const CONTRACTED: Partial<Record<Language, Record<string, Record<string, string>>>> = {
  ca: { El: { a: 'al', de: 'del', per: 'pel' }, Els: { a: 'als', de: 'dels', per: 'pels' } },
  gl: {
    A: { a: 'á', de: 'da', en: 'na', por: 'pola' },
    As: { a: 'ás', de: 'das', en: 'nas', por: 'polas' },
    O: { a: 'ao', de: 'do', en: 'no', por: 'polo' },
    Os: { a: 'aos', de: 'dos', en: 'nos', por: 'polos' },
  },
};

/**
 * Whether a name or the rest of one starts with a vowel or an h, which Catalan's de elides before:
 * "d'Arenys de Mar", "d'Hostalric". Not an i or u that's a semivowel, before another vowel,
 * with an h or not: "de Huelva", "de Ialta" (the IEC's Ortografia catalana, 4.1.2d).
 */
const elides = (name: string): boolean => /^h?(?![iu][aeiou])[aeiou]/i.test(name.normalize('NFD'));

/**
 * `text` with `name`, a Station's name, a place's or a headsign, where its `slot` is, in `lang`: as it's
 * published, except that Catalan and Galician write the word before it as one with its article, which
 * the name has as a capital (CONTRACTED), and Catalan elides de before a vowel or an h, "d'Arenys de Mar",
 * and writes a name's La, Les and L' in lower case (#606). "Fins a", "cap a" and "cara a" end in a, and
 * Galician's "ata" takes no contraction. El before a vowel or an h is a Spanish name's, as Catalan writes
 * L' there, and a name of another language that starts with an article keeps it and its capital, with no
 * contraction and de elided before it: "a El Escorial", "d'El Escorial", "d'A Coruña" (the IEC's
 * Ortografia catalana, 4.1.2g and 4.2.2c). La, Les and L' go in lower case, "a la Garriga", "de les Borges
 * Blanques", "per l'Hospitalet", as the IEC writes a Catalan name's article in a sentence (its Regles d'ús
 * de les majúscules, 18.2); Galician, Spanish, Basque and English go by the name as published, as the RAE
 * has it for a capital article that's part of the name.
 * A name in another language than `lang`, by its Network's (setNameLanguages(), #673), keeps its article as it
 * has it, with its capital and no contraction, as the IEC does a Spanish name's: "a El Berrón", "d'El Casar",
 * "a La Garena". A name whose language the page doesn't know, as before its track says, goes by its text alone.
 * ponytail: an h that's aspirated, a loanword's, elides too, as no Station's name has one.
 */
const named = (text: string, slot: '{station}' | '{place}' | '{headsign}', name: string, lang: Language): string => {
  const [before = '', after = ''] = text.split(slot);
  const [, head = '', prep = ''] = /^(.*?)(\S+) $/s.exec(before) ?? [];
  const [article = '', ...words] = name.split(' ');
  const rest = words.join(' ');
  const known = nameLanguages.get(name);
  const own = known === undefined || known === lang;
  const into = own ? CONTRACTED[lang]?.[article]?.[prep] : undefined;
  if (into && !(article === 'El' && elides(rest))) return `${head}${into} ${rest}${after}`;
  if (lang === 'ca' && prep === 'de' && elides(name)) return `${head}d'${name}${after}`;
  return `${before}${lang === 'ca' && own ? name.replace(/^(?:La |Les |L')/, (lead) => lead.toLowerCase()) : name}${after}`;
};

/** The language of each Station's name the page knows, by the name (setNameLanguages(), #673). */
let nameLanguages = new Map<string, string>();

/**
 * Tells the sentences the language of each Station's name, as its Networks' configs give it (#673): the language
 * its Network names it in, or one the Network names it in apart, as Rodalies' two Aragonese Stations, and of a
 * Station of several Networks, as Sants is Rodalies' and long distance's, the first that isn't Spanish, the
 * language every Network names in where it names none other.
 */
export function setNameLanguages(stations: { name: string; networks?: string[] }[], networks: { id: string; names?: { language: string; others?: Record<string, string> } }[]) {
  const of = new Map(networks.map((n) => [n.id, n.names]));
  nameLanguages = new Map(
    stations.flatMap(({ name, networks: own = [] }): [string, string][] => {
      const languages = own.flatMap((id) => {
        const names = of.get(id);
        return names ? [names.others?.[name] ?? names.language] : [];
      });
      return languages.length ? [[name, languages.find((l) => l !== 'es') ?? 'es']] : [];
    }),
  );
}

/** How many Stations a followed Train has still to come after its next, `n`, to its last, where it's headed, and when it's due there, in `lang`, or else the language the interface speaks now. */
export const moreStations = (n: number, headsign: string, time: string, lang = language()): string =>
  named(counting(n, 'oneMoreStation', 'moreStations', lang), '{headsign}', headsign, lang).replace('{time}', time);

/** A departure's button, naming what it follows (#322): its Line, where it's headed and when, in `lang`, or else the language the interface speaks now. */
export const followDeparture = (line: string, headsign: string, time: string, lang = language()): string =>
  named(STRINGS.followDeparture[lang].replace('{line}', line), '{headsign}', headsign, lang).replace('{time}', time);

/** Where a Trip still to come leaves, from which Station and when, in `lang`, or else the language the interface speaks now. */
export const leavesAt = (station: string, time: string, lang = language()): string => named(STRINGS.leavesAt[lang], '{station}', station, lang).replace('{time}', time);

/** A Train number's row in Search (#471): its number and where its Train is headed, in `lang`, or else the language the interface speaks now. */
export const trainTo = (number: string, headsign: string, lang = language()): string => named(STRINGS.trainTo[lang].replace('{number}', number), '{headsign}', headsign, lang);

/** Under a Train number's row in Search, the next Station its Train stops at and when it's due there (#471), in `lang`, or else the language the interface speaks now. */
export const nextAt = (station: string, time: string, lang = language()): string => named(STRINGS.nextAt[lang], '{station}', station, lang).replace('{time}', time);

/** Back, to a place whose board it was opened from, or to Nearby by its title, which no article of a name starts, in `lang`, or else the language the interface speaks now. */
export const backTo = (place: string, lang = language()): string => named(STRINGS.backTo[lang], '{place}', place, lang);

/** Back, to the Train it was opened from, by where it's headed, in `lang`, or else the language the interface speaks now. */
export const backToTrain = (headsign: string, lang = language()): string => named(STRINGS.backToTrain[lang], '{headsign}', headsign, lang);

/** How many Stations a followed Train has already left, `n`, atop its strip: while they're folded away, or hiding them once they're `shown`, in `lang`, or else the language the interface speaks now. */
export const earlierStations = (n: number, shown: boolean, lang = language()): string =>
  shown ? counting(n, 'oneHideEarlierStation', 'hideEarlierStations', lang) : counting(n, 'oneEarlierStation', 'earlierStations', lang);

/** How many departures more a board lists than it shows peeking, in `lang`, or else the language the interface speaks now. */
export const moreDepartures = (n: number, lang = language()): string => counting(n, 'oneMoreDeparture', 'moreDepartures', lang);

/** How many Train numbers more Search found than it shows, `n`, whose numbers start with what was typed, `query` (#471), in `lang`, or else the language the interface speaks now. */
export const moreNumbers = (n: number, query: string, lang = language()): string => counting(n, 'oneMoreNumber', 'moreNumbers', lang).replace('{query}', query);

/** How many Alerts a card has, `n`, in the line they're folded into, in `lang`, or else the language the interface speaks now. */
export const alertCount = (n: number, lang = language()): string => counting(n, 'oneAlert', 'alerts', lang);

/** How many Trains a Line has on the map now, `n` (#473), or that it has none, in `lang`, or else the language the interface speaks now. */
export const trainsNow = (n: number, lang = language()): string => (n ? counting(n, 'oneTrainNow', 'trainsNow', lang) : STRINGS.noTrainsNow[lang]);

/** How many of a Line's Trains are Cancelled, `n`, whose runs haven't ended (#473), in `lang`, or else the language the interface speaks now. */
export const cancelledCount = (n: number, lang = language()): string => counting(n, 'oneCancelled', 'cancelledCount', lang);

/** That a Train on a Line's strip stands at a Station (#473), in `lang`, or else the language the interface speaks now. */
export const standingAt = (station: string, lang = language()): string => named(STRINGS.standingAt[lang], '{station}', station, lang);

/** That `n` of the `m` Trains of a day that call at a Station start or end there (#473), in `lang`, or else the language the interface speaks now. */
export const turnsHere = (n: number, m: number, lang = language()): string => STRINGS.turnsHere[lang].replace('{n}', String(n)).replace('{m}', String(m));

/** That `n` Trains a day go on along a spur past the Line's end, as far as a Station (#473), in `lang`, or else the language the interface speaks now. */
export const goOn = (n: number, station: string, lang = language()): string => named(counting(n, 'oneGoesOn', 'goOn', lang), '{station}', station, lang);

/** That `n` Trains a day end at a spur's last Station (#473), in `lang`, or else the language the interface speaks now. */
export const endsHere = (n: number, lang = language()): string => counting(n, 'oneEndsHere', 'endsHere', lang);

/** Whose Alerts' file last changed, `by`, as Renfe or TRAM, and when, as a time and day already written, in `lang`, or else the language the interface speaks now (#390). */
export const alertsChanged = (by: string, time: string, lang = language()): string => STRINGS.alertsChanged[lang].replace('{by}', by).replace('{time}', time);

/**
 * A string naming two Stations, `{a}` and `{b}`, in `lang`: in Spanish with "e" for "y" before a name
 * starting with an i sound, as in "Hernani e Irun", but not "hie", as the RAE has it.
 */
const twoStations = (key: 'busesReplace' | 'notRunning' | 'between', a: string, b: string, lang: Language): string => {
  const text = STRINGS[key][lang].replace('{a}', a);
  return (lang === 'es' && /^h?[iíIÍ](?![aeoáéó])/i.test(b) ? text.replace(' y {b}', ' e {b}') : text).replace('{b}', b);
};

/** That buses run in a Line's Trains' place between two Stations, as the timetable's Closures say (#341), in `lang`, or else the language the interface speaks now. */
export const busesReplace = (a: string, b: string, lang = language()): string => twoStations('busesReplace', a, b, lang);

/** That a followed Train doesn't run between two Stations, `a` and `b`, a closed Closure's, which it's within and the map doesn't draw it in (#420), in `lang`, or else the language the interface speaks now. */
export const notRunning = (a: string, b: string, lang = language()): string => twoStations('notRunning', a, b, lang);

/** That a Line's Trains have run within a lifted Closure since `time` (#422), in `lang`, or else the language the interface speaks now. */
export const trainsRunHere = (line: string, time: string, lang = language()): string => STRINGS.trainsRunHere[lang].replace('{line}', line).replace('{time}', time);

/**
 * Where live data last placed a followed Train, `ago` before, in `lang`, or else the language the interface
 * speaks now: Live, that it's confirmed, but where Renfe's report pinned it to a Station it isn't held at,
 * `pinnedAt`, that Renfe has it there, as it's drawn by its Delay (#458); Scheduled, when it last was.
 */
export const placedBy = (live: boolean, ago: string, pinnedAt?: string, lang = language()): string =>
  (live && pinnedAt ? named(STRINGS.pinnedAt[lang], '{station}', pinnedAt, lang) : STRINGS[live ? 'confirmed' : 'lastConfirmed'][lang]).replace('{ago}', ago);

/** That a followed Train is arriving at a Station, by how it's drawn (#455), in `lang`, or else the language the interface speaks now. */
export const arrivingAt = (station: string, lang = language()): string => named(STRINGS.arriving[lang], '{station}', station, lang);

/** That a followed Train is leaving a Station, by how it's drawn (#455), in `lang`, or else the language the interface speaks now. */
export const leavingStation = (station: string, lang = language()): string => named(STRINGS.leaving[lang], '{station}', station, lang);

/** That a followed Train is between two Stations, by how it's drawn (#455), in `lang`, or else the language the interface speaks now. */
export const betweenStations = (a: string, b: string, lang = language()): string => twoStations('between', a, b, lang);

/** That a followed Train is passing a Station without stopping, by how it's drawn (#457), in `lang`, or else the language the interface speaks now. */
export const passingStation = (station: string, lang = language()): string => named(STRINGS.passing[lang], '{station}', station, lang);

/**
 * Why Nearby can't show the viewer's nearby Trains: the browser is finding where they are, as Nearby's
 * tab asked it, or again, as Try again did; it couldn't say, as its error's code tells, the viewer
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
