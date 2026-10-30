// 0.21.1 高尔夫的卡通画面：与云端滚球、整套界面同一种风格。
// 1) 光照分阶：改写 Three.js 标准材质的直射光计算，把明暗压成三阶（亮 / 中 / 暗），所有高尔夫材质原有的
//    纹理、顶点色和自定义着色都保留；同时提高漫反射颜色的饱和度。只影响 MeshStandardMaterial，
//    云端滚球用的是卡通材质，不受影响。
// 2) 描边：给球手、树、岩石、旗杆、球、看台等物体加一层屏幕空间等宽的深色外壳描边，远处自动变细。
// 3) 卡通天空与云朵：程序生成的渐变天空和带描边的云。
import * as THREE from 'three';

export const TOON=Object.freeze({ink:'#22264a',outlinePx:3,saturation:1.16,ramp:[.32,.74,1]});

// ---------- 1. 光照分阶与饱和度 ----------
let installed=false;
export function installToonLighting(chunks=THREE.ShaderChunk){
 if(installed||chunks.lights_physical_pars_fragment.includes('toonRamp'))return false;installed=true;
 const [dark,mid,light]=TOON.ramp;
 const ramp=`float toonRamp(const in float x){return ${dark.toFixed(2)}+${(mid-dark).toFixed(2)}*smoothstep(.06,.12,x)+${(light-mid).toFixed(2)}*smoothstep(.40,.46,x);}\n`;
 chunks.lights_physical_pars_fragment=chunks.lights_physical_pars_fragment.replace('void RE_Direct_Physical(',ramp+'void RE_Direct_Physical(').replace('vec3 irradiance = dotNL * directLight.color;','vec3 irradiance = toonRamp( dotNL ) * directLight.color;');
 chunks.color_fragment=chunks.color_fragment+`\n#if defined( STANDARD )\n\tdiffuseColor.rgb = max( mix( vec3( dot( diffuseColor.rgb, vec3( .2126, .7152, .0722 ) ) ), diffuseColor.rgb, ${TOON.saturation.toFixed(2)} ), 0.0 );\n#endif\n`;
 return true;
}
installToonLighting();
export function configureToonRenderer(renderer){renderer.toneMapping=THREE.NeutralToneMapping;renderer.toneMappingExposure=.9;}

// ---------- 2. 描边 ----------
export const outlineUniforms={outlineResolution:{value:new THREE.Vector2(1280,720)}};
const FLAT=new Set(['PlaneGeometry','CircleGeometry','RingGeometry','ShapeGeometry']);
export function outlineCandidate(o){
 if(!o.isMesh||o.isSkinnedMesh||o.userData.outline||o.userData.noOutline)return false;
 for(let p=o.parent;p;p=p.parent)if(p.userData?.noOutline)return false;
 const m=o.material,g=o.geometry;if(!m||Array.isArray(m)||!g?.attributes?.normal||!g.attributes.position)return false;
 if(m.transparent||m.alphaTest>0||m.side===THREE.DoubleSide||m.isShaderMaterial||m.isRawShaderMaterial||m.isMeshBasicMaterial||m.isLineBasicMaterial||m.isPointsMaterial)return false;
 if(FLAT.has(g.type))return false;
 return true;
}
export function outlineMaterial(source,{px=TOON.outlinePx,color=TOON.ink}={}){
 const fade=!!source.geometry.attributes.instanceFade,material=new THREE.MeshBasicMaterial({color,side:THREE.BackSide,fog:true});
 material.onBeforeCompile=shader=>{
  shader.uniforms.outlineResolution=outlineUniforms.outlineResolution;shader.uniforms.outlinePx={value:px};
  shader.vertexShader='uniform vec2 outlineResolution;\nuniform float outlinePx;\n'+(fade?'attribute float instanceFade;\nvarying float vOutlineFade;\n':'')+shader.vertexShader.replace('#include <project_vertex>',`#include <project_vertex>
   vec3 outlineN=normal;
   #ifdef USE_INSTANCING
    outlineN=mat3(instanceMatrix)*outlineN;
   #endif
   vec4 outlineDir=projectionMatrix*vec4(normalMatrix*outlineN,0.0);
   float outlineScale=clamp(42.0/max(gl_Position.w,.001),.28,1.0);
   gl_Position.xy+=normalize(outlineDir.xy+vec2(1e-5))*outlinePx*outlineScale*2.0*gl_Position.w/outlineResolution;
   ${fade?'vOutlineFade=instanceFade;':''}`);
  if(fade)shader.fragmentShader='varying float vOutlineFade;\n'+shader.fragmentShader.replace('#include <clipping_planes_fragment>','#include <clipping_planes_fragment>\nif(vOutlineFade<.98)discard;');
 };
 material.customProgramCacheKey=()=>'toon-outline'+(fade?'-fade':'');return material;
}
const processed=new WeakSet();
export function addOutlines(root,options={}){
 const found=[];root.traverse(o=>{if(processed.has(o))return;processed.add(o);if(outlineCandidate(o))found.push(o);});
 for(const o of found){
  const material=outlineMaterial(o,options);let out;
  if(o.isInstancedMesh){out=new THREE.InstancedMesh(o.geometry,material,o.instanceMatrix.count);out.instanceMatrix=o.instanceMatrix;out.count=o.count;out.frustumCulled=false;out.onBeforeRender=()=>{out.count=o.count;};}
  else{out=new THREE.Mesh(o.geometry,material);out.frustumCulled=o.frustumCulled;}
  out.userData.outline=true;out.castShadow=false;out.receiveShadow=false;out.renderOrder=o.renderOrder;out.raycast=()=>{};processed.add(out);o.add(out);
 }
 return found.length;
}
// 每次渲染前：更新描边的屏幕尺寸；每隔一段时间扫描新加入的物体（球车、特效、换洞后的树等）。
export function hookToonRenderer(renderer,scene,{every=350,now=()=>performance.now()}={}){
 const raw=renderer.render.bind(renderer);let last=-Infinity;
 renderer.render=(s,camera)=>{const c=renderer.domElement,t=now();outlineUniforms.outlineResolution.value.set(Math.max(1,c.clientWidth),Math.max(1,c.clientHeight));if(t-last>=every){last=t;addOutlines(s||scene);}raw(s,camera);};
 return renderer;
}

// ---------- 3. 卡通天空与云 ----------
export function cartoonSkyTexture(top='#3d9bff',mid='#8fd0ff',bottom='#eaf8ff'){
 const c=document.createElement('canvas');c.width=4;c.height=512;const x=c.getContext('2d'),g=x.createLinearGradient(0,0,0,512);g.addColorStop(0,top);g.addColorStop(.42,mid);g.addColorStop(.5,bottom);g.addColorStop(1,bottom);x.fillStyle=g;x.fillRect(0,0,4,512);
 const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;t.userData.ready=true;return t;
}
export function cartoonCloudTexture(seed=3){
 const c=document.createElement('canvas');c.width=512;c.height=320;const x=c.getContext('2d');let s=seed*9301+49297;const r=()=>(s=(s*9301+49297)%233280)/233280;
 const puffs=[[120,200,70],[205,150,92],[300,140,84],[380,190,72],[250,215,80],[165,225,58],[340,228,56]].map(([px,py,pr])=>[px+(r()-.5)*16,py+(r()-.5)*12,pr*(.9+r()*.2)]);
 x.lineJoin='round';x.fillStyle='#22264a';for(const [px,py,pr] of puffs){x.beginPath();x.arc(px,py,pr+7,0,Math.PI*2);x.fill();}
 x.fillStyle='#ffffff';for(const [px,py,pr] of puffs){x.beginPath();x.arc(px,py,pr,0,Math.PI*2);x.fill();}
 x.save();x.beginPath();for(const [px,py,pr] of puffs){x.moveTo(px+pr,py);x.arc(px,py,pr,0,Math.PI*2);}x.clip();x.fillStyle='#d9ecff';for(const [px,py,pr] of puffs){x.beginPath();x.arc(px+pr*.12,py+pr*.55,pr*.82,0,Math.PI*2);x.fill();}x.restore();
 x.fillStyle='#ffffff';for(const [px,py,pr] of puffs){x.beginPath();x.arc(px-pr*.08,py-pr*.12,pr*.78,0,Math.PI*2);x.fill();}
 const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;t.userData.ready=true;return t;
}
// 球场配色：浅淡的原色提高饱和度、略微提亮，让草地更像卡通插画。
export function cartoonColor(hex,{saturation=1.18,lightness=1.02}={}){const c=new THREE.Color(hex),h={};c.getHSL(h);return new THREE.Color().setHSL(h.h,Math.min(1,h.s*saturation),Math.min(.92,h.l*lightness));}
