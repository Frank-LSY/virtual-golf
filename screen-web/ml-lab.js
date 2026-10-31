// 练习室“动作采集 / 数据集 / 模型训练”页（0.23 起电脑只做展示）：
// 采集、个性化都在手机上发起；电脑显示进度、每位球手的个性化状态、模型表现，训练只保留一个“完整训练”按钮（100 轮）。
import {CLASSES,CLASS_NAMES,LEVELS,LEVEL_NAMES,LEVEL_CUES,POSES,SOURCES,TARGETS,LEVEL_TARGETS,DETECTORS,levelText} from '../shared/ml/labels.js';
import {motionSVG,gripSVG,GRIP_TIPS,GRIPS,MOTION_TIPS} from '../shared/ml/illustrations.js';
const $=id=>document.getElementById(id);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);
const pct=(v,d=0)=>Number.isFinite(v)?(v*100).toFixed(d)+'%':'—';
const LABEL_TIPS={swing:'按上杆高度分 5 档力度：膝 / 腰 / 胸 / 肩 / 完整',putt:'按后摆长度分 5 档：10–60 厘米',other:'拿起、放下、晃动、走动'};
const LEGACY_NAMES={full:'全挥杆',partial:'切杆',putt:'推杆',other:'非挥杆'},TIER_OLD={light:'轻',mid:'中',heavy:'重'};
const className=c=>CLASS_NAMES[c]||LEGACY_NAMES[c]||c;
const powerText=s=>s.level?LEVEL_NAMES[s.level]:Number.isFinite(s.power)?`${Math.round(s.power*100)}%`:'';
const STATUS={labeled:'已标注',pseudo:'伪标签',review:'待复核',unlabeled:'未标注'};
const REASON={rule:'规则触发、模型未触发',near:'模型差一点触发'};
const PHONE_STATE={settle:'手机：保持静止',ready:'手机：请挥杆',recording:'手机：录制中…',saving:'手机：上传中',off:'手机：未启用体感',review:'手机：等待确认',paused:'手机：已暂停'};
const COLORS={swing:'#25a05a',putt:'#e9a400',other:'#9db0a5'};
function sparkSvg(values,color='#25a05a',w=160,h=44){if(!values?.length)return '';const max=Math.max(60,...values),pts=values.map((v,i)=>`${(i/(values.length-1)*w).toFixed(1)},${(h-2-(v/max)*(h-6)).toFixed(1)}`).join(' ');return `<svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-hidden="true"><polyline points="0,${h} ${pts} ${w},${h}" fill="${color}22" stroke="none"/><polyline points="${pts}" fill="none" stroke="${color}" stroke-width="2" stroke-linejoin="round"/></svg>`;}
function curveSvg(curve,w=120,h=64){if(!curve?.length)return '<span class="ml-muted">数据不足</span>';const xs=curve.map(p=>p[0]),min=Math.min(...xs),max=Math.max(...xs),span=max-min||1,pts=curve.map(([x,y])=>`${((x-min)/span*(w-8)+4).toFixed(1)},${(h-4-y*(h-8)).toFixed(1)}`).join(' ');return `<svg viewBox="0 0 ${w} ${h}" class="ml-curve"><line x1="4" y1="${h-4}" x2="${w-4}" y2="${h-4}"/><polyline points="${pts}"/>${curve.map(([x,y])=>`<circle cx="${((x-min)/span*(w-8)+4).toFixed(1)}" cy="${(h-4-y*(h-8)).toFixed(1)}" r="2.6"/>`).join('')}</svg>`;}
const PERSONAL_NAMES={ready:'已个性化',power:'已个性化（力度）',queued:'排队中',training:'训练中',waiting:'等待共享模型',stale:'模型已更新 · 待重新个性化',failed:'未完成','no-model':'还没有共享模型',none:'未个性化'};
const JOB_NAMES={full:'完整训练',adapt:'个人迁移',rebuild:'重建个人映射',transfer:'留一人评估',head:'在线微调'};
const STAGES={prepare:'准备数据',train:'训练中',stream:'评估流式识别',final:'用全部数据收尾',profiles:'重建个人映射',adapt:'个人迁移',transfer:'留一人评估'};
const timeText=t=>t?new Date(t).toLocaleString('zh-CN',{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'}):'';

export class MLLab {
 constructor(root,conn,{toast}){
  this.root=root;this.conn=conn;this.toast=toast;this.tab='practice';this.state=null;this.filters={};this.list={samples:[],total:0};this.detail=null;this.active=false;this.level=0;
  const owner=root.querySelector('.training-owner');
  owner.insertAdjacentHTML('beforeend',`<div class="lab-detector" id="lab-detector" data-mode="rule"><span class="lab-detector-label">挥杆识别</span><b id="lab-det-text">连接中…</b><small id="lab-det-note"></small></div>`);
  owner.insertAdjacentHTML('afterend',`<nav class="lab-tabs" role="tablist" aria-label="练习室页面">${[['practice','击球练习'],['collect','动作采集'],['dataset','数据集'],['model','模型训练']].map(([id,name])=>`<button role="tab" data-lab-tab="${id}" aria-selected="${id==='practice'}">${name}</button>`).join('')}<span class="lab-tabs-note" id="ml-tab-note"></span></nav>
   <section class="ml-lab" id="ml-lab" hidden>
    <div class="ml-pane" data-pane="collect">
     <div class="ml-grid ml-grid-collect">
      <section class="ml-card ml-howto"><h3>在手机上操作</h3><p class="ml-muted">新手机连上并启用体感后，会问一次要不要录 5 次挥杆（最少 3 次）做个性化，录完自动训练。也可以在手机“更多设置”里重做个性化或录入更多训练数据。电脑这里只显示进度。</p>
       <h4>每位球手</h4><div id="ml-players" class="ml-players"></div></section>
      <section class="ml-card ml-live"><div class="ml-live-head"><h3 id="ml-live-title">等待手机开始</h3><span class="ml-counter" id="ml-live-count"></span></div>
       <div class="ml-prompt" id="ml-live-prompt"><div class="ml-live-demo" id="ml-live-demo" aria-hidden="true"></div><b id="ml-live-label">手机上开始录入后，这里同步显示</b><span id="ml-live-tier"></span><p id="ml-live-hint"></p></div>
       <div class="ml-progress"><i id="ml-live-progress"></i></div>
       <div class="ml-phone-state"><span id="ml-phone-state">手机：—</span><div class="ml-meter"><i id="ml-meter"></i></div></div>
       <p class="ml-review-note" id="ml-review-note" hidden></p>
       <p class="ml-session-stats" id="ml-session-stats"></p>
       <div class="ml-sessions" id="ml-sessions"></div>
       <canvas id="ml-wave" class="ml-wave" width="640" height="220" aria-label="最近一条录音的三轴角速度"></canvas>
       <div class="ml-chips" id="ml-last-chips"></div>
      </section>
     </div>
    </div>
    <div class="ml-pane" data-pane="dataset">
     <div class="ml-filters"><select id="ml-f-profile"><option value="">全部球手</option></select><select id="ml-f-label"><option value="">全部标签</option>${CLASSES.map(c=>`<option value="${c}">${CLASS_NAMES[c]}</option>`).join('')}<option value="none">未标注</option></select><select id="ml-f-source"><option value="">全部来源</option>${Object.entries(SOURCES).map(([k,v])=>`<option value="${k}">${v}</option>`).join('')}</select><select id="ml-f-status"><option value="">全部状态</option>${Object.entries(STATUS).map(([k,v])=>`<option value="${k}">${v}</option>`).join('')}</select><span id="ml-list-total" class="ml-muted"></span><button class="secondary" id="ml-export">导出数据集 ↓</button></div>
     <div class="ml-detail" id="ml-detail" hidden><canvas id="ml-detail-wave" width="900" height="240"></canvas><div id="ml-detail-meta" class="ml-chips"></div></div>
     <div class="ml-samples" id="ml-samples"></div><button class="secondary ml-more" id="ml-more" hidden>加载更多</button>
    </div>
    <div class="ml-pane" data-pane="model">
     <div class="ml-grid ml-grid-model">
      <section class="ml-card ml-model-card"><h3>当前模型 <small id="ml-metric-model"></small></h3><p class="ml-muted" id="ml-model-status"></p><div class="ml-tiles" id="ml-tiles"></div>
       <h4>触发置信度 <small id="ml-threshold-note"></small></h4><p class="ml-muted" id="ml-curve-caption"></p><div class="ml-curve-wrap"><table class="ml-th-table" id="ml-curve-table"></table></div></section>
      <section class="ml-card ml-train-card"><h3>训练</h3><p class="ml-muted" id="ml-train-summary"></p>
       <div class="ml-train-actions"><button class="primary" id="ml-train">完整训练 →</button><button class="secondary" id="ml-cancel" hidden>取消</button></div>
       <div class="ml-job"><div class="ml-progress"><i id="ml-job-progress"></i></div><p id="ml-job-text" class="ml-muted">尚未训练</p></div></section>
      <section class="ml-card ml-personal-card"><h3>每位球手的个性化</h3><p class="ml-muted">共享一个识别模型，每位球手（人 × 手机）只多存一个约 12 KB 的个人输出头。完整训练后会自动为大家重新个性化。</p><div id="ml-personal-list" class="ml-players"></div></section>
     </div>
    </div>
   </section>`);
  this.bind();
  conn.addEventListener('message',({detail:m})=>this.message(m));conn.addEventListener('offline',()=>{this.state=null;this.render();});
 }
 send(m){if(!this.conn.send(m))this.toast('正在重新连接本地游戏服务。');}
 bind(){
  this.root.querySelectorAll('[data-lab-tab]').forEach(b=>b.onclick=()=>this.setTab(b.dataset.labTab));
  for(const id of ['ml-f-profile','ml-f-label','ml-f-source','ml-f-status'])$(id).onchange=()=>{this.filters={profile:$('ml-f-profile').value,label:$('ml-f-label').value,source:$('ml-f-source').value,status:$('ml-f-status').value};this.requestList(0);};
  $('ml-more').onclick=()=>this.requestList(this.list.samples.length,true);
  $('ml-export').onclick=()=>this.send({type:'ml_export'});
  $('ml-train').onclick=()=>this.send({type:'ml_train',kind:'full'});$('ml-cancel').onclick=()=>this.send({type:'ml_cancel'});
  $('ml-samples').addEventListener('change',e=>{const card=e.target.closest('[data-sample]');if(!card)return;if(e.target.matches('[data-edit=label]'))this.send({type:'ml_update',id:card.dataset.sample,label:e.target.value||null});if(e.target.matches('[data-edit=level]'))this.send({type:'ml_update',id:card.dataset.sample,level:e.target.value?Number(e.target.value):null});});
  $('ml-samples').addEventListener('click',e=>{const card=e.target.closest('[data-sample]');if(!card)return;if(e.target.matches('[data-delete]')){this.send({type:'ml_update',id:card.dataset.sample,deleted:true});card.remove();return;}if(!e.target.matches('select,option'))this.send({type:'ml_detail',id:card.dataset.sample});});
 }
 show(active){this.active=active;this.conn.send({type:'ml_view',active});if(!active)this.setTab('practice',false);else this.render();}
 setTab(tab,request=true){this.tab=tab;this.root.dataset.labTab=tab;this.root.querySelectorAll('[data-lab-tab]').forEach(b=>b.setAttribute('aria-selected',String(b.dataset.labTab===tab)));$('ml-lab').hidden=tab==='practice';this.root.querySelectorAll('.ml-pane').forEach(p=>p.hidden=p.dataset.pane!==tab);if(tab==='practice')window.dispatchEvent(new Event('resize'));if(request&&tab==='dataset')this.requestList(0);this.render();}
 requestList(offset,append=false){this.appendList=append;this.send({type:'ml_list',offset,limit:48,...this.filters});}
 message(m){
  if(m.type==='ready'&&this.active)this.conn.send({type:'ml_view',active:true});
  if(m.type==='ml_state'){this.state=m;const sid=m.session&&!m.session.done?m.session.id:null;if(sid&&sid!==this.sessionId&&this.active&&this.tab==='practice'){this.toast(`${m.session.person} 正在手机上${{adapt:'做个性化',motion:'做动作采样'}[m.session.mode]||'录入训练数据'}，可在“动作采集”页查看进度。`);}this.sessionId=sid;const last=m.recent.find(s=>['collect','adapt','motion'].includes(s.source));if(last&&last.id!==this.lastId){this.lastId=last.id;if(this.tab==='collect')this.send({type:'ml_detail',id:last.id});}this.render();}
  if(m.type==='ml_list'){this.list=this.appendList?{total:m.total,samples:[...this.list.samples,...m.samples]}:m;this.renderList();}
  if(m.type==='ml_detail'){this.detail=m;if(this.tab==='collect')this.drawWave($('ml-wave'),m,true);else{$('ml-detail').hidden=false;this.drawWave($('ml-detail-wave'),m,false);$('ml-detail-meta').innerHTML=this.chips(m.sample,true);}}
  if(m.type==='ml_export'){const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([JSON.stringify(m.data)],{type:'application/json'}));a.download=`挥杆之间-机器学习数据集-${new Date().toISOString().slice(0,10)}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1500);this.toast(`已导出 ${m.data.samples.length} 条样本。`);}
  if(m.type==='sensor_sample'&&this.tab==='collect'){const t=m.sample,w=Math.hypot(t.alpha||0,t.beta||0,t.gamma||0);this.level=w;$('ml-meter').style.width=Math.min(100,w/8)+'%';}
 }
 demo(label,level,pose=null){const grip=this.state?.phone?.grip||'vertical',key=label+'|'+level+'|'+pose+'|'+grip;if(this.demoKey===key)return;this.demoKey=key;$('ml-live-demo').innerHTML=label?motionSVG(label,level||3,{grip,pose}):'';}
 // 顶部只读状态：电脑不再切换识别方式（在手机“更多设置”里切换）。
 renderIndicator(){
  const s=this.state,st=s.settings,r=s.readiness||{},model=st.detector==='model',effective=model&&r.available;
  $('lab-detector').dataset.mode=effective?'model':model?'fallback':'rule';$('lab-det-text').textContent=effective?'模式识别':'免校准规则';
  $('lab-det-note').textContent=effective?`触发置信度 ${pct(st.threshold)}${st.thresholdMode==='manual'?'（手动）':'（按验证结果自动选择）'}`:model?(r.modelId?'当前模型需重新完整训练':'还没有训练模型'):'已在手机上选择规则识别';
 }
 render(){
  const s=this.state;$('ml-tab-note').textContent=s?`${s.totals.samples} 条样本 · ${s.totals.labeled} 条已标注${s.current?' · 模型已部署':''}`:'连接中…';
  if(!s||!this.active)return;this.renderIndicator();this.renderCollect();this.renderProfilesFilter();if(this.tab==='model')this.renderModel();
 }
 // 已录过数据的球手 + 在线但还没录过的手机（也显示出来，方便看到谁还没个性化）。
 playerRows(profiles,{compact=false}={}){
  const known=new Set(profiles.map(p=>p.key)),fresh=(this.state?.phones||[]).filter(p=>p.key&&!known.has(p.key)).map(p=>({key:p.key,person:p.name,deviceName:p.deviceName,phone:p.number,connected:true,lastAt:'',personal:p.personal}));
  const list=[...profiles,...fresh].sort((a,b)=>(b.connected-a.connected)||String(b.lastAt).localeCompare(String(a.lastAt)));
  return list.length?list.map(p=>{const st=p.personal||{status:'none'},m=st.metrics,gain=m?.before?.own!=null&&m?.after?.own!=null?`本人挥杆置信度 ${pct(m.before.own)} → ${pct(m.after.own)}`:'';
   return `<div class="ml-player" data-status="${st.status}"><div><b>${esc(p.person)}</b><small>${esc(p.deviceName||'')} · 手机 ${p.phone??'?'}${p.connected?' · 在线':''}</small></div><span class="ml-chip st-${st.status}">${PERSONAL_NAMES[st.status]||st.status}</span>${compact?'':`<small class="ml-player-detail">${st.trainedAt?`${timeText(st.trainedAt)} · 用了 ${st.samples} 条本人样本`:st.adaptSamples?`已录 ${st.adaptSamples} 次个性化挥杆`:p.total?`已有 ${p.total} 条训练数据（已用于共享模型）`:'尚未录入'}${gain?' · '+gain:''}${st.reason?' · '+esc(st.reason):''}</small>`}</div>`;}).join(''):'<p class="ml-empty">还没有球手录入数据。</p>';
 }
 renderCollect(){
  const s=this.state,trial=s.session&&!s.session.done?s.session:null;
  $('ml-players').innerHTML=this.playerRows(s.profiles,{compact:true});
  const review=trial&&s.phoneState==='review';$('ml-review-note').hidden=!review;if(review)$('ml-review-note').textContent=`这次不太像“${trial.labelName}”：${s.phoneReason||'请在手机上确认'}。`;
  const st=trial?.stats||s.lastSummary;$('ml-session-stats').textContent=st?`${trial?'本组':'上一组'}：已保存 ${st.saved||0} · 丢弃 ${st.discarded||0} · 跳过 ${st.skipped||0}`:'';
  if(trial){const hold=trial.pose&&trial.pose!=='finish';this.demo(trial.label,trial.level,trial.pose);$('ml-live-title').textContent=`${{adapt:'个性化',motion:'动作采样'}[trial.mode]||'录入训练数据'} · ${trial.person}`;$('ml-live-count').textContent=`${trial.index+1} / ${trial.count}`;$('ml-live-label').textContent=trial.labelName;$('ml-live-tier').textContent=hold?'停住 1 秒':trial.levelText||'自然动作';$('ml-live-tier').dataset.tier=hold?'pose':trial.level?`l${trial.level}`:'none';$('ml-live-hint').textContent=trial.mode==='adapt'?`至少录 ${trial.min} 次就可以在手机上点“完成”开始训练。`:trial.prompt||(hold?MOTION_TIPS.pose:MOTION_TIPS[trial.label])||LABEL_TIPS[trial.label];$('ml-live-progress').style.width=trial.index/trial.count*100+'%';$('ml-phone-state').textContent=trial.paused?'手机：已暂停':PHONE_STATE[s.phoneState]||'手机：等待提示';}
  else{this.demo(null);$('ml-live-title').textContent='等待手机开始';$('ml-live-count').textContent='';$('ml-live-label').textContent='手机上开始录入后，这里同步显示';$('ml-live-tier').textContent='';$('ml-live-tier').dataset.tier='none';$('ml-live-hint').textContent='';$('ml-live-progress').style.width='0';$('ml-phone-state').textContent='手机：—';}
  const others=(s.sessions||[]).filter(x=>x.id!==trial?.id);$('ml-sessions').innerHTML=others.length?`<p class="ml-muted">其他手机：</p>${others.map(x=>`<span class="ml-chip">${esc(x.person)} · ${{adapt:'个性化',motion:'动作采样'}[x.mode]||'录入'} ${Math.min(x.index+1,x.count)} / ${x.count}</span>`).join('')}`:'';
 }
 renderProfilesFilter(){const s=this.state,profiles=$('ml-f-profile'),value=profiles.value;profiles.innerHTML='<option value="">全部球手与设备</option>'+s.profiles.map(q=>`<option value="${esc(q.key)}">${esc(q.person)} · ${esc(q.deviceName||'手机 '+(q.phone??'?'))}</option>`).join('');profiles.value=value;}
 renderModel(){
  const s=this.state,job=s.job,current=s.models.find(m=>m.current),v=current?.metrics?.validation,r=s.readiness||{},st=r.stream,curve=r.curve||[],choice=r.choice,threshold=s.settings.threshold;
  $('ml-metric-model').textContent=current?`训练于 ${timeText(current.trainedAt)} · ${current.samples} 条样本`:'';
  $('ml-model-status').textContent=!current?'还没有模型：先在手机上录入数据（至少 12 条、两类以上），再点“完整训练”。':r.legacy||!current.stream?'当前模型是旧版，请重新完整训练。':s.settings.detector==='model'?'手机正在用这个模型识别挥杆。':'手机目前选择了规则识别（可在手机“更多设置”里切换）。';
  const tile=(name,val,goal,lower)=>`<div class="ml-tile ${Number.isFinite(val)?(lower?val<=goal:val>=goal)?'ok':'warn':''}"><small>${name}</small><b>${pct(val,0)}</b><span>目标 ${lower?'≤':'≥'} ${pct(goal)}</span></div>`;
  $('ml-tiles').innerHTML=current?[tile('识别准确（宏平均 F1）',v?.macroF1,.85),tile('准时识别',st?.onTimeRate,.85),tile('误触发',st?.falseTriggerRate,.1,true),tile('力度误差',v?.powerError,.12,true)].join(''):'';
  $('ml-threshold-note').textContent=Number.isFinite(threshold)?`当前 ${pct(threshold)}${s.settings.thresholdMode==='manual'?' · 手动':' · 自动'}`:'';
  $('ml-curve-caption').textContent=curve.length?`验证集 ${curve[0].swings} 次挥杆、${curve[0].others} 次非挥杆动作。${choice?.auto?`按“准时识别 − 误触发”自动选择 ${pct(choice.threshold)}${choice.candidates?.length>1?`（${choice.candidates.map(t=>pct(t)).join('、')} 相差不到一条样本，取中间档）`:''}。`:choice?`验证集里没有非挥杆动作，无法估计误触发，暂用默认 ${pct(choice.threshold)}。`:''}`:'完整训练后显示各触发置信度下的准时识别与误触发。';
  const cur=t=>Math.abs(t-threshold)<.026?'cur':'';
  $('ml-curve-table').innerHTML=curve.length?`<thead><tr><th>触发置信度</th>${curve.map(c=>`<th class="${cur(c.threshold)}">${pct(c.threshold)}</th>`).join('')}</tr></thead><tbody><tr><th>准时识别</th>${curve.map(c=>`<td class="${cur(c.threshold)}">${pct(c.onTimeRate)}</td>`).join('')}</tr><tr><th>误触发</th>${curve.map(c=>`<td class="${cur(c.threshold)}">${pct(c.falseTriggerRate)}</td>`).join('')}</tr><tr><th>准时 − 误触发</th>${curve.map(c=>`<td class="${cur(c.threshold)}">${Number.isFinite(c.onTimeRate)&&Number.isFinite(c.falseTriggerRate)?Math.round((c.onTimeRate-c.falseTriggerRate)*100):'—'}</td>`).join('')}</tr></tbody>`:'';
  const counts=CLASSES.map(c=>s.profiles.reduce((n,p)=>n+p.counts[c].total,0)),running=job&&!job.finished,fullRunning=running&&job.kind==='full';
  $('ml-train-summary').textContent=`已标注 ${s.totals.labeled} 条（${CLASSES.map((c,i)=>`${CLASS_NAMES[c]} ${counts[i]}`).join('、')}）。完整训练固定 ${s.fullEpochs||100} 轮，训练完自动部署、自动选择触发置信度，并为每位球手重新个性化。${s.online?.suggestFull?' 新增标注已超过上次训练的 30%，建议重新训练。':''}`;
  $('ml-train').disabled=fullRunning||s.totals.labeled<12||(s.queue||[]).some(q=>q.kind==='full');$('ml-cancel').hidden=!running;
  $('ml-job-progress').style.width=(job?job.progress*100:0)+'%';
  const who=job?.key?` · ${esc(job.key.split('|')[1]||job.key)}`:'',queued=(s.queue||[]).length;
  $('ml-job-text').textContent=!job?'尚未训练':job.error?`${JOB_NAMES[job.kind]||'训练'}未完成：${job.error}`:running?`${JOB_NAMES[job.kind]||'训练'}${who} · ${STAGES[job.stage]||job.stage}${job.epoch?` · 第 ${job.epoch} 轮`:''} · ${Math.round(job.progress*100)}%${queued?` · 还有 ${queued} 个任务排队`:''}`:`${JOB_NAMES[job.kind]||'训练'}${who}已完成${job.kind==='adapt'?(job.accepted?' · 已启用个人头':' · 只做了力度映射'):job.deployed?' · 已部署':''}${queued?` · 还有 ${queued} 个任务排队`:''}`;
  $('ml-personal-list').innerHTML=this.playerRows(s.profiles);
 }
 chips(sample,full=false){if(!sample)return '';const p=sample.prediction,parts=[`<span class="ml-chip src-${sample.source}">${SOURCES[sample.source]||sample.source}</span>`];if(sample.label)parts.push(`<span class="ml-chip" style="background:${COLORS[sample.label]}22;color:${COLORS[sample.label]}">${sample.pose?POSES[sample.pose]?.name||CLASS_NAMES[sample.label]:CLASS_NAMES[sample.label]}${powerText(sample)?` · ${powerText(sample)}`:''}${sample.legacy?` · 旧：${LEGACY_NAMES[sample.legacy.label]||''}${TIER_OLD[sample.legacy.tier]||''}`:''}</span>`);if(sample.kin&&(sample.kin.top||sample.kin.hold))parts.push(`<span class="ml-chip">${sample.pose&&sample.pose!=='finish'?`停在 ${Math.round(sample.kin.hold||0)}°`:`上杆 ${Math.round(sample.kin.top)}° · 送杆 ${Math.round(sample.kin.finish||0)}°`}</span>`);parts.push(`<span class="ml-chip">${esc(sample.person)} · ${esc(sample.deviceName||'')} · ${sample.grip?GRIPS[sample.grip]:'握法未记录'}</span>`);if(sample.detector)parts.push(`<span class="ml-chip">${DETECTORS[sample.detector]}${sample.stream?.label?` · ${className(sample.stream.label)} ${pct(sample.stream.confidence)}`:''}${sample.stream?.reason?` · ${REASON[sample.stream.reason]||''}`:''}</span>`);parts.push(`<span class="ml-chip">${(sample.duration/1000).toFixed(1)} 秒 · 峰值 ${sample.peak}°/s · ${Math.round(sample.hz)} 次/秒</span>`);if(p)parts.push(`<span class="ml-chip ml-pred">模型：${p.labelName} ${pct(p.confidence)}${p.power!==null?` · 力度 ${pct(p.power)}`:''}</span>`);if(sample.rule&&full)parts.push(`<span class="ml-chip">规则：力度 ${pct(sample.rule.power)} · 峰值 ${Math.round(sample.rule.peak||0)}</span>`);if(sample.context?.clubId&&full)parts.push(`<span class="ml-chip">球杆：${esc(sample.context.clubId)}</span>`);if(sample.feedback)parts.push(`<span class="ml-chip warn">${esc(sample.feedback)}</span>`);return parts.join('');}
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
   <div class="ml-sample-row"><select data-edit="label" aria-label="标签"><option value="">未标注</option>${CLASSES.map(c=>`<option value="${c}" ${s.label===c?'selected':''}>${CLASS_NAMES[c]}</option>`).join('')}</select><select data-edit="level" aria-label="力度档位" ${!s.label||s.label==='other'?'disabled':''}><option value="">${!s.level&&Number.isFinite(s.power)?`${Math.round(s.power*100)}%（旧）`:'—'}</option>${LEVELS.map(l=>`<option value="${l}" ${s.level===l?'selected':''}>${LEVEL_NAMES[l]}</option>`).join('')}</select><button data-delete title="删除这条样本">×</button></div>
   <p class="ml-sample-meta">${SOURCES[s.source]||s.source} · ${esc(s.person)} · ${esc(s.deviceName||'')}${s.grip?' · '+GRIPS[s.grip]:''} · ${new Date(s.time).toLocaleString('zh-CN',{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'})} · <b>${STATUS[s.status]||s.status}</b></p>
   ${s.pose?`<p class="ml-sample-pred">动作采样：${POSES[s.pose]?.name||s.pose}${s.kin?` · ${s.pose==='finish'?`收杆 ${Math.round(s.kin.finish||0)}°`:`停在 ${Math.round(s.kin.hold||0)}°`}`:''}</p>`:s.kin?.top?`<p class="ml-sample-pred">上杆 ${Math.round(s.kin.top)}°${s.kin.backswingMs?` · 上杆 ${s.kin.backswingMs} 毫秒`:''}${s.kin.downswingMs?` / 下挥 ${s.kin.downswingMs} 毫秒`:''}</p>`:''}${s.prediction?`<p class="ml-sample-pred">模型：${s.prediction.labelName} ${pct(s.prediction.confidence)}${s.prediction.power!==null?` · 力度 ${pct(s.prediction.power)}`:''}</p>`:''}${s.weak?`<p class="ml-sample-pred">球杆提示：${className(s.weak)}</p>`:''}${s.source==='candidate'?`<p class="ml-sample-pred warn">${REASON[s.stream?.reason]||'待定'}${s.stream?.label?` · 模型 ${className(s.stream.label)} ${pct(s.stream.confidence)}`:''}</p>`:s.detector==='model'&&s.stream?`<p class="ml-sample-pred">模型识别触发 · ${className(s.stream.label)} ${pct(s.stream.confidence)} · 力量 ${pct(s.stream.power)}</p>`:''}${s.feedback?`<p class="ml-sample-pred warn">${esc(s.feedback)}</p>`:''}</article>`).join('')||'<p class="ml-empty">没有符合条件的样本。</p>';
 }
}
