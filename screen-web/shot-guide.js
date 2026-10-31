import * as THREE from 'three';
import {heightAt} from '../shared/courses.js';

// 击球预判：用服务器下发的落点表插值，显示当前力度的弹道虚点、落点圈和停球点。
// 只做显示，不参与裁定。黄色落点圈为无风落点；0.22 起再用浅蓝色圈与箭头标出“当前风下”的落点（风偏）。
// 落点圈另有一层“透视”描边，被树木、坡地挡住时仍能看到位置；远距离镜头（球道俯视、洞杯特写拉远）下自动放大。
const DOTS=34;
export function interpolateForecast(forecast,ball,power){
 const marks=forecast?.marks;if(!marks?.length||!ball)return null;
 const p=Math.max(0,Math.min(1,power)),base={power:0,landing:{x:ball.x,z:ball.z},end:{x:ball.x,z:ball.z},windLanding:{x:ball.x,z:ball.z},windEnd:{x:ball.x,z:ball.z},carry:0,total:0,apex:0};
 const list=[base,...marks];let i=1;while(i<list.length-1&&list[i].power<p)i++;
 const a=list[i-1],b=list[i],t=Math.max(0,Math.min(1,(p-a.power)/((b.power-a.power)||1))),mix=(x,y)=>x+(y-x)*t,point=k=>{const u=a[k]||a.landing,v=b[k]||b.landing;return {x:mix(u.x,v.x),z:mix(u.z,v.z)};};
 const landing=point('landing'),windLanding=point('windLanding');
 return {power:p,landing,end:point('end'),windLanding,windEnd:point('windEnd'),drift:Math.hypot(windLanding.x-landing.x,windLanding.z-landing.z),carry:mix(a.carry,b.carry),total:mix(a.total,b.total),apex:mix(a.apex,b.apex),max:marks.at(-1)};
}

export class ShotGuide extends THREE.Group {
 constructor(){
  super();this.visible=false;this.renderOrder=4;
  const dot=new THREE.SphereGeometry(1,10,8),white=new THREE.MeshBasicMaterial({color:'#ffffff',transparent:true,opacity:.95,depthWrite:false,toneMapped:false});
  this.dots=new THREE.InstancedMesh(dot,white,DOTS);this.dots.frustumCulled=false;this.dots.renderOrder=5;this.add(this.dots);
  const ring=(inner,outer,color,opacity,xray=false)=>{const m=new THREE.Mesh(new THREE.RingGeometry(inner,outer,64),new THREE.MeshBasicMaterial({color,transparent:true,opacity,side:THREE.DoubleSide,depthWrite:false,depthTest:!xray,toneMapped:false}));m.rotation.x=-Math.PI/2;m.renderOrder=xray?7:6;m.userData.noOutline=true;return m;};
  this.landing=new THREE.Group();this.landingFill=ring(0,2.1,'#ffd23f',.28);this.landingRing=ring(1.75,2.15,'#ffd23f',.95);this.landingCore=ring(0,.32,'#ffffff',.95);
  // 透视层：不做深度测试的半透明描边，被遮挡时仍能看到。
  this.landingXray=ring(1.8,2.1,'#ffd23f',.42,true);this.landingCoreXray=ring(0,.28,'#ffffff',.5,true);
  this.landing.add(this.landingFill,this.landingRing,this.landingCore,this.landingXray,this.landingCoreXray);this.add(this.landing);
  this.maxRing=ring(1.3,1.5,'#ffffff',.42);this.add(this.maxRing);
  this.rest=ring(0,.45,'#ffffff',.85);this.restXray=ring(0,.4,'#ffffff',.38,true);this.rest.add(this.restXray);this.restXray.rotation.x=0;this.add(this.rest);
  this.rollLine=new THREE.Mesh(new THREE.BufferGeometry(),new THREE.MeshBasicMaterial({color:'#ffffff',transparent:true,opacity:.6,depthWrite:false,toneMapped:false}));this.rollLine.renderOrder=5;this.add(this.rollLine);
  // 风偏：浅蓝色落点圈 + 地面箭头（从无风落点指向含风落点）。
  this.wind=new THREE.Group();this.windRing=ring(1.25,1.6,'#7fd3ff',.95);this.windXray=ring(1.3,1.55,'#7fd3ff',.4,true);this.wind.add(this.windRing,this.windXray);this.add(this.wind);
  this.windArrow=new THREE.Mesh(new THREE.BufferGeometry(),new THREE.MeshBasicMaterial({color:'#7fd3ff',transparent:true,opacity:.85,side:THREE.DoubleSide,depthWrite:false,toneMapped:false}));this.windArrow.renderOrder=6;this.add(this.windArrow);
  this.dummy=new THREE.Object3D();this.info=null;this.pulse=0;this.baseScale={landing:1,rest:1,wind:1,dot:1};
 }
 update(hole,ball,forecast,power,putting,heading){
  const f=interpolateForecast(forecast,ball,power);this.info=f;if(!f||!hole){this.visible=false;return null;}
  const y0=heightAt(hole,ball.x,ball.z)+.12,ly=heightAt(hole,f.landing.x,f.landing.z),dx=f.landing.x-ball.x,dz=f.landing.z-ball.z,length=Math.hypot(dx,dz);
  if(putting){
   // 推杆只沿瞄准线显示平地滚动距离，不暴露坡度借位。
   const a=Math.atan2(f.end.x-ball.x,f.end.z-ball.z),aimX=Math.sin(heading??a),aimZ=Math.cos(heading??a),d=f.total;
   for(let i=0;i<DOTS;i++){const u=(i+1)/DOTS,x=ball.x+aimX*d*u,z=ball.z+aimZ*d*u,s=.045;this.dummy.position.set(x,heightAt(hole,x,z)+.05,z);this.dummy.scale.setScalar(i%2?0:s);this.dummy.updateMatrix();this.dots.setMatrixAt(i,this.dummy.matrix);}
   const ex=ball.x+aimX*d,ez=ball.z+aimZ*d;this.landing.position.set(ex,heightAt(hole,ex,ez)+.03,ez);this.baseScale.landing=.22;this.maxRing.visible=false;this.rest.visible=false;this.rollLine.visible=false;this.wind.visible=false;this.windArrow.visible=false;f.anchor={x:ex,z:ez,y:heightAt(hole,ex,ez)};f.target=f.anchor;f.putt=true;
  }else{
   const apex=Math.max(1.2,f.apex);
   const start=Math.min(.35,3/Math.max(1,length));for(let i=0;i<DOTS;i++){const u=start+(1-start)*(i+1)/(DOTS+1),x=ball.x+dx*u,z=ball.z+dz*u,base=y0+(ly-y0)*u,h=base+4*apex*u*(1-u);this.dummy.position.set(x,h,z);this.dummy.scale.setScalar((.05+.07*Math.min(1,u*length/25))*Math.max(.6,Math.min(1.6,length/80)));this.dummy.updateMatrix();this.dots.setMatrixAt(i,this.dummy.matrix);}
   const scale=Math.max(.7,Math.min(2.4,length/55));this.landing.position.set(f.landing.x,ly+.06,f.landing.z);this.baseScale.landing=scale;
   const m=f.max;this.maxRing.visible=!!m&&f.power<.97;if(m){this.maxRing.position.set(m.landing.x,heightAt(hole,m.landing.x,m.landing.z)+.05,m.landing.z);this.maxRing.scale.setScalar(Math.max(.7,Math.min(2.4,Math.hypot(m.landing.x-ball.x,m.landing.z-ball.z)/55)));}
   const roll=Math.hypot(f.end.x-f.landing.x,f.end.z-f.landing.z);this.rest.visible=roll>1.2;this.rest.position.set(f.end.x,heightAt(hole,f.end.x,f.end.z)+.05,f.end.z);this.baseScale.rest=Math.max(.8,scale*.8);
   this.rollLine.visible=roll>1.2;if(roll>1.2)this.rollLine.geometry=this.strip(hole,f.landing,f.end,.09*scale,1.2,this.rollLine.geometry);
   const drift=f.drift;this.wind.visible=drift>.8;this.windArrow.visible=drift>.8;
   if(drift>.8){const w=f.windLanding;this.wind.position.set(w.x,heightAt(hole,w.x,w.z)+.07,w.z);this.baseScale.wind=scale*.85;this.windArrow.geometry=this.arrow(hole,f.landing,w,.16*scale,this.windArrow.geometry);}
   f.anchor={x:f.landing.x,z:f.landing.z,y:ly};f.target=drift>.8?{x:(f.landing.x+f.windLanding.x)/2,z:(f.landing.z+f.windLanding.z)/2,y:ly}:f.anchor;
  }
  this.dots.instanceMatrix.needsUpdate=true;this.visible=true;this.applyScale(1);return f;
 }
 // 沿地面铺一条虚线带（停球滚动线）。
 strip(hole,a,b,w,step,old){const len=Math.hypot(b.x-a.x,b.z-a.z),n=Math.max(2,Math.ceil(len/step)),v=[],idx=[];for(let i=0;i<=n;i++){const u=i/n,x=a.x+(b.x-a.x)*u,z=a.z+(b.z-a.z)*u,y=heightAt(hole,x,z)+.06,nx=-(b.z-a.z)/len*w,nz=(b.x-a.x)/len*w;v.push(x+nx,y,z+nz,x-nx,y,z-nz);if(i<n&&i%2===0)idx.push(i*2,i*2+1,i*2+2,i*2+1,i*2+3,i*2+2);}old?.dispose();const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(v,3));g.setIndex(idx);return g;}
 // 地面箭头：实线箭身 + 三角箭头，指向含风落点。
 arrow(hole,a,b,w,old){const len=Math.hypot(b.x-a.x,b.z-a.z)||1,ux=(b.x-a.x)/len,uz=(b.z-a.z)/len,nx=-uz,nz=ux,head=Math.min(len*.45,w*7),shaft=Math.max(0,len-head),v=[],idx=[],y=(x,z)=>heightAt(hole,x,z)+.08,n=Math.max(1,Math.ceil(shaft/1.5));
  for(let i=0;i<=n;i++){const u=shaft*i/n,x=a.x+ux*u,z=a.z+uz*u;v.push(x+nx*w,y(x,z),z+nz*w,x-nx*w,y(x,z),z-nz*w);if(i<n)idx.push(i*2,i*2+1,i*2+2,i*2+1,i*2+3,i*2+2);}
  const base=v.length/3,hx=a.x+ux*shaft,hz=a.z+uz*shaft;v.push(hx+nx*w*3,y(hx,hz),hz+nz*w*3,hx-nx*w*3,y(hx,hz),hz-nz*w*3,b.x,y(b.x,b.z),b.z);idx.push(base,base+1,base+2);
  old?.dispose();const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(v,3));g.setIndex(idx);return g;}
 applyScale(factor){this.landing.scale.setScalar(this.baseScale.landing*factor);this.rest.scale.setScalar(this.baseScale.rest*factor);this.wind.scale.setScalar(this.baseScale.wind*factor);}
 // camera：按镜头距离放大标记，远处（俯视、拉远的洞杯特写）也看得清。
 tick(dt,camera){if(!this.visible)return;this.pulse+=dt;const s=1+Math.sin(this.pulse*3.2)*.06;this.landingRing.scale.setScalar(s);this.landingFill.material.opacity=.22+.1*(.5+.5*Math.sin(this.pulse*3.2));
  if(camera){const p=this.landing.getWorldPosition(new THREE.Vector3()),d=p.distanceTo(camera.position);this.applyScale(Math.max(1,d/(this.info?.putt?14:70)));}
 }
}
