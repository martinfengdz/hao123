#!/usr/bin/env python3
# V3.0.12 构建同步：把改动过的源码复制进 fnos 构建目录，并全树替换版本号 3.0.11 -> 3.0.12
import os, shutil, re

ROOT = os.path.dirname(os.path.abspath(__file__))
BUILD = os.path.join(ROOT, "fnos", "qiyi-nav", "app", "build")

# 1) 同步改动过的源码到构建目录
copies = [
    ("js/admin.js", "js/admin.js"),
    ("css/admin.css", "css/admin.css"),
]
for src, dst in copies:
    s = os.path.join(ROOT, src)
    d = os.path.join(BUILD, dst)
    shutil.copyfile(s, d)
    print("copied", src, "->", dst)

# 2) 替换版本号（跳过 .fpk / RELEASE_NOTES.md 历史段由手动维护）
OLD, NEW = "3.0.11", "3.0.12"
skip_names = {"RELEASE_NOTES.md"}
exts = (".html", ".js", ".json", ".md", "manifest")
def walk_replace(base):
    for dp, _, fns in os.walk(base):
        for fn in fns:
            if fn in skip_names:
                continue
            if not (fn.endswith(exts) or fn == "manifest"):
                continue
            p = os.path.join(dp, fn)
            try:
                with open(p, "r", encoding="utf-8") as f:
                    txt = f.read()
            except Exception as e:
                print("skip(read)", p, e)
                continue
            if OLD in txt:
                txt2 = txt.replace(OLD, NEW)
                with open(p, "w", encoding="utf-8") as f:
                    f.write(txt2)
                print("bumped", os.path.relpath(p, ROOT))

for base in [ROOT, BUILD]:
    walk_replace(base)

print("done")
