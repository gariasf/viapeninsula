// #213 ship: box 5's table from the harness's runs, the look's perf-table.mts by tree: each check budget.json names, main's
// median and runs' range, the branch's, the Δ, and the verdict: better, same, worse within the runs' spread (their ranges
// overlap) or **WORSE** beyond it, the gate. Then each round's branch − main, the load averages and the page errors.
//   node perf-table.mts <runs.jsonl> <desktop|phone>
import fs from 'node:fs';
import path from 'node:path';
import budget from '../../../wt-213b/src/page/budget.json' with { type: 'json' };
import { median, metrics, type Run } from '../../../wt-213b/src/page/perf.ts';

const [file, device] = process.argv.slice(2) as [string, 'desktop' | 'phone'];
const runs = fs.readFileSync(file, 'utf8').trim().split('\n').map((l) => JSON.parse(l) as Run).filter((r) => r.device === device);
const name = (r: Run) => (path.basename(r.tree) === 'wt-main' ? 'main' : 'branch');
const fmt = (x: number) => String(Math.round(x * 10) / 10);
const signed = (x: number) => `${x > 0 ? '+' : ''}${fmt(x)}`;
const values = (tree: string, scenario: string, metric: string) => runs.filter((r) => name(r) === tree && r.scenario === scenario).flatMap((r) => ({ ...metrics(r), heapPeakMB: r.heapPeakMB })[metric] ?? []) as number[];
const scenarios = [...new Set(runs.map((r) => r.scenario))];
const checks = scenarios.flatMap((scenario) => [
  ...budget.filter((c) => c.scenarios.includes(scenario) && c[device] !== null).map((c) => ({ scenario, metric: c.metric, check: c.check, limit: c[device] as number | undefined, atLeast: !!c.atLeast })),
  { scenario, metric: 'heapPeakMB', check: "JS heap's peak, garbage included, MB (not budgeted)", limit: undefined, atLeast: false },
]);
const [summary, rounds]: string[][] = [[], []];
let gate = 0;
for (const c of checks) {
  const [a, b] = [values('main', c.scenario, c.metric), values('branch', c.scenario, c.metric)];
  if (!a.length || !b.length) continue;
  const [ma, mb] = [median(a)!, median(b)!];
  const over = (m: number) => c.limit !== undefined && (c.atLeast ? m < c.limit : m > c.limit);
  const worse = c.atLeast ? mb < ma : mb > ma;
  const overlap = Math.min(...b) <= Math.max(...a) && Math.min(...a) <= Math.max(...b);
  const verdict = mb === ma ? 'same' : !worse ? 'better' : overlap ? 'worse, within the spread' : '**WORSE, beyond the spread**';
  if (c.limit !== undefined && worse && !overlap) gate++;
  const range = (xs: number[]) => `${fmt(Math.min(...xs))}–${fmt(Math.max(...xs))}`;
  summary.push(`| ${c.check} | ${c.scenario} | ${c.limit === undefined ? '' : `${c.atLeast ? '≥' : '≤'} ${c.limit}`} | ${fmt(ma)}${over(ma) ? ' ✗' : ''} | ${range(a)} | ${fmt(mb)}${over(mb) ? ' ✗' : ''} | ${range(b)} | ${signed(mb - ma)} | ${verdict} |`);
  rounds.push(`| ${c.scenario} | ${c.metric} | ${a.length === b.length ? b.map((x, i) => signed(x - a[i]!)).join(' ') : '–'} | ${a.map(fmt).join(' ')} | ${b.map(fmt).join(' ')} |`);
}
const pitch = runs.find((r) => r.pitch)?.pitch;
console.log(`${device}${pitch ? `, tilted ${pitch}°` : ', flat'}: ${runs.length} runs, main (c9046fb5) against the branch (213-3d). ✗: over its limit. Gate: ${gate ? `${gate} budgeted check(s) worse beyond the spread` : 'no budgeted check worse beyond the spread'}.\n`);
console.log('| Check | Scenario | Limit | Main | Main\'s runs | Branch | Branch\'s runs | Δ | |\n|---|---|---|---|---|---|---|---|---|');
console.log(summary.join('\n'));
console.log('\nEach round, branch − main, and the runs:\n\n| Scenario | Metric | Each round | Main\'s runs | Branch\'s runs |\n|---|---|---|---|---|');
console.log(rounds.join('\n'));
console.log('\nLoad averages (1, 5, 15 min), in order: ' + runs.map((r) => `${r.scenario} ${name(r)} #${r.run} ${r.load}`).join('; '));
const errors = [...new Set(runs.flatMap((r) => r.errors))];
console.log(`\nErrors: ${errors.length ? errors.join(' | ') : 'none'}`);
