# #828 measure: contact sheets, one per view x device, main and the branch as rows: light | dark | light 1:1 | dark 1:1, the
# 1:1 crops in device px of the look's rects (its sheets.py, from its counts); one sheet of the tap states, and one of the hover.
#   python3 -I sheets.py <measure dir> <look counts.jsonl> <out dir>
import json, os, subprocess, sys

here, look_counts, out = sys.argv[1], sys.argv[2], sys.argv[3]
FONT = '/Library/Fonts/Arial Unicode.ttf'
TILE = {'laptop': (960, 600, 2), 'phone': (390, 844, 3)}
SIZE = {'laptop': (1280, 800), 'phone': (390, 844)}
VIEWS = ['bcn-z12', 'bcn-z13-pg', 'bcn-z13-sants', 'mad-z12-sol']
TITLE = {'bcn-z12': 'Barcelona z12', 'bcn-z13-pg': 'Pg de Gracia / Pl. Catalunya z13', 'bcn-z13-sants': 'Sants z13', 'mad-z12-sol': 'Madrid z12, Sol'}
LABEL = {'main': 'main 0246c212', 'branch': 'branch 9c3f0a48'}
look = {}
for line in open(look_counts):
    d = json.loads(line)
    look[(d['variant'], d['view'], d['device'], d['scheme'])] = d
counts = {}
for line in open(os.path.join(here, 'counts.jsonl')):
    d = json.loads(line)
    counts[(d['tree'], d['view'], d['device'], d['scheme'])] = d
shot = lambda name: os.path.join(here, 'shots', name + '.png')
tiles = os.path.join(here, 'tiles')
os.makedirs(tiles, exist_ok=True)
os.makedirs(out, exist_ok=True)


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
        s += f", {c['folded']} folded, {len(c['counted'])} counts (max +{max(c['counted'] or [0])})" if device == 'laptop' else f", {c['folded']} folded, max +{max(c['counted'] or [0])}"
    return s


for view in VIEWS:
    for device, (w, h, dpr) in TILE.items():
        W, H = SIZE[device]
        left, top = rect(view, device)
        args = ['magick', 'montage', '-font', FONT, '-pointsize', '20' if device == 'laptop' else '12', '-background', '#ffffff']
        for tree in ['main', 'branch']:
            for s in ['light', 'dark']:
                t = os.path.join(tiles, f'{tree}-{view}-{device}-{s}.png')
                subprocess.run(['magick', shot(f'{tree}-{view}-{device}-{s}'), '-resize', f'{w}x{h}', t], check=True)
                args += ['-label', label(tree, counts.get((tree, view, device, s)), s, device), t]
            for s in ['light', 'dark']:
                t = os.path.join(tiles, f'{tree}-{view}-{device}-{s}-crop.png')
                subprocess.run(['magick', shot(f'{tree}-{view}-{device}-{s}'), '-crop', f'{w}x{h}+{left}+{top}', '+repage', t], check=True)
                args += ['-label', f"{LABEL[tree] if device == 'laptop' else tree} · {s} · 1:1 device px", t]
        sheet = os.path.join(out, f'{view}-{device}.jpg')
        args += ['-tile', '4x', '-geometry', f'{w}x{h}+6+6', '-title', f'#828 after: {TITLE[view]}, {device} ({W}x{H}), 21 Oct 2026 08:30 CEST capture', '-quality', '82', sheet]
        subprocess.run(args, check=True)
        print(sheet)

# The tap states: rows phone and laptop, light and dark; columns before, after a tap on the "+n" pill, after a tap elsewhere,
# each a 1:1 crop in device px round the tapped pill as it was tapped. Run 2 (taps.jsonl) read the pile just before its tap;
# run 1 (taps-run1.jsonl, shots/run1) read it before its "before" shot, 0.4-1 s ahead of the tap.
CW, CH = 720, 540


def tap_sheet(taps_file, shots, name, title):
    taps = [json.loads(l) for l in open(os.path.join(here, taps_file))]
    by = {(t['device'], t['scheme'], t['state']): t for t in taps}
    args = ['magick', 'montage', '-font', FONT, '-pointsize', '16', '-background', '#ffffff']
    for device in ['phone', 'laptop']:
        dpr = TILE[device][2]
        W, H = SIZE[device]
        for scheme in ['light', 'dark']:
            before = by.get((device, scheme, 'before'))
            if not before:
                continue
            left = int(min(max(before['at'][0] * dpr - CW / 2, 0), W * dpr - CW))
            top = int(min(max(before['at'][1] * dpr - CH / 2, 0), H * dpr - CH))
            for state in ['before', 'spread', 'folded']:
                t = os.path.join(tiles, f'{name}-{state}-{device}-{scheme}-crop.png')
                subprocess.run(['magick', os.path.join(here, shots, f'tap-{state}-{device}-{scheme}.png'), '-crop', f'{CW}x{CH}+{left}+{top}', '+repage', t], check=True)
                r = by.get((device, scheme, state), {})
                text = {'before': f"before: {r.get('target')}, its pile {', '.join(r.get('members', []))}",
                        'spread': f"tap on it: {r.get('drawn')} of {len(r.get('members', []))} drawn, followed {r.get('followed')}",
                        'folded': f"tap elsewhere: {r.get('target')}, {r.get('refolded')} of {r.get('of')} folded again"}[state]
                args += ['-label', f'{device} · {scheme} · {text}', t]
    sheet = os.path.join(out, f'{name}.jpg')
    args += ['-tile', '3x', '-geometry', f'{CW}x{CH}+6+6', '-title', title, '-quality', '85', sheet]
    subprocess.run(args, check=True)
    print(sheet)


tap_sheet('taps.jsonl', 'shots', 'tap-bcn-z13-pg', '#828 after: a tap on a "+n" pill spreads its pile, a tap elsewhere folds it (Pg de Gracia z13, +61 s, 1:1 device px)')
tap_sheet('taps-run1.jsonl', 'shots/run1', 'tap-bcn-z13-pg-run1', '#828 after, run 1: the pile read 0.4-1 s before its tap (Pg de Gracia z13, +61 s, 1:1 device px)')

# The pointer over a count, on the laptop (tapall.mts): the shots 0.2 s apart, the pointer away, then on the count.
hover = [json.loads(l) for l in open(os.path.join(here, 'tapall.jsonl')) if 'hover' in l][0]
left = int(min(max(hover['at'][0] * 2 - CW / 2, 0), 2560 - CW))
top = int(min(max(hover['at'][1] * 2 - CH / 2, 0), 1600 - CH))
args = ['magick', 'montage', '-font', FONT, '-pointsize', '16', '-background', '#ffffff']
crops = []
for state, text in [('away', f"pointer away, cursor '{hover['cursorAway']}'"), ('on', f"pointer on {hover['hover']}'s count, cursor '{hover['cursorOn']}'")]:
    t = os.path.join(tiles, f'hover-{state}-laptop-light-crop.png')
    subprocess.run(['magick', shot(f'hover-{state}-laptop-light'), '-crop', f'{CW}x{CH}+{left}+{top}', '+repage', t], check=True)
    crops.append(t)
    args += ['-label', f'laptop · light · {text}', t]
sheet = os.path.join(out, 'hover-bcn-z13-pg-laptop.jpg')
args += ['-tile', '2x', '-geometry', f'{CW}x{CH}+6+6', '-title', '#828 after: the pointer over a "+n" count (laptop, 1:1 device px, shots 0.2 s apart)', '-quality', '85', sheet]
subprocess.run(args, check=True)
diff = subprocess.run(['magick', *crops, '-compose', 'difference', '-composite', '-colorspace', 'gray', '-threshold', '3%', '-format', '%[fx:round(mean*w*h)]', 'info:'], capture_output=True, text=True, check=True)
print(sheet, 'pixels differing by over 3%:', diff.stdout.strip(), 'of', CW * CH)
