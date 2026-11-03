import {useEffect,useRef} from 'react';
import {BLUEPRINTS,type Kind,type State} from './engine';
const CELL=64,OX=80,OY=64;
function rect(c:CanvasRenderingContext2D,x:number,y:number,w:number,h:number,color:string){c.fillStyle=color;c.fillRect(Math.round(x),Math.round(y),w,h);}
function machine(c:CanvasRenderingContext2D,kind:Kind,x:number,y:number,t:number,enabled:boolean){
 const color=enabled?BLUEPRINTS[kind].color:'#59626a';
 rect(c,x+6,y+12,52,45,'#090f15');rect(c,x+4,y+6,50,44,'#313f49');rect(c,x+4,y+6,50,4,'#60717a');rect(c,x+8,y+12,42,32,'#1c2831');
 if(kind==='dock'){rect(c,x+12,y+17,34,23,'#384c58');rect(c,x+16,y+20,26,16,'#16252b');for(let i=0;i<3;i++)rect(c,x+17+i*9,y+40,5,3,color);rect(c,x+12,y+13,34,3,color);}
 if(kind==='sorter'){for(let i=0;i<4;i++){rect(c,x+10,y+16+i*7,38,4,'#5b6c72');rect(c,x+13+((t*12+i*9)%25),y+16+i*7,5,3,color);}rect(c,x+9,y+8,8,5,color);}
 if(kind==='smelter'){rect(c,x+17,y-4,12,18,'#44525c');rect(c,x+16,y-5,14,4,'#65747a');rect(c,x+14,y+20,29,22,'#452c26');rect(c,x+17,y+24,23,15,enabled?'#c35b36':'#4d4b49');rect(c,x+21,y+29,15,8,enabled?'#ffc17c':'#666');for(let i=0;i<3;i++)rect(c,x+19+i*7,y+21,3,21,'#33343a');if(enabled){for(let i=0;i<3;i++){const age=(t*0.5+i/3)%1;rect(c,x+19+Math.sin(age*5+i)*5,y-7-age*24,6+Math.floor(age*5),5,'#35414a');}}}
 if(kind==='fabricator'){rect(c,x+12,y+17,30,22,'#333450');rect(c,x+16,y+22,21,12,color);rect(c,x+21,y+24,10,8,'#273441');rect(c,x+38,y+13,6,25,'#78818d');rect(c,x+20,y+13,24,5,'#88909a');}
 if(kind==='lab'){rect(c,x+12,y+16,32,25,'#253d51');rect(c,x+16,y+20,24,13,color);rect(c,x+19,y+23,18,7,'#233341');for(let i=0;i<3;i++)rect(c,x+17+i*8,y+37,3,2,color);rect(c,x+44,y+1,3,22,'#8799a5');rect(c,x+39,y+2,13,3,color);}
 rect(c,x+8,y+46,6,3,color);rect(c,x+43,y+46,6,3,'#6c7c85');
}
export function Yard({get,selected,placing,onPlot,lowMotion}:{get:()=>State;selected:number|null;placing:Kind|null;onPlot:(x:number,y:number)=>void;lowMotion:boolean}){
 const ref=useRef<HTMLCanvasElement>(null);const stats=useRef<HTMLSpanElement>(null);const live=useRef({selected,placing,lowMotion});live.current={selected,placing,lowMotion};
 useEffect(()=>{const canvas=ref.current!,c=canvas.getContext('2d',{alpha:false})!;let frame=0,last=0,frames=0,stamp=performance.now();let disposed=false;
 const draw=(now:number)=>{if(disposed)return;frame=requestAnimationFrame(draw);const interval=live.current.lowMotion?250:1000/30;if(document.hidden||now-last<interval)return;last=now;frames++;if(now-stamp>1000){if(stats.current)stats.current.textContent=`${Math.round(frames*1000/(now-stamp))} FPS`;stamp=now;frames=0;}
 const t=live.current.lowMotion?0:now/1000,s=get();c.imageSmoothingEnabled=false;
 rect(c,0,0,800,640,'#111b23');
 // Repeatable, fixed-cost ground details. No per-frame random allocations.
 for(let y=0;y<20;y++)for(let x=0;x<25;x++){const v=(x*17+y*31)%11;rect(c,x*32,y*32,31,31,v<3?'#142029':'#15222b');if(v===1)rect(c,x*32+8,y*32+13,3,2,'#26343b');}
 // Perimeter service lanes and hazard edging.
 rect(c,52,40,696,556,'#202c33');rect(c,64,52,672,532,'#111d25');
 for(let i=0;i<28;i++){rect(c,64+i*24,42,10,4,'#8b7147');rect(c,64+i*24,592,10,4,'#8b7147');}
 for(let y=0;y<8;y++)for(let x=0;x<10;x++){rect(c,OX+x*CELL,OY+y*CELL,62,62,(x+y)%2?'#1a2932':'#1c2b34');rect(c,OX+x*CELL+4,OY+y*CELL+4,2,2,'#3c4b50');}
 // Decorative backbone of the shared cargo network.
 for(let y=0;y<8;y++){rect(c,OX-15,OY+y*64+26,11,6,'#35454d');rect(c,OX-11,OY+y*64+27,4,4,'#6f9696');}
 for(const m of s.machines){const x=OX+m.x*CELL,y=OY+m.y*CELL;if(m.id===live.current.selected){rect(c,x-2,y-2,66,66,'#e6ae6e');rect(c,x,y,62,62,'#263a42');}machine(c,m.kind,x+3,y+1,t,m.enabled);c.font='8px monospace';c.fillStyle='#b0bec5';c.fillText(`LV.${m.level}`,x+18,y+59);}
 // Salvage drones follow bounded routes; visuals never determine production.
 if(!live.current.lowMotion)for(let i=0;i<4;i++){const a=(t*(0.055+i*0.009)+i*0.24)%1,x=30+a*740,y=114+i*118+Math.sin(a*6+i)*18;rect(c,x+3,y+15,20,5,'#10191e');rect(c,x,y,20,9,'#84999f');rect(c,x+7,y-3,8,15,'#4d737d');rect(c,x+9,y,4,3,'#a8ece2');rect(c,x-4,y-3,6,2,'#364c58');rect(c,x+19,y-3,6,2,'#364c58');}
 c.font='10px monospace';c.fillStyle='#697c87';c.fillText('SHARED CARGO NETWORK',520,620);
 if(live.current.placing){c.fillStyle='#eed1a8';c.fillText('SELECT AN EMPTY PLOT TO BUILD',80,620);}
 };frame=requestAnimationFrame(draw);return()=>{disposed=true;cancelAnimationFrame(frame);};},[get]);
 return <div className={'yard-canvas '+(placing?'placing':'')}><canvas ref={ref} width={800} height={640} aria-label="Salvage yard. Use the accessible plot selector below to place a machine." onClick={e=>{const b=e.currentTarget.getBoundingClientRect();onPlot(Math.floor(((e.clientX-b.left)*800/b.width-OX)/CELL),Math.floor(((e.clientY-b.top)*640/b.height-OY)/CELL));}}/><div className="canvas-status"><span className="dot"/> CARGO NETWORK ONLINE <span ref={stats}>30 FPS</span></div></div>;
}
