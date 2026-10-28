import * as THREE from 'three';
import {courseTour,courseHeight} from '../shared/course-tour.js';
import {sampleRoute} from '../shared/travel.js';
import {clamp} from '../shared/courses.js';
import {GolfCart} from './golf-cart.js';
import {Golfer} from './golfer.js';
import {CourseLandscape,roadMesh} from './course-landscape.js';

export class CourseJourney {
 constructor(scene,state){
  this.scene=scene;this.transfer=state.transfer;this.tour=courseTour(state.courseId,state.seed);this.landscape=new CourseLandscape(this.tour);scene.scene.add(this.landscape);scene.group.visible=false;scene.viewToolbar.hidden=true;this.landscape.add(roadMesh(this.tour,this.transfer.route));this.fleet=[];
  for(let i=0;i<Math.ceil(state.players.length/2);i++){const cart=new GolfCart();this.landscape.add(cart.root);const riders=[];for(let j=0;j<2;j++){const player=state.players[i*2+j];if(!player)continue;const golfer=new Golfer(player.style);golfer.root.position.set(j?.35:-.35,-.17,-.25);golfer.root.rotation.y=-Math.PI/2;golfer.setLocomotion('ride');cart.root.add(golfer.root);riders.push(golfer);}this.fleet.push({cart,riders});}
  this.ray=new THREE.Raycaster();this.savedFog=scene.scene.fog;scene.scene.fog=new THREE.Fog(this.tour.course.sky,220,1200);this.savedNear=scene.camera.near;scene.camera.near=.25;scene.camera.updateProjectionMatrix();this.update(Date.now(),.016,true);
 }
 update(now,dt,immediate=false){
  const {scene,transfer:t,tour}=this,elapsed=clamp(now-t.startedAt,0,t.duration),u=clamp((elapsed-t.boarding)/t.driving,0,1),smooth=u*u*(3-2*u);this.progress=elapsed/t.duration;
  this.fleet.forEach(({cart,riders},i)=>{const q=sampleRoute(t.route,Math.max(0,smooth-i*6/Math.max(t.meters,1)));cart.root.position.set(q.x,courseHeight(tour,q),q.z);const turn=Math.atan2(Math.sin(q.heading-cart.root.rotation.y),Math.cos(q.heading-cart.root.rotation.y));cart.root.rotation.y=immediate?q.heading:cart.root.rotation.y+turn*Math.min(1,dt*8);cart.roll(q.distance);riders.forEach(g=>g.update(dt,elapsed/1000));});
  const cart=this.fleet[0].cart.root,a=cart.rotation.y,p=cart.position;scene.targetPosition.set(p.x-Math.sin(a)*11+Math.cos(a)*5,p.y+7,p.z-Math.cos(a)*11-Math.sin(a)*5);scene.targetLook.set(p.x+Math.sin(a)*3,p.y+1,p.z+Math.cos(a)*3);
  if(t.toIndex===null&&u>.9){const f=clamp((u-.9)/.1,0,1);scene.targetPosition.lerp(new THREE.Vector3(p.x+14,p.y+9,p.z-16),f);scene.targetLook.lerp(new THREE.Vector3(p.x-3,p.y+1,p.z+4),f);}
  this.landscape.updateMatrixWorld(true);const focus=p.clone().add(new THREE.Vector3(0,1,0));for(let attempt=0;attempt<3;attempt++){const direction=focus.clone().sub(scene.targetPosition);this.ray.set(scene.targetPosition,direction.clone().normalize());this.ray.far=direction.length();if(!this.ray.intersectObject(this.landscape.foliage,false).length)break;scene.targetPosition.y+=6;}
  scene.sun.target.position.copy(p);scene.sun.position.set(p.x-25,p.y+45,p.z-25);const f=immediate?1:1-Math.exp(-dt*5);scene.camera.position.lerp(scene.targetPosition,f);scene.currentLook.lerp(scene.targetLook,f);scene.camera.lookAt(scene.currentLook);scene.atmosphere.update(scene.camera,elapsed/1000,false);scene.renderer.render(scene.scene,scene.camera);
  return elapsed<t.boarding?'上车出发':elapsed<t.boarding+t.driving?'沿球车道接驳':'抵达停靠点';
 }
 dispose(){this.landscape.dispose();this.scene.group.visible=true;this.scene.scene.fog=this.savedFog;this.scene.camera.near=this.savedNear;this.scene.camera.updateProjectionMatrix();}
}
