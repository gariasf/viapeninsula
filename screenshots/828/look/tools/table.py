# #828 look: the counts as markdown tables, light scheme (dark is the same moment, within a frame).
#   python3 -I table.py <counts.jsonl> [variants, e.g. A,B,C,D]
import json, sys

rows = [json.loads(l) for l in open(sys.argv[1])]
variants = (sys.argv[2] if len(sys.argv) > 2 else 'A,B,C,D,AN,DN').split(',')
VIEWS = ['bcn-z12', 'bcn-z13-pg', 'bcn-z13-sants', 'mad-z12-sol']
NAMES = {'bcn-z12': 'Barcelona z12', 'bcn-z13-pg': 'Pg de Gràcia / Pl. Catalunya z13', 'bcn-z13-sants': 'Sants z13', 'mad-z12-sol': 'Madrid z12, Sol'}
by = {(r['variant'], r['view'], r['device'], r['scheme']): r for r in rows}
for v in variants:
    have = [k for k in by if k[0] == v]
    if not have:
        continue
    print(f'\n**{v}**\n')
    print('| View | Device | Pills drawn | Blank (Live) | Piles | Largest | In piles | Names a pill overlaps | Hidden | Dots | Counted (+n) | Late ms |')
    print('|---|---|---|---|---|---|---|---|---|---|---|---|')
    for view in VIEWS:
        for device in ['laptop', 'phone']:
            r = by.get((v, view, device, 'light'))
            if not r:
                continue
            counted = ' '.join(f'+{n}' for n in sorted(r['counted'], reverse=True)) or '–'
            print(f"| {NAMES[view]} | {device} | {r['pills']} | {r['blank']} ({r['blankLive']}) | {r['piles']} | {r['largest']} | {r['inPiles']} | {r['namesOverlapped']} of {r['names']} | {r['hidden']} | {r['dots']} | {counted} | {r['late']} |")
