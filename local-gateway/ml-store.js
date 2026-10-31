// 本机机器学习数据集：index.json 保存可修改的元数据，raw-YYYYMM.jsonl 只追加原始录音；模型与个人适配单独保存。
import {readFile,writeFile,mkdir,rename,appendFile,readdir,unlink,stat} from 'node:fs/promises';
import {openSync,readSync,closeSync} from 'node:fs';
import path from 'node:path';
import {LABELS_VERSION,normalizeLabel,legacyPower} from '../shared/ml/labels.js';

// 标签迁移（0.20）：全挥杆 / 切杆 → 挥杆，轻中重 → 力度值；原标签保存在 legacy 字段，原 index.json 另存备份。
export function migrateSample(s){
 const label=s.label,needs=(label&&label!==normalizeLabel(label))||(s.tier!==undefined&&s.tier!==null&&!s.legacy);if(!needs&&!['full','partial'].includes(s.weak)&&!['full','partial'].includes(s.stream?.label)&&!['full','partial'].includes(s.prediction?.label))return false;
 if(needs){s.legacy={label,tier:s.tier??null};s.label=normalizeLabel(label);s.power=s.label==='other'||!s.label?null:legacyPower(label,s.tier);s.level=null;delete s.tier;}
 if(s.weak)s.weak=normalizeLabel(s.weak);if(s.stream?.label)s.stream.label=normalizeLabel(s.stream.label);
 if(s.prediction?.label){const old=s.prediction;const probs={};for(const [k,v] of Object.entries(old.probs||{})){const n=normalizeLabel(k);if(n)probs[n]=Math.round(((probs[n]||0)+v)*1000)/1000;}s.prediction={...old,label:normalizeLabel(old.label),labelName:{swing:'挥杆',putt:'推杆',other:'非挥杆动作'}[normalizeLabel(old.label)]||old.labelName,probs};}
 return true;
}

// 原始录音不再全部常驻内存（0.23）：启动时只记下每条录音在 raw-YYYYMM.jsonl 里的字节位置，
// 需要时按位置读取；最近用过的少量录音放在 LRU 缓存里；还没写入磁盘的新录音先留在内存里，写完再释放。
// 训练线程拿到的是“文件 + 位置”，自己去读，不再把整份数据集复制一遍发过去。
export function readRawRef(dir,ref,fds=null){
 const file=path.join(dir,ref.file),own=!fds;fds??=new Map();let fd=fds.get(file);if(fd===undefined){fd=openSync(file,'r');fds.set(file,fd);}
 try{const buf=Buffer.alloc(ref.length);readSync(fd,buf,0,ref.length,ref.offset);const line=JSON.parse(buf.toString('utf8'));return line.recording;}
 finally{if(own){for(const f of fds.values())closeSync(f);}}
}
export class RawRecordings {
 constructor(dir,{cache=64}={}){this.dir=dir;this.refs=new Map();this.pending=new Map();this.lru=new Map();this.limit=cache;this.sizes=new Map();}
 get size(){return this.refs.size+this.pending.size;}
 has(id){return this.refs.has(id)||this.pending.has(id);}
 ref(id){return this.refs.get(id)||null;}
 remember(id,rec){this.lru.delete(id);this.lru.set(id,rec);while(this.lru.size>this.limit)this.lru.delete(this.lru.keys().next().value);}
 get(id){
  if(this.pending.has(id))return this.pending.get(id);if(this.lru.has(id)){const v=this.lru.get(id);this.remember(id,v);return v;}
  const ref=this.refs.get(id);if(!ref)return undefined;try{const rec=readRawRef(this.dir,ref);this.remember(id,rec);return rec;}catch{return undefined;}
 }
 // 启动时扫描：只解析每行开头的编号（{"id":"…","recording":…}），记录字节位置，不保留录音内容。
 async index(name){
  const file=path.join(this.dir,name),buf=await readFile(file);let start=0;
  while(start<buf.length){let end=buf.indexOf(10,start);if(end<0)end=buf.length;const length=end-start;
   if(length>2){const head=buf.toString('utf8',start,Math.min(end,start+120)),m=head.match(/^\{"id":"([^"\\]{1,80})"/);let id=m?.[1];if(!id){try{id=JSON.parse(buf.toString('utf8',start,end)).id;}catch{}}if(id)this.refs.set(id,{file:name,offset:start,length});}
   start=end+1;}
  this.sizes.set(name,buf.length);
 }
 // 追加：写入完成前内容留在 pending；写入后只保留位置。
 async append(name,id,recording){
  const line=JSON.stringify({id,recording})+'\n',bytes=Buffer.byteLength(line);let offset=this.sizes.get(name);
  if(offset===undefined){try{offset=(await stat(path.join(this.dir,name))).size;}catch{offset=0;}}
  await appendFile(path.join(this.dir,name),line);this.sizes.set(name,offset+bytes);this.refs.set(id,{file:name,offset,length:bytes-1});this.pending.delete(id);this.remember(id,recording);
 }
}

export class MLStore {
 constructor(dir){this.dir=dir;this.index=[];this.raw=new RawRecordings(dir);this.models=[];this.current=null;this.profiles={};this.settings={shadow:true,autoTune:true};this.writing=Promise.resolve();this.loaded=false;}
 async load(){
  await mkdir(path.join(this.dir,'models'),{recursive:true});let original=null;
  try{original=await readFile(path.join(this.dir,'index.json'),'utf8');const data=JSON.parse(original);this.index=Array.isArray(data.samples)?data.samples:[];this.settings={...this.settings,...data.settings};this.current=data.current||null;}catch{}
  if((this.settings.labelsVersion||1)<LABELS_VERSION){let changed=0;for(const s of this.index)if(migrateSample(s))changed++;
   if(changed&&original){const backup=path.join(this.dir,'index.labels-v1.json');try{await readFile(backup);}catch{await writeFile(backup,original);}}
   this.settings.labelsVersion=LABELS_VERSION;this.migrated={count:changed,at:new Date().toISOString()};this.settings.migration=this.migrated;this.saveIndex();}
  try{this.profiles=JSON.parse(await readFile(path.join(this.dir,'profiles.json'),'utf8'))||{};}catch{}
  for(const name of (await readdir(this.dir)).filter(n=>/^raw-\d{6}\.jsonl$/.test(n)).sort()){
   await this.raw.index(name);
  }
  for(const name of (await readdir(path.join(this.dir,'models'))).filter(n=>/^model-[\w-]+\.json$/.test(n))){try{const m=JSON.parse(await readFile(path.join(this.dir,'models',name),'utf8'));this.models.push(m);}catch{}}
  this.models.sort((a,b)=>String(a.trainedAt).localeCompare(String(b.trainedAt)));this.loaded=true;return this;
 }
 queue(task){this.writing=this.writing.then(task).catch(e=>console.error('无法保存机器学习数据：',e.message));return this.writing;}
 async atomic(name,value){const file=path.join(this.dir,name),tmp=file+'.tmp';await writeFile(tmp,JSON.stringify(value));await rename(tmp,file);}
 saveIndex(){clearTimeout(this.indexTimer);this.indexTimer=setTimeout(()=>this.queue(()=>this.atomic('index.json',{version:1,settings:this.settings,current:this.current,samples:this.index})),300);}
 saveProfiles(){clearTimeout(this.profileTimer);this.profileTimer=setTimeout(()=>this.queue(()=>this.atomic('profiles.json',this.profiles)),300);}
 flush(){clearTimeout(this.indexTimer);clearTimeout(this.profileTimer);return this.queue(async()=>{await this.atomic('index.json',{version:1,settings:this.settings,current:this.current,samples:this.index});await this.atomic('profiles.json',this.profiles);});}
 add(meta,recording){
  if(this.raw.has(meta.id))throw Error('这条录音已经保存。');const month=meta.time.slice(0,7).replace('-','');meta.rawFile=`raw-${month}.jsonl`;
  this.index.push(meta);this.raw.pending.set(meta.id,recording);this.queue(()=>this.raw.append(meta.rawFile,meta.id,recording));this.saveIndex();return meta;
 }
 get(id){return this.index.find(s=>s.id===id&&!s.deleted)||null;}
 update(id,patch){const s=this.get(id);if(!s)throw Error('未找到这条样本。');Object.assign(s,patch,{updatedAt:new Date().toISOString()});this.saveIndex();return s;}
 remove(id){const s=this.get(id);if(!s)return null;s.deleted=true;s.updatedAt=new Date().toISOString();this.saveIndex();return s;}
 active(){return this.index.filter(s=>!s.deleted);}
 // 训练用样本：人工标注（权重 1）与被接受的伪标签（按记录权重）。
 // 已写盘的录音只传位置（ref），训练线程自己读；还在写入队列里的新录音直接带内容。
 trainingSamples({includeUnlabeled=false,filter=null}={}){return this.active().filter(s=>this.raw.has(s.id)&&(includeUnlabeled||s.label)&&(!filter||filter(s))).map(s=>{const ref=this.raw.ref(s.id);return {id:s.id,label:s.label,power:s.power??null,level:s.level??null,pose:s.pose||null,legacy:s.legacy||null,kin:s.kin||null,profile:s.profile,session:s.sessionId||s.time.slice(0,10),source:s.source,weight:s.status==='pseudo'?(s.weight||.5):1,time:s.time,ruleAxis:s.ruleAxis,...(ref?{ref}:{recording:this.raw.get(s.id)})};});}
 async saveModel(model){this.models.push(model);this.models.sort((a,b)=>String(a.trainedAt).localeCompare(String(b.trainedAt)));await this.queue(()=>this.atomic(path.join('models',`model-${model.id}.json`),model));
  // 只保留最近 8 个模型与当前部署的模型。
  const keep=new Set([...this.models.slice(-8).map(m=>m.id),this.current]);for(const m of this.models.filter(m=>!keep.has(m.id))){this.queue(()=>unlink(path.join(this.dir,'models',`model-${m.id}.json`)).catch(()=>{}));}this.models=this.models.filter(m=>keep.has(m.id));}
 model(id=this.current){return this.models.find(m=>m.id===id)||null;}
 setCurrent(id){if(id&&!this.model(id))throw Error('未找到这个模型。');this.current=id;this.saveIndex();}
 exportAll(){return {format:'swinglink-ml-dataset-v1',exportedAt:new Date().toISOString(),samples:this.active().map(s=>({...s,recording:this.raw.get(s.id)||null}))};}
}
