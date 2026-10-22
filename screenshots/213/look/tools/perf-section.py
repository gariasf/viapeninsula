# #213 look-measure: the comment's perf section, from the four perf-<name>-table.md (their first table each).
#   python3 -I perf-section.py <measure dir>
import os, sys

m = sys.argv[1]
def table(name):
    lines = open(os.path.join(m, f'perf-{name}-table.md')).read().split('\n')
    start = next(i for i, l in enumerate(lines) if l.startswith('| Check'))
    end = next(i for i in range(start, len(lines)) if not lines[i].startswith('|'))
    return '\n'.join(lines[start:end])
for name, title in [('desktop1', 'Desktop: `S2 S5bcn S8 --pitch 45 --v213 main,G,L,GL`'), ('phone1', 'Phone (390×844, 4× CPU): the same with `--phone`'), ('desktop2', 'Desktop: `S3 S4 --pitch 45 --v213 main,G,GL`'), ('phone2', 'Phone: the same with `--phone`')]:
    if os.path.exists(os.path.join(m, f'perf-{name}-table.md')):
        print(f'**{title}**\n\n{table(name)}\n')
