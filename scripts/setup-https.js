import {execFileSync} from 'node:child_process';
import {mkdirSync,writeFileSync,existsSync,chmodSync} from 'node:fs';
import {networkInterfaces} from 'node:os';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const root=path.resolve(fileURLToPath(new URL('..',import.meta.url)));
const dir=process.env.SWINGLINK_CERT_DIR||path.join(root,'certs');
mkdirSync(dir,{recursive:true,mode:0o700});
const ips=[...new Set(['127.0.0.1',...Object.entries(networkInterfaces()).filter(([name])=>!/virtual|vEthernet|WSL|docker/i.test(name)).flatMap(([,items])=>items.filter(i=>i.family==='IPv4'&&!i.internal).map(i=>i.address))])];
const openssl=process.env.OPENSSL_PATH||(process.platform==='darwin'?'/usr/bin/openssl':'openssl');
try{execFileSync(openssl,['version'],{stdio:'ignore'});}catch{console.error('找不到证书生成工具。请安装 OpenSSL，或通过 OPENSSL_PATH 指定其位置，然后重新配置。');process.exit(1);}
// 使用配置文件声明扩展，兼容 macOS 自带的 LibreSSL，不依赖 -addext。
writeFileSync(path.join(dir,'openssl.cnf'),'[req]\nprompt=no\nutf8=yes\ndistinguished_name=dn\n[dn]\nCN=挥杆之间 本地证书\n[ca_ext]\nbasicConstraints=critical,CA:TRUE\nkeyUsage=critical,keyCertSign,cRLSign\nsubjectKeyIdentifier=hash\nauthorityKeyIdentifier=keyid:always,issuer\n');
const run=args=>execFileSync(openssl,args,{cwd:dir,stdio:'pipe',env:{...process.env,OPENSSL_CONF:path.join(dir,'openssl.cnf')}});
try{
 if(!existsSync(path.join(dir,'rootCA-key.pem'))||!existsSync(path.join(dir,'rootCA.pem'))){
  run(['req','-x509','-newkey','rsa:2048','-nodes','-utf8','-keyout','rootCA-key.pem','-out','rootCA.pem','-days','3650','-sha256','-extensions','ca_ext']);
 }
 run(['x509','-in','rootCA.pem','-outform','DER','-out','rootCA.cer']);
 writeFileSync(path.join(dir,'server.ext'),'basicConstraints=CA:FALSE\nkeyUsage=digitalSignature,keyEncipherment\nextendedKeyUsage=serverAuth\nsubjectAltName=DNS:localhost,'+ips.map(ip=>'IP:'+ip).join(',')+'\n');
 writeFileSync(path.join(dir,'server.cnf'),'[req]\nprompt=no\nutf8=yes\ndistinguished_name=dn\n[dn]\nCN=挥杆之间 本地游戏\n');
 run(['req','-newkey','rsa:2048','-nodes','-utf8','-keyout','server-key.pem','-out','server.csr','-config','server.cnf']);
 run(['x509','-req','-in','server.csr','-CA','rootCA.pem','-CAkey','rootCA-key.pem','-CAcreateserial','-out','server.pem','-days','365','-sha256','-extfile','server.ext']);
 for(const file of ['rootCA-key.pem','server-key.pem'])chmodSync(path.join(dir,file),0o600);
 console.log('手机连接证书已生成，覆盖地址：localhost、'+ips.join('、')+'\n请重启游戏，在电脑上点击“连接手机”。\niPhone 证书下载地址：http://'+(ips.find(ip=>ip!=='127.0.0.1')||'localhost')+':'+(process.env.PORT||5173)+'/local-ca.cer\n安装描述文件后，请在“设置 → 通用 → 关于本机 → 证书信任设置”中手动启用该证书。\n旧证书会保留；本工具不会自动更改系统信任设置。请勿分享 certs 文件夹中的私钥。');
}catch(error){console.error('生成证书失败。请检查目录写入权限和 OpenSSL 是否可用。');console.error(error.stderr?.toString()||error.message);process.exit(1);}
