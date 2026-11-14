from pathlib import Path
import hashlib
import json
import shutil
import stat
import tempfile
import zipfile

root = Path(__file__).resolve().parents[1]
delivery = root.parent / 'delivery'
delivery.mkdir(exist_ok=True)
preview_name = 'mingma-frontends-preview'
source_name = 'mingma-frontends-source'

preview_readme = '''# 明码澄境前端体验包

此包已经构建，不需要安装 npm 依赖。入口直接打开澄境 MVP。

## 打开方式

需要 Python 3。在这个文件夹打开终端，运行：

```sh
python3 -m http.server 5190 --bind 127.0.0.1
```

Windows 可使用 `py -m http.server 5190 --bind 127.0.0.1`。

随后打开 http://127.0.0.1:5190/ 。也可使用包内的 start-preview.command 或 start-preview.cmd。

不要直接双击 index.html 使用 file 协议，浏览器会限制模块脚本。结束预览在终端按 Ctrl+C。

## 验收

从首页选择“开始硬装规划”或“体验完整案例”。

演示数据只在当前页面内保留。刷新或重新打开后清空，可以提前导出项目。

独立体验包需要同源 API 服务才能使用 AI 共创。商家方案使用本地规则。所有商家方案、户型与尺寸都是演示；价格不参与判断。
'''

def keep_source(path):
    parts = path.relative_to(root).parts
    if any(p in {'node_modules', 'dist', '.git', '.gstack', '__pycache__'} for p in parts):
        return False
    if path.name == '.DS_Store' or path.name.startswith('.env'):
        return False
    if 'review' in parts and parts != ('review', 'verification.json'):
        return False
    return path.is_file() and not path.is_symlink()

def add_file(archive, path, arcname):
    info = zipfile.ZipInfo(arcname)
    info.flag_bits |= 0x800
    info.compress_type = zipfile.ZIP_DEFLATED
    info.external_attr = (path.stat().st_mode & 0xFFFF) << 16
    archive.writestr(info, path.read_bytes())

def validate(archive_path):
    with zipfile.ZipFile(archive_path) as archive:
        assert archive.testzip() is None
        names = archive.namelist()
        assert not any(n.startswith('/') or '..' in Path(n).parts for n in names)
        assert any(n.endswith('/index.html') for n in names)
        assert all('node_modules/' not in n for n in names)
        return len(names)

with tempfile.TemporaryDirectory(prefix='mingma-delivery-') as temp:
    preview = Path(temp) / preview_name
    shutil.copytree(root / 'dist', preview)
    (preview / 'README.md').write_text(preview_readme, encoding='utf-8')
    command = preview / 'start-preview.command'
    command.write_text('#!/bin/zsh\ncd -- "$(dirname -- "$0")"\necho "Open http://127.0.0.1:5190/"\npython3 -m http.server 5190 --bind 127.0.0.1\n')
    command.chmod(command.stat().st_mode | stat.S_IXUSR | stat.S_IXGRP | stat.S_IXOTH)
    (preview / 'start-preview.cmd').write_text('@echo off\r\ncd /d "%~dp0"\r\necho Open http://127.0.0.1:5190/\r\nwhere py >nul 2>nul\r\nif %errorlevel%==0 (py -m http.server 5190 --bind 127.0.0.1) else (python -m http.server 5190 --bind 127.0.0.1)\r\npause\r\n', encoding='ascii')
    preview_zip = delivery / f'{preview_name}.zip'
    with zipfile.ZipFile(preview_zip, 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=8) as archive:
        for path in sorted(preview.rglob('*')):
            if path.is_file(): add_file(archive, path, f'{preview_name}/{path.relative_to(preview).as_posix()}')
    source_zip = delivery / f'{source_name}.zip'
    with zipfile.ZipFile(source_zip, 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=8) as archive:
        for path in sorted(root.rglob('*')):
            if keep_source(path): add_file(archive, path, f'{source_name}/{path.relative_to(root).as_posix()}')
    result = []
    for path in [preview_zip, source_zip]:
        result.append({'file':path.name,'bytes':path.stat().st_size,'files':validate(path),'sha256':hashlib.sha256(path.read_bytes()).hexdigest()})
    (delivery / 'manifest.json').write_text(json.dumps({'archives':result,'validation':'ZIP CRC and path safety checks passed'}, ensure_ascii=False, indent=2)+'\n')
    print(json.dumps(result, ensure_ascii=False, indent=2))
