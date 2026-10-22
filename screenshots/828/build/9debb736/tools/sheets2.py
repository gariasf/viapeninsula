# #828 re-measure: contact sheets, one per view x device, rows main (the first measure's shots, 0246c212) and the branch at
# 9debb736 (this measure's), columns light | dark | light 1:1 | dark 1:1, the 1:1 crops in device px of the look's rects, as
# the first measure's sheets.py; one sheet of the tap states, with the followed Train's taps on the phone as its last row;
# and one of the pointer over a count.
#   python3 -I sheets2.py <measure dir> <measure2 dir> <look counts.jsonl> <out dir>
import json, os, subprocess, sys

first, here, look_counts, out = sys.argv[1], sys.argv[2], sys.argv[3], sys.argv[4]
FONT = '/Library/Fonts/Arial Unicode.ttf'
TILE = {'laptop': (960, 600, 2), 'phone': (390, 844, 3)}
SIZE = {'laptop': (1280, 800), 'phone': (390, 844)}
VIEWS = ['bcn-z12', 'bcn-z13-pg', 'bcn-z13-sants', 'mad-z12-sol']
TITLE = {'bcn-z12': 'Barcelona z12', 'bcn-z13-pg': 'Pg de Gracia / Pl. Catalunya z13', 'bcn-z13-sants': 'Sants z13', 'mad-z12-sol': 'Madrid z12, Sol'}
LABEL = {'main': 'main 0246c212', 'branch': 'branch 9debb736'}
DIR = {'main': first, 'branch': here}
rows = lambda f: [json.loads(l) for l in open(f) if l.strip()]
look = {(d['variant'], d['view'], d['device'], d['scheme']): d for d in rows(look_counts)}
counts = {(d['tree'], d['view'], d['device'], d['scheme']): d for d in rows(os.path.join(first, 'counts.jsonl')) if d['tree'] == 'main'}
counts.update({(d['tree'], d['view'], d['device'], d['scheme']): d for d in rows(os.path.join(here, 'counts.jsonl'))})
shot = lambda tree, name: os.path.join(DIR[tree], 'shots', name + '.png')
tiles = os.path.join(here, 'tiles')
os.makedirs(tiles, exist_ok=True)
os.makedirs(out, exist_ok=True)
magick = lambda *a: subprocess.run(['magick', *a], check=True)


def rect(view, device):
    """The look's 1:1 rect: the largest pile clear of the page's cards and bars, from AN's boxes (A's Trains), else A's largest."""
    w, h, dpr = TILE[device]
    W, H = SIZE[device]
    main = look[('A', view, device, 'light')]
    lo, hi = ((0, 70), (W, H - 110)) if device == 'phone' else ((95, 60), (W, H - 70))
    mid = lambda b: device == 'phone' or (abs((b[1] + b[3]) / 2 - W / 2) < W / 8 and abs((b[2] + b[4]) / 2 - H / 2) < H / 8)
    boxes = [b[1:] for b in (look.get(('AN', view, device, 'light')) or {}).get('pileBoxes', []) if b[1] >= lo[0] and b[2] >= lo[1] and b[3] <= hi[0] and b[4] <= hi[1] and mid(b)]
    x0, y0, x1, y1 = (boxes or [main['largestBox']])[0] or [W / 2 - 10, H / 2 - 10, W / 2 + 10, H / 2 + 10]
    cx, cy = (x0 + x1) / 2 * dpr, (y0 + y1) / 2 * dpr
    return int(min(max(cx - w / 2, 0), W * dpr - w)), int(min(max(cy - h / 2, 0), H * dpr - h))


def label(tree, c, scheme, device):
    """The counts read just after the shot (0.1-0.4 s): a pile that changed in between can differ from the image."""
    name = LABEL[tree] if device == 'laptop' else tree
    if not c:
        return f'{name} · {scheme}'
    s = f"{name} · {scheme} · {c['pills']} pills, {c['blank']} blank"
    if tree == 'branch':
        s += f", {c['folded']} folded, {len(c['counted'])} counts (max +{max(c['counted'] or [0])}), {c['countsOnAName']} on a name" if device == 'laptop' else f", {c['folded']} folded, max +{max(c['counted'] or [0])}"
    return s


for view in VIEWS:
    for device, (w, h, dpr) in TILE.items():
        W, H = SIZE[device]
        left, top = rect(view, device)
        args = ['montage', '-font', FONT, '-pointsize', '20' if device == 'laptop' else '12', '-background', '#ffffff']
        for tree in ['main', 'branch']:
            for s in ['light', 'dark']:
                t = os.path.join(tiles, f'{tree}-{view}-{device}-{s}.png')
                magick(shot(tree, f'{tree}-{view}-{device}-{s}'), '-resize', f'{w}x{h}', t)
                args += ['-label', label(tree, counts.get((tree, view, device, s)), s, device), t]
            for s in ['light', 'dark']:
                t = os.path.join(tiles, f'{tree}-{view}-{device}-{s}-crop.png')
                magick(shot(tree, f'{tree}-{view}-{device}-{s}'), '-crop', f'{w}x{h}+{left}+{top}', '+repage', t)
                args += ['-label', f"{LABEL[tree] if device == 'laptop' else tree} · {s} · 1:1 device px", t]
        sheet = os.path.join(out, f'{view}-{device}.jpg')
        args += ['-tile', '4x', '-geometry', f'{w}x{h}+6+6', '-title', f'#828 after: {TITLE[view]}, {device} ({W}x{H}), 21 Oct 2026 08:30 CEST capture', '-quality', '82', sheet]
        magick(*args)
        print(sheet)

# The tap states: rows phone and laptop, light and dark; columns before, after a tap on the "+n" pill, after a tap elsewhere,
# each a 1:1 crop in device px round the tapped pill as it was tapped (taps.jsonl). Last row, the phone, light: the followed
# Train dragged off, after a tap on its pill, after a tap on its count (taps2.jsonl), cropped round both where it was followed
# and where the drag left it.
CW, CH = 720, 540
crop = lambda src, dst, cx, cy, W, H, dpr: magick(src, '-crop', f'{CW}x{CH}+{int(min(max(cx * dpr - CW / 2, 0), W * dpr - CW))}+{int(min(max(cy * dpr - CH / 2, 0), H * dpr - CH))}', '+repage', dst)
taps = rows(os.path.join(here, 'taps.jsonl'))
by = {(t['device'], t['scheme'], t['state']): t for t in taps}
args = ['montage', '-font', FONT, '-pointsize', '16', '-background', '#ffffff']
for device in ['phone', 'laptop']:
    dpr = TILE[device][2]
    W, H = SIZE[device]
    for scheme in ['light', 'dark']:
        before = by.get((device, scheme, 'before'))
        if not before:
            continue
        for state in ['before', 'spread', 'folded']:
            t = os.path.join(tiles, f'tap-{state}-{device}-{scheme}-crop.png')
            crop(os.path.join(here, 'shots', f'tap-{state}-{device}-{scheme}.png'), t, before['at'][0], before['at'][1], W, H, dpr)
            r = by.get((device, scheme, state), {})
            took = f", took in {', '.join(r['tookIn'])}" if r.get('tookIn') else ''
            text = {'before': f"before: {r.get('target')} ({r.get('corner')}), its pile {', '.join(r.get('members', []))}",
                    'spread': f"tap on its count: {r.get('drawn')} of {len(r.get('members', []))} drawn{took}, followed {r.get('followed')}",
                    'folded': f"tap elsewhere: {r.get('target')}, {r.get('refolded')} of {r.get('of')} folded again"}[state]
            args += ['-label', f'{device} · {scheme} · {text}', t]
# The phone's run with the pill tapped where its count doesn't reach (taps2.mts SPOT=probe): at its centre, the count took the tap.
followed = next((r for r in rows(os.path.join(here, 'taps2-phone-probe.jsonl')) if r.get('check') == 'followed' and r.get('countTap', {}).get('of')), None)
if followed:
    W, H = SIZE['phone']
    cx, cy = (followed['centreAt'][0] + followed['draggedAt'][0]) / 2, (followed['centreAt'][1] + followed['draggedAt'][1]) / 2
    p, c = followed['pillTap'], followed['countTap']
    texts = {'1-dragged': f"followed {followed['followed']}+{followed['followedCount']}, dragged {followed['draggedOff']} px off",
             '2-pill': f"tap on its pill, clear of its count: taken back, {p['back']} px off where it was, +{p['countAfter']}",
             '3-count': f"tap on its count {c.get('count')}: {c.get('pileDrawn')} of {c.get('of')} of its pile spread, still followed {c.get('stillFollowed')}"}
    for state, text in texts.items():
        t = os.path.join(tiles, f'followed-{state}-phone-light-crop.png')
        crop(os.path.join(here, 'shots', f'followed-{state}-phone-light.png'), t, cx, cy, W, H, 3)
        args += ['-label', f'phone · light · {text}', t]
# And the first run's, its pill tapped at its centre, which its count's box reaches: its pile spread, the map not taken back.
centre = next((r for r in rows(os.path.join(here, 'taps2.jsonl')) if r.get('check') == 'followed' and r['device'] == 'phone'), None)
if centre:
    W, H = SIZE['phone']
    cx, cy = (centre['centreAt'][0] + centre['draggedAt'][0]) / 2, (centre['centreAt'][1] + centre['draggedAt'][1]) / 2
    texts = {'0-followed': f"followed {centre['followed']}+{centre['followedCount']}, in the middle",
             '1-dragged': f"dragged {centre['draggedOff']} px off",
             '2-pill': f"tap at its pill's centre, under its count's reach: its pile spread, not taken back ({centre['pillTap']['back']} px off)"}
    for state, text in texts.items():
        t = os.path.join(tiles, f'followed-{state}-phone-light-centre-crop.png')
        crop(os.path.join(here, 'shots', f'followed-{state}-phone-light-centre.png'), t, cx, cy, W, H, 3)
        args += ['-label', f'phone · light · {text}', t]
sheet = os.path.join(out, 'tap-bcn-z13-pg.jpg')
args += ['-tile', '3x', '-geometry', f'{CW}x{CH}+6+6', '-title', '#828 after (9debb736): a tap on a "+n" spreads its pile, a tap elsewhere folds it; the followed Train\'s pill and count (Pg de Gracia z13, 1:1 device px)', '-quality', '85', sheet]
magick(*args)
print(sheet)

# The pointer over a count, on the laptop (taps.jsonl): the pointer on the clear spot ("folded" shot), then on the count, under a second on.
for scheme in ['light', 'dark']:
    hover = by.get(('laptop', scheme, 'hover'))
    if not hover:
        continue
    args = ['montage', '-font', FONT, '-pointsize', '16', '-background', '#ffffff']
    crops = []
    for state, text in [('folded', f"pointer away, cursor '{hover['cursorAway']}'"), ('hover', f"pointer on {hover['target']}'s count, cursor '{hover['cursor']}'")]:
        t = os.path.join(tiles, f'hover-{state}-laptop-{scheme}-crop.png')
        crop(os.path.join(here, 'shots', f'tap-{state}-laptop-{scheme}.png'), t, hover['at'][0], hover['at'][1], 1280, 800, 2)
        crops.append(t)
        args += ['-label', f'laptop · {scheme} · {text}', t]
    sheet = os.path.join(out, 'hover-bcn-z13-pg-laptop.jpg')
    args += ['-tile', '2x', '-geometry', f'{CW}x{CH}+6+6', '-title', '#828 after (9debb736): the pointer over a "+n" count (laptop, 1:1 device px, shots under 1 s apart)', '-quality', '85', sheet]
    magick(*args)
    diff = subprocess.run(['magick', *crops, '-compose', 'difference', '-composite', '-colorspace', 'gray', '-threshold', '3%', '-format', '%[fx:round(mean*w*h)]', 'info:'], capture_output=True, text=True, check=True)
    print(sheet, 'pixels differing by over 3%:', diff.stdout.strip(), 'of', CW * CH)
    break
