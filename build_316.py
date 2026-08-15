"""V3.1.3 同步脚本：复用 315 思路，新增 assets 目录分发 + 升版号。"""
import shutil, re, sys, os
from pathlib import Path

ROOT = Path('C:/Users/win10/Desktop/fsdownload/hao123')
SRC = ROOT
BUILD = ROOT / 'fnos' / 'qiyi-nav' / 'app' / 'build'
OLD = '3.1.3'
NEW = '3.1.3'

# 1) 同步源码到 fnos 构建副本
# 注意：外层 fnos/qiyi-nav/manifest 是 FPK 元数据唯一真源，fnpack 直接读取它，
# 不要把它复制进 app/ 树（否则会生成多余的 app/manifest 被打包进 app.tgz）。
FILES = [
    'js/admin.js', 'js/script.js', 'js/api.js',
    'server.js', 'admin.html', 'index.html',
    'css/admin.css', 'css/style.css',
    'package.json', 'Dockerfile',
    'data/seed.json',
    'scripts/seed.js', 'scripts/verify.js',
    'RELEASE_NOTES.md',
]
for rel in FILES:
    s = SRC / rel
    d = BUILD / rel
    if s.exists():
        d.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(s, d)
        print('copied', d.relative_to(ROOT))

# 2) 同步新增的 assets/ 目录（默认 LOGO 资源）
# 只做文件级同步，避免 rmtree 在沙箱被安全删除拦截。
assets_src = SRC / 'assets'
assets_dst = BUILD / 'assets'
assets_dst.mkdir(parents=True, exist_ok=True)
if assets_src.exists():
    for f in assets_src.iterdir():
        if f.is_file():
            shutil.copy2(f, assets_dst / f.name)
    print('copied assets ->', assets_dst.relative_to(ROOT))

# 3) FPK 桌面图标已在 fnos/qiyi-nav/ICON.PNG / ICON_256.PNG / app/ui/images/ 重新生成（64/256 规格），无需同步

# 4) 全树替换版本号（排除 RELEASE_NOTES 历史段与后端 git 历史段）
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
        if path.suffix.lower() in {'.png', '.jpg', '.ico', '.gif', '.pdf', '.svg', '.woff', '.woff2'}:
            continue
        text = path.read_text(encoding='utf-8', errors='ignore')
        if OLD in text:
            new_text = text.replace(OLD, NEW)
            path.write_text(new_text, encoding='utf-8')
            count += 1
    except Exception:
        pass

print(f'\nversion replace: {count} files (3.1.3 -> 3.1.3)')
print('build_316 done')
