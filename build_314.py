#!/usr/bin/env python3
# 同步 V3.1.3：把源码改动复制进 fnos 构建目录，并全树升级版本号（RELEASE_NOTES 历史段除外）
import os, shutil

ROOT = os.path.dirname(os.path.abspath(__file__))
BUILD = os.path.join(ROOT, 'fnos', 'qiyi-nav', 'app', 'build')

# 1) 复制本次改动的文件到 build
src_map = {
    'js/admin.js': 'js/admin.js',
    'js/script.js': 'js/script.js',
    'server.js': 'server.js',
    'index.html': 'index.html',
    'admin.html': 'admin.html',
    'css/admin.css': 'css/admin.css',
    'package.json': 'package.json',
}
for s, d in src_map.items():
    sp = os.path.join(ROOT, s)
    dp = os.path.join(BUILD, d)
    os.makedirs(os.path.dirname(dp), exist_ok=True)
    shutil.copyfile(sp, dp)
    print('sync', s, '->', d)

# 2) 全树替换版本号 3.0.13 -> 3.1.3（排除 RELEASE_NOTES 历史段）
OLD, NEW = '3.0.13', '3.1.3'
skip = {'RELEASE_NOTES.md'}
for dirpath, _, filenames in os.walk(ROOT):
    # 跳过 git / 产物
    if '.git' in dirpath or dirpath.endswith('fpk_staging'):
        continue
    for fn in filenames:
        if fn in skip:
            continue
        if fn.endswith(('.js', '.html', '.css', '.json', 'manifest', '.md')):
            fp = os.path.join(dirpath, fn)
            try:
                with open(fp, 'r', encoding='utf-8') as f:
                    data = f.read()
            except Exception:
                continue
            if OLD in data:
                data2 = data.replace(OLD, NEW)
                with open(fp, 'w', encoding='utf-8') as f:
                    f.write(data2)
                print('bump', os.path.relpath(fp, ROOT))

print('done')
