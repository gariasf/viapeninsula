# #213 look-measure: contact sheets, one per spot x device, the variants as rows: light | dark | light 1:1 | dark 1:1.
# The 1:1 crops are device px round the spot's thing (CROP: its middle in CSS px), the same rect in every row.
#   python3 -I sheets.py <measure dir> <out dir> [spot,...]
import datetime, json, os, subprocess, sys

measure, out = sys.argv[1], sys.argv[2]
ROWS = {'bcn': 'A,G,L,GL,GLh', 'mad': 'A,G,L,GL', 'viaduct': 'A,G,L,GL', 'mouth': 'A,G,L,GL'}
spots = sys.argv[3].split(',') if len(sys.argv) > 3 else list(ROWS)
LABEL = {'A': 'A  main, tilted', 'G': 'G  the ground', 'L': 'L  the levels', 'GL': 'GL  ground + levels', 'GLh': 'GLh  GL, tunnels hidden'}
SHORT = {'A': 'A', 'G': 'G', 'L': 'L', 'GL': 'GL', 'GLh': 'GLh'}
TITLE = {'bcn': 'Barcelona z13', 'mad': 'Madrid z13', 'viaduct': 'Arroyo del Valle viaduct z14', 'mouth': "Garraf, the tunnels' mouths z15"}
FONT = '/Library/Fonts/Arial Unicode.ttf'
# Tile size and device px per CSS px.
TILE = {'laptop': (960, 600, 2), 'phone': (390, 844, 3)}
SIZE = {'laptop': (1280, 800), 'phone': (390, 844)}
# The crop's middle, CSS px, by spot and device: what each spot is for (look-build-report.md's spots).
CROP = {
    ('bcn', 'laptop'): (330, 200), ('bcn', 'phone'): (195, 215),
    ('mad', 'laptop'): (640, 300), ('mad', 'phone'): (195, 380),
    ('viaduct', 'laptop'): (640, 400), ('viaduct', 'phone'): (195, 422),
    ('mouth', 'laptop'): (860, 380), ('mouth', 'phone'): (195, 422),
}
shots = {}
for line in open(os.path.join(measure, 'shots.jsonl')):
    d = json.loads(line)
    shots[(d['spot'], d['variant'], d['device'], d['scheme'])] = d
os.makedirs(out, exist_ok=True)
tiles = os.path.join(measure, 'tiles')
os.makedirs(tiles, exist_ok=True)
for spot in spots:
    for device, (w, h, dpr) in TILE.items():
        W, H = SIZE[device]
        cx, cy = CROP[(spot, device)]
        left, top = int(min(max(cx * dpr - w / 2, 0), W * dpr - w)), int(min(max(cy * dpr - h / 2, 0), H * dpr - h))
        args = ['magick', 'montage', '-font', FONT, '-pointsize', '20' if device == 'laptop' else '14', '-background', '#ffffff']
        name = LABEL if device == 'laptop' else SHORT
        n, at = 0, None
        for v in ROWS[spot].split(','):
            shot = lambda s: os.path.join(measure, 'shots', f'{spot}-{v}-{device}-{s}.png')
            if not os.path.exists(shot('light')):
                continue
            n += 1
            at = datetime.datetime.fromtimestamp(shots[(spot, v, device, 'light')]['clock'] / 1000, datetime.timezone(datetime.timedelta(hours=2))).strftime('%H:%M:%S')
            for s in ['light', 'dark']:
                t = os.path.join(tiles, f'{spot}-{v}-{device}-{s}.png')
                subprocess.run(['magick', shot(s), '-resize', f'{w}x{h}', t], check=True)
                args += ['-label', f'{name[v]} · {s}', t]
            for s in ['light', 'dark']:
                t = os.path.join(tiles, f'{spot}-{v}-{device}-{s}-crop.png')
                subprocess.run(['magick', shot(s), '-crop', f'{w}x{h}+{left}+{top}', '+repage', t], check=True)
                args += ['-label', f'{name[v]} · {s} · 1:1', t]
        sheet = os.path.join(out, f'{spot}-{device}.jpg')
        args += ['-tile', '4x', '-geometry', f'{w}x{h}+6+6', '-title', f'#213 {TITLE[spot]}, {device} ({W}x{H}), tilted 45°, 22 Oct 2026 at {at} CEST (the 08:30 capture)', '-quality', '82', sheet]
        subprocess.run(args, check=True)
        print(sheet, n, 'rows, crop', f'{w}x{h}+{left}+{top}')
