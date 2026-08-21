"""V3.1.8 同步脚本：升版号 3.1.6 -> 3.1.6，并同步"数据备份/还原"新代码。"""
import shutil, re, os
from pathlib import Path

ROOT = Path('C:/Users/Administrator/WorkBuddy/2026-08-15-19-18-13/qiyi-nav-recovery/hao123')
SRC = ROOT
BUILD = ROOT / 'fnos' / 'qiyi-nav' / 'app' / 'build'
OLD = '3.1.6'
NEW = '3.1.8'

# 1) 同步源码到 fnos 构建副本
# 注意：外层 fnos/qiyi-nav/manifest 是 FPK 元数据唯一真源，fnpack 直接读取它，
# 不要把它复制进 app/ 树（否则会生成多余的 app/manifest 被打包进 app.tgz）。
# Dockerfile 也在此同步（已含 COPY assets ./assets 与 version 3.1.8）。
FILES = [
    'js/admin.js', 'js/script.js', 'js/api.js',
    'server.js', 'admin.html', 'index.html',
    'css/admin.css', 'css/style.css',
    'package.json', 'Dockerfile',
    'data/seed.json',
    'scripts/seed.js', 'scripts/verify.js', 'scripts/backup.sh',
    'RELEASE_NOTES.md',
]
for rel in FILES:
    s = SRC / rel
    d = BUILD / rel
    if s.exists():
        d.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(s, d)
        print('copied', d.relative_to(ROOT))

# 2) 同步 assets/ 目录（默认 LOGO 资源，Dockerfile 已 COPY assets ./assets）
assets_src = SRC / 'assets'
assets_dst = BUILD / 'assets'
assets_dst.mkdir(parents=True, exist_ok=True)
if assets_src.exists():
    for f in assets_src.iterdir():
        if f.is_file():
            shutil.copy2(f, assets_dst / f.name)
    print('copied assets ->', assets_dst.relative_to(ROOT))

# 3) 清理 build 内残留的旧 img/（白名单无 /img/，server 会 403；新版本已无此目录）
img_dir = BUILD / 'img'
if img_dir.is_dir():
    shutil.rmtree(img_dir)
    print('cleaned stale build/img')

# 4) 桌面图标已在 fnos/qiyi-nav/app/ui/images 重制为 icon_0.png / icon_1.png
#    （对齐 ui/config 的 images/icon_{0}.png；浅/深主题），本脚本不重复同步。

# 5) 全树替换版本号（排除 RELEASE_NOTES 历史段与后端 git 历史段）
EXCLUDE_PATTERNS = [r'RELEASE_NOTES\.md', r'\.history/', r'\.git/', r'fnos/qiyi-nav/manifest']

def should_skip(p: Path) -> bool:
    rel = str(p).replace('\\', '/')
    return any(re.search(pat, rel) for pat in EXCLUDE_PATTERNS)

count = 0
for path in SRC.rglob('*'):
    if not path.is_file():
        continue
    if should_skip(path):
        continue
    try:
        if path.suffix.lower() in {'.png', '.jpg', '.ico', '.gif', '.pdf', '.svg', '.woff', '.woff2'}:
            continue
        text = path.read_text(encoding='utf-8', errors='ignore')
        if OLD in text:
            new_text = text.replace(OLD, NEW)
            path.write_text(new_text, encoding='utf-8')
            count += 1
    except Exception:
        pass

print(f'\nversion replace: {count} files ({OLD} -> {NEW})')
print('build_317 done')
