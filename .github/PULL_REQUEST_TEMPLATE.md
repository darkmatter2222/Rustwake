## Rustwake V2 PR contract

**Linked V2 issue(s):** #___  
**Role/author session:** ___  
**Immutable head SHA:** ___  
**Previous/main baseline SHA:** ___

### Player outcome
Describe exactly what changes in the *running game*, not only code objects. For camera/UX/art changes compare to approved public/reference/approved-yard.png and docs/design tokens. For mechanics explain actual inventory, routes and player decision.

### Scope / source
Owned paths, upstream accepted dependency SHAs, source/runtime/migration/security affected. Confirm no peer branch/worktree overwritten and no old V1 UI imported.

### Reproducible evidence
| Check | Command / observed result | Device/browser/seed | Artifact URL |
|---|---|---|---|
| Typecheck/build | | | |
| Unit and negative tests | | | |
| Live production-built browser capture | | | |
| Cargo/ledger/save invariant | | | |
| Accessibility/performance/security | | | |

### Documentation and decisions
- [ ] Updated relevant canonical design/engineering docs or explicitly marked not applicable
- [ ] Updated docs/backlog/GAPS.md for changed capabilities and honest remaining debt
- [ ] Added/superseded ADR if product style, camera, money, permissions or architecture changed
- [ ] Changed/added accurate unit/visual tests, evidence exact current SHA
- [ ] No invented real-phone, project, visual acceptance or served SHA evidence

### Independent verdicts (not code author)
QA role / head SHA / APPROVE or REWORK / comment: ___  
Product role / head SHA / APPROVE or REWORK / comment: ___  
Visual reviewer/sponsor where required: ___

### Release engineer (post merge, never author)
Merged main SHA ___ / prior rollback SHA ___ / main CI run ___ / trusted delivery run ___ / receipt source_sha/status ___ / public manifest+asset hash ___ / one-browser artifact ___ / production defect links ___

A green PR job is NOT a deployed game; an operationally deployed app is NOT automatically visually accepted. Release engineer merges approved current head only; no direct main push.
