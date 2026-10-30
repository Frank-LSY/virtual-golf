import {environmentTexture} from './environment-textures.js';
import * as THREE from 'three';
import {heightAt,surfaceAt,slopeAt,random,COURSES,clamp} from '../shared/courses.js';
import {sandDepth} from '../shared/terrain.js';
import {terrainMaterial} from './visuals.js';

// 外缘贴合远景地面网格，中心细分到球的尺寸，防止近景陷球被粗网格显示成悬空。
function coarseHeight(h,x,z){
 const dx=220/146,dz=(h.length+130)/Math.ceil((h.length+130)/1.65),ix=Math.floor((x+110)/dx),iz=Math.floor((z+65)/dz),x0=ix*dx-110,z0=iz*dz-65,u=(x-x0)/dx,v=(z-z0)/dz,a=heightAt(h,x0,z0),b=heightAt(h,x0,z0+dz),c=heightAt(h,x0+dx,z0+dz),d=heightAt(h,x0+dx,z0);
 return u+v<=1?a+(d-a)*u+(b-a)*v:c+(b-c)*(1-u)+(d-c)*(1-v);
}
export function liePatchGeometry(h,ball){
 const g=new THREE.RingGeometry(0,1,64,20);g.rotateX(-Math.PI/2);g.translate(ball.x,0,ball.z);const p=g.attributes.position,colors=[],kinds=[],palette=COURSES.find(c=>c.id===h.courseId);
 for(let i=0;i<p.count;i++){const x=p.getX(i),z=p.getZ(i),r=Math.hypot(x-ball.x,z-ball.z),blend=clamp((r-.3)/.7,0,1),s=surfaceAt(h,x,z),color=new THREE.Color(s==='sand'?'#e7d7a9':s==='green'?palette.green:s==='rough'?palette.grass:palette.fairway);p.setY(i,heightAt(h,x,z)*(1-blend)+coarseHeight(h,x,z)*blend+.002);colors.push(color.r,color.g,color.b);kinds.push(s==='sand'?2:s==='rough'?1:s==='green'?3:0);}
 g.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));g.setAttribute('terrainKind',new THREE.Float32BufferAttribute(kinds,1));g.computeVertexNormals();return g;
}

function grassMesh(points,seed){
 const rng=random(seed),geometry=new THREE.BufferGeometry(),positions=[],uvs=[];
 for(let j=0;j<3;j++){const a=j*Math.PI/3,c=Math.cos(a),s=Math.sin(a);for(const [x,y,u,v] of [[-.24,-.1,0,0],[.24,-.1,1,0],[-.24,.9,0,1],[.24,-.1,1,0],[.24,.9,1,1],[-.24,.9,0,1]]){positions.push(x*c,y,-x*s);uvs.push(u,v);}}
 geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));geometry.computeVertexNormals();
 const material=new THREE.MeshStandardMaterial({color:'#ffffff',map:environmentTexture('rough'),alphaTest:.38,alphaToCoverage:true,roughness:1,side:THREE.DoubleSide});material.userData.clock={value:0};material.userData.agitation={value:0};
 material.onBeforeCompile=shader=>{shader.uniforms.grassTime=material.userData.clock;shader.uniforms.grassAgitation=material.userData.agitation;shader.vertexShader='uniform float grassTime; uniform float grassAgitation; varying float grassVariant;\n'+shader.vertexShader;shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\ngrassVariant=floor(fract(sin(instanceMatrix[3].x*12.9898+instanceMatrix[3].z*78.233)*43758.5453)*4.0); transformed.x += sin(grassTime * (1.8 + grassAgitation * 12.0) + instanceMatrix[3].x * .8 + instanceMatrix[3].z) * (.09 + grassAgitation * .25) * max(0.0,position.y)*max(0.0,position.y); transformed.y *= 1.0 - grassAgitation * .2; float grassDistance=length((modelViewMatrix*instanceMatrix*vec4(0.0,0.0,0.0,1.0)).xyz); transformed *= 1.0-smoothstep(38.0,95.0,grassDistance);');shader.fragmentShader='varying float grassVariant;\n'+shader.fragmentShader;shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>','vec4 sampledDiffuseColor=texture2D(map,vec2((clamp(vMapUv.x,.015,.985)+grassVariant)/4.0,vMapUv.y)); sampledDiffuseColor.rgb=mix(vec3(.21,.29,.10),sampledDiffuseColor.rgb,.6); diffuseColor*=sampledDiffuseColor;');};material.customProgramCacheKey=()=> 'rough-clump-v1';

 const mesh=new THREE.InstancedMesh(geometry,material,points.length),dummy=new THREE.Object3D();
 points.forEach((p,i)=>{dummy.position.set(p.x,p.y,p.z);dummy.rotation.y=rng()*Math.PI*2;dummy.scale.setScalar(.65+rng()*.7);const bladeHeight=p.height||(.18+rng()*.18);dummy.scale.x*=bladeHeight*1.7;dummy.scale.z*=bladeHeight*1.7;dummy.scale.y=bladeHeight;dummy.updateMatrix();mesh.setMatrixAt(i,dummy.matrix);mesh.setColorAt(i,new THREE.Color(['#cfdfb7','#e5e9cf','#b9d4ae','#d7dfae'][i%4]).multiplyScalar(.9+rng()*.15));});mesh.computeBoundingSphere();return mesh;
}
export class TerrainDetails extends THREE.Group {
 constructor(hole,groundMaterial=null){
  super();this.hole=hole;this.groundMaterial=groundMaterial;this.patch=new THREE.Mesh(new THREE.BufferGeometry(),terrainMaterial(hole));this.patch.userData.noOutline=true;this.patch.receiveShadow=true;this.patch.visible=false;this.add(this.patch);const rng=random(hole.seed+705),points=[];
  for(let i=0;i<26000&&points.length<4200;i++){const x=(rng()-.5)*196,z=-25+rng()*(hole.length+55);if(surfaceAt(hole,x,z)==='rough')points.push({x,y:heightAt(hole,x,z),z});}
  this.grass=grassMesh(points,hole.seed);this.add(this.grass);this.local=null;this.lie=new THREE.Group();this.add(this.lie);
  const depression=new THREE.Mesh(new THREE.CircleGeometry(.145,32),new THREE.MeshStandardMaterial({color:'#b49a6b',roughness:1,transparent:true,opacity:.24,depthWrite:false}));depression.rotation.x=-Math.PI/2;depression.position.y=.004;this.lie.add(depression);
  const rimGeometry=new THREE.TorusGeometry(.13,.012,6,36),vertices=rimGeometry.attributes.position;for(let i=0;i<vertices.count;i++){const x=vertices.getX(i),y=vertices.getY(i),a=Math.atan2(y,x),scale=1+.07*Math.sin(a*5)+.045*Math.cos(a*7);vertices.setXY(i,x*scale,y*scale);}rimGeometry.computeVertexNormals();const rim=new THREE.Mesh(rimGeometry,new THREE.MeshStandardMaterial({color:'#ddc69a',roughness:1}));rim.rotation.x=Math.PI/2;rim.scale.z=.35;rim.position.y=.009;this.lie.add(rim);this.lie.visible=false;
 }
 setBall(ball){
  const h=this.hole,key=`${ball.x.toFixed(3)},${ball.z.toFixed(3)}`;this.lie.visible=surfaceAt(h,ball.x,ball.z)==='sand';
  if(this.lie.visible){const slope=slopeAt(h,ball.x,ball.z);this.lie.position.set(ball.x,heightAt(h,ball.x,ball.z),ball.z);this.lie.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),new THREE.Vector3(-slope.x,1,-slope.z).normalize());this.lie.scale.setScalar(.75+sandDepth('sand',ball)*5);}
  if(this.key===key)return;this.key=key;this.localCenter={...ball};
  this.patch.visible=['sand','rough'].includes(surfaceAt(h,ball.x,ball.z));this.patch.geometry.dispose();this.patch.geometry=liePatchGeometry(h,ball);if(this.groundMaterial){this.groundMaterial.userData.liePosition.value.set(ball.x,ball.z);this.groundMaterial.userData.lieRadius.value=this.patch.visible?.97:0;}
  if(this.local){this.remove(this.local);this.local.geometry.dispose();this.local.material.dispose();}
  const rng=random(Math.round(ball.x*100+ball.z*1000)+h.seed),points=[];
  for(let i=0;i<1800;i++){const a=rng()*Math.PI*2,r=Math.sqrt(rng())*4.5,x=ball.x+Math.cos(a)*r,z=ball.z+Math.sin(a)*r;if(r>.14&&rng()<(1-r/4.5)**2&&surfaceAt(h,x,z)==='rough')points.push({x,y:heightAt(h,x,z),z,height:r<.5?.12+rng()*.08:.16+rng()*.18});}
  this.local=grassMesh(points,h.seed+1);this.add(this.local);
 }
 launch(){this.lie.visible=false;}
 update(time,bursts=[]){
  this.grass.visible=!!this.grass.material.map.userData.ready;if(this.local)this.local.visible=this.grass.visible;this.grass.material.userData.clock.value=time;if(this.local)this.local.material.userData.clock.value=time;
  const nearby=bursts.some(b=>b.event.type==='rough'&&this.local&&Math.hypot(b.event.position.x-this.localCenter?.x,b.event.position.z-this.localCenter?.z)<5);
  if(this.local)this.local.material.userData.agitation.value=nearby?1:0;
 }
}
