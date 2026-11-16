"""Original procedural Rustwake blockouts. Python stdlib only; no game/runtime changes.
Source of truth after first authoring: docs/vision/assets/kit.json.
Each part is a box; animated groups are non-mesh parents with local coordinates.
glTF files embed buffers; open in a compatible glTF viewer or import into engine.
"""
import json, math, struct, base64
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]; A=ROOT/'docs/vision/assets'; OUT=A/'generated'; OUT.mkdir(parents=True,exist_ok=True)
palette={'sand':'#BA8054','oxide':'#A34F32','oxideLight':'#C47746','cream':'#D6C7A3','charcoal':'#292C29','steel':'#7C8078','olive':'#777746','yellow':'#C99A35','amber':'#FFB348','rubber':'#33332F'}
assets=[]
def asset(name,footprint,description):
    a=dict(id=name,footprint=footprint,description=description,front='+Z',parts=[],groups=[],sockets=[],animations=[]); assets.append(a); return a
def box(a,name,pos,size,mat,parent='root'):
    a['parts'].append(dict(name=name,parent=parent,center=pos,size=size,material=mat))
def group(a,name,pos,parent='root'):a['groups'].append(dict(name=name,parent=parent,position=pos))
def clip(a,name,target,path,times,values,loop=False):a['animations'].append(dict(name=name,target=target,path=path,times=times,values=values,loop=loop))
def socket(a,name,pos,kind,width=1.3):a['sockets'].append(dict(name=name,position=pos,kind=kind,approach=[0,0,1],clearanceWidth=width))
def building(a,w,d,h,mat):
    box(a,'foundation',[0,.1,0],[w,.2,d],'steel')
    group(a,'structure',[0,0,0]); group(a,'roof',[0,h,0])
    box(a,'back',[0,h/2,-d/2+.15],[w-.2,h,.25],mat,'structure')
    for side in [-1,1]:box(a,'side'+str(side),[side*(w/2-.15),h/2,0],[.25,h,d-.2],mat,'structure')
    box(a,'roofBase',[0,.1,0],[w+.1,.2,d+.1],'oxide','roof')
    for side in [-1,1]:box(a,'roofStep'+str(side),[side*w*.22,.3,0],[w*.48,.25,d+.1],'oxide','roof')
    box(a,'ridge',[0,.5,0],[w*.35,.2,d+.1],'oxideLight','roof')
    clip(a,'assemble_structure','structure','scale',[0,.6,2.8,5],[[1,.001,1],[1,.001,1],[1,1,1],[1,1,1]])
    clip(a,'assemble_roof','roof','translation',[0,2.8,3.8,5],[[0,.2,0],[0,.2,0],[0,h,0],[0,h,0]])
w=asset('warehouse',[6,4],'Cream warehouse, two unobstructed front bays, stepped oxide roof. Doors lift independently.'); building(w,6,4,2.2,'cream')
box(w,'frontLintel',[0,2.0,1.85],[5.8,.4,.25],'cream','structure');box(w,'centerPier',[0,1.0,1.85],[.35,2,.25],'cream','structure')
for i,x in enumerate([-1.55,1.55]):
 group(w,f'door{i}',[x,1.0,1.85]);box(w,f'doorPanel{i}',[0,0,0],[2.2,1.7,.12],'yellow',f'door{i}');socket(w,f'bay{i}',[x,0,2.15],'truck',2.2)
 clip(w,f'door{i}_open',f'door{i}','translation',[0,1.2],[[x,1,1.85],[x,2.7,1.85]])
a=asset('depot',[4,4],'Yellow garage with wide front opening and simple tool sign.');building(a,4,4,2.2,'yellow');socket(a,'serviceBay',[0,0,2.2],'truck',3.2);box(a,'lintel',[0,2,1.85],[3.8,.4,.2],'cream','structure')
a=asset('sorter',[3,3],'Olive hopper with short dark belt emerging at front.');box(a,'body',[0,.8,-.3],[2.4,1.6,1.8],'olive');box(a,'hopper',[0,1.8,-.3],[2.6,.4,2],'yellow');box(a,'belt',[0,.6,1.1],[1,.2,1.6],'rubber');group(a,'roller',[0,.6,1.3]);box(a,'rollerMesh',[0,0,0],[1,.18,.18],'steel','roller');socket(a,'output',[0,0,1.6],'belt',1);clip(a,'roller_work','roller','rotation',[0,1,2],[[0,0,0,1],[1,0,0,0],[0,0,0,-1]],True)
a=asset('furnace',[3,3],'Oxide furnace with open amber mouth and single tall chimney.');box(a,'base',[0,.15,0],[3,.3,3],'steel');box(a,'back',[0,1.05,-.7],[2.5,1.8,1.1],'oxide');box(a,'left',[-.9,.85,.4],[.5,1.4,1.5],'oxide');box(a,'right',[.9,.85,.4],[.5,1.4,1.5],'oxide');box(a,'lintel',[0,1.6,.4],[2.3,.4,1.5],'oxide');box(a,'glow',[0,.45,.55],[1.2,.25,1.1],'amber');box(a,'chimney',[.65,2.4,-.65],[.55,2,.55],'oxide');group(a,'intakeDoor',[0,1.0,1.2]);box(a,'door',[0,0,0],[1.3,.9,.12],'steel','intakeDoor');socket(a,'input',[0,0,1.7],'pallet');clip(a,'intake','intakeDoor','translation',[0,.6,1.4,2],[[0,1,1.2],[0,1.9,1.2],[0,1.9,1.2],[0,1,1.2]])
a=asset('generator',[2,2],'Olive generator with visible cream fan in charcoal frame.');box(a,'housing',[0,.65,0],[1.7,1.3,1.6],'olive');box(a,'fanFrame',[0,.75,.84],[1,1,.12],'charcoal');group(a,'fan',[0,.75,.93]);box(a,'fanX',[0,0,0],[.8,.12,.08],'cream','fan');box(a,'fanY',[0,0,0],[.12,.8,.08],'cream','fan');clip(a,'fan_powered','fan','rotation',[0,.85,1.7],[[0,0,0,1],[0,0,1,0],[0,0,0,-1]],True)
a=asset('crane',[3,3],'Yellow crane with rotating upper assembly, boom and vertical hoist.');box(a,'base',[0,.3,0],[2.2,.6,2.2],'steel');group(a,'slew',[0,.6,0]);box(a,'tower',[0,1,0],[.8,2,.8],'yellow','slew');box(a,'boom',[1,2,0],[3,.3,.4],'yellow','slew');group(a,'hoist',[2.2,1.2,0],'slew');box(a,'cable',[0,.5,0],[.06,1,.06],'charcoal','hoist');box(a,'grip',[0,0,0],[.5,.2,.5],'steel','hoist');clip(a,'hoist_lift','hoist','translation',[0,1.8],[[2.2,.4,0],[2.2,1.2,0]])
a=asset('truck',[1,3],'Cream cab, oxide cargo bed, six chunky wheels. Forward +Z.');box(a,'chassis',[0,.35,0],[.9,.2,2.5],'charcoal');box(a,'cab',[0,.85,.75],[1,.9,.85],'cream');box(a,'windshield',[0,1,.96],[.78,.3,.05],'charcoal');box(a,'bed',[0,.65,-.45],[1,.2,1.5],'oxide');group(a,'cargo',[0,.8,-.45]);box(a,'pallet',[0,.2,0],[.8,.4,1.1],'steel','cargo')
for side in [-1,1]:
 for i,z in enumerate([.8,-.4,-.95]):
  n=f'wheel_{side}_{i}';group(a,n,[side*.5,.3,z]);box(a,n+'Mesh',[0,0,0],[.18,.5,.5],'rubber',n);clip(a,n+'_roll',n,'rotation',[0,.5,1],[[0,0,0,1],[1,0,0,0],[0,0,0,-1]],True)
socket(a,'cargo',[0,.8,-.45],'cargo',.8)
a=asset('forklift',[1,2],'Yellow compact forklift with separate mast lift and two forks.');box(a,'body',[0,.45,-.3],[.9,.7,1.1],'yellow');box(a,'mast',[0,1,.5],[.8,2,.15],'charcoal');group(a,'lift',[0,.25,.6]);box(a,'crossbar',[0,0,0],[.8,.15,.15],'steel','lift')
for x in [-.25,.25]:box(a,'fork'+str(x),[x,-.05,.4],[.12,.1,.9],'steel','lift')
clip(a,'lift_pallet','lift','translation',[0,1.4],[[0,.25,.6],[0,1.2,.6]])
a=asset('drone',[1,1],'Yellow four-rotor cargo drone, crate attached under center.');box(a,'body',[0,.4,0],[.6,.25,.6],'yellow');box(a,'armX',[0,.45,0],[1.4,.1,.12],'charcoal');box(a,'armZ',[0,.45,0],[.12,.1,1.4],'charcoal')
for i,(x,z) in enumerate([(-.6,0),(.6,0),(0,-.6),(0,.6)]):
 group(a,f'rotor{i}',[x,.55,z]);box(a,f'blade{i}',[0,0,0],[.5,.04,.08],'cream',f'rotor{i}');clip(a,f'rotor{i}_spin',f'rotor{i}','rotation',[0,.15,.3],[[0,0,0,1],[0,1,0,0],[0,0,0,-1]],True)
box(a,'cargo',[0,.05,0],[.45,.35,.45],'steel');socket(a,'hook',[0,-.15,0],'cargo',.45)
a=asset('worker',[1,1],'Hardhat worker; simple limb groups for walk/carry, 0.85 units tall.');box(a,'torso',[0,.48,0],[.25,.3,.18],'oxideLight');box(a,'head',[0,.73,0],[.18,.18,.18],'cream');box(a,'helmet',[0,.84,0],[.25,.08,.23],'yellow')
for side in [-1,1]:
 group(a,f'leg{side}',[side*.07,.32,0]);box(a,f'legMesh{side}',[0,-.14,0],[.09,.28,.1],'charcoal',f'leg{side}');group(a,f'arm{side}',[side*.17,.6,0]);box(a,f'armMesh{side}',[0,-.12,0],[.08,.24,.09],'cream',f'arm{side}')
clip(a,'walk_leg','leg1','rotation',[0,.35,.7],[[.25,0,0,math.sqrt(1-.25**2)],[-.25,0,0,math.sqrt(1-.25**2)],[.25,0,0,math.sqrt(1-.25**2)]],True)
a=asset('turret',[2,2],'Olive kinetic defense turret with separate yaw mount and pitch barrel.');box(a,'base',[0,.2,0],[1.8,.4,1.8],'steel');group(a,'yaw',[0,.6,0]);box(a,'housing',[0,.2,0],[1,.6,1],'olive','yaw');group(a,'pitch',[0,.3,.35],'yaw');box(a,'barrel',[0,0,.6],[.25,.25,1.3],'charcoal','pitch');clip(a,'scan','yaw','rotation',[0,2,4],[[0,-.25,0,math.sqrt(1-.25**2)],[0,.25,0,math.sqrt(1-.25**2)],[0,-.25,0,math.sqrt(1-.25**2)]],True)
a=asset('wall_gate',[3,1],'Original modular wall gate; friendly road passage opens center.');box(a,'left',[-1.2,.7,0],[.6,1.4,.5],'oxide');box(a,'right',[1.2,.7,0],[.6,1.4,.5],'oxide');group(a,'gate',[0,.65,0]);box(a,'panel',[0,0,0],[1.8,1.3,.18],'steel','gate');clip(a,'gate_open','gate','translation',[0,1.2],[[0,.65,0],[0,2,0]]);socket(a,'passage',[0,0,.7],'road',1.8)
kitpath=A/'kit.json'
if not kitpath.exists():kitpath.write_text(json.dumps(dict(schemaVersion=1,units='world units; 1 unit = 1 cell, conceptual 2m',axes='right handed Y-up; forward +Z',detailQuantum=.125,palette=palette,assets=assets),indent=2)+'\n')
kit=json.loads(kitpath.read_text());palette=kit['palette'];assets=kit['assets']
# Shared hard-normal cube, 24 vertices and 36 indices, one primitive per material.
faces=[([1,0,0],[(.5,-.5,-.5),(.5,.5,-.5),(.5,.5,.5),(.5,-.5,.5)]),([-1,0,0],[(-.5,-.5,.5),(-.5,.5,.5),(-.5,.5,-.5),(-.5,-.5,-.5)]),([0,1,0],[(-.5,.5,-.5),(-.5,.5,.5),(.5,.5,.5),(.5,.5,-.5)]),([0,-1,0],[(-.5,-.5,.5),(-.5,-.5,-.5),(.5,-.5,-.5),(.5,-.5,.5)]),([0,0,1],[(-.5,-.5,.5),(.5,-.5,.5),(.5,.5,.5),(-.5,.5,.5)]),([0,0,-1],[(.5,-.5,-.5),(-.5,-.5,-.5),(-.5,.5,-.5),(.5,.5,-.5)])]
for a in assets:
 buf=bytearray();views=[];acc=[]
 def accessor(vals,kind,component=5126,limits=False):
  while len(buf)%4:buf.append(0)
  flat=[v for row in vals for v in row] if isinstance(vals[0],(tuple,list)) else vals
  start=len(buf);buf.extend(struct.pack('<'+('f' if component==5126 else 'H')*len(flat),*flat));vi=len(views);views.append(dict(buffer=0,byteOffset=start,byteLength=len(buf)-start))
  d=dict(bufferView=vi,componentType=component,count=len(vals),type=kind)
  if limits:
   arr=vals if isinstance(vals[0],(tuple,list)) else [[v] for v in vals];d['min']=[min(x) for x in zip(*arr)];d['max']=[max(x) for x in zip(*arr)]
  acc.append(d);return len(acc)-1
 pos=accessor([v for n,vs in faces for v in vs],'VEC3',limits=True);norm=accessor([n for n,vs in faces for v in vs],'VEC3');idx=accessor([f*4+i for f in range(6) for i in [0,1,2,0,2,3]],'SCALAR',5123)
 mats=[];meshes=[]
 for key,h in palette.items():
  rgb=[int(h[i:i+2],16)/255 for i in (1,3,5)]
  # glTF baseColorFactor is linear; author palette uses sRGB.
  rgb=[x/12.92 if x<=.04045 else ((x+.055)/1.055)**2.4 for x in rgb]
  mats.append(dict(name=key,pbrMetallicRoughness=dict(baseColorFactor=rgb+[1],metallicFactor=0,roughnessFactor=1)))
  meshes.append(dict(name='box_'+key,primitives=[dict(attributes={'POSITION':pos,'NORMAL':norm},indices=idx,material=len(mats)-1)]))
 nodes=[dict(name=a['id'],children=[],extras=dict(footprint=a['footprint'],sockets=a['sockets']))];ids={'root':0}
 for g in a['groups']:
  ids[g['name']]=len(nodes);nodes.append(dict(name=g['name'],translation=g['position'],children=[]));nodes[ids[g['parent']]]['children'].append(ids[g['name']])
 for p in a['parts']:
  node=dict(name=p['name'],mesh=list(palette).index(p['material']),translation=p['center'],scale=p['size']);nodes[ids[p['parent']]]['children'].append(len(nodes));nodes.append(node)
 animations=[]
 for c in a['animations']:
  times=accessor(c['times'],'SCALAR',limits=True);values=accessor(c['values'],'VEC4' if c['path']=='rotation' else 'VEC3')
  animations.append(dict(name=c['name'],samplers=[dict(input=times,output=values,interpolation='LINEAR')],channels=[dict(sampler=0,target=dict(node=ids[c['target']],path=c['path']))],extras=dict(loop=c['loop'],note='Presentation sample; production controller binds to simulation state')))
 gltf=dict(asset=dict(version='2.0',generator='Rustwake original procedural vision kit'),scene=0,scenes=[dict(nodes=[0])],nodes=nodes,meshes=meshes,materials=mats,buffers=[dict(byteLength=len(buf),uri='data:application/octet-stream;base64,'+base64.b64encode(buf).decode())],bufferViews=views,accessors=acc,animations=animations,extras=dict(status='reference-blockout-not-production-accepted'))
 (OUT/(a['id']+'.gltf')).write_text(json.dumps(gltf,separators=(',',':'))+'\n')
manifest={'schemaVersion':1,'status':'original procedural references; not shipped production art','assets':[dict(id=a['id'],recipe='kit.json',gltf='generated/'+a['id']+'.gltf',footprint=a['footprint'],parts=len(a['parts']),clips=[x['name'] for x in a['animations']],status='blockout') for a in assets],'additionalRequired':['copperSeparator','polymerRecycler','wireMill','platePress','circuitAssembler','signalLab','batteryWorkshop','fuelRefinery','railTerminal','repairStation','arcTurret','mortar','scavengerEnemy','armoredCrawlerEnemy','sapperEnemy','scoutCar','armoredHauler','outpostRelay','bridge','beltRamp','cargoPallet','ammoCrate','roadStraight','roadCorner','roadJunction','terrainShrub','wreckSections'],'productionAcceptance':'V01 V04 V05 V06; actual rendered review required'}
(A/'asset-manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
print(f'Generated {len(assets)} original glTF blockouts and manifest from kit.json')
