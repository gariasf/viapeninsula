// The Lines' and rails' worker (#837): what main.ts asks of it, done by lineWork(), and the answer sent back, a tile's
// bytes moved rather than copied. On a desktop, the decks' module (decks.ts), which a phone never loads, is loaded as
// the worker starts, where main.ts names it so, or else the first time a region comes with its decks file; a join waits
// for it, as every ask after it does, in turn, so that none is answered before one asked before it (ADR-0016). One that
// fails to load leaves the Lines on the ground, as a phone's, not the map without them.
import { lineWork, type LinesAsk } from './lineTiles.ts';

let decks: typeof import('./decks.ts') | undefined;
const load = () => import('./decks.ts').then((module) => (decks = module), console.warn);
let loading: Promise<unknown> | undefined = self.name === 'lines-decks' ? load() : undefined;
const work = lineWork(() => decks);
self.onmessage = async ({ data }: MessageEvent<LinesAsk>) => {
  if (loading || ('show' in data && data.show.regions.some((r) => r.how.decks))) await (loading ??= load());
  const answer = work(data);
  self.postMessage(answer, { transfer: 'data' in answer ? [answer.data] : [] });
};
