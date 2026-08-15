#!/usr/bin/env python3
"""飞牛 FPK 二进制安全归一：文本成员 CRLF->LF，PNG/app.tgz 容器原样保留（其内源码文本一并归一）。"""
import sys, io, tarfile

TEXT_OUTER = {"manifest", "config/privilege", "config/resource", "wizard/install"}
INNER_TEXT_EXT = {".js", ".css", ".html", ".json", ".md", ".txt", ".yaml", ".yml", ".py", ".sh", ".ini"}


def normalize(data):
    return data.replace(b"\r\n", b"\n")


def is_inner_text(name):
    lower = name.lower()
    if lower.endswith(".png"):
        return False
    return any(lower.endswith(e) for e in INNER_TEXT_EXT)


def rebuild_inner(app_tgz_bytes):
    src = tarfile.open(fileobj=io.BytesIO(app_tgz_bytes))
    out = io.BytesIO()
    with tarfile.open(fileobj=out, mode="w:gz") as dst:
        for m in src.getmembers():
            data = src.extractfile(m).read() if m.isfile() else None
            if m.isfile() and is_inner_text(m.name):
                data = normalize(data)
            ti = m
            if data is None:
                dst.addfile(ti)
            else:
                ti.size = len(data)
                dst.addfile(ti, io.BytesIO(data))
    src.close()
    return out.getvalue()


def main():
    inp, outp = sys.argv[1], sys.argv[2]
    src = tarfile.open(inp)
    out = io.BytesIO()
    with tarfile.open(fileobj=out, mode="w:gz") as dst:
        for m in src.getmembers():
            data = src.extractfile(m).read() if m.isfile() else None
            name = m.name
            if m.isfile():
                if name in TEXT_OUTER or name.startswith("cmd/"):
                    data = normalize(data)
                elif name == "app.tgz":
                    data = rebuild_inner(data)
            if data is None:
                dst.addfile(m)
            else:
                m.size = len(data)
                dst.addfile(m, io.BytesIO(data))
    src.close()
    with open(outp, "wb") as f:
        f.write(out.getvalue())
    print("归一完成 ->", outp, len(out.getvalue()), "字节")


if __name__ == "__main__":
    main()
