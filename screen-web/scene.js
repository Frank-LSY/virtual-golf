import * as THREE from 'three';
import {COURSES,clamp,heightAt,surfaceAt,landValue,random,distance} from '../shared/courses.js';

export class GolfScene {
 constructor(container){
  this.container=container;this.scene=new THREE.Scene();this.camera=new THREE.PerspectiveCamera(39,1,.5,2200);this.renderer=new THREE.WebGLRenderer({antialias:true,alpha:false});
  this.renderer.setPixelRatio(Math.min(devicePixelRatio,1.8));this.renderer.shadowMap.enabled=true;this.renderer.shadowMap.type=THREE.PCFShadowMap;this.renderer.outputColorSpace=THREE.SRGBColorSpace;this.renderer.toneMapping=THREE.ACESFilmicToneMapping;this.renderer.toneMappingExposure=1.12;container.append(this.renderer.domElement);
  this.scene.add(new THREE.HemisphereLight('#fffbe5','#6d9988',2.7));
  this.sun=new THREE.DirectionalLight('#fff1cb',3.2);this.sun.position.set(-110,180,-40);this.sun.castShadow=true;this.sun.shadow.mapSize.set(2048,2048);Object.assign(this.sun.shadow.camera,{left:-180,right:180,top:240,bottom:-240,near:1,far:650});this.sun.shadow.bias=-.0008;this.sun.shadow.normalBias=.6;this.scene.add(this.sun);this.scene.add(this.sun.target);
  this.currentLook=new THREE.Vector3();this.targetLook=new THREE.Vector3();this.targetPosition=new THREE.Vector3();this.group=new THREE.Group();this.scene.add(this.group);this.preview=true;this.orbit=0;this.startTime=performance.now();this.flight=null;this.view='follow';this.slopeVisible=false;
  new ResizeObserver(()=>this.resize()).observe(container);
  let dragging=false,lastX=0;this.renderer.domElement.addEventListener('pointerdown',e=>{dragging=true;lastX=e.clientX;this.renderer.domElement.setPointerCapture(e.pointerId);});this.renderer.domElement.addEventListener('pointermove',e=>{if(dragging){this.orbit+=(e.clientX-lastX)*.006;lastX=e.clientX;this.setCamera();}});this.renderer.domElement.addEventListener('pointerup',()=>dragging=false);
  this.renderer.setAnimationLoop(()=>this.frame());
 }
 resize(){const {clientWidth:w,clientHeight:h}=this.container;if(!w||!h)return;this.renderer.setSize(w,h,false);this.camera.aspect=w/h;this.camera.fov=this.preview?39:45;if(this.preview)this.camera.clearViewOffset();else this.camera.setViewOffset(w,h,0,h*.12,w,h);this.camera.updateProjectionMatrix();this.setCamera();}
 mount(container,preview){this.container=container;container.append(this.renderer.domElement);this.preview=preview;this.view=preview?'overview':'follow';this.orbit=0;this.resize();new ResizeObserver(()=>this.resize()).observe(container);}
 clear(){this.group.traverse(obj=>{obj.geometry?.dispose();const materials=Array.isArray(obj.material)?obj.material:[obj.material];for(const m of materials)m?.dispose();});this.scene.remove(this.group);this.group=new THREE.Group();this.scene.add(this.group);}
 load(hole){
  this.hole=hole;this.ballPosition={x:0,z:0};this.flight=null;this.clear();const c=COURSES.find(c=>c.id===hole.courseId);this.palette=c;this.scene.background=new THREE.Color(c.sky);this.scene.fog=new THREE.Fog(c.sky,500,1200);
  const nx=146,nz=Math.ceil((hole.length+130)/1.65),width=220,depth=hole.length+130,geo=new THREE.PlaneGeometry(width,depth,nx,nz);geo.rotateX(-Math.PI/2);geo.translate(0,0,hole.length/2);
  const pos=geo.attributes.position,colors=[];const base=new THREE.Color(c.grass),fair=new THREE.Color(c.fairway),green=new THREE.Color(c.green),sand=new THREE.Color('#e7d7a9'),edge=new THREE.Color('#d6c8a0');
  for(let i=0;i<pos.count;i++){
   const x=pos.getX(i),z=pos.getZ(i),y=heightAt(hole,x,z),s=surfaceAt(hole,x,z);pos.setY(i,y);
   const col=(s==='fairway'||s==='tee'?fair:s==='green'?green:s==='sand'?sand:base).clone();
   if(s==='fairway')col.multiplyScalar(Math.floor(z/13)%2===0?1:1.035);
   if(s==='rough')col.multiplyScalar(1+Math.sin(x*.11+z*.18)*.025);
   if(landValue(hole,x,z)>.75)col.lerp(edge,clamp((landValue(hole,x,z)-.75)/.15,0,1));colors.push(col.r,col.g,col.b);
  }
  geo.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));geo.computeVertexNormals();const terrain=new THREE.Mesh(geo,new THREE.MeshStandardMaterial({vertexColors:true,roughness:1}));terrain.receiveShadow=true;this.group.add(terrain);
  const ocean=new THREE.Mesh(new THREE.PlaneGeometry(2200,2200),new THREE.MeshStandardMaterial({color:c.water,roughness:.72,metalness:.08}));ocean.rotation.x=-Math.PI/2;ocean.position.set(0,-3.5,hole.length/2);this.group.add(ocean);
  for(const p of hole.hazards.filter(p=>p.type==='water')){
   const pond=new THREE.Mesh(new THREE.CircleGeometry(1,64),new THREE.MeshStandardMaterial({color:c.water,roughness:.4,metalness:.08}));pond.rotation.x=-Math.PI/2;pond.rotation.z=-p.angle;pond.scale.set(p.rx,p.rz,1);pond.position.set(p.x,.1,p.z);this.group.add(pond);
  }
  this.trees(hole,c);this.details(hole,c);
  const pinY=heightAt(hole,hole.pin.x,hole.pin.z);
  const cup=new THREE.Mesh(new THREE.CircleGeometry(.52,32),new THREE.MeshBasicMaterial({color:'#223d2d'}));cup.rotation.x=-Math.PI/2;cup.position.set(hole.pin.x,pinY+.045,hole.pin.z);this.group.add(cup);
  const pole=new THREE.Mesh(new THREE.CylinderGeometry(.105,.105,8,8),new THREE.MeshStandardMaterial({color:'#f4f3dc'}));pole.position.set(hole.pin.x,pinY+4,hole.pin.z);pole.castShadow=true;this.group.add(pole);
  this.flag=new THREE.Mesh(new THREE.PlaneGeometry(4.6,2.5,10,3),new THREE.MeshStandardMaterial({color:'#e0a567',side:THREE.DoubleSide,roughness:1}));this.flag.position.set(hole.pin.x+2.3,pinY+6.65,hole.pin.z);this.group.add(this.flag);
  this.ball=new THREE.Mesh(new THREE.SphereGeometry(.52,20,14),new THREE.MeshStandardMaterial({color:'#fffff6',roughness:.35}));this.ball.castShadow=true;this.group.add(this.ball);
  this.ballRing=new THREE.Mesh(new THREE.RingGeometry(1.5,1.75,48),new THREE.MeshBasicMaterial({color:'#ffffff',transparent:true,opacity:.7,side:THREE.DoubleSide}));this.ballRing.rotation.x=-Math.PI/2;this.group.add(this.ballRing);
  this.aimLine=new THREE.Line(new THREE.BufferGeometry(),new THREE.LineDashedMaterial({color:'#fffed9',dashSize:2.6,gapSize:2,transparent:true,opacity:.9}));this.group.add(this.aimLine);
  this.slopeGrid=new THREE.Group();const verts=[];for(let a=-hole.greenRadius;a<=hole.greenRadius;a+=2){for(let b=-hole.greenRadius;b<hole.greenRadius;b+=.8){if(Math.hypot(a,b)>hole.greenRadius)continue;verts.push(a,heightAt(hole,a,b+hole.length)+.12,b+hole.length,a,heightAt(hole,a,b+.8+hole.length)+.12,b+.8+hole.length);verts.push(b,heightAt(hole,b,a+hole.length)+.12,a+hole.length,b+.8,heightAt(hole,b+.8,a+hole.length)+.12,a+hole.length);}}
  const gridGeo=new THREE.BufferGeometry();gridGeo.setAttribute('position',new THREE.Float32BufferAttribute(verts,3));this.slopeGrid.add(new THREE.LineSegments(gridGeo,new THREE.LineBasicMaterial({color:'#ffffff',transparent:true,opacity:.45})));this.slopeGrid.visible=this.slopeVisible;this.group.add(this.slopeGrid);
  this.sun.target.position.set(0,0,hole.length/2);this.sun.position.set(-110,180,hole.length/2-90);this.setBall({x:0,z:0},0);this.setCamera(true);
 }
 trees(h,c){
  const dummy=new THREE.Object3D(),n=h.trees.length,trunks=new THREE.InstancedMesh(new THREE.CylinderGeometry(.32,.62,5,6),new THREE.MeshStandardMaterial({color:'#8c8060'}),n);trunks.castShadow=true;
  const pine=h.courseId==='pine',foliage=new THREE.InstancedMesh(pine?new THREE.ConeGeometry(3.5,8,7):new THREE.IcosahedronGeometry(3.8,1),new THREE.MeshStandardMaterial({color:'#ffffff',roughness:1,flatShading:true}),n*3);foliage.castShadow=true;foliage.receiveShadow=true;
  h.trees.forEach((p,i)=>{const y=heightAt(h,p.x,p.z);dummy.position.set(p.x,y+2.5*p.scale,p.z);dummy.scale.setScalar(p.scale);dummy.rotation.set(0,p.rotation,0);dummy.updateMatrix();trunks.setMatrixAt(i,dummy.matrix);
   for(let j=0;j<3;j++){dummy.position.set(p.x+(pine?0:(j-1)*1.4*p.scale),y+(pine?5+j*2.5:5.8+j*1.3)*p.scale,p.z+(j%2)*p.scale);const s=p.scale*(pine?1-j*.16:1-j*.13);dummy.scale.set(s,pine?s:s*1.05,s);dummy.updateMatrix();foliage.setMatrixAt(i*3+j,dummy.matrix);foliage.setColorAt(i*3+j,new THREE.Color(c.trees).multiplyScalar(.89+(i%4)*.06+j*.04));}
  });this.group.add(trunks,foliage);
 }
 details(h,c){
  const rng=random(h.seed+88),rockMat=new THREE.MeshStandardMaterial({color:h.courseId==='coast'?'#c1bca9':'#a1aa8e',roughness:1,flatShading:true}),rockGeo=new THREE.DodecahedronGeometry(1.6,0);
  for(let i=0;i<34;i++){const x=(rng()-.5)*178,z=rng()*(h.length+35)-15;if(surfaceAt(h,x,z)!=='rough'||landValue(h,x,z)>.8)continue;const rock=new THREE.Mesh(rockGeo,rockMat);rock.position.set(x,heightAt(h,x,z)+.4,z);rock.scale.set(1+rng()*2,.6+rng(),1+rng());rock.rotation.set(rng(),rng(),rng());rock.castShadow=true;this.group.add(rock);}
  const teeMat=new THREE.MeshStandardMaterial({color:'#f6ecd3'});for(const x of [-4,4]){const marker=new THREE.Mesh(new THREE.SphereGeometry(.6,12,8),teeMat);marker.position.set(x,heightAt(h,x,0)+.4,0);this.group.add(marker);}
  if(h.index===0){const house=new THREE.Group(),y=heightAt(h,66,-18);const wall=new THREE.Mesh(new THREE.BoxGeometry(12,6,8),new THREE.MeshStandardMaterial({color:'#efe7ce'}));wall.position.y=3;wall.castShadow=true;house.add(wall);const roof=new THREE.Mesh(new THREE.ConeGeometry(10,5,4),new THREE.MeshStandardMaterial({color:c.id==='coast'?'#679193':'#77936a'}));roof.rotation.y=Math.PI/4;roof.scale.z=.8;roof.position.y=7;roof.castShadow=true;house.add(roof);for(let i=-1;i<=1;i++){const win=new THREE.Mesh(new THREE.BoxGeometry(1.8,2.4,.1),new THREE.MeshStandardMaterial({color:'#577c78'}));win.position.set(i*3.6,3,-4.06);house.add(win);}house.position.set(66,y,-18);house.rotation.y=-.25;this.group.add(house);}
 }
 setBall(p,aim=0){if(!this.hole||this.flight)return;this.ballPosition=p;this.ball.position.set(p.x,heightAt(this.hole,p.x,p.z)+.55,p.z);this.ballRing.position.set(p.x,heightAt(this.hole,p.x,p.z)+.09,p.z);this.ballRing.visible=!this.preview;
  const a=Math.atan2(this.hole.pin.x-p.x,this.hole.pin.z-p.z)+aim*Math.PI/180,d=Math.min(distance(p,this.hole.pin),75),points=[];for(let i=0;i<=30;i++){const x=p.x+Math.sin(a)*d*i/30,z=p.z+Math.cos(a)*d*i/30;points.push(new THREE.Vector3(x,heightAt(this.hole,x,z)+.25,z));}this.aimLine.geometry.dispose();this.aimLine.geometry=new THREE.BufferGeometry().setFromPoints(points);this.aimLine.computeLineDistances();this.aimLine.visible=!this.preview;this.setCamera();
 }
 setCamera(immediate=false){if(!this.hole)return;const h=this.hole;
  if(this.preview||this.view==='overview'){
   const d=Math.max(205,h.length*.78)*(this.camera.aspect<1.2?1.2:1),a=.62+this.orbit;this.targetPosition.set(Math.sin(a)*d,d*.85,h.length*.44-Math.cos(a)*d);this.targetLook.set(0,0,h.length*.46);
  }else{
   const p=this.flight?this.ball.position:{...this.ballPosition,y:heightAt(h,this.ballPosition.x,this.ballPosition.z)},d=distance(p,h.pin),a=Math.atan2(h.pin.x-p.x,h.pin.z-p.z)+this.orbit;
   const zoom=clamp(d*.85,30,145),height=clamp(d*.7,28,120),look=Math.min(55,d*.32);this.targetPosition.set(p.x-Math.sin(a)*zoom+Math.cos(a)*zoom*.24,p.y+height,p.z-Math.cos(a)*zoom-Math.sin(a)*zoom*.24);this.targetLook.set(p.x+Math.sin(a)*look,p.y,p.z+Math.cos(a)*look);
  }
  if(immediate){this.camera.position.copy(this.targetPosition);this.currentLook.copy(this.targetLook);this.camera.lookAt(this.currentLook);}
 }
 playShot(shot){this.flight={shot,start:performance.now()};this.aimLine.visible=false;this.ballRing.visible=false;this.view='follow';this.orbit=0;}
 finish(p){this.flight=null;this.setBall(p);}
 overview(){this.view=this.view==='overview'?'follow':'overview';this.orbit=0;this.setCamera();}
 toggleSlope(){this.slopeVisible=!this.slopeVisible;this.slopeGrid.visible=this.slopeVisible;if(this.slopeVisible){this.view='follow';const h=this.hole;this.targetPosition.set(h.pin.x+20,heightAt(h,h.pin.x,h.pin.z)+40,h.pin.z-30);this.targetLook.set(h.pin.x,heightAt(h,h.pin.x,h.pin.z),h.pin.z);}else this.setCamera();return this.slopeVisible;}
 frame(){
  if(!this.hole||!this.container.clientWidth||!this.container.clientHeight)return;const time=(performance.now()-this.startTime)/1000;
  if(this.flag){const p=this.flag.geometry.attributes.position;for(let i=0;i<p.count;i++){const x=p.getX(i)+2.3;p.setZ(i,Math.sin(time*2.8+x*.9)*.22*x/4.6);}p.needsUpdate=true;}
  if(this.flight){const {shot,start}=this.flight,t=clamp((performance.now()-start)/(shot.duration*1000),0,1),p=shot.path,physical=t*p[p.length-1].t;let lo=0,hi=p.length-1;while(lo<hi-1){const m=(lo+hi)>>1;if(p[m].t<physical)lo=m;else hi=m;}const a=p[lo],b=p[hi],f=clamp((physical-a.t)/(b.t-a.t||1),0,1);this.ball.position.set(a.x+(b.x-a.x)*f,a.y+(b.y-a.y)*f+.38,a.z+(b.z-a.z)*f);this.ball.scale.setScalar(1.2);this.setCamera();}
  else this.ball.scale.setScalar(this.preview?1:1+Math.sin(time*2)*.03);
  this.camera.position.lerp(this.targetPosition,.045);this.currentLook.lerp(this.targetLook,.06);this.camera.lookAt(this.currentLook);this.renderer.render(this.scene,this.camera);
 }
}
