import * as THREE from 'three';
import {heightAt,slopeAt,surfaceAt,clamp} from '../shared/courses.js';

export class GreenGuide extends THREE.Group {
 constructor(hole){
  super();this.hole=hole;const vertices=[],colors=[],nodes=[];
  const add=(x,z,x2,z2)=>{if(surfaceAt(hole,x,z)!=='green'||surfaceAt(hole,x2,z2)!=='green')return;for(const [a,b] of [[x,z],[x2,z2]]){const s=slopeAt(hole,a,b),c=new THREE.Color('#187e9f').lerp(new THREE.Color('#de782d'),clamp(Math.hypot(s.x,s.z)/.045,0,1));vertices.push(a,heightAt(hole,a,b)+.045,b);colors.push(c.r,c.g,c.b);}};
  for(let x=-hole.greenRadius;x<hole.greenRadius;x+=2)for(let z=hole.length-hole.greenRadius;z<hole.length+hole.greenRadius;z+=.5){add(x,z,x,z+.5);add(z-hole.length,x+hole.length,z-hole.length+.5,x+hole.length);}
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
  this.add(new THREE.LineSegments(geometry,new THREE.LineBasicMaterial({vertexColors:true,transparent:true,opacity:.42,depthWrite:false})));
  for(let x=-hole.greenRadius+1;x<hole.greenRadius;x+=2.5)for(let z=hole.length-hole.greenRadius+1;z<hole.length+hole.greenRadius;z+=2.5){if(surfaceAt(hole,x,z)!=='green'||Math.hypot(x-hole.pin.x,z-hole.pin.z)<.8)continue;const s=slopeAt(hole,x,z),n=Math.hypot(s.x,s.z);if(n<.001)continue;nodes.push({x,z,dx:-s.x/n,dz:-s.z/n,n});}
  const arrow=new THREE.Shape();arrow.moveTo(0,.42);arrow.lineTo(-.2,.03);arrow.lineTo(-.06,.1);arrow.lineTo(-.06,-.3);arrow.lineTo(.06,-.3);arrow.lineTo(.06,.1);arrow.lineTo(.2,.03);arrow.closePath();
  const geo=new THREE.ShapeGeometry(arrow);geo.rotateX(Math.PI/2);this.arrows=new THREE.InstancedMesh(geo,new THREE.MeshBasicMaterial({color:'white',side:THREE.DoubleSide,transparent:true,opacity:.85,depthWrite:false}),nodes.length);this.arrows.frustumCulled=false;this.add(this.arrows);this.nodes=nodes;this.update(0);
 }
 update(time){
  if(!this.visible)return;const dummy=new THREE.Object3D(),h=this.hole;
  this.nodes.forEach((p,i)=>{const d=((time*(.16+p.n*7)+i*.17)%1-.5)*.9,x=p.x+p.dx*d,z=p.z+p.dz*d,s=slopeAt(h,x,z);dummy.position.set(x,heightAt(h,x,z)+.065,z);dummy.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),new THREE.Vector3(-s.x,1,-s.z).normalize());dummy.rotateY(Math.atan2(p.dx,p.dz));dummy.updateMatrix();this.arrows.setMatrixAt(i,dummy.matrix);this.arrows.setColorAt(i,new THREE.Color('#2184a5').lerp(new THREE.Color('#d66a24'),clamp(p.n/.045,0,1)));});this.arrows.instanceMatrix.needsUpdate=true;if(this.arrows.instanceColor)this.arrows.instanceColor.needsUpdate=true;
 }
}
