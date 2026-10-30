import * as THREE from 'three';
import {random} from '../shared/courses.js';
import {cartoonSkyTexture,cartoonCloudTexture} from './toon-look.js';

export const ENVIRONMENT_ASSETS=Object.freeze({atlas:'course-atlas-v1.webp',sky:'sky-v1.webp',cloud:'cloud-v1.webp',rough:'rough-clumps-v1.webp'});
export const ATLAS_CELLS=Object.freeze({fairway:[0,1],green:[1,1],rough:[2,1],sand:[3,1],bark:[0,0],leaves:[1,0],pine:[2,0],water:[3,0]});
const textures=new Map();
export function environmentTexture(kind){
 if(textures.has(kind))return textures.get(kind);
 let texture;if(typeof document==='undefined')texture=new THREE.DataTexture(new Uint8Array([128,128,128,255]),1,1);else texture=new THREE.TextureLoader().load('/screen-web/assets/environment/'+ENVIRONMENT_ASSETS[kind],t=>{t.userData.ready=true;},undefined,()=>{texture.userData.failed=true;});
 texture.colorSpace=THREE.SRGBColorSpace;texture.anisotropy=4;texture.userData.sharedEnvironmentTexture=true;textures.set(kind,texture);return texture;
}
// 材质图集共八格，边缘留采样余量；显式导数防止重复接缝造成错误的 mip 层级。
export const ATLAS_GLSL=`uniform sampler2D courseAtlas;
vec3 courseTex(vec2 uv,vec2 cell){
 vec2 tile=vec2(.25,.5),p=(fract(uv)*.98+.01+cell)*tile;
 return textureGrad(courseAtlas,p,clamp(dFdx(uv)*tile*.98,vec2(-.008),vec2(.008)),clamp(dFdy(uv)*tile*.98,vec2(-.008),vec2(.008))).rgb;
}
float courseLuma(vec3 c){return dot(c,vec3(.2126,.7152,.0722));}
vec3 courseBump(vec3 n,float h){vec3 sx=dFdx(-vViewPosition),sy=dFdy(-vViewPosition),r1=cross(sy,n),r2=cross(n,sx);float det=dot(sx,r1);return normalize(abs(det)*n-sign(det)*(dFdx(h)*r1+dFdy(h)*r2));}
`;
export function addTerrainTextures(material){
 const original=material.onBeforeCompile,atlas=environmentTexture('atlas');
 material.onBeforeCompile=shader=>{original(shader);shader.uniforms.courseAtlas={value:atlas};shader.uniforms.courseReady={value:atlas.userData.ready?1:0};material.userData.courseReady=shader.uniforms.courseReady;
  shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\n'+ATLAS_GLSL+'\nuniform float courseReady; float surfaceRelief;');
  shader.fragmentShader=shader.fragmentShader.replace('#include <roughnessmap_fragment>',`#include <roughnessmap_fragment>
   float textureDetail=1.0-smoothstep(25.0,170.0,length(vViewPosition));
   vec2 groundCell=groundKind>2.5?vec2(1.0,1.0):groundKind>1.5?vec2(3.0,1.0):groundKind>.5?vec2(2.0,1.0):vec2(0.0,1.0);
   float tileScale=groundKind>2.5?3.2:groundKind>1.5?1.8:groundKind>.5?.7:1.1;
   vec3 surfaceTex=courseTex(terrainXZ*tileScale,groundCell);float grainLuma=courseLuma(surfaceTex);
   float meanLuma=groundKind>2.5?.24:groundKind>1.5?.68:groundKind>.5?.11:.18;
   float grainContrast=clamp(grainLuma/meanLuma,.58,1.42);
   diffuseColor.rgb*=mix(1.0,grainContrast,textureDetail*.26*courseReady);
   roughnessFactor=mix(roughnessFactor,groundKind>2.5?.82:.97,textureDetail*courseReady);
   surfaceRelief=grainLuma*(groundKind>2.5?.0006:groundKind>1.5?.0028:.002)*textureDetail*courseReady;
  `);
  shader.fragmentShader=shader.fragmentShader.replace('#include <normal_fragment_maps>','#include <normal_fragment_maps>\nnormal=courseBump(normal,surfaceRelief);');
 };material.customProgramCacheKey=()=> 'golf-terrain-atlas-v1';material.userData.atlas=atlas;return material;
}
// fade=true 时按实例属性做有序抖动透明，挡住球和镜头之间视线的树会被淡化；阴影保持不变。
export function treeMaterial(color,kind,fade=false){
 const material=new THREE.MeshStandardMaterial({color,roughness:.96}),cell=ATLAS_CELLS[kind],atlas=environmentTexture('atlas');
 material.onBeforeCompile=shader=>{shader.uniforms.courseAtlas={value:atlas};shader.uniforms.courseReady={value:atlas.userData.ready?1:0};material.userData.courseReady=shader.uniforms.courseReady;
  shader.vertexShader='varying vec3 treePosition; varying vec3 treeNormal;\n'+shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\ntreePosition=position;treeNormal=normal;');
  if(fade){shader.vertexShader='attribute float instanceFade; varying float vTreeFade;\n'+shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nvTreeFade=instanceFade;');shader.fragmentShader='varying float vTreeFade;\n'+shader.fragmentShader.replace('#include <clipping_planes_fragment>','#include <clipping_planes_fragment>\nif(vTreeFade<.995){ivec2 q=ivec2(mod(gl_FragCoord.xy,4.0));int i=q.x+q.y*4;float m[16]=float[16](0.,8.,2.,10.,12.,4.,14.,6.,3.,11.,1.,9.,15.,7.,13.,5.);if((m[i]+.5)/16.>=vTreeFade)discard;}');}
  shader.fragmentShader='varying vec3 treePosition; varying vec3 treeNormal;\n'+shader.fragmentShader;
  shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\n'+ATLAS_GLSL+'\nuniform float courseReady; float barkHeight;');
  const uv=kind==='bark'?'vec2(atan(treePosition.x,treePosition.z)*.6366,treePosition.y*.75)':'(abs(treeNormal.y)>.55?treePosition.xz:abs(treeNormal.x)>.55?treePosition.zy:treePosition.xy)*'+(kind==='pine'?'1.3':'2.0');
  shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
   vec3 leaves=courseTex(${uv},vec2(${cell[0]}.0,${cell[1]}.0));float relief=courseLuma(leaves);float detail=(1.0-smoothstep(35.0,210.0,length(vViewPosition)))*courseReady;
   diffuseColor.rgb*=mix(1.0,clamp(relief/${kind==='bark'?'.19':kind==='pine'?'.09':'.16'},.55,1.45),detail*.3);
   barkHeight=relief*${kind==='bark'?'.01':'.007'}*detail;
  `);
  shader.fragmentShader=shader.fragmentShader.replace('#include <normal_fragment_maps>','#include <normal_fragment_maps>\nnormal=courseBump(normal,barkHeight);');
 };material.customProgramCacheKey=()=> 'tree-atlas-'+kind+(fade?'-fade':'');material.userData.atlas=atlas;return material;
}
export function refreshTexture(material){if(material?.userData.courseReady)material.userData.courseReady.value=material.userData.atlas?.userData.ready?1:0;}

export class CourseAtmosphere {
 constructor(scene){
  this.sky=new THREE.Mesh(new THREE.SphereGeometry(1000,32,16),new THREE.MeshBasicMaterial({map:cartoonSkyTexture(),side:THREE.BackSide,depthWrite:false,fog:false,toneMapped:false}));this.sky.userData.noOutline=true;this.sky.frustumCulled=false;this.sky.renderOrder=-20;scene.add(this.sky);
  const mat=new THREE.MeshBasicMaterial({map:cartoonCloudTexture(),transparent:true,depthWrite:false,fog:false,opacity:.97,side:THREE.DoubleSide,toneMapped:false});
  this.clouds=new THREE.InstancedMesh(new THREE.PlaneGeometry(1,1),mat,7);this.clouds.frustumCulled=false;this.clouds.renderOrder=-10;this.clouds.instanceMatrix.setUsage(THREE.DynamicDrawUsage);scene.add(this.clouds);this.dummy=new THREE.Object3D();
 }
 load(hole){const rng=random(hole.seed+990);this.center=hole.length*.5;this.cloudData=Array.from({length:7},(_,i)=>({x:(i-3)*150+(rng()-.5)*50,y:105+rng()*55,z:this.center+420+rng()*210,width:105+rng()*95,phase:rng()*6}));}
 update(camera,time,overview=false){
  this.sky.position.copy(camera.position);this.sky.visible=!!this.sky.material.map.userData.ready;this.clouds.visible=!overview&&!!this.clouds.material.map.userData.ready;
  if(!this.clouds.visible||!this.cloudData)return;
  this.cloudData.forEach((c,i)=>{this.dummy.position.set(c.x+Math.sin(time*.009+c.phase)*24,c.y,c.z);this.dummy.quaternion.copy(camera.quaternion);this.dummy.scale.set(c.width,c.width*2/3,1);this.dummy.updateMatrix();this.clouds.setMatrixAt(i,this.dummy.matrix);});this.clouds.instanceMatrix.needsUpdate=true;
 }
}
