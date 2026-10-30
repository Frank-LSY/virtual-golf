import {PHYSICS,clamp} from '../shared/maze/physics.js';
import {TAU,polar} from '../shared/maze/levels.js';
const ink='#164a43',brass='#c79247';
export class MazeRenderer {
 constructor(canvas){this.canvas=canvas;this.ctx=canvas.getContext('2d');this.pulse=0;}
 draw(game,input={x:0,y:0},time=0){
  const canvas=this.canvas,ctx=this.ctx,rect=canvas.getBoundingClientRect(),dpr=Math.min(2,window.devicePixelRatio||1),size=Math.max(1,Math.round(rect.width*dpr));
  if(canvas.width!==size||canvas.height!==size){canvas.width=size;canvas.height=size;}
  const scale=size/640;ctx.setTransform(scale,0,0,scale,320*scale,320*scale);ctx.clearRect(-320,-320,640,640);
  // The physical board stays fixed; controls only change acceleration.
  ctx.save();ctx.shadowColor='#163d3433';ctx.shadowBlur=18;ctx.shadowOffsetY=9;circle(ctx,0,0,303);ctx.fillStyle=ink;ctx.fill();ctx.restore();
  const rim=ctx.createRadialGradient(-100,-140,80,0,0,302);rim.addColorStop(0,'#e3bd78');rim.addColorStop(.9,'#ac7e3f');rim.addColorStop(1,'#75582f');circle(ctx,0,0,300);ctx.fillStyle=rim;ctx.fill();
  circle(ctx,0,0,289);ctx.fillStyle='#f2ead6';ctx.fill();
  ctx.save();circle(ctx,0,0,283);ctx.clip();
  const ground=ctx.createLinearGradient(-250,-250,250,250);ground.addColorStop(0,'#faf5e7');ground.addColorStop(1,'#e5dcc1');ctx.fillStyle=ground;ctx.fillRect(-300,-300,600,600);
  // Subtle, deterministic grain, kept underneath all playable elements.
  ctx.strokeStyle='#a58f5d10';ctx.lineWidth=.7;for(let i=-320;i<330;i+=7){ctx.beginPath();ctx.moveTo(-320,i);ctx.bezierCurveTo(-100,i-7,100,i+8,320,i);ctx.stroke();}
  const bands=[286,...game.level.rings.map(r=>r.radius),0];
  for(let i=0;i<bands.length-1;i++){ctx.beginPath();ctx.arc(0,0,(bands[i]+bands[i+1])/2,0,TAU);ctx.strokeStyle=i%2?'#fffdf418':'#2a706108';ctx.lineWidth=bands[i]-bands[i+1]-10;ctx.stroke();}
  for(const label of game.level.labels){ctx.fillStyle='#668177';ctx.font='500 9px "PingFang SC",sans-serif';ctx.textAlign='center';ctx.fillText(label.text,label.x,label.y);}
  // Visible starting mark and a discreet eight-trigram border.
  const start=game.level.spawn;circle(ctx,start.x,start.y,15);ctx.strokeStyle='#71977c88';ctx.lineWidth=1;ctx.setLineDash([2,3]);ctx.stroke();ctx.setLineDash([]);ctx.fillStyle='#507564';ctx.font='8px sans-serif';ctx.textAlign='center';ctx.fillText('起',start.x,start.y+3);
  for(const h of game.level.holes){
    ctx.save();ctx.translate(h.x,h.y);circle(ctx,0,0,h.radius+3);ctx.fillStyle='#bf8546';ctx.fill();
    const pit=ctx.createRadialGradient(-3,-3,1,0,0,h.radius);pit.addColorStop(0,'#090f0e');pit.addColorStop(.65,'#172c28');pit.addColorStop(1,'#4c5c48');circle(ctx,0,0,h.radius);ctx.fillStyle=pit;ctx.fill();
    ctx.beginPath();ctx.arc(0,0,h.radius+5,-2.8,-1.1);ctx.strokeStyle='#c5784488';ctx.lineWidth=1.5;ctx.stroke();ctx.restore();
  }
  for(const wall of game.walls){
    ctx.save();ctx.shadowColor='#48604944';ctx.shadowBlur=3;ctx.shadowOffsetY=3;ctx.lineWidth=wall.width+2;ctx.strokeStyle='#a48a55';ctx.lineCap='round';wallPath(ctx,wall);ctx.stroke();ctx.restore();
    ctx.lineWidth=wall.width-1;ctx.strokeStyle='#255e50';ctx.lineCap='round';wallPath(ctx,wall);ctx.stroke();ctx.lineWidth=1.2;ctx.strokeStyle='#84a58a';wallPath(ctx,wall);ctx.stroke();
  }
  ctx.lineCap='butt';circle(ctx,0,0,PHYSICS.boundary);ctx.strokeStyle='#315f50';ctx.lineWidth=PHYSICS.outerWidth;ctx.stroke();
  const goal=game.level.goalRadius;
  circle(ctx,0,0,goal+6);ctx.fillStyle='#c5984c33';ctx.fill();circle(ctx,0,0,goal+1);ctx.strokeStyle=brass;ctx.lineWidth=2;ctx.stroke();
  // Yin-yang target is clearly different from a dark trap hole.
  ctx.save();circle(ctx,0,0,goal-2);ctx.clip();ctx.fillStyle='#fbf7e9';ctx.fillRect(-goal,-goal,goal*2,goal*2);ctx.fillStyle='#285b4e';ctx.beginPath();ctx.arc(0,0,goal-2,-Math.PI/2,Math.PI/2);ctx.arc(0,(goal-2)/2,(goal-2)/2,Math.PI/2,Math.PI*1.5,true);ctx.arc(0,-(goal-2)/2,(goal-2)/2,Math.PI/2,Math.PI*1.5);ctx.fill();circle(ctx,0,-goal/2,2.5);ctx.fillStyle='#285b4e';ctx.fill();circle(ctx,0,goal/2,2.5);ctx.fillStyle='#fbf7e9';ctx.fill();ctx.restore();
  if(game.goalTime>0){ctx.beginPath();ctx.arc(0,0,goal+6,-Math.PI/2,-Math.PI/2+TAU*game.goalTime/PHYSICS.goalHold);ctx.strokeStyle='#2f9272';ctx.lineWidth=3;ctx.stroke();}
  if(game.phase==='ready'){ctx.fillStyle='#779582';ctx.font='10px sans-serif';ctx.textAlign='center';ctx.fillText('中心 · 慢下来',0,goal+21);}
  const b=game.ball;let bx=b.x,by=b.y,r=PHYSICS.radius,alpha=1;
  if(game.phase==='falling'||['paused','countdown'].includes(game.phase)&&game.resumePhase==='falling'){const progress=clamp(game.fallTime/PHYSICS.fallSeconds,0,1),ease=progress*progress;bx+=(game.fallHole.x-bx)*ease;by+=(game.fallHole.y-by)*ease;r*=1-.92*ease;alpha=1-progress*.85;}
  ctx.save();ctx.globalAlpha=alpha;ctx.shadowColor='#253c3a66';ctx.shadowBlur=5;ctx.shadowOffsetX=1;ctx.shadowOffsetY=4;circle(ctx,bx,by,r);ctx.fillStyle='#324b50';ctx.fill();ctx.shadowBlur=0;ctx.shadowOffsetY=0;
  const ball=ctx.createRadialGradient(bx-r*.35,by-r*.42,r*.08,bx,by,r);ball.addColorStop(0,'#ffffff');ball.addColorStop(.25,'#d7e3e5');ball.addColorStop(.6,'#8fadb1');ball.addColorStop(.83,'#47696c');ball.addColorStop(1,'#244447');circle(ctx,bx,by,r);ctx.fillStyle=ball;ctx.fill();
  ctx.save();circle(ctx,bx,by,r-.5);ctx.clip();ctx.translate(bx,by);ctx.rotate(b.rollX*.35+b.rollY*.45);ctx.beginPath();ctx.ellipse(0,0,Math.max(1,r*Math.abs(Math.cos(b.rollX*.7))),r,0,0,TAU);ctx.strokeStyle='#f5ffff44';ctx.lineWidth=.7;ctx.stroke();ctx.restore();ctx.restore();
  // Locator halo makes the ball easy to find, especially on a phone-sized preview.
  if(game.phase==='playing'||game.phase==='ready'){circle(ctx,b.x,b.y,PHYSICS.radius+5+Math.sin(time*2)*.5);ctx.strokeStyle='#34867655';ctx.lineWidth=1;ctx.stroke();}
  ctx.restore();
  for(let i=0;i<8;i++){
    const p=polar(294,i*45-90);ctx.save();ctx.translate(p.x,p.y);ctx.rotate(i*Math.PI/4);ctx.strokeStyle='#f4dfaa';ctx.lineWidth=1.7;
    for(let row=0;row<3;row++){const y=(row-1)*3;if((i>>row)&1){ctx.beginPath();ctx.moveTo(-6,y);ctx.lineTo(6,y);ctx.stroke();}else{ctx.beginPath();ctx.moveTo(-6,y);ctx.lineTo(-1.5,y);ctx.moveTo(1.5,y);ctx.lineTo(6,y);ctx.stroke();}}
    ctx.restore();
  }
 }
}
function circle(ctx,x,y,r){ctx.beginPath();ctx.arc(x,y,Math.max(.01,r),0,TAU);}
function wallPath(ctx,w){ctx.beginPath();if(w.kind==='arc')ctx.arc(0,0,w.radius,w.start,w.end);else{ctx.moveTo(w.a.x,w.a.y);ctx.lineTo(w.b.x,w.b.y);}}
