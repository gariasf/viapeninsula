# #828 re-measure: the shots' counts as a markdown table, main (the first measure's) → the branch at 9debb736, light, with
# each count's corner, the counts a Station's name meets, the checks against piles() and the layers' order, dark against
# light, and how late each shot was.
#   python3 -I table2.py <measure counts.jsonl> <measure2 counts.jsonl>
import json, sys

rows = lambda f: [json.loads(l) for l in open(f) if l.strip()]
main = {(r['view'], r['device'], r['scheme']): r for r in rows(sys.argv[1]) if r['tree'] == 'main'}
mine = rows(sys.argv[2])
branch = {(r['view'], r['device'], r['scheme']): r for r in mine}
VIEWS = {'bcn-z12': 'Barcelona z12', 'bcn-z13-pg': 'Pg de Gràcia / Pl. Catalunya z13', 'bcn-z13-sants': 'Sants z13', 'mad-z12-sol': 'Madrid z12, Sol'}
DEVICE = {'laptop': '1280×800', 'phone': '390×844'}
print('| View | Device | Pills drawn | Blank (Live) | Trains folded | Counted pills (largest) | Counts TR · TL · BR · BL | Station names a pill overlaps | Drawn names a "+n" lies on | Counts a Station\'s name meets |')
print('|---|---|---|---|---|---|---|---|---|---|')
for view, title in VIEWS.items():
    for device in ['laptop', 'phone']:
        a, b = main.get((view, device, 'light')), branch.get((view, device, 'light'))
        if not a or not b:
            continue
        c = b['corners']
        print(f"| {title if device == 'laptop' else ''} | {DEVICE[device]} | {a['pills']} → {b['pills']} | {a['blank']} ({a['blankLive']}) → **{b['blank']}** | 0 → {b['folded']} | 0 → {len(b['counted'])} (+{max(b['counted'] or [0])}) | {c['TR']} · {c['TL']} · {c['BR']} · {c['BL']} | {a['namesOverlapped']} of {a['names']} → {b['namesOverlapped']} of {b['names']} | **{b['namesUnderCount']}** | {b['countsOnAName']} of {len(b['counted'])} |")
print()
for r in mine:
    if not (r['foldsAsRule'] and r['cornersAsRule'] and r['orderAsPicked']):
        print(f"CHECK FAILED {r['view']} {r['device']} {r['scheme']}: folds {r['foldsAsRule']} corners {r['cornersAsRule']} order {r['order']}")
print(f"Checks: {sum(r['foldsAsRule'] for r in mine)} of {len(mine)} folds as piles(), {sum(r['cornersAsRule'] for r in mine)} corners as piles(), {sum(r['orderAsPicked'] for r in mine)} orders as picked ({mine[0]['order']})")
tot = {k: sum(r['corners'][k] for r in mine if r['scheme'] == 'light') for k in ['TR', 'TL', 'BR', 'BL']}
on = {k: sum(r['countsOnANameByCorner'][k] for r in mine if r['scheme'] == 'light') for k in tot}
print(f"Light, all views and devices: counts {tot}, of them on a Station's name {on}; names under a count {sum(r['namesUnderCount'] for r in mine)}; blank {sum(r['blank'] for r in mine)}")
diff = []
for (view, device, scheme), r in branch.items():
    if scheme != 'dark':
        continue
    l = branch.get((view, device, 'light'))
    keys = ['pills', 'blank', 'folded', 'namesOverlapped', 'names', 'namesUnderCount', 'countsOnAName']
    d = {k: (l[k], r[k]) for k in keys if l and l[k] != r[k]}
    if l and (d or l['counted'] != r['counted'] or l['corners'] != r['corners']):
        diff.append(f"{view} {device}: light → dark {d}{' counts ' + str(l['counted']) + ' → ' + str(r['counted']) if l['counted'] != r['counted'] else ''}{' corners ' + str(l['corners']) + ' → ' + str(r['corners']) if l['corners'] != r['corners'] else ''}")
print('Dark against light:', '; '.join(diff) or 'the same counts')
print('Late (ms past the page-clock second):', ', '.join(f"{r['view']}/{r['device'][0]}/{r['scheme'][0]} {r['late']}" for r in mine))
for r in mine:
    if r['countsOnANameExamples']:
        print(f"On a name, {r['view']} {r['device']} {r['scheme']}: {'; '.join(r['countsOnANameExamples'][:6])}")
