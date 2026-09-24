// What the daily build publishes and the web app reads.

/** The R2 bucket, behind the CDN, that serves the daily bundles and (later) the live snapshot. */
export const LIVE_URL = 'https://viapeninsula-live.gariasf.com';

/** Names the bundle for each service day. Cached briefly; the bundles it names never change. */
export interface Manifest {
  days: { date: string; bundle: string }[];
}

/** Everything the map needs for one service day. */
export interface Bundle {
  serviceDay: string;
  networks: Network[];
  lines: Line[];
  stations: Station[];
  shapes: Shape[];
}

export interface Network {
  id: string;
  name: string;
}

export interface Line {
  id: string;
  network: string;
  name: string;
  colour: string;
  shapes: string[];
}

/** Identified by whoever runs it: `adif:<code>` for Renfe's Stations. */
export interface Station {
  id: string;
  name: string;
  lon: number;
  lat: number;
}

/** A stretch of track: its points in order, and the distance along it at each point, in metres. */
export interface Shape {
  id: string;
  coords: [lon: number, lat: number][];
  dist: number[];
}

/** The date in Spain, as YYYY-MM-DD. */
export function madridDate(at: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid' }).format(at);
}
