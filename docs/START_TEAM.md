# Start or restart the Rustwake team in OpenCode

1. In the existing coordinator session, use `/goal stop`. Let it checkpoint and cancel/join children. If the runtime cannot confirm cancellation, stop the child sessions using its supported controls before starting another coordinator. Do not run two loops on the same checkout/server.
2. In your local Rustwake checkout, inspect `git status` and `git worktree list`. Preserve unfinished work on its own branch; do not reset or delete it. When the integration checkout is clean, run `git pull --ff-only origin main`. If it cannot fast-forward, reconcile the local commits first rather than force pulling.
3. Reopen/reload OpenCode so it loads the updated `.opencode/agents`. Keep your existing model/provider settings and MasterGoal plugin. Select **rustwake-coordinator** as the primary agent. Do not launch each role yourself.
4. Run:

   ```text
   /goal forever goal.md
   ```

5. The coordinator reads the new goal, reconciles existing workers, validates loaded roles/async cancellation, and dispatches bounded assignments. Maximum is four active model sessions total, including itself. It begins with owner feedback, baseline playtesting, product planning and fresh visual evidence.

`/goal forever` snapshots the prompt. `/goal resume` restores the prior goal after a host interruption; it does not load edited goal text. For these updates use stop then the fresh forever command, not resume or `/goal init`. These commands follow the inspected MasterGoal contract; if your installed plugin differs, inspect its local help and use its documented equivalent instead of inventing flags.

## What you can watch

- GitHub [published board](../work/BOARD.md), linked from README.
- Visual board: `node scripts/team-board.mjs`, then `python -m http.server 8765` from the repo and open `http://localhost:8765/work/board.html`. This is a generated snapshot; reload after new publications. It is not connected to live session APIs.
- `work/product/` for planning/decisions; `work/feedback/` for owner and simulated-player feedback; `work/releases/` and `work/deployments/` for truthful release receipts.
- [Game](https://home.darkmatter2222.com/rustwake/). README identifies the last evidenced deployed version separately from main.

No child should start another forever loop. A running host and available model are required; repository instructions do not install a background OS service. To stop, stop the coordinator goal and confirm children are joined. No hidden watchdog restarts it.
