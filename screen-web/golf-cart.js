import * as THREE from 'three';
export class GolfCart {
 constructor(){
  this.root=new THREE.Group();this.wheels=[];const material=(color,roughness=.65)=>new THREE.MeshStandardMaterial({color,roughness}),ivory=material('#f6efd9'),green=material('#2e6657'),dark=material('#263b35'),rubber=material('#26302d',.96),seat=material('#d9c7a3',.9),chrome=new THREE.MeshStandardMaterial({color:'#bccbc8',metalness:.45,roughness:.3});
  const mesh=(geometry,mat,x,y,z,parent=this.root)=>{const o=new THREE.Mesh(geometry,mat);o.position.set(x,y,z);o.castShadow=true;o.receiveShadow=true;parent.add(o);return o;},box=(w,h,d,mat,x,y,z)=>mesh(new THREE.BoxGeometry(w,h,d),mat,x,y,z);
  box(1.65,.18,2.5,green,0,.3,0);box(1.4,.12,1.4,dark,0,.34,-.05);box(1.58,.35,.55,ivory,0,.68,1);box(1.65,.12,.16,dark,0,.41,1.3);box(1.55,.25,.4,green,0,.68,-1);
  box(1.32,.15,.58,seat,0,.7,-.3);box(1.32,.52,.13,seat,0,1,-.59);box(1.85,.12,2.65,ivory,0,2.3,-.03);
  for(const x of [-.7,.7])for(const z of [-.91,.85])mesh(new THREE.CylinderGeometry(.026,.026,1.67,8),chrome,x,1.405,z);
  const screen=mesh(new THREE.PlaneGeometry(1.34,.8),new THREE.MeshStandardMaterial({color:'#c7e4e6',transparent:true,opacity:.23,roughness:.15,side:THREE.DoubleSide,depthWrite:false}),0,1.75,.84);screen.rotation.x=-.1;
  for(const x of [-.56,.56])box(.28,.13,.03,new THREE.MeshBasicMaterial({color:'#fff6bc'}),x,.71,1.29);
  for(const x of [-.83,.83])for(const z of [-.82,.82]){const wheel=new THREE.Group();wheel.position.set(x,.28,z);this.root.add(wheel);const tire=mesh(new THREE.CylinderGeometry(.28,.28,.17,20),rubber,0,0,0,wheel);tire.rotation.z=Math.PI/2;const hub=mesh(new THREE.CylinderGeometry(.15,.15,.19,16),chrome,0,0,0,wheel);hub.rotation.z=Math.PI/2;this.wheels.push(wheel);}
  const steering=mesh(new THREE.TorusGeometry(.19,.023,8,24),dark,-.35,1.05,.54);steering.rotation.x=-.5;const column=mesh(new THREE.CylinderGeometry(.025,.025,.6,8),chrome,-.35,.82,.64);column.rotation.x=.45;
  const bag=mesh(new THREE.CylinderGeometry(.22,.18,.85,14),green,.43,1.04,-1.05);bag.rotation.x=-.13;for(let i=0;i<3;i++){mesh(new THREE.CylinderGeometry(.012,.012,.65,8),chrome,.32+i*.11,1.62,-1.1);box(.13,.06,.07,chrome,.37+i*.11,1.95,-1.1);}
 }
 roll(distance){for(const wheel of this.wheels)wheel.rotation.x=distance/.28;}
}
