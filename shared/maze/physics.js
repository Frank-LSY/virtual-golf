import {LEVELS,wallSegments,TAU} from './levels.js';
export const PHYSICS=Object.freeze({radius:9,boundary:286,outerWidth:12,acceleration:260,drag:1.9,rolling:7.5,maxSpeed:150,restitution:.2,step:1/120,goalSpeed:22,goalHold:.75,fallSeconds:.65,prepareSeconds:1.0});
export const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
export function vector(x=0,y=0){if(!Number.isFinite(x)||!Number.isFinite(y))return {x:0,y:0};const m=Math.max(1,Math.hypot(x,y));return {x:x/m,y:y/m};}
export function closest(point,wall){
  if(wall.kind==='line'){
    const x=wall.b.x-wall.a.x,y=wall.b.y-wall.a.y,len=x*x+y*y;
    const f=len?clamp(((point.x-wall.a.x)*x+(point.y-wall.a.y)*y)/len,0,1):0;
    return {x:wall.a.x+x*f,y:wall.a.y+y*f};
  }
  let angle=(Math.atan2(point.y,point.x)+TAU)%TAU;
  if(angle<wall.start||angle>wall.end){
    const a={x:Math.cos(wall.start)*wall.radius,y:Math.sin(wall.start)*wall.radius},b={x:Math.cos(wall.end)*wall.radius,y:Math.sin(wall.end)*wall.radius};
    return Math.hypot(point.x-a.x,point.y-a.y)<Math.hypot(point.x-b.x,point.y-b.y)?a:b;
  }
  return {x:Math.cos(angle)*wall.radius,y:Math.sin(angle)*wall.radius};
}
export function clearance(point,walls,radius=PHYSICS.radius){
  let space=PHYSICS.boundary-PHYSICS.outerWidth/2-Math.hypot(point.x,point.y)-radius;
  for(const wall of walls){const q=closest(point,wall);space=Math.min(space,Math.hypot(point.x-q.x,point.y-q.y)-wall.width/2-radius);}
  return space;
}
export function safePoint(point,level,padding=0){
  return clearance(point,wallSegments(level))>=padding && level.holes.every(h=>Math.hypot(point.x-h.x,point.y-h.y)>h.radius+padding);
}
export function collision(ball,walls){
  let impact=0;
  const resolve=(nx,ny,depth)=>{
    ball.x+=nx*(depth+.0001);ball.y+=ny*(depth+.0001);
    const vn=ball.vx*nx+ball.vy*ny;
    if(vn<0){impact=Math.max(impact,-vn);const restitution=-vn>18?PHYSICS.restitution:0;ball.vx-=(1+restitution)*vn*nx;ball.vy-=(1+restitution)*vn*ny;
      const tx=-ny,ty=nx,vt=ball.vx*tx+ball.vy*ty,loss=Math.min(.08,-vn/1000);ball.vx-=vt*loss*tx;ball.vy-=vt*loss*ty;}
  };
  for(let pass=0;pass<5;pass++){
    const d=Math.hypot(ball.x,ball.y),limit=PHYSICS.boundary-PHYSICS.outerWidth/2-PHYSICS.radius;
    if(d>limit)resolve(-ball.x/d,-ball.y/d,d-limit);
    let hit=false;
    for(const wall of walls){
      const q=closest(ball,wall),dx=ball.x-q.x,dy=ball.y-q.y,d=Math.hypot(dx,dy),min=PHYSICS.radius+wall.width/2;
      if(d<min){const fallback=Math.hypot(q.x,q.y)||1;resolve(d>1e-8?dx/d:q.x/fallback,d>1e-8?dy/d:q.y/fallback,min-d);hit=true;}
    }
    if(!hit)break;
  }
  return impact;
}
export class MazeGame {
  constructor(level=0){this.results=[];this.load(level);this.phase='ready';}
  load(index){
    this.index=clamp(index,0,LEVELS.length-1);this.level=LEVELS[this.index];this.walls=wallSegments(this.level);this.elapsed=0;this.falls=0;this.started=false;this.accumulator=0;this.goalTime=0;this.phase='playing';this.events=[];this.visualTime=0;this.contacts=0;this.respawn();
  }
  respawn(){this.ball={...this.level.spawn,vx:0,vy:0,rollX:0,rollY:0};this.goalTime=0;}
  retry(){this.load(this.index);}
  pause(reason='manual'){if(['playing','countdown','falling'].includes(this.phase)){this.resumePhase=this.phase==='countdown'?(this.resumePhase||'playing'):this.phase;this.phase='paused';this.pauseReason=reason;this.accumulator=0;}}
  resume(){if(this.phase!=='paused')return;this.phase='countdown';this.countdown=PHYSICS.prepareSeconds;this.ball.vx=0;this.ball.vy=0;this.accumulator=0;}
  advance(seconds,input={x:0,y:0}){
    if(!Number.isFinite(seconds)||seconds<0)return [];
    this.events=[];this.accumulator+=Math.min(seconds,.25);const control=vector(input.x,input.y);
    while(this.accumulator+1e-10>=PHYSICS.step){this.tick(PHYSICS.step,control);this.accumulator-=PHYSICS.step;}
    return this.events;
  }
  tick(dt,input){
    this.visualTime+=dt;
    if(this.phase==='paused'||this.phase==='ready'||this.phase==='won')return;
    if(this.phase==='countdown'){this.countdown-=dt;if(this.countdown<=0)this.phase=this.resumePhase||'playing';return;}
    if(this.started)this.elapsed+=dt;
    if(this.phase==='falling'){
      this.fallTime+=dt;if(this.fallTime>=PHYSICS.fallSeconds){this.respawn();this.phase='countdown';this.countdown=.7;this.resumePhase='playing';this.events.push({kind:'respawn'});}return;
    }
    if(!this.started&&Math.hypot(input.x,input.y)>.04)this.started=true;
    const b=this.ball;b.vx+=input.x*PHYSICS.acceleration*dt;b.vy+=input.y*PHYSICS.acceleration*dt;
    const drag=Math.exp(-PHYSICS.drag*dt);b.vx*=drag;b.vy*=drag;
    const speed=Math.hypot(b.vx,b.vy),friction=Math.max(0,speed-PHYSICS.rolling*dt)/Math.max(speed,1e-9);b.vx*=friction;b.vy*=friction;
    const cap=Math.min(1,PHYSICS.maxSpeed/(Math.hypot(b.vx,b.vy)||1));b.vx*=cap;b.vy*=cap;
    if(Math.hypot(input.x,input.y)<.02&&Math.hypot(b.vx,b.vy)<.65){b.vx=0;b.vy=0;}
    const oldX=b.x,oldY=b.y;b.x+=b.vx*dt;b.y+=b.vy*dt;
    const impact=collision(b,this.walls);b.rollX+=(b.x-oldX)/PHYSICS.radius;b.rollY+=(b.y-oldY)/PHYSICS.radius;
    if(impact>18&&this.visualTime-this.contacts>.09){this.contacts=this.visualTime;this.events.push({kind:'wall',strength:clamp(impact/100,0,1),x:b.x,y:b.y});}
    const hole=this.level.holes.find(h=>Math.hypot(b.x-h.x,b.y-h.y)<Math.max(3,h.radius-PHYSICS.radius*.45));
    if(hole){this.phase='falling';this.falls++;this.fallTime=0;this.fallFrom={x:b.x,y:b.y};this.fallHole=hole;b.vx=0;b.vy=0;this.events.push({kind:'fall'});return;}
    const inside=Math.hypot(b.x,b.y)<this.level.goalRadius-PHYSICS.radius*.25;
    if(inside&&Math.hypot(b.vx,b.vy)<=PHYSICS.goalSpeed)this.goalTime+=dt;else this.goalTime=0;
    if(this.goalTime+1e-8>=PHYSICS.goalHold){this.phase='won';b.vx=0;b.vy=0;this.results[this.index]={elapsed:this.elapsed,falls:this.falls};this.events.push({kind:'win',result:this.results[this.index]});}
  }
}
