#!/usr/bin/env python3
"""
飞牛 fnOS FPK 校验 + 图标生成工具。

用法:
  python verify_fpk.py <fpk路径>            # 校验一个已打好的 fpk
  python verify_fpk.py --make-icon 64 out.png   # 生成一个 64x64 合法 PNG 图标

校验覆盖（核心 FPK 不变量，与应用无关）:
  - 外层必须为双层 tar.gz，且含 app.tgz
  - manifest 全部必填字段 + fnpack 补的 platform/checksum + 无 CRLF
  - config/privilege、config/resource、wizard/install、app/ui/config 为合法 JSON
  - wizard item type 枚举合法(text/password/radio/checkbox/select/switch/tips)
    且必填项 rules 带 message
  - 图标(ICON.PNG/ICON_256.PNG 及 ui/images/icon_*.png)为真实可解压 PNG 且尺寸正确
  - 文本类成员使用 LF(无 CRLF)
"""
import sys
import os
import io
import tarfile
import json
import struct
import zlib

WIZ_TYPES = {"text", "password", "radio", "checkbox", "select", "switch", "tips"}
MANIFEST_REQUIRED = [
    "appname", "version", "display_name", "desc", "arch", "source",
    "maintainer", "distributor", "desktop_uidir", "desktop_applaunchname",
]
# 文本成员（需 LF，二进制除外）
TEXT_MEMBERS = ["manifest", "config/privilege", "config/resource",
                "wizard/install", "cmd/main"]
BINARY_MEMBERS = {"app.tgz", "ICON.PNG", "ICON_256.PNG"}


def make_png(path, size, rgb=(37, 99, 235)):
    """二进制安全生成一张 size x size 的 RGB PNG（蓝底占位）。不被文本模式破坏。"""
    w = h = size
    raw = bytearray()
    row = bytes(rgb) * w
    for _ in range(h):
        raw.append(0)
        raw.extend(row)
    comp = zlib.compress(bytes(raw), 9)

    def chunk(typ, data):
        c = typ + data
        return struct.pack(">I", len(data)) + c + struct.pack(">I", zlib.crc32(c) & 0xffffffff)

    sig = b"\x89PNG\r\n\x1a\n"
    ihdr = struct.pack(">IIBBBBB", w, h, 8, 2, 0, 0, 0)  # 8-bit RGB
    png = sig + chunk(b"IHDR", ihdr) + chunk(b"IDAT", comp) + chunk(b"IEND", b"")
    with open(path, "wb") as f:
        f.write(png)
    return len(png)


def is_png(d, size):
    if d[:8] != b"\x89PNG\r\n\x1a\n":
        return False, 0, 0
    w, h = struct.unpack(">II", d[16:24])
    return (w == size and h == size), w, h


def verify(fpk):
    results = []

    def chk(name, cond, extra=""):
        results.append((name, bool(cond), extra))
        print(("PASS" if cond else "FAIL"), "-", name, (("  >> " + extra) if extra else ""))

    with tarfile.open(fpk) as t:
        outer = [m.name for m in t.getmembers() if m.isfile()]
        chk("外层含 app.tgz(双层结构)", "app.tgz" in outer)
        appdata = t.extractfile("app.tgz").read()
        with tarfile.open(fileobj=io.BytesIO(appdata)) as it:
            inner = [m.name for m in it.getmembers() if m.isfile()]
            print("  内层文件:", sorted(inner))
            # 图标尺寸校验
            for name in inner:
                if name.startswith("ui/images/icon_") and name.endswith(".png"):
                    d = it.extractfile(name).read()
                    ok, w, h = is_png(d, 64 if "64" in name else 256)
                    chk(name + " 合法PNG且尺寸正确", ok, ("%dx%d" % (w, h)) if not ok else "")
            # ui/config JSON
            if "ui/config" in inner:
                try:
                    json.loads(it.extractfile("ui/config").read().decode("utf-8"))
                    chk("ui/config 合法JSON", True)
                except Exception as e:
                    chk("ui/config 合法JSON", False, str(e))

        # manifest
        man = t.extractfile("manifest").read().decode("utf-8")
        kv = {l.split("=", 1)[0].strip(): l.split("=", 1)[1].strip()
              for l in man.splitlines() if l.strip() and "=" in l}
        for k in MANIFEST_REQUIRED:
            chk("manifest 字段 " + k, k in kv, kv.get(k, ""))
        chk("manifest 含 platform(fnpack补全)", "platform" in kv)
        chk("manifest 含 checksum(fnpack补全)", "checksum" in kv)
        chk("manifest 无CRLF", "\r" not in man)

        # JSON 文件
        for f in ["config/privilege", "config/resource"]:
            if f in outer:
                try:
                    json.loads(t.extractfile(f).read().decode("utf-8"))
                    chk(f + " 合法JSON", True)
                except Exception as e:
                    chk(f + " 合法JSON", False, str(e))

        # wizard
        if "wizard/install" in outer:
            try:
                wiz = json.loads(t.extractfile("wizard/install").read().decode("utf-8"))
                chk("wizard/install 合法JSON", True)
                bad, miss = [], []
                for step in wiz:
                    for it in step.get("items", []):
                        tp = it.get("type")
                        if tp not in WIZ_TYPES:
                            bad.append(tp)
                        for r in it.get("rules", []):
                            if r.get("required") and not r.get("message"):
                                miss.append(it.get("field"))
                chk("wizard item type 全合法", not bad, "非法: %s" % bad)
                chk("wizard required 均带 message", not miss, "缺: %s" % miss)
            except Exception as e:
                chk("wizard/install 合法JSON", False, str(e))

        # 图标(外层)
        for name, sz in [("ICON.PNG", 64), ("ICON_256.PNG", 256)]:
            if name in outer:
                d = t.extractfile(name).read()
                ok, w, h = is_png(d, sz)
                chk(name + " 合法PNG且%d*%d" % (sz, sz), ok, ("%dx%d" % (w, h)) if not ok else "")

        # LF 检查
        for f in TEXT_MEMBERS:
            if f in outer:
                raw = t.extractfile(f).read()
                chk(f + " 使用LF(无CRLF)", b"\r\n" not in raw)

    fails = [r for r in results if not r[1]]
    print()
    print("==== 汇总 %d 项, 失败 %d ====" % (len(results), len(fails)))
    for r in fails:
        print("  FAIL:", r[0], r[2])
    print("结论:", "全部通过 ✅" if not fails else "存在失败项 ❌")
    return len(fails) == 0


def main():
    args = sys.argv[1:]
    if not args:
        print(__doc__)
        sys.exit(2)
    if args[0] == "--make-icon":
        size = int(args[1])
        out = args[2]
        n = make_png(out, size)
        print("生成图标:", out, n, "字节")
        return
    fpk = args[0]
    if not os.path.exists(fpk):
        print("文件不存在:", fpk)
        sys.exit(2)
    ok = verify(fpk)
    sys.exit(0 if ok else 1)


if __name__ == "__main__":
    main()
