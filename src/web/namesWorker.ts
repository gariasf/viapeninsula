// The places' names' worker (#777): what main.ts asks of it, done by nameWork(), and where each name goes sent back.
import { nameWork, type NamesAsk } from './placeNames.ts';

/** The worker's names, and the regions' tracks it holds (nameWork()). */
const work = nameWork();
self.onmessage = ({ data }: MessageEvent<NamesAsk>) => {
  const laid = work(data);
  if (laid) self.postMessage(laid);
};
