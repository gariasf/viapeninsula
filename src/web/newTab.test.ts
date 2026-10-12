import { readdirSync, readFileSync } from 'node:fs';
import { expect, test } from 'vitest';
import { opensInNewTab } from './newTab.ts';

/**
 * An anchor as far as opensInNewTab() touches one, and the span it makes: Node has no DOM to make a link in
 * (nor jsdom to give it one), and main.ts, which builds the page as it loads, can't be imported. What it
 * sets are reflected attributes in a browser, which the page's check in one reads (#585).
 */
function anchor() {
  const link = {
    children: [] as unknown[],
    append: (...nodes: unknown[]) => link.children.push(...nodes),
    ownerDocument: { createElement: (tag: string) => ({ tag }) },
  };
  return link;
}

test("opens a link in a new tab, with noopener and noreferrer, and says so after its text to a screen reader alone, in the language it's asked for", () => {
  const link = anchor();
  opensInNewTab(link as unknown as HTMLAnchorElement, 'ca');
  expect(link).toMatchObject({ target: '_blank', rel: 'noopener noreferrer' });
  // The stylesheet's .sr-only hides it, and its lang is the interface's, where the words round the link are an operator's, in theirs (#391).
  expect(link.children).toEqual([{ tag: 'span', className: 'sr-only', lang: 'ca', textContent: " (s'obre en una pestanya nova)" }]);
});

/** The page's own sources, read as text, as about.test.ts reads main.ts: it builds the page as it loads, so no test can import it to see what it makes. */
const web = new URL('.', import.meta.url);
const sources = readdirSync(web).filter((file) => file.endsWith('.ts') && !file.endsWith('.test.ts'));
const read = (file: string) => readFileSync(new URL(file, web), 'utf8');

test('opens no tab but through opensInNewTab(): no other file of the page writes the target that does, and none of main.ts\'s anchors is made without it', () => {
  expect(sources.filter((file) => read(file).includes('_blank'))).toEqual(['newTab.ts']);
  // Credits' links are HTML, which showCredits() makes open in a new tab as it puts them in, below.
  expect(read('main.ts').match(/(?<!opensInNewTab\(\s*)el\('a'/g) ?? []).toEqual([]);
});

test("makes each link of the credits open in a new tab as they're put in, where they're HTML written with no target, in each of the three places they are", () => {
  const showCredits = /^function showCredits\(\) \{\n[\s\S]*?^\}$/m.exec(read('main.ts'))?.[0] ?? '';
  expect(showCredits).toMatch(/\[creditsText, creditsStrip, aboutCredits\][^;]*opensInNewTab\(/);
});
