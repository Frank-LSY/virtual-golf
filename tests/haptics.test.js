import test from 'node:test';
import assert from 'node:assert/strict';
import {Haptics,HAPTICS,HAPTIC_LEVELS,HAPTIC_KEY,hapticsPanelHTML,bindHapticsPanel} from '../phone-web/haptics.js';

// 共用手机震动：节奏、强度、优先级、限频、按键轻触、iPhone 兜底、设置保存。
function make({level,taps,nav,doc=null}={}){
 let clock=1000;const buzz=[],store=new Map();if(level||taps!==undefined)store.set(HAPTIC_KEY,JSON.stringify({level:level||'normal',taps:taps??true}));
 const h=new Haptics({nav:nav||{vibrate:p=>{buzz.push(p);return true;}},doc,storage:{getItem:k=>store.get(k)??null,setItem:(k,v)=>store.set(k,v)},now:()=>clock,timers:{setTimeout:(fn,ms)=>fn()}});
 return {h,buzz,store,advance:ms=>{clock+=ms;}};
}

test('震动节奏表：每种信号都是合法的开 / 停数组，最长约 1 秒；强度信号随力度变化', ()=>{
 for(const [name,d] of Object.entries(HAPTICS)){
  for(const s of [0,.5,1]){const p=typeof d.pattern==='function'?d.pattern(s):d.pattern;assert.ok(Array.isArray(p)&&p.length%2===1,name);assert.ok(p.every(ms=>Number.isInteger(ms)&&ms>0),name);assert.ok(p.reduce((a,b)=>a+b,0)<=700,`${name} 总长 ${p.reduce((a,b)=>a+b,0)}`);}
  assert.ok(d.pri>=0&&d.pri<=5&&d.gap>=0,name);
 }
 assert.ok(HAPTICS.wall.pattern(1)[0]>HAPTICS.wall.pattern(.1)[0],'撞得越重震得越久');assert.ok(HAPTICS.strain.pattern(1)[1]<HAPTICS.strain.pattern(0)[1],'张力越紧心跳越急');
 // 关键信号彼此可辨：总长或段数不同。
 const sig=n=>{const p=HAPTICS[n].pattern;return `${p.length}:${p.join(',')}`;};const keys=['bite','hook','impact','turn','success','fail','win','go','count','error','warn','armed','cast'];assert.equal(new Set(keys.map(sig)).size,keys.length);
});

test('强度只缩放“震”的时长，停顿不变；关闭后不震；按键轻触可以单独关掉', ()=>{
 const n=make();assert.deepEqual(n.h.play('bite'),[40,60,40]);assert.deepEqual(n.buzz.at(-1),[40,60,40]);
 const l=make({level:'light'});assert.deepEqual(l.h.play('bite'),[26,60,26]);
 const s=make({level:'strong'});assert.deepEqual(s.h.play('bite'),[60,60,60]);assert.equal(s.buzz.at(-1).length,3);
 const o=make({level:'off'});assert.equal(o.h.play('bite'),null);assert.equal(o.buzz.length,0);
 const t=make({taps:false});assert.equal(t.h.play('tap'),null,'按键轻触关闭');assert.ok(t.h.play('bite'),'事件信号照常');assert.ok(t.h.play('tick',{force:true}),'试一下时强制');
 assert.equal(n.h.play('nope'),null);
});

test('优先级：重要信号震动期间跳过次要信号，同级或更高的信号可以打断；同名信号有最短间隔', ()=>{
 const {h,advance}=make();assert.ok(h.play('bite'));advance(50);assert.equal(h.play('tap'),null,'咬钩时不响应按键轻触');assert.ok(h.play('hook'),'刺中打断咬钩');
 advance(200);assert.ok(h.play('tap'));advance(10);assert.equal(h.play('tap'),null,'35 毫秒内的连点只震一次');advance(40);assert.ok(h.play('tap'));
 advance(500);assert.deepEqual(h.play('wall',{strength:.5}),[30]);advance(50);assert.equal(h.play('wall',{strength:1}),null,'连续撞墙限频');advance(60);assert.deepEqual(h.play('wall',{strength:1}),[50]);
 advance(500);assert.ok(h.play('win'));advance(100);assert.equal(h.play('fail'),null,'冠军节奏不被打断');assert.ok(h.play('fail',{force:true}));
 assert.ok(h.played.includes('win'));
});

test('不支持震动的浏览器什么都不做；安卓要先点过页面（浏览器规定）', ()=>{
 const none=make({nav:{userAgent:'Mozilla/5.0 (X11; Linux x86_64)'}});assert.equal(none.h.backend,'none');assert.equal(none.h.play('bite'),null);assert.match(none.h.note(),/不支持/);
 const buzz=[],android=make({nav:{userActivation:{hasBeenActive:false},vibrate:p=>buzz.push(p)}});assert.equal(android.h.play('bite'),null,'还没点过页面');
 const listeners={},doc={addEventListener:(k,fn)=>{listeners[k]=fn;}};android.h.bind(doc);listeners.pointerdown();assert.ok(android.h.play('bite'));assert.equal(buzz.length,1);
});

test('iPhone：用系统开关的触感兜底，只在点按后约 1 秒内触发；全局点按按钮会轻触一下', ()=>{
 const prev=globalThis.HTMLInputElement;globalThis.HTMLInputElement=class{};globalThis.HTMLInputElement.prototype.switch=false;
 try{
  let clicks=0;const listeners={},el=()=>({style:{},dataset:{},setAttribute(){},append(){},remove(){},click(){clicks++;}}),doc={createElement:el,head:{append(){}},addEventListener:(k,fn)=>{listeners[k]=fn;}};
  const ios=make({nav:{userAgent:'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 Version/18.5 Mobile/15E148 Safari/604.1',maxTouchPoints:5},doc});
  assert.equal(ios.h.backend,'ios');assert.match(ios.h.note(),/iPhone/);assert.equal(ios.h.play('bite'),null,'没有点按授权');assert.equal(clicks,0);
  ios.h.bind(doc);const button={tagName:'BUTTON',disabled:false,dataset:{}};listeners.click({target:{closest:()=>button}});assert.equal(clicks,1,'点按按钮 → 一下轻触');
  ios.advance(200);ios.h.play('bite');assert.equal(clicks,3,'咬钩两段震 → 两下');ios.advance(1000);assert.equal(ios.h.play('success'),null,'超过 1 秒不再触发');
  listeners.click({target:{closest:()=>({tagName:'BUTTON',disabled:false,dataset:{haptic:'self'}})}});assert.equal(clicks,4,'自己处理震动的按钮在 iPhone 上也有点按轻触');
  listeners.click({target:{closest:()=>({tagName:'BUTTON',disabled:true,dataset:{}})}});assert.equal(clicks,4,'禁用的按钮不震');
 }finally{globalThis.HTMLInputElement=prev;}
});

test('设置保存在本机并同步到所有面板；面板显示说明，“试一下”强制震动', ()=>{
 const {h,store,buzz}=make();const ids={};const $=id=>ids[id]??=({value:'',checked:false,disabled:false,textContent:''});
 assert.match(hapticsPanelHTML('x'),/id="x-hp-level"[\s\S]*id="x-hp-taps"[\s\S]*id="x-hp-test"[\s\S]*id="x-hp-note"/);
 bindHapticsPanel($,'a',h);bindHapticsPanel($,'b',h);assert.equal($('a-hp-level').value,'normal');assert.equal($('b-hp-taps').checked,true);assert.match($('a-hp-note').textContent,/支持网页震动/);
 $('a-hp-level').value='strong';$('a-hp-level').onchange();assert.equal($('b-hp-level').value,'strong','另一个面板同步');assert.deepEqual(JSON.parse(store.get(HAPTIC_KEY)),{level:'strong',taps:true});
 $('b-hp-taps').checked=false;$('b-hp-taps').onchange();assert.equal(h.taps,false);assert.equal($('a-hp-taps').checked,false);
 const n=buzz.length;$('a-hp-test').onclick();assert.equal(buzz.length,n+1);
 $('a-hp-level').value='off';$('a-hp-level').onchange();assert.equal($('a-hp-test').disabled,true);assert.equal($('a-hp-taps').disabled,true);
 const again=make({level:'light',taps:false});assert.equal(again.h.level,'light');assert.equal(again.h.taps,false);assert.ok(HAPTIC_LEVELS.light.scale<1);
});
