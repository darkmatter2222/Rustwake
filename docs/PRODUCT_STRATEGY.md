# Evolving product strategy

## Stable essence, flexible design

Rustwake is a mobile web strategy-idle salvage and industry game. Recover scrap/metals, turn them into useful machines, automate, prepare expeditions/defense and expand. React remains the UI foundation; rendering and deterministic simulation must remain efficient. No page scrolling or consumer-dashboard framing. Offline progress, readable choices and save compatibility matter. The art is industrial pixel/cyberpunk, with coherent silhouette, lighting and material texture. Preserve those pillars while changing mechanics, progression and layout freely through tested hypotheses.

The detailed older GAME_DESIGN is an option inventory. It is not a requirement to implement every currency, faction and prestige layer before the game is enjoyable. No new online service, purchases or PvP until a strong local loop justifies them. Later monetization favors cosmetics and transparent optional value; protect competitive fairness and do not make basic enjoyment deliberately miserable to sell relief.

## Current hypotheses to test, not facts

1. **Choices beat a bottom-button checklist.** A scarce resource should have competing useful allocations. Example prototype: spend recovered alloys on throughput now, energy efficiency for longer unattended runs, or salvage quality for rare inputs. Each must have a context where it helps; a single dominant upgrade order is a failed experiment.
2. **Automation needs policies and consequences.** A player can set priorities or allocations, watch a bottleneck emerge, and revise a plan. More mandatory taps is not depth. A decision should change flow or risk, not only increase a number.
3. **The yard needs authored visual identity.** A composed opening wreck, distinct machinery and readable material movement may deliver more value than another resource type. Judge actual scenes at phone zoom before scaling the asset set.
4. **Idle and active play complement each other.** Brief visits allow meaningful planning; leaving the game does not require babysitting or cause unbounded losses. Active intervention can help without making every idle strategy futile.
5. **Challenge gives production a purpose.** Later expedition loadouts, environmental hazards and PvE waves can ask for different production plans. Asynchronous PvP must not allow offline base destruction or paid dominance.

## First outcome sprint: “I choose a plan; my yard comes alive”

Select one gameplay decision and one art direction slice. Do not simultaneously build combat, factions, prestige and a backend. Start with baseline playtest and a technical feasibility check; product owner can revise the concrete experiment based on current source.

Strategy test protocol:
- Same fresh save/seed, resource budget and simulated time. Record exact candidate, input sequence and offline interval.
- Run a naive policy: repeat the prominent bottom action whenever available. Run at least two deliberate policies with distinct goals. Use actual interaction or a faithful simulation harness and label which.
- Record choices encountered, tradeoffs understood, production/bottlenecks, outcome differences, actions required and recovery from a poor choice. Do not fabricate arbitrary win percentages.
- Accept a prototype only when at least two plans are useful in different documented conditions, the UI explains costs/consequences before choosing, and blind tapping does not silently choose the entire plan. A tutorial can be linear before this first fork.
- Idle players can resume without a punishment spiral. Respec or reversible policy changes permit learning. Save/reload and offline catch-up preserve the chosen policy.
- Product sets numerical experiment thresholds before the run if necessary; QA verifies implementation, player reports comprehension, product decides keep/revise/revert. Do not call three agent runs representative market research.

Presentation test protocol:
- Capture the exact same opening and mature scenarios before/after, portrait 360/390/412 and desktop; include enlarged text and a short in-game clip.
- Inspect screenshots directly: focal point, recognizable wreck, useful screen occupancy, material detail, coherent light, machinery identity without labels, legible resources and controls. One added pixel or higher mask distance is not a quality milestone.
- Develop a small coherent asset set with editable source and provenance. Use available graphics tools or deliberate authored pixel art; no tool/model availability excuses indefinite primitive placeholders.
- Inspect assets in the game, not just a giant sprite sheet. Reject blank/duplicate captures; generated concept art alone is not shipped art.
- Listen to a representative mix through supported analysis/listening, not the owner's speakers. Technical mix checks remain separate from subjective sound quality. If listening unavailable, record it and continue other improvements without claiming an audio pass.

## Evolving roadmap and evidence

Product owner updates this file when a hypothesis is tested or replaced, with decision link and expected player benefit. Preserve the previous conclusion in a dated decision record. Reprioritize after owner feedback, actual playtest failure, deployment incidents or three releases. Retain successful ideas, delete unnecessary complexity and park speculative features in the backlog with revisit triggers.

Never optimize only metrics that are easiest for an agent to count. Bundle budgets include all loaded chunks, sprites/audio and loading behavior; splitting JS does not reduce total bytes. Performance targets reflect measured mobile interaction and frame costs, not a sacred historical byte ceiling. A new budget must be justified before implementation and reviewed for actual performance, not merely made large enough to pass.
