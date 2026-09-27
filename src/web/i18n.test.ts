import { expect, test } from 'vitest';
import { pickLanguage, trainCount } from './i18n.ts';

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
