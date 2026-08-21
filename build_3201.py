#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
V3.2.01 完整重建 app/build/（修复 3.2.01 首打包只拷了扁平文件、漏掉所有子目录，
导致 fpk 内 build/ 缺 data/seed.json 及 js/ css/ assets/ scripts/ default-pages/，
飞牛安装时 `docker build` 在 COPY data/seed.json 处 failed to compute cache key）。

做法：从 root 镜像树 hao123/ 干净同步运行所需全部文件进 fnos/qiyi-nav/app/build/，
只保留 data/seed.json（data/links.json、data/config.json 为运行时数据，由 .dockerignore 排除）。
"""
import shutil, os
from pathlib import Path

ROOT = Path(r'\\192.168.1.9\工程软件开发\导航\qiyi-nav-recovery\hao123')
BUILD = ROOT / 'fnos' / 'qiyi-nav' / 'app' / 'build'

# 已知良好的 .dockerignore（与 root 一致：*.md / data/links.json / data/config.json / default-seed.json 排除，data/seed.json 保留）
DOCKERIGNORE = """node_modules
npm-debug.log
.git
.gitignore
*.md
.env
data/links.json
data/config.json
default-seed.json
cj*.txt
*.log
.DS_Store
"""

# 0) 确保 build 目录存在（build_3201 可能在一个被清空/删除的 build 上运行）
BUILD.mkdir(parents=True, exist_ok=True)

# 1) 重写 build/.dockerignore
(BUILD / '.dockerignore').write_text(DOCKERIGNORE, encoding='utf-8')
print('wrote build/.dockerignore')

# 2) 重新同步子目录（先删后拷，保证与 root 完全一致、无陈旧文件）
SUBDIRS = ['js', 'css', 'assets', 'scripts', 'default-pages']
for d in SUBDIRS:
    src = ROOT / d
    dst = BUILD / d
    if dst.exists():
        shutil.rmtree(dst)
    if src.is_dir():
        shutil.copytree(src, dst)
        n = sum(1 for _ in dst.rglob('*') if _.is_file())
        print(f'synced dir  {d}/  ({n} files)')
    else:
        print(f'!! missing source dir: {src}')

# 3) 复制扁平文件
FLAT = ['server.js', 'admin.html', 'index.html', 'login.html', 'package.json',
        'Dockerfile', 'RELEASE_NOTES.md', 'admin.janus.data.json']
for f in FLAT:
    s = ROOT / f
    if s.exists():
        shutil.copy2(s, BUILD / f)
        print(f'synced file {f}')
    else:
        print(f'!! missing source file: {s}')

# 4) data/：只放 seed.json（Dockerfile COPY data/seed.json /app/default-seed.json）
data_dst = BUILD / 'data'
if data_dst.exists():
    shutil.rmtree(data_dst)
data_dst.mkdir(parents=True, exist_ok=True)
shutil.copy2(ROOT / 'data' / 'seed.json', data_dst / 'seed.json')
print('synced data/seed.json')

# 5) 校验 build/ 顶层完整性
expected_sub = {'js', 'css', 'assets', 'scripts', 'default-pages', 'data'}
have_sub = {p.name for p in BUILD.iterdir() if p.is_dir()}
missing = expected_sub - have_sub
print('\nbuild/ 子目录:', sorted(have_sub))
print('缺失子目录:', sorted(missing) if missing else '无')
print('build/data/seed.json 存在:', (data_dst / 'seed.json').exists())
print('build_3201 done')
