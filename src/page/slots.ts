// The Mac's three browser slots, which every session's page checks share (#729): a slot is a file
// `slot.<n>` in the repo's git dir, which every worktree shares, created with O_EXCL and holding its
// holder's pid. A browser that no slot holder launched (another project's, or a script that doesn't
// go through here) takes a slot too, as the `ps` of the Mac shows it.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

export const SLOTS = 3;
/** A batch's longest run in its slots: past it, the process exits, and Playwright closes its browser. */
const CAP = 10 * 60_000;
/** How long a session waits for its slots before giving its check up as not run (checks-and-resources.md). */
const GIVE_UP = 15 * 60_000;

/**
 * The browsers running on the Mac that no slot holder launched: the main process of each browser run
 * from Playwright's cache (its Chromium, whose every process runs from `Google Chrome for Testing.app`,
 * or its headless shell), by the executable's path, not its helpers (`--type=`) nor its crash handlers,
 * which run on after it (ppid 1, no `--type`). The user's own Chrome runs from `/Applications/Google
 * Chrome.app`, so it's left out, even where a Playwright MCP drives it.
 * @param ps the output of `ps -eo pid,ppid,command`
 */
export function foreignBrowsers(ps: string, holders: Set<number>): number {
  return ps.split('\n').filter((line) => {
    const [, ppid, command] = /^\s*\d+\s+(\d+)\s+(.*)$/.exec(line) ?? [];
    const executable = command?.split(' --')[0];
    return executable && /\/ms-playwright\/[\w-]+\//.test(executable) && !executable.endsWith('/chrome_crashpad_handler') && !command!.includes(' --type=') && !holders.has(Number(ppid));
  }).length;
}

const dir = () => path.join(execFileSync('git', ['rev-parse', '--path-format=absolute', '--git-common-dir'], { encoding: 'utf8' }).trim(), 'page-slots');
const alive = (pid: number) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return (e as NodeJS.ErrnoException).code === 'EPERM';
  }
};

/** The slots' holders, by slot file, once the stale ones are gone: a dead holder's, or one held past the cap. */
function holders(slots: string): Map<string, number> {
  const held = new Map<string, number>();
  for (const name of fs.readdirSync(slots)) {
    const file = path.join(slots, name);
    try {
      const pid = Number(fs.readFileSync(file, 'utf8'));
      const age = Date.now() - fs.statSync(file).mtimeMs;
      // A file is empty for the moment between its creation and its write.
      if ((pid && !alive(pid)) || (!pid && age > 10_000) || age > CAP + 60_000) fs.rmSync(file, { force: true });
      else held.set(name, pid);
    } catch {}
  }
  return held;
}

/**
 * Runs a batch once `n` of the slots are free (a perf run takes all three), polling every second,
 * and frees them after. A batch still running at 10 minutes exits the process, with status 1; after
 * 15 minutes' wait, the process exits with status 2, the check not run.
 * ponytail: no queue, so a run that wants all three can wait behind a stream of single slots; add a
 * ticket file per waiter if that starves one.
 */
export async function withSlots<T>(n: number, batch: () => Promise<T>): Promise<T> {
  const slots = dir();
  fs.mkdirSync(slots, { recursive: true });
  const mine: string[] = [];
  const free = () => {
    for (const f of mine.splice(0)) fs.rmSync(path.join(slots, f), { force: true });
  };
  process.on('exit', free);
  const start = Date.now();
  for (;;) {
    const held = holders(slots);
    const foreign = foreignBrowsers(execFileSync('ps', ['-eo', 'pid,ppid,command'], { encoding: 'utf8' }), new Set(held.values()));
    if (SLOTS - held.size - foreign >= n) {
      for (let i = 1; i <= SLOTS && mine.length < n; i++) {
        try {
          fs.writeFileSync(path.join(slots, `slot.${i}`), String(process.pid), { flag: 'wx' });
          mine.push(`slot.${i}`);
        } catch {}
      }
      if (mine.length === n) break;
      free();
    }
    if (Date.now() - start > GIVE_UP) {
      console.error(`No ${n} browser slot${n > 1 ? 's' : ''} free in 15 min (held ${held.size}, other browsers ${foreign}): the check is not run.`);
      process.exit(2);
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  console.log(`${new Date().toTimeString().slice(0, 8)} ${n} browser slot${n > 1 ? 's' : ''} taken after ${Math.round((Date.now() - start) / 1000)} s`);
  const cap = setTimeout(() => {
    console.error('The batch ran past 10 min in its slots: stopped.');
    process.exit(1);
  }, CAP);
  try {
    return await batch();
  } finally {
    clearTimeout(cap);
    free();
  }
}
