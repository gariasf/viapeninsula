// The shared main baseline (#730): one dry run of origin/main's build for each build tree and Madrid
// day, which every session and worktree compares its own dry runs against, rather than each
// rebuilding main. `npm run -s baseline` fetches origin/main and prints the folder of that dry run's
// out/, in the main checkout's .cache/baselines/: at once where it's there; once it's built where
// another run is building it; or else it builds it, in a worktree of its own, on the day's feed cache
// (daily.ts), with its log beside it. Its key is the trees of what the build reads, src/build,
// bundle.ts, networks.ts and pieces.ts, so that a commit to main that touches none of them keeps it,
// and the day, as the feeds change from day to day. One day's feeds build the same files (#240).
// The baselines of other days are deleted as a new one is built.

import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { closeSync, existsSync, mkdirSync, mkdtempSync, openSync, readdirSync, readFileSync, renameSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { setTimeout as wait } from 'node:timers/promises';
import { madridDate } from '../bundle.ts';

const git = (...args: string[]) => execFileSync('git', args, { encoding: 'utf8' }).trim();

git('fetch', '-q', 'origin', 'main');
const [commit, ...trees] = git('rev-parse', 'origin/main', ...['src/build', 'src/bundle.ts', 'src/networks.ts', 'src/pieces.ts'].map((path) => `origin/main:${path}`)).split('\n');
const day = madridDate(new Date());
const key = `${day}-${createHash('sha256').update(trees.join()).digest('hex').slice(0, 12)}`;
// The main checkout's, which every worktree shares.
const root = dirname(git('rev-parse', '--path-format=absolute', '--git-common-dir'));
const baselines = join(root, '.cache', 'baselines');
const dir = join(baselines, key);
const lock = join(baselines, `${key}.lock`);
const out = join(dir, 'out');

mkdirSync(baselines, { recursive: true });
let told = false;
while (!existsSync(out)) {
  try {
    mkdirSync(lock);
  } catch {
    // Another run builds it: wait for it, unless that run has died.
    if (building()) {
      if (!told) console.warn(`Waiting for the run building ${key}, whose log is ${dir}.log`);
      told = true;
      await wait(10_000);
    } else rmSync(lock, { recursive: true, force: true });
    continue;
  }
  try {
    writeFileSync(join(lock, 'pid'), `${process.pid}`);
    build();
  } finally {
    rmSync(lock, { recursive: true, force: true });
  }
}
console.log(out);

/**
 * Whether the run that holds the lock is alive: one that has only just taken it has yet to write its
 * pid, but one whose lock has had none for a minute died before it could.
 * ponytail: a pid the system has given another process since keeps a dead run's lock alive; delete
 * the lock by hand if a baseline waits on a run that isn't there.
 */
function building(): boolean {
  try {
    process.kill(Number(readFileSync(join(lock, 'pid'), 'utf8')), 0);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') return false;
    try {
      return Date.now() - statSync(lock).mtimeMs < 60_000;
    } catch {
      return false;
    }
  }
}

/** Builds the baseline: a dry run of origin/main in a worktree of its own, whose out/ is written into the baseline's folder. */
function build() {
  for (const old of readdirSync(baselines)) if (!old.startsWith(day)) rmSync(join(baselines, old), { recursive: true, force: true });
  console.warn(`Building main's baseline ${key} at ${commit!.slice(0, 8)}, logging to ${dir}.log`);
  const tree = mkdtempSync(join(tmpdir(), 'baseline-'));
  const partial = join(dir, 'partial');
  try {
    rmSync(dir, { recursive: true, force: true });
    mkdirSync(partial, { recursive: true });
    git('worktree', 'add', '-q', '--detach', tree, commit!);
    for (const name of ['node_modules', '.cache']) symlinkSync(join(root, name), join(tree, name));
    // out/ is the baseline's own folder, and the timetables' zips go in the worktree, not the system's
    // temporary folder, where another dry run at the same time writes its own (zipFile()).
    symlinkSync(partial, join(tree, 'out'));
    mkdirSync(join(tree, 'tmp'));
    const log = openSync(`${dir}.log`, 'w');
    const run = spawnSync(process.execPath, [`--env-file-if-exists=${join(root, '.env.local')}`, 'src/build/daily.ts', '--dry-run'], { cwd: tree, env: { ...process.env, TMPDIR: join(tree, 'tmp') }, stdio: ['ignore', log, log] });
    closeSync(log);
    if (run.status !== 0) throw new Error(`main's dry run failed: see ${dir}.log`);
    renameSync(partial, out);
  } finally {
    // The links go first, so that removing the worktree never follows them into what they link.
    for (const name of ['node_modules', '.cache', 'out']) rmSync(join(tree, name), { force: true });
    if (existsSync(join(tree, '.git'))) git('worktree', 'remove', '--force', tree);
    rmSync(tree, { recursive: true, force: true });
    rmSync(partial, { recursive: true, force: true });
  }
}
