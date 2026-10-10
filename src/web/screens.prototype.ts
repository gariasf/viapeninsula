// A throwaway page of the screens beyond the map (#328): Search, Favourites, a Line's screen and Now,
// each opened over the map as #321's sheet is, under two ways in: A, a tab bar (a rail or a bar on a wide
// window), and B, a search field across the top with Now and Nearby as buttons bottom right. One frame
// to a page, in the app's own cards CSS, so it follows the window: open it at 390 px wide, or on a wide
// window. On the dev server at /src/web/screens.prototype.html; `?nav=a|b`, `&screen=map|search|favourites|
// line|now`, `&theme=light|dark`. Content copied from the live map (screens.prototype.data.ts); the
// field doesn't search, the typed states are fixed (`&q=terrassa|r1|774`, `&q=` empty). Not part of the
// app: `vite build` builds index.html only.
import './screens.prototype.css';
import './screens.prototype.extra.css';
import { ALERTS, CAPTURED, COUNT, FAVOURITES, LINE as R4_LINE, LINE_STATE, LINES, NETWORKS, NOW, OTHER_LINES, PLACES, SEARCHES, VIEWS, type AlertRow, type Board, type CancelledTrain, type LineState, type NetworkNow, type Row, type SearchResults } from './screens.prototype.data.ts';
import { contrast, lettering } from './screens.prototype.colour.ts';

type Nav = 'a' | 'b';
type Screen = 'map' | 'search' | 'favourites' | 'line' | 'now' | 'board';
type Theme = 'light' | 'dark';

// ---- The page's own query.
const params = new URLSearchParams(location.search);
const nav: Nav = params.get('nav') === 'b' ? 'b' : 'a';
const screen = (['map', 'search', 'favourites', 'line', 'now', 'board'] as const).find((s) => s === params.get('screen')) ?? 'map';
const theme = (['light', 'dark'] as const).find((s) => s === params.get('theme'));
/** The typed query: `terrassa` by default, and none for `?q=`. */
const typed = params.has('q') ? (params.get('q') ?? '') : 'terrassa';
const emptyFavourites = params.has('empty');
/** A Line's Cancelled Trains and Alerts open, above its strip (`?open=1`). */
const opened = params.has('open');
/** A Line's strip with a chip for each of its Trips' runs (`?alt=chips`, and `&v=2` for the third run's), instead of one strip for them all. */
const chips = params.get('alt') === 'chips';
const variant = params.has('v') ? Number(params.get('v')) : undefined;
/** On a wide window, A's bar along the top instead of its rail. */
const topBar = params.get('bar') === 'top';
/** The whole sheet at its full length, for reading it (`?full=1`). */
const full = params.has('full');
/** The Line whose screen it is: R4, or with `?line=cercanias-asturias:C6` one of a Network whose live data is unavailable, for the banner. */
const LINE = OTHER_LINES[params.get('line') ?? ''] ?? R4_LINE;
if (theme) document.documentElement.dataset.theme = theme;
if (full) document.documentElement.classList.add('full');
document.body.classList.add(`nav-${nav}`, `screen-${screen}`);
if (topBar) document.body.classList.add('top-bar');

/** This page's link with some of its query changed. */
function link(change: Record<string, string | null>): string {
  const next = new URLSearchParams(location.search);
  for (const [key, value] of Object.entries(change)) {
    if (value === null) next.delete(key);
    else next.set(key, value);
  }
  return `?${next.toString()}`;
}

// ---- Maps behind the frames.
const BACKGROUNDS = import.meta.glob<string>('./screens.prototype/*.jpg', { eager: true, query: '?url', import: 'default' });
const dark = theme ? theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
const wideWindow = matchMedia('(min-width: 640px)');
function background(): string {
  const size = wideWindow.matches ? 'wide' : 'phone';
  const own = LINE === R4_LINE ? 'line' : 'line2';
  const kind = screen === 'line' ? (size === 'wide' ? own : `${own}-${nav}`) : 'city';
  return BACKGROUNDS[`./screens.prototype/${kind}-${size}-${dark ? 'dark' : 'light'}.jpg`] ?? '';
}

/**
 * A Line's track as a glow in its colour over the map, where the capture was fitted to it: the capture's
 * zoom and centre say where each point of the track falls in its frame, as Web Mercator has it, and the
 * frame scales as the background does, to cover.
 */
function glow(): string {
  if (screen !== 'line') return '';
  const wide = wideWindow.matches;
  const view = VIEWS[wide ? (LINE === R4_LINE ? 'line-wide' : 'line2-wide') : `${LINE === R4_LINE ? 'line' : 'line2'}-${nav}-phone`];
  if (!view) return '';
  const [vw, vh] = wide ? [1280, 800] : [390, 844];
  const world = 512 * 2 ** view.z;
  const px = ([lon, lat]: [number, number]): [number, number] => {
    const s = Math.sin((lat * Math.PI) / 180);
    return [((lon + 180) / 360) * world, (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * world];
  };
  const [cx, cy] = px(view.centre);
  const points = LINE.shape.map((p) => px(p)).map(([x, y]) => `${(x - cx + vw / 2).toFixed(1)},${(y - cy + vh / 2).toFixed(1)}`).join(' ');
  return `<svg class="glow" viewBox="0 0 ${vw} ${vh}" preserveAspectRatio="xMidYMid slice" aria-hidden="true" style="--line:${LINE.colour}"><polyline points="${points}" /></svg>`;
}

// ---- Helpers.
/** A Network's name as the interface writes it where room is short: FGC as CONTEXT.md names it, the rest as their operators do. */
const networkName = (id: string) => (id === 'fgc' ? 'FGC' : (NETWORKS[id]?.name ?? ''));
const esc = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

const ICON = {
  close: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg>',
  chevron: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>',
  right: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="m9 6 6 6-6 6"/></svg>',
  up: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="m6 15 6-6 6 6"/></svg>',
  die: '<svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><rect x="5" y="5" width="14" height="14" rx="3" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="9" cy="9" r="1.3"/><circle cx="15" cy="9" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="9" cy="15" r="1.3"/><circle cx="15" cy="15" r="1.3"/></svg>',
  nearby: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="8.5" stroke-dasharray="2.6 3.1"/><circle cx="12" cy="12" r="3" fill="currentColor" stroke="none"/></svg>',
  info: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 11v5.5M12 7.6v.1"/></svg>',
  copyright: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M14.9 9.4a4 4 0 1 0 0 5.2"/></svg>',
  back: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="m15 6-6 6 6 6"/></svg>',
  warning: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3 2 20h20L12 3z"/><path d="M12 10v4.5M12 17.4v.1"/></svg>',
  search: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m15.5 15.5 5 5"/></svg>',
  star: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="m12 3.2 2.7 5.6 6.1.8-4.5 4.2 1.1 6.1L12 17.1 6.6 19.9l1.1-6.1L3.2 9.6l6.1-.8L12 3.2z"/></svg>',
  starOn: '<svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="m12 3.2 2.7 5.6 6.1.8-4.5 4.2 1.1 6.1L12 17.1 6.6 19.9l1.1-6.1L3.2 9.6l6.1-.8L12 3.2z"/></svg>',
  now: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12h4l2.5-7 4 14 2.5-7h5"/></svg>',
  station: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><circle cx="12" cy="12" r="6.5"/></svg>',
};

/** The Barcelona clock, HH:MM as 12-hour with its AM or PM small, as the interface writes times. */
function clock(hhmm: string): string {
  const [h = 0, m = 0] = hhmm.split(':').map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, '0')}<small>${h < 12 ? 'AM' : 'PM'}</small>`;
}
const plain = (hhmm: string) => clock(hhmm).replace(/<small>(AM|PM)<\/small>/, ' $1');

/** A moment (ms since 1970) as the interface writes a date and time: Oct 7, 2026, 9:23 AM. */
const dateTime = (ms: number) => new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Europe/Madrid' }).format(ms);

const OUTLINE: Record<string, string> = { commuter: 'round', regional: 'pointed', metro: 'badge', tram: 'badge', rack: 'badge', funicular: 'badge', 'long-distance': 'round' };
const CARD = dark ? '#151b24' : '#ffffff';
/** What a Live pill letters dark Lines in: as main.ts's INK, but written in six digits, which contrast() reads: main's '#111' comes out NaN there, so its darkInk() is never true and its cards letter every Live pill white (see followups). */
const INK = '#111111';

/** A Line's name as its Trains' pill: filled when Live, ringed when Scheduled; a Line named by its badge, filled. */
function pill(id: string, { live = true, train = false, small = false, big = false } = {}): string {
  const line = LINES[id];
  if (!line) return esc(id);
  const lettered = live ? (contrast(line.colour, INK) > contrast(line.colour, '#ffffff') ? INK : '#fff') : lettering(line.colour, CARD);
  const says = train ? `<span class="sr-only">, ${live ? 'Live' : 'Scheduled'}</span>` : '';
  return `<span class="pill ${OUTLINE[line.kind] ?? 'round'} ${live ? 'live' : 'scheduled'}${small ? ' small' : ''}${big ? ' big' : ''}" style="--line:${line.colour};--lettering:${lettered}">${esc(line.name)}${says}</span>`;
}

/** A Delay as a chip, amber when late: none under half a minute, or where there's none to show. */
function delayChip(delay: number | undefined): string {
  if (!delay) return '';
  const late = delay > 0;
  return `<span class="delay ${late ? 'late' : 'early'}"><span aria-hidden="true">${late ? '+' : '−'}${Math.abs(delay)} min</span><span class="sr-only">${Math.abs(delay)} min ${late ? 'late' : 'early'}</span></span>`;
}

/** What a row says at its end, as the board's: a Delay, no live data, or on time for a Live Train; nothing for a Metro Train. */
function status(row: { delay?: number; live?: boolean; unreported?: boolean }): string {
  return delayChip(row.delay) || (row.unreported ? '<span class="status soft">no live data</span>' : row.live && row.delay !== undefined ? '<span class="status soft">on time</span>' : '');
}

const star = (on: boolean, what: string) =>
  `<button type="button" class="star${on ? ' on' : ''}" aria-pressed="${on}" aria-label="${on ? `Remove ${esc(what)} from Favourites` : `Add ${esc(what)} to Favourites`}">${on ? ICON.starOn : ICON.star}</button>`;

const closeButton = (label: string) => `<a class="close" href="${link({ screen: 'map' })}" aria-label="${label}">${ICON.close}</a>`;

/** A departure's row, as a board's: when it's expected to leave, minutes to go within the hour, its Line's pill, where it's headed, its status. */
function departure(row: Row): string {
  const off = row.cancelled ? 'cancelled' : row.skipped ? 'skipped' : '';
  const when = off || row.minutes >= 60 ? '' : `<span class="in">${row.minutes ? `${row.minutes} min` : 'now'}</span>`;
  const end = off ? `<span class="status ${off}">${off === 'cancelled' ? 'Cancelled' : "Doesn't stop here"}</span>` : status(row);
  const cells = `<time>${clock(row.time)}${when}</time>${pill(row.line, { live: row.live, train: true })}<span class="dest">${esc(row.headsign)}</span>${end}`;
  return `<li class="${off}">${off === 'cancelled' ? cells : `<a class="row" href="#follow">${cells}</a>`}</li>`;
}

/** A Line's state as words, and a chip for the Trains late: its Trains now, how late the worst is, how many Cancelled. */
function stateOf(s: LineState): { words: string; chips: string } {
  const words = s.trains
    ? [`${plural(s.trains, 'Train')} now`, s.late5 ? `worst +${s.worst} min` : '', s.cancelled ? `${s.cancelled} Cancelled` : ''].filter(Boolean).join(' · ')
    : ['No Trains now', s.cancelled ? `${s.cancelled} Cancelled` : ''].filter(Boolean).join(' · ');
  return { words, chips: s.late5 ? `<span class="delay late">${s.late5} late</span>` : '' };
}

// ---- The map's corners, as the app has them.
const legend = `<button type="button" class="maplibregl-ctrl card legend"><span class="marker live"></span><span class="caps"><b>${COUNT.live}</b> live</span><span class="marker scheduled"></span><span class="caps"><b>${COUNT.scheduled}</b> scheduled</span><span class="icon">${ICON.info}</span><span class="sr-only">. About</span></button>`;
/** The banner under the legend, as the map has it while its Network's live data is unavailable and its Trains are in view: here, on a Line's screen, fitted to the Line. */
const bannerNetwork = screen === 'line' ? NOW.networks.find((n) => n.id === LINE.network && n.unavailable) : undefined;
const banner = bannerNetwork ? `<div class="maplibregl-ctrl banner" role="status"><div class="card warning">${ICON.warning}<span><b>${esc(bannerNetwork.name)}</b> live data unavailable</span></div></div>` : '';
const language = `<div class="maplibregl-ctrl card lang"><span class="code">EN</span>${ICON.chevron}<select aria-label="Language"><option>English</option></select></div>`;
const CREDITS = 'OpenFreeMap © OpenMapTiles © OpenStreetMap contributors | Renfe, CC BY 4.0 | FGC, CC BY 4.0 | Powered by TRAM Barcelona | TMB, updated Oct 6, 2026';

/** The buttons that ride on the sheet's top edge: the credits, and on B Now and Nearby bottom right, with the random follow's die. */
function riders(): string {
  const fabs =
    nav === 'a'
      ? ''
      : `<div class="fabs"><button type="button" class="card fab" aria-label="Follow a random Train">${ICON.die}</button><a class="card fab nearby" href="${link({ screen: 'now' })}"${screen === 'now' ? ' aria-current="page"' : ''}>${ICON.now}<span>Now</span></a><button type="button" class="card fab nearby">${ICON.nearby}<span>Nearby</span></button></div>`;
  return `<div class="riders"><details class="credits"><summary class="card" aria-label="Show or hide the credits">${ICON.copyright}</summary><div class="card credits-text">${CREDITS}</div></details>${fabs}<div class="card credits-strip">${CREDITS}</div></div>`;
}

// ---- The ways in.
const TABS: { screen: Screen | 'nearby'; label: string; icon: string }[] = [
  { screen: 'search', label: 'Search', icon: ICON.search },
  { screen: 'nearby', label: 'Nearby', icon: ICON.nearby },
  { screen: 'now', label: 'Now', icon: ICON.now },
  { screen: 'favourites', label: 'Favourites', icon: ICON.star },
];

/** A's tab bar on a phone, its rail on a wide window, or its bar along the top: Search, Nearby, Now, Favourites. */
function tabs(): string {
  const items = TABS.map((tab) => {
    const here = tab.screen === screen || (tab.screen === 'now' && false);
    return `<a class="tab" href="${tab.screen === 'nearby' ? '#nearby' : link({ screen: tab.screen })}"${here ? ' aria-current="page"' : ''}><span class="tab-icon">${tab.icon}</span><span class="tab-label">${tab.label}</span></a>`;
  }).join('');
  return `<nav class="tabs card" aria-label="Main">${items}</nav>`;
}

/** B's field across the top. Typed, it shows what's typed and a clear button; focused, Favourites or what it found are under it. */
function searchBar(): string {
  const open = screen === 'search' || screen === 'favourites';
  const value = screen === 'search' ? typed : '';
  return `<form class="searchbar card${open ? ' open' : ''}" role="search" onsubmit="return false">${ICON.search}<input type="search" name="q" readonly placeholder="Station, Line or Train number" aria-label="Search a Station, Line or Train number" value="${esc(value)}"${open ? ' autofocus' : ''} />${value ? `<a class="clear" href="${link({ screen: 'favourites', q: null })}" aria-label="Clear">${ICON.close}</a>` : ''}</form>`;
}

// ---- Search.

/** One result: a leading mark, what it is, a line under it, and what's said at its end. */
function result(href: string, lead: string, title: string, under: string, end = ''): string {
  return `<li><a class="result" href="${href}"><span class="lead">${lead}</span><span class="what"><span class="what-title">${title}</span>${under ? `<span class="what-under">${under}</span>` : ''}</span><span class="end">${end}${ICON.right}</span></a></li>`;
}

function stationResults(r: SearchResults): string {
  if (!r.stations.length) return '';
  return `<h3 class="label">Stations</h3><ol class="results">${r.stations
    .map((s) => result(link({ screen: 'board' }), `<span class="station-mark">${ICON.station}</span>`, esc(s.name), `<span class="served">${s.lines.map((l) => pill(l, { small: true })).join('')}</span>`))
    .join('')}</ol>`;
}

function lineResults(r: SearchResults): string {
  if (!r.lines.length) return '';
  return `<h3 class="label">Lines</h3><ol class="results">${r.lines
    .map((l) => {
      const info = LINES[l.id];
      const s = stateOf(l.state);
      return result(l.id === R4_LINE.id ? link({ screen: 'line', line: null }) : '#line', pill(l.id, { big: true }), esc(networkName(info?.network ?? '')), s.words, s.chips);
    })
    .join('')}</ol>`;
}

function numberResults(r: SearchResults): string {
  if (!r.numbers.length) return '';
  const shown = r.numbers.slice(0, 6);
  return `<h3 class="label">Train numbers</h3><ol class="results">${shown
    .map((n) => {
      const where =
        n.state === 'running'
          ? `${n.live ? 'Live' : 'Scheduled'}${n.unreported ? ', no live data' : ''}${n.next ? ` · next ${esc(n.next.station ?? '')}, ${plain(n.next.at)}` : ''}`
          : n.state === 'cancelled'
            ? `Cancelled · was to leave ${esc(n.from ?? '')} at ${plain(n.leaves)}`
            : n.state === 'ended'
              ? `Ended at ${plain(n.arrives)}`
              : `Leaves ${esc(n.from ?? '')} at ${plain(n.leaves)}`;
      const end = n.state === 'cancelled' ? '<span class="status cancelled">Cancelled</span>' : n.state === 'running' ? status({ delay: n.delay, live: n.live, unreported: n.unreported }) : '';
      return result('#follow', pill(n.line, { live: n.state === 'running' && !!n.live, big: true }), `<b>${n.number}</b> to ${esc(n.headsign)}`, where, end);
    })
    .join('')}</ol>${r.numbers.length > shown.length ? `<p class="meta more-results">${r.numbers.length - shown.length} more with a number starting ${esc(r.query)}</p>` : ''}`;
}

/** What the field says before anything's typed: what it finds. */
function searchHints(): string {
  return `<h3 class="label">Find</h3><ul class="hints">
    <li><span class="lead"><span class="station-mark">${ICON.station}</span></span><span class="what"><span class="what-title">A Station</span><span class="what-under">Barcelona-Sants, Terrassa, Mataró</span></span></li>
    <li><span class="lead">${pill('rodalies:R4', { big: true })}</span><span class="what"><span class="what-title">A Line</span><span class="what-under">R4, S1, L3, T4</span></span></li>
    <li><span class="lead"><b class="num">77428</b></span><span class="what"><span class="what-title">A Train number</span><span class="what-under">Renfe's Trains only: none of FGC, TRAM or the Metro has one</span></span></li>
  </ul>`;
}

/** Search's body: the results for the query, or its hints. */
function searchBody(): string {
  const key = typed.trim().toLowerCase();
  const r = SEARCHES[key];
  if (!key) return searchHints();
  if (!r) return `<p class="empty">Nothing found for “${esc(typed)}”.</p>`;
  return `${lineResults(r)}${stationResults(r)}${numberResults(r)}`;
}

// ---- Favourites.
function favouriteStation(board: Board): string {
  return `<li class="fav"><div class="fav-head"><a class="fav-name" href="${link({ screen: 'board' })}">${esc(board.name)}</a>${star(true, board.name)}</div><ol class="rows">${board.departures.slice(0, 2).map(departure).join('')}</ol></li>`;
}

function favouriteLine(id: string): string {
  const info = LINES[id];
  const state = LINE_STATE[id];
  if (!info || !state) return '';
  const s = stateOf(state);
  const end = s.chips || (state.trains && !state.cancelled ? '<span class="status soft">on time</span>' : '');
  return `<li class="fav fav-line"><a class="fav-row" href="${id === R4_LINE.id ? link({ screen: 'line', line: null }) : '#line'}">${pill(id, { big: true })}<span class="what"><span class="what-title">${esc(networkName(info.network))}</span><span class="what-under">${s.words}</span></span><span class="end">${end}</span></a>${star(true, info.name)}</li>`;
}

function favouritesBody(): string {
  if (emptyFavourites) {
    return `<div class="empty-state"><span class="empty-star">${ICON.star}</span><p><b>Nothing here yet.</b></p><p>Tap the star on a Station's board or a Line's screen to keep it here. Favourites stay in this browser only.</p></div>`;
  }
  return `<h3 class="label">Stations</h3><ol class="favs">${FAVOURITES.stations.map((id) => (PLACES[id] ? favouriteStation(PLACES[id]) : '')).join('')}</ol>
    <h3 class="label">Lines</h3><ol class="favs">${FAVOURITES.lines.map(favouriteLine).join('')}</ol>
    <p class="meta keep">Kept in this browser only. Trains aren't kept: a Train is one day's run.</p>`;
}

// ---- A Line's screen.

/** The Line's strip: its Stations in order along its colour, its Trains on it now between them, and where Trips end. */
function lineStrip(): string {
  const selected = selectedRun;
  const calls = selected ? new Set(selected.calls) : undefined;
  const byAfter = new Map<number, typeof LINE.trains>();
  for (const t of LINE.trains) {
    if (selected && t.variant !== selected.key) continue;
    byAfter.set(t.after, [...(byAfter.get(t.after) ?? []), t]);
  }
  const lastMain = LINE.stations.findLastIndex((s) => s.calls > 0 && s.calls > (LINE.stations.at(-1)?.calls ?? 0));
  const items: string[] = [];
  const shown = LINE.stations.map((s, i) => ({ s, i })).filter(({ s }) => !calls || calls.has(s.id));
  shown.forEach(({ s, i }, k) => {
    const first = k === 0;
    const last = k === shown.length - 1;
    const tail = i > lastMain;
    const turns = s.starts + s.ends;
    // Where Trains start or end though the Line goes on, or the Line's own end.
    let note = '';
    if (!calls && tail) note = `${plural(s.calls, 'Train')} a day go on to ${esc(s.name)}`;
    else if (!calls && i === lastMain) note = `${plural(LINE.stations[i + 1]?.calls ?? 0, 'Train')} go on to ${esc(LINE.stations[i + 1]?.name ?? '')}`;
    else if (!calls && turns >= 4 && !first && !last) note = `${turns} of ${s.calls} Trains start or end here`;
    const end = first || last || (!calls && (tail || (turns >= 4 && s.calls > turns / 2 ? true : turns >= 4)));
    items.push(
      `<li class="stop${first ? ' origin' : ''}${last ? ' terminus' : ''}${end && !first && !last ? ' turn' : ''}${tail ? ' tail' : ''}" data-station="${i}"><span class="mark"></span><a class="stop-name" href="${link({ screen: 'board' })}"><span class="station-link">${esc(s.name)}</span>${note ? `<span class="stop-note">${note}</span>` : ''}</a></li>`,
    );
    for (const t of byAfter.get(i) ?? []) {
      const lateOrEarly = delayChip(t.delay);
      const sub = t.standsAt !== undefined ? `Standing at ${esc(LINE.stations[t.standsAt]?.name ?? '')}` : t.next ? `Next ${esc(t.next.station)}, ${plain(t.next.at)}` : '';
      items.push(
        `<li class="train ${t.live ? 'live' : 'scheduled'} ${t.way < 0 ? 'up' : 'down'}"><span class="mark"><i></i></span><a class="row train-row" href="#follow">${pill(t.line, { live: t.live, train: true })}<span class="dest">${t.way < 0 ? '↑' : '↓'} ${esc(t.headsign)}</span><span class="end">${lateOrEarly || (t.unreported ? '<span class="status soft">no live data</span>' : t.live && t.delay !== undefined ? '<span class="status soft">on time</span>' : '')}</span><span class="sub">${sub}</span></a></li>`,
      );
    }
  });
  return `<ol class="strip line-strip" aria-label="Stations" style="--line:${LINE.colour}">${items.join('')}</ol>`;
}

/** The runs of a Line as chips, fixed above its strip: all of them, or one at a time, which the strip then shows alone with its Trains. */
function variantChips(): string {
  const runs = LINE.variants.slice(0, 5);
  const chip = (label: string, count: string, selected: boolean, href: string) =>
    `<a class="chip" role="tab" aria-selected="${selected}" href="${href}"><b>${label}</b><span class="chip-n">${count}</span></a>`;
  return `<div class="chips" role="tablist" aria-label="Runs of this Line">${chip('All', plural(LINE.variants.reduce((n, v) => n + v.trips, 0), 'Trip'), !selectedRun, link({ alt: null, v: null }))}${runs
    .map((v, i) => chip(`${esc(v.fromName)} – ${esc(v.toName)}`, plural(v.trips, 'Trip'), selectedRun === v, link({ alt: 'chips', v: String(i) })))
    .join('')}</div>`;
}

function alertRows(rows: AlertRow[], byLine: boolean): string {
  return `<ol>${rows
    .map((a) => {
      const meta = [a.from === undefined ? '' : `From ${dateTime(a.from)}`, a.by, a.language ? `<span lang="${a.language === 'Español' ? 'es' : 'ca'}">${a.language}</span>` : ''].filter(Boolean).join(' · ');
      return `<li>${byLine && a.lines.length ? `<div class="served">${a.lines.slice(0, 12).map((l) => pill(l, { small: true })).join('')}</div>` : ''}${a.header ? `<strong>${esc(a.header)}</strong>` : ''}<p>${esc(a.text)}</p><p class="meta">${meta}</p></li>`;
    })
    .join('')}</ol>`;
}

/** A card's Alerts, folded away as the board's are. */
function alertsFold(rows: AlertRow[], open = false): string {
  if (!rows.length) return '';
  return `<div class="alerts"><button type="button" class="fold" aria-expanded="${open}"><span>${ICON.warning}${plural(rows.length, 'alert')}${open ? ICON.up : ICON.chevron}</span></button><div${open ? '' : ' hidden'}>${alertRows(rows, false)}</div></div>`;
}

function cancelledRows(rows: CancelledTrain[]): string {
  if (!rows.length) return '';
  return `<h3 class="label">Cancelled</h3><ol class="rows">${rows
    .map((c) => `<li class="cancelled"><time>${clock(c.leaves)}</time>${pill(c.line, { live: false, train: true })}<span class="dest">${esc(c.headsign)}<span class="from">from ${esc(c.from)}</span></span><span class="status cancelled">Cancelled</span></li>`)
    .join('')}</ol>`;
}

/** A Line's state, in the sheet's fixed top: how many Trains, and chips for its Delays, its Cancelled Trains and its Alerts, which open their details above the strip. */
function lineState(): string {
  const s = LINE.state;
  const late = s.late5 ? `<span class="delay late chip-like">${s.late5} late</span>` : s.live ? '<span class="status soft">none late</span>' : '';
  const cancelled = LINE.cancelled.length ? `<button type="button" class="chip-btn cancelled" aria-expanded="${opened}"><span>${LINE.cancelled.length} Cancelled</span>${opened ? ICON.up : ICON.chevron}</button>` : '';
  const alerts = LINE.alerts.length ? `<button type="button" class="chip-btn warn" aria-expanded="${opened}"><span>${ICON.warning}${plural(LINE.alerts.length, 'alert')}</span>${opened ? ICON.up : ICON.chevron}</button>` : '';
  const how = s.live ? (s.late5 ? `, worst +${s.worst} min` : '') : ', all Scheduled';
  return `<p class="meta status-line"><span class="dot${s.live ? ' live' : ''}"></span>${esc(networkName(LINE.network))} · ${plural(s.trains, 'Train')} now${how}</p><div class="state-chips">${late}${cancelled}${alerts}</div>`;
}

/** The run the chips have selected, if one. */
const selectedRun = chips && variant !== undefined ? LINE.variants[variant] : undefined;

function lineBody(): string {
  const details = opened
    ? `<div class="line-details">${cancelledRows(LINE.cancelled)}${LINE.alerts.length ? `<h3 class="label">Alerts</h3><div class="alerts">${alertRows(LINE.alerts, false)}</div>` : ''}</div>`
    : '';
  return `${details}<h3 class="label strip-label">Stations</h3>${lineStrip()}`;
}

// ---- Now.

/** How many Lines of a Network Now lists before a button for the rest. */
const LINES_SHOWN = 5;

/** A button in a list's end: how many more it holds, as the sheet's own do. */
const moreButton = (text: string) => `<button type="button" class="more" aria-expanded="false"><span>${text}</span>${ICON.chevron}</button>`;

function troubleRow(l: NetworkNow['lines'][number]): string {
  const href = l.id === R4_LINE.id ? link({ screen: 'line', line: null }) : '#line';
  const under = [l.cancelled ? `${l.cancelled} Cancelled` : '', l.unreported ? `${l.unreported} with no live data` : ''].filter(Boolean).join(' · ') || `${l.live} Live`;
  return `<li><a class="trouble-row" href="${href}">${pill(l.id)}<span class="what"><span class="what-title">${l.late5 ? `${l.late5} of ${l.trains} Trains late` : `${plural(l.trains, 'Train')}, none late`}</span><span class="what-under">${under}</span></span><span class="end">${l.late5 ? delayChip(l.worst) : ''}${ICON.right}</span></a></li>`;
}

/** A Network in trouble: its Trains, and its Lines with Trains late or Cancelled, the worst first. */
function networkBlock(n: NetworkNow): string {
  const troubled = n.lines.filter((l) => l.late5 || l.cancelled).sort((a, b) => b.late5 - a.late5 || b.worst - a.worst);
  const state = n.unavailable
    ? '<span class="chip warn">Live data unavailable</span>'
    : `<span class="delay late">${[n.late5 ? `${n.late5} late` : '', n.cancelled ? `${n.cancelled} Cancelled` : ''].filter(Boolean).join(' · ')}</span>`;
  const meta = n.unavailable ? `${plural(n.trains, 'Train')}, all Scheduled from the timetable` : `${plural(n.trains, 'Train')} · ${n.live} Live${n.trains - n.live ? `, ${n.trains - n.live} Scheduled` : ''}${n.unreported ? `, ${n.unreported} with no live data` : ''}`;
  const rest = troubled.length - LINES_SHOWN;
  return `<li class="net"><div class="net-head"><h4 class="net-name">${esc(networkName(n.id))}</h4>${state}</div><p class="meta">${meta}</p>${troubled.length ? `<ol class="trouble">${troubled.slice(0, LINES_SHOWN).map(troubleRow).join('')}</ol>` : ''}${rest > 0 ? moreButton(`${plural(rest, 'more Line')} with Trains late or Cancelled`) : ''}</li>`;
}

const CATALAN = ['rodalies', 'fgc', 'tram', 'metro'];

function whatsWrong(): string {
  const order = (n: NetworkNow) => (CATALAN.includes(n.id) ? CATALAN.indexOf(n.id) : 99);
  const trouble = (n: NetworkNow) => n.unavailable || n.late5 > 0 || n.cancelled > 0;
  const troubled = NOW.networks.filter(trouble).sort((a, b) => order(a) - order(b) || b.late5 - a.late5 || a.name.localeCompare(b.name));
  const quiet = NOW.networks.filter((n) => !trouble(n) && n.trains > 0);
  // A stretch's Closures once, with its Lines' pills, as T1, T2 and T3's are one.
  const stretches = new Map<string, { lines: string[]; stations: (string | undefined)[]; kind: string }>();
  for (const c of NOW.closures) {
    const key = `${c.stations.join('|')}|${c.kind}`;
    const found = stretches.get(key) ?? { lines: [], stations: c.stations, kind: c.kind };
    found.lines.push(c.line);
    stretches.set(key, found);
  }
  const closures = [...stretches.values()]
    .map((c) => `<li><span class="trouble-row static"><span class="lead pills">${c.lines.map((l) => pill(l)).join('')}</span><span class="what"><span class="what-title">${esc(c.stations[0] ?? '')} – ${esc(c.stations[1] ?? '')}</span><span class="what-under">${c.kind === 'single' ? 'Single track' : 'Closed, buses run instead'}</span></span></span></li>`)
    .join('');
  return `<h3 class="label">What's wrong</h3><p class="subtitle">Late is 5 minutes or more.</p><ol class="nets">${troubled.map(networkBlock).join('')}</ol>
    <p class="meta quiet"><b>No trouble:</b> ${quiet.map((n) => esc(networkName(n.id))).join(' · ')}.</p>
    <h4 class="sub-label">Closed or on a single track, as the map draws them</h4><ol class="trouble">${closures}</ol>`;
}

function whatsNotable(): string {
  const specials = NOW.specials
    .map((s) => {
      const name = s.id === 'fgc:MM' ? 'Montserrat rack railway' : s.id === 'fgc:FV' ? 'Vallvidrera funicular' : 'Montjuïc funicular';
      const train = s.running[0];
      const under = train ? `Running now, ${train.live ? 'Live' : 'Scheduled'}${train.delay ? ` · ${train.delay > 0 ? '+' : '−'}${Math.abs(train.delay)} min` : ''}` : s.next ? `Between rides · next ${plain(s.next.at)} from ${esc(s.next.from)}` : 'Not running';
      return `<li><span class="trouble-row static">${pill(s.id, { live: !!train?.live, train: !!train })}<span class="what"><span class="what-title">${name}</span><span class="what-under">${under}</span></span></span></li>`;
    })
    .join('');
  const france = NOW.france
    .filter((f) => !f.ended)
    .map((f) => {
      const there = f.beyond ?? '';
      const running = f.running ? `Running now${f.running.delay ? ` · +${f.running.delay} min` : ''}` : '';
      // Into France: where it's due beyond the border, and when it leaves; out of it: where it left, and where it's headed.
      const title = f.into ? `To ${esc(there)}, ${plain(f.border)}` : `From ${esc(there)}, ${plain(f.border)}`;
      const under = f.into ? running || `Leaves ${esc(f.from)} at ${plain(f.leaves)}` : `to ${esc(f.headsign)}${running ? ` · ${running}` : ''}`;
      return `<li><span class="trouble-row static">${pill(f.line, { live: !!f.running?.live, train: !!f.running })}<span class="what"><span class="what-title">${title}</span><span class="what-under">${under}</span></span></span></li>`;
    })
    .join('');
  const firstLast = NOW.networks
    .filter((n) => CATALAN.includes(n.id) && n.first && n.last)
    .map((n) => `<li><span class="trouble-row static"><span class="what"><span class="what-title">${esc(networkName(n.id))}</span><span class="what-under">First ${plain(n.first?.at ?? '')} · last ${plain(n.last?.at ?? '')}${n.last?.nextDay ? ' (after midnight)' : ''}, ${pill(n.last?.line ?? '', { small: true })} to ${esc(n.last?.to ?? '')}</span></span></span></li>`)
    .join('');
  const l = NOW.latest;
  const latest = l
    ? `<li><span class="trouble-row static">${pill(l.line, { live: l.live, train: true })}<span class="what"><span class="what-title">${esc(l.headsign)}${l.number ? ` · ${esc(l.number)}` : ''}</span><span class="what-under">${esc(networkName(LINES[l.line]?.network ?? ''))} · from ${esc(l.from)}, left ${plain(l.leaves)}</span></span><span class="end">${delayChip(l.delay)}</span></span></li>`
    : '';
  return `<h3 class="label">What's notable</h3>
    <h4 class="sub-label">The Train furthest behind its timetable</h4><ol class="trouble">${latest}</ol>
    <h4 class="sub-label">Rack railway and funiculars</h4><ol class="trouble">${specials}</ol>
    <h4 class="sub-label">Trains crossing into France</h4><ol class="trouble">${france}</ol>
    <h4 class="sub-label">First and last Trains today</h4><ol class="trouble">${firstLast}</ol>`;
}

/** Alerts as many as the sheet lists before its button for the rest: all of them are Now's, newest first (ADR-0012). */
const ALERTS_SHOWN = 6;

function nowBody(): string {
  const die = nav === 'a' ? `<button type="button" class="die-row card"><span class="icon">${ICON.die}</span><span>Follow a random Train</span></button>` : '';
  const shown = ALERTS.slice(0, ALERTS_SHOWN);
  return `<p class="meta status-line">${esc(CAPTURED.day.replace(/ 2026$/, ''))} · ${plain(CAPTURED.clock)} · ${COUNT.live} Live, ${COUNT.scheduled} Scheduled</p>${die}${whatsWrong()}${whatsNotable()}<h3 class="label">Alerts on the map</h3><p class="subtitle">${ALERTS.length} from Renfe and TRAM, newest first, in their own words.</p><div class="alerts all">${alertRows(shown, true)}</div>${moreButton(`${ALERTS.length - shown.length} more Alerts`)}`;
}

// ---- A Station's board, as #321 has it, with the star that keeps it in Favourites.
function boardScreen(): string {
  const b = PLACES[FAVOURITES.stations[0] ?? ''];
  if (!b) return '';
  const header = `<header class="nameboard"><div><h2 class="title" tabindex="-1">${esc(b.name)}</h2><div class="served">${b.lines.map((l) => pill(l, { small: true })).join('')}</div></div>${star(true, b.name)}${closeButton('Close the departures board')}</header>`;
  const body = `<h3 class="label">Next departures</h3><ol class="rows">${b.departures.map(departure).join('')}</ol>`;
  return sheet('board', header, body, b.name);
}

// ---- Sheets.
function sheet(kind: string, header: string, body: string, label: string): string {
  return `<section class="sheet up ${kind}" aria-label="${label}"><div class="sheet-top"><button type="button" class="handle" aria-expanded="true" aria-label="Show less"><span></span></button>${header}</div><div class="sheet-body">${body}</div></section>`;
}

function field(): string {
  const value = screen === 'search' ? typed : '';
  return `<form class="field card" role="search" onsubmit="return false">${ICON.search}<input type="search" name="q" readonly placeholder="Station, Line or Train number" aria-label="Search a Station, Line or Train number" value="${esc(value)}"${screen === 'search' ? ' autofocus' : ''} />${value ? `<a class="clear" href="${link({ q: '' })}" aria-label="Clear">${ICON.close}</a>` : ''}</form>`;
}

/** What's in the sheet, or under B's field, for the screen. */
function content(): { sheet?: string; drop?: string } {
  switch (screen) {
    case 'search':
      if (nav === 'a') return { sheet: sheet('search', `<header>${field()}${closeButton('Close Search')}</header>`, searchBody(), 'Search') };
      return { drop: `<section class="drop card" aria-label="Search results"><div class="drop-body">${searchBody()}</div></section>` };
    case 'favourites':
      if (nav === 'a') return { sheet: sheet('favourites', `<header><h2 class="title" tabindex="-1">Favourites</h2>${closeButton('Close Favourites')}</header>`, favouritesBody(), 'Favourites') };
      return { drop: `<section class="drop card" aria-label="Favourites"><div class="drop-body">${emptyFavourites ? '' : '<h3 class="label first">Favourites</h3>'}${favouritesBody().replace('<h3 class="label">Stations</h3>', '<h4 class="sub-label">Stations</h4>').replace('<h3 class="label">Lines</h3>', '<h4 class="sub-label">Lines</h4>')}</div></section>` };
    case 'line': {
      const header = `<header><h2 class="title line-title" tabindex="-1">${pill(LINE.id, { big: true })} <span>${esc(LINE.title)}</span></h2>${star(true, LINE.name)}${closeButton('Close the Line')}</header><div class="line-state">${lineState()}${chips ? variantChips() : ''}</div>`;
      return { sheet: sheet('line', header, lineBody(), `${LINE.name}`) };
    }
    case 'board':
      return { sheet: boardScreen() };
    case 'now':
      return { sheet: sheet('now', `<header><h2 class="title" tabindex="-1">Now</h2>${closeButton('Close Now')}</header>`, nowBody(), 'Now') };
    default:
      return {};
  }
}

// ---- The page: a frame, or with `?index` a list of every frame.

/** Every frame, linked: a list for whoever opens the page without knowing its query. */
function renderIndex() {
  const sets: [string, string][] = [
    ['Search', 'screen=search'],
    ['Search, empty', 'screen=search&q='],
    ['Search, Lines', 'screen=search&q=r1'],
    ['Search, Train numbers', 'screen=search&q=774'],
    ['Favourites', 'screen=favourites'],
    ['Favourites, empty', 'screen=favourites&empty=1'],
    ['A Line', 'screen=line'],
    ["A Line, with its Cancelled Trains and Alerts open", 'screen=line&open=1'],
    ['A Line, a chip for each run', 'screen=line&alt=chips&v=2'],
    ["A Line of a Network whose live data is unavailable", 'screen=line&line=cercanias-asturias%3AC6'],
    ['Now', 'screen=now'],
    ['Now at its length', 'screen=now&full=1'],
    ['A Station\'s board, with its star', 'screen=board'],
    ['The map', 'screen=map'],
    ["A's bar along the top, on a wide window", 'screen=now&bar=top'],
  ];
  document.title = 'Screens beyond the map, every frame (#328)';
  document.body.style.cssText = 'overflow:auto;padding:24px;font:15px/1.6 system-ui,sans-serif;color:#14305a;background:#fff';
  document.body.innerHTML = `<h1 style="font:400 24px var(--serif, Georgia)">Screens beyond the map, mocked up (#328)</h1><p>One frame to a page, in the app's cards, over the live map as it was at ${esc(CAPTURED.clock)} on ${esc(CAPTURED.day)}. Open one at 390 px wide, or on a wide window; add <code>&amp;theme=dark</code> for dark.</p><table cellpadding="6">${sets.map(([name, query]) => `<tr><td>${esc(name)}</td><td><a href="?nav=a&amp;${query}">A, the tab bar</a></td><td><a href="?nav=b&amp;${query}">B, the field</a></td></tr>`).join('')}</table>`;
}

/** One frame: the map and its corners, A's tab bar or B's field, the dock with its sheet. */
function renderFrame() {
  const { sheet: sheetHtml = '', drop = '' } = content();
  const mapNode = `<div id="map" class="maplibregl-map" style="background-image:url(${background()})">${glow()}<div class="maplibregl-control-container"><div class="maplibregl-ctrl-top-left">${legend}${banner}</div><div class="maplibregl-ctrl-top-right">${language}</div></div></div>`;
  document.body.innerHTML = `${mapNode}${nav === 'a' ? tabs() : searchBar() + drop}<div class="dock">${riders()}${sheetHtml}</div>`;

  // The chip of the run selected stays in view.
  const chosen = document.querySelector<HTMLElement>('.chips [aria-selected="true"]');
  const row = chosen?.parentElement;
  if (chosen && row) row.scrollLeft = chosen.offsetLeft - row.offsetLeft - 8;

  // A Line's strip opens at its Trains, a Station or two before the first, as one would open where the
  // viewer is: `?at=` names a Station by its place in the strip instead, and `?at=top` leaves it be.
  const at = params.get('at');
  const scrolled = document.querySelector<HTMLElement>('.sheet-body');
  if (scrolled && !full && !opened && screen === 'line' && at !== 'top') {
    const target = at === null ? scrolled.querySelector<HTMLElement>('li.train') : scrolled.querySelector<HTMLElement>(`[data-station="${at}"]`);
    if (target) scrolled.scrollTop = target.getBoundingClientRect().top - scrolled.getBoundingClientRect().top + scrolled.scrollTop - (at === null ? 100 : 8);
  }
}

if (params.has('index')) renderIndex();
else renderFrame();
