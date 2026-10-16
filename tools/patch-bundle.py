# Writes out-patched/: the live track files of the regions with long distance's and MD's Networks, with their pillZoom 9, as the build on this branch writes them.
import json, os, urllib.request
U='https://viapeninsula-live.gariasf.com'; H={'Origin':'https://viapeninsula.gariasf.com','User-Agent':'x'}
get=lambda p: json.load(urllib.request.urlopen(urllib.request.Request(f'{U}/{p}',headers=H)))
LD={'ave-larga-distancia','media-distancia-avant','ouigo'}
m=get('manifest.json'); files=set()
for r in m['regions']:
    if LD & set(r['networks']): files |= {d['track'] for d in r['days']}
zo=get(m['zoomedOut']); print('zoomedOut keys', list(zo.keys()) if isinstance(zo,dict) else type(zo))
for f in sorted(files):
    t=get(f); n=0
    for net in t['networks']:
        if net['id'] in LD: net['pillZoom']=9; n+=1
    os.makedirs(os.path.dirname(f'out-patched/{f}'),exist_ok=True)
    json.dump(t,open(f'out-patched/{f}','w'),separators=(',',':')); print(f,n)
n=0
for net in zo['networks']:
    if net['id'] in LD: net['pillZoom']=9; n+=1
json.dump(zo,open(f"out-patched/{m['zoomedOut']}",'w'),separators=(',',':')); print(m['zoomedOut'],n)
