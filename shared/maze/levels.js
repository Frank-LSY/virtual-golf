// World units: metres. Y is up; the first road runs toward -Z.
export const point=(x,z,y=6)=>({x,y,z});
const road=(id,a,b,width=6,rails=true)=>({id,a,b,width,rails});
const platform=(id,x,z,y=6,size=8,rails=true)=>({id,x,z,y,size,rails});
const checkpoint=(id,x,z,y,heading=0)=>({id,x,z,y,heading,radius:2});
const obstacle=(roadId,t,travel=2,period=4.8,phase=0)=>({roadId,t,travel,period,phase,width:1.5,depth:1.25,height:1.4});
const p=point;
export const LEVELS=[
 {id:'breeze',name:'初航 · 学会控制',lesson:'轻倾加速，反向刹车',subtitle:'宽道和缓弯，先熟悉小球的重量。',color:'#24b8c2',accent:'#ffce62',spawn:p(0,2),heading:0,
  roads:[road('launch',p(0,4),p(0,-20),7),road('rise',p(0,-20),p(0,-36,8.4),7),road('upper',p(0,-36,8.4),p(0,-48,8.4),7),road('turn',p(0,-48,8.4),p(24,-48,8.4),7),road('open',p(24,-48,8.4),p(24,-65,8.4),6.2,false),road('home',p(24,-65,8.4),p(24,-85,8.4),7)],
  platforms:[platform('start',0,3,6,9),platform('bend',0,-48,8.4,10),platform('rest',24,-48,8.4,10),platform('finish',24,-85,8.4,11)],
  checkpoints:[checkpoint('turn',0,-46,8.4,Math.PI/2),checkpoint('bridge',24,-48,8.4,0)],goal:{...p(24,-85,8.4),radius:2.35},obstacles:[],
  routes:{main:[p(0,2),p(0,-44,8.4),p(0,-48,8.4),p(24,-48,8.4),p(24,-85,8.4)]},
  signs:[{...p(0,-16),text:'上坡 · 保持轻倾'},{...p(0,-42,8.4),text:'前方右转 · 提前刹车'},{...p(24,-54,8.4),text:'无护栏 · 小幅修正'}],strategy:'右转前先减速，再往右轻推。最后一段有一小段无护栏道路，稳住方向比一直加速更重要。'},
 {id:'rhythm',name:'逐风 · 学会节奏',lesson:'先观察，再通过',subtitle:'上下坡、窄桥与会移动的挡块。',color:'#8075dc',accent:'#ffbd67',spawn:p(0,2),heading:0,
  roads:[road('launch',p(0,4),p(0,-18),7),road('rise',p(0,-18),p(0,-38,9.2),7),road('approach',p(0,-38,9.2),p(0,-46,9.2),7),road('gate',p(0,-46,9.2),p(25,-46,9.2),6.4),road('ramp-entry',p(25,-46,9.2),p(25,-51,9.2),6.4),road('down',p(25,-51,9.2),p(25,-70,6.2),6.4),road('ramp-exit',p(25,-70,6.2),p(25,-76,6.2),6.4),road('bridge',p(25,-76,6.2),p(25,-93,6.2),3.4,false),road('turn',p(25,-93,6.2),p(4,-93,6.2),6.4),road('home',p(4,-93,6.2),p(4,-115,6.2),6.4)],
  platforms:[platform('start',0,3,6,9),platform('wait',0,-46,9.2,10),platform('slope',25,-46,9.2,10),platform('bridge-head',25,-76,6.2,8),platform('bridge-end',25,-93,6.2,9),platform('corner',4,-93,6.2,9),platform('finish',4,-115,6.2,11)],
  checkpoints:[checkpoint('gate',0,-46,9.2,Math.PI/2),checkpoint('bridge',25,-76,6.2,0),checkpoint('return',25,-93,6.2,-Math.PI/2)],goal:{...p(4,-115,6.2),radius:2.35},obstacles:[obstacle('gate',.48,2.1,5.2)],
  routes:{main:[p(0,2),p(0,-46,9.2),p(25,-46,9.2),p(25,-76,6.2),p(25,-93,6.2),p(4,-93,6.2),p(4,-115,6.2)]},
  signs:[{...p(0,-40,9.2),text:'安全平台 · 等一个时机'},{...p(25,-61,7.62),text:'下坡先刹车'},{...p(25,-80,6.2),text:'窄桥 · 保持居中'}],strategy:'挡块前的平台可以停球观察。下坡会自然加速，到桥头先稳住；过桥即有检查点，坠落不用从起点重跑。'},
 {id:'choice',name:'云岔 · 学会规划',lesson:'近路考控制，稳路留余量',subtitle:'两条真实分支，汇合后再迎接最后一段。',color:'#ef8c70',accent:'#54c5d8',spawn:p(0,2),heading:0,
  roads:[road('launch',p(0,4),p(0,-25),7),road('short',p(0,-25),p(0,-85),2.6,false),road('safe-out',p(0,-25),p(-24,-25),7.2),road('safe-flat',p(-24,-25),p(-24,-31),7.2),road('safe-rise',p(-24,-31),p(-24,-48,8.7),7.2),road('safe-gate',p(-24,-48,8.7),p(-24,-61,8.7),7.2),road('safe-down',p(-24,-61,8.7),p(-24,-78),7.2),road('safe-exit',p(-24,-78),p(-24,-85),7.2),road('merge',p(-24,-85),p(0,-85),7.2),road('last',p(0,-85),p(0,-106),6.4),road('east',p(0,-106),p(21,-106),6.4),road('home',p(21,-106),p(21,-127),6.4)],
  platforms:[platform('start',0,3,6,9),platform('fork',0,-25,6,10),platform('safe-corner',-24,-25,6,10),platform('safe-end',-24,-85,6,10),platform('merge',0,-85,6,11),platform('corner',0,-106,6,10),platform('bend',21,-106,6,10),platform('finish',21,-127,6,11)],
  checkpoints:[checkpoint('fork',0,-25,6,0),checkpoint('safe',-24,-25,6,0),checkpoint('merge',0,-85,6,0),checkpoint('final',21,-106,6,0)],goal:{...p(21,-127),radius:2.35},obstacles:[obstacle('safe-gate',.5,2.5,5.8,1),obstacle('east',.52,2.1,5.2,.6)],
  routes:{short:[p(0,2),p(0,-25),p(0,-85),p(0,-106),p(21,-106),p(21,-127)],safe:[p(0,2),p(0,-25),p(-24,-25),p(-24,-85),p(0,-85),p(0,-106),p(21,-106),p(21,-127)]},
  signs:[{...p(0,-19),text:'前方岔路 · 先停稳'},{...p(0,-32),text:'直行近路 · 无护栏'},{...p(-14,-25),text:'左转稳路 · 宽道护栏'},{...p(0,-94),text:'已汇合 · 看好下一弯'}],strategy:'直行近路只有 2.6 米宽、没有护栏；左转稳路多绕约 48 米，有护栏和缓坡，需要通过一个慢挡块。两路汇合后共享检查点。'}
];
export function roadFrame(r){const dx=r.b.x-r.a.x,dz=r.b.z-r.a.z,length=Math.hypot(dx,dz),forward={x:dx/length,z:dz/length};return {length,forward,right:{x:-forward.z,z:forward.x},slope:(r.b.y-r.a.y)/length,heading:Math.atan2(forward.x,-forward.z)};}
export function surfaces(level){return [...level.roads.map(r=>{const f=roadFrame(r),w=r.width/2;return {id:r.id,road:r,frame:f,polygon:[{x:r.a.x+f.right.x*w,z:r.a.z+f.right.z*w},{x:r.b.x+f.right.x*w,z:r.b.z+f.right.z*w},{x:r.b.x-f.right.x*w,z:r.b.z-f.right.z*w},{x:r.a.x-f.right.x*w,z:r.a.z-f.right.z*w}],height:(x,z)=>r.a.y+((x-r.a.x)*f.forward.x+(z-r.a.z)*f.forward.z)*f.slope};}),...level.platforms.map(p=>({id:p.id,platform:p,polygon:[{x:p.x-p.size/2,z:p.z+p.size/2},{x:p.x+p.size/2,z:p.z+p.size/2},{x:p.x+p.size/2,z:p.z-p.size/2},{x:p.x-p.size/2,z:p.z-p.size/2}],height:()=>p.y}))];}
export function inside(p,polygon,epsilon=1e-7){return polygon.every((a,i)=>{const b=polygon[(i+1)%polygon.length];return (b.x-a.x)*(p.z-a.z)-(b.z-a.z)*(p.x-a.x)<=epsilon;});}
// Clip a rail against neighbouring floor footprints: interior rails disappear at turns.
function clip(a,b,polygon){let lo=0,hi=1;for(let i=0;i<polygon.length;i++){const p=polygon[i],q=polygon[(i+1)%polygon.length],ex=q.x-p.x,ez=q.z-p.z,c=ex*(a.z-p.z)-ez*(a.x-p.x),d=ex*(b.z-a.z)-ez*(b.x-a.x);if(Math.abs(d)<1e-9){if(c>1e-6)return null;}else if(d>0)hi=Math.min(hi,(1e-6-c)/d);else lo=Math.max(lo,(1e-6-c)/d);if(hi<lo)return null;}return [Math.max(0,lo),Math.min(1,hi)];}
export function walls(level,floors=surfaces(level)){
 const out=[];for(const s of floors){if(!(s.road?.rails??s.platform?.rails))continue;const edges=s.road?[[s.polygon[0],s.polygon[1]],[s.polygon[2],s.polygon[3]]]:s.polygon.map((p,i)=>[p,s.polygon[(i+1)%4]]);
  for(const [a,b] of edges){let spans=[[0,1]];for(const other of floors){if(other===s)continue;const range=clip(a,b,other.polygon);if(!range||range[1]-range[0]<1e-5)continue;const mid=(range[0]+range[1])/2,x=a.x+(b.x-a.x)*mid,z=a.z+(b.z-a.z)*mid;if(Math.abs(s.height(x,z)-other.height(x,z))>.15)continue;spans=spans.flatMap(([lo,hi])=>range[1]<=lo||range[0]>=hi?[[lo,hi]]:[[lo,Math.max(lo,range[0])],[Math.min(hi,range[1]),hi]].filter(([u,v])=>v-u>1e-5));}
   for(const [lo,hi] of spans){const at=t=>{const x=a.x+(b.x-a.x)*t,z=a.z+(b.z-a.z)*t;return {x,z,y:s.height(x,z)};};out.push({a:at(lo),b:at(hi),radius:.14,height:.96});}
  }
 }return out;
}
export function obstaclePose(level,obstacle,time){const r=level.roads.find(r=>r.id===obstacle.roadId),f=roadFrame(r),angle=time*Math.PI*2/obstacle.period+obstacle.phase,offset=Math.sin(angle)*obstacle.travel,speed=Math.cos(angle)*obstacle.travel*Math.PI*2/obstacle.period;return {...obstacle,x:r.a.x+(r.b.x-r.a.x)*obstacle.t+f.right.x*offset,z:r.a.z+(r.b.z-r.a.z)*obstacle.t+f.right.z*offset,y:r.a.y+(r.b.y-r.a.y)*obstacle.t,right:f.right,forward:f.forward,vx:f.right.x*speed,vz:f.right.z*speed};}
