// 体感钓鱼 · 水下剖面（0.29）。中鱼后，这位钓手的分屏切到水下：像“黄金矿工”那样，线从水面垂下去，
// 鱼（或杂物、宝箱）挂在线头，收线时往上走，越重走得越慢；两边是这片水域的障碍（水草 / 石头 / 沉木），
// 鱼往哪边钻、离障碍多近一眼就能看出来。画面正中给出现在该做什么：转轮收线 / 停手溜鱼 / 往反方向倾。
import {CATCHES,FISHING,clamp,lerp} from '../shared/fishing/rules.js';
const INK='#22264a',FONT='"PingFang SC","Microsoft YaHei",system-ui,sans-serif';

export class UnderwaterView {
 constructor(){this.views=new Map();}
 has(id){return this.views.has(id);}
 forget(id){this.views.delete(id);}
 // 现在该做什么（和手机转轮中间的字一致）。
 static advice(f,{keyboard=false,touch=false}={}){
  if(!f)return {say:'',sub:'',mood:'go'};
  const rush=f.behavior==='dash',warn=f.behavior==='telegraph',reel=keyboard?'按住 W 收线':'手机上转轮收线';
  if(rush)return {say:'停！让它跑',sub:f.crank>.4?'松开收线，线要断了！':'冲完再收',mood:'stop'};
  if(warn)return {say:'要冲了…',sub:'准备停手',mood:'warn'};
  if(f.slack>1.2)return {say:'接着收！',sub:'停太久线会松',mood:'go'};
  if(f.behavior==='tired')return {say:'累了，快收！',sub:reel,mood:'go'};
  if(f.kind==='treasure')return {say:'宝箱！慢慢收',sub:'很沉，但不挣扎',mood:'go'};
  if(f.kind==='junk')return {say:'是杂物…',sub:keyboard?'不值钱，Backspace 剪线':'不值钱，可以剪线',mood:'warn'};
  return {say:'收线！',sub:reel,mood:'go'};
 }
 draw(canvas,a,time,opts={}){
  const W=canvas.clientWidth,H=canvas.clientHeight;if(!W||!H)return;
  const dpr=Math.min(2,window.devicePixelRatio||1);if(canvas.width!==Math.round(W*dpr)||canvas.height!==Math.round(H*dpr)){canvas.width=Math.round(W*dpr);canvas.height=Math.round(H*dpr);}
  const g=canvas.getContext('2d');g.setTransform(dpr,0,0,dpr,0,0);
  const f=a.fight;let v=this.views.get(a.id);
  if(f&&(!v||v.key!==`${f.type}:${f.kg}`)){v={key:`${f.type}:${f.kg}`,D0:Math.max(9,f.D)*1.18,D:f.D,lat:f.lat,T:f.T,E:f.E,f,bubbles:[],t:time,landedAt:null};this.views.set(a.id,v);}
  if(!v)return;
  const dt=clamp(time-v.t,0,.1);v.t=time;
  if(f){v.f=f;const k=1-Math.exp(-dt/.12);v.D+=(f.D-v.D)*k;v.lat+=(f.lat-v.lat)*k;v.T+=(f.T-v.T)*k;v.E+=((f.E??1)-v.E)*k;}
  const landed=a.phase==='landed'&&!f;if(landed&&v.landedAt===null)v.landedAt=time;
  const F=v.f,c=CATCHES[F.type]||{},sc=Math.min(W,H)/420;
  const top=H*.17,bed=H*.9,cx=W/2,half=W*.36,wallX=F.width/(F.width+.7)*half;
  // 水、光、水面
  const bg=g.createLinearGradient(0,0,0,H);bg.addColorStop(0,'#8fd3ff');bg.addColorStop(.18,'#5fb4e8');bg.addColorStop(1,'#1d5d8e');g.fillStyle=bg;g.fillRect(0,0,W,H);
  g.save();g.globalAlpha=.12;g.fillStyle='#ffffff';for(let i=0;i<5;i++){const x=W*(.12+i*.2)+Math.sin(time*.4+i)*20;g.beginPath();g.moveTo(x-18,top);g.lineTo(x+18,top);g.lineTo(x+70,bed);g.lineTo(x-10,bed);g.closePath();g.fill();}g.restore();
  g.fillStyle='#bfe8ff';g.beginPath();g.moveTo(0,0);g.lineTo(W,0);g.lineTo(W,top);for(let x=W;x>=0;x-=12)g.lineTo(x,top+Math.sin(x*.05+time*2.4)*3);g.closePath();g.fill();
  g.strokeStyle='#ffffff';g.lineWidth=2.5;g.beginPath();for(let x=0;x<=W;x+=12)g.lineTo(x,top+Math.sin(x*.05+time*2.4)*3);g.stroke();
  // 湖底与两边的障碍
  g.fillStyle='#d9c89a';g.beginPath();g.moveTo(0,H);g.lineTo(0,bed);for(let x=0;x<=W;x+=24)g.lineTo(x,bed+Math.sin(x*.03)*6);g.lineTo(W,H);g.closePath();g.fill();
  for(const side of [-1,1])this.wall(g,cx+side*wallX,side,top,bed,F.snagName,time,sc,Math.sign(v.lat)===side?clamp((Math.abs(v.lat)/F.width-.55)/.45,0,1):0);
  // 东西的位置：越远越深；左右按偏移
  const depth=clamp(v.D/v.D0,0,1.08),fx=cx+clamp(v.lat/(F.width+.7),-1.1,1.1)*half,fy=top+28*sc+depth*(bed-top-60*sc);
  const rush=F.behavior==='dash',warn=F.behavior==='telegraph',fish=F.kind==='fish';
  // 气泡
  if(Math.random()<dt*(rush?14:5))v.bubbles.push({x:fx+(Math.random()-.5)*20*sc,y:fy,r:(2+Math.random()*4)*sc,vy:(30+Math.random()*30)*sc});
  g.strokeStyle='rgba(255,255,255,.8)';g.lineWidth=1.5;for(let i=v.bubbles.length-1;i>=0;i--){const b=v.bubbles[i];b.y-=b.vy*dt;b.x+=Math.sin(time*3+i)*.4;if(b.y<top){v.bubbles.splice(i,1);continue;}g.beginPath();g.arc(b.x,b.y,b.r,0,Math.PI*2);g.stroke();}
  // 线：竿尖 → 鱼嘴；张力越大越直、越红
  const tipX=cx,tipY=top-14*sc,T=clamp(v.T,0,1),sag=(1-T)*40*sc,mouthY=fy-this.size(F,c,sc).h*.55;
  g.strokeStyle=T>=.85?'#ff3b3b':T>=.6?'#ffb43b':'#ffffff';g.lineWidth=(T>=.85?3.2:2.2)*Math.max(.8,sc);g.beginPath();g.moveTo(tipX,tipY);g.quadraticCurveTo((tipX+fx)/2+sag,(tipY+mouthY)/2+sag*.4,fx,mouthY);g.stroke();
  g.fillStyle='#ff4d4d';g.strokeStyle=INK;g.lineWidth=2;g.beginPath();g.arc(tipX,tipY,6*sc,0,Math.PI*2);g.fill();g.stroke();
  // 挂在线头的东西
  const lift=landed?clamp((time-v.landedAt)/.6,0,1):0;
  g.save();g.translate(fx,fy-lift*(fy-top+40*sc));
  const wob=fish?Math.sin(time*(rush?22:warn?30:8))*(rush?.35:warn?.18:.12):Math.sin(time*2)*.08;
  g.rotate(wob+clamp((F.lat-v.lat)*2,-.4,.4));
  if(rush){g.strokeStyle='rgba(255,255,255,.75)';g.lineWidth=2.5;for(let i=-1;i<=1;i++){g.beginPath();g.moveTo(i*12*sc,-34*sc);g.lineTo(i*12*sc,-70*sc);g.stroke();}}
  this.thing(g,F,c,sc,time);
  g.restore();
  // 往反方向倾的大箭头
  const side=Math.abs(v.lat)>F.width*.45?Math.sign(v.lat):0;
  if(side&&fish&&!landed){const ax=fx-side*70*sc,ay=fy;g.save();g.translate(ax,ay);g.scale(-side,1);g.fillStyle='#ffd23f';g.strokeStyle=INK;g.lineWidth=3;g.beginPath();g.moveTo(-34*sc,-14*sc);g.lineTo(6*sc,-14*sc);g.lineTo(6*sc,-28*sc);g.lineTo(36*sc,0);g.lineTo(6*sc,28*sc);g.lineTo(6*sc,14*sc);g.lineTo(-34*sc,14*sc);g.closePath();g.fill();g.stroke();g.restore();
   this.text(g,`往${side>0?'左':'右'}倾！`,ax,ay+46*sc,16*sc,'#ffd23f');}
  // 张力条（右边）
  const bx=W-30*sc,by=top+20*sc,bh=bed-top-80*sc;g.fillStyle='#ffffff';g.strokeStyle=INK;g.lineWidth=2.5;this.round(g,bx-9*sc,by,18*sc,bh,9*sc);g.fill();g.stroke();
  const fill=bh*T;g.fillStyle=T>=.85?'#ff3b3b':T>=.6?'#ffb43b':'#3ddc97';this.round(g,bx-6*sc,by+bh-fill,12*sc,fill,6*sc);g.fill();
  g.strokeStyle='rgba(34,38,74,.5)';g.beginPath();g.moveTo(bx-9*sc,by+bh*.15);g.lineTo(bx+9*sc,by+bh*.15);g.stroke();this.text(g,'张力',bx,by+bh+18*sc,12*sc,'#ffffff');
  // 名字、重量、分数、距离、体力（右上）
  const info=`${c.name||''} · ${F.kg} kg`,pts=`${F.points} 分 · 离岸 ${Math.max(0,Math.round(v.D))} 米`;
  g.textAlign='right';g.textBaseline='top';g.font=`900 ${Math.round(17*sc)}px ${FONT}`;g.lineWidth=4;g.strokeStyle=INK;g.strokeText(info,W-14*sc,12*sc);g.fillStyle='#ffffff';g.fillText(info,W-14*sc,12*sc);
  g.font=`800 ${Math.round(13*sc)}px ${FONT}`;g.strokeText(pts,W-14*sc,34*sc);g.fillText(pts,W-14*sc,34*sc);
  if(fish){const sw=110*sc,sx=W-14*sc-sw,sy=54*sc;g.fillStyle='#ffffff';g.strokeStyle=INK;g.lineWidth=2;this.round(g,sx,sy,sw,9*sc,4.5*sc);g.fill();g.stroke();g.fillStyle='#ff9440';this.round(g,sx+1,sy+1,(sw-2)*clamp(v.E,0,1),9*sc-2,4*sc);g.fill();}
  // 现在该做什么（正中上方）
  const by2=fy<top+150*sc?bed-50*sc:top+46*sc;
  if(landed){this.banner(g,cx,top+46*sc,`上岸！+${F.points}`,`${c.name} ${F.kg} kg`,'catch',sc);}
  else{const ad=UnderwaterView.advice(F,opts);this.banner(g,cx,by2,ad.say,ad.sub,ad.mood,sc);}
 }
 size(F,c,sc){if(F.kind==='junk')return F.type==='boot'?{w:46*sc,h:40*sc}:{w:26*sc,h:34*sc};if(F.kind==='treasure')return {w:62*sc,h:44*sc};const L=clamp(22+F.kg*9,22,90)*sc;return {w:L*.42,h:L};}
 thing(g,F,c,sc,time){
  g.strokeStyle=INK;g.lineWidth=3;
  if(F.type==='boot'){g.fillStyle=c.color;g.beginPath();g.moveTo(-14*sc,-20*sc);g.lineTo(6*sc,-20*sc);g.lineTo(6*sc,4*sc);g.lineTo(24*sc,8*sc);g.lineTo(24*sc,20*sc);g.lineTo(-14*sc,20*sc);g.closePath();g.fill();g.stroke();return;}
  if(F.type==='can'){g.fillStyle=c.color;this.round(g,-12*sc,-16*sc,24*sc,32*sc,4*sc);g.fill();g.stroke();g.fillStyle='#e05a4f';g.fillRect(-12*sc,-4*sc,24*sc,9*sc);return;}
  if(F.kind==='treasure'){g.fillStyle=c.color;this.round(g,-30*sc,-14*sc,60*sc,34*sc,4*sc);g.fill();g.stroke();g.fillStyle='#8a5a2b';g.beginPath();g.ellipse(0,-14*sc,30*sc,12*sc,0,Math.PI,0);g.fill();g.stroke();g.fillStyle='#ffd23f';g.fillRect(-5*sc,-6*sc,10*sc,12*sc);g.strokeRect(-5*sc,-6*sc,10*sc,12*sc);
   g.fillStyle=`rgba(255,240,150,${.5+.5*Math.sin(time*6)})`;g.beginPath();g.arc(20*sc,-20*sc,4*sc,0,Math.PI*2);g.fill();return;}
  const {w,h}=this.size(F,c,sc);
  g.fillStyle=c.color||'#9fd8ff';g.beginPath();g.ellipse(0,0,w,h*.5,0,0,Math.PI*2);g.fill();g.stroke();
  g.beginPath();g.moveTo(0,h*.42);g.lineTo(-w*.9,h*.78);g.lineTo(w*.9,h*.78);g.closePath();g.fill();g.stroke();
  g.fillStyle='#ffffff';g.beginPath();g.arc(-w*.35,-h*.28,Math.max(3,w*.22),0,Math.PI*2);g.arc(w*.35,-h*.28,Math.max(3,w*.22),0,Math.PI*2);g.fill();g.fillStyle=INK;g.beginPath();g.arc(-w*.35,-h*.3,Math.max(1.5,w*.1),0,Math.PI*2);g.arc(w*.35,-h*.3,Math.max(1.5,w*.1),0,Math.PI*2);g.fill();
  if(F.type==='golden'){g.fillStyle=`rgba(255,255,255,${.4+.4*Math.sin(time*8)})`;g.beginPath();g.arc(w*.2,0,3*sc,0,Math.PI*2);g.fill();}
 }
 wall(g,x,side,top,bed,name,time,sc,alert){
  const w=46*sc,inner=x,outer=x+side*w*2;
  g.save();if(alert>0){g.fillStyle=`rgba(255,59,59,${.18*alert})`;g.fillRect(Math.min(inner,outer+side*60),top,Math.abs(outer-inner)+60,bed-top);}
  if(name==='水草'){g.strokeStyle='#4f9e3a';g.lineWidth=5*sc;for(let i=0;i<7;i++){const bx=inner+side*(6+i*12)*sc,hgt=(bed-top)*(.55+.35*((i*37)%10)/10);g.beginPath();g.moveTo(bx,bed);for(let y=0;y<=hgt;y+=10)g.lineTo(bx+Math.sin(y*.05+time*1.6+i)*6*sc,bed-y);g.stroke();}}
  else if(name==='沉木'){g.fillStyle='#7a5230';g.strokeStyle=INK;g.lineWidth=3;for(let i=0;i<3;i++){const y=top+(bed-top)*(.3+i*.25);g.save();g.translate(inner+side*30*sc,y);g.rotate(side*.35);this.round(g,-40*sc,-9*sc,80*sc,18*sc,9*sc);g.fill();g.stroke();g.restore();}}
  else{g.fillStyle='#8f97a3';g.strokeStyle=INK;g.lineWidth=3;for(let i=0;i<6;i++){const y=top+(bed-top)*(.15+i*.15),r=(14+(i*29)%12)*sc;g.beginPath();g.ellipse(inner+side*(r+4*sc),y,r,r*.8,0,0,Math.PI*2);g.fill();g.stroke();}}
  g.restore();
 }
 banner(g,x,y,say,sub,mood,sc){
  const bgc={stop:'#ff5d5d',warn:'#ffd23f',catch:'#3ddc97',go:'#ffffff'}[mood]||'#ffffff',fg=mood==='stop'?'#ffffff':INK;
  g.font=`900 ${Math.round(24*sc)}px ${FONT}`;const w1=g.measureText(say).width;g.font=`800 ${Math.round(13*sc)}px ${FONT}`;const w2=g.measureText(sub).width,bw=Math.max(w1,w2)+36*sc,bh=sub?60*sc:40*sc;
  g.fillStyle=bgc;g.strokeStyle=INK;g.lineWidth=3;this.round(g,x-bw/2,y-bh/2,bw,bh,16*sc);g.fill();g.stroke();
  g.textAlign='center';g.textBaseline='middle';g.fillStyle=fg;g.font=`900 ${Math.round(24*sc)}px ${FONT}`;g.fillText(say,x,y-(sub?9*sc:0));if(sub){g.font=`800 ${Math.round(13*sc)}px ${FONT}`;g.fillText(sub,x,y+16*sc);}
 }
 text(g,t,x,y,size,color){g.font=`900 ${Math.round(size)}px ${FONT}`;g.textAlign='center';g.textBaseline='middle';g.lineWidth=4;g.strokeStyle=INK;g.strokeText(t,x,y);g.fillStyle=color;g.fillText(t,x,y);}
 round(g,x,y,w,h,r){r=Math.max(0,Math.min(r,w/2,h/2));g.beginPath();g.moveTo(x+r,y);g.arcTo(x+w,y,x+w,y+h,r);g.arcTo(x+w,y+h,x,y+h,r);g.arcTo(x,y+h,x,y,r);g.arcTo(x,y,x+w,y,r);g.closePath();}
}
