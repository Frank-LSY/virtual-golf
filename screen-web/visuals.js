import {addTerrainTextures} from './environment-textures.js';
import * as THREE from 'three';
import {BALL_RADIUS,CUP_RADIUS,CUP_DEPTH} from '../shared/ball.js';
import {heightAt,slopeAt} from '../shared/courses.js';
import {courseStyle} from '../shared/course-styles.js';
let ballGeometry,ballTexture;
export function golfBallTexture(){
 if(ballTexture)return ballTexture;const w=512,h=256,data=new Uint8Array(w*h*4);
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){const i=(y*w+x)*4,u=x/w,v=y/h,n=((x*73+y*137+x*y*7)%17)/17,ink=u>.35&&u<.64&&(Math.abs(v-.5)<.005||Math.abs(v-.52)<.002),edge=u>.355&&u<.365&&v>.487&&v<.535;const c=ink||edge?[46,94,84]:[247+n*7,247+n*7,242+n*7];data.set([...c,255],i);}
 ballTexture=new THREE.DataTexture(data,w,h);ballTexture.colorSpace=THREE.SRGBColorSpace;ballTexture.generateMipmaps=true;ballTexture.minFilter=THREE.LinearMipmapLinearFilter;ballTexture.magFilter=THREE.LinearFilter;ballTexture.userData.sharedBallTexture=true;ballTexture.needsUpdate=true;return ballTexture;
}
// 凹点由真实几何产生，细纹与短瞄准线共用一张程序纹理；换洞不重复构建。
export function golfBall(){
 if(!ballGeometry){const geometry=new THREE.SphereGeometry(BALL_RADIUS,128,64),p=geometry.attributes.position,centers=[];
 for(let i=0;i<280;i++){const y=1-2*(i+.5)/280,r=Math.sqrt(1-y*y),a=i*2.39996323;centers.push([Math.cos(a)*r,y,Math.sin(a)*r]);}
 for(let i=0;i<p.count;i++){const x=p.getX(i)/BALL_RADIUS,y=p.getY(i)/BALL_RADIUS,z=p.getZ(i)/BALL_RADIUS;let dot=-1;for(const c of centers)dot=Math.max(dot,x*c[0]+y*c[1]+z*c[2]);const q=Math.max(0,1-(1-dot)/.0042),r=1-.025*q*q;p.setXYZ(i,p.getX(i)*r,p.getY(i)*r,p.getZ(i)*r);}
 geometry.computeVertexNormals();geometry.userData.sharedBallGeometry=true;ballGeometry=geometry;}
 const ball=new THREE.Mesh(ballGeometry,new THREE.MeshPhysicalMaterial({color:'#ffffff',map:golfBallTexture(),roughness:.27,metalness:0,clearcoat:.3,clearcoatRoughness:.28}));ball.castShadow=true;ball.receiveShadow=true;return ball;
}
// 0.27 地面纹样随球场风格变化：球道修剪纹（格纹 / 直条 / 斜条 / 宽带 / 自然斑驳 / 波纹）、
// 长草（三叶草小花 / 雏菊 / 松针 / 沙砾灌丛 / 沙丘草 / 苔藓）、沙坑（耙痕 / 风纹 / 细浪纹）。
const TERRAIN_NOISE=`float courseHash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float courseNoise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);return mix(mix(courseHash(i),courseHash(i+vec2(1.0,0.0)),f.x),mix(courseHash(i+vec2(0.0,1.0)),courseHash(i+vec2(1.0,1.0)),f.x),f.y);}
`;
export function terrainMaterial(hole){
 const style=courseStyle(hole.practice?'sunny':hole.courseId),material=new THREE.MeshStandardMaterial({vertexColors:true,roughness:.95});material.defines={COURSE_MOW:style.mow,COURSE_ROUGH:style.rough,COURSE_SAND:style.sandStyle};material.userData.courseSand={value:new THREE.Color(style.sand)};material.userData.liePosition={value:new THREE.Vector2()};material.userData.lieRadius={value:0};
 material.onBeforeCompile=shader=>{shader.uniforms.cupPosition={value:new THREE.Vector2(hole.pin.x,hole.pin.z)};shader.uniforms.cupRadius={value:hole.practice?0:CUP_RADIUS};shader.vertexShader='varying vec2 terrainXZ;\n'+shader.vertexShader;shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nterrainXZ = position.xz;');shader.fragmentShader='varying vec2 terrainXZ;\nuniform vec2 cupPosition;\nuniform float cupRadius;\n'+shader.fragmentShader;shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>','#include <color_fragment>\nif (distance(terrainXZ, cupPosition) < cupRadius) discard;\nfloat grain = fract(sin(dot(floor(terrainXZ * 65.0), vec2(12.9898, 78.233))) * 43758.5453);\ndiffuseColor.rgb *= 1.0+(grain-.5)*.055*(1.0-smoothstep(3.0,28.0,length(vViewPosition)));');};
 const original=material.onBeforeCompile;material.onBeforeCompile=shader=>{original(shader);shader.uniforms.liePosition=material.userData.liePosition;shader.uniforms.lieRadius=material.userData.lieRadius;shader.vertexShader='attribute float terrainKind; varying float groundKind;\n'+shader.vertexShader;shader.vertexShader=shader.vertexShader.replace('terrainXZ = position.xz;','terrainXZ = position.xz; groundKind = terrainKind;');shader.uniforms.courseSand=material.userData.courseSand;shader.fragmentShader='uniform vec2 liePosition; uniform float lieRadius; uniform vec3 courseSand; varying float groundKind;\n'+TERRAIN_NOISE+shader.fragmentShader;shader.fragmentShader=shader.fragmentShader.replace('diffuseColor.rgb *= 1.0+(grain-.5)*.055*(1.0-smoothstep(3.0,28.0,length(vViewPosition)));',`if(distance(terrainXZ,liePosition)<lieRadius) discard;
 diffuseColor.rgb *= 1.0+(grain-.5)*.055*(1.0-smoothstep(3.0,28.0,length(vViewPosition)));
 float sand = smoothstep(1.55, 1.95, groundKind) * (1.0 - smoothstep(2.05, 2.5, groundKind));
 float puttingGreen = smoothstep(2.65, 2.95, groundKind);
 float mowing = sin((terrainXZ.x * .75 + terrainXZ.y) * 1.25);
 diffuseColor.rgb *= 1.0 + puttingGreen * (mowing * .023 + (grain - .5) * .035);
 float n1 = courseNoise(terrainXZ * .055), n2 = courseNoise(terrainXZ * .21 + 7.3);
 float nearDetail = 1.0 - smoothstep(18.0, 75.0, length(vViewPosition));
 #if COURSE_SAND == 1
  float ripple = sin(terrainXZ.x * 3.4 + courseNoise(terrainXZ * .3) * 5.0 + terrainXZ.y * .8);
  diffuseColor.rgb *= 1.0 + sand * (ripple * .075 + (grain - .5) * .08);
 #elif COURSE_SAND == 2
  float ripple = sin(terrainXZ.y * 5.0 + sin(terrainXZ.x * .9) * 1.5);
  diffuseColor.rgb *= 1.0 + sand * (ripple * .035 + (grain - .5) * .06);
 #else
  float rake = sin(terrainXZ.x * 25.0 + sin(terrainXZ.y * .55) * 2.0);
  diffuseColor.rgb *= 1.0 + sand * (rake * .035 + (grain - .5) * .13);
 #endif
 float rough = smoothstep(.65, .95, groundKind) * (1.0 - smoothstep(1.05, 1.4, groundKind));
 diffuseColor.rgb *= 1.0 - rough * .05 + rough * sin(terrainXZ.x * 15.0 + terrainXZ.y * 8.0) * .025;
 vec2 cellUV = terrainXZ * 1.7, cellId = floor(cellUV), cellF = fract(cellUV) - .5;
 float cellHash = fract(sin(dot(cellId, vec2(41.3, 289.1))) * 43758.5453);
 float dotMask = 1.0 - smoothstep(.1, .19, length(cellF - (vec2(fract(cellHash * 7.0), fract(cellHash * 13.0)) - .5) * .5));
 #if COURSE_ROUGH == 0
  diffuseColor.rgb *= 1.0 + rough * (n2 - .5) * .1;
  float flower = rough * nearDetail * step(.93, cellHash) * dotMask;
  diffuseColor.rgb = mix(diffuseColor.rgb, cellHash > .968 ? vec3(1.0, .7, .78) : vec3(1.0, .99, .93), flower);
 #elif COURSE_ROUGH == 1
  float flower = rough * nearDetail * step(.95, cellHash) * dotMask;
  diffuseColor.rgb = mix(diffuseColor.rgb, cellHash > .985 ? vec3(1.0, .86, .3) : vec3(1.0, .99, .92), flower);
 #elif COURSE_ROUGH == 2
  float needles = smoothstep(.5, .72, courseNoise(terrainXZ * .11 + 3.1));
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(.56, .44, .28), rough * needles * .5);
  diffuseColor.rgb *= 1.0 + rough * needles * sin(terrainXZ.x * 9.0 + terrainXZ.y * 4.0) * .06;
 #elif COURSE_ROUGH == 3
  float blotch = smoothstep(.4, .62, courseNoise(terrainXZ * .07 + 1.7));
  diffuseColor.rgb = mix(diffuseColor.rgb, courseSand * .95, rough * blotch * .65);
  diffuseColor.rgb *= 1.0 - rough * nearDetail * step(.9, cellHash) * dotMask * .38;
 #elif COURSE_ROUGH == 4
  float duneGrass = .45 + .55 * courseNoise(terrainXZ * .06 + 9.0);
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(.84, .79, .55), rough * duneGrass * .4);
  diffuseColor.rgb *= 1.0 + rough * (sin(terrainXZ.x * 1.1 + terrainXZ.y * .35 + n1 * 6.0) * .07 + (n2 - .5) * .1);
 #else
  float moss = courseNoise(terrainXZ * .09 + 4.4);
  diffuseColor.rgb *= 1.0 + rough * (moss - .5) * .3;
  diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(1.15, 1.32, .72), rough * smoothstep(.68, .84, moss) * .45);
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(1.0, .45, .65), rough * nearDetail * step(.985, cellHash) * dotMask);
 #endif
 // 球道修剪纹：0.21.1 起的卡通条纹，0.27 起每座球场一种。果岭上细格纹不变。
 float fairwayBand = 1.0 - smoothstep(.25, .75, groundKind);
 #if COURSE_MOW == 0
  float stripe = smoothstep(-.08, .08, sin(terrainXZ.x * .2618) * sin(terrainXZ.y * .2618));
  diffuseColor.rgb *= 1.0 + fairwayBand * (stripe * .11 - .055);
 #elif COURSE_MOW == 2
  float stripe = smoothstep(-.1, .1, sin((terrainXZ.x + terrainXZ.y) * .19));
  diffuseColor.rgb *= 1.0 + fairwayBand * (stripe * .1 - .05);
 #elif COURSE_MOW == 3
  float stripe = smoothstep(-.4, .4, sin(terrainXZ.y * .1));
  diffuseColor.rgb *= 1.0 + fairwayBand * (stripe * .08 - .04 + (n2 - .5) * .07);
 #elif COURSE_MOW == 4
  diffuseColor.rgb *= 1.0 + fairwayBand * ((n1 - .5) * .17 + (n2 - .5) * .06);
  diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(1.08, 1.0, .76), fairwayBand * smoothstep(.6, .8, n1) * .55);
 #elif COURSE_MOW == 5
  float stripe = smoothstep(-.1, .1, sin(terrainXZ.y * .23 + sin(terrainXZ.x * .07) * 2.2));
  diffuseColor.rgb *= 1.0 + fairwayBand * (stripe * .1 - .05);
 #else
  float stripe = smoothstep(-.08, .08, sin(terrainXZ.y * .2417));
  diffuseColor.rgb *= 1.0 + fairwayBand * (stripe * .1 - .05);
 #endif
 float checker = smoothstep(-.06, .06, sin(terrainXZ.x * .85) * sin(terrainXZ.y * .85));
 diffuseColor.rgb *= 1.0 + puttingGreen * (checker * .07 - .035);
 `);};const mat=addTerrainTextures(material),key=mat.customProgramCacheKey;mat.customProgramCacheKey=()=>key()+`-m${style.mow}r${style.rough}s${style.sandStyle}`;return mat;
}
export function holeCup(hole){
 const group=new THREE.Group(),ground=heightAt(hole,hole.pin.x,hole.pin.z),slope=slopeAt(hole,hole.pin.x,hole.pin.z);group.position.set(hole.pin.x,ground,hole.pin.z);group.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),new THREE.Vector3(-slope.x,1,-slope.z).normalize());
 const wall=new THREE.CylinderGeometry(CUP_RADIUS,CUP_RADIUS*.94,CUP_DEPTH,64,8,true),colors=[],top=new THREE.Color('#a6ac91'),base=new THREE.Color('#192a22');for(let i=0;i<wall.attributes.position.count;i++){const t=(wall.attributes.position.getY(i)+CUP_DEPTH/2)/CUP_DEPTH,c=base.clone().lerp(top,t*t);colors.push(c.r,c.g,c.b);}wall.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));const liner=new THREE.Mesh(wall,new THREE.MeshStandardMaterial({vertexColors:true,roughness:.95,side:THREE.DoubleSide}));liner.position.y=-CUP_DEPTH/2;liner.receiveShadow=true;group.add(liner);
 const bottom=new THREE.Mesh(new THREE.CircleGeometry(CUP_RADIUS,64),new THREE.MeshStandardMaterial({color:'#192d26',roughness:1}));bottom.rotation.x=-Math.PI/2;bottom.position.y=-CUP_DEPTH;group.add(bottom);
 const rim=new THREE.Mesh(new THREE.TorusGeometry(CUP_RADIUS+.006,.012,8,64),new THREE.MeshStandardMaterial({color:'#647e43',roughness:1}));rim.rotation.x=Math.PI/2;rim.position.y=.005;rim.receiveShadow=true;group.add(rim);return group;
}
export function rollBall(ball,previous,next){const dx=next.x-previous.x,dz=next.z-previous.z,d=Math.hypot(dx,dz);if(d>.00001)ball.rotateOnWorldAxis(new THREE.Vector3(dz,0,-dx).normalize(),d/BALL_RADIUS);}
