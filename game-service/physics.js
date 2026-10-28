import {BALL_RADIUS,CUP_RADIUS,CUP_DEPTH,DROP_DURATION,SETTLE_DURATION} from '../shared/ball.js';
import {SURFACES,launchConditions,landingDepth,terrainAdvice} from '../shared/terrain.js';
export {CUP_RADIUS} from '../shared/ball.js';
import {clamp,distance,heightAt,surfaceAt,slopeAt,clubFor} from '../shared/courses.js';
import {treeColliders,sweepTrees,treeBounce} from '../shared/trees.js';
import {sweepWater,SPLASH_DURATION,WATER_LEVEL} from '../shared/water.js';
import {rollStep,cupContact,sampleRim} from '../shared/putting.js';
import {CLUB_SPIN} from '../shared/clubs.js';
export const DT=1/120;
export const CAPTURE_SPEED=1.9;

export function canCapture(a,b,pin,speed){
 const dx=b.x-a.x,dz=b.z-a.z,t=clamp(((pin.x-a.x)*dx+(pin.z-a.z)*dz)/(dx*dx+dz*dz||1),0,1);
 const offset=Math.hypot(a.x+t*dx-pin.x,a.z+t*dz-pin.z);return offset<CUP_RADIUS&&speed<CAPTURE_SPEED*(1-.55*(offset/CUP_RADIUS)**2);
}
export function simulateShot(h,from,power,dir,aim=0,options={}){
 const club=options.club||clubFor(h,from),putting=club.id==='putter',lie=surfaceAt(h,from.x,from.z);
 const angle=Math.atan2(h.pin.x-from.x,h.pin.z-from.z)+(aim+dir*25*(putting?.3:1))*Math.PI/180;
 const conditions=launchConditions(lie,club,from),terrain=terrainAdvice(h,from,club);
 const speed=club.speed*Math.sqrt(clamp(power,.001,1))*conditions.multiplier,loft=conditions.loft*Math.PI/180;
 let p={x:from.x,y:heightAt(h,from.x,from.z)+BALL_RADIUS,z:from.z},v={x:Math.sin(angle)*speed*Math.cos(loft),y:speed*Math.sin(loft),z:Math.cos(angle)*speed*Math.cos(loft)};
 let rolling=putting,holed=false,penalty=null,bounces=0,t=0,landing=putting?{...p}:null,groundTravel=0,apex=0,captureTime=null,waterTime=null;
 const colliders=treeColliders(h),impacts=[],lastImpact=new Map();
 let lastSurface=lie,lastSandImpact=0,settleTime=null,rim=null,rimTime=null,rimEndTime=null,cupCooldown=0,cupOutcome=null,cupPassUntil=0;
 if(lie==='sand'||lie==='rough')impacts.push({type:lie,phase:'launch',t:0,position:{x:p.x,y:heightAt(h,p.x,p.z),z:p.z},speed,normal:{x:Math.sin(angle),y:0,z:Math.cos(angle)}});
 const startY=p.y;
 const path=[{...p,y:p.y-conditions.depth,t:0}];
 for(let i=0;i<120*35;i++){
  const prev={...p},landedBefore=landing!==null;t=(i+1)*DT;
  if(rim){
   const u=clamp((t-rimTime)/rim.duration,0,1),q=sampleRim(rim,h.pin,u);
   p={x:q.x,y:heightAt(h,q.x,q.z)+BALL_RADIUS-q.dip,z:q.z};groundTravel+=distance(prev,p);path.push({...p,t});
   if(u>=1){
    rimEndTime=t;
    if(rim.kind==='rim_drop'){holed=true;captureTime=t;break;}
    const tangent={x:-Math.sin(q.theta)*rim.sign,z:Math.cos(q.theta)*rim.sign},out={x:Math.cos(q.theta),z:Math.sin(q.theta)},retained=rim.speed*.68;
    v={x:(tangent.x*.96+out.x*.28)*retained,y:0,z:(tangent.z*.96+out.z*.28)*retained};cupCooldown=t+.65;rim=null;
   }
   continue;
  }
  if(!rolling){
   v.x+=(h.wind.x*.12-v.x*.018)*DT;v.z+=(h.wind.z*.12-v.z*.018)*DT;v.y-=9.81*DT;
   p.x+=v.x*DT;p.y+=v.y*DT;p.z+=v.z*DT;
  }else{
   const s=surfaceAt(h,p.x,p.z);if(s==='out'){penalty=s;break;}
   const slope=slopeAt(h,p.x,p.z),friction=(SURFACES[s]||SURFACES.fairway).friction;
   v=rollStep(v,slope,friction,DT);
   if(Math.hypot(v.x,v.z)<1e-7)break;
   v.y=0;p.x+=v.x*DT;p.z+=v.z*DT;p.y=heightAt(h,p.x,p.z)+BALL_RADIUS;
  }
  // 先检查整段运动，再处理地面；高速球也不会跳过细树干或水面。
  const tree=sweepTrees(colliders,prev,p,BALL_RADIUS),water=sweepWater(h,prev,p,BALL_RADIUS);
  if(water&&(!tree||water.fraction<tree.fraction)){
   t=(i+water.fraction)*DT;waterTime=t;penalty='water';p={...water.position,y:WATER_LEVEL+BALL_RADIUS};landing??={...p};
   impacts.push({type:'water',t,position:water.position,speed:Math.hypot(v.x,v.y,v.z)});break;
  }
  if(tree){
   const contactTime=(i+tree.fraction)*DT,incoming=Math.hypot(v.x,v.y,v.z),n=tree.normal;
   p={...tree.position};path.push({...p,t:contactTime});v=treeBounce(v,n,tree.kind);
   // 法向外移仅一毫米；余下的时间下一步再推进，避免回退到整帧起点。
   for(const k of ['x','y','z'])p[k]+=n[k]*(tree.penetration+.001);
   const key=`${tree.treeIndex}:${tree.kind}`;
   if(contactTime-(lastImpact.get(key)??-Infinity)>.18){impacts.push({type:'tree',kind:tree.kind,treeIndex:tree.treeIndex,t:contactTime,position:{...tree.position},normal:{...n},speed:incoming,speedAfter:Math.hypot(v.x,v.y,v.z)});lastImpact.set(key,contactTime);}
  }
  const ground=heightAt(h,p.x,p.z)+BALL_RADIUS,s=surfaceAt(h,p.x,p.z);
  if(p.y<=ground||rolling){
   p.y=ground;landing??={...p};
   if(s==='out'){penalty=s;break;}
   const incoming=Math.hypot(v.x,v.y,v.z),impactSpeed=Math.abs(v.y),profile=SURFACES[s]||SURFACES.fairway;
   if((s==='sand'||s==='rough')&&(!rolling||lastSurface!==s)){
    if(t-(lastImpact.get(s)??-Infinity)>.15){impacts.push({type:s,phase:rolling?'roll':'land',t,position:{x:p.x,y:ground-BALL_RADIUS,z:p.z},speed:incoming,verticalSpeed:impactSpeed,normal:{x:v.x/(incoming||1),y:0,z:v.z/(incoming||1)}});lastImpact.set(s,t);path.push({...p,t});}
    if(s==='sand')lastSandImpact=impactSpeed;
    if(rolling){v.x*=s==='sand'?.55:.78;v.z*=s==='sand'?.55:.78;}
   }
   if(!rolling&&s!=='sand'&&s!=='rough'&&impactSpeed>.6)impacts.push({type:'ground',surface:s,phase:'land',t,position:{x:p.x,y:ground-BALL_RADIUS,z:p.z},speed:incoming,verticalSpeed:impactSpeed});
   if(!rolling){const spin=bounces===0?(CLUB_SPIN[club.id]??1):1;v.y=Math.abs(v.y)*profile.bounce*spin;v.x*=profile.retention*spin;v.z*=profile.retention*spin;if(v.y<1.3||++bounces>2)rolling=true;}
   lastSurface=s;
  }
  if(rolling&&!tree&&options.capture!==false&&s==='green'&&t>=cupCooldown){
   const contact=cupContact(prev,p,h.pin,v);
   if(contact){
    cupOutcome=contact.kind;impacts.push({type:'cup',kind:contact.kind,phase:'entry',t,position:{x:contact.x,y:heightAt(h,contact.x,contact.z),z:contact.z},speed:contact.speed});
    if(contact.kind==='drop'){holed=true;captureTime=t;break;}
    if(['rim_drop','lip_out'].includes(contact.kind)){
     rim=contact;rimTime=t;p={x:contact.x,y:heightAt(h,contact.x,contact.z)+BALL_RADIUS,z:contact.z};path.push({...p,t});continue;
    }
    // 高速越洞和轻擦边仍按原方向滚出，不把近失球吸到洞口。
    cupCooldown=t+.65;cupPassUntil=contact.kind==='roll_over'?t+.65:0;v.x*=.94;v.z*=.94;
    if(contact.kind==='graze'){const nx=(contact.x-h.pin.x)/contact.outer,nz=(contact.z-h.pin.z)/contact.outer,inward=Math.min(0,v.x*nx+v.z*nz);v.x-=nx*inward*.12;v.z-=nz*inward*.12;}
   }
  }
  if(rolling&&t<cupPassUntil){const gap=Math.max(0,CUP_RADIUS-distance(p,h.pin));p.y-=Math.min(.045,BALL_RADIUS-Math.sqrt(Math.max(0,BALL_RADIUS**2-gap**2)));}
  apex=Math.max(apex,p.y-startY);if(landedBefore)groundTravel+=distance(prev,p);
  if(i%4===0)path.push({...p,t});
 }
 if(path.at(-1).t===t)path[path.length-1]={...p,t};else path.push({...p,t});
 const end={...p};
 const endSurface=surfaceAt(h,end.x,end.z),depth=!penalty&&!holed&&endSurface==='sand'?landingDepth(lastSandImpact):0;
 if(holed){const entry={...p},ground=heightAt(h,h.pin.x,h.pin.z);for(let k=1;k<=32;k++){const u=k/32,roll=Math.min(1,u/.42),fall=Math.min(1,Math.max(0,(u-.12)/.72)),bounce=u>.84?.025*Math.sin((u-.84)/.16*Math.PI):0;p={x:entry.x+(h.pin.x-entry.x)*roll,y:ground+BALL_RADIUS-CUP_DEPTH*fall*fall+bounce,z:entry.z+(h.pin.z-entry.z)*roll};path.push({...p,t:captureTime+u});}impacts.push({type:'cup',kind:'drop',phase:'bottom',t:captureTime+.84,position:{x:h.pin.x,y:ground-CUP_DEPTH,z:h.pin.z},speed:.5});t=captureTime+1;}
 if(waterTime!==null){for(let k=1;k<=24;k++){const u=k/24;p={x:end.x,y:end.y-.8*u,z:end.z};path.push({...p,t:waterTime+u});}t=waterTime+1;}
 if(!penalty&&!holed&&['sand','rough'].includes(endSurface)){settleTime=t;for(let k=1;k<=16;k++){const u=k/16;p={x:end.x,y:end.y-depth*u*u*(3-2*u),z:end.z};path.push({...p,t:settleTime+u});}t=settleTime+1;}
 const to=penalty&&!h.practice?{...from}:{x:p.x,z:p.z,...(depth?{sandDepth:depth}:{})};
 const travelTime=captureTime??waterTime??settleTime??t,baseDuration=clamp(travelTime*(putting?.8:.48),1.3,8),rimExtra=rimTime!==null&&rimEndTime!==null?Math.max(0,1.05-(rimEndTime-rimTime)*baseDuration/Math.max(.01,travelTime)):0;
 return {from,to,path,holed,penalty,impacts,waterTime,settleTime,terrain,endSurface,cupOutcome,rimTime,rimEndTime,rimExtra,lie:surfaceAt(h,to.x,to.z),travel:distance(from,end),duration:baseDuration+rimExtra+(holed?DROP_DURATION:waterTime!==null?SPLASH_DURATION:settleTime!==null?SETTLE_DURATION:0),captureTime,club:club.name,clubId:club.id,power,dir,carry:putting?0:distance(from,landing||end),landing:landing?{x:landing.x,z:landing.z}:null,roll:groundTravel,apex,ballSpeed:speed,launchAngle:(aim+dir*25*(putting?.3:1)),loft:conditions.loft};
}
