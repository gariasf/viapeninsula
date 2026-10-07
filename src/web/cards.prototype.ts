// A throwaway page of every card (#212): today's, and three directions for them, each in light and in
// dark, at a phone's 390 × 844, over the real map, with the real content cards.prototype.data.ts copied
// from it; C, the maintainer's pick, also at a desktop's 1280 × 800. On the dev server at
// /src/web/cards.prototype.html; `?look=` picks the directions (today, a, b, c), `?scene=` the scenes
// (CAPTIONS' keys), each comma-separated, and `?theme=` light or dark. Not part of the app: `vite build`
// builds index.html only.
import './cards.prototype.css';
import { BOARDS, COUNT, FOLLOWED, LINES, NEARBY, NOW, TAP, TODAY, type Kind, type Row } from './cards.prototype.data.ts';
import almedaDark from './cards.prototype/almeda-dark.jpg';
import almedaLight from './cards.prototype/almeda-light.jpg';
import almedaWideLight from './cards.prototype/almeda-wide-light.jpg';
import catalunyaDark from './cards.prototype/catalunya-dark.jpg';
import catalunyaLight from './cards.prototype/catalunya-light.jpg';
import santsDark from './cards.prototype/sants-dark.jpg';
import santsLight from './cards.prototype/sants-light.jpg';
import santsWideDark from './cards.prototype/sants-wide-dark.jpg';
import { contrast, lettering } from './colour.ts';
import { t, trainCount } from './i18n.ts';

type Theme = 'light' | 'dark';
type Scene = 'map' | 'follow' | 'followUp' | 'board' | 'long' | 'longPeek' | 'nearby' | 'about';
type Look = 'today' | 'a' | 'b' | 'c';

const THEMES: Theme[] = ['light', 'dark'];
/** What each scene shows, as its frames are captioned. */
const CAPTIONS: Record<Scene, string> = {
  map: 'The map: legend, banner, buttons, a tap',
  follow: 'Following a Train',
  followUp: 'Following a Train, pulled up',
  board: "A Station's board",
  long: 'A long name',
  longPeek: 'A long name, peeking',
  nearby: 'Nearby',
  about: 'About',
};

/** Each look's scenes: C's show the sheet peeking and pulled up. */
const SCENES_OF: Record<Look, Scene[]> = {
  today: ['map', 'follow', 'board', 'long', 'nearby', 'about'],
  c: ['map', 'follow', 'followUp', 'longPeek', 'board', 'nearby', 'about'],
  a: ['map', 'follow', 'board', 'long', 'nearby', 'about'],
  b: ['map', 'follow', 'board', 'long', 'nearby', 'about'],
};

const LOOKS: Record<Look, { name: string; notes: string[] }> = {
  today: {
    name: 'Today',
    notes: ['The cards as deployed (main, 1fb6f6e), with the same content as the directions below.'],
  },
  c: {
    name: 'C · Sheet, round 3',
    notes: [
      'Round 3, a self-review for use, accessibility and spacing. Forced colours keep every pill, Live filled and Scheduled ringed, and the bar, the strip and the handle. A screen reader hears Live or Scheduled with each Train and a Delay as late, and every button shows its focus.',
      "Following a Train, its live status, speed and Unit go in one line under its title, the Delay beside the next Station's time, which it explains, and a button under the bar says how many Stations are still to come and pulls the sheet up. A board peeking says how many departures more.",
      "A board's Lines go in its nameboard, so the departures start higher. Rows are parted by solid hairlines; dashed rules part a card's parts. A Cancelled Train's pill isn't faded, which took its name under 3:1.",
      "The legend pill opens About, which now draws the Live and Scheduled pills and the outlines. The credits' button is ©, no longer a second ⓘ. Nearby's button says Nearby, with a radius rather than the crosshair that promises to centre the map on you.",
      "The maintainer's pick in round 1, with all four of its content changes: a Line's pill says Live or Scheduled, times count down, Nearby goes by Line and destination, and a followed Train leads with its next Station.",
      "B's cards in a sheet docked to the bottom. It peeks or is pulled up: following a Train, it peeks with the next Station and where the Train is along its Trip, and pulled up adds its speed and Unit and every Station still to come. A board peeks with its next three departures. Nearby and About open pulled up.",
      "Nearby and random-follow sit bottom right, in thumb reach, and the credits bottom left. They ride on the sheet's top edge, so they're never under it.",
      'The handle is a button too, Show more or Show less, for keyboards and screen readers.',
      "On a wide window the sheet is a card at the bottom left, 380 px wide, as today's panel is, and the credits a strip at the bottom right.",
    ],
  },
  a: {
    name: 'A · Tidy',
    notes: [
      "Today's cards, in their places and order, in one system: 14 px text, Young Serif titles at 18 px, 12 px corners, 40 px buttons, rules at a quarter of the ink.",
      "Each Line's name is its Trains' pill on the map, outlined by its kind, filled when Live and ringed when Scheduled. So rows drop the words Live and Scheduled, as the legend says it once.",
      'A Delay is a chip, +16 min. Status words stay only where they add something: Cancelled, no live data, and on time for a Live Train.',
      'A narrow time column, with a small AM or PM. The legend in two lines; the language as EN.',
    ],
  },
  b: {
    name: 'B · railisland',
    notes: [
      "The followed Train leads with what changes: its next Station and the minutes to it, then where it is along its Trip, then the next Stations as a strip in its Line's colour, five at a time.",
      'A board heads with the Station as a nameboard, reversed out of the ink, and the Lines that call there. Times count down.',
      'Nearby is one row per Line and destination, with its next three, instead of one row per Train (355 rows at Plaça de Catalunya at 08:07).',
      "The legend folds into one pill, with the counts, and the banner into another. railisland's 2 px outlines and dashed rules.",
      'Rows as A.',
    ],
  },
};

/** The map behind each scene, as the live map would show it: the followed R6 at Almeda, a board at Sants, the rest over Plaça de Catalunya. */
const BACKGROUND: Record<Theme, Record<'catalunya' | 'sants' | 'almeda', string>> = {
  light: { catalunya: catalunyaLight, sants: santsLight, almeda: almedaLight },
  dark: { catalunya: catalunyaDark, sants: santsDark, almeda: almedaDark },
};

/** Where the map keeps the followed R6, above the panel: in the backgrounds at Almeda, on a phone and on a wide window. */
const FOLLOWED_AT = { phone: [195, 228], wide: [836, 360] };

/** The cards' colour on each theme, as style.css's --card. */
const CARD: Record<Theme, string> = { light: '#ffffff', dark: '#151b24' };

/** Each kind's outline, as pillOf() gives it on the map. */
const OUTLINE: Record<Kind, 'round' | 'pointed' | 'badge'> = { commuter: 'round', regional: 'pointed', metro: 'badge', tram: 'badge', rack: 'badge', funicular: 'badge' };

const ICON = {
  close: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg>',
  locate:
    '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="6.5"/><circle cx="12" cy="12" r="2.2" fill="currentColor" stroke="none"/><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3"/></svg>',
  die: '<svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><rect x="5" y="5" width="14" height="14" rx="3" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="9" cy="9" r="1.3"/><circle cx="15" cy="9" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="9" cy="15" r="1.3"/><circle cx="15" cy="15" r="1.3"/></svg>',
  info: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 11v5.5M12 7.6v.1"/></svg>',
  chevron: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>',
  nearby:
    '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="8.5" stroke-dasharray="2.6 3.1"/><circle cx="12" cy="12" r="3" fill="currentColor" stroke="none"/></svg>',
  up: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="m6 15 6-6 6 6"/></svg>',
  copyright:
    '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M14.9 9.4a4 4 0 1 0 0 5.2"/></svg>',
  warning:
    '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3 2 20h20L12 3z"/><path d="M12 10v4.5M12 17.4v.1"/></svg>',
};

/** The page's own query: which looks, scenes and theme it shows. */
const params = new URLSearchParams(location.search);
const en = (key: Parameters<typeof t>[0]) => t(key, 'en');
const esc = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;');
const minutesOf = (hhmm: string) => {
  const [h = 0, m = 0] = hhmm.split(':').map(Number);
  return h * 60 + m;
};

/** A time of day as the English interface writes it, with its AM or PM small. */
function clock(hhmm: string): string {
  const total = minutesOf(hhmm);
  const [h, m] = [Math.floor(total / 60), total % 60];
  return `${h % 12 || 12}:${String(m).padStart(2, '0')}<small>${h < 12 ? 'AM' : 'PM'}</small>`;
}

/** A time of day as clock() writes it, as plain text. */
const plainClock = (hhmm: string) => clock(hhmm).replace(/<\/?small>/g, ' ').trim();

/** Minutes from NOW to a time of day. */
const toGo = (hhmm: string) => minutesOf(hhmm) - minutesOf(NOW);

/** What a colour letters in on the cards: on the dark ones lettering(), and on the light ones the colour darkened as far as it takes for 4.5:1, its mirror. */
function letteringOn(colour: string, paper: string): string {
  if (contrast(paper, '#000000') < contrast(paper, '#ffffff')) return lettering(colour, paper);
  const rgb = [1, 3, 5].map((i) => parseInt(colour.slice(i, i + 2), 16));
  for (let black = 0; black < 1; black += 0.01) {
    const mixed = `#${rgb.map((c) => Math.round(c * (1 - black)).toString(16).padStart(2, '0')).join('')}`;
    if (contrast(mixed, paper) >= 4.5) return mixed;
  }
  return '#000000';
}

/** What a Line's name letters in on its colour: dark ink where that reads better than white, as main.ts's darkInk() has it. */
const inkOn = (colour: string) => (contrast(colour, '#111111') > contrast(colour, '#ffffff') ? '#111111' : '#ffffff');

/**
 * A Line's name as its Trains' pill on the map: outlined by its kind, filled when Live, ringed when
 * Scheduled. A pill for a Train, as in a row, says which to a screen reader too.
 */
function pill(name: string, live: boolean, theme: Theme, size = '', train = false): string {
  const line = LINES[name];
  if (!line) return esc(name);
  const ink = live ? inkOn(line.colour) : letteringOn(line.colour, CARD[theme]);
  const says = train ? `<span class="sr-only">, ${live ? en('live') : en('scheduled')}</span>` : '';
  return `<span class="pill ${OUTLINE[line.kind]} ${live ? 'live' : 'scheduled'} ${size}" style="--line:${line.colour};--lettering:${ink}">${esc(name)}${says}</span>`;
}

/** A Delay as a chip, amber when late, which a screen reader reads as late or early: nothing where there's none to show. */
const delayChip = (delay = 0) =>
  delay
    ? `<span class="delay ${delay > 0 ? 'late' : 'early'}"><span aria-hidden="true">${delay > 0 ? '+' : '−'}${Math.abs(delay)} min</span><span class="sr-only">${en(delay > 0 ? 'late' : 'early').replace('{n}', String(Math.abs(delay)))}</span></span>`
    : '';

/** What a row says besides its Line and destination: Cancelled, a Delay, no live data, or on time for a Live Train. */
function status(row: Row): string {
  if (row.cancelled) return `<span class="status cancelled">${en('cancelled')}</span>`;
  if (row.delay) return delayChip(row.delay);
  if (row.unreported) return '<span class="status soft">no live data</span>';
  if (row.live && row.delay === 0) return `<span class="status soft">${en('onTime').toLowerCase()}</span>`;
  return '';
}

/** A departure's row: its time, with the minutes to it under a time within the hour where `countdown`, its Line's pill, where it's headed and its status. */
function departure(row: Row, theme: Theme, countdown: boolean): string {
  const minutes = toGo(row.time);
  const inMinutes = countdown && !row.cancelled && minutes < 60 ? `<span class="in">${minutes <= 0 ? 'now' : `${minutes} min`}</span>` : '';
  return `<li class="${row.cancelled ? 'cancelled' : ''}"><time>${clock(row.time)}${inMinutes}</time>${pill(row.line, row.live, theme, '', true)}<span class="dest">${esc(row.headsign)}</span>${status(row)}</li>`;
}

/** Nearby's rows by Line and destination, in the order of each one's first, with their passes. */
function grouped(rows: Row[]): Row[][] {
  const groups = new Map<string, Row[]>();
  for (const row of rows) groups.set(`${row.line} ${row.headsign}`, [...(groups.get(`${row.line} ${row.headsign}`) ?? []), row]);
  return [...groups.values()];
}

/** A group's next three passes, as minutes to go, now · 3 · 7 min: a Live one's bold, a Scheduled one's soft. Passes in the same minute count once. */
function passes(rows: Row[]): string {
  const byMinute = new Map<number, Row>();
  for (const row of rows) if (!byMinute.has(Math.max(0, toGo(row.time)))) byMinute.set(Math.max(0, toGo(row.time)), row);
  const shown = [...byMinute].slice(0, 3);
  const last = shown.at(-1)?.[0] ?? 0;
  return shown.map(([m, row]) => `<span class="${row.live ? 'live' : 'soft'}">${m ? m : 'now'}</span>`).join(' · ') + (last ? ' min' : '');
}

/** A card's close button, labelled. */
const closeButton = (label: string) => `<button class="close" aria-label="${label}" title="${label}">${ICON.close}</button>`;

// ---- Today, from the markup the live map built.

/** Today's panel in each scene that has one. */
const TODAY_PANEL: Partial<Record<Scene, string>> = { follow: TODAY.follow, board: TODAY.sants, long: TODAY.perpetua, nearby: TODAY.nearby };

/** Today's cards in a scene, from the markup the live map built: MapLibre's control corners, the tap popup, the panel and About. */
function today(scene: Scene): string {
  const credits = scene === 'map' ? TODAY.credits : TODAY.credits.replace(' maplibregl-compact-show', '').replace(' open=""', '');
  const legend = `<div class="maplibregl-ctrl maplibregl-ctrl-group legend">${(['live', 'scheduled'] as const)
    .map((kind) => `<div><span class="marker ${kind}"></span><span class="marker pill ${kind}"></span><b>${en(kind)}</b>: ${en(`${kind}Means`)}</div>`)
    .join('')}<div>${trainCount(COUNT.trains, COUNT.live, 'en')}</div><button type="button">${en('about')}</button></div>`;
  const banner = `<div class="maplibregl-ctrl maplibregl-ctrl-group banner" role="status"><div><b>TRAM</b>: ${en('liveUnavailable')}</div></div>`;
  const buttons =
    `<select class="maplibregl-ctrl maplibregl-ctrl-group language" title="Language"><option>English</option></select><div class="maplibregl-ctrl maplibregl-ctrl-group"><button type="button" class="maplibregl-ctrl-geolocate" title="${en('nearby')}"><span class="maplibregl-ctrl-icon"></span></button><button type="button" class="follow-random" title="${en('followRandom')}"><span class="maplibregl-ctrl-icon"></span></button></div>`;
  const tap = TAP.map((name) => {
    const line = LINES[name];
    return `<span class="pill ${line ? OUTLINE[line.kind] : ''}${line && inkOn(line.colour) !== '#ffffff' ? ' dark' : ''}" style="--line:${line?.colour}">${name}</span>`;
  }).join('');
  const popup = `<div class="maplibregl-popup lines-at maplibregl-popup-anchor-bottom" style="max-width:none;transform:translate(-50%,-100%) translate(195px,262px)"><div class="maplibregl-popup-tip"></div><div class="maplibregl-popup-content"><div>${tap}</div></div></div>`;
  const panel = TODAY_PANEL[scene] ?? '';
  const about = scene === 'about' ? `<div class="backdrop"></div>${TODAY.about.replace('<dialog', '<dialog open')}` : '';
  return `<div class="maplibregl-map v-today"><div class="maplibregl-control-container"><div class="maplibregl-ctrl-top-left">${legend}${scene === 'map' ? banner : ''}</div><div class="maplibregl-ctrl-top-right">${buttons}</div><div class="maplibregl-ctrl-bottom-right">${credits}</div></div>${scene === 'map' ? popup : ''}${panel}${about}</div>`;
}

// ---- The three directions.

/** The corners' cards: the legend and, on the map, the banner, top left; the language and A's and B's buttons, top right; A's and B's credits, bottom right. */
function corners(look: Exclude<Look, 'today'>, scene: Scene): string {
  const scheduled = COUNT.trains - COUNT.live;
  const legend =
    look === 'c'
      ? `<button class="card legend-pill" aria-label="${COUNT.live} live, ${scheduled} scheduled. ${en('about')}"><span class="mk live"></span><b>${COUNT.live}</b> live<span class="mk scheduled"></span><b>${scheduled}</b> scheduled<span class="round-button">${ICON.info}</span></button>`
      : look === 'a'
      ? `<div class="card legend"><div class="key"><span class="mk live"></span>${en('live')}<span class="mk scheduled"></span>${en('scheduled')}</div><div>${trainCount(COUNT.trains, COUNT.live, 'en')} · <button class="link">About</button></div></div>`
      : `<div class="card legend-pill"><span class="mk live"></span><b>${COUNT.live}</b> live<span class="mk scheduled"></span><b>${scheduled}</b> scheduled<button class="round-button" aria-label="${en('about')}">${ICON.info}</button></div>`;
  const banner =
    scene !== 'map'
      ? ''
      : look === 'a'
        ? `<div class="card banner"><b>TRAM</b>: ${en('liveUnavailable')}</div>`
        : `<div class="card banner-pill">${ICON.warning}<span><b>TRAM</b> live data unavailable</span></div>`;
  const lang = `<button class="card lang">EN${ICON.chevron}</button>`;
  const buttons =
    look === 'a'
      ? `<div class="card btns"><button aria-label="${en('nearby')}">${ICON.locate}</button><button aria-label="${en('followRandom')}">${ICON.die}</button></div>`
      : look === 'b'
        ? `<button class="card square" aria-label="${en('nearby')}">${ICON.locate}</button><button class="card square" aria-label="${en('followRandom')}">${ICON.die}</button>`
        : '';
  const credits = look === 'c' ? '' : `<button class="card credits" aria-label="Credits">${ICON.info}</button>`;
  return `<div class="tl">${legend}${banner}</div><div class="tr">${lang}${buttons}</div>${credits}`;
}

/** A tap on the Lines' strokes through Passeig de Gràcia, naming them. */
function tap(theme: Theme): string {
  return `<div class="card tap" style="left:195px;top:262px">${TAP.map((name) => pill(name, true, theme)).join('')}</div>`;
}

/** The followed Train's Live line: how long ago live data confirmed it, and its Delay. */
const liveStatus = () => `<p class="live-status"><span class="dot"></span>${en('live')} · ${en('confirmed').replace('{ago}', FOLLOWED.confirmed)} ${delayChip(FOLLOWED.delay)}</p>`;

/** The followed Train's speed and Unit. */
const speedAndUnit = () => `<p class="meta">~${FOLLOWED.speed} km/h · ${en('unit')} ${FOLLOWED.unit}</p>`;

/** The followed Train as today's panel orders it: its Line and destination, Live or Scheduled and its Delay, its speed and Unit, then its next Stations. */
function followInTodaysOrder(theme: Theme): string {
  const f = FOLLOWED;
  return `<header><h2 class="title">${pill(f.line, f.live, theme)} → ${esc(f.headsign)}</h2>${closeButton(en('stopFollowing'))}</header>
    ${liveStatus()}
    ${speedAndUnit()}
    <h3 class="label">${en('nextStations')}</h3>
    <ol class="stops">${f.upcoming.map((u, i) => `<li${i ? '' : ' class="next"'}><time>${clock(u.time)}</time><span>${esc(u.name)}</span></li>`).join('')}</ol>`;
}

/**
 * The followed Train as railisland's card orders it: its next Station and the minutes to it, where it
 * is along its Trip, then its speed and Unit and the Stations after. B's card shows five of them, C's
 * sheet peeking none, and pulled up all.
 */
function followNextFirst(theme: Theme, state: 'card' | 'peek' | 'up'): string {
  const f = FOLLOWED;
  const [next, ...after] = f.upcoming;
  const colour = LINES[f.line]?.colour ?? '#555';
  const shown = state === 'up' ? after : after.slice(0, 5);
  const last = f.upcoming.at(-1);
  const more = state === 'card' ? `<button class="more">${after.length - shown.length} more, to ${esc(f.headsign)} at ${last ? plainClock(last.time) : ''}</button>` : '';
  const rest = `${speedAndUnit()}<hr class="dash"><ol class="strip" style="--line:${colour}">${shown.map((u) => `<li><time>${clock(u.time)}</time><span class="stop"></span><span>${esc(u.name)}</span></li>`).join('')}</ol>${more}`;
  return `<header><h2 class="title">${pill(f.line, f.live, theme)} ${esc(f.headsign)}</h2>${closeButton(en('stopFollowing'))}</header>
    <div class="next-stop"><div><p class="label">Next station</p><strong class="next-name">${esc(next?.name ?? '')}</strong></div>
      <div class="next-when"><time>${next ? clock(next.time) : ''}<span class="in">in ${next ? toGo(next.time) : 0} min</span></time></div></div>
    ${liveStatus()}
    <div class="progress" style="--line:${colour};--done:${((100 * f.km) / f.totalKm).toFixed(1)}%"><div class="bar"><i></i></div><div class="ends"><span>${esc(f.origin)}</span><span>${esc(f.headsign)}, ${f.totalKm} km</span></div></div>
    ${state === 'peek' ? '' : rest}`;
}

/** A Station's board; peeking, its next three departures. */
function board(look: Exclude<Look, 'today'>, which: keyof typeof BOARDS, theme: Theme, peek = false): string {
  const b = BOARDS[which];
  const rows = `<ol class="deps">${(peek ? b.departures.slice(0, 3) : b.departures).map((row) => departure(row, theme, look !== 'a')).join('')}</ol>`;
  if (look === 'a') return `<header><h2 class="title">${esc(b.name)}</h2>${closeButton(en('closeBoard'))}</header><h3 class="label">${en('nextDepartures')}</h3>${rows}`;
  return `<header class="nameboard"><h2 class="title">${esc(b.name)}</h2>${closeButton(en('closeBoard'))}</header>
    <div class="served">${b.lines.map((name) => pill(name, true, theme, 'small')).join('')}</div>
    <h3 class="label">${en('nextDepartures')}</h3>${rows}`;
}

/** Nearby: one row per pass for A, one per Line and destination for B and C. */
function nearby(look: Exclude<Look, 'today'>, theme: Theme): string {
  const head = `<header><h2 class="title">${en('nearby')}</h2>${closeButton(en('closeNearby'))}</header><h3 class="label">${en('passingNearby')}</h3>`;
  if (look === 'a') return `${head}<ol class="deps">${NEARBY.slice(0, 40).map((row) => departure(row, theme, false)).join('')}</ol>`;
  const groups = grouped(NEARBY);
  return `${head}<ol class="groups">${groups
    .map((rows) => {
      const [first] = rows;
      // The pill and the Delay are the next Train's.
      const delay = delayChip(first?.delay);
      return first ? `<li>${pill(first.line, first.live, theme)}<span class="dest">${esc(first.headsign)}${delay ? ` ${delay}` : ''}</span><span class="times">${passes(rows)}</span></li>` : '';
    })
    .join('')}</ol>`;
}

/** About, in the live map's words, with Reading the map: the pills the legend no longer spells out, drawn. */
function about(theme: Theme): string {
  const credits = /<h3>Credits<\/h3>(<ul>.*?<\/ul>)/.exec(TODAY.about)?.[1] ?? '';
  const [beforeAnalytics = '', afterAnalytics = ''] = en('visitsCounted').split('Cloudflare Web Analytics');
  return `<header><h2 class="title">${en('about')}</h2>${closeButton(en('close'))}</header>
    <p>${en('estimates')}</p>
    <h3 class="label">Reading the map</h3>
    <ul class="keys">
      <li>${pill('R4', true, theme)}<span><b>${en('live')}</b>: ${en('liveMeans')}</span></li>
      <li>${pill('R4', false, theme)}<span><b>${en('scheduled')}</b>: ${en('scheduledMeans')}</span></li>
    </ul>
    <p class="shapes">${pill('R1', true, theme)}${pill('R13', true, theme)}${pill('L3', true, theme)}</p>
    <p>${en('outlines')}</p>
    <h3 class="label">${en('credits')}</h3>${credits}
    <h3 class="label">${en('sourceCode')}</h3>
    <p><a href="https://github.com/gariasf/viapeninsula">github.com/gariasf/viapeninsula</a>, <a href="https://www.gnu.org/licenses/agpl-3.0.html">AGPL-3.0</a></p>
    <h3 class="label">${en('privacy')}</h3>
    <p>${en('noCookies')}</p><p>${beforeAnalytics}<a href="https://developers.cloudflare.com/web-analytics/data-metrics/">Cloudflare Web Analytics</a>${afterAnalytics}</p>`;
}

/** A's and B's cards: the panel across the bottom, and About mid-screen. */
function panels(look: 'a' | 'b', scene: Scene, theme: Theme): string {
  let content = '';
  if (scene === 'follow') content = look === 'a' ? followInTodaysOrder(theme) : followNextFirst(theme, 'card');
  else if (scene === 'board' || scene === 'long') content = board(look, scene === 'board' ? 'sants' : 'perpetua', theme);
  else if (scene === 'nearby') content = nearby(look, theme);
  const body = scene === 'about' ? `<div class="backdrop"></div><section class="card dialog">${about(theme)}</section>` : content ? `<section class="card panel">${content}</section>` : '';
  return `<div class="v-new v-${look}">${corners(look, scene)}${scene === 'map' ? tap(theme) : ''}${body}</div>`;
}

/**
 * The followed Train in C's sheet: its Line and destination; its live status, speed and Unit in one
 * line; its next Station, with the time, its Delay beside it, and the minutes to it; where it is along
 * its Trip; then, peeking, a button that says how many Stations are still to come, or, pulled up, all
 * of them as a strip in its Line's colour.
 */
function followSheet(theme: Theme, state: 'peek' | 'up'): string {
  const f = FOLLOWED;
  const [next, ...after] = f.upcoming;
  const colour = LINES[f.line]?.colour ?? '#555';
  const last = f.upcoming.at(-1);
  const end =
    state === 'peek'
      ? `<button class="expand" aria-expanded="false">${after.length} more stations, to ${esc(f.headsign)} at ${last ? plainClock(last.time) : ''}${ICON.up}</button>`
      : `<hr class="dash"><ol class="strip" style="--line:${colour}">${after.map((u) => `<li><time>${clock(u.time)}</time><span class="stop"></span><span>${esc(u.name)}</span></li>`).join('')}</ol>`;
  return `<header><h2 class="title">${pill(f.line, f.live, theme, '', true)} ${esc(f.headsign)}</h2>${closeButton(en('stopFollowing'))}</header>
    <p class="live-status meta"><span class="dot"></span>${en('live')} · ${en('confirmed').replace('{ago}', f.confirmed)} · ~${f.speed} km/h · ${en('unit')} ${f.unit}</p>
    <div class="next-stop"><div><p class="label">Next station</p><strong class="next-name">${esc(next?.name ?? '')}</strong></div>
      <div class="next-when"><span class="at"><time>${next ? clock(next.time) : ''}</time>${delayChip(f.delay)}</span><span class="in">in ${next ? toGo(next.time) : 0} min</span></div></div>
    <div class="progress" style="--line:${colour};--done:${((100 * f.km) / f.totalKm).toFixed(1)}%"><div class="bar"><i></i></div><div class="ends"><span>${esc(f.origin)}</span><span>${esc(f.headsign)}, ${f.totalKm} km</span></div></div>
    ${end}`;
}

/** A Station's board in C's sheet: its nameboard, with the Lines that call there in it, then its departures; peeking, the next three, and a button that says how many more. */
function boardSheet(which: keyof typeof BOARDS, theme: Theme, peek: boolean): string {
  const b = BOARDS[which];
  const shown = peek ? b.departures.slice(0, 3) : b.departures;
  const more = b.departures.length - shown.length;
  return `<header class="nameboard"><div><h2 class="title">${esc(b.name)}</h2><div class="served">${b.lines.map((name) => pill(name, true, theme, 'small')).join('')}</div></div>${closeButton(en('closeBoard'))}</header>
    <h3 class="label">${en('nextDepartures')}</h3>
    <ol class="deps">${shown.map((row) => departure(row, theme, true)).join('')}</ol>
    ${more ? `<button class="expand" aria-expanded="false">${more} more departures${ICON.up}</button>` : ''}`;
}

/** Nearby in C's sheet: its range in a line under the title, then a row per Line and destination, with the next Train's pill, and its next three passes over its Delay. */
function nearbySheet(theme: Theme): string {
  return `<header><h2 class="title">${en('nearby')}</h2>${closeButton(en('closeNearby'))}</header>
    <p class="subtitle">${en('passingNearby')}</p>
    <ol class="groups">${grouped(NEARBY)
      .map((rows) => {
        const [first] = rows;
        return first ? `<li>${pill(first.line, first.live, theme, '', true)}<span class="dest">${esc(first.headsign)}</span><span class="when"><span class="times">${passes(rows)}</span>${delayChip(first.delay)}</span></li>` : '';
      })
      .join('')}</ol>`;
}

/** What C's sheet shows in a scene, and whether it peeks or is pulled up. */
function sheetOf(scene: Scene, theme: Theme): { content: string; state: 'peek' | 'up' } | undefined {
  switch (scene) {
    case 'follow':
      return { content: followSheet(theme, 'peek'), state: 'peek' };
    case 'followUp':
      return { content: followSheet(theme, 'up'), state: 'up' };
    case 'board':
      return { content: boardSheet('sants', theme, false), state: 'up' };
    case 'long':
      return { content: boardSheet('perpetua', theme, false), state: 'up' };
    case 'longPeek':
      return { content: boardSheet('perpetua', theme, true), state: 'peek' };
    case 'nearby':
      return { content: nearbySheet(theme), state: 'up' };
    default:
      return undefined;
  }
}

/** The credits as MapLibre strings them along a wide window's bottom. */
const CREDITS = /<div class="maplibregl-ctrl-attrib-inner">(.*?)<\/div>/.exec(TODAY.credits)?.[1] ?? '';

/**
 * C: the cards in a sheet docked to the bottom, with the buttons and the credits riding on its top
 * edge, and About a sheet of its own over a backdrop. On a wide window, the sheet is a card at the
 * bottom left and the credits a strip.
 */
function sheets(scene: Scene, theme: Theme, wide: boolean): string {
  const shown = sheetOf(scene, theme);
  const handle = (state: 'peek' | 'up') => `<button class="handle" aria-expanded="${state === 'up'}" aria-label="${state === 'peek' ? 'Show more' : 'Show less'}"><span></span></button>`;
  // Nearby, the one used more, nearest the thumb, named; the die over it.
  const fabs = `<div class="fabs"><button class="card fab" aria-label="${en('followRandom')}" title="${en('followRandom')}">${ICON.die}</button><button class="card fab nearby" aria-label="${en('nearby')}">${ICON.nearby}<span>Nearby</span></button></div>`;
  const credits = wide ? `<div class="card credits-strip">${CREDITS}</div>` : `<button class="card credits" aria-label="${en('showCredits')}">${ICON.copyright}</button>`;
  const sheet = shown ? `<section class="card sheet ${shown.state}">${handle(shown.state)}${shown.content}</section>` : '';
  const aboutSheet = scene === 'about' ? `<div class="backdrop"></div><section class="card sheet about">${handle('up')}${about(theme)}</section>` : '';
  return `<div class="v-new v-c">${corners('c', scene)}${scene === 'map' ? tap(theme) : ''}<div class="dock"><div class="riders">${wide ? fabs + credits : credits + fabs}</div>${sheet}</div>${aboutSheet}</div>`;
}

// ---- The page.

const looks = (Object.keys(LOOKS) as Look[]).filter((look) => !params.has('look') || params.get('look')?.split(',').includes(look));
const themes = THEMES.filter((theme) => !params.has('theme') || params.get('theme') === theme);
const scenesOf = (look: Look) => SCENES_OF[look].filter((scene) => !params.has('scene') || params.get('scene')?.split(',').includes(scene));

/** The followed R6 as the map draws it, larger than the rest: Live, so filled, pointed as a regional Line's, edged in white. */
function followedTrain(wide: boolean): string {
  const [x, y] = FOLLOWED_AT[wide ? 'wide' : 'phone'];
  return `<span class="followed-train" style="left:${x}px;top:${y}px;--line:${LINES[FOLLOWED.line]?.colour}"><span>${FOLLOWED.line}</span></span>`;
}

/** A scene's frame in a look and theme, over its map; `wide`, a desktop's frame over that map. */
function frame(look: Look, scene: Scene, theme: Theme, wide?: string): string {
  const following = scene === 'follow' || scene === 'followUp';
  const background = wide ?? BACKGROUND[theme][following ? 'almeda' : scene === 'board' ? 'sants' : 'catalunya'];
  const inner = look === 'today' ? today(scene) : look === 'c' ? sheets(scene, theme, !!wide) : panels(look, scene, theme);
  return `<figure class="frame"><figcaption>${CAPTIONS[scene]} · ${theme}${wide ? ' · a wide window' : ''}</figcaption><div class="phone${wide ? ' wide' : ''}" data-theme="${theme}" style="background-image:url(${background})">${following ? followedTrain(!!wide) : ''}${inner}</div></figure>`;
}

/** C's frames at a desktop's size, each over its own map: following the R6 in light, Sants' board in dark. */
const WIDE: [Scene, Theme, string][] = [
  ['followUp', 'light', almedaWideLight],
  ['board', 'dark', santsWideDark],
];

document.body.innerHTML = `<header class="page-head"><h1>The cards, mocked up (#212)</h1>
  <p>Every card at a phone's 390 px, over the map, in light and dark, with content copied from the live map on Wednesday 7 Oct 2026 at 08:07, a morning of many cancelled Rodalies Trains. Today first, then C, the pick, in its third round, then round 1's A and B for the record, which share round 3's accessibility fixes and About's key.</p>
  <nav>${(Object.keys(LOOKS) as Look[]).map((look) => `<a href="?look=${look}">${LOOKS[look].name}</a>`).join('')}<a href="?">All</a></nav></header>
  ${looks
    .map(
      (look) => `<section class="look" id="${look}"><h2>${LOOKS[look].name}</h2><ul>${LOOKS[look].notes.map((n) => `<li>${n}</li>`).join('')}</ul>
      ${themes.map((theme) => `<div class="frames">${scenesOf(look).map((scene) => frame(look, scene, theme)).join('')}</div>`).join('')}
      ${look === 'c' && !params.has('scene') ? `<div class="frames">${WIDE.filter(([, theme]) => themes.includes(theme)).map(([scene, theme, background]) => frame(look, scene, theme, background)).join('')}</div>` : ''}</section>`,
    )
    .join('')}`;
