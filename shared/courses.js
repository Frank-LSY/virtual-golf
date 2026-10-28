import {COURSE_DESIGNS} from './course-designs.js';
import {courseLayout,localToCourse} from './course-layout.js';
export const COURSES = COURSE_DESIGNS;
export const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
export const distance = (a, b) => Math.hypot(a.x-b.x, a.z-b.z);
export const WATER_LEVEL=.1;
export function random(seed) { let a = seed >>> 0; return () => { a += 0x6D2B79F5; let t=a; t=Math.imul(t ^ t>>>15,t|1); t^=t+Math.imul(t^t>>>7,t|61); return ((t^t>>>14)>>>0)/4294967296; }; }
export function makeHole(courseId='sunny', index=0, seed=1) {
  const course = COURSES.find(c=>c.id===courseId) || COURSES[0];
  const [name,par,length,bend,design] = course.holes[index];
  const rng = random(seed+index*7919+COURSES.indexOf(course)*1223);
  const points=[{x:0,z:0},{x:bend*.35,z:length*.27},{x:bend,z:length*.57},{x:bend*.3,z:length*.83},{x:0,z:length}];
  const challenge=design.challenge,width=course.width*(challenge<=2?1.08:challenge>=5?.92:1),greenRadius=course.greenRadius+(challenge<=2?1:0);
  const pin={x:(rng()-.5)*greenRadius*.48,z:length+(rng()-.5)*greenRadius*.4};
  const hazards=designedHazards(course,index,width,greenRadius);
  const placement=courseLayout(course.id).placements[index];
  // 同一球局的主风向固定在全场坐标中；转向另一洞时顺风、逆风关系自然改变。
  const weather=random(seed+8191),worldAngle=weather()*Math.PI*2,angle=worldAngle-placement.heading;
  const speed=course.wind[0]+weather()*(course.wind[1]-course.wind[0]);
  const hole={courseId:course.id,index,name,par,length,bend,points,pin,tee:{x:0,z:0},hazards,seed:seed+index*7919,wind:{x:Math.sin(angle)*speed,z:Math.cos(angle)*speed,speed},width,greenRadius,slope:course.slope*(.75+challenge*.07)*(index%2===0?1:-1),elevation:course.elevation,challenge,advice:design.advice,pattern:design.pattern,placement,bounds:{minX:-105,maxX:105,minZ:-55,maxZ:length+60}};
  hole.route=Array.from({length:81},(_,i)=>routeAt(hole,i/80));
  hole.trees=makeTrees(hole);
  return hole;
}
export function designedHazards(course,index,width=course.width,r=course.greenRadius){
 const [,par,length,bend,design]=course.holes[index],pattern=design.pattern,side=bend<0?-1:1;
 const bunker=(x,z,rx=7,rz=10,angle=0)=>({type:'sand',x,z,rx,rz,angle});
 const left=bunker(-r-6,length-9,6,10,.3),right=bunker(r+6,length-11,7,11,-.4);
 const hazards=pattern==='left-green'?[left]:pattern==='split-green'?[left,right]:[right];
 if(['inside-bunker','double-bunker'].includes(pattern))hazards.push(bunker(bend-side*(width+1),length*.57,8,15,side*.4));
 if(pattern==='double-bunker')hazards.push(left);
 if(pattern==='layup')hazards.push(bunker(bend-width-6,length*.48,9,19,.25),bunker(width+9,length*.76,7,14,-.4));
 if(pattern==='side-water')hazards.push({type:'water',x:(course.id==='orchard'?1:-1)*(width+24),z:length*.6,rx:18,rz:Math.min(48,length*.19),angle:.12});
 if(course.id==='desert'&&par>3)hazards.push(bunker(-width-20,length*.27,13,30,-.1));
 return hazards;
}
export function routeAt(h,t){
  const n=h.points.length-1,v=clamp(t,0,.999999)*n,i=Math.floor(v),u=v-i;
  const a=h.points[Math.max(0,i-1)],b=h.points[i],c=h.points[Math.min(n,i+1)],d=h.points[Math.min(n,i+2)];
  const axis=k=>.5*((2*b[k])+(-a[k]+c[k])*u+(2*a[k]-5*b[k]+4*c[k]-d[k])*u*u+(-a[k]+3*b[k]-3*c[k]+d[k])*u*u*u);
  return {x:axis('x'),z:axis('z')};
}
export function routeDistance(h,x,z){
  let best=Infinity;
  for(let i=1;i<h.route.length;i++) {const a=h.route[i-1],b=h.route[i],dx=b.x-a.x,dz=b.z-a.z,t=clamp(((x-a.x)*dx+(z-a.z)*dz)/(dx*dx+dz*dz),0,1);best=Math.min(best,Math.hypot(x-a.x-t*dx,z-a.z-t*dz));}
  return best;
}
export function ellipseValue(p,x,z){const c=Math.cos(p.angle||0),s=Math.sin(p.angle||0),dx=x-p.x,dz=z-p.z; return ((dx*c+dz*s)/p.rx)**2+((-dx*s+dz*c)/p.rz)**2;}
export function landValue(h,x,z){ return (x/98)**4+((z-h.length/2)/(h.length/2+48))**6; }
export function surfaceAt(h,x,z){
  if(h.practice){if(!Number.isFinite(x+z)||x<h.bounds.minX||x>h.bounds.maxX||z<h.bounds.minZ||z>h.bounds.maxZ)return 'out';return h.putting?'green':Math.abs(x)<76?'fairway':'rough';}
  if(landValue(h,x,z)>1 || !Number.isFinite(x+z)) return 'out';
  // 水面覆盖沙坑时优先按实际水面判定；高于水面的干燥岸坡仍可击球。
  if(h.hazards.some(p=>p.type==='water'&&ellipseValue(p,x,z)<1)&&heightAt(h,x,z)<=WATER_LEVEL)return 'water';
  for(const p of h.hazards)if(p.type!=='water'&&ellipseValue(p,x,z)<1)return p.type;
  if(Math.hypot(x,z-h.length)<h.greenRadius) return 'green';
  if(Math.abs(x)<5 && Math.abs(z)<4) return 'tee';
  if(routeDistance(h,x,z)<h.width*(.86+.14*Math.sin(z*.035))) return 'fairway';
  return 'rough';
}
export function heightAt(h,x,z){
  if(h.practice)return 3;
  const base=3+Math.sin(z*.027)*h.elevation+Math.sin(x*.045+z*.012)*h.elevation*.45;
  const greenBase=3+Math.sin(h.length*.027)*h.elevation+Math.sin(h.length*.012)*h.elevation*.45;
  const g=clamp((Math.hypot(x,z-h.length)-h.greenRadius)/12,0,1);
  let y=base*g+(greenBase+(x-h.pin.x)*h.slope+(z-h.pin.z)*h.slope*.65)*(1-g);
  for(const p of h.hazards)if(p.type==='sand'){const e=ellipseValue(p,x,z),u=clamp((e-.18)/1.07,0,1);y-=.55*(1-u*u*(3-2*u));}
  for(const p of h.hazards) if(p.type==='water'){const e=ellipseValue(p,x,z); if(e<1.6)y=y*clamp((e-.85)/.75,0,1)-.4*(1-clamp((e-.85)/.75,0,1));}
  const edge=clamp((landValue(h,x,z)-.72)/.35,0,1);y=y*(1-edge);
  return y;
}
export function slopeAt(h,x,z){ const e=.3;return {x:(heightAt(h,x+e,z)-heightAt(h,x-e,z))/(2*e),z:(heightAt(h,x,z+e)-heightAt(h,x,z-e))/(2*e)}; }
export function makeTrees(h){
  const rng=random(h.seed+4583),trees=[];
  for(let i=0;i<900 && trees.length<(COURSES.find(c=>c.id===h.courseId)?.treeCount||70);i++){
    const x=(rng()-.5)*184,z=-25+rng()*(h.length+60),lie=surfaceAt(h,x,z);
    if(lie==='rough'&&routeDistance(h,x,z)>h.width+10&&landValue(h,x,z)<.8&&distance({x,z},h.pin)>h.greenRadius+10&&(!h.placement||distance(localToCourse(h.placement,{x,z}),courseLayout(h.courseId).clubhouse)>22))trees.push({x,z,scale:.8+rng()*.8,rotation:rng()*Math.PI*2});
  }return trees;
}
export function clubFor(h,ball){
 const lie=surfaceAt(h,ball.x,ball.z),d=distance(ball,h.pin);
 if(lie==='green')return {id:'putter',name:'推杆',mode:'果岭推杆',range:28,speed:5.4,loft:0};
 if(lie==='sand')return {id:'sand',name:'沙坑杆',mode:'沙坑救球',range:55,speed:25,loft:56};
 if(d<35)return {id:'chip',name:'劈起杆',mode:'短距离切球',range:38,speed:18,loft:40};
 if(d<90)return {id:'wedge',name:'挖起杆',mode:'攻果岭',range:85,speed:29,loft:50};
 if(d<185)return {id:'iron',name:'7 号铁杆',mode:'攻果岭',range:165,speed:39,loft:37};
 return {id:'driver',name:'一号木杆',mode:'远距离击球',range:265,speed:51,loft:28};
}
