// The Lines' and rails' worker (#837): what main.ts asks of it, done by lineWork(), and the answer sent back, a tile's
// bytes moved rather than copied.
import { lineWork, type LinesAsk } from './lineTiles.ts';

const work = lineWork();
self.onmessage = ({ data }: MessageEvent<LinesAsk>) => {
  const answer = work(data);
  self.postMessage(answer, { transfer: 'data' in answer ? [answer.data] : [] });
};
