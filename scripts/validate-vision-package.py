"""Validate authored roadmap and portable reference assets, not the future game."""
from pathlib import Path
import json,base64,struct,math,re,hashlib,subprocess
R=Path(__file__).resolve().parents[1];D=R/'docs/vision'
p=json.loads((D/'backlog.json').read_text()); m=json.loads((D/'issue-map.json').read_text());tasks={x['key']:x for x in p['tasks']}
assert len(tasks)==58 and set(tasks)==set(m['tasks'])
seen=set();visiting=set()
def visit(k):
 assert k in tasks
 if k in seen:return
 assert k not in visiting, ('cycle',k)
 visiting.add(k)
 for dep in tasks[k]['depends_on']:visit(dep)
 visiting.remove(k);seen.add(k)
for k in tasks:visit(k)
checks=set(re.findall(r'\| ([VUEDNPR]\d\d) \|',(D/'ACCEPTANCE.md').read_text()))
for t in tasks.values():
 assert set(t['checks'])<=checks,(t['key'],t['checks'])
 assert (D/t['spec']).exists()
 assert len(t['acceptance'])>=3
assert len(set(x['number'] for x in m['tasks'].values()))==58
kit=json.loads((D/'assets/kit.json').read_text())
for a in kit['assets']:
 names={'root'}
 for g in a['groups']:
  assert g['parent'] in names and g['name'] not in names;names.add(g['name'])
 for part in a['parts']:
  assert part['parent'] in names and part['name'] not in names;names.add(part['name'])
  assert all(x>0 and math.isfinite(x) for x in part['size'])
  assert part['material'] in kit['palette']
 for c in a['animations']:
  assert c['target'] in names and len(c['times'])==len(c['values'])
  assert all(y>x for x,y in zip(c['times'],c['times'][1:]))
  if c['path']=='rotation':assert all(abs(sum(x*x for x in v)-1)<1e-5 for v in c['values'])
for f in (D/'assets/generated').glob('*.gltf'):
 g=json.loads(f.read_text());b=base64.b64decode(g['buffers'][0]['uri'].split(',')[1]);assert len(b)==g['buffers'][0]['byteLength']
 for v in g['bufferViews']:assert v['byteOffset']%4==0 and v['byteOffset']+v['byteLength']<=len(b)
 def values(i):
  a=g['accessors'][i];v=g['bufferViews'][a['bufferView']];n={'SCALAR':1,'VEC3':3,'VEC4':4}[a['type']];fmt={5126:'f',5123:'H'}[a['componentType']];start=v['byteOffset']+a.get('byteOffset',0);size=struct.calcsize(fmt)*n*a['count'];assert start+size<=v['byteOffset']+v['byteLength'];z=struct.unpack_from('<'+fmt*n*a['count'],b,start);return [z[j:j+n] for j in range(0,len(z),n)]
 for i in range(len(g['accessors'])):assert all(math.isfinite(x) for row in values(i) for x in row)
 prim=g['meshes'][0]['primitives'][0];pos=values(prim['attributes']['POSITION']);norm=values(prim['attributes']['NORMAL']);ix=[x[0] for x in values(prim['indices'])]
 for j in range(0,len(ix),3):
  i0,i1,i2=ix[j:j+3];u=[pos[i1][k]-pos[i0][k] for k in range(3)];v=[pos[i2][k]-pos[i0][k] for k in range(3)];cross=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]];assert sum(cross[k]*norm[i0][k] for k in range(3))>0
 for anim in g.get('animations',[]):
  for c in anim['channels']:assert c['target']['node']<len(g['nodes'])
 # All output data must use embedded buffers only.
 assert g['buffers'][0]['uri'].startswith('data:')
files=sorted((D/'assets/generated').glob('*.gltf'))+[D/'assets/asset-manifest.json']
before={f:hashlib.sha256(f.read_bytes()).hexdigest() for f in files}
subprocess.run(['python',str(R/'scripts/build-vision-assets.py')],check=True)
assert before=={f:hashlib.sha256(f.read_bytes()).hexdigest() for f in files},'generation not reproducible'
for f in list(D.glob('*.md'))+[R/'AGENTS.md',R/'QWEN.md']:
 for target in re.findall(r'\]\(([^)]+)\)',f.read_text()):
  if not target.startswith(('https:','http:','#')):assert (f.parent/target.split('#')[0]).exists(),(f,target)
print(f'PASS: {len(tasks)} tasks; acyclic dependencies; {len(checks)} acceptance IDs; 12 glTF assets, buffer bounds, winding, quaternion and deterministic generation checks; document links')
