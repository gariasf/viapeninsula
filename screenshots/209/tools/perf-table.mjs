// #209: perf.json (CPU 4× slower) and perf-1x.json (not slowed) as one table of medians, by variant and view.
import { existsSync, readFileSync } from 'node:fs';
const here = new URL('.', import.meta.url).pathname;
const runs = [['4×', 'perf.json'], ['1×', 'perf-1x.json']].filter(([, file]) => existsSync(`${here}${file}`)).map(([rate, file]) => [rate, JSON.parse(readFileSync(`${here}${file}`, 'utf8'))]);
const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
};
for (const [rate, rows] of runs) {
  console.log(`\nCPU ${rate}, medians of ${Math.max(...rows.map((r) => r.round)) + 1} runs:\n`);
  console.log('| Basemap | View | Variant | Busy ms/s | fps | p95 ms | Redraws/s |\n| --- | --- | --- | --- | --- | --- | --- |');
  const keys = [...new Set(rows.map((r) => `${r.scheme}|${r.view}|${r.label}`))].sort((a, b) => {
    const [sa, va] = a.split('|');
    const [sb, vb] = b.split('|');
    return sa.localeCompare(sb) || ['z13', 'z10', 'follow'].indexOf(va) - ['z13', 'z10', 'follow'].indexOf(vb);
  });
  for (const key of keys) {
    const [scheme, view, label] = key.split('|');
    const some = rows.filter((r) => `${r.scheme}|${r.view}|${r.label}` === key);
    const m = (k) => median(some.map((r) => r[k]));
    console.log(`| ${scheme} | ${view} | ${label} | ${Math.round(m('busy'))} | ${m('fps').toFixed(1)} | ${Math.round(m('p95'))} | ${m('redraws').toFixed(1)} |`);
  }
}
