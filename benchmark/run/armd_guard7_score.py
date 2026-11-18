# Guard version 7 regression (REGRESSION-ARM-D-GUARD7.md): acceptance per set against the
# same-day old-code runs. Usage: python3 armd_guard7_score.py <runs folder> <benchmark/run>
# The runs folder holds armd-set4, armd-rf-s1..3 (old code, 18 Nov) and armd-g7-s1..4.
import json, sys, os
S = sys.argv[1]
B = R4 = sys.argv[2]
SETS = [('4', f'{S}/armd-set4', f'{S}/armd-g7-s4', f'{R4}/truth-4.json'),
        ('1', f'{S}/armd-rf-s1', f'{S}/armd-g7-s1', f'{B}/truth.json'),
        ('2', f'{S}/armd-rf-s2', f'{S}/armd-g7-s2', f'{B}/truth-2.json'),
        ('3', f'{S}/armd-rf-s3', f'{S}/armd-g7-s3', f'{B}/truth-3.json')]
NOW = {'1': (1, 28), '2': (0, 11), '3': (0, 8), '4': (0, 7)}
ok_all = True
def counts(d, t):
    ctl = [k for k, v in t.items() if isinstance(v, dict) and v.get('kind') == 'valid_trusted']
    held = [k for k in ctl if k in d and d[k]['C'] == 'supported' and d[k]['D'] != 'supported']
    held_any = [k for k in ctl if k in d and d[k]['C'] == 'supported' and any(r['D'] != 'supported' for r in d[k]['runs'])]
    ns = [k for k in d if isinstance(t.get(k), dict) and 'supported' not in t[k]['correct']]
    caught = [k for k in ns if d[k]['D'] != 'supported']
    return sorted(set(held) | set(held_any)), caught, [k for k in ns if d[k]['D'] == 'supported']
for n, old, new, tr in SETS:
    if not os.path.exists(f'{new}/arm-d.json'):
        print(f'set {n}: not run'); ok_all = False; continue
    t = json.load(open(tr))
    o = {r['id']: r for r in json.load(open(f'{old}/arm-d.json'))['results']}
    m = {r['id']: r for r in json.load(open(f'{new}/arm-d.json'))['results']}
    h0, c0, u0 = counts(o, t); h1, c1, u1 = counts(m, t)
    ok = len(h1) <= NOW[n][0] and len(c1) >= NOW[n][1]
    ok_all &= ok
    print(f'set {n}: controls held old {h0} new {h1} | caught old {len(c0)} new {len(c1)} | supported-not-correct new {u1} | acceptance {"MET" if ok else "NOT MET"}')
    for k in sorted(m):
        x, y = o.get(k), m[k]
        rx = [(r['D'], r['review'], r['guard']) for r in x['runs']] if x else None
        ry = [(r['D'], r['review'], r['guard']) for r in y['runs']]
        if x is None or x['D'] != y['D'] or rx != ry:
            texts = []
            for r in y['runs']:
                p = json.load(open(f'{new}/{k}-run{r["run"]}.json'))
                texts += [f"{f['ac']} {f['text']}" for f in p.get('blocking', [])]
            dropped = []
            p = json.load(open(f'{new}/{k}-run1.json'))
            rv = p.get('review') or {}
            print(f'   {k} kind={t.get(k,{}).get("kind")} D {x["D"] if x else None} -> {y["D"]} | old runs {rx} | new runs {ry} | blocking {sorted(set(texts))}')
print('ALL ACCEPTANCE', 'MET' if ok_all else 'NOT MET')
