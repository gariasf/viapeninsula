// #213 ship: what fills the longest busy stretch of the main thread in a CPU profile (perf-prof.ts's S3, z7 to madrid):
// its self and total time by function, the minified frames read back through the dist's source maps.
//   node prof.mts <profile.cpuprofile> <dist dir> [top] [runs.jsonl tree]
import fs from 'node:fs';
import path from 'node:path';
import { SourceMapConsumer } from '/Users/guillem.arias/Documents/gariasf/viapeninsula/node_modules/source-map-js/source-map.js';

type Node = { id: number; callFrame: { functionName: string; url: string; lineNumber: number; columnNumber: number }; children?: number[] };
const [file, dist, top = '25'] = process.argv.slice(2) as [string, string, string?];
const p = JSON.parse(fs.readFileSync(file, 'utf8')) as { nodes: Node[]; samples: number[]; timeDeltas: number[]; startTime: number };
const nodes = new Map(p.nodes.map((n) => [n.id, n]));
const parent = new Map<number, number>();
for (const n of p.nodes) for (const c of n.children ?? []) parent.set(c, n.id);
const times: number[] = [];
p.timeDeltas.reduce((t, d, i) => ((times[i] = t + d), t + d), p.startTime);
const idle = (i: number) => nodes.get(p.samples[i]!)!.callFrame.functionName === '(idle)';
// Busy stretches: runs of samples not idle, allowing 1 ms of idle samples within one.
const stretches: [number, number][] = [];
for (let i = 0, start = -1, lastBusy = -1; i <= p.samples.length; i++) {
  if (i < p.samples.length && !idle(i)) {
    if (start < 0 || times[i]! - times[lastBusy]! > 1000) {
      if (start >= 0) stretches.push([start, lastBusy]);
      start = i;
    }
    lastBusy = i;
  } else if (i === p.samples.length && start >= 0) stretches.push([start, lastBusy]);
}
stretches.sort((a, b) => times[b[1]]! - times[b[0]]! - (times[a[1]]! - times[a[0]]!));
// With the run's record (runs.jsonl), the window of S3's longest frame gap in the z6 join instead: the profile starts at mark madrid.
const runs = process.argv[5] ? fs.readFileSync(process.argv[5], 'utf8').trim().split('\n').map((l) => JSON.parse(l)) : [];
const run = runs.find((r) => r.tree.endsWith(`/${process.argv[6]}`));
if (run) {
  const z7 = run.marks.find((m: { name: string }) => m.name === 'madrid').t;
  const ast = run.files.find((f: { file: string }) => /track-cercanias-asturias/.test(f.file));
  let g = { gap: 0, s: 0 };
  for (let i = 1; i < run.frames.length; i++) if (run.frames[i] > ast.end && run.frames[i - 1] < ast.end + 5000 && run.frames[i] - run.frames[i - 1] > g.gap) g = { gap: run.frames[i] - run.frames[i - 1], s: run.frames[i - 1] };
  const [from, to] = [p.startTime + (g.s - z7) * 1000, p.startTime + (g.s + g.gap - z7) * 1000];
  const inGap = times.flatMap((t, i) => (t >= from && t <= to ? [i] : []));
  const idleUs = inGap.filter(idle).reduce((s, i) => s + (times[i + 1] ?? times[i]!) - times[i]!, 0);
  console.log(`the z6 join's longest frame gap: ${g.gap.toFixed(1)} ms at +${(g.s - z7).toFixed(0)} ms after madrid, ${inGap.length} samples, ${(idleUs / 1000).toFixed(1)} ms of them idle`);
  stretches.unshift([inGap[0]!, inGap[inGap.length - 1]!]);
}
const maps = new Map<string, SourceMapConsumer | null>();
const where = (cf: Node['callFrame']) => {
  const base = cf.url.replace(/^.*\//, '');
  if (!maps.has(base)) {
    const f = path.join(dist, 'assets', `${base}.map`);
    maps.set(base, fs.existsSync(f) ? new SourceMapConsumer(JSON.parse(fs.readFileSync(f, 'utf8'))) : null);
  }
  const o = maps.get(base)?.originalPositionFor({ line: cf.lineNumber + 1, column: cf.columnNumber });
  return o?.source ? `${o.name ?? cf.functionName ?? ''} ${o.source.replace(/^.*node_modules\//, '').replace(/^(\.\.\/)+/, '')}:${o.line}` : `${cf.functionName || '(anon)'} ${base || ''}${base ? `:${cf.lineNumber + 1}` : ''}`;
};
const ms = (us: number) => (us / 1000).toFixed(1);
console.log(`longest busy stretches (ms): ${stretches.slice(0, 5).map(([a, b]) => `${ms(times[b]! - times[a]!)} at +${ms(times[a]! - p.startTime)}`).join(', ')}`);
const [a, b] = stretches[0]!;
const self = new Map<string, number>();
const total = new Map<string, number>();
for (let i = a; i <= b; i++) {
  const dt = (times[i + 1] ?? times[i]!) - times[i]!;
  let id: number | undefined = p.samples[i]!;
  const seen = new Set<string>();
  self.set(where(nodes.get(id)!.callFrame), (self.get(where(nodes.get(id)!.callFrame)) ?? 0) + dt);
  for (; id !== undefined; id = parent.get(id)) {
    const k = where(nodes.get(id)!.callFrame);
    if (!seen.has(k)) (seen.add(k), total.set(k, (total.get(k) ?? 0) + dt));
  }
}
const show = (m: Map<string, number>, title: string) => console.log(`\n${title}\n` + [...m].sort((x, y) => y[1] - x[1]).slice(0, Number(top)).map(([k, v]) => `${ms(v).padStart(7)}  ${k}`).join('\n'));
show(self, `self time in the longest stretch (${ms(times[b]! - times[a]!)} ms):`);
// And self time by source file, which the two trees' builds share though their lines and minified names differ.
const byFile = new Map<string, number>();
for (const [k, v] of self) byFile.set(k.replace(/^.* /, '').replace(/:\d+$/, '').replace(/^wt-[^/]+\//, '') || k, (byFile.get(k.replace(/^.* /, '').replace(/:\d+$/, '').replace(/^wt-[^/]+\//, '') || k) ?? 0) + v);
show(byFile, 'self time by source file:');
show(total, 'total time (the function and what it calls):');
