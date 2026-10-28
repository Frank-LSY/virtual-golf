import {ViewState} from '../shared/view.js';
export function bindViewGestures(element,{drag,zoom,rotate}){
 const points=new Map();let previous=null;
 const gesture=()=>{const p=[...points.values()];return p.length>=2?{x:(p[0].x+p[1].x)/2,y:(p[0].y+p[1].y)/2,d:Math.hypot(p[1].x-p[0].x,p[1].y-p[0].y),a:Math.atan2(p[1].y-p[0].y,p[1].x-p[0].x)}:p[0];};
 element.style.touchAction='none';element.addEventListener('pointerdown',e=>{if(e.button!==0)return;points.set(e.pointerId,{x:e.clientX,y:e.clientY});previous=gesture();element.setPointerCapture(e.pointerId);});
 element.addEventListener('pointermove',e=>{if(!points.has(e.pointerId))return;points.set(e.pointerId,{x:e.clientX,y:e.clientY});const next=gesture();if(previous){if(next.d&&previous.d){zoom(next.d/Math.max(1,previous.d));let a=next.a-previous.a;if(a>Math.PI)a-=Math.PI*2;if(a<-Math.PI)a+=Math.PI*2;rotate(a);}else if(points.size===1)drag(next.x-previous.x,next.y-previous.y);}previous=next;});
 const end=e=>{points.delete(e.pointerId);previous=gesture();};for(const event of ['pointerup','pointercancel','lostpointercapture'])element.addEventListener(event,end);
 element.addEventListener('wheel',e=>{if(zoom(Math.exp(-Math.max(-120,Math.min(120,e.deltaY))*.003))!==false)e.preventDefault();},{passive:false});
}
export class MapView {
 constructor(canvas,redraw,name='路线图'){
  this.canvas=canvas;this.redraw=redraw;this.state=new ViewState();this.name=name;
  this.toolbar=document.createElement('div');this.toolbar.className='map-controls';canvas.insertAdjacentElement('afterend',this.toolbar);
  for(const [action,label,text] of [['out','缩小','−'],['in','放大','＋'],['left','左转','↶'],['right','右转','↷'],['reset','复位','复位']]){const b=document.createElement('button');b.textContent=text;b.type='button';b.setAttribute('aria-label',name+label);b.title=name+label;b.onclick=()=>this.action(action);this.toolbar.append(b);}
  this.readout=document.createElement('small');this.readout.className='map-readout';canvas.insertAdjacentElement('beforebegin',this.readout);canvas.tabIndex=0;canvas.title='滚轮或双指缩放；拖动平移；双指或箭头按钮旋转';
  bindViewGestures(canvas,{drag:(x,y)=>{const r=canvas.getBoundingClientRect();this.state.pan(x*canvas.width/r.width,y*canvas.height/r.height,canvas.width,canvas.height);this.change();},zoom:f=>{this.state.scale(f,1,5);this.change();},rotate:a=>{this.state.rotate(a);this.change();}});
  canvas.addEventListener('keydown',e=>{const key={'+':'in','=':'in','-':'out',ArrowLeft:'left',ArrowRight:'right','0':'reset'}[e.key];if(key){e.preventDefault();this.action(key);}});this.updateLabel();
 }
 action(action){if(action==='reset')this.state.reset();else if(action==='in'||action==='out')this.state.scale(action==='in'?1.25:.8,1,5);else this.state.rotate((action==='left'?-1:1)*Math.PI/12);this.change();}
 updateLabel(){this.readout.textContent=`${Math.round(this.state.zoom*100)}% · ${Math.round(this.state.yaw*180/Math.PI)}°`;}
 change(){this.updateLabel();this.redraw();}
 reset(){this.state.reset();this.updateLabel();}
 begin(ctx){const c=this.canvas,s=this.state;ctx.save();ctx.translate(c.width/2+s.panX,c.height/2+s.panY);ctx.rotate(s.yaw);ctx.scale(s.zoom,s.zoom);ctx.translate(-c.width/2,-c.height/2);}
 end(ctx){ctx.restore();}
}
