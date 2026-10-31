import {heightAt} from './courses.js';
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
export class ViewState {
 constructor(){this.reset();}
 reset(){this.zoom=1;this.yaw=0;this.pitch=55;this.panX=0;this.panY=0;this.focus='course';}
 scale(factor,min=.65,max=4){if(Number.isFinite(factor)&&factor>0)this.zoom=clamp(this.zoom*factor,min,max);}
 rotate(radians){if(Number.isFinite(radians))this.yaw=((this.yaw+radians+Math.PI*3)%(Math.PI*2))-Math.PI;}
 tilt(degrees){if(Number.isFinite(degrees))this.pitch=clamp(this.pitch+degrees,30,82);}
 pan(x,y,width,height){this.panX=clamp(this.panX+x,-width*this.zoom,width*this.zoom);this.panY=clamp(this.panY+y,-height*this.zoom,height*this.zoom);}
}
export function overviewPose(center,distance,view){const d=distance/(view?.zoom||1),a=(view?.yaw||0)+.48,p=(view?.pitch??55)*Math.PI/180;return {position:{x:center.x+Math.sin(a)*d*Math.cos(p),y:center.y+Math.sin(p)*d,z:center.z-Math.cos(a)*d*Math.cos(p)},look:{...center}};}
// 人物视角（0.22）：以球为中心的环绕镜头。orbit 左右环绕（弧度），tilt 俯仰（度，正值抬高），zoom 远近倍率（1 = 默认 6.8 米）。
// 拉远时镜头同时抬高、注视点前移，能看到更远的落点；环绕到球前方时注视点回到球，避免对着脚下。
export const FOLLOW=Object.freeze({back:6.8,elevation:18.7,look:6,side:.3});
export function followPose(h,p,heading,{orbit=0,zoom=1,tilt=0,yaw=0,pitch=0}={},height=heightAt){
 const angle=heading+orbit+yaw,ground=height(h,p.x,p.z),back=FOLLOW.back*zoom,elev=(FOLLOW.elevation+tilt)*Math.PI/180,horizontal=back*Math.cos(elev),rise=back*Math.sin(elev);
 const cx=p.x+FOLLOW.side*Math.cos(angle)-horizontal*Math.sin(angle),cz=p.z-FOLLOW.side*Math.sin(angle)-horizontal*Math.cos(angle),ahead=(FOLLOW.look+(zoom-1)*5)*Math.max(0,Math.cos(orbit));
 return {position:{x:cx,y:Math.max(ground+rise+.1+pitch*6,height(h,cx,cz)+1.1),z:cz},look:{x:p.x+Math.sin(heading)*ahead,y:ground+.4+pitch*2,z:p.z+Math.cos(heading)*ahead}};
}
