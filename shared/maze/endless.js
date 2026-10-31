// 云端滚球 · 多人对战（0.24）：无尽云路 + 最多 4 个球同场。
//  · 赛道按“节点（平台）+ 连接路（道路）”一段段向前生成，同一个种子生成同一条路；总体朝 -Z 前进，
//    横向只在转弯平台上 90° 拐弯，横移一两段后必定拐回，所以永远不会和自己重叠。
//  · 越往前越难：路变窄、护栏变少，出现坡道 / 窄桥 / 冰面 / 移动挡块 / 弹射花园 / 风车平台。
//  · 开局 3 秒后，身后的赛道开始一格格崩塌，速度越来越快；离最后一名太远时会加速追上来，停在原地一定会掉。
//  · 球与球会碰撞，可以把对手撞下去。掉下去就出局，最后留在赛道上的人获胜（单人时比谁跑得远）。
// 运动核心与单人关卡共用 physics.js 的加速度、摩擦、护栏 / 挡块 / 弹射柱 / 风车碰撞。
import {PHYSICS,SURFACES,surfaceKind,clamp,vector,worldInput,angleDelta,collideWall,collideObstacle,collideBumper,collideSweeper} from './physics.js';
import {surfaces,walls,inside,roadFrame,obstaclePose,sweeperPose,boostZone} from './levels.js';

export const VERSUS_COLORS=Object.freeze([
 Object.freeze({key:'red',name:'红色',color:'#ff5d5d',dark:'#c93a3a'}),
 Object.freeze({key:'blue',name:'蓝色',color:'#3fa9ff',dark:'#2378c9'}),
 Object.freeze({key:'yellow',name:'黄色',color:'#ffc93c',dark:'#d69a12'}),
 Object.freeze({key:'green',name:'绿色',color:'#3ddc97',dark:'#1fa56c'})
]);
export const ENDLESS=Object.freeze({
 maxPlayers:4,tile:3,countdown:3,resumeCountdown:2,grace:3,endDelay:1.4,
 start:Object.freeze({size:11,y:6}),
 // 崩塌：base 起步速度（米/秒），每秒增加 ramp，到 max 后改为每秒再加 late（加时赛，保证几分钟内分出胜负）；
 // 最后一名离崩塌超过 leash 米时按 catchup 追赶，总速度不超过 limit。
 collapse:Object.freeze({from:-8,base:1.5,ramp:.028,max:4.2,late:.012,leash:16,catchup:.22,limit:9}),
 warn:7,ahead:170,behind:45,band:Object.freeze([3,12]),full:700,restitution:.75
});
// 赛段（0.24）：随着进程推进，天空 / 雾色 / 配乐依次变化——晨光云海 → 落日港湾 → 极光夜空 → 星海加时。
// 进程取“领先者跑的距离”和“比赛时间”里更靠后的那个，所以无论大家跑得快还是慢，主题都会往前走；
// 崩塌进入加时（超过最高速度后继续加速）时一定是最后一段，配乐也随之加快。
export const STAGES=Object.freeze([
 Object.freeze({name:'晨光云海',chapter:0,distance:0,time:0,sky:['#5ab8ff','#c4e8ff','#fff1d6'],fog:'#bfe6ff',accent:'#3fb6ff',hemi:1.9,sun:'#fff3dc'}),
 Object.freeze({name:'落日港湾',chapter:1,distance:160,time:35,sky:['#ff8f5a','#ffd3a0','#fff1dc'],fog:'#ffd3a8',accent:'#ff9f43',hemi:1.85,sun:'#ffd8a8'}),
 Object.freeze({name:'极光夜空',chapter:2,distance:420,time:70,sky:['#5b4bd6','#b9a6ff','#ffd6f0'],fog:'#c7b8ff',accent:'#7b6cf6',hemi:1.75,sun:'#e8e0ff'}),
 Object.freeze({name:'星海加时',chapter:2,distance:760,time:null,sky:['#1d1650','#4a2d8f','#ff7aa8'],fog:'#7656c4',accent:'#ff5fa2',hemi:1.55,sun:'#ffd0f0'})
]);
const DIR=Object.freeze({N:{x:0,z:-1},E:{x:1,z:0},W:{x:-1,z:0}});
const RIGHT=d=>({x:-d.z,z:d.x});
export function seededRandom(seed){let a=(seed>>>0)||1;return ()=>{a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return ((t^t>>>14)>>>0)/4294967296;};}
function pick(random,options){const list=options.filter(([,w])=>w>0),total=list.reduce((s,[,w])=>s+w,0);let r=random()*total;for(const [k,w] of list){if((r-=w)<=0)return k;}return list.at(-1)[0];}
const at=(c,d,u,y)=>({x:c.x+d.x*u,y,z:c.z+d.z*u});
// 难度：0（起点）→ 1（约 700 米后），用来决定路宽、护栏和机关。
export const difficulty=s=>clamp(s/ENDLESS.full,0,1);

// 进程（0–3 的连续值）：整数部分是第几段，小数部分是这一段走了多少。
export function progressOf(lead,elapsed){
 const C=ENDLESS.collapse,late=ENDLESS.grace+(C.max-C.base)/C.ramp,times=STAGES.map(s=>s.time??late),seg=(v,marks)=>{for(let i=marks.length-1;i>=0;i--)if(v>=marks[i])return i<marks.length-1?i+(v-marks[i])/(marks[i+1]-marks[i]):i;return 0;};
 return Math.min(STAGES.length-1,Math.max(seg(lead,STAGES.map(s=>s.distance)),seg(elapsed,times)));
}
// 颜色在每一段的最后 20% 平滑过渡到下一段。
export function stageBlend(progress){const i=Math.min(STAGES.length-1,Math.floor(progress+1e-9)),f=progress-i,t=i<STAGES.length-1?clamp((f-.8)/.2,0,1):0;return {index:i,next:Math.min(STAGES.length-1,i+1),blend:t*t*(3-2*t)};}

export class EndlessTrack {
 constructor(seed=1){this.seed=seed>>>0;this.random=seededRandom(this.seed);this.pieces=[];this.count=0;this.seen=new Set();this.startNode();}
 startNode(){
  const S=ENDLESS.start.size,c={x:0,y:ENDLESS.start.y,z:0};
  const piece={index:0,kind:'start',link:'none',d:0,roads:[],platforms:[{id:'n0',x:0,z:0,y:c.y,size:S,rails:true}],obstacles:[],bumpers:[],sweepers:[],boosts:[],signs:[],route:[],s0:-S/2,sc:0,s1:S/2,dirIn:'N',dirOut:'N',node:{x:0,y:c.y,z:0,size:S}};
  this.add(piece);this.cursor={x:0,y:c.y,z:0,dir:'N',s:0,size:S,legs:0};
 }
 get last(){return this.pieces.at(-1);}
 // 生成到 s（米）为止。
 ensure(s){while(this.cursor.s<s)this.next();}
 // 删除已经完全崩塌、并且离崩塌前沿足够远的块（至少保留 2 块）。
 prune(s){while(this.pieces.length>2&&this.pieces[0].s1<s)this.pieces.shift();}
 near(s,before=14,after=26){return this.pieces.filter(p=>p.s1>=s-before&&p.s0<=s+after);}
 piece(index){return this.pieces.find(p=>p.index===index)||null;}
 next(){
  const c=this.cursor,r=this.random,d=difficulty(c.s),lateral=c.dir!=='N',index=this.count;
  // ---- 节点（平台）：转弯、休息（可能是云絮）、弹射花园、风车 ----
  let node;
  if(lateral)node=c.legs>=2||r()<.62||(Math.abs(c.x)>20&&Math.sign(c.x)===DIR[c.dir].x)?'turn':'rest';
  else node=pick(r,[['turn',1.05],['rest',.55],['garden',d>=.14?.55:0],['mill',d>=.3?.5:0]]);
  // ---- 连接路：平路、坡道、窄桥、冰面、移动挡块 ----
  const link=pick(r,[['flat',1.4-d*.7],['slope',.75],['bridge',d>=.12?.45+d*.8:0],['ice',d>=.34?.55:0],['block',d>=.2&&!lateral?.65:0]]);
  let w=7.2-2.3*d+r()*.6,rails=r()<1-.55*d,L=8+r()*9+4*d,dy=0,surface,obstacle=null,boost=null;
  if(link==='slope'){dy=(1.4+r()*1.6)*(r()<.5?-1:1);if(c.y+dy>ENDLESS.band[1]||c.y+dy<ENDLESS.band[0])dy=-dy;L=Math.max(L,9);rails=r()<1-.4*d;}
  if(link==='bridge'){w=3.6-.6*d+r()*.2;rails=false;L=7+r()*5+6*d;}
  if(link==='ice'){w=6.2-1.2*d;rails=d<.65||r()<.5;L=9+r()*6;surface='ice';}
  if(link==='block'){w=6.2;rails=r()<1-.45*d;L=12+r()*4;}
  if(link==='flat'&&d<.08){rails=true;w=Math.max(w,6.8);}
  const S1=c.size,S2=node==='garden'?14:node==='mill'?12.5:node==='turn'?10:9,dir=DIR[c.dir],y2=c.y+dy,span=S1/2+L+S2/2,C2=at(c,dir,span,y2),sc=c.s+span;
  // 道路从上一节点中心连到下一节点中心；坡道两端各留一小段平路，保证与平台交接处等高。
  const roads=[],id=i=>`r${index}-${i}`;
  if(!dy)roads.push({id:id(0),a:{x:c.x,y:c.y,z:c.z},b:{...C2},width:w,rails,...(surface?{surface}:{}),s0:c.s,show:[S1/2,span-S2/2]});
  else{const p1=at(c,dir,S1/2+1.5,c.y),p2=at(c,dir,span-S2/2-1.5,y2);roads.push({id:id(0),a:{x:c.x,y:c.y,z:c.z},b:p1,width:w,rails,s0:c.s,show:[S1/2,S1/2+1.5]},{id:id(1),a:p1,b:p2,width:w,rails,s0:c.s+S1/2+1.5,show:[0,L-3]},{id:id(2),a:p2,b:{...C2},width:w,rails,s0:sc-S2/2-1.5,show:[0,1.5]});
   if(dy>0&&r()<.55)boost={id:`b${index}`,roadId:id(1),t0:.06,t1:.42,power:15};}
  if(link==='block'){const travel=Math.min(1.8,w/2-1.25);obstacle={roadId:id(0),t:.5,travel,period:4.8-1.2*d,phase:r()*6,width:1.5,depth:1.25,height:1.4};}
  // 节点
  let dirOut=c.dir;
  if(node==='turn'){if(lateral)dirOut='N';else dirOut=c.x<-12?'E':c.x>12?'W':r()<.5?'E':'W';}
  const platform={id:`n${index}`,x:C2.x,z:C2.z,y:y2,size:S2,rails:node==='turn'?(d<.7||r()<.7):true,...(node==='rest'&&d>=.3&&r()<.4?{surface:'fluff'}:{})};
  const f=DIR[dirOut],right=RIGHT(dir),bumpers=[],sweepers=[],route=[];
  const local=(rx,fz)=>({x:C2.x+right.x*rx+dir.x*fz,z:C2.z+right.z*rx+dir.z*fz,y:y2});
  // 路线点（测试用的自动驾驶与小地图使用）：沿中线；花园绕开弹射柱；风车先在外面等横杆转过去，再从角落绕过。
  for(const road of roads)route.push({x:road.b.x,y:road.b.y,z:road.b.z});
  if(obstacle){const o=roads[0],len=Math.hypot(o.b.x-o.a.x,o.b.z-o.a.z),wait=at(o.a,dir,len*.5-3.4,o.a.y);route.splice(route.length-1,0,{...wait,clear:true,block:true});}
  if(node==='garden'){const m=r()<.5?-1:1,pattern=d<.5?[[0,-1.4],[-3.9*m,2.4],[3.9*m,3]]:[[0,-1.4],[-3.9*m,2.4],[3.9*m,3],[-.6*m,5.3]];for(const [rx,fz] of pattern){const p=local(rx,fz);bumpers.push({id:`u${index}-${bumpers.length}`,x:p.x,z:p.z,y:y2,radius:.75,height:1.1});}
   route.pop();route.push({...local(0,-5.6)},{...local(2.1*m,-3.2)},{...local(2.0*m,1.3)},{...local(2.2*m,4.7)},{...local(0,7.3),node:true});}
  else if(node==='mill'){const length=4.4+r()*.4,speed=(.55+.45*d)*(r()<.5?-1:1),side=r()<.5?-1:1;sweepers.push({id:`s${index}`,x:C2.x,z:C2.z,y:y2,length,speed,phase:r()*6,arms:2,width:.36,height:.9,post:.42});
   route.pop();route.push({...local(0,-5.95),clear:true},{...local(4.95*side,-4.95),clear:true},{...local(4.95*side,4.95)},{...local(0,6.6),node:true});}
  else route[route.length-1]={...route[route.length-1],node:true,turn:node==='turn'};
  const signs=[],sign=(key,text,p)=>{if(this.seen.has(key))return;this.seen.add(key);signs.push({...p,text});};
  const entry=at(c,dir,S1/2+1.2,c.y);
  if(link==='bridge')sign('bridge','窄桥 · 无护栏',entry);else if(link==='ice')sign('ice','冰面 · 很滑',entry);else if(link==='block')sign('block','移动挡块 · 从空的一侧过',entry);else if(!rails)sign('open','无护栏 · 别被撞下去',entry);
  if(node==='garden')sign('garden','弹射花园',local(0,-7.6));if(node==='mill')sign('mill','风车 · 等它转过去',local(0,-7.6));
  const piece={index,kind:node,link,d,roads,platforms:[platform],obstacles:obstacle?[obstacle]:[],bumpers,sweepers,boosts:boost?[boost]:[],signs,route,s0:c.s,sc,s1:sc+S2/2,dirIn:c.dir,dirOut,node:{x:C2.x,y:y2,z:C2.z,size:S2}};
  this.add(piece);
  this.cursor={x:C2.x,y:y2,z:C2.z,dir:dirOut,s:sc,size:S2,legs:dirOut==='N'?0:c.dir===dirOut?c.legs+1:1};
  return piece;
 }
 add(piece){
  const level={roads:piece.roads,platforms:piece.platforms,movers:[]},floors=surfaces(level),dIn=DIR[piece.dirIn],dOut=DIR[piece.dirOut],T=ENDLESS.tile;
  for(const f of floors){f.piece=piece.index;
   if(f.road){const r=f.road,fr=f.frame,[v0,v1]=r.show,n=Math.max(1,Math.round((v1-v0)/T)),tl=(v1-v0)/n;f.tiles={v0,v1,n,tl};
    f.along=(x,z)=>(x-r.a.x)*fr.forward.x+(z-r.a.z)*fr.forward.z;f.sAt=(x,z)=>r.s0+clamp(f.along(x,z),0,fr.length);
    // 道路按 3 米一格崩塌：一格的远端被崩塌前沿越过，这一格就塌了。
    // 起点平台里的那一截与平台同时塌；终点平台里的那一截由平台托着。
    f.edge=(x,z)=>{const a=f.along(x,z);if(a<v0)return r.s0+v0;return r.s0+Math.min(v1,v0+Math.max(1,Math.ceil((Math.min(a,v1)-v0)/tl-1e-9))*tl);};
    f.solid=(x,z,front)=>f.edge(x,z)>front;}
   else{const p=f.platform,mx=dIn.x+dOut.x,mz=dIn.z+dOut.z,m=Math.hypot(mx,mz)||1;f.sAt=(x,z)=>clamp(piece.sc+((x-p.x)*mx+(z-p.z)*mz)/m,piece.sc-p.size/2,piece.sc+p.size/2);f.edge=()=>piece.sc+p.size/2;f.solid=(x,z,front)=>piece.sc+p.size/2>front;}
  }
  piece.floors=floors;piece.walls=null;piece.obstaclePoses=piece.obstacles.map(o=>({o,level}));piece.boostZones=piece.boosts.map(b=>boostZone(level,b));piece.level=level;
  this.pieces.push(piece);this.count++;
  // 护栏要和前后相邻的地面裁出开口，所以等下一块生成之后再算上一块的护栏。
  const prev=this.pieces.at(-2);if(prev&&!prev.walls)this.finish(prev);
 }
 finish(piece){
  const i=this.pieces.indexOf(piece),clips=this.pieces.slice(Math.max(0,i-1),i+2).flatMap(p=>p.floors),out=[];
  for(const f of piece.floors)for(const w of walls({movers:[]},clips,[f])){w.floor=f;w.sMax=Math.max(f.edge(w.a.x,w.a.z),f.edge(w.b.x,w.b.z));out.push(w);}
  piece.walls=out;
 }
 // 某一点的实心地面（考虑崩塌）：多块重叠时取最高的。
 floorAt(x,z,front,pieces=this.pieces){let best=null,h=-Infinity;for(const p of pieces)for(const f of p.floors){if(!inside({x,z},f.polygon)||!f.solid(x,z,front))continue;const y=f.height(x,z);if(y>h){h=y;best=f;}}return best;}
}

const SPAWN=[[0],[-1.6,1.6],[-2.8,0,2.8],[-3.3,-1.1,1.1,3.3]];
export class VersusGame {
 constructor(players=[],{seed=1}={}){this.reset(players,seed);}
 reset(players,seed=this.seed){
  this.seed=seed>>>0;this.track=new EndlessTrack(this.seed);this.track.ensure(ENDLESS.ahead);
  const list=players.slice(0,ENDLESS.maxPlayers),xs=SPAWN[Math.max(0,list.length-1)]||SPAWN[3];
  this.players=list.map((p,i)=>({id:p.id,slot:p.slot??i,name:p.name||`${(p.slot??i)+1}P`,color:p.color||VERSUS_COLORS[(p.slot??i)%4].color,ball:{x:xs[i],y:ENDLESS.start.y+PHYSICS.radius,z:2,vx:0,vy:0,vz:0,rollX:0,rollZ:0},phase:'playing',heading:0,cameraHeading:0,currentRoad:null,boostTime:0,speedLimit:PHYSICS.maxSpeed,inBoost:null,surface:'normal',s:0,best:0,rank:null,fellAt:null,fallTime:0,piece:0,lastClash:-1,lastWall:-1,lastBump:-1}));
  this.solo=this.players.length<=1;this.phase='countdown';this.countdown=ENDLESS.countdown;this.resumePhase='playing';this.started=false;this.elapsed=0;this.clock=0;this.accumulator=0;
  this.front=ENDLESS.collapse.from;this.speed=0;this.collapsing=false;this.events=[];this.ending=null;this.winner=null;this.lastCount=Math.ceil(this.countdown);this.version=(this.version||0)+1;this.progress=0;this.stage=0;
  return this;
 }
 get active(){return this.players.filter(p=>p.phase==='playing');}
 pause(reason='manual'){if(['playing','countdown'].includes(this.phase)){if(this.phase==='playing')this.resumePhase='playing';this.phase='paused';this.pauseReason=reason;this.accumulator=0;}}
 resume(){if(this.phase!=='paused')return;this.phase='countdown';this.countdown=this.started?ENDLESS.resumeCountdown:ENDLESS.countdown;this.lastCount=Math.ceil(this.countdown);for(const p of this.players){if(p.phase==='playing'){p.ball.vx=0;p.ball.vz=0;}}this.accumulator=0;}
 advance(seconds,inputs={}){if(!Number.isFinite(seconds)||seconds<0)return [];this.events=[];this.accumulator+=Math.min(seconds,.25);while(this.accumulator+1e-10>=PHYSICS.step){this.tick(PHYSICS.step,inputs);this.accumulator-=PHYSICS.step;}return this.events;}
 input(inputs,id){const v=inputs instanceof Map?inputs.get(id):inputs[id];return v?vector(v.x,v.y):{x:0,y:0};}
 tick(dt,inputs){
  if(['paused','over'].includes(this.phase))return;
  if(this.phase==='countdown'){this.countdown-=dt;const n=Math.ceil(this.countdown);if(n<this.lastCount&&n>0)this.events.push({kind:'countdown',n});this.lastCount=n;if(this.countdown<=0){this.phase=this.resumePhase;if(!this.started){this.started=true;this.events.push({kind:'go'});}else this.events.push({kind:'resume'});}return;}
  this.clock+=dt;this.elapsed+=dt;
  // 崩塌前沿
  const C=ENDLESS.collapse,alive=this.active;
  if(this.elapsed>=ENDLESS.grace){if(!this.collapsing){this.collapsing=true;this.events.push({kind:'collapse'});}const t=this.elapsed-ENDLESS.grace,t1=(C.max-C.base)/C.ramp;let v=Math.min(C.max,C.base+C.ramp*t)+Math.max(0,t-t1)*C.late;const rear=alive.length?Math.min(...alive.map(p=>p.s)):this.front;if(rear-this.front>C.leash)v=Math.min(C.limit,v+(rear-this.front-C.leash)*C.catchup);this.speed=v;this.front+=v*dt;}
  const lead=Math.max(0,...this.players.map(p=>p.best));this.track.ensure(lead+ENDLESS.ahead);this.track.prune(this.front-ENDLESS.behind);
  const fell=[];
  for(const p of this.players){if(p.phase==='playing')this.move(p,dt,this.input(inputs,p.id));else if(p.phase==='falling')this.fall(p,dt);}
  this.collideBalls();
  for(const p of this.players)if(p.phase==='playing'&&this.land(p,dt))fell.push(p);
  if(fell.length)this.rank(fell);
  this.progress=progressOf(lead,this.elapsed);const stage=Math.floor(this.progress+1e-9);if(stage>this.stage){this.stage=stage;this.events.push({kind:'stage',index:stage});}
  if(this.ending!==null){this.ending-=dt;if(this.ending<=0){this.phase='over';this.events.push({kind:'over',winner:this.winner?.id??null});}}
 }
 // 一个球的一步：加速度、坡度、加速带、阻力、限速，再与护栏 / 挡块 / 弹射柱 / 风车碰撞（只看附近几块赛道）。
 move(p,dt,input){
  const b=p.ball,pieces=this.track.near(p.s,14,24);p.near=pieces;
  const before=this.track.floorAt(b.x,b.z,this.front,pieces),ground=SURFACES[surfaceKind(before)],control=worldInput(input,p.heading);let sx=0,sz=0;if(before?.road){sx=before.frame.forward.x*before.frame.slope;sz=before.frame.forward.z*before.frame.slope;}
  b.vx+=(control.x*PHYSICS.acceleration*ground.control-PHYSICS.gravity*.6*sx)*dt;b.vz+=(control.z*PHYSICS.acceleration*ground.control-PHYSICS.gravity*.6*sz)*dt;
  let zone=null;for(const piece of pieces)for(const z of piece.boostZones)if(inside(b,z.polygon)&&Math.abs(z.height(b.x,b.z)-(b.y-PHYSICS.radius))<.3&&z.road&&this.track.floorAt(b.x,b.z,this.front,[piece]))zone=z;
  if(zone){b.vx+=zone.forward.x*zone.power*dt;b.vz+=zone.forward.z*zone.power*dt;p.boostTime=PHYSICS.boostSeconds;if(p.inBoost!==zone.id)this.events.push({kind:'boost',id:p.id});}p.inBoost=zone?.id??null;
  if(p.boostTime>0){p.boostTime-=dt;p.speedLimit=PHYSICS.boostSpeed;}else p.speedLimit=Math.max(PHYSICS.maxSpeed,p.speedLimit-PHYSICS.overspeedDecay*dt);
  const drag=Math.exp(-PHYSICS.drag*ground.drag*dt);b.vx*=drag;b.vz*=drag;const speed=Math.hypot(b.vx,b.vz),friction=Math.max(0,speed-PHYSICS.rolling*ground.rolling*dt)/Math.max(speed,1e-9);b.vx*=friction;b.vz*=friction;const cap=Math.min(1,p.speedLimit/(Math.hypot(b.vx,b.vz)||1));b.vx*=cap;b.vz*=cap;
  if(Math.hypot(input.x,input.y)<.02&&Math.hypot(sx,sz)<.001&&Math.hypot(b.vx,b.vz)<.045&&ground!==SURFACES.ice){b.vx=0;b.vz=0;}
  p.oldX=b.x;p.oldZ=b.z;b.x+=b.vx*dt;b.z+=b.vz*dt;let impact=0,bumped=0,swept=0;
  for(let pass=0;pass<3;pass++)for(const piece of pieces){
   if(piece.walls)for(const w of piece.walls)if(w.sMax>this.front)impact=Math.max(impact,collideWall(b,w));
   for(const {o,level} of piece.obstaclePoses){const pose=obstaclePose(level,o,this.clock);if(this.track.floorAt(pose.x,pose.z,this.front,[piece]))impact=Math.max(impact,collideObstacle(b,pose));}
   if(piece.s1>this.front){for(const u of piece.bumpers)bumped=Math.max(bumped,collideBumper(b,u));for(const s of piece.sweepers)swept=Math.max(swept,collideSweeper(b,sweeperPose(s,this.clock)));}
  }
  if(swept&&this.clock-(p.lastSweep??-1)>.15){p.lastSweep=this.clock;this.events.push({kind:'sweep',id:p.id,strength:clamp(swept/7,0,1)});}
  if(bumped&&this.clock-p.lastBump>.15){p.lastBump=this.clock;this.events.push({kind:'bump',id:p.id,strength:clamp(bumped/7,0,1),x:b.x,z:b.z});}
  if(impact>.7&&this.clock-p.lastWall>.12){p.lastWall=this.clock;this.events.push({kind:'wall',id:p.id,strength:clamp(impact/7,0,1)});}
  const after=Math.min(1,Math.max(p.speedLimit,bumped?PHYSICS.bumperKick+1:0)/(Math.hypot(b.vx,b.vz)||1));b.vx*=after;b.vz*=after;
 }
 // 球与球：等质量弹性碰撞（恢复系数 0.75），互相推开；可以把对手撞下赛道。
 collideBalls(){
  const list=this.active,min=PHYSICS.radius*2,e=ENDLESS.restitution;
  for(let pass=0;pass<2;pass++)for(let i=0;i<list.length;i++)for(let j=i+1;j<list.length;j++){
   const a=list[i].ball,c=list[j].ball,dx=c.x-a.x,dz=c.z-a.z,d=Math.hypot(dx,dz);if(d>=min||Math.abs(a.y-c.y)>PHYSICS.radius*1.6)continue;
   const nx=d>1e-9?dx/d:1,nz=d>1e-9?dz/d:0,push=(min-d)/2+1e-5;a.x-=nx*push;a.z-=nz*push;c.x+=nx*push;c.z+=nz*push;
   const vn=(a.vx-c.vx)*nx+(a.vz-c.vz)*nz;if(vn<=0)continue;const k=(1+e)*vn/2;a.vx-=k*nx;a.vz-=k*nz;c.vx+=k*nx;c.vz+=k*nz;
   if(vn>.8&&this.clock-Math.max(list[i].lastClash,list[j].lastClash)>.2){list[i].lastClash=list[j].lastClash=this.clock;this.events.push({kind:'clash',ids:[list[i].id,list[j].id],strength:clamp(vn/6,0,1),x:(a.x+c.x)/2,z:(a.z+c.z)/2});}
  }
 }
 // 落地：没有实心地面（跑出边缘，或者脚下的赛道已经塌了）就开始坠落。
 land(p,dt){
  const b=p.ball,surface=this.track.floorAt(b.x,b.z,this.front,p.near||this.track.near(p.s));
  if(!surface){p.phase='falling';p.fallTime=0;b.vy=0;p.fellAt=this.elapsed;p.cause=this.front>=p.s-1.5?'collapse':'edge';this.events.push({kind:'fall',id:p.id,cause:p.cause});return true;}
  p.surface=surfaceKind(surface);b.y=surface.height(b.x,b.z)+PHYSICS.radius;b.rollX+=(b.z-p.oldZ)/PHYSICS.radius;b.rollZ-=(b.x-p.oldX)/PHYSICS.radius;p.piece=surface.piece;p.s=surface.sAt(b.x,b.z);p.best=Math.max(p.best,p.s);this.heading(p,dt);return false;
 }
 fall(p,dt){const b=p.ball;p.fallTime+=dt;b.vy-=PHYSICS.gravity*dt;b.x+=b.vx*dt;b.z+=b.vz*dt;b.y+=b.vy*dt;if(p.fallTime>=PHYSICS.fallSeconds*1.6){p.phase='out';this.events.push({kind:'out',id:p.id,rank:p.rank});}}
 heading(p,dt){
  const b=p.ball;let best=null,score=Infinity;
  for(const piece of p.near||[])for(const r of piece.roads){const f=roadFrame(r),along=clamp((b.x-r.a.x)*f.forward.x+(b.z-r.a.z)*f.forward.z,0,f.length),x=r.a.x+f.forward.x*along,z=r.a.z+f.forward.z*along,y=r.a.y+f.slope*along;if(Math.abs(y-(b.y-PHYSICS.radius))>.4)continue;const d=Math.hypot(b.x-x,b.z-z)+(r.id===p.currentRoad?-.35:0);if(d<score){score=d;best={r,f};}}
  if(best){p.currentRoad=best.r.id;if(Math.hypot(b.vx,b.vz)>.12)p.heading+=clamp(angleDelta(best.f.heading,p.heading)*(1-Math.exp(-2.4*dt)),-1.35*dt,1.35*dt);}p.cameraHeading=p.heading;
 }
 // 名次：同一步里掉下去的几个人，跑得远的名次靠前。结果确定后（只剩 1 人或全部出局）再过 1.4 秒结束。
 rank(fell){
  if(this.ending!==null){for(const p of fell)p.rank=p.rank??null;return;}
  const remaining=this.active.length;fell.sort((a,b)=>b.best-a.best);fell.forEach((p,i)=>{p.rank=remaining+1+i;});
  if(this.solo){fell[0].rank=1;this.winner=null;this.ending=ENDLESS.endDelay;return;}
  if(remaining<=1){const w=this.active[0];if(w){w.rank=1;this.winner=w;this.events.push({kind:'win',id:w.id});}else{this.winner=fell[0];this.events.push({kind:'win',id:fell[0].id});}this.ending=ENDLESS.endDelay;}
 }
 standings(){return [...this.players].sort((a,b)=>(a.rank??0)-(b.rank??0)||b.best-a.best);}
 // 给网关 / 手机的精简状态。
 summary(){return {phase:this.phase,elapsed:this.elapsed,front:this.front,speed:this.speed,solo:this.solo,stage:this.stage,winner:this.winner?.slot??null,players:this.players.map(p=>({slot:p.slot,alive:p.phase==='playing',rank:p.rank,distance:Math.max(0,Math.round(p.best)),gap:p.phase==='playing'&&this.collapsing?Math.max(0,Math.round((p.s-this.front)*10)/10):null}))};}
}
