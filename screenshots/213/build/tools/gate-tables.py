# #213 ship: box 5's tables, each row from the latest run that measured it, with that run named.
#   python3 -I gate-tables.py <ship dir>
import os, sys

ship = sys.argv[1]
RUNS = {
    'desktop': [('desktop4', ['S2'], 'ab47758d, 23 Oct 13:43'), ('desktop3', ['S3', 'S4'], '4b136473, 23 Oct 13:27'), ('desktop2', ['S5bcn', 'S8'], '8d8979ce, 23 Oct 12:39')],
    'phone': [('phone2', ['S2', 'S3'], '8d8979ce, 23 Oct 13:08'), ('phone', ['S5bcn', 'S8'], '42a349ac, 23 Oct 11:15')],
}
for device, parts in RUNS.items():
    print(f"**{'Desktop 1440×900, tilted 45°' if device == 'desktop' else 'Phone 390×844, 4× CPU, flat'}**, main (c9046fb5) against the branch, 3 runs each alternated, medians and the runs' range:\n")
    print('| Check | Scenario | Limit | Main | Main\'s runs | Branch | Branch\'s runs | Δ | | Run |\n|---|---|---|---|---|---|---|---|---|---|')
    for name, scenarios, run in parts:
        lines = open(os.path.join(ship, f'perf-{name}-table.md')).read().split('\n')
        start = next(i for i, l in enumerate(lines) if l.startswith('| Check'))
        for l in lines[start + 2:]:
            if not l.startswith('|'):
                break
            cells = l.split(' | ')
            if cells[1] in scenarios and 'not budgeted' not in l:
                print(f'{l} {run} |')
    print()
