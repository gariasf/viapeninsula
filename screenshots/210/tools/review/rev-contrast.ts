// #210 review: the marks' contrast (`sign`, `filled`): each Network's colour as the prototype letters and rings it.
import { readFileSync } from 'node:fs';
import { contrast, lettering } from '../wt-210/src/web/colour.ts';
const track = JSON.parse(readFileSync(new URL('./live/days/track-catalonia-7fe9f856832c.json', import.meta.url), 'utf8'));
const others = ['cercanias-madrid', 'cercanias-bilbao', 'cercanias-leon'].map((r) => JSON.parse(readFileSync(new URL(`./live/${readFileSync(new URL('./live/files.txt', import.meta.url), 'utf8').split('\n').find((l) => l.includes(`track-${r}`))}`, import.meta.url), 'utf8')).networks[0]);
for (const n of [...track.networks, ...others]) {
  const white = lettering(n.colour, '#ffffff');
  const onFill = contrast(n.colour, '#111111') > contrast(n.colour, '#ffffff') ? '#111111' : '#ffffff';
  console.log(`${n.id.padEnd(18)} ${n.colour}  white mark: letters ${white} ${contrast(white, '#ffffff').toFixed(2)}:1, ring ${contrast(n.colour, '#ffffff').toFixed(2)}:1 on white  |  filled: letters ${onFill} ${contrast(n.colour, onFill).toFixed(2)}:1`);
}
