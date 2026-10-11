import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';
import type { Alert, Alerts, Words } from '../bundle.ts';
import { LIVE_SOURCES } from '../networks.ts';
import { ALERTS_START, fetchAlerts, readAlerts, type Answer, type Validators } from './alerts.ts';
import { START, type Fetched, type Get, type State } from './step.ts';

// Renfe's alerts.json as fetched at 11:39 on Wednesday 7 October 2026, the morning after heavy rain,
// cut down to Rodalies' 9 alerts (renfe.json) and to the 34 others of its 43 with a second entry
// (renfe-second-entries.json, #371), and TRAM's from both its halves at 12:35 (#339's first comment).
const recorded = (file: string) => readFileSync(new URL(`fixtures/alerts/${file}`, import.meta.url), 'utf8');

/** An answer to a request for alerts, with the validators Renfe gives its file where they're given. */
const answer = (text: string, validators: Validators = {}): Fetched<Answer> => ({ status: 200, body: { text, ...validators } });

const RENFE = { alerts: answer(recorded('renfe.json'), { etag: '"6ac5f5a4-18586"', modified: 'Wed, 07 Oct 2026 07:32:52 GMT' }) };

/** When the run fetched them. */
const NOW = Date.parse('2026-10-07T12:35:22+02:00');

/** The fetcher's first run, fetching Renfe's alerts. */
const renfeRun = (renfe = RENFE) => readAlerts(ALERTS_START, { renfe }, NOW);

/** One of Renfe's Alerts, by its ID, as the first run writes it. */
const renfeAlert = (id: string) => renfeRun().file?.renfe?.alerts.find((a) => a.id === id);

test("keeps each of Rodalies' Alerts by its ID, with its Lines as the bundle names them, when it began, and its words in Spanish, then Catalan", () => {
  // Renfe tags both of a Rodalies Alert's entries es, but its second is in Catalan.
  expect(renfeAlert('AVISO_518337')).toEqual({
    id: 'AVISO_518337',
    lines: ['rodalies:R3'],
    stations: [],
    from: Date.parse('2026-10-07T09:23:00+02:00'),
    description: [
      { language: 'es', text: 'Circulación ferroviaria entre La Garriga - Puigcerdà/La Tor de Querol con afectaciones. Servicio alternativo por carretera entre Ripoll - Puigcerdà i Fabra i Puig - Puigcerdà.' },
      { language: 'ca', text: "Circulació ferroviària entre la Garriga i Puigcerdà/La Tor de Querol amb afectacions. S'estableix un servei alternatiu per carretera entre Ripoll i Puigcerdà i entre Fabra i Puig i Puigcerdà." },
    ],
  });
});

test('names each of its Lines once, however many of their routes an Alert names', () => {
  // Renfe names all 38 of R1's routes, 24 of R2's twice over, 22 of R4's, 10 of R7's and 12 of R8's.
  expect(renfeAlert('AVISO_518298')?.lines).toEqual(['rodalies:R1', 'rodalies:R2', 'rodalies:R4', 'rodalies:R7', 'rodalies:R8']);
});

test('makes one Alert of those Renfe gives one ID and the same words, on the Lines of both', () => {
  // Renfe gives AVISO_518187, "Servicio alternativo por carretera en todo su recorrido", once for R8 and once for all 20 of Rodalies' Lines.
  const same = renfeRun().file?.renfe?.alerts.filter((a) => a.id === 'AVISO_518187');
  expect(same).toHaveLength(1);
  // 19 Lines: its R3a is R3, which it names too (#359).
  const all = ['R1', 'R2', 'R2N', 'R2S', 'R3', 'R4', 'R7', 'R8', 'R11', 'R13', 'R14', 'R15', 'R16', 'R17', 'RG1', 'RL3', 'RL4', 'RT1', 'RT2'];
  expect(same?.[0]?.lines.toSorted()).toEqual(all.map((name) => `rodalies:${name}`).toSorted());
});

/** What the first run writes for Renfe's Alerts that name Madrid's Lines, by their IDs: its six of 7 October 2026 that name Lines, whole and as Renfe gave them, which its file still has (#359). */
const madrid = (id: string) => readAlerts(ALERTS_START, { renfe: { alerts: answer(recorded('renfe-madrid.json')) } }, NOW).file?.renfe?.alerts.find((a) => a.id === id);

test("shows an Alert that names Madrid's C8, which has no Trips of its own but runs as C8a and C8b, on those two Lines and no other (#359)", () => {
  // AVISO_517064: from 10 to 12 October no Trains between Villalba de Guadarrama and Cercedilla, naming 12 routes of C8.
  expect(madrid('AVISO_517064')?.lines).toEqual(['cercanias-madrid:C8a', 'cercanias-madrid:C8b']);
  // AVISO_467462, the toilets at Cercedilla, names C8 and C9: C9, which only buses run, has no Line to be shown on, and stays as named.
  expect(madrid('AVISO_467462')?.lines).toEqual(['cercanias-madrid:C8a', 'cercanias-madrid:C8b', 'cercanias-madrid:C9']);
  expect(madrid('AVISO_483553')?.lines).toEqual(['cercanias-madrid:C9']);
});

test("leaves an Alert that names a Line the bundle has as Renfe names it, Madrid's C3, C4, C4a, C4b and C5 (#359)", () => {
  expect(madrid('AVISO_518347')?.lines).toEqual(['cercanias-madrid:C3', 'cercanias-madrid:C4', 'cercanias-madrid:C4a', 'cercanias-madrid:C4b']);
  expect(madrid('AVISO_518335')?.lines).toEqual(['cercanias-madrid:C4', 'cercanias-madrid:C4a', 'cercanias-madrid:C4b']);
  expect(madrid('AVISO_516750')?.lines).toEqual(['cercanias-madrid:C5']);
});

/** The Lines the first run writes for an Alert, made up, that names these routes, after Rodalies' in Renfe's file as recorded. */
const linesNaming = (...routes: string[]) => {
  const made = {
    id: 'AVISO_MADE_UP',
    alert: {
      activePeriod: [{ start: '1791358372' }],
      informedEntity: routes.map((routeId) => ({ routeId })),
      descriptionText: { translation: [{ text: 'Made up.', language: 'es' }] },
    },
  };
  return readAlerts(ALERTS_START, { renfe: renfeWith(made) }, NOW).file?.renfe?.alerts.find((a) => a.id === made.id)?.lines;
};

test("shows an Alert that names Rodalies' R3a, which runs as R3, on R3, once (#359)", () => {
  // Made up: none of the 8 on 7 October names R3a alone. On its two routes in the timetable, 51T0017R3a and 51T0018R3a.
  expect(linesNaming('51T0017R3a', '51T0018R3a')).toEqual(['rodalies:R3']);
  // Naming R3 too, as AVISO_518187 does, R3 is there once.
  expect(linesNaming('51T0244R3', '51T0017R3a', '51T0018R3a')).toEqual(['rodalies:R3']);
});

test("takes the Line a name is of by the Network the route is of, as Asturias' C8, which has Trips of its own, is not Madrid's (#359)", () => {
  // Made up: none of the 69 names it. Asturias' routes 20T0019C8 and 20T0020C8 have 894 Trips in the timetable of 10 October 2026, and Madrid's 10T0039C8 none.
  expect(linesNaming('20T0019C8', '20T0020C8')).toEqual(['cercanias-asturias:C8']);
  expect(linesNaming('20T0019C8', '10T0039C8')).toEqual(['cercanias-asturias:C8', 'cercanias-madrid:C8a', 'cercanias-madrid:C8b']);
});

test('names the Line a route_id ends in whatever it is, as "constructor" or "toString", which every object has, and not as one the config lists (#359)', () => {
  // Made up: a route_id's end is Renfe's text. Looked up among the config's names without its own only, it would be Object's function, and reading the file would fail.
  expect(linesNaming('10T0001constructor', '10T0002toString')).toEqual(['cercanias-madrid:constructor', 'cercanias-madrid:toString']);
});

/** Renfe's file as recorded, with these entities after Rodalies'. */
function renfeText(...entities: object[]) {
  const file = JSON.parse(recorded('renfe.json'));
  return JSON.stringify({ ...file, entity: [...file.entity, ...entities] });
}

/** Renfe's answer with its file as recorded, with these entities after Rodalies'. */
const renfeWith = (...entities: object[]) => ({ alerts: answer(renfeText(...entities)) });

// Three more from the same file, their routes cut down to two each: one of Madrid's on C5, one of
// Valencia's, núcleo 40, and one of Madrid's on a lift at Vicálvaro, by its stop_id.
const MADRID_C5 = {
  id: 'AVISO_516750',
  alert: {
    activePeriod: [{ start: '1790758620' }],
    informedEntity: [{ routeId: '10T0035C5' }, { routeId: '10T0048C5' }],
    descriptionText: { translation: [{ text: '#MadC5 Por obras de mejora en la infraestructura, los fines de semana del 3-4, 17-18 y 24-25 de octubre entre las 00:30h y las 10:00h, los trenes inician y finalizan su recorrido en Atocha. ', language: 'es' }] },
  },
};
const VALENCIA_C5 = {
  id: 'AVISO_470390',
  alert: {
    activePeriod: [{ start: '1767421620' }],
    informedEntity: [{ routeId: '40T0031C5' }, { routeId: '40T0064C5' }],
    descriptionText: { translation: [{ text: 'SERVICIO POR AUTOBÚS C-5: Plan alternativo de transporte por carretera.', language: 'es' }, { text: 'SERVEI PER AUTOBÚS C-5: Pla alternatiu de transport per carretera.', language: 'es' }] },
  },
};
/** Made up: Renfe's source as it was before Cercanías Valencia was on the map, without its núcleo, 40. */
const WITHOUT_VALENCIA = LIVE_SOURCES.map((s) => (s.id === 'renfe' ? { ...s, networks: Object.fromEntries(Object.entries(s.networks).filter(([start]) => start !== '40')) } : s));
const VICALVARO = {
  id: 'INFO_518355',
  alert: {
    activePeriod: [{ start: '1791357480' }],
    informedEntity: [{ stopId: '70100' }],
    descriptionText: { translation: [{ text: 'Ascensor de Vicálvaro, que da acceso a vías 1 y 3, sentido Chamartín, El Escorial, Cercedilla y Príncipe Pío, se encuentra fuera de servicio', language: 'es' }] },
  },
};

test("keeps only the Alerts on the Lines of the Networks on the map, and Renfe's on a Station, by its stop_id, as the bundle names it", () => {
  const alerts = readAlerts(ALERTS_START, { renfe: renfeWith(MADRID_C5, VALENCIA_C5, VICALVARO) }, NOW, WITHOUT_VALENCIA).file?.renfe?.alerts ?? [];
  expect(alerts.map((a) => a.id)).not.toContain('AVISO_470390');
  expect(alerts).toHaveLength(8 + 2);
  // Madrid's give their words in Spanish only.
  expect(alerts.find((a) => a.id === 'AVISO_516750')).toEqual({
    id: 'AVISO_516750',
    lines: ['cercanias-madrid:C5'],
    stations: [],
    from: Date.parse('2026-09-30T10:57:00+02:00'),
    description: [{ language: 'es', text: '#MadC5 Por obras de mejora en la infraestructura, los fines de semana del 3-4, 17-18 y 24-25 de octubre entre las 00:30h y las 10:00h, los trenes inician y finalizan su recorrido en Atocha.' }],
  });
  // A stop_id doesn't say which núcleo it's in, so a Station's Alert is kept whichever it is: the map shows those of the Stations it has.
  expect(alerts.find((a) => a.id === 'INFO_518355')).toMatchObject({ lines: [], stations: ['adif:70100'] });
});

/** What the first run writes for Renfe's other Alerts with a second entry, by their IDs: Valencia's 17, Bilbao's 11, San Sebastián's 5 and Murcia's 1 (#371). */
const others = () => Object.fromEntries((readAlerts(ALERTS_START, { renfe: { alerts: answer(recorded('renfe-second-entries.json')) } }, NOW).file?.renfe?.alerts ?? []).map((a) => [a.id, a]));

/** The language each of an Alert's entries is tagged with, first to last. */
const tagged = (alert?: Alert) => alert?.description.map((d) => d.language);

/** Those of `others()` that name a Line of any of these Networks. */
const onLinesOf = (...networks: string[]) => Object.values(others()).filter((a) => a.lines.some((line) => networks.includes(line.split(':')[0] ?? '')));

test("tags the second entry of each of Rodalies' Alerts ca, as the config says Rodalies' is in Catalan, though Renfe tags it es", () => {
  expect(renfeRun().file?.renfe?.alerts.map(tagged)).toEqual(Array(8).fill(['es', 'ca']));
});

test("tags the second entry of Valencia's Alerts on its Lines ca, as the config says it's in Valencian, though Renfe tags it es", () => {
  const valencia = onLinesOf('cercanias-valencia');
  // Of Valencia's 17 on 7 October, 4 name Lines: a late C2 Train, buses for C3 twice and buses for C5.
  expect(valencia.map((a) => a.id).toSorted()).toEqual(['AVISO_442947', 'AVISO_470390', 'AVISO_512648', 'AVISO_518349']);
  for (const alert of valencia) expect(tagged(alert)).toEqual(['es', 'ca']);
  expect(others().AVISO_518349).toEqual({
    id: 'AVISO_518349',
    lines: ['cercanias-valencia:C2'],
    stations: [],
    from: Date.parse('2026-10-07T08:52:00+02:00'),
    description: [
      { language: 'es', text: "Línea C2. Tren con salida prevista a las 08:30h de la estación de València Nord con destino l'Alcúdia, efectúa su salida con 17 minutos de retraso. Incidencia operativa." },
      { language: 'ca', text: "Línia C2. Tren amb eixida prevista a les 08:30h de l'estació de València Nord amb destinació l'Alcúdia, efectua la seua eixida amb 17 minuts de retard. Incidència operativa." },
    ],
  });
});

test("leaves the tags of an Alert that names only a Station as Renfe gives them, es, as a stop_id doesn't say which núcleo its Station is of: Valencia's 13 lifts and notices", () => {
  const stations = Object.values(others()).filter((a) => !a.lines.length);
  // Valencia's 13, and one of Bilbao's.
  expect(stations).toHaveLength(14);
  for (const alert of stations) expect(tagged(alert)).toEqual(['es', 'es']);
  expect(others().AVISO_518170?.description[1]?.text).toBe("Ascensor de l'estació de Carcaixent, sentit Xàtiva de via 2, es troba fora de servei. Disculpen les molèsties.");
});

test("keeps the Alerts of the núcleos the config says nothing of as Renfe gives them: Basque and Spanish in one entry, split by //, and Murcia's second entry that repeats its Spanish", () => {
  const given: { id: string; alert: { descriptionText: { translation: Words[] } } }[] = JSON.parse(recorded('renfe-second-entries.json')).entity;
  const kept = onLinesOf('cercanias-bilbao', 'cercanias-san-sebastian', 'cercanias-murcia-alicante');
  // Bilbao's 10 on Lines, San Sebastián's 5 and Murcia's 1.
  expect(kept).toHaveLength(16);
  for (const alert of kept) {
    const words = given.find((e) => e.id === alert.id)?.alert.descriptionText.translation.map(({ language, text }) => ({ language, text: text.trim() }));
    expect(alert.description).toEqual(words);
  }
  // Bilbao's San Mamés: Basque, then //, then Spanish, in one entry, given twice.
  const mames = 'SAN MAMES. Luis Briñas irtenbidea. 1. trenbideko eskailerak mekanikoak zerbitzuz kanpo daude. // Salida Luis Briñas. Escaleras mecánicas de vía 1 se encuentran fuera de servicio.';
  expect(others().INFO_516422?.description).toEqual([{ language: 'es', text: mames }, { language: 'es', text: mames }]);
  // San Sebastián's C1, which has no power: the one entry holds both, and its second is blank.
  expect(others().AVISO_518303?.description.map((d) => d.text.split(' // ').length)).toEqual([2, 1]);
  expect(tagged(others().AVISO_518303)).toEqual(['es', 'es']);
  expect(others().AVISO_446239?.description[1]).toEqual(others().AVISO_446239?.description[0]);
});

test("leaves an Alert on Lines of Networks the config says different things of as Renfe tags it, and tags one on Lines of Networks it says the same of", () => {
  // Made up: none of the 69 Alerts of 7 October names Lines of two núcleos. Valencia's late C2 Train, naming a route of Madrid's C5 or of Rodalies' R3 too.
  const naming = (routeId: string) => {
    const entity = JSON.parse(recorded('renfe-second-entries.json')).entity.find((e: { id: string }) => e.id === 'AVISO_518349');
    entity.alert.informedEntity.push({ routeId });
    return readAlerts(ALERTS_START, { renfe: renfeWith(entity) }, NOW).file?.renfe?.alerts.find((a) => a.id === 'AVISO_518349');
  };
  const withMadrid = naming('10T0035C5');
  expect(withMadrid?.lines).toEqual(['cercanias-valencia:C2', 'cercanias-madrid:C5']);
  expect(tagged(withMadrid)).toEqual(['es', 'es']);
  expect(naming('51T0244R3')?.lines).toEqual(['cercanias-valencia:C2', 'rodalies:R3']);
  expect(tagged(naming('51T0244R3'))).toEqual(['es', 'ca']);
});

/** TRAM's alerts as recorded, from Trambaix (TBX) and Trambesòs (TBS). */
const TRAM = { 'TBX GtfsRealtimeAlerts': answer(recorded('tram-tbx.json')), 'TBS GtfsRealtimeAlerts': answer(recorded('tram-tbs.json')) };

test("keeps TRAM's Alerts from both its halves, on its Lines T1–T6, with when each begins and ends, its effect, and its title and words in Catalan, Spanish and English", () => {
  const alerts = readAlerts(ALERTS_START, { tram: TRAM }, NOW).file?.tram?.alerts;
  expect(alerts?.map(({ description, ...rest }) => ({ ...rest, description: description.map((d) => d.language) }))).toEqual([
    {
      id: 'sc-280',
      lines: ['tram:T2', 'tram:T3', 'tram:T1'],
      stations: [],
      from: Date.parse('2026-10-01T07:00:05+02:00'),
      to: Date.parse('2026-10-13T01:00:05+02:00'),
      effect: 'MODIFIED_SERVICE',
      header: [
        { language: 'ca', text: 'Afectació T1, T2 i T3' },
        { language: 'es', text: 'Afectación T1, T2 y T3' },
        { language: 'en', text: 'T1, T2 and T3 Affected' },
      ],
      description: ['ca', 'es', 'en'],
    },
    {
      id: 'sc-279',
      lines: ['tram:T5', 'tram:T6'],
      stations: [],
      from: Date.parse('2026-10-01T02:05:27+02:00'),
      to: Date.parse('2027-04-30T10:05:27+02:00'),
      effect: 'MODIFIED_SERVICE',
      header: [
        { language: 'ca', text: 'T5 i T6 – Obres desdoblament' },
        { language: 'es', text: 'T5 y T6 – Obras de desdoblamiento' },
        { language: 'en', text: 'T5 and T6 – Track Doubling Works' },
      ],
      description: ['ca', 'es', 'en'],
    },
  ]);
  // Each as TRAM gives it, but for the line breaks after.
  expect(alerts?.[0]?.description[1]?.text).toBe('Los días 10, 11 y 12 de octubre, por obras de renovación de vía, sin servicio entre Francesc Macià y Montesa. Durante esta afectación, se habilitará un servicio alternativo de autobús.\n\nhttps://tram.cat/es/prensa/2296');
});

test("lists a feed's Alerts newest first", () => {
  // From 09:23 on 7 October back to 17:13 the evening before.
  expect(renfeRun().file?.renfe?.alerts.map((a) => a.id)).toEqual(['AVISO_518337', 'AVISO_518352', 'AVISO_518348', 'AVISO_518332', 'AVISO_518345', 'AVISO_518298', 'AVISO_518323', 'AVISO_518187']);
});

/** The validators Renfe gave its file as recorded, which it last changed at 09:32:52. */
const ETAG = '"6ac5f5a4-18586"';
const MODIFIED = 'Wed, 07 Oct 2026 07:32:52 GMT';

/** Where TRAM's alerts are. */
const TRAM_ALERTS = 'https://opendata.tram.cat/api/v1/GtfsRealtimeAlerts';

/**
 * A Worker's `get` that answers as Renfe does: with its file as recorded and its validators, or with
 * 304 and no body to a request that names them; and as TRAM does, with each half's alerts as recorded,
 * unless it's given another answer for them. Renfe's file can be given too. It notes each request: its
 * URL, and the headers that make it conditional or carry a token.
 */
function answering(asked: string[], tramAnswer?: Failed, renfe = recorded('renfe.json')): Get {
  const tram: Record<string, string> = { [`${TRAM_ALERTS}?networkId=1`]: recorded('tram-tbx.json'), [`${TRAM_ALERTS}?networkId=2`]: recorded('tram-tbs.json') };
  return async (url, read, init) => {
    const headers = new Headers(init?.headers);
    asked.push([url, headers.get('if-none-match'), headers.get('if-modified-since'), headers.get('authorization')].filter(Boolean).join(' '));
    if (tram[url] && tramAnswer) return 'error' in tramAnswer ? tramAnswer : { status: tramAnswer.status, body: await read(new Response('', tramAnswer)) };
    const unchanged = headers.get('if-none-match') === ETAG;
    const res = tram[url] ? new Response(tram[url]) : unchanged ? new Response(null, { status: 304 }) : new Response(renfe, { headers: { etag: ETAG, 'last-modified': MODIFIED } });
    return { status: res.status, body: await read(res) };
  };
}

/** An answer that fails: one with an HTTP status, or none. */
type Failed = { status: number } | { error: string };

/** The live data's state, with an access token TRAM's adapter keeps, made up, as TRAM issues one for an hour. */
const WITH_TOKEN: State = { ...START.state, own: { tram: { access: { token: 'made-up token', expires: NOW + 3_600_000 } } } };

/**
 * The fetcher's runs every 20 s from NOW, for so many minutes, each asking for the alerts that are
 * due, as the Worker does, with the live data's state the run starts from, and TRAM answering its
 * alerts as recorded unless it's given another answer. Gives the requests each run made, by when, in
 * seconds from NOW, and the state after the last.
 */
async function runs(minutes: number, live = WITH_TOKEN, tramAnswer?: Failed) {
  const made: { at: number; requests: string[] }[] = [];
  let state = ALERTS_START;
  for (let t = 0; t < minutes * 60_000; t += 20_000) {
    const requests: string[] = [];
    ({ state } = readAlerts(state, await fetchAlerts(state, live, answering(requests, tramAnswer)), NOW + t));
    made.push({ at: t / 1000, requests });
  }
  return Object.assign(made, { state });
}

test("asks Renfe for its alerts on every run, but for its file only if it has changed since the one the fetcher read", async () => {
  const renfe = (await runs(1, START.state)).flatMap((run) => run.requests);
  expect(renfe).toEqual(['https://gtfsrt.renfe.com/alerts.json', ...Array(2).fill(`https://gtfsrt.renfe.com/alerts.json ${ETAG} ${MODIFIED}`)]);
});

test('asks TRAM for its alerts every 5 minutes, for both its halves, with the access token its adapter keeps, and not while it keeps none', async () => {
  const tram = (await runs(11)).map(({ at, requests }) => ({ at, requests: requests.filter((r) => r.startsWith(TRAM_ALERTS)) })).filter((run) => run.requests.length);
  const both = [`${TRAM_ALERTS}?networkId=1 Bearer made-up token`, `${TRAM_ALERTS}?networkId=2 Bearer made-up token`];
  expect(tram).toEqual([0, 300, 600].map((at) => ({ at, requests: both })));
  // As before TRAM issues its adapter a token, or after it refuses one: then the adapter keeps none.
  expect((await runs(11, START.state)).flatMap((run) => run.requests).filter((r) => r.startsWith(TRAM_ALERTS))).toEqual([]);
});

test("never asks TRAM for an access token, nor changes what its adapter keeps, where TRAM refuses its alerts or fails them, and asks again 5 minutes later", async () => {
  const failures: [Failed, string][] = [
    [{ status: 401 }, 'TBX GtfsRealtimeAlerts: HTTP 401'],
    [{ status: 503 }, 'TBX GtfsRealtimeAlerts: HTTP 503'],
    [{ error: 'Error: no answer in 10 s' }, 'TBX GtfsRealtimeAlerts: Error: no answer in 10 s'],
  ];
  for (const [tramAnswer, status] of failures) {
    const live = structuredClone(WITH_TOKEN);
    const made = await runs(11, live, tramAnswer);
    const tram = made.flatMap((run) => run.requests).filter((r) => r.includes('tram.cat'));
    expect(tram.every((r) => r.startsWith(TRAM_ALERTS))).toBe(true);
    expect(made.filter((run) => run.requests.some((r) => r.startsWith(TRAM_ALERTS))).map((run) => run.at)).toEqual([0, 300, 600]);
    // The live data's state, with TRAM's token and any wait, is as it was: only TRAM's adapter changes it.
    expect(live).toEqual(WITH_TOKEN);
    expect(made.state.feeds.tram?.status).toBe(status);
  }
});

/** Renfe's answer to a request for a file that hasn't changed since the one it names. */
const UNCHANGED = { alerts: { status: 304, body: { text: '' } } };

test("never counts Renfe's file unchanged for hours as a failure, whether Renfe answers that it's unchanged or sends it again", () => {
  // As on 7 October 2026, when Renfe's file stood from 09:32:52 into the evening: 3 hours of runs, then the same file sent again.
  const end = NOW + 3 * 3_600_000;
  let { state } = renfeRun();
  const statuses = new Set<string | undefined>();
  for (let t = NOW + 20_000; t <= end; t += 20_000) {
    ({ state } = readAlerts(state, { renfe: UNCHANGED }, t));
    statuses.add(state.feeds.renfe?.status);
  }
  ({ state } = readAlerts(state, { renfe: RENFE }, end + 20_000));
  expect(statuses).toEqual(new Set(['ok']));
  expect(state.feeds.renfe).toMatchObject({ read: end + 20_000, status: 'ok', alerts: renfeRun().state.feeds.renfe?.alerts });
});

/** When Renfe's file as recorded last changed, 09:32:52 on 7 October by its Last-Modified, in ms since 1970. */
const CHANGED = Date.parse('2026-10-07T09:32:52+02:00');

test("keeps when each feed's file last changed: Renfe's Last-Modified, and its header's timestamp where the file comes with none, the later of TRAM's two halves'", () => {
  expect(renfeRun().file?.renfe?.changed).toBe(CHANGED);
  // Renfe's header says the same moment, 1791358372 s, as it did on 7 October 2026.
  expect(renfeRun({ alerts: answer(recorded('renfe.json')) }).file?.renfe?.changed).toBe(CHANGED);
  // Where they differ, its Last-Modified, which the next run's conditional request names: made up, a file written again at 10:00.
  expect(renfeRun({ alerts: answer(recorded('renfe.json'), { etag: ETAG, modified: 'Wed, 07 Oct 2026 08:00:00 GMT' }) }).file?.renfe?.changed).toBe(Date.parse('2026-10-07T10:00:00+02:00'));
  // Made up: a Last-Modified that's no time, or the epoch's, as a server dates a file it doesn't, is none: the header's timestamp.
  for (const modified of ['Thu, 01 Jan 1970 00:00:00 GMT', 'not a date']) {
    expect(renfeRun({ alerts: answer(recorded('renfe.json'), { etag: ETAG, modified }) }).file?.renfe?.changed).toBe(CHANGED);
  }
  // TRAM's files are written when asked: each header's timestamp is then, 12:35:21 for Trambaix's and 12:35:22 for Trambesòs'.
  expect(readAlerts(ALERTS_START, { tram: TRAM }, NOW).file?.tram?.changed).toBe(Date.parse('2026-10-07T12:35:22+02:00'));
  // A feed that gives neither has none, which isn't a failure: a header with no timestamp, and no Last-Modified.
  const headless = answer(JSON.stringify({ header: { gtfsRealtimeVersion: '2.0' }, entity: [] }));
  expect(readAlerts(ALERTS_START, { renfe: { alerts: headless } }, NOW).file?.renfe).toEqual({ read: NOW, status: 'ok', alerts: [] });
  expect(readAlerts(ALERTS_START, { renfe: { alerts: headless } }, NOW).file?.renfe?.changed).toBeUndefined();
});

test("keeps when Renfe's file last changed through the 304s it answers while it stands, and tries that fail, and takes the new time once it's sent again", () => {
  const first = renfeRun();
  const same = readAlerts(first.state, { renfe: UNCHANGED }, NOW + 20_000);
  expect(same.state.feeds.renfe?.changed).toBe(CHANGED);
  // Written with the rest, at the least every 5 minutes, though it hasn't moved.
  expect(readAlerts(same.state, { renfe: UNCHANGED }, NOW + 300_000).file?.renfe).toMatchObject({ changed: CHANGED });
  const failed = readAlerts(same.state, { renfe: { alerts: { status: 503, body: { text: '' } } } }, NOW + 40_000);
  expect(failed.state.feeds.renfe).toMatchObject({ status: 'alerts: HTTP 503', changed: CHANGED });
  // Made up: sent again at 13:00 on the 10th, with the validators of a file Renfe wrote then.
  const sent = answer(recorded('renfe.json'), { etag: '"6ac61234-17000"', modified: 'Sat, 10 Oct 2026 11:00:00 GMT' });
  expect(readAlerts(failed.state, { renfe: { alerts: sent } }, NOW + 60_000).state.feeds.renfe?.changed).toBe(Date.parse('2026-10-10T13:00:00+02:00'));
});

test("keeps a file's new time, where its Alerts are the same, for the write that's due, and doesn't write alerts.json for it alone", () => {
  const first = renfeRun();
  // Made up: Renfe writes its file again at 09:40, with what it had in it, so that only its time moves.
  const again = answer(recorded('renfe.json'), { etag: '"6ac61234-17000"', modified: 'Wed, 07 Oct 2026 07:40:00 GMT' });
  const soon = readAlerts(first.state, { renfe: { alerts: again } }, NOW + 20_000);
  const at0940 = Date.parse('2026-10-07T09:40:00+02:00');
  expect(soon.file).toBeUndefined();
  expect(soon.state.feeds.renfe?.changed).toBe(at0940);
  // The write 5 minutes on has it.
  expect(readAlerts(soon.state, { renfe: UNCHANGED }, NOW + 300_000).file?.renfe).toMatchObject({ changed: at0940 });
});

test("asks Renfe for its whole file once, though it hasn't changed it, where the fetcher kept it from before it kept when it changed, so that the time comes through its 304s", async () => {
  // What the Durable Object held before #390: the first run's, but with no `changed`, read as the fetcher's first reading read it.
  const kept = renfeRun().state.feeds.renfe;
  if (!kept) throw new Error('Renfe was not read');
  const renfe = LIVE_SOURCES.find((s) => s.id === 'renfe');
  const before = { feeds: { renfe: { ...kept, changed: undefined, readWith: JSON.stringify([1, renfe]) } }, written: NOW };
  const asked: string[] = [];
  const get = answering(asked);
  const first = readAlerts(before, await fetchAlerts(before, START.state, get), NOW + 20_000);
  await fetchAlerts(first.state, START.state, get);
  const url = 'https://gtfsrt.renfe.com/alerts.json';
  expect(asked).toEqual([url, `${url} ${ETAG} ${MODIFIED}`]);
  expect(first.state.feeds.renfe?.changed).toBe(CHANGED);
});

test("keeps a feed's last Alerts through tries that fail, saying why, and when it last read them", () => {
  const good = renfeRun();
  // Each run after, 20 s apart, finds Renfe's file down, garbled, empty, or not alerts.
  const failures: [Fetched<Answer>, string][] = [
    [{ status: 503, body: { text: '' } }, 'alerts: HTTP 503'],
    [{ error: 'Error: no answer in 10 s' }, 'alerts: Error: no answer in 10 s'],
    [answer('<html>'), 'alerts: not JSON'],
    [answer(''), 'alerts: empty'],
    [answer('{"message": "An error has occurred."}'), 'alerts: not GTFS-RT'],
  ];
  let state = good.state;
  for (const [i, [alerts, status]] of failures.entries()) {
    const failed = readAlerts(state, { renfe: { alerts } }, NOW + (i + 1) * 20_000);
    expect(failed.file?.renfe).toEqual({ read: NOW, status, alerts: good.file?.renfe?.alerts, changed: CHANGED });
    state = failed.state;
  }
  // TRAM's fail where either half does, keeping both halves'.
  const tram = readAlerts(ALERTS_START, { tram: TRAM }, NOW);
  const refused = readAlerts(tram.state, { tram: { ...TRAM, 'TBX GtfsRealtimeAlerts': { status: 401, body: { text: '' } } } }, NOW + 300_000);
  expect(refused.file?.tram).toEqual({ read: NOW, status: 'TBX GtfsRealtimeAlerts: HTTP 401', alerts: tram.file?.tram?.alerts, changed: tram.file?.tram?.changed });
  // One that has never worked has none.
  expect(readAlerts(ALERTS_START, { renfe: { alerts: { status: 503, body: { text: '' } } } }, NOW).file?.renfe).toEqual({ status: 'alerts: HTTP 503', alerts: [] });
});

test('writes alerts.json when what it holds changes, and at least every 5 minutes, so that it says when each feed was last read', () => {
  // Renfe's file stands for 11 minutes, but for 7:00 to 7:20, when Renfe answers with a server error,
  // and 9:00, when it has dropped AVISO_518187. TRAM's are read every 5 minutes, and stay the same.
  const file = JSON.parse(recorded('renfe.json'));
  const dropped = { alerts: answer(JSON.stringify({ ...file, entity: file.entity.filter((e: { id: string }) => e.id !== 'AVISO_518187') }), { etag: '"6ac61234-17000"' }) };
  const renfe = (s: number) => (s === 0 ? RENFE : s === 420 || s === 440 ? { alerts: { status: 503, body: { text: '' } } } : s === 540 ? dropped : UNCHANGED);
  let state = ALERTS_START;
  const written: [number, Alerts][] = [];
  for (let s = 0; s < 660; s += 20) {
    const run = readAlerts(state, { renfe: renfe(s), ...(s % 300 ? {} : { tram: TRAM }) }, NOW + s * 1000);
    if (run.file) written.push([s, run.file]);
    state = run.state;
  }
  expect(written.map(([s]) => s)).toEqual([0, 300, 420, 460, 540]);
  const [, at300, at420] = written.map(([, f]) => f);
  expect(at300).toMatchObject({ renfe: { read: NOW + 300_000, status: 'ok' }, tram: { read: NOW + 300_000, status: 'ok' } });
  expect(at420).toMatchObject({ renfe: { read: NOW + 400_000, status: 'alerts: HTTP 503' }, tram: { read: NOW + 300_000, status: 'ok' } });
  expect(written.at(-1)?.[1].renfe?.alerts.map((a) => a.id)).not.toContain('AVISO_518187');
});

test("lists TRAM's Alerts newest first across both its halves, and an Alert both halves give once", () => {
  const ids = (tbx: string, tbs: string) => readAlerts(ALERTS_START, { tram: { 'TBX GtfsRealtimeAlerts': answer(recorded(tbx)), 'TBS GtfsRealtimeAlerts': answer(recorded(tbs)) } }, NOW).file?.tram?.alerts.map((a) => a.id);
  // Made up: Trambesòs' Alert in Trambaix's answer, and the other way round.
  expect(ids('tram-tbs.json', 'tram-tbx.json')).toEqual(['sc-280', 'sc-279']);
  // Made up: Trambaix's Alert, on T1, T2 and T3, in both halves' answers, as one on all of TRAM might be.
  expect(ids('tram-tbx.json', 'tram-tbx.json')).toEqual(['sc-280']);
});

test("asks Renfe for its whole file once the config names another Network in it, and reads that Network's Alerts, though Renfe hasn't changed the file", async () => {
  // Cercanías Valencia, added to Renfe's source by configuration only, as Madrid was (#248).
  const asked: string[] = [];
  const get = answering(asked, undefined, renfeText(VALENCIA_C5));
  const before = readAlerts(ALERTS_START, await fetchAlerts(ALERTS_START, START.state, get, WITHOUT_VALENCIA), NOW, WITHOUT_VALENCIA);
  const added = readAlerts(before.state, await fetchAlerts(before.state, START.state, get), NOW + 20_000);
  await fetchAlerts(added.state, START.state, get);
  const url = 'https://gtfsrt.renfe.com/alerts.json';
  expect(asked).toEqual([url, url, `${url} ${ETAG} ${MODIFIED}`]);
  expect(added.file?.renfe?.alerts.find((a) => a.id === 'AVISO_470390')?.lines).toEqual(['cercanias-valencia:C5']);
});

test("asks Renfe for its whole file once the config says another Network's Alerts give their second entry in Catalan, and tags it so, though Renfe hasn't changed the file", async () => {
  // Made up: Renfe's source as it was before Valencia's second entry was said to be in Valencian.
  const WITHOUT_SECOND = LIVE_SOURCES.map((s) => {
    const second = Object.entries(s.alerts?.secondEntry ?? {}).filter(([network]) => network !== 'cercanias-valencia');
    return s.id === 'renfe' && s.alerts ? { ...s, alerts: { ...s.alerts, secondEntry: Object.fromEntries(second) } } : s;
  });
  const asked: string[] = [];
  const get = answering(asked, undefined, recorded('renfe-second-entries.json'));
  const before = readAlerts(ALERTS_START, await fetchAlerts(ALERTS_START, START.state, get, WITHOUT_SECOND), NOW, WITHOUT_SECOND);
  const added = readAlerts(before.state, await fetchAlerts(before.state, START.state, get), NOW + 20_000);
  await fetchAlerts(added.state, START.state, get);
  const url = 'https://gtfsrt.renfe.com/alerts.json';
  expect(asked).toEqual([url, url, `${url} ${ETAG} ${MODIFIED}`]);
  const late = (run: ReturnType<typeof readAlerts>) => tagged(run.state.feeds.renfe?.alerts.find((a) => a.id === 'AVISO_518349'));
  expect(late(before)).toEqual(['es', 'es']);
  expect(late(added)).toEqual(['es', 'ca']);
});

test("asks Renfe for its whole file once the config says where an Alert on a Line the bundle lacks is shown, and shows it there, though Renfe hasn't changed the file (#359)", async () => {
  // Made up: Renfe's source as it was before, which said none.
  const WITHOUT_LINES = LIVE_SOURCES.map((s) => {
    if (s.id !== 'renfe' || !s.alerts) return s;
    const { lines: _, ...alerts } = s.alerts;
    return { ...s, alerts };
  });
  const asked: string[] = [];
  const get = answering(asked, undefined, recorded('renfe-madrid.json'));
  const before = readAlerts(ALERTS_START, await fetchAlerts(ALERTS_START, START.state, get, WITHOUT_LINES), NOW, WITHOUT_LINES);
  const added = readAlerts(before.state, await fetchAlerts(before.state, START.state, get), NOW + 20_000);
  await fetchAlerts(added.state, START.state, get);
  const url = 'https://gtfsrt.renfe.com/alerts.json';
  expect(asked).toEqual([url, url, `${url} ${ETAG} ${MODIFIED}`]);
  const lines = (run: ReturnType<typeof readAlerts>) => run.state.feeds.renfe?.alerts.find((a) => a.id === 'AVISO_517064')?.lines;
  expect(lines(before)).toEqual(['cercanias-madrid:C8']);
  expect(lines(added)).toEqual(['cercanias-madrid:C8a', 'cercanias-madrid:C8b']);
});
