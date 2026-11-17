# Arm D protocol for set 2 (fixed before the first D run, 16 Nov 2026)

Arm D is C plus the Code Reviewer agent (`CASES.md` section 1). This file fixes every choice
before the first D run. Nothing here changes after a D result is seen. A change after a result
goes into `run/SCORER-CHANGES.md` with the result that came before it.

| Item | Value |
|---|---|
| Cases | The 11 set 2 cases where C is `supported` in `RESULTS-2.md`: S01, S02, S04, S05, S06, S07, S08, S09, S13, S16, S18. D does not run on the others; their D result is the C result. |
| C result | `run/results/results-2.json` (88116c0). Unchanged. |
| Reviewer code | agile-team `feat/code-reviewer-agent` at 20f8e30: `buildReviewPacket`, `packetForAgent`, `reviewSuggested`, `applyReviewGuards` and `reviewGate` (guard version 1). No change. |
| Prompt | The `reviewer-agent` prompt in `manifest.yml` at 20f8e30, prompt id `code-review/1`, as the system message. The user message is the manifest's conversation starter with the case's PR and key: "Review pull request <n> on <key>". |
| Tools | `get-pr-diff` returns the app's agent view of the packet. `record-review` runs the app's guards and gate: one retry on a refused review or on style findings; after that the gate's record is final. `get-verdicts` returns C's verdict. At most 8 model turns. |
| Packet input | The case evidence of `run_ci.py` (the files and patches of the PR, the head report test ids), the case ticket, and C's verdict and reason. Trigger `request` (the app has no trigger for a `supported` verdict). PR number 101 + the case index in the manifest. The manifest calls the AC text `text`; the app calls it `statement`. The harness copies `text` to `statement`. |
| Model | `qwen3-coder:30b` on local Ollama 0.40.16, digest `06c1097efce0` (already on the machine; no download). |
| Options | temperature 0, num_ctx 32768, seed = run number (1, 2, 3). |
| Runs | 3 runs per case. |
| Rating rule | A finding is blocking when it is in a review that the guards accept (outcome `review`). The guards already require an exact hunk id, the hunk's file and a line inside the changed range. D is `cannot_verify` for a run when the accepted review has at least one finding. A refused review, no review, or a review with proposed checks only leaves C's result. D never turns a result into `supported`. |
| Worst-run rule (primary result) | For a case whose correct outcome is `supported` (the 8 controls): D is `cannot_verify` if any run gives `cannot_verify` (a control held in any run counts as held). For every other case: D catches the case only if all three runs give `cannot_verify`. Each run is reported beside the primary result. |
| Truth | `run/truth-2.json` (frozen rows of `CASES-2-INDEPENDENT.md`). |
| Harness | `run/arm_d.mjs` in the commit of this file. |
| Report | S09 and S13, the 8 controls, and every new false result, in `RESULTS-2-ARM-D.md`. `RESULTS-2.md` stays unchanged. |

Known limits, stated before the run:

- The app's packet tells the agent "every check passed; no review is needed" for a `supported`
  verdict (`reviewSuggested`). The protocol keeps the app as it is.
- A local model through Ollama tool calls stands in for the Rovo agent runtime. No Rovo credits.
