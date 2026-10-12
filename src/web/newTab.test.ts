import { readdirSync, readFileSync } from 'node:fs';
import { expect, test } from 'vitest';
import { setLanguage } from './i18n.ts';
import { opensInNewTab, putHtml } from './newTab.ts';

/**
 * An anchor as far as opensInNewTab() touches one, and the span it makes: Node has no DOM to make a link in,
 * nor jsdom to give it one, and main.ts, which builds the page as it loads, can't be imported. What it sets
 * are attributes a real anchor reflects, which #585's check in a browser reads off the page.
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

test('says it in the language the interface speaks, which every link of the page asks for, where it is asked for none', () => {
  setLanguage('eu');
  const link = anchor();
  opensInNewTab(link as unknown as HTMLAnchorElement);
  expect(link.children).toEqual([{ tag: 'span', className: 'sr-only', lang: 'eu', textContent: ' (fitxa berri batean irekitzen da)' }]);
});

test('puts HTML in a container and makes each link in it open in a new tab once it is in, where HTML written as a string has no way to say so', () => {
  const links = [anchor(), anchor()];
  const seen: string[] = [];
  const container = {
    innerHTML: '',
    querySelectorAll(selector: string) {
      seen.push(`${selector} in ${this.innerHTML}`);
      return selector === 'a' ? links : [];
    },
  };
  expect(putHtml(container as unknown as HTMLElement, '<a href="/">A</a> | <a href="/">B</a>')).toBe(container);
  // Asked for the links after the HTML's in, or it would find none (the credits' are replaced as the language changes).
  expect(seen).toEqual(['a in <a href="/">A</a> | <a href="/">B</a>']);
  for (const link of links) {
    expect(link).toMatchObject({ target: '_blank', rel: 'noopener noreferrer' });
    expect(link.children).toHaveLength(1);
  }
});

/** The page's own sources, read as text, as about.test.ts reads main.ts: it builds the page as it loads, so no test can import it to see what it makes. */
const web = new URL('.', import.meta.url);
const sources = readdirSync(web).filter((file) => file.endsWith('.ts') && !file.endsWith('.test.ts'));
const read = (file: string) => readFileSync(new URL(file, web), 'utf8');

test("opens no tab but through opensInNewTab(): no other file of the page writes the target that does, and none of main.ts's anchors is made without it", () => {
  expect(sources.filter((file) => read(file).includes('_blank'))).toEqual(['newTab.ts']);
  expect(read('main.ts').match(/(?<!opensInNewTab\(\s*)el\('a'/g) ?? []).toEqual([]);
});

test("writes no HTML but through putHtml(), which makes its links open in a new tab: the page's other HTML is the icons' SVG", () => {
  const written = sources.flatMap((file) =>
    read(file)
      .split('\n')
      .filter((line) => /innerHTML|outerHTML|insertAdjacentHTML/.test(line) && !/^\s*(\/\/|\*|\/\*)/.test(line))
      .map((line) => `${file}: ${line.trim()}`),
  );
  expect(written.filter((line) => !line.startsWith('newTab.ts:') && !line.includes('ICONS['))).toEqual([]);
});
