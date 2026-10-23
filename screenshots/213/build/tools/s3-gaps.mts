// #213 ship: where S3's longest join gap falls in each run, by tree: the join's file, the gap, and the mark before it.
//   node s3-gaps.mts <perf-desktop.jsonl>
import fs from 'node:fs';
import path from 'node:path';
const runs = fs.readFileSync(process.argv[2]!, 'utf8').trim().split('\n').map((l) => JSON.parse(l)).filter((r) => r.scenario === 'S3');
for (const r of runs) {
  const tree = path.basename(r.tree) === 'wt-main' ? 'main' : 'branch';
  const [a, b] = [r.marks.find((m: { name: string }) => m.name === 'zoomStart'), r.marks.find((m: { name: string }) => m.name === 'end')];
  const files = r.files.filter((f: { file: string; end: number }) => /track/.test(f.file) && f.end >= (a?.t ?? 0) && f.end <= (b?.t ?? Infinity));
  let worst = { gap: 0, at: 0, file: '' };
  for (const f of files) for (let i = 1; i < r.frames.length; i++) {
    const [s, e] = [r.frames[i - 1], r.frames[i]];
    if (e > f.end && s < f.end + 5000 && e - s > worst.gap) worst = { gap: e - s, at: s, file: f.file };
  }
  const before = [...r.marks].reverse().find((m: { t: number }) => m.t <= worst.at);
  const decks = r.files.filter((f: { file: string }) => /decks/.test(f.file)).length;
  console.log(`${tree} #${r.run}: ${worst.gap.toFixed(1)} ms at +${((worst.at - (before?.t ?? 0)) / 1000).toFixed(2)} s after mark ${before?.name}, in the join of ${worst.file.replace(/^.*\//, '')} (${((worst.at - files.find((f: { file: string }) => f.file === worst.file).end) / 1000).toFixed(2)} s after it came); ${files.length} track files in the window, ${decks} decks files`);
}
