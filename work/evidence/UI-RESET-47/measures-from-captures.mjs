import fs from 'node:fs';
const d='work/evidence/UI-RESET-47';
const j=JSON.parse(fs.readFileSync(d+'/captures/captures-proto.json','utf8'));
const K=['nav','band','card','insp','world','action'];
const o={source:'captures/captures-proto.json (capture-proto-47.mjs)',frames:{},overlaps:[]};
for(const c of j.captures){const r=c.rects||{};const bs=[];const B={};
 for(const k of K){const e=r[k];if(!e||!e.w||!e.h)continue;B[k]={w:e.w,h:e.h,x:e.x,y:e.y};bs.push([k,e.x,e.y,e.w,e.h]);}
 o.frames[c.file]={pressed:c.pressed,last:c.last&&c.last.id,note:c.note,bands:B};
 for(let i=0;i<bs.length;i++)for(let k=i+1;k<bs.length;k++){const A=bs[i],C=bs[k];if(A[1]<C[1]+C[3]&&C[1]<A[1]+A[3]&&A[2]<C[2]+C[4]&&C[2]<A[2]+A[4])o.overlaps.push(c.file+':'+A[0]+'x'+C[0]);}}
fs.writeFileSync(d+'/measures.json',JSON.stringify(o,null,1));
for(const [f,v] of Object.entries(o.frames)){const s=K.map(k=>v.bands[k]?k+' '+v.bands[k].w+'x'+v.bands[k].h+'@'+v.bands[k].x+','+v.bands[k].y:k+' -').join(' | ');console.log(f,'pressed='+v.pressed,'last='+v.last);console.log('  '+s);}
console.log('overlaps',JSON.stringify(o.overlaps));
