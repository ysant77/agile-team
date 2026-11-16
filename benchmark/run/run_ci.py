"""Run the bank CI commands on one benchmark case branch and save the evidence.

    python run_ci.py --clone <bank clone> --branch case/B21 --base bench-base --out <dir> [--env CI=true]

The steps follow the bank's `.github/workflows/ci.yml`: lint, the test run with coverage and the
CI report, the base run (`scripts/repro.py`) and the changed-line coverage
(`scripts/changed_coverage.py`). One pytest run gives both the coverage and the report; the
benchmark tests run only with `--bench` (a deviation from CI, to save time). Nothing is pushed.
The script decides nothing; `score.mjs` applies the rules.
"""

from __future__ import annotations

import argparse
import json
import os
import shutil
import subprocess
import tempfile
from pathlib import Path


def run(cmd, cwd, env=None, check=False):
    p = subprocess.run(cmd, cwd=cwd, env=env, capture_output=True, text=True, check=False)
    if check and p.returncode != 0:
        raise SystemExit(f"{' '.join(cmd)} failed: {p.stderr[-2000:]}")
    return p


def git(clone, *args):
    return run(["git", *args], clone, check=True).stdout.strip()


def changed_files(clone, base, head):
    """GitHub-like file entries: filename, status, previous_filename, patch."""
    out = git(clone, "diff", "--name-status", "-M", f"{base}...{head}")
    files = []
    for line in out.splitlines():
        status, *paths = line.split("\t")
        entry = {"filename": paths[-1], "status": {"A": "added", "D": "removed", "M": "modified"}.get(status[0], "renamed")}
        if status.startswith("R"):
            entry["previous_filename"] = paths[0]
        patch = run(["git", "diff", "-U3", f"{base}...{head}", "--", *paths], clone).stdout
        body = patch.split("\n@@", 1)
        entry["patch"] = ("@@" + body[1]) if len(body) > 1 else None
        files.append(entry)
    stat = git(clone, "diff", "--shortstat", f"{base}...{head}")
    nums = [int(w) for w in stat.replace(",", " ").split() if w.isdigit()]
    adds = nums[1] if len(nums) > 1 and "insertion" in stat else 0
    dels = nums[-1] if "deletion" in stat else 0
    return files, adds, dels


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--clone", required=True, type=Path)
    ap.add_argument("--branch", required=True)
    ap.add_argument("--base", required=True)
    ap.add_argument("--out", required=True, type=Path)
    ap.add_argument("--env", action="append", default=[])
    ap.add_argument("--bench", action="store_true")
    ap.add_argument("--main-report", type=Path, help="base report (main.json) for the coverage totals")
    ap.add_argument("--repro-script", type=Path, help="use this scripts/repro.py (development re-score)")
    ap.add_argument("--drop-coverage-file", default="", help="remove this file from coverage.json (simulated CI fault)")
    ap.add_argument("--pr-head-branch", default="", help="branch whose tip is the PR head, when CI ran on an older commit")
    ap.add_argument("--base-tip-branch", default="", help="branch whose tip is the current base")
    args = ap.parse_args()
    clone = args.clone.resolve()
    py = str(clone / ".venv" / "bin" / "python")
    head = git(clone, "rev-parse", args.branch)
    base = git(clone, "rev-parse", args.base)
    merge_base = git(clone, "merge-base", base, head)
    args.out.mkdir(parents=True, exist_ok=True)
    work = Path(tempfile.mkdtemp())
    tree = work / clone.name
    try:
        git(clone, "worktree", "add", "--detach", str(tree), head)
        env = dict(os.environ, PYTHONPATH="src", CI_HEAD_SHA=head, CI_BASE_SHA=merge_base)
        env.pop("VIRTUAL_ENV", None)
        for kv in args.env:
            k, v = kv.split("=", 1)
            env[k] = v
        lint = run([py, "-m", "ruff", "check", "."], tree, env)
        report = tree / "ci-report.json"
        cov = tree / "coverage.json"
        marker = ["-m", "bench or not bench"] if args.bench else []
        # The CI commands are the PR's own workflow: keep the --ignore / --deselect flags that
        # its report step passes to pytest (a PR can change them; case B07).
        wf = tree / ".github" / "workflows" / "ci.yml"
        line = next((x for x in wf.read_text(encoding="utf-8").splitlines() if "--ci-report=" in x), "") if wf.is_file() else ""
        marker += [t for t in line.split() if t.startswith(("--ignore=", "--deselect="))]
        tests = run(
            [py, "-m", "pytest", "-q", *marker, "--cov=src", "--cov-branch",
             f"--cov-report=json:{cov}", f"--ci-report={report}"],
            tree, env,
        )
        steps = {"lint_rc": lint.returncode, "tests_rc": tests.returncode,
                 "tests_tail": tests.stdout[-600:]}
        if args.repro_script:
            shutil.copy(args.repro_script.resolve(), tree / "scripts" / "repro.py")
        if report.is_file() and args.base != args.branch:
            r = run([py, "scripts/repro.py", "--base", base, "--head", head, "--head-report", str(report)], tree, env)
            steps["repro_rc"] = r.returncode
            steps["repro_err"] = r.stderr[-600:]
        if args.drop_coverage_file and cov.is_file():
            data = json.loads(cov.read_text(encoding="utf-8"))
            data.get("files", {}).pop(args.drop_coverage_file, None)
            cov.write_text(json.dumps(data), encoding="utf-8")
        if report.is_file() and cov.is_file():
            cargs = ["--coverage", str(cov), "--head-report", str(report), "--head", head]
            if args.base != args.branch:
                cargs += ["--base", base]
                if args.main_report and args.main_report.is_file():
                    cargs += ["--base-report", str(args.main_report.resolve())]
            c = run([py, "scripts/changed_coverage.py", *cargs], tree, env)
            steps["coverage_rc"] = c.returncode
            steps["coverage_err"] = c.stderr[-600:]
        if report.is_file():
            shutil.copy(report, args.out / "report.json")
        files, adds, dels = changed_files(clone, merge_base, head) if args.base != args.branch else ([], 0, 0)
        meta = {"branch": args.branch, "head": head, "base": base, "merge_base": merge_base,
                "pr_head": git(clone, "rev-parse", args.pr_head_branch) if args.pr_head_branch else None,
                "base_tip": git(clone, "rev-parse", args.base_tip_branch) if args.base_tip_branch else None,
                "files": files, "additions": adds, "deletions": dels, "steps": steps}
        (args.out / "meta.json").write_text(json.dumps(meta, indent=1) + "\n", encoding="utf-8")
        print(args.branch, "tests_rc", tests.returncode, "report", report.is_file())
    finally:
        run(["git", "worktree", "remove", "--force", str(tree)], clone)
        shutil.rmtree(work, ignore_errors=True)


if __name__ == "__main__":
    main()
