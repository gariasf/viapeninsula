// The places' names at each join, in Node (#757, #763): how long main.ts's putNames() and showNames() take as
// today's regions join one by one, the view's region, long distance, Madrid, then the rest in the manifest's order,
// each region's track from the shared main baseline (`npm run -s baseline`, #730).
//   npm run names-bench -- [--against <ref>] [--runs <n>] [--order alt] [--bearing <deg>] [--days <out dir>]
// prints, by join, the median ms over `runs` processes (5) of the names (`sides`, the places' sides, and `layout`,
// laying them out), and of filing the regions' shapes a frame before, where the src does (`filed`, #770). With
// --against, the ref's src too, a process of each alternated, and then whether every place's name is laid out the same
// in both, and the names in the same order, at every join and after Valencia leaves, in both orders and at bearings 0,
// 37 and −120 (`differ`, the places that don't, is 0 where it is).
// --order alt joins Madrid, long distance, the rest backwards, then Catalonia.
// It copies what main.ts does for the names, as main.ts can't be imported (the DOM at its top), and reads main.ts's
// constants (TIERS, BOLD…) from its source; text is measured as main.ts does where it has no canvas, 6 px a letter.
// ponytail: a copy of putNames(), showNames(), clearance() and nameLines(), which a change to them leaves behind. Move
// them out of main.ts into a module both import if the bench and the map ever lay names out apart.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { performance } from 'node:perf_hooks';
import { parseArgs } from 'node:util';

const { values: args } = parseArgs({
  options: { against: { type: 'string' }, runs: { type: 'string', default: '5' }, order: { type: 'string', default: '' }, bearing: { type: 'string', default: '0' }, days: { type: 'string' }, src: { type: 'string' }, once: { type: 'boolean' } },
});
const here = dirname(import.meta.dirname);
const days = args.days ?? execFileSync('node', [join(here, 'build/baseline.ts')], { encoding: 'utf8' }).trim();
const manifest = JSON.parse(readFileSync(join(days, 'manifest.json'), 'utf8')) as { regions: { id: string; days: { date: string; track: string }[] }[] };
const order = manifest.regions.map((r) => r.id);

/** The joins in their order: the view's region, long distance at the second look, then Madrid and the others as a pan brings them. */
function joinsOf(alt: boolean): string[] {
  const first = ['catalonia', 'long-distance', 'cercanias-madrid'];
  const rest = order.filter((id) => !first.includes(id));
  return alt ? ['cercanias-madrid', 'long-distance', ...rest.reverse(), 'catalonia'] : [...first, ...rest];
}

/** What the map does for the names, with the src at `src`: show(parts) lays them out for the regions joined, and says how long it took. */
async function variant(src: string, bearing: number) {
  const B = await import(join(src, 'bundle.ts'));
  const { decodeTrack } = await import(join(src, 'pieces.ts'));
  const N = await import(join(src, 'web/names.ts'));
  const P = await import(join(src, 'web/pill.ts'));
  const C = constants(readFileSync(join(src, 'web/main.ts'), 'utf8'));
  // Each region's track, of the manifest's first day the dry run has it for, as the map has it.
  const tracks = new Map(
    order.map((id) => {
      const day = manifest.regions.find((r) => r.id === id)?.days.find((d) => existsSync(join(days, d.track)));
      return [id, decodeTrack(JSON.parse(readFileSync(join(days, day?.track ?? ''), 'utf8')))];
    }),
  );
  const placeSides = N.sidesByJoin();
  const pixelMetres = (zoom: number) => (2 * Math.PI * B.EARTH) / (512 * 2 ** zoom);
  const width = (text: string) => text.length * 6;
  let pills = new Map<string, { zoom: number; box: [number, number] }>();
  let laidOut: { names: any[]; pills: typeof pills; bearing: number; where: Record<string, unknown>[] } | undefined;
  // main.ts's clearance().
  const clearance = ({ from: [, lat], normal: [x, y], dot: dotBehind, lines: drawn }: any, larger: number, zoom: number): number => {
    const metresPerPx = pixelMetres(zoom) * Math.cos((lat * Math.PI) / 180);
    const dot = B.atZoom(C.DOT, zoom + 1) + larger + B.atZoom(C.RING, zoom + 1);
    const apart = Math.max(B.atZoom(B.APART, zoom), B.atZoom(B.APART, zoom + 1));
    const reaches = drawn.map(({ line, toward, behind, stroke }: any) => {
      const pill = pills.get(line);
      const across = stroke ? B.atZoom(B.WIDTH, zoom + 1) / 2 : pill && zoom >= pill.zoom ? pill.box[0] * Math.abs(x) + pill.box[1] * Math.abs(y) + C.PILL_HALO : dot;
      return toward * apart + across - behind / metresPerPx;
    });
    return Math.max(dot - dotBehind / metresPerPx, ...reaches) + C.NAME_GAP + dotBehind / metresPerPx;
  };
  // main.ts's nameLines().
  const nameLines = (name: string, style: { size: number }): string[] => {
    const words = name.match(/[^ /·-]+[ /·-]*/g) ?? [name];
    const across = (from: number, to: number) => width(words.slice(from, to).join('').replaceAll(' ', ''));
    const even = width(name) / Math.max(1, Math.ceil(width(name) / (C.PLACE_WRAP * style.size)));
    const [ragged, starts] = [[0], [0]];
    for (let end = 1; end <= words.length; end++) {
      ragged[end] = Infinity;
      for (let start = 0; start < end; start++) {
        const off = across(start, end) - even;
        const total = (ragged[start] ?? 0) + (end < words.length ? off ** 2 : off < 0 ? off ** 2 / 2 : 2 * off ** 2);
        if (total <= (ragged[end] ?? Infinity)) [ragged[end], starts[end]] = [total, start];
      }
    }
    const lines: string[] = [];
    for (let end = words.length; end > 0; end = starts[end] ?? 0) lines.unshift(words.slice(starts[end], end).join('').trimEnd());
    return lines;
  };
  const show = (ids: string[]) => {
    const parts = order.filter((id) => ids.includes(id)).map((id) => tracks.get(id));
    const days = B.joinTracks(parts);
    // show()'s, for the names.
    const pillZoom = new Map(days.networks.map((n: any) => [n.id, n.pillZoom]));
    pills = new Map(days.lines.map((l: any) => [l.id, { zoom: pillZoom.get(l.network) ?? 10, box: P.boxOf(P.outlineOf(l.kind), width(l.name), P.PILL_TEXT) }]));
    const keepOf = new Map(days.networks.map((n: any) => [n.id, n.runningSide === 'left' ? -1 : 1]));
    const keep = new Map(days.lines.map((l: any) => [l.id, keepOf.get(l.network) ?? 1]));
    const tiered = B.places(days.stations).map((p: any) => {
      const tier = C.TIERS.find((t: any) => t.places.includes(p.id));
      const { nameZoom, larger, size } = tier ?? C.UNTIERED;
      return { ...p, nameZoom, listed: tier?.places.indexOf(p.id), larger, style: { bold: C.BOLD.has(p.id), size } };
    });
    // The regions split and their shapes filed a frame before putNames(), where the src does so (fileShapes(), #770).
    const filing = performance.now();
    const ahead = N.fileShapes ? N.splitBy(days, parts) : undefined;
    for (const track of N.fileShapes ? (ahead ?? [days]) : []) N.fileShapes(track.shapes);
    // putNames().
    const t0 = performance.now();
    const regions = N.fileShapes ? ahead : N.splitBy(days, parts);
    const centrelines = new Map(days.shapes.flatMap((s: any) => (s.id.startsWith(B.STRETCH) ? [[s.id, s]] : [])));
    const where = tiered.map(({ id, networks, lon, lat }: any) => ({ id, dot: [lon, lat], served: networks }));
    const sides = placeSides(regions ?? [days], (days.slots ?? []).filter((s: any) => s.band === undefined), (line: string) => keep.get(line) ?? 1, days.lines, centrelines, where, !regions);
    const t1 = performance.now();
    const names = tiered.map(({ id, name, nameZoom, listed, stations, larger, style, lon, lat }: any, i: number) => {
      const rows = nameLines(name, style);
      return { id, dot: [lon, lat], sides: sides[i] ?? (() => []), name: rows.join('\n'), size: [Math.max(...rows.map(width)), rows.length * P.LINE_HEIGHT * style.size], nameZoom, listed, stations, larger, style };
    });
    // showNames().
    const t2 = performance.now();
    const was = laidOut;
    const samePill = (w: any, p: any) => !w || (w.zoom === p.zoom && w.box[0] === p.box[0] && w.box[1] === p.box[1]);
    const pillsAsWere = was !== undefined && was.bearing === bearing && [...pills].every(([line, p]) => samePill(was.pills.get(line), p));
    const before = new Map(pillsAsWere ? was.names.map((n, i) => [n.sides, { n, where: was.where[i] }]) : []);
    const laid = names.map(({ dot, sides, size, nameZoom, larger, style }: any) => {
      const had: any = before.get(sides);
      if (had?.where && had.n.size[0] === size[0] && had.n.size[1] === size[1] && had.n.nameZoom === nameZoom && had.n.larger === larger && had.n.style.size === style.size) return had.where;
      const at = sides(bearing);
      const properties = C.NAME_ZOOMS.flatMap((zoom: number) => {
        const metresPerPx = pixelMetres(zoom) * Math.cos((dot[1] * Math.PI) / 180);
        const underAt = (s: any, far: number, gap: number) => [0, 1].reduce((sum, step) => sum + N.underName(s, far, size, metresPerPx / 2 ** step, B.atZoom(B.APART, zoom + step), gap + B.atZoom(B.WIDTH, zoom + step) / 2), 0);
        const under = (s: any, far: number) => (zoom < nameZoom ? 0 : 1000 * underAt(s, far, 0) + underAt(s, far, C.NAME_GAP));
        const { spot, far } = N.nearestSide(at, (s: any) => clearance(s, larger, zoom), under);
        return [[`anchor${zoom}`, spot.anchor], [`offset${zoom}`, N.nameOffset(spot, far, size).map((px: number) => px / style.size)]];
      });
      return Object.fromEntries(properties);
    });
    laidOut = { names, pills, bearing, where: laid };
    const t3 = performance.now();
    return { ms: { names: t3 - t0, sides: t1 - t0, layout: t3 - t2, filed: t0 - filing }, laid: new Map(names.map((n: any, i: number) => [n.id as string, JSON.stringify(laid[i])])), order: names.map((n: any) => n.id as string).join(' ') };
  };
  return show;
}

/** main.ts's constants the names are laid out with, read from its source. */
function constants(main: string) {
  const names = ['PILL_HALO', 'DOT', 'RING', 'PLACE_WRAP', 'NAME_HALO', 'NAME_GAP', 'TIERS', 'UNTIERED', 'BOLD', 'NAME_ZOOM_MAX'];
  const body = names.map((name) => {
    const found = new RegExp(`^const ${name}\\b[^=]*=\\s*([\\s\\S]*?);\\n(?=\\S)`, 'm').exec(main);
    if (!found) throw new Error(`No ${name} in main.ts`);
    return `const ${name} = ${found[1]};`;
  });
  const C = new Function(`${body.join('\n')}\nreturn { ${names.join(', ')} };`)();
  const NAME_ZOOMS: number[] = [];
  for (let zoom = Math.min(...C.TIERS.map((t: { nameZoom: number }) => t.nameZoom)); zoom <= C.NAME_ZOOM_MAX; zoom++) NAME_ZOOMS.push(zoom);
  return { ...C, NAME_ZOOMS };
}

/** A ref's src, in a folder of its own beside node_modules, removed as the bench ends. */
function srcOf(ref: string): string {
  const dir = mkdtempSync(join(tmpdir(), 'names-bench-'));
  process.on('exit', () => rmSync(dir, { recursive: true, force: true }));
  execFileSync('git', ['archive', '--output', join(dir, 'src.tar'), ref, 'src'], { cwd: dirname(here) });
  execFileSync('tar', ['-xf', join(dir, 'src.tar'), '-C', dir]);
  symlinkSync(join(dirname(here), 'node_modules'), join(dir, 'node_modules'));
  return join(dir, 'src');
}

if (args.once) {
  // One run, in a process of its own: a JSON line per join.
  const show = await variant(args.src ?? here, Number(args.bearing));
  const joined: string[] = [];
  for (const id of joinsOf(args.order === 'alt')) {
    joined.push(id);
    console.log(JSON.stringify({ join: id, ...show(joined).ms }));
  }
} else {
  const trees: [string, string][] = [['this', here], ...(args.against ? [[args.against, srcOf(args.against)] as [string, string]] : [])];
  const runs = new Map<string, { join: string; names: number; sides: number; layout: number; filed: number }[]>();
  for (let i = 0; i < Number(args.runs); i++) {
    for (const [tree, src] of trees) {
      const out = execFileSync('node', [import.meta.filename, '--once', '--src', src, '--days', days, '--order', args.order ?? '', '--bearing', args.bearing ?? '0'], { encoding: 'utf8' });
      runs.set(tree, [...(runs.get(tree) ?? []), ...out.trim().split('\n').map((line) => JSON.parse(line))]);
    }
  }
  const median = (xs: number[]) => xs.sort((a, b) => a - b)[Math.floor(xs.length / 2)] ?? NaN;
  console.log(`ms, median of ${args.runs} runs: names (sides, layout; filed a frame before)`);
  for (const id of joinsOf(args.order === 'alt')) {
    const cols = trees.map(([tree]) => {
      const of = (runs.get(tree) ?? []).filter((r) => r.join === id);
      const [names, sides, layout, filed] = (['names', 'sides', 'layout', 'filed'] as const).map((k) => median(of.map((r) => r[k])).toFixed(0));
      return `${tree} ${names?.padStart(4)} (${sides}, ${layout}; ${filed})`;
    });
    console.log(`${id.padEnd(26)} ${cols.join('   ')}`);
  }
  if (args.against) {
    // Every place's name laid out the same, and the names in the same order, at every join, both orders, three bearings.
    const src = trees[1]?.[1] ?? '';
    let differ = 0;
    for (const alt of [false, true]) {
      for (const bearing of [0, 37, -120]) {
        const [a, b] = [await variant(src, bearing), await variant(here, bearing)];
        const joins = joinsOf(alt);
        const steps = [...joins.map((_, i) => joins.slice(0, i + 1)), joins.filter((id) => id !== 'cercanias-valencia')];
        const rows = steps.map((ids) => {
          const [x, y] = [a(ids), b(ids)];
          return [...x.laid].filter(([id, w]) => y.laid.get(id) !== w).length + (x.laid.size !== y.laid.size || x.order !== y.order ? 1 : 0);
        });
        differ += rows.reduce((s, n) => s + n, 0);
        console.log(`identity, ${alt ? 'alt' : 'as shown'} order, bearing ${bearing}: places that differ at each of ${steps.length} steps: ${rows.join(' ')}`);
      }
    }
    if (differ) process.exitCode = 1;
  }
}
