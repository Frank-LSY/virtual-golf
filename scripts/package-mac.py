"""生成内置官方 Node.js 的 Mac 中文启动包，并校验来源与执行权限。"""
from pathlib import Path
import hashlib
import json
import stat
import struct
import sys
import tarfile
import zipfile
if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

ROOT = Path(__file__).resolve().parent.parent
CACHE = ROOT / '.local' / 'mac-runtime'
OUT = ROOT / 'releases'
VERSION = 'v22.23.4'
APP = '挥杆之间-Mac'
APP_VERSION = json.loads((ROOT / 'package.json').read_text(encoding='utf-8'))['version']
OUT.mkdir(exist_ok=True)
checksums = {}
for line in (CACHE / 'SHASUMS256.txt').read_text().splitlines():
    parts = line.split()
    if len(parts) == 2:
        checksums[parts[1]] = parts[0]

files = []
for folder in ['screen-web', 'phone-web', 'shared', 'game-service', 'local-gateway', 'tests', 'node_modules']:
    for file in sorted((ROOT / folder).rglob('*')):
        if not file.is_file() or '.bin' in file.parts or file.name == '.package-lock.json':
            continue
        if file.suffix.lower() in ['.exe', '.dll', '.cmd', '.ps1', '.node']:
            raise RuntimeError('依赖中发现平台专用文件，请检查：' + str(file))
        files.append((file, file.relative_to(ROOT).as_posix()))
for name in ['package.json', 'package-lock.json', 'README.md', 'Mac使用说明.html', '启动挥杆之间.command', '配置手机连接.command', 'scripts/mac-common.sh', 'scripts/start-local.js', 'scripts/setup-https.js', 'docs/PRD.md', 'docs/TECH.md', 'docs/ASSETS.md', 'docs/IMPLEMENTATION.md']:
    files.append((ROOT / name, name))

def put(z, name, data, executable=False):
    info = zipfile.ZipInfo(APP + '/' + name)
    info.create_system = 3
    info.external_attr = (stat.S_IFREG | (0o755 if executable else 0o644)) << 16
    info.compress_type = zipfile.ZIP_DEFLATED
    z.writestr(info, data, compresslevel=6)

outputs = []
for arch, label, cpu in [('arm64', 'Apple芯片', 0x0100000c), ('x64', 'Intel芯片', 0x01000007)]:
    archive = CACHE / f'node-{VERSION}-darwin-{arch}.tar.gz'
    actual = hashlib.sha256(archive.read_bytes()).hexdigest()
    if actual != checksums.get(archive.name):
        raise RuntimeError('官方校验和不一致：' + archive.name)
    with tarfile.open(archive, 'r:gz') as tar:
        prefix = f'node-{VERSION}-darwin-{arch}/'
        node = tar.extractfile(prefix + 'bin/node').read()
        license_text = tar.extractfile(prefix + 'LICENSE').read()
    magic, cpu_type = struct.unpack('<II', node[:8])
    assert magic == 0xfeedfacf and cpu_type == cpu, '运行环境架构不匹配'
    target = OUT / f'挥杆之间-{APP_VERSION}-Mac-{label}.zip'
    with zipfile.ZipFile(target, 'w') as z:
        for file, name in files:
            content = file.read_bytes()
            executable = name.endswith(('.command', '.sh'))
            if executable:
                content = content.replace(b'\r\n', b'\n')
            put(z, name, content, executable)
        put(z, 'runtime/node', node, True)
        put(z, 'runtime/LICENSE.txt', license_text)
        manifest = {'应用':'挥杆之间','版本':APP_VERSION,'平台':'macOS','架构':arch,'运行环境版本':VERSION,'官方来源':f'https://nodejs.org/dist/{VERSION}/{archive.name}','官方下载校验和':actual,'运行文件校验和':hashlib.sha256(node).hexdigest(),'说明':'未进行 Mac 真机运行验证；本包未签名或公证。'}
        put(z, 'runtime/来源与校验.json', json.dumps(manifest,ensure_ascii=False,indent=2).encode())
    with zipfile.ZipFile(target) as z:
        assert z.testzip() is None
        names = z.namelist()
        assert not any('/certs/' in n or '/.local/' in n or n.endswith('key.pem') for n in names)
        for name in ['runtime/node', '启动挥杆之间.command', '配置手机连接.command', 'scripts/mac-common.sh']:
            info = z.getinfo(APP + '/' + name)
            assert (info.external_attr >> 16) & 0o111 == 0o111
        for name in ['启动挥杆之间.command', '配置手机连接.command', 'scripts/mac-common.sh']:
            data = z.read(APP + '/' + name)
            assert data.startswith(b'#!/bin/bash\n') and b'\r' not in data
        assert hashlib.sha256(z.read(APP+'/runtime/node')).hexdigest() == manifest['运行文件校验和']
        for file, name in files:
            expected = file.read_bytes().replace(b'\r\n', b'\n') if name.endswith(('.command','.sh')) else file.read_bytes()
            assert z.read(APP+'/'+name) == expected, '打包内容与源文件不符：'+name
    digest = hashlib.sha256(target.read_bytes()).hexdigest()
    outputs.append((target.name, digest))
    print(f'已生成并校验：{target.name}（{target.stat().st_size / 1024 / 1024:.1f} MB）')
(OUT/'SHA256校验.txt').write_text('\n'.join(f'{digest}  {name}' for name,digest in outputs)+'\n',encoding='utf-8')
print('校验通过：官方 SHA-256、Mac 二进制架构、可执行权限、中文文件名、脚本换行、完整内容及私钥隔离。')
