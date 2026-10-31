import * as THREE from 'three';
import {surfaceAt,random,distance,heightAt,landValue} from '../shared/courses.js';
import {courseToLocal,localToCourse} from '../shared/course-layout.js';
import {courseGround,courseHeight} from '../shared/course-tour.js';

export function roadMesh(tour,route,color='#cbbd98',width=3.2){
 const positions=[],indices=[];let slot=0;
 for(let j=1;j<route.length;j++){const a=route[j-1],b=route[j],length=distance(a,b),n=Math.max(1,Math.ceil(length/4)),dx=(b.z-a.z)/(length||1)*width/2,dz=-(b.x-a.x)/(length||1)*width/2;
  for(let k=0;k<=n;k++){const t=k/n,x=a.x+(b.x-a.x)*t,z=a.z+(b.z-a.z)*t;for(const sign of [-1,1]){const p={x:x+dx*sign,z:z+dz*sign};positions.push(p.x,courseHeight(tour,p)+.12,p.z);}if(k<n){const i=slot+k*2;indices.push(i,i+2,i+1,i+1,i+2,i+3);}}slot+=(n+1)*2;
 }
 const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.setIndex(indices);g.computeVertexNormals();return new THREE.Mesh(g,new THREE.MeshStandardMaterial({color,roughness:1,side:THREE.DoubleSide,polygonOffset:true,polygonOffsetFactor:-2,polygonOffsetUnits:-2}));
}
export class CourseLandscape extends THREE.Group {
 constructor(tour,{activeIndex=null}={}){
  super();this.tour=tour;const c=tour.course,b=tour.bounds,spanX=b.maxX-b.minX,spanZ=b.maxZ-b.minZ,step=8,nx=Math.ceil(spanX/step),nz=Math.ceil(spanZ/step);
  const geo=new THREE.PlaneGeometry(spanX,spanZ,nx,nz);geo.rotateX(-Math.PI/2);geo.translate(tour.center.x,0,tour.center.z);const p=geo.attributes.position,colors=[],palette={fairway:new THREE.Color(c.fairway),tee:new THREE.Color(c.fairway),green:new THREE.Color(c.green),rough:new THREE.Color(c.grass),sand:new THREE.Color('#dcc89c'),water:new THREE.Color(c.water),out:new THREE.Color(c.ground)},index=[];
  const lies=[];for(let i=0;i<p.count;i++){const q={x:p.getX(i),z:p.getZ(i)},g=courseGround(tour,q),lie=g?surfaceAt(g.h,g.q.x,g.q.z):'out';lies.push(g?.h.index);p.setY(i,g?heightAt(g.h,g.q.x,g.q.z):0);const color=(palette[lie]||palette.out).clone();color.multiplyScalar(1+Math.sin(q.x*.03+q.z*.02)*.025);colors.push(color.r,color.g,color.b);}
  const ix=geo.index.array;for(let i=0;i<ix.length;i+=3){const ids=[ix[i],ix[i+1],ix[i+2]];if(activeIndex!==null){const center={x:ids.reduce((s,j)=>s+p.getX(j),0)/3,z:ids.reduce((s,j)=>s+p.getZ(j),0)/3},q=courseToLocal(tour.placements[activeIndex],center);if(landValue(tour.holes[activeIndex],q.x,q.z)<1.2)continue;}index.push(...ids);}
  geo.setIndex(index);geo.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));geo.computeVertexNormals();this.add(new THREE.Mesh(geo,new THREE.MeshStandardMaterial({vertexColors:true,roughness:1})));
  const base=new THREE.Mesh(new THREE.PlaneGeometry(spanX+1800,spanZ+1800),new THREE.MeshStandardMaterial({color:c.ground,roughness:1}));base.rotation.x=-Math.PI/2;base.position.set(tour.center.x,-8,tour.center.z);this.add(base);
  // 0.22：远景装饰树（别的球洞的树、林地填充树）不再落进当前球洞的场地范围——
  // 它们没有碰撞、也不会随镜头淡化，以前会出现在球道、果岭甚至发球台后的镜头位置上挡住视线。
  const active=activeIndex===null?null:tour.holes[activeIndex],clear=q=>{if(!active)return true;const l=courseToLocal(tour.placements[activeIndex],q);return landValue(active,l.x,l.z)>=1.25;};
  const entries=[];for(const h of tour.holes){if(h.index===activeIndex)continue;h.trees.filter((_,i)=>i%3===0).forEach(t=>{const q=localToCourse(h.placement,t);if(clear(q))entries.push({...q,y:courseHeight(tour,q),scale:t.scale});});}
  if(['pine','rainforest'].includes(c.id)){const rng=random(1654);for(let i=0;i<480;i++){const q={x:tour.center.x+(rng()-.5)*spanX*.64,z:tour.center.z+(rng()-.5)*spanZ*.64},g=courseGround(tour,q),scale=.9+rng()*.8;if((!g||g.q.z<0||g.q.z>g.h.length||Math.abs(g.q.x)>80)&&clear(q))entries.push({...q,y:courseHeight(tour,q),scale});}}
  const mesh=new THREE.InstancedMesh(c.id==='pine'?new THREE.ConeGeometry(3.5,11,7):new THREE.IcosahedronGeometry(4,1),new THREE.MeshStandardMaterial({color:c.trees,roughness:1}),entries.length),dummy=new THREE.Object3D();entries.forEach((t,i)=>{dummy.position.set(t.x,t.y+5*t.scale,t.z);dummy.scale.set(t.scale,t.scale*(c.id==='rainforest'?1.4:1),t.scale);dummy.rotation.y=i*2.4;dummy.updateMatrix();mesh.setMatrixAt(i,dummy.matrix);});this.add(mesh);this.foliage=mesh;
  for(const h of tour.holes){if(h.index===activeIndex)continue;const q=localToCourse(h.placement,h.pin);if(!clear(q))continue;const pole=new THREE.Mesh(new THREE.CylinderGeometry(.08,.08,4,5),new THREE.MeshBasicMaterial({color:'#fff9db'}));pole.position.set(q.x,courseHeight(tour,q)+2,q.z);this.add(pole);}
  const house=new THREE.Group(),wall=new THREE.Mesh(new THREE.BoxGeometry(16,5,11),new THREE.MeshStandardMaterial({color:'#e8dfc6'})),roof=new THREE.Mesh(new THREE.ConeGeometry(13,5,4),new THREE.MeshStandardMaterial({color:c.id==='desert'?'#a66f48':'#5e7865'}));wall.position.y=2.5;roof.position.y=6.5;roof.rotation.y=Math.PI/4;roof.scale.z=.75;house.add(wall,roof);house.position.set(tour.clubhouse.x,courseHeight(tour,tour.clubhouse),tour.clubhouse.z);this.add(house);
  if(c.id==='coast'){const ocean=new THREE.Mesh(new THREE.PlaneGeometry(spanX+1800,650),new THREE.MeshStandardMaterial({color:c.water,roughness:.28,metalness:.12}));ocean.rotation.x=-Math.PI/2;ocean.position.set(tour.center.x,-.08,b.minZ-330);this.add(ocean);}
  if(tour.reserve?.type==='lake'){const r=tour.reserve,lake=new THREE.Mesh(new THREE.CircleGeometry(1,64),new THREE.MeshStandardMaterial({color:c.water,roughness:.35,metalness:.1}));lake.rotation.x=-Math.PI/2;lake.scale.set(r.rx,r.rz,1);lake.position.set(r.x,.08,r.z);this.add(lake);}
  if(c.id==='desert'){const rocks=new THREE.InstancedMesh(new THREE.DodecahedronGeometry(1,0),new THREE.MeshStandardMaterial({color:'#b47e58',roughness:1}),32),rng=random(1234);for(let i=0;i<32;i++){const a=i/32*Math.PI*2,r=Math.min(spanX,spanZ)*(.15+rng()*.1);dummy.position.set(tour.center.x+Math.cos(a)*r,2,tour.center.z+Math.sin(a)*r);dummy.scale.set(7+rng()*9,3+rng()*6,6+rng()*8);dummy.rotation.set(.2,rng()*6,.1);dummy.updateMatrix();rocks.setMatrixAt(i,dummy.matrix);}this.add(rocks);}
 }
 dispose(){const geometries=new Set(),materials=new Set();this.traverse(o=>{if(o.geometry)geometries.add(o.geometry);for(const m of o.material?Array.isArray(o.material)?o.material:[o.material]:[])materials.add(m);});geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());this.removeFromParent();}
}
