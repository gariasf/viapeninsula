# #213 look-measure: do the shots of a spot show the same Trains? Per spot, device and scheme, the Trains drawn in view in
# each variant against A's, how late each shot was, and the live files the mirror lacked.
#   python3 -I same.py <shots.jsonl>
import json, sys

rows = [json.loads(l) for l in open(sys.argv[1])]
by = {(r['spot'], r['variant'], r['device'], r['scheme']): r for r in rows}
print('| Spot | Device | Scheme | Variant | Trains in view | Not in A\'s | Of A\'s, not in view | Late, ms | Decks drawn | Mouths drawn | Errors |')
print('|---|---|---|---|---|---|---|---|---|---|---|')
for (spot, v, device, scheme), r in sorted(by.items(), key=lambda kv: (kv[0][0], kv[0][2], kv[0][3])):
    a = set(by[(spot, 'A', device, scheme)]['trains']) if (spot, 'A', device, scheme) in by else set()
    t = set(r['trains'])
    print(f"| {spot} | {device} | {scheme} | {v} | {len(t)} | {len(t - a)} | {len(a - t)} | {r['late']} | {r.get('decks', '–') if r.get('decks') is not None else '–'} | {len(r['mouths']) if r.get('mouths') is not None else '–'} | {'; '.join(r['errors']) or '–'} |")
missing = sorted({m for r in rows for m in r['missing']})
print(f"\nLive files asked for that the mirror lacks: {', '.join(missing) or 'none'}")
print(f"Latest shot: {max(r['late'] for r in rows)} ms after its second; {len(rows)} shots")
