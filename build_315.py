"""V3.1.2 同步脚本：复用 build_314 逻辑，新增图标图片分发。"""
import shutil, re, sys, os
from pathlib import Path

ROOT = Path('C:/Users/win10/Desktop/fsdownload/hao123')
SRC = ROOT
BUILD = ROOT / 'fnos' / 'qiyi-nav' / 'app' / 'build'
OLD = '3.1.2'
NEW = '3.1.2'

# 1. 同步代码文件（与 314 相同）
FILES = [
    'js/admin.js', 'js/script.js', 'server.js',
    'admin.html', 'index.html', 'css/admin.css',
    'fnos/qiyi-nav/manifest',
    'RELEASE_NOTES.md',
]
for rel in FILES:
    s = SRC / rel
    if rel == 'fnos/qiyi-nav/manifest':
        d = BUILD.parent / 'manifest'
    else:
        d = BUILD / rel
    if s.exists():
        d.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(s, d)

# 2. 同步 img 目录（src 与 build 同名，自身不再重复复制；img/ 已在 src 准备好）
img_src = SRC / 'fnos' / 'qiyi-nav' / 'app' / 'build' / 'img'
img_dst = BUILD / 'img'
if img_src.exists() and img_dst.resolve() != img_src.resolve():
    for f in img_src.iterdir():
        if f.is_file():
            shutil.copy2(f, img_dst / f.name)

# 3. ui/images 已在 fnos/qiyi-nav/app/ui/images/ 更新（图标 PNG 即在该处被 fnpack 读取）；
# 无需在 build/ui/images 同步，因为 build 目录从来没有 ui 子目录。

# 3. ui/images 已在 fnos/qiyi-nav/app/ui/images/ 更新（图标 PNG 即在该处被 fnpack 读取）；
# 无需在 build/ui/images 同步，因为 build 目录从来没有 ui 子目录。

# 根级 ICON.PNG/ICON_256.PNG 已经在源位置（无需再复制）

# 5. 全树替换版本号（排除 RELEASE_NOTES 历史段与后端 git 历史段）
EXCLUDE_PATTERNS = [r'RELEASE_NOTES\.md', r'\.history/', r'\.git/']

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
        if path.suffix.lower() in {'.png', '.jpg', '.ico', '.gif', '.pdf'}:
            continue
        text = path.read_text(encoding='utf-8', errors='ignore')
        if OLD in text:
            new_text = text.replace(OLD, NEW)
            path.write_text(new_text, encoding='utf-8')
            count += 1
    except Exception:
        pass

print(f'version replace: {count} files')
print('build_315 done')
