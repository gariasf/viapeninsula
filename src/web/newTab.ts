// The one place a link is made to open in a new tab: About's, the credits' and an Alert's words'.

import { language, t, type Language } from './i18n.ts';

/**
 * Makes `link` open in a new tab, as every link on the page does, with `noopener noreferrer`, so that
 * the page it opens has no handle on this one and gets no referrer (a browser implies noopener for a
 * new tab, but still sends the referrer), and says so to a screen reader, as a word after its text
 * that the stylesheet hides from the eye (.sr-only). The word is in `lang`, or else the language the
 * interface speaks now, whatever language the words round the link are in, as an Alert's can be in its
 * feed's own (#391).
 * Every link that opens a tab goes through here, or through putHtml(), as tests check, so that they
 * can't differ again (#585).
 * ponytail: the word is out of the flow, so the browser shapes the text on either side of it apart and
 * the link's last letter isn't kerned with the character after it: in the credits' strip the pairs "C,"
 * and "B," of FGC and TMB, 0.11 px at 12 px, which moves what follows on that line by as much and breaks
 * the strip's lines otherwise at 4 of the 601 widths between 160 and 760 px (#585's check; none with
 * font-kerning off). Ceiling: a font that kerns a link's end by more than a hair. An aria-label avoids
 * it, but its word can't have a language of its own, as an Alert's in its feed's language needs (#391).
 */
export function opensInNewTab(link: HTMLAnchorElement, lang: Language = language()): HTMLAnchorElement {
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  link.append(Object.assign(link.ownerDocument.createElement('span'), { className: 'sr-only', lang, textContent: ` ${t('opensInNewTab', lang)}` }));
  return link;
}

/**
 * Puts `html` in `container`, with each link in it made to open in a new tab as opensInNewTab() does,
 * which a string of HTML has no way to say in a place a test can reach, and gives back `container`. The
 * credits' are the page's one HTML with links, as a test checks (#585).
 */
export function putHtml<T extends Element>(container: T, html: string): T {
  container.innerHTML = html;
  for (const link of container.querySelectorAll('a')) opensInNewTab(link);
  return container;
}
