import json, sys, os
# Case-by-case comparison of two arm D log folders: D, per run D, review, guard, blocking texts, input hash.
a, b = sys.argv[1], sys.argv[2]
A = {r['id']: r for r in json.load(open(f'{a}/arm-d.json'))['results']}
B = {r['id']: r for r in json.load(open(f'{b}/arm-d.json'))['results']}
diffs = []
if set(A) != set(B): diffs.append(('case set', sorted(set(A) ^ set(B))))
for k in sorted(A):
    x, y = A[k], B.get(k)
    if y is None: continue
    if (x['C'], x['D']) != (y['C'], y['D']): diffs.append((k, 'C/D', (x['C'], x['D']), (y['C'], y['D'])))
    rx = [(r['run'], r['D'], r['review'], r['guard']) for r in x['runs']]
    ry = [(r['run'], r['D'], r['review'], r['guard']) for r in y['runs']]
    if rx != ry: diffs.append((k, 'runs', rx, ry))
    for r in x['runs']:
        fx, fy = f"{a}/{k}-run{r['run']}.json", f"{b}/{k}-run{r['run']}.json"
        if not (os.path.exists(fx) and os.path.exists(fy)): diffs.append((k, r['run'], 'run file missing')); continue
        px, py = json.load(open(fx)), json.load(open(fy))
        for f in ('blocking', 'inputHash'):
            if px.get(f) != py.get(f): diffs.append((k, r['run'], f, px.get(f), py.get(f)))
        rvx = (px.get('review') or {}).get('review'); rvy = (py.get('review') or {}).get('review')
        if rvx != rvy: diffs.append((k, r['run'], 'accepted record differs'))
n_runs = sum(len(r['runs']) for r in A.values())
print(f'{a} vs {b}: cases {len(A)}, model runs {n_runs}, differences {len(diffs)}')
for d in diffs: print('  ', d)
print('held/caught D:', sorted(k for k, r in A.items() if r['D'] != r['C']))
