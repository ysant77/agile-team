# Role bake-off results

Rows: 150 (repeat 0 = deploy setting: 150). Score = share of tasks fully passed; each role's pass rule is in DESIGN 9e. Interval = 90% bootstrap over tasks. Spread = lowest to highest score across repeats (DESIGN 9k).

## pm (8 tasks)

| Model | passed | score | 90% interval | repeats | spread | median s/task | tokens/s | peak GB | valid JSON |
|---|---|---|---|---|---|---|---|---|---|
| qwen3.8:27b | 4/8 | 50% | 25%-75% | 1 | - | 42 | 6.0 | 25.2 | 100% |

Only qwen3.8:27b has finished every task; no comparison yet.

## dev (5 tasks)

| Model | passed | score | 90% interval | repeats | spread | median s/task | tokens/s | peak GB | valid JSON |
|---|---|---|---|---|---|---|---|---|---|
| qwen3.8:27b | 5/5 | 100% | 100%-100% | 1 | - | 81 | 7.2 | 25.2 | 100% |
| devstral-small-2:24b | 4/5 | 80% | 40%-100% | 1 | - | 150 | 2.9 | 15.8 | 100% |
| gemma4:26b | 3/5 | 60% | 20%-100% | 1 | - | 46 | 16.7 | 23.6 | 80% |
| gpt-oss:20b | 2/5 | 40% | 0%-80% | 1 | - | 35 | 14.1 | 12.0 | 100% |
| qwen3-coder:30b | 2/5 | 40% | 0%-80% | 1 | - | 22 | 19.7 | 18.7 | 100% |

**No clear winner** (difference inside the noise). qwen3.8:27b minus devstral-small-2:24b: 0.20 (90% interval 0.00 to 0.60). Inside the noise: qwen3.8:27b, devstral-small-2:24b, gemma4:26b. Tie-break (smaller peak memory, then lower median latency): **devstral-small-2:24b**.

## qa (5 tasks)

| Model | passed | score | 90% interval | repeats | spread | median s/task | tokens/s | peak GB | valid JSON |
|---|---|---|---|---|---|---|---|---|---|
| gemma4:26b | 2/5 | 40% | 0%-80% | 1 | - | 53 | 15.0 | 23.6 | 100% |
| qwen3.8:27b | 2/5 | 40% | 0%-80% | 1 | - | 166 | 6.9 | 25.2 | 100% |
| devstral-small-2:24b | 1/5 | 20% | 0%-60% | 1 | - | 231 | 3.0 | 15.8 | 100% |
| gpt-oss:20b | 0/5 | 0% | 0%-0% | 1 | - | 55 | 13.8 | 12.0 | 100% |
| qwen3-coder:30b | 0/5 | 0% | 0%-0% | 1 | - | 37 | 19.6 | 18.7 | 100% |

**No clear winner** (difference inside the noise). gemma4:26b minus qwen3.8:27b: 0.00 (90% interval -0.40 to 0.40). Inside the noise: gemma4:26b, qwen3.8:27b, devstral-small-2:24b, gpt-oss:20b, qwen3-coder:30b. Tie-break (smaller peak memory, then lower median latency): **gpt-oss:20b**.

## ds (2 tasks)

| Model | passed | score | 90% interval | repeats | spread | median s/task | tokens/s | peak GB | valid JSON |
|---|---|---|---|---|---|---|---|---|---|
| gpt-oss:20b | 2/2 | 100% | 100%-100% | 1 | - | 87 | 13.0 | 12.0 | 100% |
| gemma4:26b | 2/2 | 100% | 100%-100% | 1 | - | 79 | 17.0 | 23.6 | 100% |
| qwen3.8:27b | 2/2 | 100% | 100%-100% | 1 | - | 147 | 6.3 | 25.2 | 100% |
| devstral-small-2:24b | 1/2 | 50% | 0%-100% | 1 | - | 228 | 2.8 | 15.8 | 100% |
| qwen3-coder:30b | 0/2 | 0% | 0%-0% | 1 | - | 67 | 18.1 | 18.7 | 100% |

**No clear winner** (difference inside the noise). gpt-oss:20b minus gemma4:26b: 0.00 (90% interval 0.00 to 0.00). Inside the noise: gpt-oss:20b, gemma4:26b, qwen3.8:27b, devstral-small-2:24b. Tie-break (smaller peak memory, then lower median latency): **gpt-oss:20b**.

## lead (10 tasks)

| Model | passed | score | 90% interval | repeats | spread | median s/task | tokens/s | peak GB | valid JSON |
|---|---|---|---|---|---|---|---|---|---|
| devstral-small-2:24b | 8/10 | 80% | 60%-100% | 1 | - | 44 | 3.4 | 15.8 | 100% |
| gemma4:26b | 8/10 | 80% | 60%-100% | 1 | - | 7 | 15.3 | 23.6 | 100% |
| qwen3.8:27b | 8/10 | 80% | 60%-100% | 1 | - | 34 | 6.6 | 25.2 | 100% |
| gpt-oss:20b | 7/10 | 70% | 50%-90% | 1 | - | 14 | 12.0 | 12.0 | 100% |
| qwen3-coder:30b | 4/10 | 40% | 10%-70% | 1 | - | 9 | 19.7 | 18.7 | 100% |

**No clear winner** (difference inside the noise). devstral-small-2:24b minus gemma4:26b: 0.00 (90% interval 0.00 to 0.00). Inside the noise: devstral-small-2:24b, gemma4:26b, qwen3.8:27b, gpt-oss:20b. Tie-break (smaller peak memory, then lower median latency): **gpt-oss:20b**.

## AI team lead detail

| Model | agreement | hand-off recall | invalid opinions | Brier (raw decision) |
|---|---|---|---|---|
| gpt-oss:20b | 7/10 | 4/4 | 0 | 0.268 |
| devstral-small-2:24b | 8/10 | 3/4 | 0 | 0.297 |
| gemma4:26b | 8/10 | 3/4 | 0 | 0.340 |
| qwen3-coder:30b | 6/10 | 3/4 | 2 | 0.414 |
| qwen3.8:27b | 8/10 | 3/4 | 0 | 0.217 |

## PM detail

| Model | lint findings left (mean) | valid AC lines | ungrounded numbers | rounds (mean) |
|---|---|---|---|---|
| gpt-oss:20b | 1.00 | 100% | 6 | 1.8 |
| devstral-small-2:24b | 2.50 | 88% | 12 | 2.0 |
| gemma4:26b | 0.88 | 100% | 2 | 1.9 |
| qwen3-coder:30b | 1.63 | 100% | 2 | 2.0 |
| qwen3.8:27b | 0.50 | 100% | 1 | 1.8 |

## Developer and DS detail

| Model | role | task | AC tests | full suite | outside allowlist | changed lines | note |
|---|---|---|---|---|---|---|---|
| gpt-oss:20b | dev | K1-race | true | true | - | 6 |  |
| gpt-oss:20b | dev | K1-button | true | true | - | 5 |  |
| gpt-oss:20b | dev | S09-last-day | - | - | - | - | edits: edit 1: "old" found 0 times in src/bank/ledger.py |
| gpt-oss:20b | dev | S08-yen | false | false | - | 8 |  |
| gpt-oss:20b | dev | S13-authz | false | false | - | 5 |  |
| gpt-oss:20b | ds | K7-leak | true | true | - | 0 | pr_auc 0.3928 |
| gpt-oss:20b | ds | K7-weak | true | true | - | 9 | pr_auc 0.3928 |
| devstral-small-2:24b | dev | K1-race | true | true | - | 2 |  |
| devstral-small-2:24b | dev | K1-button | true | true | - | 4 |  |
| devstral-small-2:24b | dev | S09-last-day | false | false | - | 4 |  |
| devstral-small-2:24b | dev | S08-yen | true | true | - | 0 |  |
| devstral-small-2:24b | dev | S13-authz | true | true | - | 0 |  |
| devstral-small-2:24b | ds | K7-leak | false | false | - | 5 | pr_auc undefined |
| devstral-small-2:24b | ds | K7-weak | true | true | - | 9 | pr_auc 0.3928 |
| gemma4:26b | dev | K1-race | true | true | - | 26 |  |
| gemma4:26b | dev | K1-button | true | true | - | 4 |  |
| gemma4:26b | dev | S09-last-day | true | true | - | 0 |  |
| gemma4:26b | dev | S08-yen | - | - | - | - | timeout |
| gemma4:26b | dev | S13-authz | false | false | - | 4 |  |
| gemma4:26b | ds | K7-leak | true | true | - | 0 | pr_auc 0.3928 |
| gemma4:26b | ds | K7-weak | true | true | - | 9 | pr_auc 0.3928 |
| qwen3-coder:30b | dev | K1-race | true | true | - | 2 |  |
| qwen3-coder:30b | dev | K1-button | false | false | - | 5 |  |
| qwen3-coder:30b | dev | S09-last-day | false | false | - | 4 |  |
| qwen3-coder:30b | dev | S08-yen | true | true | - | 0 |  |
| qwen3-coder:30b | dev | S13-authz | false | false | - | 2 |  |
| qwen3-coder:30b | ds | K7-leak | false | false | - | 7 | pr_auc undefined |
| qwen3-coder:30b | ds | K7-weak | true | true | - | 8 | pr_auc 0.0787 |
| qwen3.8:27b | dev | K1-race | true | true | - | 2 |  |
| qwen3.8:27b | dev | K1-button | true | true | - | 4 |  |
| qwen3.8:27b | dev | S09-last-day | true | true | - | 0 |  |
| qwen3.8:27b | dev | S08-yen | true | true | - | 0 |  |
| qwen3.8:27b | dev | S13-authz | true | true | - | 0 |  |
| qwen3.8:27b | ds | K7-leak | true | true | - | 0 | pr_auc 0.3928 |
| qwen3.8:27b | ds | K7-weak | true | true | - | 9 | pr_auc 0.3928 |
