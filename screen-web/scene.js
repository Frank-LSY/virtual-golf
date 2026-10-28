import {CourseLandscape} from './course-landscape.js';
import {courseTour} from '../shared/course-tour.js';
import {courseToLocal} from '../shared/course-layout.js';
import {CourseAtmosphere,treeMaterial,refreshTexture} from './environment-textures.js';
import {GreenGuide} from './green-guide.js';
import {CUP_LABELS} from '../shared/putting.js';
import {ViewState,overviewPose} from '../shared/view.js';
import {BALL_RADIUS} from '../shared/ball.js';
import {bindViewGestures} from './view-controls.js';
import {golfBall,holeCup,terrainMaterial} from './visuals.js';
import * as THREE from 'three';
import {TREE_MESHES,treeParts} from '../shared/trees.js';
import {WATER_LEVEL} from '../shared/water.js';
import {ImpactEffects,pondMaterial} from './impact-effects.js';
import {TerrainDetails} from './terrain-details.js';
import {ballRestHeight} from '../shared/terrain.js';
import {COURSES,clamp,heightAt,surfaceAt,landValue,random,distance} from '../shared/courses.js';

export class GolfScene {
 constructor(container){
  this.container=container;this.scene=new THREE.Scene();this.camera=new THREE.PerspectiveCamera(39,1,.5,2200);this.renderer=new THREE.WebGLRenderer({antialias:true,alpha:false});
  this.renderer.setPixelRatio(Math.min(devicePixelRatio,1.8));this.renderer.shadowMap.enabled=true;this.renderer.shadowMap.type=THREE.PCFShadowMap;this.renderer.outputColorSpace=THREE.SRGBColorSpace;this.renderer.toneMapping=THREE.ACESFilmicToneMapping;this.renderer.toneMappingExposure=1.12;container.append(this.renderer.domElement);
  this.scene.add(new THREE.HemisphereLight('#fffbe5','#688d91',1.7));
  this.sun=new THREE.DirectionalLight('#fff0d7',2.8);this.sun.position.set(-110,180,-40);this.sun.castShadow=true;this.sun.shadow.mapSize.set(2048,2048);Object.assign(this.sun.shadow.camera,{left:-180,right:180,top:240,bottom:-240,near:1,far:650});this.sun.shadow.bias=-.0008;this.sun.shadow.normalBias=.6;this.scene.add(this.sun);this.scene.add(this.sun.target);this.atmosphere=new CourseAtmosphere(this.scene);
  this.viewState=new ViewState();const fill=new THREE.DirectionalLight('#dceaff',.9);fill.position.set(80,60,100);this.scene.add(fill);this.currentLook=new THREE.Vector3();this.targetLook=new THREE.Vector3();this.targetPosition=new THREE.Vector3();this.group=new THREE.Group();this.scene.add(this.group);this.preview=true;this.orbit=0;this.startTime=performance.now();this.flight=null;this.view='follow';this.slopeVisible=false;
  new ResizeObserver(()=>this.resize()).observe(container);
  bindViewGestures(this.renderer.domElement,{drag:(x,y)=>{if(this.view==='overview'||this.preview||this.slopeVisible){this.viewState.rotate(-x*.007);this.viewState.tilt(y*.15);}else this.orbit+=x*.006;this.setCamera();},zoom:f=>{if(this.view!=='overview'&&!this.preview&&!this.slopeVisible)return false;this.viewState.scale(f);this.setCamera();},rotate:a=>{this.viewState.rotate(a);this.setCamera();}});
  this.viewToolbar=document.createElement('div');this.viewToolbar.className='scene-view-tools';container.append(this.viewToolbar);
  for(const [action,title,text] of [['out','俯视缩小','−'],['in','俯视放大','＋'],['left','俯视左转','↶'],['right','俯视右转','↷'],['reset','俯视复位','复位']]){const button=document.createElement('button');button.textContent=text;button.title=title;button.setAttribute('aria-label',title);button.onclick=()=>this.adjustView(action);this.viewToolbar.append(button);}this.viewReadout=document.createElement('span');this.viewToolbar.append(this.viewReadout);
  this.renderer.setAnimationLoop(()=>this.frame());
 }
 resize(){const {clientWidth:w,clientHeight:h}=this.container;if(!w||!h)return;this.renderer.setSize(w,h,false);this.camera.aspect=w/h;this.camera.fov=this.preview?39:45;if(this.preview)this.camera.clearViewOffset();else this.camera.setViewOffset(w,h,0,h*.12,w,h);this.camera.updateProjectionMatrix();this.setCamera();}
 mount(container,preview){this.container=container;container.append(this.renderer.domElement,this.viewToolbar);this.preview=preview;this.view=preview?'overview':'follow';this.orbit=0;this.resize();new ResizeObserver(()=>this.resize()).observe(container);}
 clear(){this.group.traverse(obj=>{if(!obj.geometry?.userData.sharedBallGeometry)obj.geometry?.dispose();const materials=Array.isArray(obj.material)?obj.material:[obj.material];for(const m of materials)m?.dispose();});this.scene.remove(this.group);this.group=new THREE.Group();this.scene.add(this.group);}
 load(hole){
  this.viewState.reset();this.hole=hole;this.ballPosition={x:0,z:0};this.flight=null;this.clear();const c=COURSES.find(c=>c.id===hole.courseId);this.palette=c;this.scene.background=new THREE.Color(c.sky);this.scene.fog=new THREE.Fog(c.sky,500,1200);this.atmosphere.load(hole);
  const nx=146,nz=Math.ceil((hole.length+130)/1.65),width=220,depth=hole.length+130,geo=new THREE.PlaneGeometry(width,depth,nx,nz);geo.rotateX(-Math.PI/2);geo.translate(0,0,hole.length/2);
  const pos=geo.attributes.position,colors=[],kinds=[];const base=new THREE.Color(c.grass),fair=new THREE.Color(c.fairway),green=new THREE.Color(c.green),sand=new THREE.Color('#e7d7a9'),edge=new THREE.Color('#d6c8a0');
  for(let i=0;i<pos.count;i++){
   const x=pos.getX(i),z=pos.getZ(i),y=heightAt(hole,x,z),s=surfaceAt(hole,x,z);pos.setY(i,y);
   kinds.push(s==='sand'?2:s==='rough'?1:s==='green'?3:0);const col=(s==='fairway'||s==='tee'?fair:s==='green'?green:s==='sand'?sand:base).clone();
   if(s==='fairway')col.multiplyScalar(Math.floor(z/13)%2===0?1:1.035);
   if(s==='rough')col.multiplyScalar(1+Math.sin(x*.11+z*.18)*.025);
   if(landValue(hole,x,z)>.75)col.lerp(new THREE.Color(c.ground||c.grass),clamp((landValue(hole,x,z)-.75)/.15,0,1));colors.push(col.r,col.g,col.b);
  }
  geo.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));geo.setAttribute('terrainKind',new THREE.Float32BufferAttribute(kinds,1));geo.computeVertexNormals();const terrain=new THREE.Mesh(geo,terrainMaterial(hole));terrain.receiveShadow=true;this.group.add(terrain);
  const ocean=new THREE.Mesh(new THREE.PlaneGeometry(2200,2200),pondMaterial(c.water));ocean.rotation.x=-Math.PI/2;ocean.position.set(0,-3.5,hole.length/2);this.group.add(ocean);this.ocean=ocean; ocean.visible=!!hole.practice;
  if(!hole.practice){const landscape=new CourseLandscape(courseTour(hole.courseId,hole.seed-hole.index*7919),{activeIndex:hole.index}),origin=courseToLocal(hole.placement,{x:0,z:0});landscape.rotation.y=-hole.placement.heading;landscape.position.set(origin.x,0,origin.z);this.group.add(landscape);}
  this.ponds=[];for(const p of hole.hazards.filter(p=>p.type==='water')){
   const pond=new THREE.Mesh(new THREE.CircleGeometry(1,96),pondMaterial(c.water));pond.rotation.x=-Math.PI/2;pond.rotation.z=-p.angle;pond.scale.set(p.rx,p.rz,1);pond.position.set(p.x,WATER_LEVEL,p.z);this.group.add(pond);this.ponds.push(pond);
  }
  this.effects=new ImpactEffects((event,now)=>{this.impactLabel=event.type==='ground'?'':event.type==='cup'?(CUP_LABELS[event.kind]||'触及洞缘'):event.type==='water'?'落水 · 加罚一杆，返回原球位':event.type==='sand'?(event.phase==='launch'?'沙地出球 · 沙粒飞溅':event.phase==='roll'?'滚入沙坑 · 沙地阻力增大':'落入沙坑 · 沙地吸收冲击'):event.type==='rough'?(event.phase==='launch'?'长草出球 · 草叶消耗速度':'进入长草 · 滚动迅速减弱'):event.kind==='trunk'?'击中树干 · 反弹减速':'擦到树冠 · 枝叶阻挡';this.impactUntil=now+1600;this.onImpact?.(event);});this.group.add(this.effects);this.impactUntil=0;
  this.terrainDetails=new TerrainDetails(hole,terrain.material);this.group.add(this.terrainDetails);
  this.cameraObstacles=[];this.trees(hole,c);if(!hole.practice){this.details(hole,c);const count=40,posts=new THREE.InstancedMesh(new THREE.CylinderGeometry(.09,.09,.9,5),new THREE.MeshStandardMaterial({color:'#f4f3e8',roughness:.8}),count),dummy=new THREE.Object3D();for(let i=0;i<count;i++){const a=i/count*Math.PI*2,x=98*Math.sign(Math.cos(a))*Math.sqrt(Math.abs(Math.cos(a))),z=hole.length/2+(hole.length/2+48)*Math.sign(Math.sin(a))*Math.cbrt(Math.abs(Math.sin(a)));dummy.position.set(x,heightAt(hole,x,z)+.45,z);dummy.updateMatrix();posts.setMatrixAt(i,dummy.matrix);}this.group.add(posts);}
  const pinY=heightAt(hole,hole.pin.x,hole.pin.z);
  this.cup=holeCup(hole);this.cup.visible=!hole.practice;this.group.add(this.cup);
  this.pole=new THREE.Mesh(new THREE.CylinderGeometry(.025,.03,3.1,16),new THREE.MeshStandardMaterial({color:'#f3eee0',roughness:.35,metalness:.3}));this.pole.position.set(hole.pin.x,pinY+1.55,hole.pin.z);this.pole.castShadow=true;this.group.add(this.pole);
  this.flag=new THREE.Mesh(new THREE.PlaneGeometry(1.25,.72,16,6),new THREE.MeshStandardMaterial({color:'#d79555',side:THREE.DoubleSide,roughness:.85}));this.flag.position.set(hole.pin.x+.625,pinY+2.67,hole.pin.z);this.flag.castShadow=true;this.group.add(this.flag);
  this.ball=golfBall();this.group.add(this.ball);
  this.ballRing=new THREE.Mesh(new THREE.RingGeometry(1.5,1.75,48),new THREE.MeshBasicMaterial({color:'#ffffff',transparent:true,opacity:.7,side:THREE.DoubleSide}));this.ballRing.rotation.x=-Math.PI/2;this.group.add(this.ballRing);
  this.aimLine=new THREE.Line(new THREE.BufferGeometry(),new THREE.LineDashedMaterial({color:'#fffed9',dashSize:2.6,gapSize:2,transparent:true,opacity:.9}));this.group.add(this.aimLine);
  this.slopeGrid=new GreenGuide(hole);this.slopeGrid.visible=this.slopeVisible;this.group.add(this.slopeGrid);
  this.sun.target.position.set(0,0,hole.length/2);this.sun.position.set(-110,180,hole.length/2-90);this.setBall({x:0,z:0},0);this.setCamera(true);
 }
 trees(h,c){
  const geometry=shape=>{const data=TREE_MESHES[shape],g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(data.positions,3));g.setIndex(data.indices);g.computeVertexNormals();return g;};
  const dummy=new THREE.Object3D(),batches=new Map();this.treeEntries=new Map();this.treeMaterials=[];
  h.trees.forEach((tree,i)=>treeParts(h,tree,i).forEach(p=>{if(!batches.has(p.shape))batches.set(p.shape,[]);batches.get(p.shape).push(p);}));
  for(const [shape,parts] of batches){const trunk=shape==='trunk',material=treeMaterial(trunk?'#8c8060':'#ffffff',trunk?'bark':h.courseId==='pine'?'pine':'leaves'),mesh=new THREE.InstancedMesh(geometry(shape),material,parts.length);mesh.castShadow=true;mesh.receiveShadow=true;this.treeMaterials.push(material);
   parts.forEach((p,slot)=>{dummy.position.set(p.x,p.y,p.z);dummy.scale.set(p.sx,p.sy,p.sz);dummy.rotation.set(0,p.rotation,0);dummy.updateMatrix();mesh.setMatrixAt(slot,dummy.matrix);if(!trunk){mesh.setColorAt(slot,new THREE.Color(c.trees).multiplyScalar(.92+(p.treeIndex%5)*.045+(p.partIndex%3)*.055));if(!this.treeEntries.has(p.treeIndex))this.treeEntries.set(p.treeIndex,[]);this.treeEntries.get(p.treeIndex).push({mesh,slot,matrix:dummy.matrix.clone()});}});this.group.add(mesh);
  }
 }
 updateObstructions(dt){
  if(this.preview||!this.ball||!this.cameraObstacles?.length)return;this.scene.updateMatrixWorld(true);this.obstructionRay??=new THREE.Raycaster();const target=this.ball.getWorldPosition(new THREE.Vector3()),direction=target.clone().sub(this.camera.position),length=direction.length();this.obstructionRay.set(this.camera.position,direction.normalize());this.obstructionRay.far=Math.max(0,length-.15);const blocked=new Set(this.obstructionRay.intersectObjects(this.cameraObstacles,false).map(hit=>hit.object));
  for(const rock of this.cameraObstacles){const inside=new THREE.Box3().setFromObject(rock).containsPoint(this.camera.position),opacity=(blocked.has(rock)||inside)?.16:1;rock.material.opacity+=(opacity-rock.material.opacity)*(1-Math.exp(-dt*12));rock.material.depthWrite=rock.material.opacity>.98;}
 }
 audioFrame(position){
  this.group.updateWorldMatrix(true,false);this.camera.updateWorldMatrix(true,false);const p=position||this.ball?.position||this.ballPosition,source=this.group.localToWorld(new THREE.Vector3(p.x,p.y??heightAt(this.hole,p.x,p.z),p.z)),e=this.camera.matrixWorld.elements;return {source,listener:this.camera.getWorldPosition(new THREE.Vector3()),right:new THREE.Vector3(e[0],e[1],e[2]).normalize(),forward:new THREE.Vector3(-e[8],-e[9],-e[10]).normalize()};
 }
 updateEnvironment(now){
  const seconds=(now-this.startTime)/1000;this.atmosphere?.update(this.camera,seconds,this.preview||this.view==='overview'||this.slopeVisible);
  for(const material of [this.terrainDetails?.groundMaterial,this.terrainDetails?.patch.material,...(this.treeMaterials||[])])refreshTexture(material);
  if(this.ocean){this.ocean.material.userData.clock.value=seconds;refreshTexture(this.ocean.material);}
  this.slopeGrid?.update((now-this.startTime)/1000);
  this.terrainDetails?.update((now-this.startTime)/1000,this.effects?.bursts);
  this.effects?.update(now);for(const pond of this.ponds||[]){pond.material.userData.clock.value=seconds;refreshTexture(pond.material);}
  const shakes=new Map();for(const b of this.effects?.bursts||[])if(b.event.type==='tree'){const t=(now-b.start)/1000;shakes.set(b.event.treeIndex,Math.sin(t*26)*Math.exp(-t*4)*.07);}
  const dirty=new Set([...(this.shakenTrees||[]),...shakes.keys()]),changed=new Set();for(const tree of dirty)for(const entry of this.treeEntries?.get(tree)||[]){const matrix=entry.matrix.clone(),s=shakes.get(tree)||0;matrix.elements[12]+=s;matrix.elements[14]+=s*.5;entry.mesh.setMatrixAt(entry.slot,matrix);changed.add(entry.mesh);}for(const mesh of changed)mesh.instanceMatrix.needsUpdate=true;this.shakenTrees=[...shakes.keys()];
 }
 details(h,c){
  const rng=random(h.seed+88),rockMat=new THREE.MeshStandardMaterial({color:h.courseId==='coast'?'#c1bca9':'#a1aa8e',roughness:1,flatShading:true}),rockGeo=new THREE.DodecahedronGeometry(1.6,0);
  for(let i=0;i<34;i++){const x=(rng()-.5)*178,z=rng()*(h.length+35)-15;if(surfaceAt(h,x,z)!=='rough'||landValue(h,x,z)>.8)continue;const rock=new THREE.Mesh(rockGeo,rockMat.clone());rock.material.transparent=true;this.cameraObstacles.push(rock);rock.position.set(x,heightAt(h,x,z)+.4,z);rock.scale.set(1+rng()*2,.6+rng(),1+rng());rock.rotation.set(rng(),rng(),rng());rock.castShadow=true;this.group.add(rock);}
  const teeMat=new THREE.MeshStandardMaterial({color:'#f6ecd3'});for(const x of [-4,4]){const marker=new THREE.Mesh(new THREE.SphereGeometry(.6,12,8),teeMat);marker.position.set(x,heightAt(h,x,0)+.4,0);this.group.add(marker);}
 }
 setBall(p,aim=0){if(!this.hole||this.flight)return;this.ballPosition=p;this.ball.position.set(p.x,ballRestHeight(this.hole,p),p.z);this.terrainDetails?.setBall(p);this.ballRing.position.set(p.x,heightAt(this.hole,p.x,p.z)+.09,p.z);this.ballRing.visible=!this.preview;
  const a=Math.atan2(this.hole.pin.x-p.x,this.hole.pin.z-p.z)+aim*Math.PI/180,d=Math.min(distance(p,this.hole.pin),75),points=[];for(let i=0;i<=30;i++){const x=p.x+Math.sin(a)*d*i/30,z=p.z+Math.cos(a)*d*i/30;points.push(new THREE.Vector3(x,heightAt(this.hole,x,z)+.25,z));}this.aimLine.geometry.dispose();this.aimLine.geometry=new THREE.BufferGeometry().setFromPoints(points);this.aimLine.computeLineDistances();this.aimLine.visible=!this.preview;this.setCamera();
 }
 adjustView(action){if(action==='reset'){this.viewState.reset();}else if(action==='in'||action==='out')this.viewState.scale(action==='in'?1.25:.8);else this.viewState.rotate((action==='left'?-1:1)*Math.PI/12);this.setCamera();}
 focusCup(){this.view='overview';this.slopeVisible=false;if(this.slopeGrid)this.slopeGrid.visible=false;this.viewState.reset();this.viewState.focus='cup';this.viewState.pitch=43;this.setCamera();}
 overviewCamera(center,distance){const pose=overviewPose(center,distance,this.viewState);this.targetPosition.set(pose.position.x,pose.position.y,pose.position.z);this.targetLook.set(pose.look.x,pose.look.y,pose.look.z);}
 updateViewUI(){if(!this.viewToolbar)return;this.viewToolbar.hidden=!(this.preview||this.view==='overview'||this.slopeVisible);const text=`${Math.round((this.viewState?.zoom||1)*100)}% · ${Math.round((this.viewState?.yaw||0)*180/Math.PI)}°`;if(this.viewReadout.textContent!==text)this.viewReadout.textContent=text;}
 setCamera(immediate=false){this.updateViewUI();if(!this.hole)return;const h=this.hole;
  if(this.preview||this.view==='overview'){
   const close=this.viewState.focus==='cup',d=close?6:Math.max(205,h.length)*(this.camera.aspect<1.2?1.2:1);this.overviewCamera(close?{x:h.pin.x,y:heightAt(h,h.pin.x,h.pin.z),z:h.pin.z}:{x:0,y:2,z:h.length*.46},d);
  }else{
   const p=this.flight?this.ball.position:{...this.ballPosition,y:heightAt(h,this.ballPosition.x,this.ballPosition.z)},d=distance(p,h.pin),a=Math.atan2(h.pin.x-p.x,h.pin.z-p.z)+this.orbit;
   const zoom=clamp(d*.85,30,145),height=clamp(d*.7,28,120),look=Math.min(55,d*.32);this.targetPosition.set(p.x-Math.sin(a)*zoom+Math.cos(a)*zoom*.24,p.y+height,p.z-Math.cos(a)*zoom-Math.sin(a)*zoom*.24);this.targetLook.set(p.x+Math.sin(a)*look,p.y,p.z+Math.cos(a)*look);
  }
  if(immediate){this.camera.position.copy(this.targetPosition);this.currentLook.copy(this.targetLook);this.camera.lookAt(this.currentLook);}
 }
 playShot(shot){this.flight={shot,start:performance.now()};this.aimLine.visible=false;this.ballRing.visible=false;this.view='follow';this.orbit=0;}
 finish(p){this.flight=null;this.setBall(p);}
 overview(){this.view=this.view==='overview'?'follow':'overview';this.orbit=0;this.viewState.reset();this.setCamera();}
 toggleSlope(){this.slopeVisible=!this.slopeVisible;this.slopeGrid.visible=this.slopeVisible;if(this.slopeVisible){this.view='follow';const h=this.hole;this.targetPosition.set(h.pin.x+20,heightAt(h,h.pin.x,h.pin.z)+40,h.pin.z-30);this.targetLook.set(h.pin.x,heightAt(h,h.pin.x,h.pin.z),h.pin.z);}else this.setCamera();return this.slopeVisible;}
 frame(){
  if(!this.hole||!this.container.clientWidth||!this.container.clientHeight)return;const now=performance.now(),time=(now-this.startTime)/1000;this.updateEnvironment(now);
  if(this.flag){const p=this.flag.geometry.attributes.position;for(let i=0;i<p.count;i++){const x=p.getX(i)+2.3;p.setZ(i,Math.sin(time*2.8+x*.9)*.09*(p.getX(i)+.625)/1.25);}p.needsUpdate=true;}
  if(this.flight){const {shot,start}=this.flight,t=clamp((performance.now()-start)/(shot.duration*1000),0,1),p=shot.path,physical=t*p[p.length-1].t;let lo=0,hi=p.length-1;while(lo<hi-1){const m=(lo+hi)>>1;if(p[m].t<physical)lo=m;else hi=m;}const a=p[lo],b=p[hi],f=clamp((physical-a.t)/(b.t-a.t||1),0,1);this.ball.position.set(a.x+(b.x-a.x)*f,a.y+(b.y-a.y)*f+.38,a.z+(b.z-a.z)*f);this.ball.scale.setScalar(1.2);this.setCamera();}
  else this.ball.scale.setScalar(1);
  this.camera.position.lerp(this.targetPosition,.045);this.currentLook.lerp(this.targetLook,.06);this.camera.lookAt(this.currentLook);this.renderer.render(this.scene,this.camera);
 }
}
