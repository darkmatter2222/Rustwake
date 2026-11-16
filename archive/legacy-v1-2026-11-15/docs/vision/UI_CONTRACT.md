# UI and interaction contract

## Layout

All dimensions below are CSS px targets, not device pixels. Root occupies viewport with safe-area insets; document scroll is off. Internal long lists scroll with visible affordances. World input never passes through an open panel or modal.

Desktop >=1024px: compact top resource bar 56-64px tall, small top-right pinned objective, centered bottom toolbar 64px tall with Build/Routes/Fleet/Research/Trade/Map. Settings is a predictable top-right button. Selected-entity inspector docks right at 320-360px and camera fit uses remaining rectangle. Only one major inspector/catalog at a time. No permanent left rail or empty portrait yard centered in widescreen.

Portrait <768px: resource bar 48-56px, show 3 pinned currencies plus expandable inventory. Bottom 56-64px navigation uses labeled destinations; contextual build/route actions replace a local tray, not navigation. Inspector defaults to about 35% viewport height and can expand to about 70%; collapse returns to world. At 200% text the sheet may expand and scroll internally; never shrink text to meet geometry. All essential targets >=44x44px, separated by >=4px. Compact landscape uses side drawer and a short toolbar. Tablet uses available-width rule, not user-agent detection.

Fonts: system sans-serif, ordinary content 14-16px desktop/16px phone, secondary information >=12px; numbers tabular. No custom font download required. Flat charcoal panels with restrained borders and amber active states. No ornamental rust texture on UI. Status icons and plain text supplement color.

## Camera and selection

Desktop: left click selects; drag empty ground pans; middle drag pans; right drag or Q/E rotates; wheel zooms toward pointer; R rotates placement, Escape cancels topmost mode, Home fits useful yard. Provide visible controls for all gestures. Keyboard shortcuts do not fire in text fields. Touch: tap selects, one-finger empty-ground drag pans, pinch zooms, two-finger twist rotates, visible rotate buttons as alternative. Distinguish tap from drag by threshold before issuing commands. A canceled touch/pointer capture never purchases. Restore player camera intent across inspector toggles unless fit explicitly requested.

## Build state machine

Browse catalog -> select unlocked blueprint -> ghost placement -> inspect validity/cost -> explicit confirm -> construction -> active. Selecting is free. Ghost footprint, entrance arrow, loading bay clearances and affected routes are visible. Invalid preview remains visible with exact reason: occupied, outside owned land, unsuitable terrain, no frontage, reserved cargo area, insufficient materials. Show have/need; retain selection while player resolves shortfall. Rotation updates the whole footprint and ports. Clicking another location previews, never repeatedly purchases. Desktop optional shift-repeat placement is clearly toggled and each placement separately validated. Phone uses confirm/cancel bar, never gesture-only confirmation.

Road tool: select type -> drag orthogonal segment/polyline -> show cost, crossings and frontage -> confirm atomically. Insufficient materials or invalid segment leaves preview uncommitted. Auto-connect suggests a route with cost and consequence; it does not teleport materials. Belt ports remain directional; incompatible crossings fail with guidance.

Move: select building -> Move -> destination ghost with new routes/clearance -> confirm cost and temporary downtime. Freeze new jobs, settle or recall reserved cargo exactly once, then resume. Dismantle shows refund, inventories and affected routes; deliver recoverable contents to warehouse/overflow ledger before removing. No silent loss on full storage. Provide short undo for reversible placement if no dependent simulation work has occurred; otherwise explain why unavailable.

## Building inspector

Header: name, level, status, rename. Main: input -> output recipe, actual/potential rate with units, active batch and buffer sizes. Bottleneck section names cause and provides Focus source/route/power action. Actions: recipe, reserve policy, pause, upgrade, move, dismantle. Upgrade comparison shows current -> proposed throughput, power, capacity, cost and downtime. Branches are explicit alternatives; no cheapest-auto-purchase. Preview actual material/fleet consequences. Empty state says what is missing and offers a recovery route.

## Fleet and routes

Fleet list rows: vehicle name/type, job, cargo/capacity, fuel/charge, health and destination. Select focuses vehicle and highlights route. Detail offers assign pool, route priorities, service, upgrades and recall. Upgrading reserves a parked vehicle; cannot replace chassis mid-mission. Compare speed/load/energy/armor tradeoffs. Route inspector shows source, destination, material filter, allocated vehicles, loading time, journey time, throughput and queue cause. No unlabelled crossing-line spaghetti; selection highlights related routes and dims others.

## Remaining screens

Trade: storage/market tabs, grouped materials, quantity selector, reserve-aware maximum and exact proceeds/fees. Confirm displays total not unit price alone. Research: small readable branches, prerequisites and concrete unlocked capability; no overwhelming galaxy of nodes on day one. Map: region cards with resources, risks, route costs, active jobs and locked requirements. Defense: place defenses, inspect coverage/ammo/power, set priorities, see wave forecast and protected assets. Expedition: choose target, scout, compose convoy, preview risk and reserve supplies, dispatch once; active mission view includes extraction/retreat. Online raid preview shows exposed cargo cap, defense snapshot age and protected assets before commitment.

Return report: nonblocking summary with away duration, eligible production duration, actual gains, completed finite jobs and first bottleneck. Show once per settled absence; reopening cannot claim twice. Never interrupt five seconds of tab switching with a full-screen report. Objective coach: one short pinned goal, collapsible explanation, dismissible guidance; the map/build catalog still works when dismissed. Initial teaching highlights in-world wreck and first automation without turning the whole campaign into a mandatory button ladder.

Settings: sound/music sliders, mute, motion/flash reduction, text scale, graphics quality, camera reset, save/export/import and restart under deliberate confirmation. Import previews compatibility and backs up current save; invalid files leave state unchanged. Reset displays exact affected local/online scope. No live code/version/debug metrics in normal player HUD. Diagnostics behind a separate support page.

## State and accessibility checklist

Every relevant screen covers loading, empty, locked, unaffordable, selected, processing, blocked, maxed, error, offline/read-only and retry. Focus enters dialogs and returns to invoker; Escape/back closes one layer; selection survives ordinary tab navigation. Screen-reader entity list mirrors selectable world objects and commands. Colorblind status text, reduced motion, muted play, text zoom and safe areas are mandatory. Error copy names recovery rather than dumping internal exceptions.
