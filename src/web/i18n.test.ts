import { expect, test } from 'vitest';
import { LANGUAGES, type Language, pickLanguage, t, trainCount } from './i18n.ts';

test("speaks the first of the browser's languages it knows, whatever the region, and English when it knows none", () => {
  expect(pickLanguage(null, ['ca-ES', 'es-ES', 'en'])).toBe('ca');
  expect(pickLanguage(null, ['ca-ES-valencia'])).toBe('ca');
  expect(pickLanguage(null, ['es-419', 'en'])).toBe('es');
  expect(pickLanguage(null, ['en-GB', 'ca'])).toBe('en');
  expect(pickLanguage(null, ['fr-FR', 'fr', 'es'])).toBe('es');
  expect(pickLanguage(null, ['fr-FR', 'de'])).toBe('en');
  expect(pickLanguage(null, [])).toBe('en');
});

test('speaks the language the viewer chose on this device, whatever their browser prefers', () => {
  expect(pickLanguage('es', ['ca-ES', 'ca'])).toBe('es');
  expect(pickLanguage('en', [])).toBe('en');
  // A stored language the interface doesn't speak is ignored.
  expect(pickLanguage('fr', ['ca-ES'])).toBe('ca');
});

test('counts the Trains on the map, and how many of them are Live, in each language', () => {
  expect(trainCount(212, 148, 'ca')).toBe('212 trens, 148 en directe');
  expect(trainCount(212, 148, 'es')).toBe('212 trenes, 148 en directo');
  expect(trainCount(212, 148, 'en')).toBe('212 trains, 148 live');
});

test('counts one Train in the singular, and none in the plural', () => {
  expect(trainCount(1, 1, 'ca')).toBe('1 tren, 1 en directe');
  expect(trainCount(1, 0, 'es')).toBe('1 tren, 0 en directo');
  expect(trainCount(1, 1, 'en')).toBe('1 train, 1 live');
  expect(trainCount(0, 0, 'en')).toBe('0 trains, 0 live');
});

test('labels the button that follows a random Train in each language', () => {
  expect(t('followRandom', 'ca')).toBe("Segueix un tren a l'atzar");
  expect(t('followRandom', 'es')).toBe('Seguir un tren al azar');
  expect(t('followRandom', 'en')).toBe('Follow a random train');
});

test("says in About what a Train's outline says of its Line's kind of service, in each language", () => {
  expect(t('outlines', 'ca')).toBe(
    'Amb el mapa ampliat, cada tren és una etiqueta amb el nom de la seva línia, i la seva forma indica el tipus de servei: arrodonida per a les línies de rodalia i les suburbanes, acabada en punta als dos extrems per a les regionals, i quadrada amb les cantonades arrodonides per a les del metro de TMB, del TRAM, del cremallera i dels funiculars.',
  );
  expect(t('outlines', 'es')).toBe(
    'Con el mapa ampliado, cada tren es una etiqueta con el nombre de su línea, y su forma indica el tipo de servicio: redondeada para las líneas de cercanías y las suburbanas, acabada en punta por ambos extremos para las regionales, y cuadrada con las esquinas redondeadas para las del metro de TMB, del TRAM, del cremallera y de los funiculares.',
  );
  expect(t('outlines', 'en')).toBe(
    "Zoomed in, each train is a label with its line's name, shaped by the line's kind of service: rounded for commuter and suburban lines, pointed at both ends for regional lines, and a rounded square for the lines of TMB's metro, TRAM, the rack railway and the funiculars.",
  );
});

test("says in About's Privacy that visits are counted, naming Cloudflare Web Analytics once in each language for its link", () => {
  expect(t('visitsCounted', 'en')).toBe('Visits are counted with Cloudflare Web Analytics, which uses no cookies and keeps nothing on your device.');
  for (const lang of Object.keys(LANGUAGES) as Language[]) expect(t('visitsCounted', lang).split('Cloudflare Web Analytics')).toHaveLength(2);
});
