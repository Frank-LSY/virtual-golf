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
