import json,sys
# Compare an arm D run with the d175960 baseline: controls held, unsafe supported, changed cases.
# Usage: python3 armd_compare.py <benchmark/run> <folder with armd-a3b-s1..s3>
B,S=sys.argv[1],sys.argv[2]
sets=[('1',f'{B}/results/dev-reviewer-2/devd-1c.json',f'{S}/armd-a3b-s1/arm-d.json',f'{B}/truth.json'),
      ('2',f'{B}/results/dev-reviewer-2/devd-2c.json',f'{S}/armd-a3b-s2/arm-d.json',f'{B}/truth-2.json'),
      ('3',f'{B}/results/set3/arm-d/arm-d.json',f'{S}/armd-a3b-s3/arm-d.json',f'{B}/truth-3.json')]
for n,base,new,tr in sets:
    t=json.load(open(tr)); o={r['id']:r for r in json.load(open(base))['results']}; m={r['id']:r for r in json.load(open(new))['results']}
    ctl=[k for k,v in t.items() if isinstance(v,dict) and v.get('kind')=='valid_trusted']
    def held(d): return [k for k in ctl if k in d and d[k]['C']=='supported' and d[k]['D']!='supported']
    def unsafe(d): return [k for k in d if isinstance(t.get(k),dict) and 'supported' not in t[k]['correct'] and d[k]['D']=='supported']
    def right(d): return sum(1 for k in d if isinstance(t.get(k),dict) and d[k]['D'] in t[k]['correct'])
    print(f'set {n}: controls {len(ctl)} | held base {held(o)} new {held(m)} | unsafe base {len(unsafe(o))} {unsafe(o)} new {len(unsafe(m))} {unsafe(m)} | right base {right(o)} new {right(m)} of {len(m)}')
    diff=[(k,o[k]['D'],m[k]['D']) for k in m if k in o and o[k]['D']!=m[k]['D']]
    print('   D differs:',diff, '| missing in base:',[k for k in m if k not in o])
    for k in ['S09','S13','T08','T12','T02','T14']:
        if k in m: print('  ',k,'base',o.get(k,{}).get('D'),'new',m[k]['D'],'runs',[ (r['D'],r.get('review'),r.get('guard')) for r in m[k]['runs']])
