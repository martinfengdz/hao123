#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""归整 qiyi-nav V3.0.11 全部发布资料：两个原文件 + 配套文档 + FPK 校验报告 -> 总包 zip"""
import os, shutil, subprocess, zipfile, datetime

ROOT = r"C:/Users/win10/Desktop/fsdownload/hao123"
DESK = r"C:/Users/win10/Desktop/fsdownload"
REL = os.path.join(DESK, "qiyi-nav_3.0.11_release")
VERSION = "3.0.11"
COMMIT = "7cfe788"

# 清理并重建发布目录
if os.path.exists(REL):
    shutil.rmtree(REL)
os.makedirs(REL)

# 1) 复制两个原文件
src_zip = os.path.join(DESK, f"qiyi-nav_{VERSION}_source.zip")
src_fpk = os.path.join(DESK, f"qiyi-nav_{VERSION}.fpk")
shutil.copy2(src_zip, os.path.join(REL, f"qiyi-nav_{VERSION}_source.zip"))
shutil.copy2(src_fpk, os.path.join(REL, f"qiyi-nav_{VERSION}.fpk"))

# 2) 复制配套文档
docs = [
    (os.path.join(ROOT, "RELEASE_NOTES.md"), "RELEASE_NOTES.md"),
    (os.path.join(ROOT, "README.md"), "README.md"),
    (os.path.join(ROOT, "PRODUCT.md"), "PRODUCT.md"),
    (os.path.join(ROOT, "FNOS_DEPLOY.md"), "FNOS_DEPLOY.md"),
    (os.path.join(ROOT, "fnos", "qiyi-nav", "README.md"), "FPK_README.md"),
]
for s, d in docs:
    if os.path.exists(s):
        shutil.copy2(s, os.path.join(REL, d))

# 3) FPK 校验报告
verify = r"C:/Users/win10/.workbuddy/skills/fnos-fpk-packaging/scripts/verify_fpk.py"
report = os.path.join(REL, "FPK_VERIFY_REPORT.txt")
try:
    out = subprocess.run(
        ["python3", verify, src_fpk],
        capture_output=True, text=True, timeout=120,
    )
    lines = out.stdout.strip().splitlines()
    passed = [l for l in lines if "PASS" in l]
    failed = [l for l in lines if "FAIL" in l]
    with open(report, "w", encoding="utf-8") as f:
        f.write(f"奇易智能导航 qiyi-nav FPK 校验报告\n")
        f.write(f"版本: V{VERSION}  |  文件: qiyi-nav_{VERSION}.fpk\n")
        f.write(f"生成时间: {datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n")
        f.write(f"校验项总数: {len(passed)+len(failed)}  |  通过: {len(passed)}  |  失败: {len(failed)}\n")
        f.write("=" * 60 + "\n\n")
        f.write(out.stdout)
        if out.stderr.strip():
            f.write("\n--- stderr ---\n" + out.stderr)
    verify_ok = len(failed) == 0
except Exception as e:
    with open(report, "w", encoding="utf-8") as f:
        f.write(f"校验脚本执行异常: {e}\n")
    verify_ok = False

# 4) 发布清单
manifest = os.path.join(REL, "发布清单.txt")
with open(manifest, "w", encoding="utf-8") as f:
    f.write(f"奇易智能导航系统 qiyi-nav · V{VERSION} 发布归档\n")
    f.write(f"Git commit: {COMMIT}\n")
    f.write(f"打包时间: {datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n")
    f.write("=" * 56 + "\n\n")
    f.write("【A. GitHub 发布版（源码包，与 GitHub Releases 同源）】\n")
    f.write(f"  qiyi-nav_{VERSION}_source.zip\n")
    f.write("  说明: git archive 生成，含 server.js / 前端 / fnos 构建 / 文档；\n")
    f.write("        不含 links.json / config.json / .env 等敏感文件。\n\n")
    f.write("【B. FPK 版（飞牛 fnOS 安装包）】\n")
    f.write(f"  qiyi-nav_{VERSION}.fpk\n")
    f.write("  说明: 飞牛应用中心手动安装；默认端口 1315，后台 /admin.html，\n")
    f.write("        默认密码 admin；镜像标签 qiyi-nav:3.0.11 防缓存。\n")
    f.write(f"  校验: 见 FPK_VERIFY_REPORT.txt（{'全部通过' if verify_ok else '存在失败项'}）\n\n")
    f.write("【C. 配套资料】\n")
    f.write("  RELEASE_NOTES.md   - 版本发布说明（含 V3.0.11 变更）\n")
    f.write("  README.md          - 项目总文档（部署/升级/目录结构）\n")
    f.write("  PRODUCT.md         - 产品说明与常见问题\n")
    f.write("  FNOS_DEPLOY.md     - 飞牛 FNOS 部署指南\n")
    f.write("  FPK_README.md      - FPK 包说明（对应 fnos/qiyi-nav/README.md）\n")
    f.write("  FPK_VERIFY_REPORT.txt - FPK 29 项结构校验报告\n\n")
    f.write("【安装指引】\n")
    f.write("  1. 飞牛卸载旧版（数据卷 /var/apps/qiyi-nav/shares/qiyi-nav/data 保留）\n")
    f.write("  2. 应用中心 -> 手动安装 -> 选 qiyi-nav_%s.fpk\n" % VERSION)
    f.write("  3. 访问 http://<IP>:1315/ ，后台 /admin.html 用 admin 登录\n")
    f.write("  4. GHCR 在线镜像由 git tag v%s 触发 Actions 自动构建\n" % VERSION)

# 5) 打包成总包
bundle = os.path.join(DESK, f"qiyi-nav_{VERSION}_release_all.zip")
if os.path.exists(bundle):
    os.remove(bundle)
with zipfile.ZipFile(bundle, "w", zipfile.ZIP_DEFLATED) as z:
    for name in sorted(os.listdir(REL)):
        fp = os.path.join(REL, name)
        z.write(fp, os.path.join(f"qiyi-nav_{VERSION}_release", name))

print("=== 发布归档总包已生成 ===")
print("目录:", REL)
print("总包:", bundle, os.path.getsize(bundle), "字节")
print("包含文件:")
for name in sorted(os.listdir(REL)):
    print("  -", name, os.path.getsize(os.path.join(REL, name)), "字节")
print("FPK 校验:", "全部通过" if verify_ok else "存在失败项")
