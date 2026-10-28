import * as THREE from 'three';
export const CLUB_FINISHES={driver:{name:'碳纤维冠部 · 石墨杆身',tile:0,roughness:.32,metalness:.18},iron:{name:'拉丝精钢 · 平行沟槽',tile:1,roughness:.35,metalness:.55},wedge:{name:'香槟镍面 · 高倾角杆面',tile:2,roughness:.48,metalness:.5},sand:{name:'铜色喷砂 · 宽底救球',tile:3,roughness:.62,metalness:.45},chip:{name:'枪灰钛色 · 短切杆面',tile:4,roughness:.4,metalness:.5},putter:{name:'哑黑杆头 · 白色瞄准线',tile:5,roughness:.5,metalness:.35}};
let atlas,fallback;const textures=new Map();
function texture(tile){
 if(typeof document==='undefined')return null;if(textures.has(tile))return textures.get(tile);
 if(!fallback){fallback=document.createElement('canvas');fallback.width=fallback.height=2;const ctx=fallback.getContext('2d');ctx.fillStyle='#ffffff';ctx.fillRect(0,0,2,2);}
 atlas??=new THREE.TextureLoader().load('/screen-web/assets/club-material-atlas.png',loaded=>{for(const t of textures.values()){t.image=loaded.image;t.needsUpdate=true;}});
 const map=new THREE.Texture(atlas.image||fallback);map.colorSpace=THREE.SRGBColorSpace;map.offset.set((tile%3)/3+.003,tile<3?.503:.003);map.repeat.set(1/3-.006,.494);map.anisotropy=4;map.userData.sharedClubTexture=true;map.needsUpdate=true;textures.set(tile,map);return map;
}
export function createClub(id='iron'){
 const style=CLUB_FINISHES[id]||CLUB_FINISHES.iron,root=new THREE.Group(),head=new THREE.Group();root.add(head);head.position.set(.09,-1.14,0);
 const metal=new THREE.MeshStandardMaterial({color:'#edf0ed',map:texture(style.tile),roughness:style.roughness,metalness:style.metalness}),steel=new THREE.MeshStandardMaterial({color:'#c2cbd0',roughness:.28,metalness:.55}),rubber=new THREE.MeshStandardMaterial({color:id==='driver'?'#243940':'#35433a',roughness:.95});
 const add=(geometry,material,parent=root)=>{const mesh=new THREE.Mesh(geometry,material);mesh.castShadow=true;mesh.receiveShadow=true;parent.add(mesh);return mesh;};
 const shaft=add(new THREE.CylinderGeometry(.012,.016,1.14,14),id==='driver'?new THREE.MeshStandardMaterial({color:'#4b565c',map:texture(0),roughness:.4,metalness:.25}):steel);shaft.position.y=-.57;
 const grip=add(new THREE.CylinderGeometry(.025,.022,.27,16),rubber);grip.position.y=-.12;
 for(let i=0;i<12;i++){const ring=add(new THREE.TorusGeometry(.024,.0017,4,16),rubber);ring.rotation.x=Math.PI/2;ring.position.y=-.025-i*.018;}
 const band=add(new THREE.CylinderGeometry(.025,.025,.018,16),new THREE.MeshStandardMaterial({color:['#c7b681','#d1d5d4','#e8c7a1','#c28b61','#8ba2b0','#e7e1c8'][style.tile],roughness:.4}));band.position.y=-.255;
 if(id==='driver'){const crown=add(new THREE.SphereGeometry(1,32,20),metal,head);crown.scale.set(.16,.095,.14);const face=add(new THREE.SphereGeometry(1,24,16),steel,head);face.scale.set(.13,.07,.018);face.position.z=.132;}
 else if(id==='putter'){const body=add(new THREE.BoxGeometry(.28,.075,.14),metal,head);body.position.x=.015;const insert=add(new THREE.BoxGeometry(.22,.042,.006),steel,head);insert.position.set(.015,0,.073);const stripe=add(new THREE.BoxGeometry(.009,.003,.12),new THREE.MeshStandardMaterial({color:'#f8f1d5',roughness:.8}),head);stripe.position.set(.015,.039,0);}
 else {const wedge=id==='wedge'||id==='sand',body=add(new THREE.BoxGeometry(.22,wedge?.14:.11,id==='sand'?.09:.055),metal,head);body.rotation.x=wedge?-.25:-.1;const toe=add(new THREE.SphereGeometry(1,16,12),metal,head);toe.scale.set(.035,wedge?.07:.055,.033);toe.position.x=.11;const heel=add(new THREE.CylinderGeometry(.025,.026,.11,12),steel,head);heel.position.set(-.09,.065,0);for(let i=0;i<6;i++){const groove=add(new THREE.BoxGeometry(.16,.0024,.003),new THREE.MeshStandardMaterial({color:'#39474a',roughness:.85}),body);groove.position.set(.01,-.04+i*.015,(id==='sand'?.045:.0275)+.002);}}
 root.userData.clubId=id;return root;
}
export function disposeClub(root){root.traverse(o=>{o.geometry?.dispose();if(o.material)for(const material of Array.isArray(o.material)?o.material:[o.material])material.dispose();});}
