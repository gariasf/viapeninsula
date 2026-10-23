// #213 ship: the call paths (leaf up, source-mapped) of the samples in a profile's window that pass through a function, with their ms.
//   node stacks.mts <profile> <dist> <runs.jsonl> <tree> <function name regexp>
import fs from 'node:fs';
import path from 'node:path';
import { SourceMapConsumer } from '/Users/guillem.arias/Documents/gariasf/viapeninsula/node_modules/source-map-js/source-map.js';
const [file, dist, runsFile, tree, re] = process.argv.slice(2) as string[];
const p = JSON.parse(fs.readFileSync(file!, 'utf8'));
const nodes = new Map(p.nodes.map((n: any) => [n.id, n]));
const parent = new Map<number, number>();
for (const n of p.nodes) for (const c of n.children ?? []) parent.set(c, n.id);
const times: number[] = [];
p.timeDeltas.reduce((t: number, d: number, i: number) => ((times[i] = t + d), t + d), p.startTime);
const run = fs.readFileSync(runsFile!, 'utf8').trim().split('\n').map((l) => JSON.parse(l)).find((r) => r.tree.endsWith(`/${tree}`));
const t0 = run.marks.find((m: any) => m.name === 'madrid').t;
const ast = run.files.find((f: any) => /track-cercanias-asturias/.test(f.file));
let g = { gap: 0, s: 0 };
for (let i = 1; i < run.frames.length; i++) if (run.frames[i] > ast.end && run.frames[i - 1] < ast.end + 5000 && run.frames[i] - run.frames[i - 1] > g.gap) g = { gap: run.frames[i] - run.frames[i - 1], s: run.frames[i - 1] };
const [from, to] = [p.startTime + (g.s - t0) * 1000, p.startTime + (g.s + g.gap - t0) * 1000];
const maps = new Map<string, any>();
const where = (cf: any) => {
  const base = cf.url.replace(/^.*\//, '');
  if (!maps.has(base)) { const f = path.join(dist!, 'assets', `${base}.map`); maps.set(base, fs.existsSync(f) ? new SourceMapConsumer(JSON.parse(fs.readFileSync(f, 'utf8'))) : null); }
  const o = maps.get(base)?.originalPositionFor({ line: cf.lineNumber + 1, column: cf.columnNumber });
  return o?.source ? `${o.name ?? cf.functionName} ${o.source.replace(/^.*node_modules\//, '').replace(/^(\.\.\/)+/, '').replace(/^wt-[^/]+\//, '')}:${o.line}` : `${cf.functionName || '(anon)'}`;
};
const paths = new Map<string, number>();
for (let i = 0; i < p.samples.length; i++) {
  if (times[i]! < from || times[i]! > to) continue;
  const chain: string[] = [];
  for (let id: number | undefined = p.samples[i]; id !== undefined; id = parent.get(id)) chain.push(where((nodes.get(id) as any).callFrame));
  const k = chain.findIndex((c) => new RegExp(re!).test(c));
  if (k < 0) continue;
  const key = chain.slice(Math.max(0, k - 2), k + 9).join(' < ');
  paths.set(key, (paths.get(key) ?? 0) + ((times[i + 1] ?? times[i]!) - times[i]!));
}
for (const [k, v] of [...paths].sort((a, b) => b[1] - a[1]).slice(0, 8)) console.log(`${(v / 1000).toFixed(1).padStart(6)} ${k}`);
