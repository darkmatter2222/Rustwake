# Start or restart the Rustwake team in OpenCode

**2026-11-07 binding flow:** Stop the previous coordinator/children, preserve existing worktrees and branches, fetch latest `main`, install the updated team-supervisor plugin, authenticate the GitHub CLI (`gh auth status`), and RESTART OpenCode to load the new persona instructions. Select `rustwake-coordinator`, run `/rustwake-team start` and then `/goal forever goal.md`. The dispatcher starts with an EMPTY execution queue; the coordinator reads open [GitHub Issues](https://github.com/darkmatter2222/Rustwake/issues), plans up to FOUR bounded children, and creates PR handoffs. Legacy local-board workflows, startup audits and direct pushes are retired. [New contract](GITHUB_WORKFLOW.md).


1. In the existing coordinator session, use `/goal stop`. Let it checkpoint and cancel/join children. If the runtime cannot confirm cancellation, stop the child sessions using its supported controls before starting another coordinator. Do not run two loops on the same checkout/server.
2. In your local Rustwake checkout, inspect `git status` and `git worktree list`. Preserve unfinished work on its own branch; do not reset or delete it. When the integration checkout is clean, run `git pull --ff-only origin main`. If it cannot fast-forward, reconcile the local commits first rather than force pulling.
3. Reopen/reload OpenCode so it loads the updated `.opencode/agents`. Keep your existing model/provider settings and MasterGoal plugin. Select **rustwake-coordinator** as the primary agent. Do not launch each role yourself.
4. **Install the companion before using `/rustwake-team bind`.** Git pull alone does not install it, and MasterGoal does not provide that command. From the local Rustwake checkout run:

   ```powershell
   npm --prefix tools/team-supervisor install --ignore-scripts
   npm --prefix tools/team-supervisor run install:local
   ```

   Fully restart OpenCode after installation, select **rustwake-coordinator**, then run `/rustwake-team bind`. If your launcher sets `OPENCODE_CONFIG`, register the companion in that active config using the existing local maintenance procedure; project config may be overridden. Keep MasterGoal and provider settings intact. An unknown command means the companion is not loaded. Use the CLI fallback while resolving loading; do not start another forever loop. Verify `/rustwake-team status`; the wait guard requires mapping the installed runtime's actual wait tools and passing its canary. See [TEAM_OPERATIONS](TEAM_OPERATIONS.md).
5. Run:

   ```text
   /goal forever goal.md
   ```

6. The coordinator reads the new goal, reconciles existing workers, validates loaded roles/async cancellation, and dispatches bounded assignments. Maximum is five active model sessions total, including itself (at most four children). It begins by reconciling real open GitHub Issues and PRs, not by replaying a fixed commissioning audit. Do not claim runtime readiness from repository tests alone.

`/goal forever` snapshots the prompt. `/goal resume` restores the prior goal after a host interruption; it does not load edited goal text. For these updates use stop then the fresh forever command, not resume or `/goal init`. These commands follow the inspected MasterGoal contract; if your installed plugin differs, inspect its local help and use its documented equivalent instead of inventing flags.

## What you can watch

- [GitHub Issues](https://github.com/darkmatter2222/Rustwake/issues) and [Pull Requests](https://github.com/darkmatter2222/Rustwake/pulls) are the live board and delivery ledger.
- Visual board: `node scripts/team-board.mjs`, then `python -m http.server 8765` from the repo and open `http://localhost:8765/work/board.html`. This is a generated snapshot; reload after new publications. It is not connected to live session APIs.
- `work/product/` for planning/decisions; `work/feedback/` for owner and simulated-player feedback; `work/releases/` and `work/deployments/` for truthful release receipts.
- [Game](https://home.darkmatter2222.com/rustwake/). README identifies the last evidenced deployed version separately from main.

No child should start another forever loop. A running host and available model are required; repository instructions do not install a background OS service. To stop, stop the coordinator goal and confirm children are joined. No hidden watchdog restarts it.


Sponsor requests go in root SPONSOR_INBOX.md. Local team should complete OPS-101/102/103 immediately alongside useful game work; do not leave setup perpetually pending. The CI/CD workflow needs a dedicated server runner and host adapter before enabling its repository variable. See AUTOMATED_DELIVERY.


## Sidebar telemetry upgrade

Companion 0.2.0 exposes the OpenCode 2 TUI entrypoint. For an existing installation, stop/checkpoint, pull main, run `npm --prefix tools/team-supervisor ci --ignore-scripts` and `npm --prefix tools/team-supervisor run install:local`, then fully restart OpenCode and bind again. Look for **RUSTWAKE TEAM** alongside MasterGoal. See README for the fields and stale-state behavior. No separate TUI plugin registration is needed.

Coordinator runtime observations must include `coordinator_session_id` matching the bound coordinator. The checkpoint utility now includes sanitized worker role/task/state rows and capacity in the ignored supervisor observation. Read real runtime state before writing it; never turn an old board snapshot into fresh telemetry.
