# 奇易智能导航 · 飞牛 fnOS 应用包（FPK）V3.1.8 纯导航版

把 qiyi-nav 做成飞牛 fnOS 应用中心可一键安装的 `.fpk`。

## 目录结构（fnpack 标准）
```
fnos/qiyi-nav/
├── manifest                      # 应用元数据（INI：appname/version/display_name/platform/source...）
├── config/
│   ├── privilege                 # 运行身份（JSON，run-as=package）
│   └── resource                  # docker 项目 + 共享目录声明（JSON）
├── cmd/                          # 生命周期脚本（main + 8 个 hook，均为占位）
├── app/
│   ├── build/                     # 后端源码 + Dockerfile（已内置，供飞牛本地离线构建）
│   ├── docker/docker-compose.yaml  # 默认本地离线构建（不依赖 GHCR）
│   └── ui/config + images/       # 桌面入口（JSON）+ 图标
├── wizard/install                # 安装向导（纯确认页，无需填写任何项）
├── ICON.PNG (64)  ICON_256.PNG (256)
```

## 打包（必须用官方 fnpack，切勿手打 tar）
飞牛 FPK 是**双层 tar.gz**（外层元数据 + 内层 `app.tgz` 载荷），手打扁平包飞牛识别不了。
1. 下载官方 fnpack：`https://static2.fnnas.com/fnpack/fnpack-1.2.3-windows-amd64`（重命名为 `fnpack.exe`）
2. 在工程目录执行：`fnpack build --directory .`
3. 产出 `qiyi-nav.fpk`，重命名为 `qiyi-nav_3.1.8.fpk` 即可上传飞牛。

> 校验要点（fnpack 会卡这些）：`config/privilege`、`config/resource`、`wizard/install`、`app/ui/config` 必须是**严格 JSON（无注释）**；`wizard` 的 item `type` 只能用 `text/password/radio/checkbox/select/switch/tips`（没有 `string`）。

## 部署前提（默认无需 GitHub / GHCR）
- **默认飞牛本地离线构建**：后端源码与 Dockerfile 已内置进 FPK 的 `app/build/`，compose 默认 `build:` 从本地上下文构建，镜像名为 `qiyi-nav:3.1.8`。**不需要 GitHub、不需要推镜像、没有占位符**，飞牛能联网拉取 `node:18-alpine` 基础镜像即可安装。
- 想用 GHCR 在线镜像（多设备统一版本）：编辑 `app/docker/docker-compose.yaml`，删掉 `build:` 段、取消 `image: ghcr.io/<用户名>/qiyi-nav:3.1.8` 注释（用户名必须全小写），前提是已在 GitHub Public 仓库 `push` + `git tag v3.1.7` 触发 Actions 构建出该镜像。
- **默认配置已写死，安装向导无需填写任何内容**：后台管理密码 `admin`、对外访问端口 `1315`。会话密钥在**每次安装时自动随机生成并持久化到数据卷 `secret.txt`**（重启后稳定，比固定密钥更安全）。这些值直接固化在镜像与 compose 中（**不依赖飞牛向导环境变量注入**，实测飞牛不会把向导字段注入进容器，故早期版本填了也不生效）。
- 若想改端口/密码：编辑 `app/docker/docker-compose.yaml` 的 `ports` 与 `environment`（ADMIN_PASSWORD），或进后台「修改密码」。
- **旧配置自愈**：容器启动时会检测旧版（无 `schemaVersion`）配置并自动把管理员密码重置为默认值，旧数据无需手动删。

## 飞牛端安装步骤
1. 应用中心 → 设置 → 手动安装应用 → 选 `qiyi-nav_3.1.8.fpk`
2. 向导直接点「下一步」（无必填项），确认
3. 浏览器访问 `http://<飞牛IP>:1315`；后台入口 `http://<飞牛IP>:1315/admin.html`，用 `admin` 登录（请尽快在后台修改密码）。

## 忘记密码 / 登不进后台怎么办
**典型现象**：之前装过更早版本并改过密码，飞牛升级/重装后数据卷里残留旧的 `config.json`，旧密码哈希被直接信任，于是默认 `admin` 登不进。这正是「数据保护」的预期行为。

**V3.1.8 起：登录页「忘记密码？」按钮（推荐，无需知道旧密码）**：
1. 拿到重置令牌（二选一）：
   - 方式 A（环境变量）：编辑 `app/docker/docker-compose.yaml`，`environment:` 下临时取消注释并填 `- QY_RESET_TOKEN=你自己设的令牌`，重启容器。
   - 方式 B（文件）：在飞牛终端往数据卷写一行令牌：
     `echo 你自己设的令牌 > /var/apps/qiyi-nav/shares/qiyi-nav/data/reset-token.txt`，重启容器（文件令牌用后即焚）。
2. 打开后台登录页 `http://<飞牛IP>:1315/admin.html`，点「忘记密码？」。
3. 填入令牌 + 新密码（≥6 位）+ 确认 → 「重置密码」。成功后用新密码登录。
4. 用环境变量方式请**删掉那行**再重启；文件方式令牌已自动删除，无需额外操作。
   - 未配置令牌时「忘记密码」会提示令牌无效；无任何外部邮箱/短信，令牌仅对拥有容器/数据卷权限的运维可见，安全可控。

**V3.1.7 起：环境变量直接改密（无需 UI）**：
1. 编辑 `app/docker/docker-compose.yaml`，`environment:` 下临时取消注释并填 `- QY_RESET_PASSWORD=你想设的新密码`。
2. 重启容器，密码即被强制改为该值；登录成功后**删掉该行**再重启。

**临时兜底（任意版本，会丢自定义站点/SearXNG 设置，链接不丢）**：
- 在飞牛上找到数据卷（默认 `shares/qiyi-nav/data`，对应容器内 `/app/data`），删除其中的 `config.json`，重启应用 → 密码重置回默认 `admin`。
- 也可直接在飞牛终端执行：`rm /var/apps/qiyi-nav/shares/qiyi-nav/data/config.json` 后重启。
