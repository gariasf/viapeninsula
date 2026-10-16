// The perf gate's table from runs.jsonl: node table.ts <tree> <runs.jsonl> [since ISO]
import fs from 'node:fs';
const [tree, file] = [process.argv[2]!, process.argv[3]!];
const { metrics, median } = await import(`${tree}/src/page/perf.ts`);
const runs = fs.readFileSync(file, 'utf8').trim().split('\n').map((l) => JSON.parse(l)).slice(-Number(process.argv[4] ?? 18));
const keys = ['restMainMsPerS', 'restFps', 'restExtraRedrawsPerS', 'followMainMsPerS', 'followFps'];
const trees = [...new Set(runs.map((r) => r.tree))];
console.log(`| scenario | metric | ${trees.map((t) => t.split('/').at(-1)).join(' | ')} | change |\n|---|---|---|---|---|`);
for (const sc of [...new Set(runs.map((r) => r.scenario))]) {
  for (const k of keys) {
    const med = trees.map((t) => {
      const v = runs.filter((r) => r.scenario === sc && r.tree === t).map((r) => metrics(r)[k]).filter((v) => v !== undefined);
      return v.length ? { m: median(v), all: v } : undefined;
    });
    if (!med[0]) continue;
    const ch = med[0] && med[1] ? `${(((med[1].m - med[0].m) / (med[0].m || 1)) * 100).toFixed(0)}%` : '';
    console.log(`| ${sc} | ${k} | ${med.map((x) => (x ? `${x.m} (${x.all.join(', ')})` : '')).join(' | ')} | ${ch} |`);
  }
}
