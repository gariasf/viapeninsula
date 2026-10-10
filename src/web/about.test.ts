import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';

/**
 * main.ts's text, and showAbout()'s in it. main.ts builds the whole page as it loads, so no test can
 * import it, and no engine runs here to move a focus: what a test can pin of About's (#382) is what its
 * markup asks for. Which control the dialog focuses as it opens, and that it's ringed, is for an engine
 * to say: Chromium, Firefox and WebKit, as the ticket's checks were.
 */
const main = readFileSync(new URL('./main.ts', import.meta.url), 'utf8');
const showAbout = /^function showAbout\(\) \{\n[\s\S]*?^\}$/m.exec(main)?.[0] ?? '';

test("asks for the focus in About's close button, as the dialog opens, which would go to its handle otherwise", () => {
  expect(showAbout).toContain('aboutClose.autofocus = true');
  // The dialog is filled before it opens: its focusing steps look for what asks then.
  expect(main).toMatch(/showAbout\(\);\n\s*about\.showModal\(\);/);
});

test("leaves About's handle a control for the pointer alone: out of the tab order, and hidden from a screen reader", () => {
  expect(showAbout).toMatch(/className: 'handle', tabIndex: -1,/);
  expect(showAbout).toContain("aboutHandle.setAttribute('aria-hidden', 'true')");
});
