# Role bake-off (development only)

The bake-off compares open-weight models on the team roles (DESIGN 9k). It runs on a developer
machine; nothing in this folder is deployed with the Forge app.

## Risk: model-written code runs on this machine

The developer, QA and DS tasks apply edits that a model wrote, and run pytest on them in a
scratch worktree of the bank repository. The QA task runs a test file that a model wrote. That
code runs with your user's rights.

What limits the risk today:

- Commands get a minimal environment (`PATH`, `HOME`, locale, temp and uv cache settings). Tokens,
  keys and other variables of your shell are not passed (`safeEnv` in `repo.js`).
- An edit to a file outside the bug's list (for example `conftest.py` or `pyproject.toml`) is
  refused before anything runs.
- Worktrees are detached and removed after each task; file writes outside the worktree are refused.

What is not covered: the code can still read and write files that your user can reach, and it
can use the network. Run the bake-off only on a machine with no secrets in its files or
environment. A container or VM sandbox is a follow-up.
