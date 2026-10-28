// 支持浏览器按字节读取音频，便于元数据加载、定位和循环回到开头。
export function sendAudio(req,res,body,mime){
 const headers={'Content-Type':mime,'Accept-Ranges':'bytes'};let start=0,end=body.length-1,status=200;
 if(req.headers.range&&req.method!=='HEAD'){
  const m=/^bytes=(\d*)-(\d*)$/.exec(req.headers.range);
  if(m&&(m[1]||m[2])){
   if(m[1]){start=Number(m[1]);end=m[2]?Math.min(Number(m[2]),end):end;}
   else {const suffix=Number(m[2]);start=suffix>0?Math.max(0,body.length-suffix):body.length;}
   if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start>end||start>=body.length){res.writeHead(416,{...headers,'Content-Range':`bytes */${body.length}`,'Content-Length':0});return res.end();}
   status=206;headers['Content-Range']=`bytes ${start}-${end}/${body.length}`;
  }
 }
 headers['Content-Length']=end-start+1;res.writeHead(status,headers);res.end(req.method==='HEAD'?undefined:body.subarray(start,end+1));
}
