# #213 ship: contact sheets, the look's sheets.py adapted: one per view, main and the branch as rows, light | dark; the phone
# (main | branch | their pixel diff); and L'Hospitalet's pointer, tap and Train on a bridge, if one came.
#   python3 -I sheets.py <ship dir>
import datetime, glob, json, os, subprocess, sys

ship = sys.argv[1]
shots, out, tiles = (os.path.join(ship, d) for d in ('shots', 'sheets', 'tiles'))
os.makedirs(out, exist_ok=True)
os.makedirs(tiles, exist_ok=True)
TITLE = {'viaduct': 'the Arroyo del Valle viaduct z14', 'garraf': "Garraf, the tunnels' mouths z15", 'hospitalet': "L'Hospitalet's Llobregat bridge z14", 'bcn': 'Barcelona z13', 'mad': 'Madrid z13'}
FONT = '/Library/Fonts/Arial Unicode.ttf'
rows = {}
for line in open(os.path.join(ship, 'shots.jsonl')):
    d = json.loads(line)
    if 'tree' in d:
        rows[(d['view'], d['tree'], d['device'], d['scheme'])] = d
cest = lambda ms: datetime.datetime.fromtimestamp(ms / 1000, datetime.timezone(datetime.timedelta(hours=2))).strftime('%H:%M:%S')


def montage(cells, w, h, cols, title, sheet):
    args = ['magick', 'montage', '-font', FONT, '-pointsize', '20', '-background', '#ffffff']
    for label, src in cells:
        t = os.path.join(tiles, os.path.basename(src))
        subprocess.run(['magick', src, '-resize', f'{w}x{h}', t], check=True)
        args += ['-label', label, t]
    args += ['-tile', f'{cols}x', '-geometry', f'{w}x{h}+6+6', '-title', title, '-quality', '82', sheet]
    subprocess.run(args, check=True)
    print(sheet, len(cells), 'cells')


for view, name in TITLE.items():
    cells = [(f'{tree} · {s}', os.path.join(shots, f'{view}-{tree}-laptop-{s}.png')) for tree in ('main', 'branch') for s in ('light', 'dark')]
    at = cest(rows[(view, 'main', 'laptop', 'light')]['clock'])
    montage(cells, 1280, 800, 2, f'#213 {name}, 1280x800, tilted 45°: main, then the branch · 22 Oct {at} CEST', os.path.join(out, f'{view}.jpg'))

# The phone: the branch against main, pixel by pixel.
a, b = (os.path.join(shots, f'phone-bcn-{t}-phone-light.png') for t in ('main', 'branch'))
diff = os.path.join(shots, 'phone-bcn-diff.png')
subprocess.run(['magick', 'compare', a, b, diff], capture_output=True)
# Pixels that differ at all, and by more than 6%: compare's AE counts in other units in ImageMagick 7.1.2.
count = lambda t: subprocess.run(['magick', a, b, '-compose', 'difference', '-composite', '-colorspace', 'gray', '-threshold', t, '-format', '%[fx:round(mean*w*h)]', 'info:'], capture_output=True, text=True, check=True).stdout
ae, ae6 = count('0'), count('6%')
print(f'phone diff: {ae} px differ, {ae6} by more than 6%, of 1170x2532')
at = cest(rows[('phone-bcn', 'main', 'phone', 'light')]['clock'])
montage([('main', a), ('branch', b), (f'diff: {ae} px', diff)], 585, 1266, 3, f'#213 phone 390x844, flat, Barcelona z13 · 22 Oct {at} CEST', os.path.join(out, 'phone-bcn.jpg'))

# L'Hospitalet, the branch, light: the pointer over a deck, the card a tap opens, and a Train on a bridge.
extra = [('the pointer over a deck', os.path.join(shots, 'hospitalet-branch-laptop-light-hover.png')), ('the card a tap opens', os.path.join(shots, 'hospitalet-branch-laptop-light-tap.png'))]
# The probe's second with R2 5193J28474R2 on the Llobregat bridge (probe-hospitalet.txt: 47 and 49 s), and that bridge at 1:1.
train = os.path.join(shots, 'hospitalet-train-48s-branch-laptop-light.png')
crop = os.path.join(shots, 'hospitalet-train-48s-branch-laptop-light-crop.png')
subprocess.run(['magick', train, '-crop', '1280x800+614+420', '+repage', crop], check=True)
extra += [('a Train on the bridge, second 48', train), ('the same, 1:1', crop)]
montage([c for c in extra if os.path.exists(c[1])], 1280, 800, 2, "#213 L'Hospitalet's Llobregat bridge z14, the branch, tilted 45°", os.path.join(out, 'hospitalet-hover-tap-train.jpg'))
