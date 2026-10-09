import { createExpression, latest, type ExpressionSpecification, type Feature, type StylePropertySpecification } from '@maplibre/maplibre-gl-style-spec';
import { expect, test } from 'vitest';
import { basemapLabel, earlierStations, LANGUAGES, type Language, liveUnavailable, MACHINE_TRANSLATED, moreDepartures, moreStations, pickLanguage, t, toGo, trainCounts, unlocated } from './i18n.ts';

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

test('says in the banner that a Network has no timetable today, in each language', () => {
  expect(t('noTimetable', 'ca')).toBe('sense horari avui');
  expect(t('noTimetable', 'es')).toBe('sin horario hoy');
  expect(t('noTimetable', 'en')).toBe('no timetable today');
  expect(t('noTimetable', 'eu')).toBe('gaur ordutegirik ez');
  expect(t('noTimetable', 'gl')).toBe('sen horario hoxe');
});

test('labels the button that follows a random Train in each language', () => {
  expect(t('followRandom', 'ca')).toBe("Segueix un tren a l'atzar");
  expect(t('followRandom', 'es')).toBe('Seguir un tren al azar');
  expect(t('followRandom', 'en')).toBe('Follow a random train');
  expect(t('followRandom', 'eu')).toBe('Jarraitu ausazko tren bati');
  expect(t('followRandom', 'gl')).toBe('Seguir un tren ao chou');
});

test("says in About what a Train's outline says of its Line's kind of service, in each language", () => {
  expect(t('outlines', 'ca')).toBe(
    'Amb el mapa ampliat, cada tren és una etiqueta amb el nom de la seva línia, i la seva forma indica el tipus de servei: arrodonida per a les línies de rodalia i les suburbanes, acabada en punta als dos extrems per a les regionals, i quadrada amb les cantonades arrodonides per a les del metro de TMB, del TRAM, del tren-tramvia de Cadis, del cremallera i dels funiculars.',
  );
  expect(t('outlines', 'es')).toBe(
    'Con el mapa ampliado, cada tren es una etiqueta con el nombre de su línea, y su forma indica el tipo de servicio: redondeada para las líneas de cercanías y las suburbanas, acabada en punta por ambos extremos para las regionales, y cuadrada con las esquinas redondeadas para las del metro de TMB, del TRAM, del tren-tranvía de Cádiz, del cremallera y de los funiculares.',
  );
  expect(t('outlines', 'en')).toBe(
    "Zoomed in, each train is a label with its line's name, shaped by the line's kind of service: rounded for commuter and suburban lines, pointed at both ends for regional lines, and a rounded square for the lines of TMB's metro, TRAM, Cádiz's tram-train, the rack railway and the funiculars.",
  );
  expect(t('outlines', 'eu')).toBe(
    'Mapa handituta, tren bakoitza bere linearen izena daraman etiketa bat da, eta haren formak zerbitzu mota adierazten du: biribildua aldiriko eta hiri-inguruko lineetan, bi muturretan puntaduna eskualdeko lineetan, eta izkina biribilduko karratua TMBren metroko, TRAMeko, Cadizko tren-tranbiako, kremailerako eta funikularretako lineetan.',
  );
  expect(t('outlines', 'gl')).toBe(
    'Co mapa ampliado, cada tren é unha etiqueta co nome da súa liña, e a súa forma indica o tipo de servizo: arredondada para as liñas de proximidade e as suburbanas, rematada en punta polos dous extremos para as rexionais, e cadrada coas esquinas arredondadas para as do metro de TMB, do TRAM, do tren-tranvía de Cádiz, do tren de cremalleira e dos funiculares.',
  );
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
