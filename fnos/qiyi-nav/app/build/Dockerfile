# 奇易智能导航 - 飞牛 FNOS / 通用 Docker 镜像（零依赖 Node 后端）
FROM node:18-alpine

# 元数据
LABEL org.opencontainers.image.title="奇易智能导航" \
      org.opencontainers.image.version="3.1.2" \
      org.opencontainers.image.description="带后台管理与 Docker 部署的网址导航（零依赖 Node 后端）"

# 时区：国内 NAS 日志/时间显示正确
ENV TZ=Asia/Shanghai
RUN apk add --no-cache tzdata

WORKDIR /app

# 仅复制运行所需文件（.dockerignore 已排除数据/文档/临时文件）
COPY package.json ./
COPY server.js ./
COPY js ./js
COPY css ./css
COPY admin.html ./
COPY index.html ./
COPY scripts ./scripts
COPY assets ./assets

# 镜像内置默认种子（位于 /app/data 挂载点之外，保证挂载空卷时也能初始化出默认链接）
COPY data/seed.json /app/default-seed.json

# 运行时数据目录（用卷挂载持久化）
RUN mkdir -p /app/data

ENV PORT=1315
ENV ADMIN_PASSWORD=admin
ENV SESSION_SECRET=qiyi-nav-fixed-secret
ENV DATA_DIR=/app/data

EXPOSE 1315

# 容器健康检查（飞牛 Docker 可显示容器健康状态）
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1:1315/api/health || exit 1

# 生产环境建议放在反向代理（Nginx/Caddy）后并启用 HTTPS
CMD ["node", "server.js"]
