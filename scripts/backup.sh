#!/usr/bin/env bash
# 通用数据备份脚本（适用于 Docker / GHCR 版）
# 用法：DATA_DIR=/path/to/data ./scripts/backup.sh
# 默认 DATA_DIR=./data，备份输出到 ./backups，保留最近 7 份
set -e
DATA_DIR="${DATA_DIR:-./data}"
BK_DIR="${BACKUP_DIR:-./backups}"
[ -d "$DATA_DIR" ] || { echo "数据目录不存在: $DATA_DIR"; exit 1; }
mkdir -p "$BK_DIR"
TS=$(date +%Y%m%d-%H%M%S)
tar -czf "$BK_DIR/qiyi-nav-data-$TS.tar.gz" -C "$(dirname "$DATA_DIR")" "$(basename "$DATA_DIR")"
ls -1t "$BK_DIR"/qiyi-nav-data-*.tar.gz 2>/dev/null | tail -n +8 | xargs -r rm -f
echo "已备份到 $BK_DIR/qiyi-nav-data-$TS.tar.gz（保留最近 7 份）"
