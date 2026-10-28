import * as THREE from 'three';
import {heightAt} from '../shared/courses.js';

// 击球预判：用服务器下发的无风落点表插值，显示当前力度的弹道虚点、落点圈和停球点。
// 只做显示，不参与裁定；风的影响需要玩家根据风向罗盘自行补偿。
const DOTS=34;
export function interpolateForecast(forecast,ball,power){
 const marks=forecast?.marks;if(!marks?.length||!ball)return null;
 const p=Math.max(0,Math.min(1,power)),base={power:0,landing:{x:ball.x,z:ball.z},end:{x:ball.x,z:ball.z},carry:0,total:0,apex:0};
 const list=[base,...marks];let i=1;while(i<list.length-1&&list[i].power<p)i++;
 const a=list[i-1],b=list[i],t=Math.max(0,Math.min(1,(p-a.power)/((b.power-a.power)||1))),mix=(x,y)=>x+(y-x)*t;
 return {power:p,landing:{x:mix(a.landing.x,b.landing.x),z:mix(a.landing.z,b.landing.z)},end:{x:mix(a.end.x,b.end.x),z:mix(a.end.z,b.end.z)},carry:mix(a.carry,b.carry),total:mix(a.total,b.total),apex:mix(a.apex,b.apex),max:marks.at(-1)};
}

export class ShotGuide extends THREE.Group {
 constructor(){
  super();this.visible=false;this.renderOrder=4;
  const dot=new THREE.SphereGeometry(1,10,8),white=new THREE.MeshBasicMaterial({color:'#ffffff',transparent:true,opacity:.95,depthWrite:false,toneMapped:false});
  this.dots=new THREE.InstancedMesh(dot,white,DOTS);this.dots.frustumCulled=false;this.dots.renderOrder=5;this.add(this.dots);
  const ring=(inner,outer,color,opacity)=>{const m=new THREE.Mesh(new THREE.RingGeometry(inner,outer,64),new THREE.MeshBasicMaterial({color,transparent:true,opacity,side:THREE.DoubleSide,depthWrite:false,toneMapped:false}));m.rotation.x=-Math.PI/2;m.renderOrder=6;return m;};
  this.landing=new THREE.Group();this.landingFill=ring(0,2.1,'#ffd23f',.28);this.landingRing=ring(1.75,2.15,'#ffd23f',.95);this.landingCore=ring(0,.32,'#ffffff',.95);this.landing.add(this.landingFill,this.landingRing,this.landingCore);this.add(this.landing);
  this.maxRing=ring(1.3,1.5,'#ffffff',.42);this.add(this.maxRing);
  this.rest=ring(0,.45,'#ffffff',.85);this.add(this.rest);
  this.rollLine=new THREE.Mesh(new THREE.BufferGeometry(),new THREE.MeshBasicMaterial({color:'#ffffff',transparent:true,opacity:.6,depthWrite:false,toneMapped:false}));this.rollLine.renderOrder=5;this.add(this.rollLine);
  this.dummy=new THREE.Object3D();this.info=null;this.pulse=0;
 }
 update(hole,ball,forecast,power,putting,heading){
  const f=interpolateForecast(forecast,ball,power);this.info=f;if(!f||!hole){this.visible=false;return null;}
  const y0=heightAt(hole,ball.x,ball.z)+.12,ly=heightAt(hole,f.landing.x,f.landing.z),dx=f.landing.x-ball.x,dz=f.landing.z-ball.z,length=Math.hypot(dx,dz);
  if(putting){
   // 推杆只沿瞄准线显示平地滚动距离，不暴露坡度借位。
   const a=Math.atan2(f.end.x-ball.x,f.end.z-ball.z),aimX=Math.sin(heading??a),aimZ=Math.cos(heading??a),d=f.total;
   for(let i=0;i<DOTS;i++){const u=(i+1)/DOTS,x=ball.x+aimX*d*u,z=ball.z+aimZ*d*u,s=.045;this.dummy.position.set(x,heightAt(hole,x,z)+.05,z);this.dummy.scale.setScalar(i%2?0:s);this.dummy.updateMatrix();this.dots.setMatrixAt(i,this.dummy.matrix);}
   const ex=ball.x+aimX*d,ez=ball.z+aimZ*d;this.landing.position.set(ex,heightAt(hole,ex,ez)+.03,ez);this.landing.scale.setScalar(.22);this.maxRing.visible=false;this.rest.visible=false;this.rollLine.visible=false;f.anchor={x:ex,z:ez,y:heightAt(hole,ex,ez)};
  }else{
   const apex=Math.max(1.2,f.apex);
   const start=Math.min(.35,3/Math.max(1,length));for(let i=0;i<DOTS;i++){const u=start+(1-start)*(i+1)/(DOTS+1),x=ball.x+dx*u,z=ball.z+dz*u,base=y0+(ly-y0)*u,h=base+4*apex*u*(1-u);this.dummy.position.set(x,h,z);this.dummy.scale.setScalar((.05+.07*Math.min(1,u*length/25))*Math.max(.6,Math.min(1.6,length/80)));this.dummy.updateMatrix();this.dots.setMatrixAt(i,this.dummy.matrix);}
   const scale=Math.max(.7,Math.min(2.4,length/55));this.landing.position.set(f.landing.x,ly+.06,f.landing.z);this.landing.scale.setScalar(scale);
   const m=f.max;this.maxRing.visible=!!m&&f.power<.97;if(m){this.maxRing.position.set(m.landing.x,heightAt(hole,m.landing.x,m.landing.z)+.05,m.landing.z);this.maxRing.scale.setScalar(Math.max(.7,Math.min(2.4,Math.hypot(m.landing.x-ball.x,m.landing.z-ball.z)/55)));}
   const roll=Math.hypot(f.end.x-f.landing.x,f.end.z-f.landing.z);this.rest.visible=roll>1.2;this.rest.position.set(f.end.x,heightAt(hole,f.end.x,f.end.z)+.05,f.end.z);this.rest.scale.setScalar(Math.max(.8,scale*.8));
   this.rollLine.visible=roll>1.2;if(roll>1.2){const n=Math.max(2,Math.ceil(roll/1.2)),v=[],idx=[],w=.09*scale;for(let i=0;i<=n;i++){const u=i/n,x=f.landing.x+(f.end.x-f.landing.x)*u,z=f.landing.z+(f.end.z-f.landing.z)*u,y=heightAt(hole,x,z)+.06,nx=-(f.end.z-f.landing.z)/roll*w,nz=(f.end.x-f.landing.x)/roll*w;v.push(x+nx,y,z+nz,x-nx,y,z-nz);if(i<n&&i%2===0)idx.push(i*2,i*2+1,i*2+2,i*2+1,i*2+3,i*2+2);}this.rollLine.geometry.dispose();const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(v,3));g.setIndex(idx);this.rollLine.geometry=g;}
   f.anchor={x:f.landing.x,z:f.landing.z,y:ly};
  }
  this.dots.instanceMatrix.needsUpdate=true;this.visible=true;return f;
 }
 tick(dt){if(!this.visible)return;this.pulse+=dt;const s=1+Math.sin(this.pulse*3.2)*.06;this.landingRing.scale.setScalar(s);this.landingFill.material.opacity=.22+.1*(.5+.5*Math.sin(this.pulse*3.2));}
}
