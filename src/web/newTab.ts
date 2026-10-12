// The one place a link is made to open in a new tab: About's, the credits' and an Alert's words'.

import { language, t, type Language } from './i18n.ts';

/**
 * Makes `link` open in a new tab, as every link on the page does, with `noopener noreferrer`, so that
 * the page it opens has no handle on this one and gets no referrer (a browser implies noopener for a
 * new tab, but still sends the referrer), and says so to a screen reader, as a word after its text
 * that the stylesheet hides from the eye (.sr-only). The word is in `lang`, or else the language the
 * interface speaks now, whatever language the words round the link are in, as an Alert's can be in its
 * feed's own (#391).
 * Every link that opens a tab is made here, as a test checks, so that they can't differ again (#585).
 */
export function opensInNewTab(link: HTMLAnchorElement, lang: Language = language()): HTMLAnchorElement {
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  link.append(Object.assign(link.ownerDocument.createElement('span'), { className: 'sr-only', lang, textContent: ` ${t('opensInNewTab', lang)}` }));
  return link;
}
