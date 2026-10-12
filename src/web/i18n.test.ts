import { readFileSync } from 'node:fs';
import { createExpression, latest, type ExpressionSpecification, type Feature, type StylePropertySpecification } from '@maplibre/maplibre-gl-style-spec';
import { afterEach, expect, test, vi } from 'vitest';
import { alertCount, alertsChanged, arrivingAt, backTo, backToTrain, basemapLabel, betweenStations, busesReplace, earlierStations, followDeparture, LANGUAGES, leavesAt, leavingStation, type Language, liveUnavailable, locale, MACHINE_TRANSLATED, moreDepartures, moreNumbers, moreStations, notRunning, passingStation, pickLanguage, t, toGo, trainCounts, trainsRunHere, unlocated } from './i18n.ts';

afterEach(() => {
  vi.restoreAllMocks();
});

test("speaks the first of the browser's languages it knows, whatever the region, and English when it knows none", () => {
  expect(pickLanguage(null, ['ca-ES', 'es-ES', 'en'])).toBe('ca');
  expect(pickLanguage(null, ['ca-ES-valencia'])).toBe('ca');
  expect(pickLanguage(null, ['es-419', 'en'])).toBe('es');
  expect(pickLanguage(null, ['en-GB', 'ca'])).toBe('en');
  expect(pickLanguage(null, ['fr-FR', 'fr', 'es'])).toBe('es');
  expect(pickLanguage(null, ['fr-FR', 'de'])).toBe('en');
  expect(pickLanguage(null, [])).toBe('en');
});

test("speaks Basque or Galician to a browser that prefers it, in the order of the browser's languages", () => {
  expect(pickLanguage(null, ['eu-ES'])).toBe('eu');
  expect(pickLanguage(null, ['gl'])).toBe('gl');
  expect(pickLanguage(null, ['eu', 'en'])).toBe('eu');
  expect(pickLanguage(null, ['gl-ES', 'es-ES', 'es'])).toBe('gl');
  expect(pickLanguage(null, ['en', 'eu'])).toBe('en');
  expect(pickLanguage(null, ['ca-ES', 'eu'])).toBe('ca');
  expect(pickLanguage(null, ['es-ES', 'gl'])).toBe('es');
});

test('speaks the language the viewer chose on this device, whatever their browser prefers', () => {
  expect(pickLanguage('es', ['ca-ES', 'ca'])).toBe('es');
  expect(pickLanguage('en', [])).toBe('en');
  // A stored language the interface doesn't speak is ignored.
  expect(pickLanguage('fr', ['ca-ES'])).toBe('ca');
  // A chosen language wins over Basque and Galician too, and Basque or Galician, once chosen, wins.
  expect(pickLanguage('ca', ['eu-ES'])).toBe('ca');
  expect(pickLanguage('en', ['gl', 'eu'])).toBe('en');
  expect(pickLanguage('eu', ['es-ES', 'es'])).toBe('eu');
  expect(pickLanguage('gl', ['eu-ES'])).toBe('gl');
});

/** OpenFreeMap's positron's label for places, seas and airports, by a feature's own name, as main.ts makes it of the English name it gives. */
const OWN: ExpressionSpecification = ['case', ['has', 'name:nonlatin'], ['concat', ['get', 'name:latin'], '\n', ['get', 'name:nonlatin']], ['coalesce', ['get', 'name'], ['get', 'name']]];

/**
 * What the basemap labels a feature with these properties, with the interface in each language, as
 * MapLibre evaluates a symbol's text, which fails as MapLibre would where the label isn't text. The
 * style spec's types have no `formatted` property, as text-field is in its reference.
 */
function labels(properties: Record<string, string>): Record<Language, string> {
  const textField = latest.layout_symbol['text-field'] as unknown as StylePropertySpecification;
  const each = Object.keys(LANGUAGES).map((lang) => {
    const label = createExpression(basemapLabel(OWN), 'text-field', textField, { language: lang });
    if (label.result === 'error') throw new Error(label.value.map((e) => e.message).join('; '));
    return [lang, String(label.value.evaluate({ zoom: 5 }, { type: 1, properties } as Feature))];
  });
  return Object.fromEntries(each);
}

test("names a country, a sea or an airport on the basemap in the viewer's language: Basque by the tiles' name:eu, and Galician by their Spanish, as they have no name:gl", () => {
  const france = { class: 'country', name: 'France', 'name:latin': 'France', 'name:ca': 'França', 'name:es': 'Francia', 'name:eu': 'Frantzia', 'name:en': 'France' };
  expect(labels(france)).toEqual({ ca: 'França', es: 'Francia', eu: 'Frantzia', gl: 'Francia', en: 'France' });
  const sea = { class: 'sea', name: 'Mediterranean Sea', 'name:latin': 'Mediterranean Sea', 'name:ca': 'Mar Mediterrània', 'name:es': 'Mar Mediterráneo', 'name:eu': 'Mediterraneo itsasoa' };
  expect(labels(sea)).toEqual({ ca: 'Mar Mediterrània', es: 'Mar Mediterráneo', eu: 'Mediterraneo itsasoa', gl: 'Mar Mediterráneo', en: 'Mediterranean Sea' });
  const airport = { class: 'international', iata: 'BIO', name: 'Bilboko aireportua', 'name:latin': 'Bilboko aireportua', 'name:es': 'Aeropuerto de Bilbao', 'name:en': 'Bilbao Airport' };
  expect(labels(airport)).toEqual({ ca: 'Bilboko aireportua', es: 'Aeropuerto de Bilbao', eu: 'Bilboko aireportua', gl: 'Aeropuerto de Bilbao', en: 'Bilbao Airport' });
});

test('names a region on the basemap by its own name in a language the tiles have no name in, Galician too where they have no Spanish', () => {
  const region = { class: 'state', name: 'Occitanie', 'name:latin': 'Occitanie', 'name:ca': 'Occitània', 'name:en': 'Occitania' };
  expect(labels(region)).toEqual({ ca: 'Occitània', es: 'Occitanie', eu: 'Occitanie', gl: 'Occitanie', en: 'Occitania' });
});

test('names towns on the basemap by their own names in every language, whatever the tiles call them in others', () => {
  const town = { class: 'city', name: 'A Coruña', 'name:latin': 'A Coruña', 'name:es': 'La Coruña', 'name:eu': 'A Coruña', 'name:en': 'A Coruña' };
  expect(labels(town)).toEqual({ ca: 'A Coruña', es: 'A Coruña', eu: 'A Coruña', gl: 'A Coruña', en: 'A Coruña' });
});

test('counts the Trains on the map in the legend, Live and Scheduled, in each language', () => {
  expect(trainCounts(343, 68, 'ca')).toEqual(['343 en directe', '68 programats']);
  expect(trainCounts(343, 68, 'es')).toEqual(['343 en directo', '68 programados']);
  expect(trainCounts(343, 68, 'en')).toEqual(['343 live', '68 scheduled']);
  expect(trainCounts(343, 68, 'eu')).toEqual(['343 zuzenean', '68 programatuta']);
  expect(trainCounts(343, 68, 'gl')).toEqual(['343 en directo', '68 programados']);
});

test('counts one Scheduled Train in the singular, and none in the plural', () => {
  expect(trainCounts(0, 1, 'ca')).toEqual(['0 en directe', '1 programat']);
  expect(trainCounts(1, 1, 'es')).toEqual(['1 en directo', '1 programado']);
  expect(trainCounts(1, 0, 'en')).toEqual(['1 live', '0 scheduled']);
  expect(trainCounts(0, 0, 'ca')).toEqual(['0 en directe', '0 programats']);
  expect(trainCounts(0, 1, 'gl')).toEqual(['0 en directo', '1 programado']);
  expect(trainCounts(1, 0, 'gl')).toEqual(['1 en directo', '0 programados']);
});

test('counts one as singular and any other number as plural in every language it speaks, as counting() takes them to', () => {
  for (const lang of Object.keys(LANGUAGES)) expect([0, 1, 2, 21].map((n) => new Intl.PluralRules(lang).select(n))).toEqual(['other', 'one', 'other', 'other']);
});

test("writes dates, times and numbers as the viewer's language does, or as Spanish does in a browser with no data for it, as Chrome has none for Basque or Galician", () => {
  const day = (lang: Language) => new Intl.DateTimeFormat(locale(lang), { dateStyle: 'medium', timeZone: 'UTC' }).format(Date.UTC(2026, 9, 7));
  expect(day('eu')).toBe('2026(e)ko urr. 7(a)');
  expect(day('gl')).toBe('7 de out. de 2026');
  // Chrome 154's data: Catalan's, Spanish's and English's, and not Basque's or Galician's.
  vi.spyOn(Intl.DateTimeFormat, 'supportedLocalesOf').mockImplementation((tag) => (tag === 'eu' || tag === 'gl' ? [] : [String(tag)]));
  expect(day('eu')).toBe('7 oct 2026');
  expect(day('gl')).toBe('7 oct 2026');
  expect(day('ca')).toBe('7 d’oct. 2026');
  expect(day('en')).toBe('Oct 7, 2026');
});

test('says in the banner that a Network has no timetable today, in each language', () => {
  expect(t('noTimetable', 'ca')).toBe('sense horari avui');
  expect(t('noTimetable', 'es')).toBe('sin horario hoy');
  expect(t('noTimetable', 'en')).toBe('no timetable today');
  expect(t('noTimetable', 'eu')).toBe('gaur ordutegirik ez');
  expect(t('noTimetable', 'gl')).toBe('sen horario hoxe');
});

test('labels the button that tilts the map in each language', () => {
  expect(t('tilt', 'ca')).toBe('Inclina el mapa');
  expect(t('tilt', 'es')).toBe('Inclinar el mapa');
  expect(t('tilt', 'en')).toBe('Tilt the map');
  expect(t('tilt', 'eu')).toBe('Okertu mapa');
  expect(t('tilt', 'gl')).toBe('Inclinar o mapa');
});

test("labels the tab bar, its tabs and Search's close button in each language (#470)", () => {
  const strings = (lang: Language) => [t('tabBar', lang), t('search', lang), t('nearbyButton', lang), t('nowTab', lang), t('favourites', lang), t('closeSearch', lang)];
  expect(strings('ca')).toEqual(['Principal', 'Cerca', 'A prop', 'Ara', 'Preferits', 'Tanca la cerca']);
  expect(strings('es')).toEqual(['Principal', 'Buscar', 'Cerca', 'Ahora', 'Favoritos', 'Cerrar la búsqueda']);
  expect(strings('en')).toEqual(['Main', 'Search', 'Nearby', 'Now', 'Favourites', 'Close search']);
  expect(strings('eu')).toEqual(['Nagusia', 'Bilatu', 'Inguruan', 'Orain', 'Gogokoak', 'Itxi bilaketa']);
  expect(strings('gl')).toEqual(['Principal', 'Buscar', 'Preto', 'Agora', 'Favoritos', 'Pechar a busca']);
});

test("labels Search's field, says what it finds and that Train numbers are Renfe's only, of the parts of the map loaded, and names its sections, in each language (#471)", () => {
  const strings = (lang: Language) => [t('searchPlaceholder', lang), t('searchLabel', lang), t('clearSearch', lang), t('find', lang), t('aStation', lang), t('aTrainNumber', lang), t('renfeOnly', lang), t('stations', lang), t('trainNumbers', lang)];
  expect(strings('ca')).toEqual(['Estació o número de tren', 'Cerca una estació o un número de tren', 'Esborra la cerca', 'Troba', 'Una estació', 'Un número de tren', "Només trens de Renfe, de les zones del mapa ja carregades: cap d'FGC, del TRAM ni del metro no en té", 'Estacions', 'Números de tren']);
  expect(strings('es')).toEqual(['Estación o número de tren', 'Buscar una estación o un número de tren', 'Borrar la búsqueda', 'Encuentra', 'Una estación', 'Un número de tren', 'Solo trenes de Renfe, de las zonas del mapa ya cargadas: ninguno de FGC, del TRAM ni del metro tiene', 'Estaciones', 'Números de tren']);
  expect(strings('en')).toEqual(['Station or train number', 'Search for a station or a train number', 'Clear the search', 'Find', 'A station', 'A train number', "Renfe's trains only, in the parts of the map loaded so far: none of FGC, TRAM or the Metro has one", 'Stations', 'Train numbers']);
  expect(strings('eu')).toEqual(['Geltokia edo tren-zenbakia', 'Bilatu geltoki bat edo tren-zenbaki bat', 'Ezabatu bilaketa', 'Aurkitu', 'Geltoki bat', 'Tren-zenbaki bat', 'Renferen trenak bakarrik, maparen kargatutako eremuetakoak: FGC, TRAM eta metroko trenek ez dute zenbakirik', 'Geltokiak', 'Tren-zenbakiak']);
  expect(strings('gl')).toEqual(['Estación ou número de tren', 'Buscar unha estación ou un número de tren', 'Borrar a busca', 'Atopa', 'Unha estación', 'Un número de tren', 'Só trens de Renfe, das zonas do mapa xa cargadas: ningún de FGC, do TRAM nin do metro ten', 'Estacións', 'Números de tren']);
});

test("says what Search found nothing for, how many more Train numbers it found than it shows, and each Train number's row, in each language (#471)", () => {
  const rows = (lang: Language) => [
    t('nothingFound', lang).replace('{query}', 'xyz'),
    moreNumbers(27, '774', lang),
    moreNumbers(1, '774', lang),
    t('trainTo', lang).replace('{number}', '77428').replace('{headsign}', 'Manresa'),
    t('nextAt', lang).replace('{station}', 'Manresa').replace('{time}', '15:16'),
    t('leavesAt', lang).replace('{station}', 'Barcelona-Sants').replace('{time}', '15:16'),
    t('endedAt', lang).replace('{time}', '15:16'),
  ];
  expect(rows('ca')).toEqual(["No s'ha trobat res per a «xyz».", '27 més amb un número que comença per 774', '1 més amb un número que comença per 774', '77428 cap a Manresa', 'propera: Manresa, 15:16', 'Surt de Barcelona-Sants a les 15:16', 'Ha acabat a les 15:16']);
  expect(rows('es')).toEqual(['No se ha encontrado nada para «xyz».', '27 más con un número que empieza por 774', '1 más con un número que empieza por 774', '77428 hacia Manresa', 'próxima: Manresa, 15:16', 'Sale de Barcelona-Sants a las 15:16', 'Terminó a las 15:16']);
  expect(rows('en')).toEqual(['Nothing found for “xyz”.', '27 more with a number starting 774', '1 more with a number starting 774', '77428 to Manresa', 'next Manresa, 15:16', 'Leaves Barcelona-Sants at 15:16', 'Ended at 15:16']);
  expect(rows('eu')).toEqual(['Ez da ezer aurkitu «xyz» bilaketarako.', 'Beste 27, 774 hasierako zenbakiarekin', 'Beste bat, 774 hasierako zenbakiarekin', '77428, Manresa aldera', 'hurrengoa: Manresa, 15:16', 'Barcelona-Sants geltokitik irtengo da, 15:16', 'Amaitu da: 15:16']);
  expect(rows('gl')).toEqual(['Non se atopou nada para «xyz».', '27 máis cun número que comeza por 774', '1 máis cun número que comeza por 774', '77428 cara a Manresa', 'próxima: Manresa, 15:16', 'Sae de Barcelona-Sants ás 15:16', 'Rematou ás 15:16']);
});

test('labels the button that follows a random Train in each language', () => {
  expect(t('followRandom', 'ca')).toBe("Segueix un tren a l'atzar");
  expect(t('followRandom', 'es')).toBe('Seguir un tren al azar');
  expect(t('followRandom', 'en')).toBe('Follow a random train');
  expect(t('followRandom', 'eu')).toBe('Jarraitu ausazko tren bati');
  expect(t('followRandom', 'gl')).toBe('Seguir un tren ao chou');
});

test("says in About what a Train's outline says of its Line's kind of service, long distance's slanted, in each language", () => {
  expect(t('outlines', 'ca')).toBe(
    'Amb el mapa ampliat, cada tren és una etiqueta amb el nom de la seva línia, i la seva forma indica el tipus de servei: arrodonida per a les línies de rodalia i les suburbanes, acabada en punta als dos extrems per a les regionals, tallada en diagonal als dos extrems per a les de llarga distància, i quadrada amb les cantonades arrodonides per a les del metro de TMB, del TRAM, del tren-tramvia de Cadis, del cremallera i dels funiculars.',
  );
  expect(t('outlines', 'es')).toBe(
    'Con el mapa ampliado, cada tren es una etiqueta con el nombre de su línea, y su forma indica el tipo de servicio: redondeada para las líneas de cercanías y las suburbanas, acabada en punta por ambos extremos para las regionales, cortada en diagonal por ambos extremos para las de larga distancia, y cuadrada con las esquinas redondeadas para las del metro de TMB, del TRAM, del tren-tranvía de Cádiz, del cremallera y de los funiculares.',
  );
  expect(t('outlines', 'en')).toBe(
    "Zoomed in, each train is a label with its line's name, shaped by the line's kind of service: rounded for commuter and suburban lines, pointed at both ends for regional lines, slanted at both ends for long-distance lines, and a rounded square for the lines of TMB's metro, TRAM, Cádiz's tram-train, the rack railway and the funiculars.",
  );
  expect(t('outlines', 'eu')).toBe(
    'Mapa handituta, tren bakoitza bere linearen izena daraman etiketa bat da, eta haren formak zerbitzu mota adierazten du: biribildua aldiriko eta hiri-inguruko lineetan, bi muturretan puntaduna eskualdeko lineetan, bi muturretan zeiharka moztua distantzia luzeko lineetan, eta izkina biribilduko karratua TMBren metroko, TRAMeko, Cadizko tren-tranbiako, kremailerako eta funikularretako lineetan.',
  );
  expect(t('outlines', 'gl')).toBe(
    'Co mapa ampliado, cada tren é unha etiqueta co nome da súa liña, e a súa forma indica o tipo de servizo: arredondada para as liñas de proximidade e as suburbanas, rematada en punta polos dous extremos para as rexionais, cortada en diagonal polos dous extremos para as de longa distancia, e cadrada coas esquinas arredondadas para as do metro de TMB, do TRAM, do tren-tranvía de Cádiz, do tren de cremalleira e dos funiculares.',
  );
});

test("says in About that the map shows Renfe's AVE and long-distance trains, and that Iryo's aren't on it as Iryo publishes nothing, in each language (ADR-0010)", () => {
  expect(t('estimates', 'en')).toBe(
    "Via Península shows Catalonia's trains, metros and trams, Renfe's Cercanías trains in the rest of Spain, and Renfe's AVE and long-distance trains, as they run. Their positions are estimates derived from the operators' data, built from timetables and live data.",
  );
  expect(t('noIryo', 'ca')).toBe('Iryo no publica cap dada dels seus trens, de manera que no surten al mapa.');
  expect(t('noIryo', 'es')).toBe('Iryo no publica ningún dato de sus trenes, así que no aparecen en el mapa.');
  expect(t('noIryo', 'en')).toBe("Iryo publishes no data on its trains, so they aren't on the map.");
  expect(t('noIryo', 'eu')).toBe('Iryok ez du bere trenei buruzko daturik argitaratzen, eta, beraz, ez dira mapan agertzen.');
  expect(t('noIryo', 'gl')).toBe('Iryo non publica ningún dato dos seus trens, así que non aparecen no mapa.');
});

test("says in About's Privacy that visits are counted, naming Cloudflare Web Analytics once in each language for its link", () => {
  expect(t('visitsCounted', 'en')).toBe('Visits are counted with Cloudflare Web Analytics, which uses no cookies and keeps nothing on your device.');
  for (const lang of Object.keys(LANGUAGES) as Language[]) expect(t('visitsCounted', lang).split('Cloudflare Web Analytics')).toHaveLength(2);
});

test('says atop About, in Basque and in Galician alone, that their texts are machine-translated, naming GitHub once for its link, for corrections', () => {
  expect(MACHINE_TRANSLATED).toEqual({
    eu: 'Euskarazko testuak itzulpen automatikoz eginak dira, eta hiztun batek ez ditu oraindik berrikusi. Zuzendu beharreko zerbait ikusten baduzu, jakinarazi iezaguzu GitHub-en.',
    gl: 'Os textos en galego son unha tradución automática, e aínda non os revisou ningún falante. Se ves algo que corrixir, avísanos en GitHub.',
  });
  for (const note of Object.values(MACHINE_TRANSLATED)) expect(note.split('GitHub')).toHaveLength(2);
});

test("counts down to a Train in minutes on a board and in Nearby, or says it's now, in each language", () => {
  expect(toGo(3, 'minutes', 'ca')).toBe('3 min');
  expect(toGo(3, 'minutes', 'es')).toBe('3 min');
  expect(toGo(3, 'minutes', 'en')).toBe('3 min');
  expect(toGo(0, 'minutes', 'ca')).toBe('ara');
  expect(toGo(0, 'minutes', 'es')).toBe('ahora');
  expect(toGo(0, 'minutes', 'en')).toBe('now');
  expect(toGo(3, 'minutes', 'eu')).toBe('3 min');
  expect(toGo(3, 'minutes', 'gl')).toBe('3 min');
  expect(toGo(0, 'minutes', 'eu')).toBe('orain');
  expect(toGo(0, 'minutes', 'gl')).toBe('agora');
});

test("counts down to a followed Train's next Station, or says it's now, in each language", () => {
  expect(toGo(1, 'inMinutes', 'ca')).toBe("d'aquí a 1 min");
  expect(toGo(1, 'inMinutes', 'es')).toBe('en 1 min');
  expect(toGo(1, 'inMinutes', 'en')).toBe('in 1 min');
  expect(toGo(0, 'inMinutes', 'en')).toBe('now');
  expect(toGo(1, 'inMinutes', 'eu')).toBe('1 min barru');
  expect(toGo(1, 'inMinutes', 'gl')).toBe('en 1 min');
});

test("counts down to a followed Train's next Station in seconds in its last minute, or says it's now, in each language (#456)", () => {
  expect(toGo(40, 'inSeconds', 'ca')).toBe("d'aquí a 40 s");
  expect(toGo(40, 'inSeconds', 'es')).toBe('en 40 s');
  expect(toGo(40, 'inSeconds', 'en')).toBe('in 40 s');
  expect(toGo(40, 'inSeconds', 'eu')).toBe('40 s barru');
  expect(toGo(40, 'inSeconds', 'gl')).toBe('en 40 s');
  // The unit is a symbol, which a count of one doesn't change.
  expect(toGo(1, 'inSeconds', 'en')).toBe('in 1 s');
  expect(toGo(1, 'inSeconds', 'ca')).toBe("d'aquí a 1 s");
  // Never "0 s": it's now, as the minutes' form says it.
  for (const lang of Object.keys(LANGUAGES) as Language[]) {
    expect(toGo(0, 'inSeconds', lang)).toBe(t('now', lang));
    expect(toGo(0, 'inSeconds', lang)).toBe(toGo(0, 'inMinutes', lang));
  }
});

test("a followed Train's countdown in seconds is its minutes' form with s for min in each language, so no wider, and it fits where that did (#456)", () => {
  for (const lang of Object.keys(LANGUAGES) as Language[]) {
    expect(toGo(59, 'inSeconds', lang).length).toBeLessThanOrEqual(toGo(59, 'inMinutes', lang).length);
    // And is the minutes' form with s for min, as the language writes that.
    expect(toGo(59, 'inSeconds', lang)).toBe(toGo(59, 'inMinutes', lang).replace(' min', ' s'));
  }
});

test("says at the foot of a peeking followed Train how many Stations it has still to come, and where it ends when, in each language", () => {
  expect(moreStations(22, 'Igualada', '9:33', 'ca')).toBe('22 estacions més, fins a Igualada (9:33)');
  expect(moreStations(22, 'Igualada', '9:33', 'es')).toBe('22 estaciones más, hasta Igualada (9:33)');
  expect(moreStations(22, 'Igualada', '9:33 AM', 'en')).toBe('22 more stations, to Igualada at 9:33 AM');
  expect(moreStations(1, 'Igualada', '9:33', 'ca')).toBe('1 estació més, fins a Igualada (9:33)');
  expect(moreStations(1, 'Igualada', '9:33', 'es')).toBe('1 estación más, hasta Igualada (9:33)');
  expect(moreStations(1, 'Igualada', '9:33 AM', 'en')).toBe('1 more station, to Igualada at 9:33 AM');
  expect(moreStations(22, 'Igualada', '09:33', 'eu')).toBe('22 geltoki gehiago, Igualada arte (09:33)');
  expect(moreStations(22, 'Igualada', '09:33', 'gl')).toBe('22 estacións máis, ata Igualada (09:33)');
  expect(moreStations(1, 'Igualada', '09:33', 'eu')).toBe('Geltoki bat gehiago, Igualada arte (09:33)');
  expect(moreStations(1, 'Igualada', '09:33', 'gl')).toBe('1 estación máis, ata Igualada (09:33)');
});

test("says atop a followed Train's strip how many Stations it has already left, folded away, in each language", () => {
  expect(earlierStations(11, false, 'ca')).toBe('11 estacions anteriors');
  expect(earlierStations(11, false, 'es')).toBe('11 estaciones anteriores');
  expect(earlierStations(11, false, 'en')).toBe('11 earlier stations');
  expect(earlierStations(1, false, 'ca')).toBe('1 estació anterior');
  expect(earlierStations(1, false, 'es')).toBe('1 estación anterior');
  expect(earlierStations(1, false, 'en')).toBe('1 earlier station');
  expect(earlierStations(11, false, 'eu')).toBe('Aurreko 11 geltoki');
  expect(earlierStations(11, false, 'gl')).toBe('11 estacións anteriores');
  expect(earlierStations(1, false, 'eu')).toBe('Aurreko geltoki bat');
  expect(earlierStations(1, false, 'gl')).toBe('1 estación anterior');
});

test("says atop a followed Train's strip that a tap hides the Stations it has already left, once they're shown, in each language", () => {
  expect(earlierStations(11, true, 'ca')).toBe('Amaga les 11 estacions anteriors');
  expect(earlierStations(11, true, 'es')).toBe('Ocultar las 11 estaciones anteriores');
  expect(earlierStations(11, true, 'en')).toBe('Hide 11 earlier stations');
  expect(earlierStations(1, true, 'ca')).toBe("Amaga l'estació anterior");
  expect(earlierStations(1, true, 'es')).toBe('Ocultar la estación anterior');
  expect(earlierStations(1, true, 'en')).toBe('Hide 1 earlier station');
  expect(earlierStations(11, true, 'eu')).toBe('Ezkutatu aurreko 11 geltokiak');
  expect(earlierStations(11, true, 'gl')).toBe('Agochar as 11 estacións anteriores');
  expect(earlierStations(1, true, 'eu')).toBe('Ezkutatu aurreko geltokia');
  expect(earlierStations(1, true, 'gl')).toBe('Agochar a estación anterior');
});

test('says at the foot of a peeking board how many departures more it has, in each language', () => {
  expect(moreDepartures(7, 'ca')).toBe('7 sortides més');
  expect(moreDepartures(7, 'es')).toBe('7 salidas más');
  expect(moreDepartures(7, 'en')).toBe('7 more departures');
  expect(moreDepartures(1, 'ca')).toBe('1 sortida més');
  expect(moreDepartures(1, 'es')).toBe('1 salida más');
  expect(moreDepartures(1, 'en')).toBe('1 more departure');
  expect(moreDepartures(7, 'eu')).toBe('7 irteera gehiago');
  expect(moreDepartures(7, 'gl')).toBe('7 saídas máis');
  expect(moreDepartures(1, 'eu')).toBe('Irteera bat gehiago');
  expect(moreDepartures(1, 'gl')).toBe('1 saída máis');
});

test("counts a card's Alerts in its folded line, in words, in each language", () => {
  expect(alertCount(2, 'ca')).toBe('2 avisos');
  expect(alertCount(2, 'es')).toBe('2 avisos');
  expect(alertCount(2, 'en')).toBe('2 alerts');
  expect(alertCount(1, 'ca')).toBe('1 avís');
  expect(alertCount(1, 'es')).toBe('1 aviso');
  expect(alertCount(1, 'en')).toBe('1 alert');
  expect(alertCount(2, 'eu')).toBe('2 abisu');
  expect(alertCount(2, 'gl')).toBe('2 avisos');
  expect(alertCount(1, 'eu')).toBe('Abisu bat');
  expect(alertCount(1, 'gl')).toBe('1 aviso');
});

test("says in Nearby that the browser isn't sharing the viewer's location where they refused it, and how to allow it, with Try again, in each language", () => {
  expect(unlocated('refused', 'ca')).toEqual({
    says: ['El navegador no comparteix la teva ubicació amb aquest mapa', 'Per veure els trens a prop, permet la ubicació per a aquest lloc a la configuració del navegador i torna-ho a provar'],
    tryAgain: 'Torna-ho a provar',
  });
  expect(unlocated('refused', 'es')).toEqual({
    says: ['El navegador no comparte tu ubicación con este mapa', 'Para ver los trenes cercanos, permite la ubicación para este sitio en la configuración del navegador y vuelve a intentarlo'],
    tryAgain: 'Volver a intentarlo',
  });
  expect(unlocated('refused', 'en')).toEqual({
    says: ["Your browser isn't sharing your location with this map", "To see nearby trains, allow location for this site in your browser's settings, then try again"],
    tryAgain: 'Try again',
  });
  expect(unlocated('refused', 'eu')).toEqual({
    says: ['Nabigatzaileak ez du zure kokapena mapa honekin partekatzen', 'Inguruko trenak ikusteko, baimendu kokapena gune honetarako nabigatzailearen ezarpenetan, eta saiatu berriro'],
    tryAgain: 'Saiatu berriro',
  });
  expect(unlocated('refused', 'gl')).toEqual({
    says: ['O navegador non comparte a túa localización con este mapa', 'Para ver os trens próximos, permite a localización para este sitio na configuración do navegador e téntao de novo'],
    tryAgain: 'Tentar de novo',
  });
});

test("says in Nearby, as ever, that the viewer's location isn't available where the browser had no fix in time, with Try again", () => {
  expect(unlocated('failed', 'ca')).toEqual({ says: ["No s'ha pogut saber on ets, així que no es poden mostrar els trens a prop"], tryAgain: 'Torna-ho a provar' });
  expect(unlocated('failed', 'es')).toEqual({ says: ['No se ha podido saber dónde estás, así que no se pueden mostrar los trenes cercanos'], tryAgain: 'Volver a intentarlo' });
  expect(unlocated('failed', 'en')).toEqual({ says: ["Your location isn't available, so nearby trains can't be shown"], tryAgain: 'Try again' });
  expect(unlocated('failed', 'eu')).toEqual({ says: ['Ezin izan da jakin non zauden; beraz, ezin dira inguruko trenak erakutsi'], tryAgain: 'Saiatu berriro' });
  expect(unlocated('failed', 'gl')).toEqual({ says: ['Non se puido saber onde estás, así que non se poden amosar os trens próximos'], tryAgain: 'Tentar de novo' });
});

test("says in Nearby, as ever, that the viewer's location isn't available where the browser has no geolocation at all, with no Try again", () => {
  expect(unlocated('unsupported', 'en')).toEqual({ says: ["Your location isn't available, so nearby trains can't be shown"] });
});

test("says in Nearby that it's finding where the viewer is, keeping Try again while it asks again, where the keyboard's focus may be", () => {
  expect(unlocated('locating', 'en')).toEqual({ says: ['Finding where you are…'] });
  expect(unlocated('retrying', 'en')).toEqual({ says: ['Finding where you are…'], tryAgain: 'Try again' });
});

test("says in the banner's short form that a Network's live data is unavailable, in each language", () => {
  expect(liveUnavailable('TRAM', 'ca')).toBe('TRAM: sense dades en temps real');
  expect(liveUnavailable('TRAM', 'es')).toBe('TRAM: sin datos en tiempo real');
  expect(liveUnavailable('TRAM', 'en')).toBe('TRAM live data unavailable');
  expect(liveUnavailable('TRAM', 'eu')).toBe('TRAM: denbora errealeko daturik ez');
  expect(liveUnavailable('TRAM', 'gl')).toBe('TRAM: sen datos en tempo real');
});

test("says a Closure from the timetable has buses in its Trains' place between its two Stations, in each language", () => {
  expect(busesReplace('Les Borges Blanques', 'La Plana-Picamoixons', 'ca')).toBe('Autobusos en lloc de trens entre Les Borges Blanques i La Plana-Picamoixons');
  expect(busesReplace('Les Borges Blanques', 'La Plana-Picamoixons', 'es')).toBe('Autobuses en lugar de trenes entre Les Borges Blanques y La Plana-Picamoixons');
  expect(busesReplace('Les Borges Blanques', 'La Plana-Picamoixons', 'en')).toBe('Buses replace trains between Les Borges Blanques and La Plana-Picamoixons');
  expect(busesReplace('Hernani', 'Irun', 'eu')).toBe('Autobusak trenen ordez Hernani eta Irun artean');
  expect(busesReplace('Hernani', 'Irun', 'gl')).toBe('Autobuses no canto de trens entre Hernani e Irun');
});

test('says "e" for "and" in Spanish before a name starting with an i sound, as in "Hernani e Irun", but not before one starting "hie"', () => {
  expect(busesReplace('Hernani', 'Irun', 'es')).toBe('Autobuses en lugar de trenes entre Hernani e Irun');
  expect(busesReplace('Lezo', 'Hipódromo', 'es')).toBe('Autobuses en lugar de trenes entre Lezo e Hipódromo');
  expect(busesReplace('Lezo', 'Hierro', 'es')).toBe('Autobuses en lugar de trenes entre Lezo y Hierro');
  expect(busesReplace('Lezo', 'Íllora', 'es')).toBe('Autobuses en lugar de trenes entre Lezo e Íllora');
});

test("says a followed Train within a closed Closure doesn't run between its Stations, in each language, with Spanish's \"e\" before an i sound (#420)", () => {
  expect(notRunning('Blanes', 'Maçanet-Massanes', 'en')).toBe("Doesn't run between Blanes and Maçanet-Massanes");
  expect(notRunning('Blanes', 'Maçanet-Massanes', 'ca')).toBe('No circula entre Blanes i Maçanet-Massanes');
  expect(notRunning('Blanes', 'Maçanet-Massanes', 'es')).toBe('No circula entre Blanes y Maçanet-Massanes');
  expect(notRunning('Hernani', 'Irun', 'es')).toBe('No circula entre Hernani e Irun');
  expect(notRunning('Hernani', 'Irun', 'eu')).toBe('Ez da Hernani eta Irun artean ibiltzen');
  expect(notRunning('Blanes', 'Maçanet-Massanes', 'gl')).toBe('Non circula entre Blanes e Maçanet-Massanes');
});

test("says a Line's Trains have run within a lifted Closure since a time, in each language (#422)", () => {
  expect(trainsRunHere('R1', '12:13', 'en')).toBe("R1's Trains have run here since 12:13");
  expect(trainsRunHere('R1', '12:13', 'ca')).toBe('R1: els trens hi circulen des de 12:13');
  expect(trainsRunHere('R1', '12:13', 'es')).toBe('R1: los trenes circulan aquí desde 12:13');
  expect(trainsRunHere('R1', '12:13', 'eu')).toBe('R1: trenak hemen ibiltzen dira 12:13 geroztik');
  expect(trainsRunHere('R1', '12:13', 'gl')).toBe('R1: os trens circulan aquí desde 12:13');
});

test("says whose Alerts last changed when, as a card does where that was over a day ago, in each language (#390)", () => {
  expect(alertsChanged('Renfe', 'Oct 7, 2026, 9:32 AM', 'en')).toBe("Renfe's alerts: last changed Oct 7, 2026, 9:32 AM");
  expect(alertsChanged('Renfe', '7 d’oct. 2026, 9:32', 'ca')).toBe('Avisos de Renfe: darrer canvi el 7 d’oct. 2026, 9:32');
  expect(alertsChanged('Renfe', '7 oct 2026, 9:32', 'es')).toBe('Avisos de Renfe: último cambio el 7 oct 2026, 9:32');
  expect(alertsChanged('TRAM', '7 oct 2026, 9:32', 'es')).toBe('Avisos de TRAM: último cambio el 7 oct 2026, 9:32');
  expect(alertsChanged('Renfe', '2026(e)ko urr. 7(a) (09:32)', 'eu')).toBe('Abisuak (Renfe): azken aldaketa 2026(e)ko urr. 7(a) (09:32)');
  expect(alertsChanged('Renfe', '7 de out. de 2026, 09:32', 'gl')).toBe('Avisos de Renfe: último cambio o 7 de out. de 2026, 09:32');
});

test("says where a followed Train is by how it's drawn, in each language: arriving at a Station, leaving one, and between two (#455)", () => {
  expect(arrivingAt('Sants', 'en')).toBe('Arriving at Sants');
  expect(arrivingAt('Sants', 'ca')).toBe('Arribant a Sants');
  expect(arrivingAt('Sants', 'es')).toBe('Llegando a Sants');
  expect(arrivingAt('Sants', 'eu')).toBe('Sants geltokira iristen');
  expect(arrivingAt('Sants', 'gl')).toBe('Chegando a Sants');
  expect(leavingStation('Sants', 'en')).toBe('Leaving Sants');
  expect(leavingStation('Sants', 'ca')).toBe('Sortint de Sants');
  expect(leavingStation('Sants', 'es')).toBe('Saliendo de Sants');
  expect(leavingStation('Sants', 'eu')).toBe('Sants geltokitik irteten');
  expect(leavingStation('Sants', 'gl')).toBe('Saíndo de Sants');
  expect(betweenStations('Sants', 'Plaça de Catalunya', 'en')).toBe('Between Sants and Plaça de Catalunya');
  expect(betweenStations('Sants', 'Plaça de Catalunya', 'ca')).toBe('Entre Sants i Plaça de Catalunya');
  expect(betweenStations('Sants', 'Plaça de Catalunya', 'es')).toBe('Entre Sants y Plaça de Catalunya');
  expect(betweenStations('Sants', 'Plaça de Catalunya', 'eu')).toBe('Sants eta Plaça de Catalunya artean');
  expect(betweenStations('Sants', 'Plaça de Catalunya', 'gl')).toBe('Entre Sants e Plaça de Catalunya');
});

test("says where a followed Train is passing a Station without stopping, in each language, Basque with the Station's name in front, as it says arriving and leaving (#457)", () => {
  expect(passingStation('Sants', 'en')).toBe('Passing Sants');
  expect(passingStation('Sants', 'ca')).toBe('Passant per Sants');
  expect(passingStation('Sants', 'es')).toBe('Pasando por Sants');
  expect(passingStation('Sants', 'eu')).toBe('Sants geltokitik igarotzen');
  expect(passingStation('Sants', 'gl')).toBe('Pasando por Sants');
  // L' goes in lower case in Catalan, as the IEC writes a Catalan name's article in a sentence (#606).
  expect(passingStation("L'Hospitalet de Llobregat", 'ca')).toBe("Passant per l'Hospitalet de Llobregat");
});

test('says "e" for "y" in Spanish between two Stations before a name starting with an i sound, as busesReplace() does for "and"', () => {
  expect(betweenStations('Hernani', 'Irun', 'es')).toBe('Entre Hernani e Irun');
  expect(betweenStations('Manresa', 'Igualada', 'es')).toBe('Entre Manresa e Igualada');
  expect(betweenStations('Lezo', 'Hierro', 'es')).toBe('Entre Lezo y Hierro');
  expect(betweenStations('Hernani', 'Irun', 'ca')).toBe('Entre Hernani i Irun');
});

test("labels a followed Train's next Station by whether it's arriving there or stands there, and what its time is then, in each language (#455)", () => {
  expect([t('nextStation', 'en'), t('nextStationArriving', 'en'), t('nextStationStanding', 'en'), t('leaves', 'en')]).toEqual(['Next station', 'Arriving at', 'At station', 'leaves']);
  expect([t('nextStation', 'ca'), t('nextStationArriving', 'ca'), t('nextStationStanding', 'ca'), t('leaves', 'ca')]).toEqual(['Propera estació', 'Arribant a', "A l'estació", 'surt']);
  expect([t('nextStation', 'es'), t('nextStationArriving', 'es'), t('nextStationStanding', 'es'), t('leaves', 'es')]).toEqual(['Próxima estación', 'Llegando a', 'En la estación', 'sale']);
  expect([t('nextStation', 'eu'), t('nextStationArriving', 'eu'), t('nextStationStanding', 'eu'), t('leaves', 'eu')]).toEqual(['Hurrengo geltokia', 'Iristen', 'Geltokian', 'irteera']);
  expect([t('nextStation', 'gl'), t('nextStationArriving', 'gl'), t('nextStationStanding', 'gl'), t('leaves', 'gl')]).toEqual(['Próxima estación', 'Chegando a', 'Na estación', 'sae']);
});

test("says what a departure's button follows, where a Trip still to come leaves, and where Back goes, in each language (#322)", () => {
  expect(followDeparture('R4', 'Manresa', '9:33', 'en')).toBe('Follow the R4 train to Manresa, 9:33');
  expect(followDeparture('R4', 'Manresa', '9:33', 'ca')).toBe('Segueix el tren R4 cap a Manresa, 9:33');
  expect(followDeparture('R4', 'Manresa', '9:33', 'es')).toBe('Seguir el tren R4 hacia Manresa, 9:33');
  expect(followDeparture('R4', 'Manresa', '09:33', 'eu')).toBe('Jarraitu R4 trena, Manresa aldera, 09:33');
  expect(followDeparture('R4', 'Manresa', '09:33', 'gl')).toBe('Seguir o tren R4 cara a Manresa, 09:33');
  expect(leavesAt('Sants', '9:33', 'en')).toBe('Leaves Sants at 9:33');
  expect(leavesAt('Sants', '9:33', 'ca')).toBe('Surt de Sants a les 9:33');
  expect(leavesAt('Sants', '9:33', 'es')).toBe('Sale de Sants a las 9:33');
  expect(leavesAt('Sants', '09:33', 'eu')).toBe('Sants geltokitik irtengo da, 09:33');
  expect(leavesAt('Sants', '09:33', 'gl')).toBe('Sae de Sants ás 09:33');
  expect(backTo('Sants', 'en')).toBe('Back to Sants');
  expect(backTo('Sants', 'ca')).toBe('Torna a Sants');
  expect(backTo('Sants', 'es')).toBe('Volver a Sants');
  expect(backTo('Sants', 'eu')).toBe('Itzuli: Sants');
  expect(backTo('Sants', 'gl')).toBe('Volver a Sants');
  expect(backToTrain('Manresa', 'en')).toBe('Back to the train to Manresa');
  expect(backToTrain('Manresa', 'ca')).toBe('Torna al tren cap a Manresa');
  expect(backToTrain('Manresa', 'es')).toBe('Volver al tren hacia Manresa');
  expect(backToTrain('Manresa', 'eu')).toBe('Itzuli Manresa aldeko trenera');
  expect(backToTrain('Manresa', 'gl')).toBe('Volver ao tren cara a Manresa');
});

// Real names, as a dry run of the build on the feeds of 9–11 Oct 2026 has them, for a headsign too, which Renfe's and
// TRAM's timetables don't have and the build gives a Trip as its last Station's: Rodalies', FGC's, the Metro's and
// TRAM's, Cercanías Madrid's, Asturias' and Ferrol's, and from Renfe's long-distance timetable, which the map doesn't
// draw yet (#262), 'A Coruña', 'O Porriño', 'As Neves', 'Os Peares', 'El Higuerón', 'Huelva' and 'Huesca'. 'Els
// Alamús' and 'Ialta' are places' names, not Stations' of either.

test("writes a Station's name in Catalan after a, de and per as Catalan does: El and Els run into the word before it, and de takes d' before a vowel or an h (#606)", () => {
  // a: El and Els contract, and nothing else does, as a never elides.
  expect(arrivingAt('El Prat de Llobregat', 'ca')).toBe('Arribant al Prat de Llobregat');
  expect(arrivingAt('El Masnou', 'ca')).toBe('Arribant al Masnou');
  expect(arrivingAt('Els Monjos', 'ca')).toBe('Arribant als Monjos');
  expect(arrivingAt('Arenys de Mar', 'ca')).toBe('Arribant a Arenys de Mar');
  expect(arrivingAt('Hostalric', 'ca')).toBe('Arribant a Hostalric');
  // de: del and dels, and d' before a vowel or an h, accented or not.
  expect(leavingStation('El Prat de Llobregat', 'ca')).toBe('Sortint del Prat de Llobregat');
  expect(leavingStation('El Masnou', 'ca')).toBe('Sortint del Masnou');
  expect(leavingStation('Els Monjos', 'ca')).toBe('Sortint dels Monjos');
  expect(leavingStation('Arenys de Mar', 'ca')).toBe("Sortint d'Arenys de Mar");
  expect(leavingStation('Hostalric', 'ca')).toBe("Sortint d'Hostalric");
  expect(leavingStation('Igualada', 'ca')).toBe("Sortint d'Igualada");
  expect(leavingStation('Àger', 'ca')).toBe("Sortint d'Àger");
  expect(leavingStation('Hospital de Bellvitge', 'ca')).toBe("Sortint d'Hospital de Bellvitge");
  expect(leavingStation('Barcelona-Sants', 'ca')).toBe('Sortint de Barcelona-Sants');
  // per: pel and pels, and never an elision.
  expect(passingStation('El Prat de Llobregat', 'ca')).toBe('Passant pel Prat de Llobregat');
  expect(passingStation('Els Monjos', 'ca')).toBe('Passant pels Monjos');
  expect(passingStation('Arenys de Mar', 'ca')).toBe('Passant per Arenys de Mar');
  expect(passingStation('Hostalric', 'ca')).toBe('Passant per Hostalric');
  // A name with a bar in it goes the same.
  expect(leavingStation('El Maresme | Fòrum', 'ca')).toBe('Sortint del Maresme | Fòrum');
});

test("doesn't elide de before an i or u that's a semivowel, with an h or not, as Catalan writes \"de Huelva\" (#606)", () => {
  for (const name of ['Huelva', 'Huesca', 'Huercal-Viator']) expect(leavingStation(name, 'ca')).toBe(`Sortint de ${name}`);
  // The IEC's own example of an i (a place's name, not a Station's of the bundle).
  expect(leavingStation('Ialta', 'ca')).toBe('Sortint de Ialta');
  // An i or u that's a vowel, before a consonant, elides as any other vowel does.
  expect(leavingStation('Humanes', 'ca')).toBe("Sortint d'Humanes");
  expect(leavingStation('Irun', 'ca')).toBe("Sortint d'Irun");
  expect(leavingStation('Urgell', 'ca')).toBe("Sortint d'Urgell");
});

test("writes La, Les and L' in lower case in Catalan, as the IEC writes a Catalan name's article in a sentence: \"a la Garriga\", \"de les Borges Blanques\", \"per l'Hospitalet\", from the maintainer's pick (#606)", () => {
  for (const [name, written] of [
    ['La Garriga', 'la Garriga'],
    ['La Pobla de Segur', 'la Pobla de Segur'],
    ['La Tor de Querol-Enveig', 'la Tor de Querol-Enveig'],
    ['Les Borges Blanques', 'les Borges Blanques'],
    ['Les Corts', 'les Corts'],
    ["L'Hospitalet de Llobregat", "l'Hospitalet de Llobregat"],
    ["L'Hospitalet de l'Infant", "l'Hospitalet de l'Infant"],
    ["L'Arboç", "l'Arboç"],
  ] as const) {
    expect(arrivingAt(name, 'ca')).toBe(`Arribant a ${written}`);
    expect(leavingStation(name, 'ca')).toBe(`Sortint de ${written}`);
    expect(passingStation(name, 'ca')).toBe(`Passant per ${written}`);
  }
  // The other sentences with a name after a preposition go the same: cap a, fins a, Back to a Train and to a place, and where a Trip leaves.
  expect(followDeparture('R3', 'La Tor de Querol-Enveig', '9:33', 'ca')).toBe('Segueix el tren R3 cap a la Tor de Querol-Enveig, 9:33');
  expect(moreStations(22, 'La Garriga', '9:33', 'ca')).toBe('22 estacions més, fins a la Garriga (9:33)');
  expect(moreStations(1, "L'Hospitalet de Llobregat", '9:33', 'ca')).toBe("1 estació més, fins a l'Hospitalet de Llobregat (9:33)");
  expect(backToTrain('Les Borges Blanques', 'ca')).toBe('Torna al tren cap a les Borges Blanques');
  expect(backTo("L'Hospitalet de Llobregat", 'ca')).toBe("Torna a l'Hospitalet de Llobregat");
  expect(leavesAt('La Garriga', '9:33', 'ca')).toBe('Surt de la Garriga a les 9:33');
  // A name that only starts with those letters has no article of them, and Los and Las aren't Catalan's.
  for (const name of ['Lleida', 'Lesseps', 'Laviana', 'Las Rozas', 'Los Nietos']) expect(arrivingAt(name, 'ca')).toBe(`Arribant a ${name}`);
});

test("leaves El before a vowel or an h as the name has it in Catalan, where it's a Spanish name's, with de elided before it: \"a El Escorial\", \"d'El Escorial\" (#606)", () => {
  expect(arrivingAt('El Escorial', 'ca')).toBe('Arribant a El Escorial');
  expect(leavingStation('El Escorial', 'ca')).toBe("Sortint d'El Escorial");
  expect(passingStation('El Escorial', 'ca')).toBe('Passant per El Escorial');
  expect(leavingStation('El Entrego', 'ca')).toBe("Sortint d'El Entrego");
  expect(arrivingAt('El Estrecho', 'ca')).toBe('Arribant a El Estrecho');
  expect(passingStation('El Higuerón', 'ca')).toBe('Passant per El Higuerón');
  // El before a consonant is contracted as Catalan's el is, whatever the name's language.
  expect(arrivingAt('El Barcenal', 'ca')).toBe('Arribant al Barcenal');
  // Els takes its contraction before a vowel too, as the plural article isn't elided (a municipality's name, not a Station's of the bundle).
  expect(arrivingAt('Els Alamús', 'ca')).toBe('Arribant als Alamús');
  // Los and Las aren't Catalan's, so they stay as the name has them, and a vowel after de elides as ever.
  expect(arrivingAt('Las Rozas', 'ca')).toBe('Arribant a Las Rozas');
  expect(leavingStation('Los Nietos', 'ca')).toBe('Sortint de Los Nietos');
  expect(leavingStation('Aranjuez', 'ca')).toBe("Sortint d'Aranjuez");
});

test("writes a Station's name in Galician after a, de and por as Galician does: A, O, As and Os run into the word before it (#606)", () => {
  expect(arrivingAt('A Coruña', 'gl')).toBe('Chegando á Coruña');
  expect(arrivingAt('A Cuqueira', 'gl')).toBe('Chegando á Cuqueira');
  expect(arrivingAt('O Porriño', 'gl')).toBe('Chegando ao Porriño');
  expect(arrivingAt('O Ponto', 'gl')).toBe('Chegando ao Ponto');
  expect(arrivingAt('As Neves', 'gl')).toBe('Chegando ás Neves');
  expect(arrivingAt('Os Peares', 'gl')).toBe('Chegando aos Peares');
  expect(leavingStation('A Coruña', 'gl')).toBe('Saíndo da Coruña');
  expect(leavingStation('O Porriño', 'gl')).toBe('Saíndo do Porriño');
  expect(leavingStation('As Neves', 'gl')).toBe('Saíndo das Neves');
  expect(leavingStation('Os Peares', 'gl')).toBe('Saíndo dos Peares');
  expect(passingStation('A Cuqueira', 'gl')).toBe('Pasando pola Cuqueira');
  expect(passingStation('O Ponto', 'gl')).toBe('Pasando polo Ponto');
  expect(passingStation('As Neves', 'gl')).toBe('Pasando polas Neves');
  expect(passingStation('Os Peares', 'gl')).toBe('Pasando polos Peares');
  // No article, no change, and Galician doesn't elide de: "de Ortigueira".
  expect(arrivingAt('Ferrol', 'gl')).toBe('Chegando a Ferrol');
  expect(leavingStation('Ferrol', 'gl')).toBe('Saíndo de Ferrol');
  expect(leavingStation('Ortigueira', 'gl')).toBe('Saíndo de Ortigueira');
  expect(passingStation('Ferrol', 'gl')).toBe('Pasando por Ferrol');
  // Another language's articles aren't Galician's.
  expect(leavingStation('El Prat de Llobregat', 'gl')).toBe('Saíndo de El Prat de Llobregat');
  expect(arrivingAt('Els Monjos', 'gl')).toBe('Chegando a Els Monjos');
  expect(passingStation('La Garriga', 'gl')).toBe('Pasando por La Garriga');
});

test("leaves a name as it's published in Spanish, Basque and English, as the RAE has a capital article that's part of a name in Spanish: \"a El Prat\", in each of the sentences that has one (#606)", () => {
  for (const name of ['El Prat de Llobregat', 'Els Monjos', 'A Coruña', 'O Porriño', 'Arenys de Mar', 'Hostalric', 'El Escorial', 'Huelva', 'La Garriga', 'Les Borges Blanques', "L'Hospitalet de Llobregat"]) {
    expect(arrivingAt(name, 'es')).toBe(`Llegando a ${name}`);
    expect(leavingStation(name, 'es')).toBe(`Saliendo de ${name}`);
    expect(passingStation(name, 'es')).toBe(`Pasando por ${name}`);
    expect(arrivingAt(name, 'eu')).toBe(`${name} geltokira iristen`);
    expect(leavingStation(name, 'eu')).toBe(`${name} geltokitik irteten`);
    expect(passingStation(name, 'eu')).toBe(`${name} geltokitik igarotzen`);
    expect(arrivingAt(name, 'en')).toBe(`Arriving at ${name}`);
    expect(leavingStation(name, 'en')).toBe(`Leaving ${name}`);
    expect(passingStation(name, 'en')).toBe(`Passing ${name}`);
    // The rest, as each language's string has the name put in.
    for (const lang of ['es', 'eu', 'en'] as const) {
      expect(leavesAt(name, '9:33', lang)).toBe(t('leavesAt', lang).replace('{station}', name).replace('{time}', '9:33'));
      expect(followDeparture('R2', name, '9:33', lang)).toBe(t('followDeparture', lang).replace('{line}', 'R2').replace('{headsign}', name).replace('{time}', '9:33'));
      expect(backTo(name, lang)).toBe(t('backTo', lang).replace('{place}', name));
      expect(backToTrain(name, lang)).toBe(t('backToTrain', lang).replace('{headsign}', name));
      expect(moreStations(22, name, '9:33', lang)).toBe(t('moreStations', lang).replace('{n}', '22').replace('{headsign}', name).replace('{time}', '9:33'));
      expect(moreStations(1, name, '9:33', lang)).toBe(t('oneMoreStation', lang).replace('{n}', '1').replace('{headsign}', name).replace('{time}', '9:33'));
    }
  }
});

test("writes a Galician name in a Catalan sentence by its first letter, which is a vowel: \"a A Coruña\" and \"d'A Coruña\" (#606)", () => {
  expect(arrivingAt('A Coruña', 'ca')).toBe('Arribant a A Coruña');
  expect(leavingStation('A Coruña', 'ca')).toBe("Sortint d'A Coruña");
  expect(leavingStation('O Porriño', 'ca')).toBe("Sortint d'O Porriño");
  expect(passingStation('As Neves', 'ca')).toBe('Passant per As Neves');
});

test("writes a headsign, a place or a Station's name after a preposition the same in the other sentences that have one: Follow, Leaves, Back and the Stations to come (#606)", () => {
  // cap a, from a button's label that follows a departure, and the Back to a Train.
  expect(followDeparture('R2', 'El Prat Aeroport', '9:33', 'ca')).toBe('Segueix el tren R2 cap al Prat Aeroport, 9:33');
  expect(followDeparture('R4', 'Els Monjos', '9:33', 'ca')).toBe('Segueix el tren R4 cap als Monjos, 9:33');
  expect(followDeparture('C8', 'El Escorial', '9:33', 'ca')).toBe('Segueix el tren C8 cap a El Escorial, 9:33');
  expect(followDeparture('L1', 'Hospital de Bellvitge', '9:33', 'ca')).toBe('Segueix el tren L1 cap a Hospital de Bellvitge, 9:33');
  expect(followDeparture('C1', 'A Coruña', '09:33', 'gl')).toBe('Seguir o tren C1 cara á Coruña, 09:33');
  expect(followDeparture('C1', 'O Porriño', '09:33', 'gl')).toBe('Seguir o tren C1 cara ao Porriño, 09:33');
  expect(followDeparture('R2', 'El Prat Aeroport', '9:33', 'es')).toBe('Seguir el tren R2 hacia El Prat Aeroport, 9:33');
  expect(followDeparture('R2', 'El Prat Aeroport', '09:33', 'eu')).toBe('Jarraitu R2 trena, El Prat Aeroport aldera, 09:33');
  expect(followDeparture('R2', 'El Prat Aeroport', '9:33 AM', 'en')).toBe('Follow the R2 train to El Prat Aeroport, 9:33 AM');
  expect(backToTrain('El Prat Aeroport', 'ca')).toBe('Torna al tren cap al Prat Aeroport');
  expect(backToTrain('Arenys de Mar', 'ca')).toBe('Torna al tren cap a Arenys de Mar');
  expect(backToTrain('A Coruña', 'gl')).toBe('Volver ao tren cara á Coruña');
  expect(backToTrain('El Prat Aeroport', 'es')).toBe('Volver al tren hacia El Prat Aeroport');
  // de, from where a Trip still to come leaves.
  expect(leavesAt('El Masnou', '9:33', 'ca')).toBe('Surt del Masnou a les 9:33');
  expect(leavesAt('Els Monjos', '9:33', 'ca')).toBe('Surt dels Monjos a les 9:33');
  expect(leavesAt('Arenys de Mar', '9:33', 'ca')).toBe("Surt d'Arenys de Mar a les 9:33");
  expect(leavesAt('A Coruña', '09:33', 'gl')).toBe('Sae da Coruña ás 09:33');
  expect(leavesAt('O Porriño', '09:33', 'gl')).toBe('Sae do Porriño ás 09:33');
  expect(leavesAt('El Masnou', '9:33', 'es')).toBe('Sale de El Masnou a las 9:33');
  expect(leavesAt('El Masnou', '09:33', 'eu')).toBe('El Masnou geltokitik irtengo da, 09:33');
  // a, from Back to a place's board.
  expect(backTo('El Masnou', 'ca')).toBe('Torna al Masnou');
  expect(backTo('Els Monjos', 'ca')).toBe('Torna als Monjos');
  expect(backTo('Arenys de Mar', 'ca')).toBe('Torna a Arenys de Mar');
  expect(backTo('A Coruña', 'gl')).toBe('Volver á Coruña');
  expect(backTo('O Porriño', 'gl')).toBe('Volver ao Porriño');
  expect(backTo('El Masnou', 'es')).toBe('Volver a El Masnou');
  // fins a, atop a peeking Train's strip: where its last Station is, which Galician's "ata" doesn't contract with.
  expect(moreStations(22, 'El Prat Aeroport', '9:33', 'ca')).toBe('22 estacions més, fins al Prat Aeroport (9:33)');
  expect(moreStations(1, 'El Escorial', '9:33', 'ca')).toBe('1 estació més, fins a El Escorial (9:33)');
  expect(moreStations(22, 'Els Monjos', '9:33', 'ca')).toBe('22 estacions més, fins als Monjos (9:33)');
  expect(moreStations(22, 'A Coruña', '09:33', 'gl')).toBe('22 estacións máis, ata A Coruña (09:33)');
  expect(moreStations(22, 'El Prat Aeroport', '9:33', 'es')).toBe('22 estaciones más, hasta El Prat Aeroport (9:33)');
});

test("writes Back to Nearby with its title as it stands in each language, as it's no Station's name (#606)", () => {
  for (const lang of Object.keys(LANGUAGES) as Language[]) expect(backTo(t('nearby', lang), lang)).toBe(t('backTo', lang).replace('{place}', t('nearby', lang)));
});

test("puts no Station's name, place or headsign into a sentence in main.ts, where it would go in as published: each goes in through i18n.ts's functions (#606)", () => {
  // main.ts builds the whole page as it loads, so no test can import it: it's read as about.test.ts reads it. A `${place}` of a template is no placeholder.
  const main = readFileSync(new URL('./main.ts', import.meta.url), 'utf8');
  expect(main.match(/(?<!\$)\{(station|place|headsign)\}/g) ?? []).toEqual([]);
});
