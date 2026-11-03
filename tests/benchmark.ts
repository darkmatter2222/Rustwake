import {performance} from 'node:perf_hooks';
import {initial,advance,OFFLINE_CAP} from '../src/engine.ts';
const s=initial(0);s.machines=[];for(let y=0;y<8;y++)for(let x=0;x<10;x++)s.machines.push({id:s.nextId++,kind:(['dock','sorter','smelter','fabricator','lab'] as const)[(x+y)%5],x,y,level:10,enabled:true});
const start=performance.now();advance(s,OFFLINE_CAP);console.log(JSON.stringify({machines:80,offlineHours:8,elapsedMs:Math.round(performance.now()-start),note:'Node CPU benchmark; not a mobile frame-rate claim.'}));
