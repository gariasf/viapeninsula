import { expect, test } from 'vitest';
import { pickLanguage } from './i18n.ts';

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
