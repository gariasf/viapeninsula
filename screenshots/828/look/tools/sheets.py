# #828 look: contact sheets, one per view x device, variants as rows: light | dark | light 1:1 | dark 1:1.
# The 1:1 crops are device px round main's (A's) largest pile in its light shot, the same rect in every row.
#   python3 -I sheets.py <look dir> <out dir> [rows, e.g. A,B,C,D,AN,DN]
import json, os, subprocess, sys

look, out = sys.argv[1], sys.argv[2]
rows = (sys.argv[3] if len(sys.argv) > 3 else 'A,B,C,D,AN').split(',')
LABEL = {'A': 'A as now', 'B': 'B one pill + count', 'C': 'C spread', 'D': 'D covered = dot', 'AN': 'A + names over pills', 'BN': 'B + names over pills', 'CN': 'C + names over pills', 'DN': 'D + names over pills', 'SN': 'D below z13, C from z13 + names over pills'}
FONT = '/Library/Fonts/Arial Unicode.ttf'
SHORT = {'A': 'A now', 'B': 'B count', 'C': 'C spread', 'D': 'D dots', 'AN': 'A+names', 'BN': 'B+names', 'CN': 'C+names', 'DN': 'D+names', 'SN': 'S+names'}
TILE = {'laptop': (960, 600, 2), 'phone': (390, 844, 3)}
counts = {}
for line in open(os.path.join(look, 'counts.jsonl')):
    d = json.loads(line)
    counts[(d['variant'], d['view'], d['device'], d['scheme'])] = d
os.makedirs(out, exist_ok=True)
tiles = os.path.join(look, 'tiles')
os.makedirs(tiles, exist_ok=True)
views = sorted({k[1] for k in counts}, key=['bcn-z12', 'bcn-z13-pg', 'bcn-z13-sants', 'mad-z12-sol'].index)
for view in views:
    for device, (w, h, dpr) in TILE.items():
        main = counts.get(('A', view, device, 'light'))
        if not main:
            continue
        shot = lambda v, s: os.path.join(look, 'shots', f'{v}-{view}-{device}-{s}.png')
        W, H = (1280, 800) if device == 'laptop' else (390, 844)
        # The largest pile clear of the page's cards and bars, from AN's boxes (A's Trains, the same moment), else A's largest.
        lo, hi = ((0, 70), (W, H - 110)) if device == 'phone' else ((95, 60), (W, H - 70))
        # On the laptop, of the frame's middle quarter too, where its view's Stations are.
        mid = lambda b: device == 'phone' or (abs((b[1] + b[3]) / 2 - W / 2) < W / 8 and abs((b[2] + b[4]) / 2 - H / 2) < H / 8)
        boxes = [b[1:] for b in (counts.get(('AN', view, device, 'light')) or {}).get('pileBoxes', []) if b[1] >= lo[0] and b[2] >= lo[1] and b[3] <= hi[0] and b[4] <= hi[1] and mid(b)]
        x0, y0, x1, y1 = (boxes or [main['largestBox']])[0] or [W / 2 - 10, H / 2 - 10, W / 2 + 10, H / 2 + 10]
        cx, cy = (x0 + x1) / 2 * dpr, (y0 + y1) / 2 * dpr
        left, top = int(min(max(cx - w / 2, 0), W * dpr - w)), int(min(max(cy - h / 2, 0), H * dpr - h))
        args = ['magick', 'montage', '-font', FONT, '-pointsize', '20' if device == 'laptop' else '14', '-background', '#ffffff']
        name = LABEL if device == 'laptop' else SHORT
        n = 0
        for v in rows:
            if not os.path.exists(shot(v, 'light')):
                continue
            n += 1
            for s in ['light', 'dark']:
                t = os.path.join(tiles, f'{v}-{view}-{device}-{s}.png')
                subprocess.run(['magick', shot(v, s), '-resize', f'{w}x{h}', t], check=True)
                c = counts.get((v, view, device, s), {})
                args += ['-label', f"{name[v]} · {s} · {c.get('pills', '?')} pills, {c.get('blank', '?')} blank, {c.get('piles', '?')} piles", t]
            for s in ['light', 'dark']:
                t = os.path.join(tiles, f'{v}-{view}-{device}-{s}-crop.png')
                subprocess.run(['magick', shot(v, s), '-crop', f'{w}x{h}+{left}+{top}', '+repage', t], check=True)
                args += ['-label', f'{name[v]} · {s} · 1:1 device px', t]
        sheet = os.path.join(out, f'{view}-{device}.jpg')
        args += ['-tile', '4x', '-geometry', f'{w}x{h}+6+6', '-title', f'#828 {view} {device} ({W}x{H}), 21 Oct 2026 08:30 CEST snapshot', '-quality', '82', sheet]
        subprocess.run(args, check=True)
        print(sheet, n, 'rows')
