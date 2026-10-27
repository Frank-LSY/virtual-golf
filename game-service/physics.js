import {clamp,distance,heightAt,surfaceAt,slopeAt,clubFor} from '../shared/courses.js';
export const DT=1/120;
export const CAPTURE_SPEED=1.9;
export const CUP_RADIUS=.48;
export function canCapture(a,b,pin,speed){
 const dx=b.x-a.x,dz=b.z-a.z,t=clamp(((pin.x-a.x)*dx+(pin.z-a.z)*dz)/(dx*dx+dz*dz||1),0,1);
 return speed<CAPTURE_SPEED&&Math.hypot(a.x+t*dx-pin.x,a.z+t*dz-pin.z)<CUP_RADIUS;
}
export function simulateShot(h,from,power,dir,aim=0,options={}){
 const club=options.club||clubFor(h,from),putting=club.id==='putter',lie=surfaceAt(h,from.x,from.z);
 const angle=Math.atan2(h.pin.x-from.x,h.pin.z-from.z)+(aim+dir*25*(putting?.3:1))*Math.PI/180;
 const speed=club.speed*Math.sqrt(clamp(power,.001,1))*(lie==='rough'?.82:1),loft=club.loft*Math.PI/180;
 let p={x:from.x,y:heightAt(h,from.x,from.z)+.16,z:from.z},v={x:Math.sin(angle)*speed*Math.cos(loft),y:speed*Math.sin(loft),z:Math.cos(angle)*speed*Math.cos(loft)};
 let rolling=putting,holed=false,penalty=null,bounces=0,t=0,landing=putting?{...p}:null,groundTravel=0,apex=0;
 const startY=p.y;
 const path=[{...p,t:0}];
 for(let i=0;i<120*35;i++){
  const prev={...p},landedBefore=landing!==null;t=(i+1)*DT;
  if(!rolling){
   v.x+=(h.wind.x*.12-v.x*.018)*DT;v.z+=(h.wind.z*.12-v.z*.018)*DT;v.y-=9.81*DT;
   p.x+=v.x*DT;p.y+=v.y*DT;p.z+=v.z*DT;
   const ground=heightAt(h,p.x,p.z)+.16;
   if(p.y<=ground){
    p.y=ground;landing??={...p};const s=surfaceAt(h,p.x,p.z);
    if(s==='water'||s==='out'){penalty=s;break;}
    const bounce=s==='sand'?.02:s==='rough'?.09:.22;v.y=Math.abs(v.y)*bounce;v.x*=s==='sand'?.2:.66;v.z*=s==='sand'?.2:.66;
    if(v.y<1.3||++bounces>2)rolling=true;
   }
  }else{
   const s=surfaceAt(h,p.x,p.z);if(s==='water'||s==='out'){penalty=s;break;}
   const slope=slopeAt(h,p.x,p.z),friction={green:.53,fairway:1.8,tee:1.8,rough:4.8,sand:9}[s]||3;
   const vl=Math.hypot(v.x,v.z),g=4.5;
   if(vl<.1&&Math.hypot(slope.x,slope.z)*g<friction){v.x=0;v.z=0;break;}
   const drag=Math.max(0,1-friction*DT/(vl||1));v.x=v.x*drag-slope.x*g*DT;v.z=v.z*drag-slope.z*g*DT;
   p.x+=v.x*DT;p.z+=v.z*DT;p.y=heightAt(h,p.x,p.z)+.16;
   if(options.capture!==false&&s==='green'&&canCapture(prev,p,h.pin,Math.hypot(v.x,v.z))){holed=true;p={x:h.pin.x,y:heightAt(h,h.pin.x,h.pin.z)-.1,z:h.pin.z};break;}
  }
  for(const tree of h.trees){if(Math.hypot(p.x-tree.x,p.z-tree.z)<.8*tree.scale&&p.y<heightAt(h,tree.x,tree.z)+8*tree.scale){v.x*=-.35;v.z*=-.35;p.x=prev.x;p.z=prev.z;break;}}
  apex=Math.max(apex,p.y-startY);if(landedBefore)groundTravel+=distance(prev,p);
  if(i%4===0)path.push({...p,t});
  if(rolling&&Math.hypot(v.x,v.z)<.08)break;
 }
 path.push({...p,t});
 const to=penalty&&!h.practice?{...from}:{x:p.x,z:p.z};
 return {from,to,path,holed,penalty,lie:surfaceAt(h,to.x,to.z),travel:distance(from,p),duration:clamp(t*.48,1.3,8),club:club.name,power,dir,carry:putting?0:distance(from,landing||p),roll:groundTravel,apex,ballSpeed:speed,launchAngle:(aim+dir*25*(putting?.3:1)),loft:club.loft};
}
