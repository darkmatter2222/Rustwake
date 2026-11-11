// Derive measures.json from the committed prototype receipt (no browser needed).
// Run from the worktree root after capture-proto-47.mjs:
//   node work/evidence/UI-RESET-47/measures-from-captures.mjs
// clipOK = no horizontal document overflow AND the status cluster's right edge stays inside the
// measured viewport width; facesUnder44 counts painted faces below the 44 px tap target.
import fs from 'node:fs';
const d='work/evidence/UI-RESET-47';
const j=JSON.parse(fs.readFileSync(d+'/captures/captures-proto.json','utf8'));
const K=['nav','band','card','insp','world','action'];
const o={source:'captures/captures-proto.json (capture-proto-47.mjs)',headSha:j.headSha,headShaConvention:j.headShaConvention,frames:{},overlaps:[]};
for(const c of j.captures){const r=c.rects||{};const bs=[];const B={};
 for(const k of K){const e=r[k];if(!e||!e.w||!e.h)continue;B[k]={w:e.w,h:e.h,x:e.x,y:e.y};bs.push([k,e.x,e.y,e.w,e.h]);}
 const ds=c.docScroll||[null,null,null,null];
 const vw=ds[1];
 const cl=r.cluster;
 const clusterRight=cl?cl.x+cl.w:null;
 const clipOK=ds[0]!==null&&vw!==null&&ds[0]<=vw&&(clusterRight===null||clusterRight<=vw);
 o.frames[c.file]={pressed:c.pressed,last:c.last&&c.last.id,note:c.note,bands:B,viewportWidth:vw,clusterRight,clipOK,faces:c.faces?c.faces.length:null,facesUnder44:c.facesUnder44??null};
 for(let i=0;i<bs.length;i++)for(let k=i+1;k<bs.length;k++){const A=bs[i],C=bs[k];if(A[1]<C[1]+C[3]&&C[1]<A[1]+A[3]&&A[2]<C[2]+C[4]&&C[2]<A[2]+A[4])o.overlaps.push(c.file+':'+A[0]+'x'+C[0]);}}
o.summary={frames:Object.keys(o.frames).length,clipOK:Object.values(o.frames).filter(f=>f.clipOK).length,facesUnder44:Object.values(o.frames).reduce((a,f)=>a+(f.facesUnder44||0),0),overlaps:o.overlaps.length};
fs.writeFileSync(d+'/measures.json',JSON.stringify(o,null,1));
for(const [f,v] of Object.entries(o.frames)){const s=K.map(k=>v.bands[k]?k+' '+v.bands[k].w+'x'+v.bands[k].h+'@'+v.bands[k].x+','+v.bands[k].y:k+' -').join(' | ');console.log(f,'pressed='+v.pressed,'last='+v.last,'clipOK='+v.clipOK,'clusterRight='+v.clusterRight+'/'+v.viewportWidth,'facesUnder44='+v.facesUnder44);console.log('  '+s);}
console.log('overlaps',JSON.stringify(o.overlaps));
console.log('summary',JSON.stringify(o.summary));
