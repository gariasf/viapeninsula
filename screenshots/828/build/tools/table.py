# #828 measure: the shots' counts as a markdown table, main → branch, light (dark is the same moment, within a frame: its
# differences are listed under the table), with the checks of the boxes and how late each shot was.
#   python3 -I table.py <counts.jsonl>
import json, sys

rows = [json.loads(l) for l in open(sys.argv[1])]
by = {(r['tree'], r['view'], r['device'], r['scheme']): r for r in rows}
VIEWS = {'bcn-z12': 'Barcelona z12', 'bcn-z13-pg': 'Pg de Gràcia / Pl. Catalunya z13', 'bcn-z13-sants': 'Sants z13', 'mad-z12-sol': 'Madrid z12, Sol'}
DEVICE = {'laptop': '1280×800', 'phone': '390×844'}
print('| View | Device | Pills drawn | Blank (Live) | Trains folded | Counted pills (largest) | Station names a pill overlaps | Drawn pills\' names a "+n" lies on |')
print('|---|---|---|---|---|---|---|---|')
for view, title in VIEWS.items():
    for device in ['laptop', 'phone']:
        a, b = by.get(('main', view, device, 'light')), by.get(('branch', view, device, 'light'))
        if not a or not b:
            continue
        counted = f"{len(b['counted'])} (+{max(b['counted'] or [0])})"
        print(f"| {title if device == 'laptop' else ''} | {DEVICE[device]} | {a['pills']} → {b['pills']} | {a['blank']} ({a['blankLive']}) → **{b['blank']}** ({b['blankLive']}) | 0 → {b['folded']} | 0 → {counted} | {a['namesOverlapped']} of {a['names']} → {b['namesOverlapped']} of {b['names']} | – → **{b['namesUnderCount']}** |")
print()
for r in rows:
    if not r['blankAsPage'] or not r['foldsAsRule']:
        print(f"CHECK FAILED {r['tree']} {r['view']} {r['device']} {r['scheme']}: blankAsPage {r['blankAsPage']} foldsAsRule {r['foldsAsRule']}")
diff = []
for (tree, view, device, scheme), r in by.items():
    if scheme != 'dark':
        continue
    l = by.get((tree, view, device, 'light'))
    keys = ['pills', 'blank', 'folded', 'namesOverlapped', 'names', 'namesUnderCount']
    d = {k: (l[k], r[k]) for k in keys if l and l[k] != r[k]}
    if l and (d or l['counted'] != r['counted']):
        diff.append(f"{tree} {view} {device}: light → dark {d}{' counts ' + str(l['counted']) + ' → ' + str(r['counted']) if l['counted'] != r['counted'] else ''}")
print('Dark against light:', '; '.join(diff) or 'the same counts')
print('Late (ms past the page-clock second):', ', '.join(f"{r['tree'][0]}/{r['view']}/{r['device'][0]}/{r['scheme'][0]} {r['late']}" for r in rows))
