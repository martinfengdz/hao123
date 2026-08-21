# 奇易智能导航系统 · 产品说明

> 一个自托管的网址导航站：带**真正的后台管理**、**Docker / 飞牛 FNOS 一键部署**、**零依赖 Node 后端**。适合个人、小团队、NAS 用户做内网或公网的「导航首页」。

- 版本：V3.3.01
- 协议：MIT
- 在线部署：支持（GitHub 容器仓库 GHCR 自动出镜像，飞牛/任意 Docker 环境免源码拉取）

---

## 一、这是什么

奇易智能导航脱胎于一个纯静态的 `hao123` 风格网址导航页。原版只能本地改、密码存在浏览器里可被绕过、后台是占位按钮。

V2.0 把它升级成一个**可自托管的完整产品**：

- 前端仍是纯静态页面，零框架、打开即用；
- 后端是一个**零第三方依赖**的 Node 服务，负责持久化、鉴权、导入导出；
- 配 Dockerfile / docker-compose，可一键容器化；
- 推到 GitHub 后，**Actions 自动构建镜像**推到容器仓库，飞牛等 NAS 直接拉镜像部署、随版本升级。

---

## 二、核心功能

- **9 大分类、310+ 精选链接**：推荐 / 代理 / 内网 / 软件 / 商业 / 常用 / 财经 / 工作 / 副业，开箱即用。
- **真正的后台管理**（`/admin.html`）：
  - 全分类链接的增、删、改、查；
  - 按分类筛选 + 关键词搜索；
  - 批量删除；
  - 一键导入 / 导出（JSON）；
  - 修改管理员密码；
  - 一键重置为默认数据（保留账号）。
- **服务端持久化**：数据存服务器 `data/links.json`，**多设备、多浏览器实时共享**，不再依赖浏览器 localStorage（旧版最大痛点）。
- **搜索聚合 + SearXNG 综合搜索**：版头可一键切换百度 / 谷歌 / 必应 / 360，以及「**综合**」引擎——后端代理 [SearXNG](https://github.com/searxng/searxng) 元搜索引擎，结果以浮层展示，聚合多家结果、隐藏实例地址、保护隐私（后台可配置开关与地址）。
- **体验细节**：暗色 / 亮色主题、分页、键盘快捷键、卡片网格布局。
- **双模式前端**：有后端走 API；直接双击 `index.html`（file://）自动回退到 localStorage 模式，旧用法不受影响。

---

## 三、技术架构

| 层 | 技术 | 说明 |
|---|---|---|
| 前端 | 纯 HTML / CSS / JS（无框架） | 轻量、易改、零构建 |
| 后端 | Node 内置 `http` / `crypto` / `fs` | **零第三方依赖**，无需 `npm install` |
| 存储 | `data/links.json` + `data/config.json` | JSON 文件，备份即复制目录 |
| 鉴权 | Cookie（`HttpOnly` + `SameSite`）+ 密码 SHA-256 加盐哈希 | 服务端校验，密码不存明文 |
| 容器 | `node:18-alpine`，镜像约 50MB | 挂载 `/app/data` 持久化 |

**为什么零依赖？** 部署到 NAS / 内网时最怕装一堆依赖失败。单文件 `server.js` 用 Node 自带模块，复制过去 `node server.js` 就能跑，Docker 镜像也极小。

---

## 四、目录结构

```
hao123/
├── index.html            # 前台导航页
├── admin.html            # 后台管理页
├── server.js             # 零依赖 Node 后端（静态服务 + API + 鉴权）
├── Dockerfile            # 零依赖镜像
├── docker-compose.yml    # 一键编排（导航 + SearXNG 综合版）
├── searxng/
│   └── settings.yml      # SearXNG 配置（开启 JSON 输出、关闭限流）
├── .env.example          # 环境变量样例
├── package.json          # 脚本入口（start / seed / verify）
├── css/                  # style.css（前台）、admin.css（后台）
├── js/
│   ├── list.js           # 默认链接数据（前端回退用）
│   ├── script.js         # 前台主逻辑
│   ├── api.js            # 后端 API 数据层（双模式）
│   └── admin.js          # 后台逻辑
├── data/
│   ├── seed.json         # 默认种子数据（纳入版本控制）
│   ├── links.json        # 运行期链接数据（自动生成，不入库）
│   └── config.json       # 密码哈希（自动生成，不入库）
├── scripts/
│   ├── seed.js           # 从 list.js 生成种子
│   └── verify.js         # 验证核对（去重 / 无效 URL / 统计）
├── .github/workflows/docker.yml  # 推 GitHub 后自动构建 GHCR 镜像
├── README.md             # 部署 / 运维文档
├── FNOS_DEPLOY.md        # 飞牛 FNOS 部署指南
├── PRODUCT.md            # 本文件（产品说明）
└── LICENSE               # MIT
```

---

## 五、快速部署（三种方式）

1. **本地直跑**：`node server.js` → 打开 `http://localhost:1315/`。
2. **Docker 一键（综合版）**：`docker compose up -d --build` 会同时启动导航站与 SearXNG，访问 `http://<IP>:1315/`（SearXNG 自身在 `:8081`）。
3. **飞牛 / 在线部署（免源码）**：把代码推到 GitHub，Actions 自动出镜像；飞牛 Docker 直接填镜像地址拉取运行。详见 `FNOS_DEPLOY.md`「方式 C」。

完整步骤见 `README.md`。

---

## 六、后台管理怎么用

1. 浏览器打开 `/admin.html`（如 `http://localhost:1315/admin.html`）。
2. 用管理员密码登录（**默认 `admin`**，首次务必修改）。
3. 仪表盘看各分类链接数；左侧选分类，可对链接增删改、搜索、批量删除。
4. 顶部「导出」备份全部数据；「导入」恢复；「改密码」更新管理员密码；「重置」恢复默认链接（保留账号）。
5. 顶部「集成设置」配置 SearXNG 综合搜索：启用开关、实例地址、设为默认引擎、结果打开方式。

> 前台「管理面板」按钮会跳转到后台。

---

## 七、安全特性

- 静态服务**白名单**：仅暴露首页、后台页、`css/`、`js/`，`server.js` / `package.json` / `Dockerfile` 等均返回 403，源码不泄露。
- **目录穿越防护**：`/../` 类请求被拦截。
- **密码哈希存储**：使用 SHA-256 + 随机盐，不存明文；登录态用 `HttpOnly` + `SameSite` Cookie。
- **未授权拦截**：写操作 API（保存 / 改密 / 导入 / 重置）未登录返回 401。
- 容器内运行无特权需求；数据卷独立于镜像，升级不丢数据。

**生产建议**：外网暴露务必走反向代理 + HTTPS；部署前改 `ADMIN_PASSWORD` 与 `SESSION_SECRET`；后台登录 IP 可加访问限制。

---

## 八、数据备份与迁移

整个 `data/` 目录就是全部状态：

- 备份：复制 `data/` 目录（含 `links.json` / `config.json`）。
- 迁移到新机器：拷代码 + 拷 `data/` 即可，无需重新录入。
- Docker / 飞牛：挂载的 `data` 卷单独备份就行。

---

## 九、版本与升级

- 改代码 → `git tag v3.1.8` → `git push --tags` → GitHub Actions **自动构建新镜像** → 飞牛容器点「更新」重拉即可（数据卷保留）。
- 回滚：飞牛「更新容器」指定旧 tag（如 `:2.0.0`）。
- 全自动可选：再部署一个 `watchtower` 监控本容器，镜像一更新自动重启。

详见 `README.md` 第十节、`FNOS_DEPLOY.md` 第九节。

---

## 十、常见问题

**Q：默认管理员密码是多少？**
A：首次启动默认 `admin`，登录后请立即在后台「改密码」。

**Q：忘记密码怎么办？**
A：删除 `data/config.json` 重启，密码恢复为环境变量 `ADMIN_PASSWORD`（默认 `admin`）。详见 `FNOS_DEPLOY.md` 常见问题。

**Q：飞牛上部署后页面空白？**
A：通常是空数据卷导致。V2.0 已内置种子兜底，首次启动自动生成 310 条默认链接；若仍空白，检查容器日志与数据卷挂载。

**Q：能多用户吗？**
A：当前为单管理员模型，适合个人 / 小团队。多角色在路线图中。

**Q：链接数据存哪？**
A：服务端 `data/links.json`。多设备 / 多浏览器共享，不再依赖浏览器本地存储。

---

## 十一、路线图

- [ ] 多用户 / 角色权限
- [ ] 链接点击统计与热门排序
- [ ] 自定义分类、图标、背景
- [ ] 浏览器书签一键导入
- [ ] 暗色主题持久化增强、移动端适配优化

---

## 十二、许可证

MIT License。可自由用于个人与商业场景。
