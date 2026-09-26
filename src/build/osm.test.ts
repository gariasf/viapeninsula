import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, test, vi } from 'vitest';
import { osmRails } from './osm.ts';

afterEach(() => {
  vi.unstubAllGlobals();
});

const way = { type: 'way', id: 1, nodes: [1, 2], geometry: [{ lat: 41.7, lon: 1.8 }, { lat: 41.71, lon: 1.8 }], tags: { railway: 'rail' } };

test('downloads the rails from the next Overpass mirror when one times out, and keeps them for the next run', async () => {
  const cache = await mkdtemp(join(tmpdir(), 'viapeninsula-'));
  const asked: { url: string; agent: string | null }[] = [];
  vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
    // The query for the rails within Catalonia; the one for those beyond its border answers the same way.
    const within = String(init.body).includes('area.catalonia');
    if (within) asked.push({ url, agent: new Headers(init.headers).get('User-Agent') });
    if (within && asked.length === 1) throw new DOMException('The operation was aborted due to timeout', 'TimeoutError');
    return new Response(JSON.stringify({ elements: [way] }));
  });

  expect(await osmRails(['rail'], cache)).toEqual([way]);
  expect(asked.map((a) => a.url)).toEqual(['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter']);
  // overpass-api.de refuses requests without a User-Agent.
  expect(asked.every((a) => a.agent?.includes('viapeninsula'))).toBe(true);

  vi.stubGlobal('fetch', () => {
    throw new Error('the second run should use its cached copy');
  });
  expect(await osmRails(['rail'], cache)).toEqual([way]);
});

test("leaves out rails that haven't opened yet", async () => {
  // Like the new tunnel to El Prat airport, mapped as rail with the year it opens.
  const opening = (date: string) => ({ ...way, tags: { railway: 'rail', opening_date: date } });
  vi.stubGlobal('fetch', async () => new Response(JSON.stringify({ elements: [way, opening('2999'), opening('2009-02-12')] })));
  expect(await osmRails(['rail'], await mkdtemp(join(tmpdir(), 'viapeninsula-')))).toEqual([way, opening('2009-02-12')]);
});

test("asks the next mirror when one finds no rails within Catalonia, even though it finds some beyond its border", async () => {
  // overpass.kumi.systems once answered the rails near the border but none within Catalonia.
  const beyond = { ...way, id: 2 };
  vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
    const within = String(init.body).includes('area.catalonia');
    const elements = within ? (url.includes('kumi') ? [way] : []) : [beyond];
    return new Response(JSON.stringify({ elements }));
  });
  expect(await osmRails(['rail'], await mkdtemp(join(tmpdir(), 'viapeninsula-')))).toEqual([way, beyond]);
});
