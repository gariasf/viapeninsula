// The places' names' worker (#777): what main.ts asks of it, done by nameWork(), and where each name goes sent back.
import { nameWork, type NamesAsk } from './placeNames.ts';

/** The worker's names, and the regions' tracks it holds (nameWork()). */
const work = nameWork();
/** Whether an ask has failed, after which the layouts asked for would be of names it didn't put: the page lays them out instead (main.ts). */
let failed = false;
self.onmessage = ({ data }: MessageEvent<NamesAsk>) => {
  if (failed) return;
  try {
    const laid = work(data);
    if (laid) self.postMessage(laid);
  } catch (error) {
    failed = true;
    throw error;
  }
};
