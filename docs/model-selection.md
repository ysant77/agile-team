# Model selection protocol for the local role bake-off

This protocol decides which open-weight model plays each team role in the local demo (developer,
QA, data scientist, PM, team lead). It is fixed before scoring. Nothing in the Forge app depends
on it; inside Jira the agents run on Rovo, where we cannot choose the model.

1. **One config.** `config/models.json` names the candidate models, their settings, the deploy
   setting (one seed) and the repeat seeds. No other file names a model; a test checks this.
2. **Same input for every model.** Prompts and generation settings are equal for every model,
   except a required reasoning level for one model family, stated in the config.
3. **Scorers are code and blind.** Each role's pass rule is code; the scorer never sees the model
   name. Code tasks run on fixed commits of the bank repository.
4. **Scorer versions.** Each row records the scorer version (team lead guards `GUARD_VERSION`, PM
   lint `LINT_VERSION`). The report ranks only rows scored under the current version; a rule change
   means a re-run, never a comparison across versions.
5. **Noise.** Per role, the report gives each model's score, a 90% bootstrap interval over tasks
   (2,000 resamples, fixed seed), and the spread of scores across repeats. The leader is a clear
   winner only when the 90% interval of its paired difference with the runner-up is above 0 and,
   when both have repeats, their spreads do not overlap.
6. **Tie-break.** Inside the noise, the model with the smaller peak memory wins, then the one with
   the lower median latency. This was fixed before any score.
7. **Partial runs.** A model that has not finished every task of a role is shown, not ranked.
8. **Re-check live.** The choice is checked again on the live scenario runs.
