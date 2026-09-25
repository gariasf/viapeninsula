// A yardstick for how often Live Trains jump, the same for every ticket that measures it (#31).

import type { Bundle } from './bundle.ts';
import { trainsAt, type Received } from './engine.ts';

/** A Network's jumps over a replay: forward and back along its Trains' Trips, and how many seconds of Live Train it drew. */
export interface Jumps {
  forward: number;
  back: number;
  live: number;
}

/**
 * How often each Network's Live Trains jump over a replay of snapshots, as received: sampled every
 * second from the first snapshot's arrival to the last, a jump is a move in 1 s longer than line
 * speed allows, plus 5%, for a Train Live in both seconds. Jumps per Train-minute are `(forward + back) / (live / 60)`.
 */
export function jumps(bundle: Bundle, received: Received[]): Record<string, Jumps> {
  const networks = new Map(bundle.lines.map((l) => [l.id, bundle.networks.find((n) => n.id === l.network)]));
  const found: Record<string, Jumps> = {};
  let was = new Map<string, number>();
  const [start = 0, end = 0] = [received[0]?.at, received.at(-1)?.at];
  for (let at = start; at <= end; at += 1000) {
    const now = new Map<string, number>();
    for (const { trip, dist, live } of trainsAt(bundle, at, received.filter((r) => r.at <= at))) {
      const network = networks.get(trip.line);
      if (!live || !network) continue;
      now.set(trip.id, dist);
      const counted = (found[network.id] ??= { forward: 0, back: 0, live: 0 });
      counted.live++;
      const before = was.get(trip.id);
      if (before === undefined || Math.abs(dist - before) <= network.profile.topSpeed * 1.05) continue;
      // ponytail: which way a Trip runs overall, so a jump on a Trip that turns back, as the R11's
      // do at Cerbère, can count the wrong way; go by the stretch it's on if that ever matters.
      const [first = 0, last = 0] = [trip.calls[0]?.dist, trip.calls.at(-1)?.dist];
      if ((dist - before) * (last - first) > 0) counted.forward++;
      else counted.back++;
    }
    was = now;
  }
  return found;
}
