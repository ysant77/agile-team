"""Run run_ci.py for every branch of the case manifests, a few at a time.

    python run_all.py --out <evidence dir> --main-report <dir>/BASE/report.json \
        --case-set <clone>:<manifest> [--case-set ...] [--jobs 4] [--only B21,B22]
"""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

HERE = Path(__file__).resolve().parent


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", required=True, type=Path)
    ap.add_argument("--main-report", required=True, type=Path)
    ap.add_argument("--case-set", action="append", required=True)
    ap.add_argument("--jobs", type=int, default=4)
    ap.add_argument("--only", default="")
    ap.add_argument("--repro-script", default="")
    args = ap.parse_args()
    only = set(filter(None, args.only.split(",")))
    jobs = []
    for spec in args.case_set:
        clone, manifest = spec.split(":", 1)
        for case in json.loads(Path(manifest).read_text(encoding="utf-8")):
            if case.get("void") or (only and case["id"] not in only):
                continue
            env = [f"{k}={v}" for k, v in (case.get("env") or {}).items()]
            for branch in case["branches"]:
                cmd = [sys.executable, str(HERE / "run_ci.py"), "--clone", clone, "--branch", branch,
                       "--base", case.get("base", "bench-base"),
                       "--out", str(args.out / branch.replace("/", "_")),
                       "--main-report", str(args.main_report)]
                cmd += [x for e in env for x in ("--env", e)]
                if args.repro_script:
                    cmd += ["--repro-script", args.repro_script]
                if case.get("bench"):
                    cmd.append("--bench")
                jobs.append(cmd)

    def go(cmd):
        p = subprocess.run(cmd, capture_output=True, text=True)
        return (p.stdout.strip() or p.stderr.strip()[-300:])

    with ThreadPoolExecutor(args.jobs) as pool:
        for line in pool.map(go, jobs):
            print(line, flush=True)


if __name__ == "__main__":
    main()
