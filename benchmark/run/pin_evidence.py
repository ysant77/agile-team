"""Add the bank's pinned block to recorded case evidence (used on 18 Nov 2026 with bank main 60f141e).

Usage: python3 pin_evidence.py <bank scripts dir> <bench bank clone> <evidence dir> <manifest> [ids]
For each case branch, it runs the bank's pinned step (scripts/pinned.py) on the branch against the
bench base and writes the block into the recorded report.json. Nothing else in the evidence changes.
"""
import json, sys, importlib.util, subprocess
from pathlib import Path
NEW = Path(sys.argv.pop(1))  # the bank's scripts folder at the commit that writes the pinned block
sys.path.insert(0, str(NEW))
spec = importlib.util.spec_from_file_location('repro', NEW / 'repro.py'); repro = importlib.util.module_from_spec(spec); spec.loader.exec_module(repro)
import pinned
root = Path(sys.argv[1]); ev = Path(sys.argv[2]); manifest = json.load(open(sys.argv[3]))
only = set(sys.argv[4].split(',')) if len(sys.argv) > 4 else None
for c in manifest:
    if c.get('void') or (only and c['id'] not in only):
        continue
    for br in c['branches']:
        rep = ev / br.replace('/', '_') / 'report.json'
        if not rep.exists():
            print(br, 'no report'); continue
        head = subprocess.run(['git', 'rev-parse', br], cwd=root, capture_output=True, text=True, check=True).stdout.strip()
        base = subprocess.run(['git', 'merge-base', 'bench-base', head], cwd=root, capture_output=True, text=True, check=True).stdout.strip()
        ch = repro.changed_paths(root, base, head)
        block = pinned.build(root, base, head, repro.checked_test_paths(root, ch['base_side'])[0], repro.checked_test_paths(root, ch['tests'])[0])
        r = json.load(open(rep)); r['pinned'] = block; json.dump(r, open(rep, 'w'), indent=1)
        bad = [(t['id'].split('::')[1], t['outcome']) for t in block['tests'] if t['outcome'] != 'passed' or t['head_id'] != t['id'] or t['head_hash'] != t['base_hash']]
        print(br, 'modules', len(block['modules']), 'pinned', len(block['tests']), 'notable', bad)
