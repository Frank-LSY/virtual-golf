import * as THREE from 'three';
import {CLUBS} from '../shared/clubs.js';
import {createClub,disposeClub,CLUB_FINISHES} from './club-model.js';
import {bindViewGestures} from './view-controls.js';

export class ClubPreview {
 constructor(){
  this.dialog=document.createElement('dialog');this.dialog.className='club-dialog';this.dialog.setAttribute('aria-label','球杆细节');
  this.dialog.innerHTML='<button class="dialog-close" aria-label="关闭球杆细节">×</button><p class="eyebrow">球包 / 材质与杆型</p><h2>选一支合适的球杆。</h2><div class="club-tabs"></div><div class="club-preview-canvas" aria-label="可拖动旋转的三维球杆"></div><div class="club-preview-tools"><button data-action="left" aria-label="球杆左转">↶ 左转</button><button data-action="right" aria-label="球杆右转">右转 ↷</button><button data-action="scale">查看整杆</button><button data-action="reset">复位</button></div><h3 class="club-preview-name"></h3><p class="club-preview-detail"></p><p class="club-preview-hint">拖动旋转 · 滚轮或双指缩放 · 材质为原创设计</p><button class="primary club-use">本杆使用 →</button><p class="club-use-note"></p>';
  document.body.append(this.dialog);this.container=this.dialog.querySelector('.club-preview-canvas');
  this.dialog.querySelector('.dialog-close').onclick=()=>this.dialog.close();this.dialog.addEventListener('close',()=>this.renderer?.setAnimationLoop(null));
  const tabs=this.dialog.querySelector('.club-tabs');for(const club of CLUBS){const button=document.createElement('button');button.dataset.club=club.id;button.innerHTML=`<i class="club-swatch swatch-${club.id}"></i>${club.name}`;button.onclick=()=>this.select(club.id);tabs.append(button);}
  this.dialog.querySelectorAll('[data-action]').forEach(button=>button.onclick=()=>{const action=button.dataset.action;if(action==='scale'){this.full=!this.full;this.reset();}else if(action==='reset')this.reset();else this.rig.rotation.y+=action==='left'?-.35:.35;});
  this.dialog.querySelector('.club-use').onclick=()=>{if(this.options?.canChoose?.()){this.options.choose(this.id);this.dialog.close();}};
 }
 init(){
  if(this.renderer)return;this.renderer=new THREE.WebGLRenderer({antialias:true,alpha:true});this.renderer.setPixelRatio(Math.min(devicePixelRatio,2));this.renderer.toneMapping=THREE.ACESFilmicToneMapping;this.renderer.toneMappingExposure=1.35;this.container.append(this.renderer.domElement);
  this.scene=new THREE.Scene();this.scene.background=new THREE.Color('#e8eee2');this.camera=new THREE.PerspectiveCamera(34,1,.01,20);this.rig=new THREE.Group();this.scene.add(this.rig);
  this.scene.add(new THREE.HemisphereLight('#ffffff','#7d887b',2.4));for(const [x,y,z,power] of [[2,3,4,4],[-3,1,-2,3],[0,-2,3,1.2]]){const light=new THREE.DirectionalLight('#ffffff',power);light.position.set(x,y,z);this.scene.add(light);}
  bindViewGestures(this.renderer.domElement,{drag:(x,y)=>{this.rig.rotation.y+=x*.012;this.rig.rotation.x=THREE.MathUtils.clamp(this.rig.rotation.x+y*.009,-1.2,1.2);},zoom:f=>{this.distance=THREE.MathUtils.clamp(this.distance/f,this.full?1.3:.48,this.full?4.5:2.2);this.placeCamera();},rotate:a=>this.rig.rotation.y+=a});
  new ResizeObserver(()=>this.resize()).observe(this.container);
 }
 show(id,options={}){this.options=options;this.dialog.showModal();this.init();this.full=false;this.select(id);this.resize();this.renderer.setAnimationLoop(()=>{if(!this.dialog.open)return;this.dialog.querySelector('.club-use').disabled=!this.options?.canChoose?.();this.renderer.render(this.scene,this.camera);});}
 select(id){this.id=CLUB_FINISHES[id]?id:'iron';if(this.club){this.rig.remove(this.club);disposeClub(this.club);}this.club=createClub(this.id);this.rig.add(this.club);const club=CLUBS.find(c=>c.id===this.id);this.dialog.querySelector('.club-preview-name').textContent=club.name;this.dialog.querySelector('.club-preview-detail').textContent=`${CLUB_FINISHES[this.id].name} · ${club.tip} · 参考 ${club.range} 米`;this.dialog.querySelector('.club-use-note').textContent='更换球杆后需重新准备击球。距离会随力量、地形与风而变化。';this.dialog.querySelectorAll('[data-club]').forEach(b=>{b.classList.toggle('selected',b.dataset.club===this.id);b.setAttribute('aria-pressed',String(b.dataset.club===this.id));});this.reset();}
 reset(){if(!this.club)return;this.rig.rotation.set(.05,-.35,0);this.club.position.y=this.full?.6:1.12;this.distance=this.full?2.6:.88;this.placeCamera();this.dialog.querySelector('[data-action="scale"]').textContent=this.full?'杆头特写':'查看整杆';}
 placeCamera(){this.camera.position.set(0,this.full?.15:.32,this.distance);this.camera.lookAt(0,0,0);}
 resize(){const w=this.container.clientWidth,h=this.container.clientHeight;if(!w||!h)return;this.renderer.setSize(w,h,false);this.camera.aspect=w/h;this.camera.updateProjectionMatrix();}
}
