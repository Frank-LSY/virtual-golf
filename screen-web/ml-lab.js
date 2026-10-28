// 练习室“数据采集 / 数据集 / 模型训练”页：引导采集、样本复核、训练评估、部署与在线学习状态。
import {CLASSES,CLASS_NAMES,TIERS,TIER_NAMES,SOURCES,TARGETS,DETECTORS} from '../shared/ml/labels.js';
import {motionSVG,gripSVG,GRIP_TIPS,GRIPS,MOTION_TIPS} from '../shared/ml/illustrations.js';
const $=id=>document.getElementById(id);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);
const pct=(v,d=0)=>Number.isFinite(v)?(v*100).toFixed(d)+'%':'—';
const LABEL_TIPS={full:'完整上杆、下挥、收杆',partial:'半幅挥杆，控制距离',putt:'钟摆式小幅推杆',other:'拿起、放下、晃动、走动'};
const STATUS={labeled:'已标注',pseudo:'伪标签',review:'待复核',unlabeled:'未标注'};
const REASON={rule:'规则触发、模型未触发',near:'模型差一点触发'};
const PHONE_STATE={settle:'手机：保持静止',ready:'手机：请挥杆',recording:'手机：录制中…',saving:'手机：上传中',off:'手机：未启用体感',review:'手机：等待确认',paused:'手机：已暂停'};
const COLORS={full:'#25a05a',partial:'#3fa9f5',putt:'#e9a400',other:'#9db0a5'};
function sparkSvg(values,color='#25a05a',w=160,h=44){if(!values?.length)return '';const max=Math.max(60,...values),pts=values.map((v,i)=>`${(i/(values.length-1)*w).toFixed(1)},${(h-2-(v/max)*(h-6)).toFixed(1)}`).join(' ');return `<svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-hidden="true"><polyline points="0,${h} ${pts} ${w},${h}" fill="${color}22" stroke="none"/><polyline points="${pts}" fill="none" stroke="${color}" stroke-width="2" stroke-linejoin="round"/></svg>`;}
function curveSvg(curve,w=120,h=64){if(!curve?.length)return '<span class="ml-muted">数据不足</span>';const xs=curve.map(p=>p[0]),min=Math.min(...xs),max=Math.max(...xs),span=max-min||1,pts=curve.map(([x,y])=>`${((x-min)/span*(w-8)+4).toFixed(1)},${(h-4-y*(h-8)).toFixed(1)}`).join(' ');return `<svg viewBox="0 0 ${w} ${h}" class="ml-curve"><line x1="4" y1="${h-4}" x2="${w-4}" y2="${h-4}"/><polyline points="${pts}"/>${curve.map(([x,y])=>`<circle cx="${((x-min)/span*(w-8)+4).toFixed(1)}" cy="${(h-4-y*(h-8)).toFixed(1)}" r="2.6"/>`).join('')}</svg>`;}

export class MLLab {
 constructor(root,conn,{toast}){
  this.root=root;this.conn=conn;this.toast=toast;this.tab='practice';this.state=null;this.choice={label:'full',tier:'cycle',count:10};this.filters={};this.list={samples:[],total:0};this.detail=null;this.active=false;this.level=0;
  const owner=root.querySelector('.training-owner');
  owner.insertAdjacentHTML('beforeend',`<div class="lab-detector" id="lab-detector" data-mode="rule"><span class="lab-detector-label">挥杆识别</span><div class="lab-detector-seg" role="group" aria-label="挥杆识别方式"><button id="lab-det-model">模式识别</button><button id="lab-det-rule">免校准规则</button></div><small id="lab-det-note">连接中…</small></div><button class="secondary lab-adapt" id="lab-adapt" title="代替原来的握姿归零与引导校准">快速适应 · 2 分钟 →</button>`);
  owner.insertAdjacentHTML('afterend',`<nav class="lab-tabs" role="tablist" aria-label="练习室页面">${[['practice','击球练习'],['collect','数据采集'],['dataset','数据集'],['model','模型训练']].map(([id,name])=>`<button role="tab" data-lab-tab="${id}" aria-selected="${id==='practice'}">${name}</button>`).join('')}<span class="lab-tabs-note" id="ml-tab-note"></span></nav>
   <section class="ml-lab" id="ml-lab" hidden>
    <div class="ml-pane" data-pane="collect">
     <div class="ml-grid">
      <section class="ml-card ml-setup"><h3>采集设置</h3>
       <label class="ml-field">采集对象<input id="ml-person-input" maxlength="24" placeholder="球手姓名"></label><p class="ml-muted">同一台手机可以代表不同的人；“人 × 手机”各自建立个人适配。</p>
       <p class="ml-device" id="ml-device">尚未选择手机</p>
       <div class="ml-label-grid" id="ml-label-grid">${CLASSES.map(c=>`<button data-ml-label="${c}"><b>${CLASS_NAMES[c]}</b><small>${LABEL_TIPS[c]}</small><span data-ml-count="${c}">0 / ${TARGETS[c]}</span></button>`).join('')}</div>
       <div class="ml-row"><span>力度</span><div class="ml-seg" id="ml-tier-seg">${[['cycle','轻→中→重轮换'],...TIERS.map(t=>[t,TIER_NAMES[t]])].map(([v,n])=>`<button data-ml-tier="${v}">${n}</button>`).join('')}</div></div>
       <div class="ml-row"><span>次数</span><div class="ml-seg" id="ml-count-seg">${[5,10,20].map(n=>`<button data-ml-count-choice="${n}">${n} 次</button>`).join('')}</div></div>
       <button class="primary ml-start" id="ml-start">开始采集 →</button><button class="secondary ml-adapt-btn" id="ml-adapt">快速适应 · 约 2 分钟</button>
       <p class="ml-muted">手机静止半秒后提示“请挥杆”，动作开始自动录制（含 1 秒预录），停稳自动保存。不需要校准；每条录音记录采集对象、动作与力度、设备名称。手机上的“录入训练数据”也可以直接开始。</p>
       <div class="ml-grip" id="ml-grip"><div class="ml-grip-fig">${gripSVG('vertical')}</div><ul>${GRIP_TIPS.vertical.map(t=>`<li>${t}</li>`).join('')}</ul></div>
      </section>
      <section class="ml-card ml-live"><div class="ml-live-head"><h3 id="ml-live-title">等待开始</h3><span class="ml-counter" id="ml-live-count"></span></div>
       <div class="ml-prompt" id="ml-live-prompt"><div class="ml-live-demo" id="ml-live-demo" aria-hidden="true"></div><b id="ml-live-label">选择动作后开始采集</b><span id="ml-live-tier"></span><p id="ml-live-hint">每次采集 5–20 条；建议每类三档力度各占三分之一。</p></div>
       <div class="ml-progress"><i id="ml-live-progress"></i></div>
       <div class="ml-phone-state"><span id="ml-phone-state">手机：—</span><div class="ml-meter"><i id="ml-meter"></i></div></div>
       <div class="ml-review-box" id="ml-review-box" hidden><p id="ml-review-reason"></p><div><button class="secondary" id="ml-keep-btn">仍然保存</button><button class="primary" id="ml-discard-btn">丢弃，重来</button></div></div>
       <p class="ml-session-stats" id="ml-session-stats"></p>
       <canvas id="ml-wave" class="ml-wave" width="640" height="220" aria-label="最近一条录音的三轴角速度"></canvas>
       <div class="ml-chips" id="ml-last-chips"></div>
       <div class="ml-live-actions"><button class="secondary" id="ml-pause-btn">暂停</button><button class="secondary" id="ml-skip-btn">跳过这条</button><button class="secondary" id="ml-undo-btn">撤销上一条</button><button class="secondary" id="ml-stop-btn">结束本组</button></div>
      </section>
      <section class="ml-card ml-coverage"><h3>采集进度 <small id="ml-cov-person"></small></h3><div id="ml-coverage"></div><p class="ml-next" id="ml-next"></p><h4>全部球手与设备</h4><div id="ml-profiles" class="ml-profiles"></div></section>
     </div>
    </div>
    <div class="ml-pane" data-pane="dataset">
     <div class="ml-filters"><select id="ml-f-profile"><option value="">全部球手</option></select><select id="ml-f-label"><option value="">全部标签</option>${CLASSES.map(c=>`<option value="${c}">${CLASS_NAMES[c]}</option>`).join('')}<option value="none">未标注</option></select><select id="ml-f-source"><option value="">全部来源</option>${Object.entries(SOURCES).map(([k,v])=>`<option value="${k}">${v}</option>`).join('')}</select><select id="ml-f-status"><option value="">全部状态</option>${Object.entries(STATUS).map(([k,v])=>`<option value="${k}">${v}</option>`).join('')}</select><span id="ml-list-total" class="ml-muted"></span><button class="secondary" id="ml-export">导出数据集 ↓</button></div>
     <div class="ml-detail" id="ml-detail" hidden><canvas id="ml-detail-wave" width="900" height="240"></canvas><div id="ml-detail-meta" class="ml-chips"></div></div>
     <div class="ml-samples" id="ml-samples"></div><button class="secondary ml-more" id="ml-more" hidden>加载更多</button>
    </div>
    <div class="ml-pane" data-pane="model">
     <div class="ml-grid ml-grid-model">
      <section class="ml-card ml-detector" id="ml-detector-card"><div class="ml-detector-head"><div><h3>识别方式</h3><p class="ml-muted">开启后，手机用 SwingNet 在数据流中识别挥杆并给出力量，规则只在后台作对照；关闭则使用免校准规则（同样不需要校准）。</p></div><label class="ml-switch"><input type="checkbox" id="ml-detector-toggle"><span></span><b>改用模型识别</b></label></div>
       <div class="ml-detector-body"><div><div id="ml-ready" class="ml-ready"></div><label class="ml-threshold">触发置信度 <b id="ml-threshold-value">70%</b><input type="range" id="ml-threshold" min="50" max="95" step="5" value="70"></label><p class="ml-muted">越高越不容易误触发，但轻挥更可能被拒识。下表为验证集完整录音的流式回放。</p></div><div><table class="ml-compare" id="ml-stream-table"></table><table class="ml-compare ml-curve-table" id="ml-curve-table"></table></div><div><h4>手机</h4><div id="ml-phones" class="ml-phones"></div></div></div></section>
      <section class="ml-card"><h3>训练</h3><p class="ml-muted" id="ml-train-summary"></p>
       <div class="ml-row"><span>轮数</span><div class="ml-seg" id="ml-epoch-seg">${[30,45,60].map(n=>`<button data-ml-epochs="${n}">${n}</button>`).join('')}</div></div>
       <div class="ml-train-actions"><button class="primary" id="ml-train">完整训练 →</button><button class="secondary" id="ml-transfer">评估迁移（留一人）</button><button class="secondary" id="ml-cancel">取消</button></div>
       <div class="ml-job"><div class="ml-progress"><i id="ml-job-progress"></i></div><p id="ml-job-text" class="ml-muted">尚未训练</p><canvas id="ml-loss" width="520" height="160" aria-label="训练损失曲线"></canvas></div>
      </section>
      <section class="ml-card"><h3>当前模型表现 <small id="ml-metric-model"></small></h3><div class="ml-tiles" id="ml-tiles"></div><table class="ml-compare" id="ml-compare"></table><div class="ml-confusion" id="ml-confusion"></div></section>
      <section class="ml-card"><h3>部署与在线学习</h3><div class="ml-toggles"><label><input type="checkbox" id="ml-shadow"> 对照显示：手机同时显示另一种识别方式的判断（不影响击球）</label><label><input type="checkbox" id="ml-autotune"> 每 15 个被接受的实战挥杆自动微调输出头</label></div><div id="ml-online" class="ml-online"></div><div id="ml-models" class="ml-models"></div></section>
      <section class="ml-card"><h3>个人适配与迁移</h3><div id="ml-transfer-result"></div><div id="ml-adapt-list"></div></section>
      <section class="ml-card"><h3>实战对照统计</h3><div id="ml-shadow-stats"></div></section>
     </div>
    </div>
   </section>`);
  this.bind();this.renderChoice();
  conn.addEventListener('message',({detail:m})=>this.message(m));conn.addEventListener('offline',()=>{this.state=null;this.render();});
 }
 send(m){if(!this.conn.send(m))this.toast('正在重新连接本地游戏服务。');}
 bind(){
  this.root.querySelectorAll('[data-lab-tab]').forEach(b=>b.onclick=()=>this.setTab(b.dataset.labTab));
  this.root.querySelectorAll('[data-ml-label]').forEach(b=>b.onclick=()=>{this.choice.label=b.dataset.mlLabel;this.renderChoice();});
  this.root.querySelectorAll('[data-ml-tier]').forEach(b=>b.onclick=()=>{this.choice.tier=b.dataset.mlTier;this.renderChoice();});
  this.root.querySelectorAll('[data-ml-count-choice]').forEach(b=>b.onclick=()=>{this.choice.count=Number(b.dataset.mlCountChoice);this.renderChoice();});
  this.root.querySelectorAll('[data-ml-epochs]').forEach(b=>b.onclick=()=>{this.epochs=Number(b.dataset.mlEpochs);this.renderChoice();});this.epochs=45;
  $('ml-start').onclick=()=>this.send({type:'ml_session',action:'start',mode:'collect',label:this.choice.label,tier:this.choice.label==='other'?null:this.choice.tier,count:this.choice.count,person:$('ml-person-input').value});
  $('ml-adapt').onclick=()=>this.send({type:'ml_session',action:'start',mode:'adapt',person:$('ml-person-input').value});
  $('ml-pause-btn').onclick=()=>this.send({type:'ml_session',action:this.state?.session?.paused?'resume':'pause'});$('ml-skip-btn').onclick=()=>this.send({type:'ml_session',action:'skip'});$('ml-keep-btn').onclick=()=>this.send({type:'ml_session',action:'review',decision:'save'});$('ml-discard-btn').onclick=()=>this.send({type:'ml_session',action:'review',decision:'discard'});
  $('ml-undo-btn').onclick=()=>this.send({type:'ml_session',action:'undo'});$('ml-stop-btn').onclick=()=>this.send({type:'ml_session',action:'stop'});
  for(const id of ['ml-f-profile','ml-f-label','ml-f-source','ml-f-status'])$(id).onchange=()=>{this.filters={profile:$('ml-f-profile').value,label:$('ml-f-label').value,source:$('ml-f-source').value,status:$('ml-f-status').value};this.requestList(0);};
  $('ml-more').onclick=()=>this.requestList(this.list.samples.length,true);
  $('ml-export').onclick=()=>this.send({type:'ml_export'});
  $('ml-train').onclick=()=>this.send({type:'ml_train',kind:'full',epochs:this.epochs});$('ml-transfer').onclick=()=>this.send({type:'ml_train',kind:'transfer'});$('ml-cancel').onclick=()=>this.send({type:'ml_cancel'});
  $('lab-adapt').onclick=()=>{this.send({type:'ml_session',action:'start',mode:'adapt',person:this.state?.phone?.name||''});this.setTab('collect');};
  $('lab-det-model').onclick=()=>this.send({type:'ml_settings',detector:'model'});$('lab-det-rule').onclick=()=>this.send({type:'ml_settings',detector:'rule'});
  $('ml-detector-toggle').onchange=()=>this.send({type:'ml_settings',detector:$('ml-detector-toggle').checked?'model':'rule'});$('ml-threshold').oninput=()=>{$('ml-threshold-value').textContent=$('ml-threshold').value+'%';};$('ml-threshold').onchange=()=>this.send({type:'ml_settings',threshold:Number($('ml-threshold').value)/100});
  $('ml-shadow').onchange=()=>this.send({type:'ml_settings',shadow:$('ml-shadow').checked});$('ml-autotune').onchange=()=>this.send({type:'ml_settings',autoTune:$('ml-autotune').checked});
  $('ml-samples').addEventListener('change',e=>{const card=e.target.closest('[data-sample]');if(!card)return;if(e.target.matches('[data-edit=label]'))this.send({type:'ml_update',id:card.dataset.sample,label:e.target.value||null});if(e.target.matches('[data-edit=tier]'))this.send({type:'ml_update',id:card.dataset.sample,tier:e.target.value||null});setTimeout(()=>this.requestList(0),250);});
  $('ml-samples').addEventListener('click',e=>{const card=e.target.closest('[data-sample]');if(!card)return;if(e.target.matches('[data-delete]')){this.send({type:'ml_update',id:card.dataset.sample,deleted:true});card.remove();return;}if(!e.target.matches('select,option'))this.send({type:'ml_detail',id:card.dataset.sample});});
  $('ml-models').addEventListener('click',e=>{const b=e.target.closest('[data-deploy]');if(b)this.send({type:'ml_deploy',modelId:b.dataset.deploy||null});});
  $('ml-profiles').addEventListener('click',e=>{const b=e.target.closest('[data-person]');if(b){$('ml-person-input').value=b.dataset.person;this.renderCoverage();}});
  $('ml-person-input').addEventListener('input',()=>this.renderCoverage());
 }
 show(active){this.active=active;this.conn.send({type:'ml_view',active});if(!active)this.setTab('practice',false);else this.render();}
 setTab(tab,request=true){this.tab=tab;this.root.dataset.labTab=tab;this.root.querySelectorAll('[data-lab-tab]').forEach(b=>b.setAttribute('aria-selected',String(b.dataset.labTab===tab)));$('ml-lab').hidden=tab==='practice';this.root.querySelectorAll('.ml-pane').forEach(p=>p.hidden=p.dataset.pane!==tab);if(tab==='practice')window.dispatchEvent(new Event('resize'));if(request&&tab==='dataset')this.requestList(0);this.render();}
 requestList(offset,append=false){this.appendList=append;this.send({type:'ml_list',offset,limit:48,...this.filters});}
 message(m){
  if(m.type==='ready'&&this.active)this.conn.send({type:'ml_view',active:true});
  if(m.type==='ml_state'){const first=!this.state;this.state=m;const sid=m.session&&!m.session.done?m.session.id:null;if(sid&&sid!==this.sessionId&&this.active&&this.tab!=='collect'){this.setTab('collect');this.toast(m.session.mode==='adapt'?'开始快速适应：已切换到“数据采集”页。':'开始采集：已切换到“数据采集”页。');}this.sessionId=sid;if(first&&!$('ml-person-input').value&&m.phone)$('ml-person-input').value=m.phone.name;const last=m.recent.find(s=>s.source==='collect'||s.source==='adapt');if(last&&last.id!==this.lastId){this.lastId=last.id;if(this.tab==='collect')this.send({type:'ml_detail',id:last.id});}this.render();}
  if(m.type==='ml_list'){this.list=this.appendList?{total:m.total,samples:[...this.list.samples,...m.samples]}:m;this.renderList();}
  if(m.type==='ml_detail'){this.detail=m;if(this.tab==='collect')this.drawWave($('ml-wave'),m,true);else{$('ml-detail').hidden=false;this.drawWave($('ml-detail-wave'),m,false);$('ml-detail-meta').innerHTML=this.chips(m.sample,true);}}
  if(m.type==='ml_export'){const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([JSON.stringify(m.data)],{type:'application/json'}));a.download=`挥杆之间-机器学习数据集-${new Date().toISOString().slice(0,10)}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1500);this.toast(`已导出 ${m.data.samples.length} 条样本。`);}
  if(m.type==='sensor_sample'&&this.tab==='collect'){const t=m.sample,w=Math.hypot(t.alpha||0,t.beta||0,t.gamma||0);this.level=w;$('ml-meter').style.width=Math.min(100,w/8)+'%';}
 }
 demo(label,tier){const grip=this.state?.phone?.grip||'vertical',key=label+'|'+tier+'|'+grip;if(this.demoKey===key)return;this.demoKey=key;$('ml-live-demo').innerHTML=motionSVG(label,tier||'mid',{grip});if(this.gripKey!==grip){this.gripKey=grip;$('ml-grip').innerHTML=`<div class="ml-grip-fig">${gripSVG(grip)}</div><ul>${GRIP_TIPS[grip].map(t=>`<li>${t}</li>`).join('')}<li>手机当前设置：${GRIPS[grip]}</li></ul>`;}}
 renderIndicator(){
  const s=this.state,st=s.settings,r=s.readiness||{},model=st.detector==='model',effective=model&&r.available,phone=s.phone,live=phone&&s.phones?.find(p=>p.id===phone.id);
  $('lab-detector').dataset.mode=effective?'model':model?'fallback':'rule';$('lab-det-model').classList.toggle('selected',model);$('lab-det-rule').classList.toggle('selected',!model);
  $('lab-det-note').textContent=effective?`SwingNet · 置信度 ≥ ${Math.round(st.threshold*100)}% · 免校准${live?.detector==='rule'?' · 手机尚未切换，请刷新手机页面':''}`:model?(r.modelId?'当前模型需重新完整训练，暂用免校准规则':'尚未训练模型，暂用免校准规则'):'免校准规则 · 力度按最近挥杆自动定标';
 }
 renderChoice(){
  if(!this.state?.session||this.state.session.done)this.demo(this.choice.label,this.choice.tier==='cycle'?'mid':this.choice.tier);
  this.root.querySelectorAll('[data-ml-label]').forEach(b=>b.classList.toggle('selected',b.dataset.mlLabel===this.choice.label));
  this.root.querySelectorAll('[data-ml-tier]').forEach(b=>{b.classList.toggle('selected',b.dataset.mlTier===this.choice.tier);b.disabled=this.choice.label==='other';});
  this.root.querySelectorAll('[data-ml-count-choice]').forEach(b=>b.classList.toggle('selected',Number(b.dataset.mlCountChoice)===this.choice.count));
  this.root.querySelectorAll('[data-ml-epochs]').forEach(b=>b.classList.toggle('selected',Number(b.dataset.mlEpochs)===this.epochs));
 }
 currentProfile(){const s=this.state;if(!s?.phone)return null;const person=($('ml-person-input').value||s.phone.name).trim();return s.profiles.find(p=>p.deviceId===s.phone.id&&p.person===person)||{person,deviceId:s.phone.id,counts:Object.fromEntries(CLASSES.map(c=>[c,{light:0,mid:0,heavy:0,none:0,total:0}])),total:0,play:0};}
 render(){
  const s=this.state;$('ml-tab-note').textContent=s?`${s.totals.samples} 条样本 · ${s.totals.labeled} 条已标注${s.current?' · 模型已部署':''}`:'连接中…';
  if(!s||!this.active)return;this.renderIndicator();this.renderCollect();this.renderCoverage();if(this.tab==='model')this.renderModel();
 }
 renderCollect(){
  const s=this.state,phone=s.phone,trial=s.session&&!s.session.done?s.session:null,mine=trial&&s.sessionPhone===phone?.id;
  $('ml-device').innerHTML=phone?`<b>手机 ${String(phone.number??'').padStart(2,'0')} · ${esc(phone.name)}</b> <small>${esc(phone.deviceName||'')}</small> <span class="${phone.motionReady?'ok':'warn'}">${phone.motionReady?`体感已启用${phone.hz?` · ${phone.hz} 次/秒`:''}`:'请在手机上点击“启用体感”'}</span>`:'<span class="warn">请先在上方选择一台已连接的手机</span>';
  $('ml-start').disabled=$('ml-adapt').disabled=!phone||!phone.motionReady||!!trial;for(const id of ['ml-undo-btn','ml-stop-btn','ml-pause-btn','ml-skip-btn'])$(id).disabled=!trial;$('ml-pause-btn').textContent=trial?.paused?'继续':'暂停';
  const review=trial&&s.phoneState==='review';$('ml-review-box').hidden=!review;if(review)$('ml-review-reason').textContent=`这次不太像“${trial.labelName}”：${s.phoneReason||'请确认'}。手机 6 秒后自动丢弃。`;
  const st=trial?.stats||s.lastSummary;$('ml-session-stats').textContent=st?`${trial?'本组':'上一组'}：已保存 ${st.saved||0} · 丢弃 ${st.discarded||0} · 跳过 ${st.skipped||0} · 忽略小动作 ${st.small||0}`:'太小的动作不会记录；不像提示动作的会先请你确认；随时可以暂停。';
  if(trial)this.demo(trial.label,trial.tier);else this.demo(this.choice.label,this.choice.tier==='cycle'?'mid':this.choice.tier);
  if(trial){$('ml-live-title').textContent=trial.mode==='adapt'?`快速适应 · ${trial.person}`:`正在采集 · ${trial.person}`;$('ml-live-count').textContent=`${trial.index+1} / ${trial.count}`;$('ml-live-label').textContent=trial.labelName;$('ml-live-tier').textContent=trial.tier?`${trial.tierName}力度`:'自然动作';$('ml-live-tier').dataset.tier=trial.tier||'none';$('ml-live-hint').textContent=trial.prompt||MOTION_TIPS[trial.label]||LABEL_TIPS[trial.label];$('ml-live-progress').style.width=trial.index/trial.count*100+'%';$('ml-phone-state').textContent=trial.paused?'手机：已暂停':PHONE_STATE[s.phoneState]||'手机：等待提示';}
  else{$('ml-live-title').textContent='等待开始';$('ml-live-count').textContent='';$('ml-live-label').textContent=mine===false?'其他手机正在采集':'选择动作后开始采集';$('ml-live-tier').textContent='';$('ml-live-tier').dataset.tier='none';$('ml-live-hint').textContent='每次采集 5–20 条；建议每类三档力度各占三分之一。“快速适应”会依次采集全挥杆、切杆、推杆各 5 条和非挥杆动作 6 条。';$('ml-live-progress').style.width='0';$('ml-phone-state').textContent='手机：—';}
 }
 renderCoverage(){
  const s=this.state;if(!s)return;const p=this.currentProfile();$('ml-cov-person').textContent=p?`${p.person}`:'';
  $('ml-coverage').innerHTML=p?`<table class="ml-cov"><thead><tr><th></th>${TIERS.map(t=>`<th>${TIER_NAMES[t]}</th>`).join('')}<th>合计</th></tr></thead><tbody>${CLASSES.map(c=>{const n=p.counts[c],target=TARGETS[c];return `<tr><th>${CLASS_NAMES[c]}</th>${TIERS.map(t=>`<td>${c==='other'?'—':n[t]}</td>`).join('')}<td><b>${n.total}</b>/${target}<div class="ml-bar"><i style="width:${Math.min(100,n.total/target*100)}%;background:${COLORS[c]}"></i></div></td></tr>`;}).join('')}</tbody></table>`:'<p class="ml-muted">选择手机后显示该球手的采集进度。</p>';
  for(const c of CLASSES){const el=this.root.querySelector(`[data-ml-count="${c}"]`);if(el)el.textContent=p?`${p.counts[c].total} / ${TARGETS[c]}`:`0 / ${TARGETS[c]}`;}
  if(p){const gaps=CLASSES.map(c=>[c,TARGETS[c]-p.counts[c].total]).filter(([,g])=>g>0).sort((a,b)=>b[1]-a[1]);$('ml-next').textContent=gaps.length?`建议下一步：再采 ${Math.min(10,gaps[0][1])} 次${CLASS_NAMES[gaps[0][0]]}${gaps[0][0]!=='other'?'（力度轮换）':''}。`:'这位球手的建议采集量已达标，可以到“模型训练”页训练。';}
  $('ml-profiles').innerHTML=s.profiles.length?s.profiles.map(q=>`<button data-person="${esc(q.person)}" class="${q.deviceId===s.phone?.id?'same-device':''}"><b>${esc(q.person)}</b><small>${esc(q.deviceName||'')} · 手机 ${q.phone??'?'}${q.grips?.vertical?` · 竖握 ${q.grips.vertical}`:''}${q.grips?.horizontal?` · 横握 ${q.grips.horizontal}`:''} · ${CLASSES.map(c=>q.counts[c].total).join(' / ')} · 实战 ${q.play}${q.review?` · 待复核 ${q.review}`:''}</small></button>`).join(''):'<p class="ml-muted">还没有样本。</p>';
  const profiles=$('ml-f-profile'),value=profiles.value;profiles.innerHTML='<option value="">全部球手与设备</option>'+s.profiles.map(q=>`<option value="${esc(q.key)}">${esc(q.person)} · ${esc(q.deviceName||'手机 '+(q.phone??'?'))}</option>`).join('');profiles.value=value;
 }
 chips(sample,full=false){if(!sample)return '';const p=sample.prediction,parts=[`<span class="ml-chip src-${sample.source}">${SOURCES[sample.source]||sample.source}</span>`];if(sample.label)parts.push(`<span class="ml-chip" style="background:${COLORS[sample.label]}22;color:${COLORS[sample.label]}">${CLASS_NAMES[sample.label]}${sample.tier?` · ${TIER_NAMES[sample.tier]}`:''}</span>`);parts.push(`<span class="ml-chip">${esc(sample.person)} · ${esc(sample.deviceName||'')} · ${sample.grip?GRIPS[sample.grip]:'握法未记录'}</span>`);if(sample.detector)parts.push(`<span class="ml-chip">${DETECTORS[sample.detector]}${sample.stream?.label?` · ${CLASS_NAMES[sample.stream.label]} ${pct(sample.stream.confidence)}`:''}${sample.stream?.reason?` · ${REASON[sample.stream.reason]||''}`:''}</span>`);parts.push(`<span class="ml-chip">${(sample.duration/1000).toFixed(1)} 秒 · 峰值 ${sample.peak}°/s · ${Math.round(sample.hz)} 次/秒</span>`);if(p)parts.push(`<span class="ml-chip ml-pred">模型：${p.labelName} ${pct(p.confidence)}${p.power!==null?` · 力度 ${pct(p.power)}`:''}</span>`);if(sample.rule&&full)parts.push(`<span class="ml-chip">规则：力度 ${pct(sample.rule.power)} · 峰值 ${Math.round(sample.rule.peak||0)}</span>`);if(sample.context?.clubId&&full)parts.push(`<span class="ml-chip">球杆：${esc(sample.context.clubId)}</span>`);if(sample.feedback)parts.push(`<span class="ml-chip warn">${esc(sample.feedback)}</span>`);return parts.join('');}
 drawWave(canvas,d,compact){
  const ctx=canvas.getContext('2d'),W=canvas.width,H=canvas.height,pad=compact?8:12;ctx.clearRect(0,0,W,H);ctx.fillStyle='#f6faf3';ctx.fillRect(0,0,W,H);
  const n=d.n,mag=Array.from({length:n},(_,i)=>Math.hypot(d.g[i*3],d.g[i*3+1],d.g[i*3+2])),max=Math.max(100,...mag),x=i=>pad+i/(n-1)*(W-2*pad),y=v=>H/2-v/max*(H/2-pad);
  ctx.fillStyle='rgba(255,200,61,.22)';ctx.fillRect(x(d.window[0]),0,x(d.window[1])-x(d.window[0]),H);ctx.strokeStyle='#e9a400';ctx.setLineDash([4,4]);ctx.beginPath();ctx.moveTo(x(d.anchor),0);ctx.lineTo(x(d.anchor),H);ctx.stroke();ctx.setLineDash([]);
  ctx.strokeStyle='#dbe6d6';ctx.beginPath();ctx.moveTo(0,H/2);ctx.lineTo(W,H/2);ctx.stroke();
  const series=[[0,'#1b7fc8'],[1,'#25a05a'],[2,'#ff6a4d']];for(const [k,color] of series){ctx.strokeStyle=color;ctx.lineWidth=1.6;ctx.beginPath();for(let i=0;i<n;i++){const v=d.g[i*3+k];i?ctx.lineTo(x(i),y(v)):ctx.moveTo(x(i),y(v));}ctx.stroke();}
  ctx.strokeStyle='#12372a';ctx.lineWidth=2.2;ctx.beginPath();for(let i=0;i<n;i++){i?ctx.lineTo(x(i),y(mag[i])):ctx.moveTo(x(i),y(mag[i]));}ctx.stroke();
  ctx.fillStyle='#36574a';ctx.font='600 12px system-ui';ctx.fillText(`±${Math.round(max)} °/s · 黄色为模型输入窗口（1.92 秒），虚线为锚点`,pad+2,14);
  if(compact)$('ml-last-chips').innerHTML=this.chips(d.sample);
 }
 renderList(){
  $('ml-list-total').textContent=`共 ${this.list.total} 条`;$('ml-more').hidden=this.list.samples.length>=this.list.total;
  $('ml-samples').innerHTML=this.list.samples.map(s=>`<article class="ml-sample status-${s.status}" data-sample="${s.id}"><div class="ml-spark">${sparkSvg(s.spark,COLORS[s.label]||'#9db0a5')}</div>
   <div class="ml-sample-row"><select data-edit="label" aria-label="标签"><option value="">未标注</option>${CLASSES.map(c=>`<option value="${c}" ${s.label===c?'selected':''}>${CLASS_NAMES[c]}</option>`).join('')}</select><select data-edit="tier" aria-label="力度档位" ${!s.label||s.label==='other'?'disabled':''}><option value="">—</option>${TIERS.map(t=>`<option value="${t}" ${s.tier===t?'selected':''}>${TIER_NAMES[t]}</option>`).join('')}</select><button data-delete title="删除这条样本">×</button></div>
   <p class="ml-sample-meta">${SOURCES[s.source]||s.source} · ${esc(s.person)} · ${esc(s.deviceName||'')}${s.grip?' · '+GRIPS[s.grip]:''} · ${new Date(s.time).toLocaleString('zh-CN',{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'})} · <b>${STATUS[s.status]||s.status}</b></p>
   ${s.prediction?`<p class="ml-sample-pred">模型：${s.prediction.labelName} ${pct(s.prediction.confidence)}${s.prediction.power!==null?` · 力度 ${pct(s.prediction.power)}`:''}</p>`:''}${s.weak?`<p class="ml-sample-pred">球杆提示：${CLASS_NAMES[s.weak]}</p>`:''}${s.source==='candidate'?`<p class="ml-sample-pred warn">${REASON[s.stream?.reason]||'待定'}${s.stream?.label?` · 模型 ${CLASS_NAMES[s.stream.label]} ${pct(s.stream.confidence)}`:''}</p>`:s.detector==='model'&&s.stream?`<p class="ml-sample-pred">模型识别触发 · ${CLASS_NAMES[s.stream.label]||''} ${pct(s.stream.confidence)} · 力量 ${pct(s.stream.power)}</p>`:''}${s.feedback?`<p class="ml-sample-pred warn">${esc(s.feedback)}</p>`:''}</article>`).join('')||'<p class="ml-empty">没有符合条件的样本。</p>';
 }
 renderModel(){
  const s=this.state,job=s.job,current=s.models.find(m=>m.current),best=current||s.models[0],v=best?.metrics?.validation;
  const counts=CLASSES.map(c=>s.profiles.reduce((n,p)=>n+p.counts[c].total,0));$('ml-train-summary').textContent=`已标注 ${s.totals.labeled} 条（${CLASSES.map((c,i)=>`${CLASS_NAMES[c]} ${counts[i]}`).join('、')}）。至少 12 条、两类以上即可训练；建议每类 20 条以上。`;
  const running=job&&!job.finished;$('ml-train').disabled=running||s.totals.labeled<12;$('ml-transfer').disabled=running||s.profiles.length<2;$('ml-cancel').disabled=!running;
  $('ml-job-progress').style.width=(job?job.progress*100:0)+'%';$('ml-job-text').textContent=!job?'尚未训练':job.error?`未完成：${job.error}`:running?`${{train:'训练中',final:'用全部数据收尾',profiles:'重建个人适配',transfer:'留一人评估',prepare:'准备数据'}[job.stage]||job.stage} · ${pct(job.progress)}${job.epoch?` · 第 ${job.epoch} 轮 · 损失 ${job.loss?.toFixed(3)}`:''}${Number.isFinite(job.valF1)?` · 验证 F1 ${job.valF1.toFixed(3)}`:''}`:`${{full:'完整训练',head:'在线微调',rebuild:'个人适配重建',transfer:'迁移评估'}[job.kind]}已完成${job.modelId?` · 模型 ${job.modelId}${job.deployed?'（已部署）':'（可在右侧部署）'}`:''}`;
  this.drawLoss(job?.history?.length?job.history:best?.metrics?.history||[]);
  $('ml-metric-model').textContent=best?`${best.id}${best.current?' · 已部署':''}`:'';
  $('ml-tiles').innerHTML=v?[['宏平均 F1',v.macroF1,'≥ 90%'],['误触发率',v.falseTrigger,'≤ 10%',true],['漏识别率',v.missRate,'≤ 5%',true],['力度排序相关',v.intensityRho,'≥ 0.7']].map(([n,val,goal,lower])=>`<div class="ml-tile ${Number.isFinite(val)?(lower?val<=parseFloat(goal.match(/[\d.]+/)[0])/100:n.includes('相关')?val>=.7:val>=.9)?'good':'bad':''}"><small>${n}</small><b>${n.includes('相关')?(Number.isFinite(val)?val.toFixed(2):'—'):pct(val,1)}</b><span>目标 ${goal}</span></div>`).join(''):'<p class="ml-muted">训练后显示验证集结果（按采集批次划分）。</p>';
  $('ml-compare').innerHTML=v?`<thead><tr><th>方法</th><th>宏平均 F1</th><th>误触发</th><th>漏识别</th></tr></thead><tbody><tr><th>SwingNet</th><td>${pct(v.macroF1,1)}</td><td>${pct(v.falseTrigger,1)}</td><td>${pct(v.missRate,1)}</td></tr><tr><th>免校准规则</th><td>—</td><td>${pct(best.metrics.rule?.falseTrigger,1)}</td><td>${pct(best.metrics.rule?.missRate,1)}</td></tr><tr><th>手工特征最近质心</th><td>${pct(best.metrics.baseline?.macroF1,1)}</td><td>${pct(best.metrics.baseline?.falseTrigger,1)}</td><td>${pct(best.metrics.baseline?.missRate,1)}</td></tr></tbody>`:'';
  $('ml-confusion').innerHTML=v?.confusion?`<p class="ml-muted">混淆矩阵（行：真实，列：预测；验证 ${v.count} 条）</p><div class="ml-cm" style="grid-template-columns:auto repeat(${CLASSES.length},1fr)"><span></span>${CLASSES.map(c=>`<span class="h">${CLASS_NAMES[c].split(' ')[0]}</span>`).join('')}${v.confusion.map((row,i)=>{const total=row.reduce((a,b)=>a+b,0)||1;return `<span class="h">${CLASS_NAMES[CLASSES[i]].split(' ')[0]}</span>`+row.map((n,j)=>`<span style="background:${i===j?`rgba(37,160,90,${.15+.7*n/total})`:n?`rgba(255,106,77,${.15+.6*n/total})`:'#f3f8ee'}">${n}</span>`).join('');}).join('')}</div>`:'';
  $('ml-shadow').checked=s.settings.shadow;$('ml-autotune').checked=s.settings.autoTune;this.renderDetector();
  const o=s.online;$('ml-online').innerHTML=`<p>在线微调：已接受 <b>${o.acceptedSinceTune}</b> / ${o.tuneEvery} 杆${o.lastTuneAt?` · 上次 ${new Date(o.lastTuneAt).toLocaleString('zh-CN')}`:''}</p>${o.suggestFull?'<p class="warn">新增标注已超过上次完整训练的 30%，建议重新完整训练。</p>':''}`;
  $('ml-models').innerHTML=s.models.length?s.models.map(m=>`<div class="ml-model ${m.current?'current':''}"><div><b>${m.id}</b><small>${m.kind==='head'?'在线微调':'完整训练'}${m.stream?' · 支持流式识别':' · 旧版（不支持模型识别）'} · ${m.samples} 条 · ${new Date(m.trainedAt).toLocaleString('zh-CN')}${m.metrics?.validation?` · F1 ${pct(m.metrics.validation.macroF1,1)}`:''}</small></div>${m.current?'<span class="ml-chip ml-pred">已部署</span><button class="text-button" data-deploy="">停用</button>':`<button class="secondary" data-deploy="${m.id}">部署</button>`}</div>`).join(''):'<p class="ml-muted">还没有模型。</p>';
  const t=s.transfer;$('ml-transfer-result').innerHTML=t?.profiles?.length?`<p>留一人迁移：零样本 F1 <b>${pct(t.zeroShotF1,1)}</b> → 每类 5 条适应后 <b>${pct(t.adaptedF1,1)}</b></p>${t.profiles.map(r=>`<div class="ml-transfer-row"><span>${esc(r.profile.split('|')[1]||r.profile)}</span><div class="ml-bar"><i style="width:${r.zeroShotF1*100}%;background:#9db0a5"></i></div><div class="ml-bar"><i style="width:${r.adaptedF1*100}%"></i></div><small>${pct(r.zeroShotF1)} → ${pct(r.adaptedF1)}</small></div>`).join('')}`:'<p class="ml-muted">至少两位球手（或两台设备）各采 12 条以上后，可评估“换人换设备”的迁移效果。</p>';
  $('ml-adapt-list').innerHTML=s.profiles.filter(p=>p.adaptation).map(p=>`<div class="ml-adapt"><div><b>${esc(p.person)}</b><small>手机 ${p.phone??'?'} · 已接受 ${p.adaptation.accepted} 条 · 原型权重 ${pct(p.adaptation.protoWeight)}</small><div class="ml-dots">${CLASSES.map(c=>`<i class="${p.adaptation.prototypes[c]>=3?'on':''}" title="${CLASS_NAMES[c]} ${p.adaptation.prototypes[c]} 条">${CLASS_NAMES[c].slice(0,2)}</i>`).join('')}</div></div>${['full','partial','putt'].map(c=>`<figure><figcaption>${CLASS_NAMES[c].split(' ')[0]}力度映射</figcaption>${curveSvg(p.adaptation.curves[c])}</figure>`).join('')}</div>`).join('')||'<p class="ml-muted">部署模型后，每位球手的类别原型与力度映射会显示在这里。</p>';
  const sh=s.shadow;$('ml-shadow-stats').innerHTML=`<div class="ml-tiles"><div class="ml-tile"><small>实战挥杆（有预测）</small><b>${sh.total}</b></div><div class="ml-tile"><small>与球杆判断一致</small><b>${pct(sh.agreeRate,1)}</b><span>${sh.agree} / ${sh.withWeak}</span></div><div class="ml-tile"><small>模型判为非挥杆</small><b>${sh.modelRejects}</b><span>可能是误触发</span></div><div class="ml-tile"><small>球手标记误触发</small><b>${sh.confirmedMisfires}</b></div></div>${sh.model?.total||sh.model?.ruleOnly||sh.model?.nearMiss?`<h4>模型识别实战</h4><div class="ml-tiles"><div class="ml-tile"><small>模型触发的挥杆</small><b>${sh.model.total}</b></div><div class="ml-tile"><small>规则也会触发</small><b>${pct(sh.model.total?sh.model.ruleAlso/sh.model.total:null,1)}</b><span>${sh.model.ruleAlso} / ${sh.model.total}</span></div><div class="ml-tile"><small>与球杆判断一致</small><b>${pct(sh.model.withWeak?sh.model.clubAgree/sh.model.withWeak:null,1)}</b><span>${sh.model.clubAgree} / ${sh.model.withWeak}</span></div><div class="ml-tile"><small>待定动作</small><b>${sh.model.ruleOnly+sh.model.nearMiss}</b><span>规则独有 ${sh.model.ruleOnly} · 差一点 ${sh.model.nearMiss}</span></div></div>`:''}<p class="ml-muted">待复核 ${sh.review} 条（含漏识别与待定动作）：在“数据集”页按状态筛选并改标，改标后会自动重建个人适配。</p>`;
 }
 renderDetector(){
  const s=this.state,r=s.readiness||{checks:[]},st=s.settings,model=st.detector==='model',effective=model&&r.available;$('ml-detector-toggle').checked=model;
  if(document.activeElement!==$('ml-threshold')){$('ml-threshold').value=Math.round((st.threshold||.7)*100);$('ml-threshold-value').textContent=Math.round((st.threshold||.7)*100)+'%';}
  $('ml-detector-card').dataset.mode=effective?'model':model?'fallback':'rule';
  $('ml-ready').innerHTML=`<p class="ml-ready-state">${effective?'● 正在使用模型识别':model?`○ 已开启，但${r.modelId?'当前模型是旧版，需要重新完整训练':'尚未部署模型'}；手机暂用规则识别`:'○ 正在使用规则识别'}</p><ul>${r.checks.map(c=>`<li class="${c.ok?'ok':'no'}"><i>${c.ok?'✓':'✗'}</i>${c.name}<span>${c.text||(Number.isFinite(c.value)?pct(c.value,1):'—')}</span></li>`).join('')}</ul>${r.recommended||!r.available?'':'<p class="ml-muted">未全部达标也可以开启；继续采集、在实战中改标，模型会越来越准。</p>'}`;
  const a=r.stream,b=r.rule;
  $('ml-stream-table').innerHTML=a||b?`<thead><tr><th>流式回放</th><th>准时识别</th><th>提前触发</th><th>漏识别</th><th>非挥杆误触发</th></tr></thead><tbody><tr><th>SwingNet</th><td>${pct(a?.onTimeRate,1)}</td><td>${pct(a?.earlyRate,1)}</td><td>${pct(a?.missRate,1)}</td><td>${pct(a?.falseTriggerRate,1)}</td></tr><tr><th>免校准规则</th><td>${pct(b?.onTimeRate,1)}</td><td>${pct(b?.earlyRate,1)}</td><td>${pct(b?.missRate,1)}</td><td>${pct(b?.falseTriggerRate,1)}</td></tr></tbody><caption>验证集 ${a?.swings??b?.swings??0} 次挥杆、${a?.others??b?.others??0} 次非挥杆动作</caption>`:'<caption>完整训练后显示流式回放结果。</caption>';
  $('ml-curve-table').innerHTML=r.curve?.length?`<thead><tr><th>触发置信度</th>${r.curve.map(c=>`<th class="${Math.abs(c.threshold-st.threshold)<.026?'cur':''}">${pct(c.threshold)}</th>`).join('')}</tr></thead><tbody><tr><th>准时识别</th>${r.curve.map(c=>`<td>${pct(c.onTimeRate)}</td>`).join('')}</tr><tr><th>误触发</th>${r.curve.map(c=>`<td>${pct(c.falseTriggerRate)}</td>`).join('')}</tr></tbody>`:'';
  $('ml-phones').innerHTML=s.phones?.length?s.phones.map(p=>`<div class="ml-phone"><div><b>手机 ${String(p.number??'?').padStart(2,'0')} · ${esc(p.name)}</b><small>${esc(p.deviceName||'设备名称未设置')}${p.grip?' · '+GRIPS[p.grip]:''}</small></div><span class="ml-chip ${p.detector==='model'?'ml-pred':''}">${p.detector?DETECTORS[p.detector]:'等待手机'}</span><small>${p.detector!=='model'&&p.reason?esc(p.reason)+' · ':''}${p.calibrated?(p.calibrationMode==='model'?'免校准就绪':'已引导校准'):p.motionReady?'体感已启用':'未启用体感'}</small></div>`).join(''):'<p class="ml-muted">没有已连接的手机。</p>';
 }
 drawLoss(history){const c=$('ml-loss'),ctx=c.getContext('2d'),W=c.width,H=c.height;ctx.clearRect(0,0,W,H);ctx.fillStyle='#f6faf3';ctx.fillRect(0,0,W,H);if(!history.length)return;const maxLoss=Math.max(...history.map(h=>h.loss),.1),n=Math.max(...history.map(h=>h.epoch)),x=e=>20+(e-1)/Math.max(1,n-1)*(W-40),y=v=>H-18-v*(H-36);
  ctx.strokeStyle='#12372a';ctx.lineWidth=2;ctx.beginPath();history.forEach((h,i)=>{const yy=y(h.loss/maxLoss);i?ctx.lineTo(x(h.epoch),yy):ctx.moveTo(x(h.epoch),yy);});ctx.stroke();
  const val=history.filter(h=>Number.isFinite(h.valF1));ctx.strokeStyle='#25a05a';ctx.fillStyle='#25a05a';ctx.beginPath();val.forEach((h,i)=>{i?ctx.lineTo(x(h.epoch),y(h.valF1)):ctx.moveTo(x(h.epoch),y(h.valF1));});ctx.stroke();val.forEach(h=>{ctx.beginPath();ctx.arc(x(h.epoch),y(h.valF1),3,0,7);ctx.fill();});
  ctx.fillStyle='#36574a';ctx.font='600 12px system-ui';ctx.fillText('— 训练损失（相对）   ● 验证 F1',20,14);}
}
