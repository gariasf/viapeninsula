// #213 ship: in each S3 run, the longest frame after the eight Cercanías tracks came, and the sources the page set from its start (ms).
//   node s3-timeline.mjs <runs.jsonl>...
import fs from 'node:fs';
for (const f of process.argv.slice(2)) for (const l of fs.readFileSync(f, 'utf8').trim().split('\n')) {
  const r = JSON.parse(l);
  if (r.scenario !== 'S3') continue;
  const tree = (r.tree.endsWith('wt-main') ? 'main' : 'branch') + (f.includes('/off/') ? ', decks off' : '');
  const ast = r.files.find((x) => /track-cercanias-asturias/.test(x.file));
  let g = { gap: 0, s: 0 };
  for (let i = 1; i < r.frames.length; i++) { const [s, e] = [r.frames[i - 1], r.frames[i]]; if (e > ast.end && s < ast.end + 5000 && e - s > g.gap) g = { gap: e - s, s }; }
  const ev = r.setData.filter(([t]) => t > g.s - 30 && t < g.s + g.gap + 400).map(([t, id, n]) => `${(t - g.s).toFixed(0)}:${id}${n < 0 ? '' : `(${n})`}`);
  console.log(`${tree} #${r.run} ${f.replace(/^.*\/ship\//, '')}: frame ${g.gap.toFixed(0)} ms; set from its start: ${ev.join(' ')}`);
}
