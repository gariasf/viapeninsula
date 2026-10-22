// #213 look-measure: each check budget.json names, for each variant against A (main, tilted), from the harness's runs.jsonl:
// A's median with its runs' spread (min–max), and each variant's median, its difference from A's, and whether it's better,
// the same, or worse, and if worse whether within the runs' spread (their ranges overlap: noise) or beyond it; then each
// variant's round-by-round differences, each run's load average, and the page errors.
//   node perf-table.mts <runs.jsonl> <desktop|phone>
import fs from 'node:fs';
import budget from '../../../wt-213/src/page/budget.json' with { type: 'json' };
import { median, metrics, type Run } from '../../../wt-213/src/page/perf.ts';

const [file, device] = process.argv.slice(2) as [string, 'desktop' | 'phone'];
const runs = fs.readFileSync(file, 'utf8').trim().split('\n').map((l) => JSON.parse(l) as Run).filter((r) => r.device === device);
const name = (r: Run) => r.v213 ?? 'A';
const variants = [...new Set(runs.map(name))].sort((a, b) => (a === 'A' ? -1 : b === 'A' ? 1 : 0));
const scenarios = [...new Set(runs.map((r) => r.scenario))];
const fmt = (x: number) => String(Math.round(x * 10) / 10);
const signed = (x: number) => `${x > 0 ? '+' : ''}${fmt(x)}`;
const values = (v: string, scenario: string, metric: string) => runs.filter((r) => name(r) === v && r.scenario === scenario).flatMap((r) => ({ ...metrics(r), heapPeakMB: r.heapPeakMB })[metric] ?? []) as number[];
const checks = scenarios.flatMap((scenario) => [
  ...budget.filter((c) => c.scenarios.includes(scenario) && c[device] !== null).map((c) => ({ scenario, metric: c.metric, check: c.check, limit: c[device] as number, atLeast: !!c.atLeast })),
  { scenario, metric: 'heapPeakMB', check: "JS heap's peak, garbage included, MB (not budgeted)", limit: undefined, atLeast: false },
]);
const summary: string[] = [];
const rounds: string[] = [];
for (const c of checks) {
  const a = values('A', c.scenario, c.metric);
  if (!a.length) continue;
  const ma = median(a)!;
  const breach = (m: number) => c.limit !== undefined && (c.atLeast ? m < c.limit : m > c.limit);
  const cells = [`${fmt(ma)} (${fmt(Math.min(...a))}–${fmt(Math.max(...a))})${breach(ma) ? ' ✗' : ''}`];
  for (const v of variants.slice(1)) {
    const b = values(v, c.scenario, c.metric);
    if (!b.length) {
      cells.push('–');
      continue;
    }
    const mb = median(b)!;
    const worse = c.atLeast ? mb < ma : mb > ma;
    const overlap = Math.min(...b) <= Math.max(...a) && Math.min(...a) <= Math.max(...b);
    const verdict = mb === ma ? 'same' : !worse ? 'better' : overlap ? 'worse, noise' : '**WORSE**';
    cells.push(`${fmt(mb)} (${signed(mb - ma)}, ${verdict})${breach(mb) ? ' ✗' : ''}`);
    rounds.push(`| ${c.scenario} | ${c.metric} | ${v} | ${a.length === b.length ? b.map((x, i) => signed(x - a[i]!)).join(' ') : '–'} | ${b.map(fmt).join(' ')} | ${a.map(fmt).join(' ')} |`);
  }
  summary.push(`| ${c.check} | ${c.scenario} | ${c.limit === undefined ? '' : `${c.atLeast ? '≥' : '≤'} ${c.limit}`} | ${cells.join(' | ')} |`);
}
console.log(`${device}, tilted 45°: ${runs.length} runs, ${variants.join(', ')}, against A (main, tilted). ✗: over its limit.\n`);
console.log(`| Check | Scenario | Limit | A median (runs) | ${variants.slice(1).map((v) => `${v} (Δ against A)`).join(' | ')} |\n|---|---|---|---${'|---'.repeat(variants.length - 1)}|`);
console.log(summary.join('\n'));
console.log('\nEach round, variant − A, in the batch\'s order, and the runs:\n\n| Scenario | Metric | Variant | Each round | Variant\'s runs | A\'s runs |\n|---|---|---|---|---|---|');
console.log(rounds.join('\n'));
console.log('\nRuns (in order): ' + runs.map((r) => `${r.scenario} ${name(r)} #${r.run} load ${r.load}${r.errors.some((e) => e.startsWith('pageerror')) ? ' PAGEERROR' : ''}`).join('; '));
const errors = [...new Set(runs.flatMap((r) => r.errors))];
console.log(`Errors: ${errors.length ? errors.join(' | ') : 'none'}`);
