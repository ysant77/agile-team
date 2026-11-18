# Read-only code context: the policy (feature branch, not wired)

Status: `src/context-policy.js` and `test/context-policy.test.js` only. No agent, reviewer prompt
or action uses it. Wiring it into the Code Reviewer is a reviewer change: it needs the arm D
regression and a new blind set first (benchmark README, item 6), and the owner's go-ahead.

## What it does

A model asks for a context call: a tool name and arguments. Code decides `allow` or `refuse` and
logs every decision with its reason. The module only decides. It does not read file content,
write, run a shell or use the network. A caller reads a file only after an `allow`.

| Rule | Refused example |
|---|---|
| Fixed allow-list: `read_file`, `list_dir`, `search_symbol` | `code_graph_search` (kept as a proposal) |
| No write, shell or network tool | `write_file`, `run_shell`, `http_get`, `git_push` |
| Exact arguments and types; a symbol is an identifier | an extra `mode` key; `--files-from=/etc/passwd` as a name |
| The path is resolved, symlinks too, and stays inside the repository root | `../outside`, `/etc/passwd`, a symlink to a folder outside |
| No secret file or folder, by the requested path and by the resolved path | `.git`, `.env*`, `*.pem`, `*.key`, `id_rsa*`, `credentials*`, a plain-named symlink to `.env` |
| A file is under the size limit (default 200,000 bytes) | a 300,000-byte JSON file |

## Proposals for an outside tool

A model can name a retrieval tool that is not on the list, for example a code graph server. The
policy refuses the call and keeps a proposal: the tool name and the argument keys (not the
values), with the status "for a person to review". Nothing is installed or downloaded. A person
decides whether such a tool is worth a review of its own.

## Limits

- The secret patterns are a list of names. A secret in a file with a plain name (for example a
  token written into `src/config.py`) is not found. The size limit and the root limit still hold.
- The patterns are strict: a file with "token" or "credential" in its name is refused even when
  it holds no secret.
- The check and a later read are two steps. A file changed or replaced between them (for example
  a new symlink) is not seen. A caller must open the resolved path and check it again, or run on a
  read-only checkout.
- A path that does not exist is refused as "not found"; the reason does not say whether it would
  have been inside the repository.
