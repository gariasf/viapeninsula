async (page) => {
  // The line-rendering study (#138): each spot at several zooms, main's strokes and the branch's, Trains hidden.
  // batch.json picks a batch: { from, to, zooms, tags }.
  const browser = page.context().browser();
  const TRACK = 'days/track-5d4012e1d2a7.json';
  const res = await page.request.get('http://localhost:5173/.playwright-mcp/138-study/spots.json');
  const all = await res.json();
  const batch = await (await page.request.get('http://localhost:5173/.playwright-mcp/138-study/batch.json')).json();
  const { from = 0, to = all.length, zooms = [10.5, 12, 13, 14], tags = ['before', 'after'] } = batch;
  const logs = [];
  const ctx = await browser.newContext({ viewport: { width: 800, height: 560 }, deviceScaleFactor: 2, locale: 'en-GB' });
  let tag = 'before';
  await ctx.route('https://viapeninsula-live.gariasf.com/**', async (r) => {
    const url = r.request().url();
    if (url.endsWith(TRACK)) {
      const f = await r.fetch({ url: `http://localhost:5173/.playwright-mcp/138/track-${tag}.json` });
      return r.fulfill({ status: 200, body: await f.body(), headers: { 'access-control-allow-origin': '*', 'content-type': 'application/json' } });
    }
    try {
      const f = await r.fetch({ headers: { ...r.request().headers(), origin: 'https://viapeninsula.gariasf.com' } });
      await r.fulfill({ response: f, headers: { ...f.headers(), 'access-control-allow-origin': '*' } });
    } catch {
      await r.abort().catch(() => {});
    }
  });
  for (tag of tags) {
    const p = await ctx.newPage();
    p.on('pageerror', (e) => logs.push(`${tag} pageerror: ${e.message}`));
    await p.goto(`http://localhost:5173/#map=12/41.39/2.17`);
    await p.waitForFunction(() => typeof window.map?.getSource === 'function' && window.map.getSource('lines')?.serialize().data.features.length > 0, null, { timeout: 60_000, polling: 250 });
    await p.evaluate(() => { for (const { id } of window.map.getStyle().layers) if (id.startsWith('train')) window.map.setLayoutProperty(id, 'visibility', 'none'); });
    for (const [name, lat, lon] of all.slice(from, to)) {
      for (const zoom of zooms) {
        await p.evaluate(([lon, lat, zoom]) => window.map.jumpTo({ center: [lon, lat], zoom, bearing: 0 }), [lon, lat, zoom]);
        await p.waitForTimeout(400);
        await p.waitForFunction(() => window.map.areTilesLoaded(), null, { timeout: 30_000, polling: 200 }).catch(() => logs.push(`${tag} ${name} ${zoom}: tiles slow`));
        await p.waitForTimeout(900);
        await p.screenshot({ path: `.playwright-mcp/138-study/${tag}-${name}-z${zoom}.png` });
      }
    }
    await p.close();
  }
  await ctx.close();
  return logs.length ? logs : 'ok';
}
