import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const root=path.resolve(fileURLToPath(new URL('..',import.meta.url)));
const port=Number(process.env.PORT||5173),url=`http://localhost:${port}`;
async function probe(){try{const r=await fetch(url+'/api/health',{signal:AbortSignal.timeout(700)});return r.ok&&(await r.json()).app==='swinglink';}catch{return false;}}
function openBrowser(){const child=process.platform==='darwin'?spawn('/usr/bin/open',[url],{stdio:'ignore'}):process.platform==='win32'?spawn('powershell.exe',['-NoProfile','-Command',`Start-Process '${url}'`],{stdio:'ignore',windowsHide:true}):spawn('xdg-open',[url],{stdio:'ignore'});child.on('error',()=>console.log(`请手动打开浏览器：${url}`));child.unref();}
if(await probe()){
 console.log('游戏已在运行，为你打开球场。');openBrowser();
}else{
 const child=spawn(process.execPath,['local-gateway/server.js'],{cwd:root,env:process.env,stdio:'inherit',windowsHide:true});
 let exited=false,stopping=false;
 function stop(){if(stopping)return;stopping=true;child.kill('SIGTERM');}
 process.on('SIGINT',stop);process.on('SIGTERM',stop);
 child.on('error',error=>{console.error('无法启动游戏服务：'+error.message);process.exitCode=1;exited=true;});
 child.on('exit',code=>{exited=true;process.exitCode=stopping?0:(code||0);});
 let opened=false;
 for(let i=0;i<50&&!exited;i++){if(await probe()){console.log(`球场已就绪：${url}`);openBrowser();opened=true;break;}await new Promise(r=>setTimeout(r,200));}
 if(!opened&&!exited){console.error('游戏未能启动。请检查端口是否被占用，或查看上方提示。');child.kill('SIGTERM');process.exitCode=1;}
}
