# Text-readable asset kit

These are original procedural blockouts, not final accepted art. The approved yard image remains the style anchor; the supplemental sheet clarifies families. No outside game assets were copied. The recipes are sufficient for a non-vision agent to reconstruct sizes, named components, pivots, sockets and example animation.

Run `python scripts/build-vision-assets.py` from repo root. It creates `kit.json` only on first authoring; subsequent runs read that source and regenerate embedded-buffer glTFs and manifest. Edit kit.json for durable asset changes. The sample generator uses boxes and shared material meshes intentionally. It is a reference generator, not a game renderer or a final optimization pipeline.

Coordinates: Y up, +Z frontage, footprint centered at y=0, dimensions in world units. Box centers are local to named parent group. Groups declare local translation and can nest. Animation values replace the target group's translation/rotation/scale; glTF quaternion order XYZW. Clip loop intent is in extras; glTF players must explicitly select compatible clips. Assembly clips can run together; working clips run only when matching simulation state. Do not play every clip simultaneously.

Warehouse door clips demonstrate bay movement; truck wheels demonstrate rolling; forklift mast demonstrates loading; crane hoist demonstrates lifting; generator fan and drone rotors demonstrate continuous work; turret demonstrates yaw; gate demonstrates passage. These are sample channels, not complete gameplay animation coverage. Worker example animates one leg to show pivot contract; implement a coordinated walk/carry rig in T15/T29. Drone flight height is entity transform, not baked into geometry. Road sockets need production clearance validation.

`asset-manifest.json` lists delivered blockouts and additional production assets. AdditionalRequired entries are backlog scope, not falsely marked complete. Production author must add model/LOD/collision/pivots/clips/license/provenance, render all cardinal views and obtain capable visual review. Economy quantities never derive from mesh count. A single pallet may represent aggregated cargo with explicit quantity.

## Schema summary

kit.schemaVersion=1; palette maps token to #RRGGBB sRGB. assets[] has unique id, integer footprint [width,depth], description, front, groups[], parts[], sockets[], animations[]. Each part: name,parent,center[3],size[3]>0,material. Each group: name,parent,position[3]. Socket: name,position[3],kind,approach[3],clearanceWidth. Animation: name,target(group),path(translation/rotation/scale),strictly increasing times,matching values,loop. Root is implicit. Parent references precede children. All values finite. No external texture files or network dependencies.
