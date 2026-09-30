// The order of the Lines along each edge of the line graph (ADR-0006, #162), from LOOM's integer
// program (Bast, Brosi and Storandt, ACM TSAS 2019): fewest crossings and separations, with
// crossings only at nodes, and at forks rather than mid-stretch.

import loadHighs from 'highs';

/**
 * What two Lines crossing costs at a node: at a fork, or where a Line ends or another comes, or
 * anywhere else, which is mid-stretch. Where they part at a fork, to edges on the other sides from
 * their order, costs a fork's too: so crossings go where Lines part, rather than at the Station
 * before, which #160's breaks would count as a swap and two steps (#162).
 */
const CROSS = { fork: 2, plain: 6 };
/** What a Line costs where it goes between two that run on together, where it comes or goes. */
const SEPARATE = 1;
/** What an edge's order costs for each pair of Lines it puts the other way round from `prior`: only a tie-break. */
const PRIOR = 0.01;

/** An edge's end at a node: which edge, 0 at its start or 1 at its end, and the way it leaves the node, in radians anticlockwise from east. */
export interface End {
  edge: number;
  end: 0 | 1;
  angle: number;
}

/** A node of the line graph: the edges' ends at it, and each Line's passes through it, from one of those ends to another. */
export interface Node {
  ends: End[];
  passes: { line: number; from: number; to: number }[];
}

/** A linear sum of the solver's variables, and a constant. */
interface Sum {
  of: Map<string, number>;
  constant: number;
}

const highs = loadHighs();

/**
 * Each edge's Lines, from left to right the way it runs, given each edge's Lines in the order to
 * keep where nothing else decides (`prior`), and the nodes. Only edges some node puts a cost on
 * go to the solver.
 */
export async function order(prior: number[][], nodes: Node[]): Promise<number[][]> {
  const objective = new Map<string, number>();
  const rows: string[] = [];
  const touched = new Set<number>();
  const add = (sum: Sum, weight: number) => {
    for (const [name, k] of sum.of) objective.set(name, (objective.get(name) ?? 0) + k * weight);
  };
  /** 1 where Line a goes before Line b along edge e, else 0. */
  const before = (e: number, a: number, b: number): Sum => {
    touched.add(e);
    return a < b ? { of: new Map([[`x${e}_${a}_${b}`, 1]]), constant: 0 } : { of: new Map([[`x${e}_${b}_${a}`, -1]]), constant: 1 };
  };
  /** 1 where Line a is left of Line b looking into the node along an edge. */
  const left = ({ edge, end }: End, a: number, b: number) => (end ? before(edge, a, b) : before(edge, b, a));
  /** A new variable at least as big as each of these sums, and 0. */
  const most = (name: string, ...sums: Sum[]) => {
    for (const { of, constant } of sums) rows.push(`${terms(new Map([[name, 1], ...[...of].map(([v, k]): [string, number] => [v, -k])]))} >= ${constant}`);
    return { of: new Map([[name, 1]]), constant: 0 };
  };
  const plus = (...sums: Sum[]): Sum => {
    const of = new Map<string, number>();
    for (const s of sums) for (const [v, k] of s.of) of.set(v, (of.get(v) ?? 0) + k);
    return { of, constant: sums.reduce((sum, s) => sum + s.constant, 0) };
  };
  const times = (k: number, { of, constant }: Sum): Sum => ({ of: new Map([...of].map(([v, c]) => [v, c * k])), constant: constant * k });
  const one = { of: new Map<string, number>(), constant: 1 };

  for (const [n, node] of nodes.entries()) {
    const ends = node.ends;
    // Only a Line on both edges it passes between: it has a place in each one's order.
    const passes = node.passes.filter((p) => [p.from, p.to].every((i) => prior[ends[i]?.edge ?? -1]?.includes(p.line)));
    const through = new Set(passes.map((p) => p.line));
    const plain = ends.length === 2 && ends.every(({ edge }) => prior[edge]?.every((l) => through.has(l)));
    const cross = CROSS[plain ? 'plain' : 'fork'];
    const pair = (p: { from: number; to: number }) => [Math.min(p.from, p.to), Math.max(p.from, p.to)] as const;
    const done = new Set<string>();
    for (const [i, p] of passes.entries()) {
      for (const q of passes.slice(i + 1)) {
        const [[pa, pb], [qa, qb]] = [pair(p), pair(q)];
        const key = `${Math.min(p.line, q.line)} ${Math.max(p.line, q.line)} ${pa} ${pb} ${qa} ${qb}`;
        if (p.line === q.line || pa === pb || qa === qb || done.has(key)) continue;
        done.add(key);
        const [x, y] = [ends[pa], ends[pb]];
        if (!x || !y) continue;
        if (pa === qa && pb === qb) {
          // Running on together: they cross where one is left of the other looking in from each side.
          if (x.edge === y.edge) continue;
          const [l, r] = [left(x, p.line, q.line), left(y, p.line, q.line)];
          add(most(`c${n}_${rows.length}`, plus(l, r, times(-1, one)), plus(one, times(-1, l), times(-1, r))), cross);
          continue;
        }
        // Parting: coming in along one edge, and going on along two others, or the other way round.
        const shared = [pa, pb].find((e) => e === qa || e === qb);
        if (shared === undefined) continue;
        const [s, f, g] = [ends[shared], ends[pa === shared ? pb : pa], ends[qa === shared ? qb : qa]];
        if (!s || !f || !g || f === g) continue;
        const turn = (e: End) => (((e.angle - s.angle) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
        // Looking in along the shared edge, the Line for the edge further anticlockwise from it goes left.
        const l = left(s, p.line, q.line);
        add(turn(f) > turn(g) ? plus(one, times(-1, l)) : l, CROSS.fork);
      }
    }
    // A Line coming or going between two that run on together separates them.
    const runs = new Map<string, Set<number>>(); // the Lines running on from one end to another
    for (const p of passes) {
      const [a, b] = pair(p);
      if (a !== b) runs.set(`${a} ${b}`, (runs.get(`${a} ${b}`) ?? new Set()).add(p.line));
    }
    for (const [key, lines] of runs) {
      const on = [...lines].sort((a, b) => a - b);
      for (const e of key.split(' ').map(Number)) {
        const edge = ends[e]?.edge ?? -1;
        const others = (prior[edge] ?? []).filter((c) => !lines.has(c));
        if (!others.length) continue;
        // Once for each pair, however many Lines come between them, as LOOM counts it.
        for (const [i, a] of on.entries()) {
          for (const b of on.slice(i + 1)) {
            const between = others.flatMap((c) => [plus(before(edge, a, c), before(edge, c, b), times(-1, one)), plus(before(edge, b, c), before(edge, c, a), times(-1, one))]);
            add(most(`s${n}_${rows.length}`, ...between), SEPARATE);
          }
        }
      }
    }
  }

  const binaries: string[] = [];
  for (const e of [...touched].sort((a, b) => a - b)) {
    const lines = [...(prior[e] ?? [])].sort((a, b) => a - b);
    const rank = new Map(prior[e]?.map((l, i) => [l, i]));
    for (const [i, a] of lines.entries()) {
      for (const [j, b] of lines.slice(i + 1).entries()) {
        binaries.push(`x${e}_${a}_${b}`);
        add(before(e, a, b), (rank.get(a) ?? 0) < (rank.get(b) ?? 0) ? -PRIOR : PRIOR);
        // In order: one before another before a third puts the first before the third.
        for (const c of lines.slice(i + j + 2)) {
          const sum = plus(before(e, a, b), before(e, b, c), times(-1, before(e, a, c)));
          rows.push(`${terms(sum.of)} >= ${-sum.constant}`, `${terms(sum.of)} <= ${1 - sum.constant}`);
        }
      }
    }
  }

  const orders = prior.map((lines) => [...lines]);
  if (!binaries.length) return orders;
  const model = ['Minimize', ` cost: ${terms(objective)}`, 'Subject To', ...rows.map((r, i) => ` r${i}: ${r}`), 'Binaries', ...binaries.map((b) => ` ${b}`), 'End'].join('\n');
  const solution = (await highs).solve(model, { output_flag: false });
  if (solution.Status !== 'Optimal') throw new Error(`Couldn't order the Lines on the line graph: ${solution.Status}`);
  const value = (name: string) => Math.round(solution.Columns[name]?.Primal ?? 0);
  for (const e of touched) {
    const lines = prior[e] ?? [];
    const ahead = (a: number) => lines.filter((b) => b !== a && (a < b ? 1 - value(`x${e}_${a}_${b}`) : value(`x${e}_${b}_${a}`))).length;
    orders[e] = lines.toSorted((a, b) => ahead(a) - ahead(b));
  }
  return orders;
}

/** A sum of variables in the solver's LP format, a term to a line. */
function terms(of: Map<string, number>): string {
  const list = [...of].filter(([, k]) => k !== 0);
  return list.length ? list.map(([v, k]) => `${k < 0 ? '-' : '+'} ${Math.abs(k)} ${v}`).join('\n ') : '0 x_none';
}
