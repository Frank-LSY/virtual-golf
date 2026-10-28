import {environmentTexture,ATLAS_GLSL} from './environment-textures.js';
import * as THREE from 'three';
import {random} from '../shared/courses.js';

function release(group){const geometries=new Set(),materials=new Set();group.traverse(o=>{if(o.geometry)geometries.add(o.geometry);if(o.material)materials.add(o.material);});for(const g of geometries)g.dispose();for(const m of materials)m.dispose();}
export class ImpactEffects extends THREE.Group {
 constructor(onImpact=()=>{}){super();this.onImpact=onImpact;this.bursts=[];this.events=[];this.next=0;}
 reset(shot={}){for(const burst of this.bursts){this.remove(burst.root);release(burst.root);}this.bursts=[];this.events=shot.impacts||[];this.next=0;}
 sample(physicalTime,now){while(this.next<this.events.length&&this.events[this.next].t<=physicalTime){const event=this.events[this.next++];this.emit(event,now);this.onImpact(event,now);}}
 emit(event,now){
  if(event.type==='ground')return;
  if(event.type==='cup'){
   const root=new THREE.Group();root.position.copy(event.position);this.add(root);
   const ring=new THREE.Mesh(new THREE.RingGeometry(.045,.06,24),new THREE.MeshBasicMaterial({color:event.kind==='drop'?'#fff4bd':'#f5d8a3',transparent:true,opacity:.5,side:THREE.DoubleSide,depthWrite:false}));ring.rotation.x=-Math.PI/2;ring.position.y=.015;root.add(ring);
   this.bursts.push({root,event,start:now,lifetime:.5,cupRing:ring});return;
  }
  const water=event.type==='water',sand=event.type==='sand',grass=event.type==='rough',leaves=event.kind==='crown'||grass,root=new THREE.Group(),rng=random(Math.round(event.t*10000)+(event.treeIndex||0)*71),count=water?40:sand?64:grass?26:16;
  root.position.copy(event.position);this.add(root);
  const material=new THREE.MeshStandardMaterial({color:water?'#d9fcff':'#ffffff',transparent:true,roughness:water?.18:.85,metalness:water?.12:0,side:THREE.DoubleSide,depthWrite:false});
  const particles=new THREE.InstancedMesh(water?new THREE.SphereGeometry(1,6,5):sand?new THREE.DodecahedronGeometry(1,0):new THREE.PlaneGeometry(1,1),material,count),data=[];particles.instanceMatrix.setUsage(THREE.DynamicDrawUsage);particles.frustumCulled=false;root.add(particles);
  const strength=water?Math.min(1.8,.75+event.speed*.035):Math.min(1.2,.45+event.speed*.025);
  for(let i=0;i<count;i++){const a=rng()*Math.PI*2,speed=(water?.7:.3)+rng()*strength,size=water?.025+rng()*.035:sand?.013+rng()*.025:grass?.025+rng()*.035:.04+rng()*(leaves?.11:.035),forward=event.phase==='launch'?.9:.35;data.push({vx:Math.sin(a)*speed+(event.normal?.x||0)*forward,vy:(water?1.5:sand?.65:.5)+rng()*strength*(grass?1:2),vz:Math.cos(a)*speed+(event.normal?.z||0)*forward,size,spin:rng()*6,phase:a});if(!water)particles.setColorAt(i,new THREE.Color(leaves?['#6c9946','#b2c96a','#476e3f'][i%3]:sand?['#e5d1a0','#f3e1b6','#bc9c65'][i%3]:['#b79465','#d6bb83','#8b6844'][i%3]));}
  let dust=null;if(sand){dust=new THREE.Group();const geo=new THREE.SphereGeometry(1,12,8),mat=new THREE.MeshBasicMaterial({color:'#dcc69a',transparent:true,opacity:.09,depthWrite:false});for(let i=0;i<4;i++){const puff=new THREE.Mesh(geo,mat);puff.position.set((rng()-.5)*.4,.12+rng()*.12,(rng()-.5)*.4);puff.scale.set(.3,.12,.3);dust.add(puff);}root.add(dust);}
  const rings=[];
  if(water){
   for(let i=0;i<3;i++){const ring=new THREE.Mesh(new THREE.RingGeometry(.88,1,64),new THREE.MeshBasicMaterial({color:i===0?'#f1ffff':'#b6edf2',transparent:true,opacity:.8,side:THREE.DoubleSide,depthWrite:false}));ring.rotation.x=-Math.PI/2;ring.position.y=.018+i*.003;ring.renderOrder=4;root.add(ring);rings.push(ring);}
  }
  const crown=water?new THREE.Mesh(new THREE.CylinderGeometry(.65,.15,.7,32,1,true),new THREE.MeshStandardMaterial({color:'#d5f7f8',transparent:true,opacity:.65,side:THREE.DoubleSide,depthWrite:false,roughness:.25})):null;
  if(crown){root.add(crown);crown.position.y=.35;}
  this.bursts.push({root,event,start:now,lifetime:water?1.8:sand?1.4:1.15,particles,data,rings,crown,dust,strength});this.update(now);
 }
 update(now){
  const dummy=new THREE.Object3D();
  for(let i=this.bursts.length-1;i>=0;i--){
   const b=this.bursts[i],t=(now-b.start)/1000,u=t/b.lifetime,water=b.event.type==='water',sand=b.event.type==='sand',grass=b.event.type==='rough';
   if(u>=1){this.remove(b.root);release(b.root);this.bursts.splice(i,1);continue;}
   if(b.cupRing){b.cupRing.scale.setScalar(1+u*1.5);b.cupRing.material.opacity=.5*(1-u);continue;}
   b.data.forEach((p,j)=>{const gravity=water||sand?4.5:1.9,flight=Math.min(t,p.vy/gravity),y=p.vy*t-gravity*t*t;dummy.position.set(p.vx*(sand||grass?flight:t),sand||grass?Math.max(.012,y):y,p.vz*(sand||grass?flight:t));dummy.rotation.set(p.phase+t*p.spin,t*p.spin,p.phase);const size=water&&y<0?0:p.size;dummy.scale.set(size,size*(water?1.9:grass?3:sand?1:.65),size);dummy.updateMatrix();b.particles.setMatrixAt(j,dummy.matrix);});b.particles.instanceMatrix.needsUpdate=true;b.particles.material.opacity=Math.max(0,1-u*u);
   if(b.dust){b.dust.scale.setScalar(.6+t*1.5);b.dust.children[0].material.opacity=.09*(1-u);}
   b.rings.forEach((ring,j)=>{const age=Math.max(0,t-j*.13),radius=.12+age*(1.2+b.strength*.45);ring.scale.setScalar(radius);ring.visible=t>=j*.13;ring.material.opacity=Math.max(0,.7*(1-age/1.6));});
   if(b.crown){b.crown.visible=t<.5;const scale=.35+Math.min(1,t*5)*b.strength;b.crown.scale.set(scale,Math.max(.01,Math.sin(Math.min(1,t/.5)*Math.PI)),scale);b.crown.position.y=.35*b.crown.scale.y;b.crown.material.opacity=.65*Math.max(0,1-t/.5);}
  }
 }
}

export function pondMaterial(color){
 const material=new THREE.MeshStandardMaterial({color,roughness:.28,metalness:.06}),atlas=environmentTexture('atlas');material.userData.clock={value:0};material.userData.atlas=atlas;
 material.onBeforeCompile=shader=>{
  shader.uniforms.pondTime=material.userData.clock;shader.uniforms.courseAtlas={value:atlas};shader.uniforms.courseReady={value:atlas.userData.ready?1:0};material.userData.courseReady=shader.uniforms.courseReady;
  shader.vertexShader='varying vec2 pondUV;\n'+shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\npondUV = (modelMatrix*vec4(transformed,1.0)).xz;');
  shader.fragmentShader='uniform float pondTime; uniform float courseReady; varying vec2 pondUV;\n'+shader.fragmentShader;
  shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\n'+ATLAS_GLSL+'\nfloat waveRelief;');
  shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
   vec2 rippleUV=pondUV*.12+vec2(pondTime*.007,pondTime*.004);
   vec3 ripple=courseTex(rippleUV,vec2(3.0,0.0));float wave=sin(pondUV.x*1.7+pondUV.y*.8+pondTime*.7)*.5+sin(pondUV.y*2.3-pondUV.x*.4+pondTime*.5)*.3;
   float detail=1.0-smoothstep(25.0,180.0,length(vViewPosition));
   diffuseColor.rgb*=.96+wave*.035+clamp((courseLuma(ripple)-.2)*.32,-.06,.09)*courseReady*detail;
   waveRelief=(wave*.014+courseLuma(ripple)*.012*courseReady)*detail;
  `);
  shader.fragmentShader=shader.fragmentShader.replace('#include <normal_fragment_maps>','#include <normal_fragment_maps>\nnormal=courseBump(normal,waveRelief);');
  shader.fragmentShader=shader.fragmentShader.replace('#include <opaque_fragment>',`float fresnel=pow(1.0-max(0.0,dot(normal,normalize(vViewPosition))),3.0);
   outgoingLight=mix(outgoingLight,vec3(.43,.67,.76),fresnel*.38);
   #include <opaque_fragment>`);
 };material.customProgramCacheKey=()=> 'pond-atlas-v1';return material;
}
