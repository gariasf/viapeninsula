// #828 measure: the perf gate's numbers from the harness's runs.jsonl, per scenario and metric: main's and the branch's medians,
// each with its runs' spread (min–max), and the branch's against main's: better, the same, or worse, and if worse whether
// within the runs' spread (their ranges overlap: noise) or beyond it. Also each run's load average and page errors.
//   node <SP>/828/measure/perf-table.mts <runs.jsonl> <desktop|phone> [first line, 1-based] [last line]
import fs from 'node:fs';
import path from 'node:path';
import { median, metrics, type Run } from '../../wt-828/src/page/perf.ts';

const [file, device, from = '1', to] = process.argv.slice(2) as [string, string, string?, string?];
const runs = fs.readFileSync(file, 'utf8').trim().split('\n').slice(Number(from) - 1, to ? Number(to) : undefined).map((l) => JSON.parse(l) as Run).filter((r) => r.device === device);
const trees = [...new Set(runs.map((r) => r.tree))];
const [main, branch] = trees as [string, string];
const HIGHER_BETTER = new Set(['restFps', 'followFps']);
const fmt = (x: number | undefined) => (x === undefined ? '–' : String(Math.round(x * 10) / 10));
const rows: string[] = [];
for (const scenario of [...new Set(runs.map((r) => r.scenario))]) {
  const of = (tree: string) => runs.filter((r) => r.scenario === scenario && r.tree === tree).map((r) => ({ ...metrics(r), heapPeakMB: r.heapPeakMB }));
  const [a, b] = [of(main), of(branch)];
  for (const metric of [...new Set([...a, ...b].flatMap((m) => Object.keys(m)))]) {
    const values = (ms: Record<string, number | undefined>[]) => ms.flatMap((m) => (m[metric] === undefined ? [] : [m[metric]!]));
    const [va, vb] = [values(a), values(b)];
    if (!va.length || !vb.length) continue;
    const [ma, mb] = [median(va)!, median(vb)!];
    const worse = HIGHER_BETTER.has(metric) ? mb < ma : mb > ma;
    const overlap = Math.min(...vb) <= Math.max(...va) && Math.min(...va) <= Math.max(...vb);
    const verdict = mb === ma ? 'same' : !worse ? 'better' : overlap ? 'worse, within spread (noise)' : 'WORSE, beyond spread';
    // Each round's branch run against its main run, alternated in one batch: the i-th of each, in the file's order.
    const pairs = va.length === vb.length ? vb.map((v, i) => `${v - va[i]! > 0 ? '+' : ''}${fmt(v - va[i]!)}`).join(' ') : '–';
    rows.push(`| ${scenario} | ${metric} | ${fmt(ma)} (${fmt(Math.min(...va))}–${fmt(Math.max(...va))}) | ${fmt(mb)} (${fmt(Math.min(...vb))}–${fmt(Math.max(...vb))}) | ${mb - ma > 0 ? '+' : ''}${fmt(mb - ma)} | ${pairs} | ${verdict} |`);
  }
}
console.log(`${device}: ${path.basename(main)} → ${path.basename(branch)}, ${runs.length} runs\n`);
console.log('| Scenario | Metric | main median (runs) | branch median (runs) | Δ | Each round, branch − main | Verdict |\n|---|---|---|---|---|---|---|');
console.log(rows.join('\n'));
console.log('\nRuns (in order): ' + runs.map((r) => `${r.scenario} ${path.basename(r.tree) === path.basename(main) ? 'main' : 'branch'} #${r.run} load ${r.load}${r.errors.filter((e) => e.startsWith('pageerror')).length ? ' PAGEERROR' : ''}`).join('; '));
const errors = [...new Set(runs.flatMap((r) => r.errors))];
console.log(`Errors: ${errors.length ? errors.join(' | ') : 'none'}`);
