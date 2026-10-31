// 个人输出头存储（0.23）：adapters/index.json 只记元数据（属于哪个共享模型、训练时间、样本数、是否启用、效果），
// 每个人的头参数单独成文件（约 12 KB）。内存里最多缓存 limit 个（LRU）：只有连接着的手机、正在入库或训练的人会用到，
// 来过很多人也不会让内存一直涨。共享模型换了（重新完整训练）之后，旧头自动视为过期。
import {readFile,writeFile,mkdir,rename,unlink} from 'node:fs/promises';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {deserializeHead} from '../shared/ml/personal.js';

export class AdapterStore {
 constructor(dir,{limit=24}={}){this.dir=path.join(dir,'adapters');this.meta={};this.cache=new Map();this.limit=limit;this.writing=Promise.resolve();}
 async load(){await mkdir(this.dir,{recursive:true});try{this.meta=JSON.parse(await readFile(path.join(this.dir,'index.json'),'utf8'))||{};}catch{this.meta={};}return this;}
 queue(task){this.writing=this.writing.then(task).catch(e=>console.error('无法保存个人模型：',e.message));return this.writing;}
 file(key){return `a-${createHash('sha1').update(String(key)).digest('hex').slice(0,16)}.json`;}
 info(key){return this.meta[key]||null;}
 keys(){return Object.keys(this.meta);}
 // 可用：属于当前共享模型、通过了安全检查、并且确实有个人头参数。
 valid(key,modelId){const m=this.meta[key];return !!m&&!!modelId&&m.modelId===modelId&&m.accepted&&!!m.file;}
 touch(key,entry){this.cache.delete(key);this.cache.set(key,entry);while(this.cache.size>this.limit)this.cache.delete(this.cache.keys().next().value);return entry;}
 entry(key){
  if(this.cache.has(key))return this.touch(key,this.cache.get(key));const m=this.meta[key];if(!m?.file)return null;
  try{const data=JSON.parse(readFileSync(path.join(this.dir,m.file),'utf8'));if(data.key!==key||data.modelId!==m.modelId)return null;return this.touch(key,{serialized:data.head,parsed:null,modelId:data.modelId});}catch{return null;}
 }
 // 序列化的个人头（下发给手机）。
 serialized(key,modelId){if(!this.valid(key,modelId))return null;const e=this.entry(key);return e?.modelId===modelId?e.serialized:null;}
 // 解析后的个人头（服务器推理用）；base 用于核对尺寸。
 head(key,base){if(!base||!this.valid(key,base.id))return null;const e=this.entry(key);if(!e||e.modelId!==base.id)return null;if(!e.parsed){try{e.parsed=deserializeHead(e.serialized,base);}catch{return null;}}return e.parsed;}
 save(key,{modelId,head=null,accepted=false,metrics=null,samples=0,reason=null,person=null,deviceId=null}){
  const old=this.meta[key],file=head?this.file(key):null,meta={key,modelId,file,accepted:!!head&&!!accepted,metrics,samples,reason,person,deviceId,trainedAt:new Date().toISOString(),version:(old?.version||0)+1};
  this.meta[key]=meta;this.cache.delete(key);if(head)this.touch(key,{serialized:head,parsed:null,modelId});
  const index={...this.meta};return this.queue(async()=>{
   if(head){const target=path.join(this.dir,file),tmp=target+'.tmp';await writeFile(tmp,JSON.stringify({key,modelId,head}));await rename(tmp,target);}
   else if(old?.file){await unlink(path.join(this.dir,old.file)).catch(()=>{});}
   const target=path.join(this.dir,'index.json'),tmp=target+'.tmp';await writeFile(tmp,JSON.stringify(index));await rename(tmp,target);
  });
 }
 stale(modelId){return Object.values(this.meta).filter(m=>m.modelId!==modelId).map(m=>m.key);}
 flush(){return this.writing;}
}
