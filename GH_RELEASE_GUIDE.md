# qiyi-nav V3.3.01 · GitHub 全量发布指引

发布到 `github.com/martinfengdz/hao123`（奇易智能导航），按下面步骤操作。

## 一、本包内容

| 文件 | 用途 |
|---|---|
| `qiyi-nav_3.3.01_source.zip` | **完整源码包**（可直接运行 / docker build / fnpack 重打包） |
| `qiyi-nav_3.3.01.fpk` | **飞牛 fnOS 安装包**（上传为 Release 资产） |
| `RELEASE_NOTES.md` | **Release 正文**（贴到 GitHub Release 描述） |
| `GH_RELEASE_GUIDE.md` | 本指引 |

## 二、发布步骤

### 1. 推送源码（当前 git 提交停留在 V3.1.6，需先把 V3.3.01 全部改动入库）

```bash
cd qiyi-nav-recovery/hao123
git add -A
git commit -m "feat: 计算机工具页入出厂自建页面 + 底部快捷访问 + .js 自建页支持 (V3.3.01)"
git push origin main
```

### 2. 打版本 tag（触发 GitHub Actions 自动构建 GHCR 镜像）

```bash
git tag v3.3.01
git push origin --tags
```

Actions（`.github/workflows/docker.yml`）会自动出镜像：
- `ghcr.io/martinfengdz/qiyi-nav:latest`
- `ghcr.io/martinfengdz/qiyi-nav:3.3.01`

### 3. 创建 GitHub Release

1. 打开 https://github.com/martinfengdz/hao123/releases → **Draft a new release**
2. **Tag**：选 `v3.3.01`（或新建）
3. **Title**：`qiyi-nav V3.3.01 —— 计算机工具页入出厂 + 底部快捷访问`
4. **描述**：把 `RELEASE_NOTES.md` 的 **V3.3.01 区块**粘贴进去
5. **Assets**：上传本包内两个文件
   - `qiyi-nav_3.3.01_source.zip`（源码包）
   - `qiyi-nav_3.3.01.fpk`（飞牛安装包）
6. 点击 **Publish release**

### 4. 镜像与包双通道

- **Docker 通道**：用户 `docker pull ghcr.io/martinfengdz/qiyi-nav:3.3.01` 部署
- **FPK 通道**：飞牛应用中心手动安装 `qiyi-nav_3.3.01.fpk`（离线构建，默认不需要 GitHub）

## 三、本版核验结论（已全绿）

- verify_fpk：**PASS**（外层 21 项 / 内层 45 项，manifest version=3.3.01 platform=all）
- _check3301.py：**47/47 全 PASS**（版本常量、?v=、.js 支持、3 新出厂项、拆包级 13 项）
- Dockerfile 全部 COPY 目标存在（含 assets/logo-default.png，修复 V3.2.34 安装失败根因）
- 冒烟：`/pages/prices.js` → 200 `application/javascript`
- 升级合并实测：用户自定义快捷项保留 + 3 新出厂项自动追加（17 项）

## 四、注意事项

- 源码包已排除：开发脚本（`_*.py`）、构建产物（`*.fpk`）、运行时数据（`data/links.json`、`data/config.json`、`data/pages/`）、`.git/`、`fnos/.../app/build/` 构建副本
- `data/seed.json`（出厂种子）、`default-pages/`（含 7 个默认自建页与 prices.js）、`searxng/settings.yml`、`fnos/` 打包源均保留，拉取后可完整复现构建
- manifest 已移除历版遗留非官方 `arch` 字段（`platform=all` 覆盖），满足官方规范
