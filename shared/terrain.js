import {clamp,surfaceAt,heightAt} from './courses.js';
import {BALL_RADIUS} from './ball.js';

// 出球与落地使用同一组地形参数；这些是游戏参数，提示中的比例以同杆同力度球道击球为基准。
export const SURFACES=Object.freeze({
 tee:{name:'发球台',friction:1.8,bounce:.22,retention:.66,roll:'正常滚动'},
 fairway:{name:'球道',friction:1.8,bounce:.22,retention:.66,roll:'正常滚动'},
 green:{name:'果岭',friction:.53,bounce:.22,retention:.66,roll:'滚动较远'},
 rough:{name:'长草区',friction:5.6,bounce:.07,retention:.42,roll:'草叶阻挡 · 滚动较短'},
 sand:{name:'沙坑',friction:10.8,bounce:.015,retention:.16,roll:'沙地吸收冲击 · 很快停住'}
});
const LAUNCH={rough:{driver:.68,iron:.78,wedge:.84,sand:.83,chip:.8,putter:.58},sand:{driver:.4,iron:.59,wedge:.72,sand:.84,chip:.63,putter:.28}};
export function sandDepth(surface,ball){return surface==='sand'?clamp(Number.isFinite(ball?.sandDepth)?ball.sandDepth:.025,0,.065):0;}
export function landingDepth(speed){return clamp(.018+Math.max(0,speed)*.0025,.018,.065);}
export function launchConditions(surface,club,ball){
 const depth=sandDepth(surface,ball),buried=depth/.065;
 const multiplier=(LAUNCH[surface]?.[club.id]??1)*(surface==='sand'?1-buried*(club.id==='sand'?.18:.3):1);
 return {surface,multiplier,depth,loft:club.loft};
}
export function ballRestHeight(h,ball){const s=surfaceAt(h,ball.x,ball.z);return heightAt(h,ball.x,ball.z)+BALL_RADIUS-sandDepth(s,ball);}
export function lieCamera(h,ball,from){
 const dx=ball.x-from.x,dz=ball.z-from.z,length=Math.hypot(dx,dz)||1,x=ball.x+dx/length*2.7+dz/length*1.3,z=ball.z+dz/length*2.7-dx/length*1.3;
 return {x:-x,y:Math.max(heightAt(h,ball.x,ball.z)+1.5,heightAt(h,x,z)+1.2),z};
}
export function terrainAdvice(h,ball,club){
 const surface=surfaceAt(h,ball.x,ball.z),profile=SURFACES[surface]||SURFACES.fairway,launch=launchConditions(surface,club,ball);
 const tip=surface==='sand'?(club.id==='sand'?'沙坑杆较易起球，先试挥确认距离。':club.id==='putter'?'推杆很难穿过松沙，建议换沙坑杆。':'换沙坑杆可减少沙地造成的速度损失。'):surface==='rough'?'草叶会减少出球与滚动，留足飞行距离。':surface==='green'?'果岭阻力小，推杆时轻一点。':'球位平稳，按目标距离选择球杆。';
 return {surface,name:profile.name,condition:surface==='sand'?(launch.depth>=.05?'陷沙较深':'轻微陷沙'):surface==='rough'?'草叶包围球位':'球位平稳',speedPercent:Math.round(launch.multiplier*100),depth:launch.depth,roll:profile.roll,resistance:Math.round(profile.friction/SURFACES.fairway.friction*10)/10,tip};
}
