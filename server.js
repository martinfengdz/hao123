/**
 * 奇易智能导航系统 - 零依赖后端服务器
 * 版本: 3.2.33
 * 功能: 静态站点服务 + REST API + Cookie 鉴权（基于 Node 内置 http/crypto/fs）
 *
 * 启动: node server.js   （或通过 Docker）
 * 默认端口: 1315  (可用 PORT 环境变量覆盖)
 */

'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const zlib = require('zlib');

// ==================== 配置 ====================
const ROOT = __dirname;
const DATA_DIR = path.resolve(process.env.DATA_DIR || path.join(ROOT, 'data'));
const PORT = parseInt(process.env.PORT || '1315', 10);
const DEFAULT_PASSWORD = process.env.ADMIN_PASSWORD || 'admin';

// 会话签名密钥：优先用环境变量 SESSION_SECRET；未设置时每个安装自动生成唯一密钥
// 并持久化到 DATA_DIR/secret.txt，重启后保持稳定（避免镜像内固定密钥导致 Token 可被伪造）。
function resolveSessionSecret() {
  const envSecret = process.env.SESSION_SECRET;
  if (envSecret && String(envSecret).trim()) return String(envSecret).trim();
  const secretFile = path.join(DATA_DIR, 'secret.txt');
  try {
    if (fs.existsSync(secretFile)) {
      const saved = fs.readFileSync(secretFile, 'utf8').trim();
      if (saved) return saved;
    }
    const generated = crypto.randomBytes(32).toString('base64url');
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(secretFile, generated, { mode: 0o600 });
    return generated;
  } catch (e) {
    console.warn('[安全] 无法持久化会话密钥，回退到内置默认（不安全）:', e.message);
    return 'qiyi-nav-insecure-fallback';
  }
}
const PEPPER = resolveSessionSecret();

const VERSION = '3.3.01';

// SearXNG 默认配置：仅在显式提供 SEARXNG_URL 时才默认启用，
// 否则（如飞牛单容器 FPK 安装）默认关闭，避免“综合”标签指向不可达地址而报错。
function defaultSearxng() {
  const u = process.env.SEARXNG_URL || '';
  return { enabled: !!u, url: u || 'http://searxng:8080', defaultEngine: false, newTab: true };
}

const TOKEN_TTL = 7 * 24 * 3600 * 1000; // 7 天

fs.mkdirSync(DATA_DIR, { recursive: true });

// 自建页面目录（持久化到挂载卷，Docker 重建不丢；与前台「快捷访问」打通）
const PAGES_DIR = path.join(DATA_DIR, 'pages');
fs.mkdirSync(PAGES_DIR, { recursive: true });

// 出厂内置「自建页面」模板目录（随镜像发布，位于 ROOT/default-pages/）。
// 首次启动/空数据卷时把这些模板复制到 PAGES_DIR，使它们自动成为「自建页面」，
// 并经 /pages/<name> 对外提供（供前台「快捷访问」直接打开）。
const DEFAULT_PAGES_DIR = path.join(ROOT, 'default-pages');
function ensureDefaultPages() {
  try {
    if (!fs.existsSync(DEFAULT_PAGES_DIR)) return;
    fs.mkdirSync(PAGES_DIR, { recursive: true });
    const files = fs.readdirSync(DEFAULT_PAGES_DIR).filter(function (f) {
      // 复用与自建页面一致的白名单，避免复制非网页文件（.html/.htm/.js 均支持，
      // .js 用于配套页面脚本，如 Material.html 依赖的 prices.js）
      return /^[\u4e00-\u9fa5A-Za-z0-9_\-]{1,60}\.(html?|js)$/i.test(f);
    });
    files.forEach(function (f) {
      const dest = path.join(PAGES_DIR, f);
      if (!fs.existsSync(dest)) {
        fs.copyFileSync(path.join(DEFAULT_PAGES_DIR, f), dest);
        console.log('[种子] 已写入出厂自建页面: ' + f);
      }
    });
  } catch (e) {
    console.warn('[种子] 默认自建页面播种失败（可忽略）:', e.message);
  }
}

// ==================== 版本更新检查（后台"有更新版"提示） ====================
// 更新源（可选，经环境变量配置）：
//   UPDATE_REPO=owner/repo          使用 GitHub Releases 最新版（推荐）
//   UPDATE_CHECK_URL=https://...    自定义端点，返回纯文本版本号或 JSON {version,url}
// 未配置时后台仅显示当前版本，不弹更新提示（默认行为，零副作用）。
const https = require('https');
const UPDATE_REPO = (process.env.UPDATE_REPO || '').trim();
const UPDATE_CHECK_URL = (process.env.UPDATE_CHECK_URL || '').trim();
const UPDATE_CHECK_INTERVAL = 60 * 60 * 1000; // 结果缓存 1 小时，避免频繁请求
let _updateCache = { at: 0, data: null };

function parseVersionTag(tag) {
  if (!tag) return null;
  return String(tag).replace(/^v/i, '').trim();
}

// 返回 >0 表示 a 新于 b；<0 表示 b 新于 a；0 相等
function compareVersion(a, b) {
  const pa = String(a).split('.').map(function (x) { return parseInt(x, 10) || 0; });
  const pb = String(b).split('.').map(function (x) { return parseInt(x, 10) || 0; });
  const n = Math.max(pa.length, pb.length);
  for (let i = 0; i < n; i++) {
    const x = pa[i] || 0, y = pb[i] || 0;
    if (x !== y) return x - y;
  }
  return 0;
}

// 取远端最新版本号（带缓存 + 优雅降级）
function fetchLatestVersion() {
  return new Promise(function (resolve) {
    const now = Date.now();
    if (_updateCache.data && (now - _updateCache.at) < UPDATE_CHECK_INTERVAL) {
      return resolve(_updateCache.data);
    }
    if (!UPDATE_REPO && !UPDATE_CHECK_URL) {
      const r = { enabled: false, current: VERSION, latest: VERSION, available: false };
      _updateCache = { at: now, data: r };
      return resolve(r);
    }
    const url = UPDATE_CHECK_URL || ('https://api.github.com/repos/' + UPDATE_REPO + '/releases/latest');
    const lib = url.indexOf('https:') === 0 ? https : http;
    const req = lib.get(url, {
      headers: { 'User-Agent': 'qiyi-nav', 'Accept': 'application/vnd.github+json' }
    }, function (res) {
      let body = '';
      res.on('data', function (c) { body += c; });
      res.on('end', function () {
        let latest = null, releaseUrl = '';
        try {
          const j = JSON.parse(body);
          if (UPDATE_CHECK_URL) {
            if (typeof j === 'string') latest = j;
            else { latest = j.version || j.tag || j.tag_name || null; releaseUrl = j.url || ''; }
          } else {
            latest = j.tag_name ? parseVersionTag(j.tag_name) : null;
            releaseUrl = j.html_url || '';
          }
        } catch (e) { latest = null; }
        const data = {
          enabled: true,
          current: VERSION,
          latest: latest || VERSION,
          available: !!latest && compareVersion(latest, VERSION) > 0,
          url: releaseUrl || ('https://github.com/' + UPDATE_REPO + '/releases')
        };
        _updateCache = { at: now, data: data };
        resolve(data);
      });
    });
    req.on('error', function () {
      // 网络不可达/被墙：不弹更新提示，也不缓存错误（下次可重试）
      resolve({ enabled: true, current: VERSION, latest: VERSION, available: false, error: true });
    });
    req.setTimeout(5000, function () { req.destroy(); });
  });
}

const LINKS_FILE = path.join(DATA_DIR, 'links.json');
const SEED_FILE = path.join(DATA_DIR, 'seed.json');
const CONFIG_FILE = path.join(DATA_DIR, 'config.json');
// 镜像内置默认种子（位于挂载点之外，保证 Docker 挂载空卷时仍能初始化数据）
const DEFAULT_SEED_FILE = path.join(ROOT, 'default-seed.json');

// ==================== 工具函数 ====================
function hashPassword(pw) {
  return crypto.createHash('sha256').update(String(pw) + ':' + PEPPER).digest('hex');
}

function issueToken() {
  const payload = { iat: Date.now(), exp: Date.now() + TOKEN_TTL };
  const payloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', PEPPER).update(payloadB64).digest('base64url');
  return payloadB64 + '.' + sig;
}

function verifyToken(token) {
  if (!token) return false;
  const parts = String(token).split('.');
  if (parts.length !== 2) return false;
  const [payloadB64, sig] = parts;
  const expected = crypto.createHmac('sha256', PEPPER).update(payloadB64).digest('base64url');
  if (sig !== expected) return false;
  try {
    const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString());
    if (payload.exp && payload.exp < Date.now()) return false;
    return true;
  } catch (e) {
    return false;
  }
}

function parseCookies(req) {
  const h = req.headers.cookie;
  const out = {};
  if (!h) return out;
  h.split(';').forEach(p => {
    const i = p.indexOf('=');
    if (i < 0) return;
    out[p.slice(0, i).trim()] = decodeURIComponent(p.slice(i + 1).trim());
  });
  return out;
}

function sendJson(res, code, obj, extraHeaders) {
  const body = JSON.stringify(obj);
  res.writeHead(code, Object.assign({
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store'
  }, extraHeaders || {}));
  res.end(body);
}

function readBody(req, limit = 5 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', c => {
      size += c.length;
      if (size > limit) {
        reject(new Error('请求体过大'));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

// ==================== 零依赖 ZIP 工具（数据备份/还原） ====================
const CRC_TABLE = (function () {
  const t = new Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf) {
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) crc = (crc >>> 8) ^ CRC_TABLE[(crc ^ buf[i]) & 0xFF];
  return (crc ^ 0xFFFFFFFF) >>> 0;
}
// entries: [{ name: string, data: Buffer }]  ->  返回 zip Buffer（deflate 压缩，UTF-8 文件名）
function zipFiles(entries) {
  const parts = [];
  const central = [];
  let offset = 0;
  for (const e of entries) {
    const nameBuf = Buffer.from(e.name, 'utf8');
    const comp = zlib.deflateRawSync(e.data);
    const crc = crc32(e.data);
    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0);
    lh.writeUInt16LE(20, 4);
    lh.writeUInt16LE(0x0800, 6);   // 通用位标志：UTF-8 文件名
    lh.writeUInt16LE(8, 8);        // 压缩方式：deflate
    lh.writeUInt16LE(0, 10);
    lh.writeUInt16LE(0, 12);
    lh.writeUInt32LE(crc, 14);
    lh.writeUInt32LE(comp.length, 18);
    lh.writeUInt32LE(e.data.length, 22);
    lh.writeUInt16LE(nameBuf.length, 26);
    lh.writeUInt16LE(0, 28);
    parts.push(lh, nameBuf, comp);
    const ch = Buffer.alloc(46);
    ch.writeUInt32LE(0x02014b50, 0);
    ch.writeUInt16LE(20, 4);
    ch.writeUInt16LE(20, 6);
    ch.writeUInt16LE(0x0800, 8);
    ch.writeUInt16LE(8, 10);
    ch.writeUInt16LE(0, 12);
    ch.writeUInt16LE(0, 14);
    ch.writeUInt32LE(crc, 16);
    ch.writeUInt32LE(comp.length, 20);
    ch.writeUInt32LE(e.data.length, 24);
    ch.writeUInt16LE(nameBuf.length, 28);
    ch.writeUInt16LE(0, 30);
    ch.writeUInt16LE(0, 32);
    ch.writeUInt16LE(0, 34);
    ch.writeUInt16LE(0, 36);
    ch.writeUInt32LE(0, 38);
    ch.writeUInt32LE(offset, 42);
    central.push(Buffer.concat([ch, nameBuf]));
    offset += lh.length + nameBuf.length + comp.length;
  }
  const centralBuf = Buffer.concat(central);
  const es = Buffer.alloc(22);
  es.writeUInt32LE(0x06054b50, 0);
  es.writeUInt16LE(0, 4);
  es.writeUInt16LE(0, 6);
  es.writeUInt16LE(entries.length, 8);
  es.writeUInt16LE(entries.length, 10);
  es.writeUInt32LE(centralBuf.length, 12);
  es.writeUInt32LE(offset, 16);
  es.writeUInt16LE(0, 20);
  return Buffer.concat([...parts, centralBuf, es]);
}
// 解析 zip（支持 store/deflate），返回 [{ name, data }]
function unzip(buf) {
  let p = buf.length - 22;
  while (p >= 0 && buf.readUInt32LE(p) !== 0x06054b50) p--;
  if (p < 0) throw new Error('不是有效的 zip 文件');
  const count = buf.readUInt16LE(p + 10);
  const cdOffset = buf.readUInt32LE(p + 16);
  const out = [];
  let q = cdOffset;
  for (let i = 0; i < count; i++) {
    if (buf.readUInt32LE(q) !== 0x02014b50) break;
    const method = buf.readUInt16LE(q + 10);
    const compSize = buf.readUInt32LE(q + 20);
    const nameLen = buf.readUInt16LE(q + 28);
    const extraLen = buf.readUInt16LE(q + 30);
    const commLen = buf.readUInt16LE(q + 32);
    const lho = buf.readUInt32LE(q + 42);
    const name = buf.toString('utf8', q + 46, q + 46 + nameLen);
    const lnameLen = buf.readUInt16LE(lho + 26);
    const lextraLen = buf.readUInt16LE(lho + 28);
    const dataStart = lho + 30 + lnameLen + lextraLen;
    const comp = buf.subarray(dataStart, dataStart + compSize);
    let data;
    if (method === 0) data = Buffer.from(comp);
    else if (method === 8) data = zlib.inflateRawSync(comp);
    else throw new Error('不支持的压缩方式: ' + method);
    out.push({ name: name, data: data });
    q += 46 + nameLen + extraLen + commLen;
  }
  return out;
}
// 递归收集 DATA_DIR 下所有文件（排除 backups/ 自身，避免备份嵌套）
function collectDataDir(dir, base, out) {
  const items = fs.readdirSync(dir);
  for (const it of items) {
    const full = path.join(dir, it);
    const rel = base ? base + '/' + it : it;
    const st = fs.statSync(full);
    if (st.isDirectory()) {
      if (it === 'backups') continue;
      collectDataDir(full, rel, out);
    } else if (st.isFile()) {
      out.push({ name: rel, data: fs.readFileSync(full) });
    }
  }
}
// 二进制请求体读取（还原接口上传 zip 用，避免 toString 损坏二进制）
function readBodyBuffer(req, limit = 50 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', c => {
      size += c.length;
      if (size > limit) { reject(new Error('请求体过大')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function getAuth(req) {
  const cookies = parseCookies(req);
  return verifyToken(cookies.qiyi_token);
}

// ==================== 数据层 ====================
function loadConfig() {
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      const cfg = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
      // 当前版本配置：直接信任
      if (cfg.schemaVersion === 1 && typeof cfg.passwordHash === 'string') {
        cfg.site = mergeSite(cfg.site);
        return cfg;
      }
      // 旧版（无 schemaVersion）配置迁移：飞牛重装/升级后旧哈希可能基于旧默认密码与旧胡椒，
      // 直接继承会导致“密码不对”。此处重置为默认密码，保留 searxng 设置。
      console.warn('检测到旧版配置（无 schemaVersion），已重置管理员密码为默认值');
      const migrated = {
        schemaVersion: 1,
        passwordHash: hashPassword(DEFAULT_PASSWORD),
        searxng: cfg.searxng || defaultSearxng()
      };
      try { fs.writeFileSync(CONFIG_FILE, JSON.stringify(migrated, null, 2)); } catch (e) { /* ignore */ }
      migrated.site = mergeSite(migrated.site);
      return migrated;
    }
  } catch (e) {
    console.warn('读取配置文件失败，使用默认:', e.message);
  }
  const cfg = {
    schemaVersion: 1,
    passwordHash: hashPassword(DEFAULT_PASSWORD),
    searxng: defaultSearxng()
  };
  try { fs.writeFileSync(CONFIG_FILE, JSON.stringify(cfg, null, 2)); } catch (e) { /* ignore */ }
  cfg.site = mergeSite(cfg.site);
  return cfg;
}

function saveConfig(cfg) {
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(cfg, null, 2));
}

// ==================== 站点外观默认配置 ====================
// 页眉/页脚自定义代码、问候语、页脚功能链接、底部快捷访问、主标签页导航等。
// 全部走 config.json 的 site 字段；此处为出厂默认值，旧配置缺失时自动补齐。

// 整页页脚默认 HTML（footerHtml 为空时作默认值；也与后台「恢复默认」写入的整段页脚代码一致）
const DEFAULT_FOOTER_HTML = [
    '<div class="footer-sections">',
    '  <div class="footer-links" id="footer-links"></div>',
    '</div>',
    '<div class="footer-info">',
    '  <div class="footer-status">',
    '    <span id="system-status"><i class="fas fa-circle status-online"></i> 系统正常</span>',
    '    <span class="footer-separator">|</span>',
    '    <span>版本: <span class="version" id="footer-version"></span></span>',
    '    <span class="footer-separator">|</span>',
    '    <span>© <span id="current-year-footer"></span> 奇易智能导航</span>',
    '    <span class="footer-separator">|</span>',
    '    <span class="update-note">更新: 全量代码审查修复/CSS去重/JS安全加固/暗色模式修正</span>',
    '    <span class="footer-separator">|</span>',
    '    <span id="visit-count">访问: 0</span>',
    '  </div>',
    '</div>'
].join('\n');

function defaultSite() {
  return {
    greeting: {
      enabled: true,
      mode: 'auto',
      text: '',
      segments: [
        { start: '00:00', end: '05:59', text: '夜深了，注意休息 🌃' },
        { start: '06:00', end: '11:59', text: '早上好，新的一天开始啦 ☀️' },
        { start: '12:00', end: '13:59', text: '中午好，记得休息一下 🍚' },
        { start: '14:00', end: '17:59', text: '下午好，保持专注 🌤️' },
        { start: '18:00', end: '23:59', text: '晚上好，放松享受夜晚 🌙' }
      ]
    },
    headerHtml: '',
    footerHtml: DEFAULT_FOOTER_HTML,
    customCss: '',
    footerLinks: [
      { text: '网址提交', href: '2013002.html', icon: 'fas fa-plus-circle', target: '_blank' },
      { text: 'CRM手册', href: 'CRME4.pdf', icon: 'fas fa-book', target: '_blank' }
    ],
    quickAccess: [
      { text: '路由器', href: 'http://192.168.1.1/', icon: 'fas fa-wifi', target: '_blank' },
      { text: '海纳思', href: 'http://192.168.1.3', icon: 'fas fa-server', target: '_blank' },
      { text: 'FNOSNAS', href: 'https://fnos.net/dznasos', icon: 'fas fa-server', target: '_blank' },
      { text: 'NSA319服务器', href: 'http://192.168.1.119:91/cgi-bin/', icon: 'fas fa-server', target: '_blank' },
      { text: '网络测速', href: '/pages/TEST.html', icon: 'fas fa-tachometer-alt', target: '_blank' },
      { text: '税务计算器', href: '/pages/customs.html', icon: 'fas fa-calculator', target: '_blank' },
      { text: '齿轮计算', href: '131.html', icon: 'fas fa-calculator', target: '_blank' },
      { text: '理财计算', href: '/pages/zlcalculator.html', icon: 'fas fa-chart-line', target: '_blank' },
      // V3.3.01 新增：计算机目录工具页（与 default-pages 播种的自建页面配套）
      { text: '多功能计算器', href: '/pages/calculator.html', icon: 'fas fa-calculator', target: '_blank' },
      { text: '齿轮参数', href: '/pages/calculator2.html', icon: 'fas fa-cogs', target: '_blank' },
      { text: '材料价格', href: '/pages/Material.html', icon: 'fas fa-boxes', target: '_blank' },
      { text: '设备解锁', href: 'Unlock.html', icon: 'fas fa-unlock', target: '_blank' },
      { text: 'HCdzai', href: 'http://192.168.1.7:5666/', icon: 'fas fa-server', target: '_blank' },
      { text: 'FnDzAi', href: 'http://192.168.1.6:5666/', icon: 'fas fa-server', target: '_blank' },
      { text: '工作NAS', href: 'http://192.168.1.9:5666/', icon: 'fas fa-hdd', target: '_blank' },
      { text: 'KMS激活', href: 'http://192.168.1.4/kms.html', icon: 'fas fa-server', target: '_blank' }
    ],
    tabs: [
      { key: 'recommended', label: '推荐网址', icon: 'fas fa-star', visible: true },
      { key: 'proxy', label: '代理系统', icon: 'fas fa-server', visible: true },
      { key: 'internal', label: '内部系统', icon: 'fas fa-building', visible: true },
      { key: 'software', label: '软件工具', icon: 'fas fa-laptop', visible: true },
      { key: 'business', label: '在线业务', icon: 'fas fa-briefcase', visible: true },
      { key: 'common', label: '常用网址', icon: 'fas fa-globe', visible: true },
      { key: 'finance', label: '财务理财', icon: 'fas fa-chart-line', visible: true },
      { key: 'work', label: '工作工具', icon: 'fas fa-tools', visible: true },
      { key: 'side', label: 'AI工具', icon: 'fas fa-robot', visible: true }
    ],
    // 搜索栏下方"天气预报/今日新闻/..."快捷项：{text, url}
    // url 含 {q} 时，用 item.text 替换占位后打开；url 为空则保留旧行为（填入搜索框）
    quickSearches: [
      { text: '天气预报', url: '' },
      { text: '今日新闻', url: '' },
      { text: '股票行情', url: '' },
      { text: '汇率换算', url: '' },
      { text: '快递查询', url: '' },
      { text: '地图导航', url: '' }
    ],
    // 自定义 LOGO：hasCustom=true 时由 /api/site/logo/<which> 返回 data/site/<which>-logo.<ext>
    // 为 false 时前端回退到 /assets/logo-default.png（出厂卡通图）
    frontendLogo: { hasCustom: false, ext: '' },
    backendLogo: { hasCustom: false, ext: '' },
    // 动态背景：效果（none/particles/glow/aurora）与应用页面（frontend/backend/both）
    bgEffect: 'particles',
    bgTarget: 'frontend',
    // 默认搜索引擎（后台「外观」可设置；首页进入时预选该引擎）：
    // baidu/google/bing/360/searxng（searxng 需 SearXNG 已启用）
    searchEngine: 'baidu',
    // 首页页首「天气区」嵌入代码（V3.2.33 出厂默认留空 → 前台启用内置天气组件：
    // 实时温度+城市+风力湿度+3天预报；后台填了自定义 iframe 代码则优先使用自定义代码）
    weatherCode: '',
    // 内置天气组件城市（后台「外观」可改；数据源 wttr.in 免密钥，默认广州）
    weatherCity: '广州',
    // 首页进入「开幕动态」开关（进入动画遮罩淡出；默认开启）
    splash: true
  };
}

// 快捷访问合并：以 href 为键，保留用户已有项（含顺序），把出厂默认中新增的项追加到尾部。
// 使升级后新出厂的快捷访问项能自动出现，同时不打扰用户自定义/排序（幂等：已存在则跳过）。
function mergeQuickAccess(defaultArr, existingArr) {
  const def = Array.isArray(defaultArr) ? defaultArr : [];
  const ext = Array.isArray(existingArr) ? existingArr : [];
  if (!ext.length) return def.slice();
  const seen = {};
  ext.forEach(function (x) { if (x && x.href) seen[x.href] = true; });
  const add = def.filter(function (x) { return x && x.href && !seen[x.href]; });
  if (!add.length) return ext.slice();
  return ext.concat(add);
}

// 把已存 site 与默认值合并（数组整体替换，标量/对象补全），保证结构完整。
function mergeSite(existing) {
  const d = defaultSite();
  if (!existing || typeof existing !== 'object') return d;
  const out = Object.assign({}, d, existing);
  out.greeting = Object.assign({}, d.greeting, existing.greeting || {});
  out.footerLinks = Array.isArray(existing.footerLinks) ? existing.footerLinks : d.footerLinks;
  out.quickAccess = mergeQuickAccess(d.quickAccess, existing.quickAccess);
  out.tabs = Array.isArray(existing.tabs) ? existing.tabs : d.tabs;
  out.headerHtml = existing.headerHtml != null ? String(existing.headerHtml) : d.headerHtml;
  out.footerHtml = (existing.footerHtml != null && String(existing.footerHtml).length) ? String(existing.footerHtml) : d.footerHtml;
  out.customCss = existing.customCss != null ? String(existing.customCss) : d.customCss;
  out.quickSearches = Array.isArray(existing.quickSearches) ? existing.quickSearches : d.quickSearches;
  out.frontendLogo = (existing.frontendLogo && typeof existing.frontendLogo === 'object')
    ? { hasCustom: !!existing.frontendLogo.hasCustom, ext: String(existing.frontendLogo.ext || '') }
    : d.frontendLogo;
  out.backendLogo = (existing.backendLogo && typeof existing.backendLogo === 'object')
    ? { hasCustom: !!existing.backendLogo.hasCustom, ext: String(existing.backendLogo.ext || '') }
    : d.backendLogo;
  out.bgEffect = (existing.bgEffect && ['none', 'particles', 'glow', 'aurora'].indexOf(existing.bgEffect) >= 0) ? existing.bgEffect : d.bgEffect;
  out.bgTarget = (existing.bgTarget && ['frontend', 'backend', 'both'].indexOf(existing.bgTarget) >= 0) ? existing.bgTarget : d.bgTarget;
  out.searchEngine = (existing.searchEngine && ['baidu', 'google', 'bing', '360', 'searxng'].indexOf(existing.searchEngine) >= 0) ? existing.searchEngine : d.searchEngine;
  out.weatherCode = existing.weatherCode != null ? String(existing.weatherCode) : d.weatherCode;
  out.weatherCity = (existing.weatherCity != null && String(existing.weatherCity).trim())
    ? String(existing.weatherCity).trim() : d.weatherCity;
  out.splash = (typeof existing.splash === 'boolean') ? existing.splash : d.splash;
  return out;
}

let CONFIG = loadConfig();

// 首次启动把出厂「自建页面」模板播种到数据卷（仅缺则补，不覆盖用户已改页面）
ensureDefaultPages();

// ==================== 忘记密码一键重置 ====================
// 场景：升级/重装后数据卷里残留旧 config.json（旧密码哈希被信任），导致默认 admin 登不进。
// 用法：在 docker-compose environment 临时加一行  - QY_RESET_PASSWORD=你想设的新密码
//       重启容器后密码即被强制改为该值（其余配置/链接保留），登录成功后可删掉该环境变量。
const resetPw = process.env.QY_RESET_PASSWORD;
if (resetPw && String(resetPw).trim()) {
  const np = String(resetPw).trim();
  CONFIG.passwordHash = hashPassword(np);
  try {
    saveConfig(CONFIG);
    console.warn('[安全] 检测到 QY_RESET_PASSWORD，已将管理员密码重置为新值（请登录后移除该环境变量）');
  } catch (e) {
    console.warn('[安全] 重置密码写入失败:', e.message);
  }
}

function ensureSeed() {
  if (!fs.existsSync(SEED_FILE)) {
    // 优先用镜像内置默认种子（Docker 挂载空卷时也能初始化出默认链接）
    let src = null;
    if (fs.existsSync(DEFAULT_SEED_FILE)) src = DEFAULT_SEED_FILE;
    // 本地开发/测试回退：源码根 data/seed.json
    else if (fs.existsSync(path.join(ROOT, 'data', 'seed.json'))) src = path.join(ROOT, 'data', 'seed.json');
    if (src) {
      try {
        fs.copyFileSync(src, SEED_FILE);
        return;
      } catch (e) { /* 复制失败则降级到空兜底 */ }
    }
    // 最后兜底：写入空分类结构（本地无种子时避免崩溃）
    const fallback = { recommended: [], proxy: [], internal: [], software: [], business: [], common: [], finance: [], work: [], side: [] };
    try { fs.writeFileSync(SEED_FILE, JSON.stringify(fallback, null, 2)); } catch (e) { /* ignore */ }
  }
}

function loadLinks() {
  ensureSeed();
  if (fs.existsSync(LINKS_FILE)) {
    try {
      return JSON.parse(fs.readFileSync(LINKS_FILE, 'utf8'));
    } catch (e) {
      console.warn('links.json 损坏，回退到 seed:', e.message);
    }
  }
  // 首次运行：用 seed 作为初始数据
  const seed = JSON.parse(fs.readFileSync(SEED_FILE, 'utf8'));
  fs.writeFileSync(LINKS_FILE, JSON.stringify(seed, null, 2));
  return seed;
}

function saveLinks(data) {
  fs.writeFileSync(LINKS_FILE, JSON.stringify(data, null, 2));
}

function computeStats(data) {
  const byCategory = {};
  let total = 0;
  for (const cat in data) {
    const arr = Array.isArray(data[cat]) ? data[cat] : [];
    byCategory[cat] = arr.length;
    total += arr.length;
  }
  return { total, byCategory };
}

// ==================== 静态文件服务 ====================
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.pdf': 'application/pdf',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8'
};

// 不允许通过静态服务直接访问的文件/目录
const DENY_PREFIX = [path.join(ROOT, 'data') + path.sep, path.join(ROOT, 'scripts') + path.sep];

function serveStatic(req, res, urlPath) {
  let rel = decodeURIComponent(urlPath.split('?')[0]);
  if (rel === '/' || rel === '') rel = '/index.html';

  // 公开资源白名单：首页、后台页、免密登录页、css/ 、js/ 与 assets/（默认 logo 资源）
  // 从根本上杜绝 server.js / 配置文件 / data 目录被直接访问（含目录穿越）
  const allowed = rel === '/index.html' || rel === '/admin.html' || rel === '/login.html' ||
                  rel.startsWith('/css/') || rel.startsWith('/js/') ||
                  rel.startsWith('/assets/');
  if (!allowed) {
    res.writeHead(403); res.end('Forbidden'); return;
  }

  const resolved = path.normalize(path.join(ROOT, rel));
  // 二次校验，确保不逃出根目录
  if (!resolved.startsWith(ROOT + path.sep) && resolved !== ROOT) {
    res.writeHead(403); res.end('Forbidden'); return;
  }
  fs.readFile(resolved, (err, buf) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('404 Not Found');
      return;
    }
    const ext = path.extname(resolved).toLowerCase();
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Cache-Control': 'no-cache'
    });
    res.end(buf);
  });
}

// 自建页面文件名白名单：主体仅允许 中文/字母/数字/下划线/连字符（不含点），
// 扩展名 .html 或 .htm；长度受限。从根本上杜绝目录穿越与覆盖系统文件。
function safePageName(raw) {
  if (typeof raw !== 'string') return null;
  let name;
  try { name = decodeURIComponent(raw.trim()); } catch (e) { name = raw.trim(); }
  if (!/^[\u4e00-\u9fa5A-Za-z0-9_\-]{1,60}\.(html?|js)$/i.test(name)) return null;
  return name;
}

// 公开访问自建页面：GET /pages/<name> → 返回 text/html（供前台/快捷访问直接打开）
function serveUserPage(req, res, urlPath) {
  const name = safePageName(urlPath.split('?')[0].slice('/pages/'.length));
  if (!name) {
    res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('非法的页面名');
    return;
  }
  const file = path.join(PAGES_DIR, name);
  fs.readFile(file, function (err, buf) {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('页面不存在');
      return;
    }
    // 按扩展名返回正确 Content-Type（.js 供自建页面的配套脚本使用，如 prices.js）
    const ct = /\.js$/i.test(name)
      ? 'application/javascript; charset=utf-8'
      : 'text/html; charset=utf-8';
    res.writeHead(200, { 'Content-Type': ct, 'Cache-Control': 'no-cache' });
    res.end(buf);
  });
}

// ==================== 书签增强：favicon / 元数据 / HTML 导入 ====================
const CAT_KEYS = ['recommended', 'proxy', 'internal', 'software', 'business', 'common', 'finance', 'work', 'side'];

function fetchWithTimeout(url, opts, ms) {
  const ctrl = new AbortController();
  const timer = setTimeout(function () { ctrl.abort(); }, ms);
  return fetch(url, Object.assign({ signal: ctrl.signal }, opts || {})).finally(function () { clearTimeout(timer); });
}

function domainOf(url) {
  try { return new URL(url).hostname; } catch (e) { return ''; }
}

// ==================== favicon 本地缓存（首次抓取后落盘，之后秒回） ====================
const FAVICON_DIR = path.join(DATA_DIR, 'favicons');

function faviconPaths(domain) {
  const h = crypto.createHash('sha1').update(domain).digest('hex');
  return { bin: path.join(FAVICON_DIR, h + '.bin'), type: path.join(FAVICON_DIR, h + '.type') };
}

// 远程抓取站点图标并写入本地缓存；返回 {buf, ct} 或 null
async function fetchAndCacheFavicon(domain, force) {
  const p = faviconPaths(domain);
  if (!force && fs.existsSync(p.bin) && fs.readFileSync(p.bin).length > 32) {
    return { buf: fs.readFileSync(p.bin), ct: fs.readFileSync(p.type, 'utf8') };
  }
  const candidates = [
    'https://icons.duckduckgo.com/ip3/' + encodeURIComponent(domain) + '.ico',
    'https://www.google.com/s2/favicons?domain=' + encodeURIComponent(domain) + '&sz=64',
    'https://' + domain + '/favicon.ico'
  ];
  for (const c of candidates) {
    try {
      const r = await fetchWithTimeout(c, { method: 'GET', redirect: 'follow' }, 4000);
      const ct = (r.headers.get('content-type') || '');
      if (r.ok && ct.startsWith('image/')) {
        const buf = Buffer.from(await r.arrayBuffer());
        if (buf.length > 32) {
          fs.mkdirSync(FAVICON_DIR, { recursive: true });
          fs.writeFileSync(p.bin, buf);
          fs.writeFileSync(p.type, ct.split(';')[0]);
          return { buf, ct: ct.split(';')[0] };
        }
      }
    } catch (e) { /* 尝试下一个候选 */ }
  }
  return null;
}

// 遍历全部链接，异步预抓取缺失的图标（不阻塞主流程）；force=true 时覆盖已有缓存
async function prefetchAllFavicons(force) {
  try {
    const data = loadLinks();
    // 兼容两种结构：扁平数组 或 {分类: [链接...]} 对象
    const links = Array.isArray(data) ? data : Object.values(data).flat();
    const domains = new Set();
    for (const l of links) {
      const u = l && (l.url || l.href) ? (l.url || l.href) : '';
      const d = domainOf(u);
      if (d) domains.add(d);
    }
    for (const d of domains) {
      try { await fetchAndCacheFavicon(d, force); } catch (e) { /* 单个失败忽略 */ }
    }
    console.log(`[favicon] 预抓取完成，覆盖域名 ${domains.size} 个`);
  } catch (e) {
    console.error('[favicon] 预抓取失败:', e.message);
  }
}

// 公开：代理获取站点 favicon（命中本地缓存秒回，否则远程抓取并落盘）
async function proxyFavicon(req, res, urlPath) {
  const qi = urlPath.indexOf('?');
  const qs = qi >= 0 ? urlPath.slice(qi + 1) : '';
  const domain = domainOf(new URLSearchParams(qs).get('url') || '');
  if (!domain) return sendJson(res, 400, { error: '无效的 url' });

  // 1) 命中本地缓存：直接返回（秒回，不再请求远程）
  const p = faviconPaths(domain);
  if (fs.existsSync(p.bin) && fs.existsSync(p.type)) {
    const buf = fs.readFileSync(p.bin);
    if (buf.length > 32) {
      res.writeHead(200, {
        'Content-Type': fs.readFileSync(p.type, 'utf8'),
        'Cache-Control': 'public, max-age=604800',
        'Access-Control-Allow-Origin': '*'
      });
      res.end(buf);
      return;
    }
  }

  // 2) 未命中：远程抓取并写入缓存
  const got = await fetchAndCacheFavicon(domain, false);
  if (got) {
    res.writeHead(200, {
      'Content-Type': got.ct,
      'Cache-Control': 'public, max-age=604800',
      'Access-Control-Allow-Origin': '*'
    });
    res.end(got.buf);
    return;
  }
  return sendJson(res, 404, { error: '无法获取 favicon' });
}

// 图标自检：扫描全部链接的域名，统计 favicon 获取情况。
// cached=true 表示本地已缓存（前台能正常显示）；obtainable 仅在 deep 模式下才会去在线探测。
// 返回的 domains 列表已排序：未获得的排在前面，便于后台直接查看“哪些域名没拿到图标”。
async function checkIcons(deep) {
  const data = loadLinks();
  const links = Array.isArray(data) ? data : Object.values(data).flat();
  const seen = new Map(); // domain -> { count, names:Set }
  for (const l of links) {
    const u = (l && (l.url || l.href)) ? (l.url || l.href) : '';
    const d = domainOf(u);
    if (!d) continue;
    if (!seen.has(d)) seen.set(d, { count: 0, names: new Set() });
    const e = seen.get(d);
    e.count++;
    if (l.name) e.names.add(String(l.name));
  }
  const domains = Array.from(seen.keys());
  let ok = 0;
  const cachedList = [];
  const missList = [];
  for (const d of domains) {
    const p = faviconPaths(d);
    const cached = fs.existsSync(p.bin) && fs.existsSync(p.type) && fs.readFileSync(p.bin).length > 32;
    const entry = {
      domain: d,
      cached: cached,
      obtainable: cached,
      count: seen.get(d).count,
      names: Array.from(seen.get(d).names).slice(0, 5)
    };
    if (cached) { ok++; cachedList.push(entry); }
    else { missList.push(entry); }
  }
  // deep 模式：对未缓存的域名并发探测是否还能在线获取（并发上限 8，避免阻塞过久）
  if (deep && missList.length) {
    const LIMIT = 8;
    let idx = 0;
    async function worker() {
      while (idx < missList.length) {
        const cur = missList[idx++];
        try {
          const got = await fetchAndCacheFavicon(cur.domain, false);
          if (got) { cur.obtainable = true; cur.cached = true; ok++; }
        } catch (e) { /* 单个失败忽略 */ }
      }
    }
    await Promise.all(Array.from({ length: Math.min(LIMIT, missList.length) }, worker));
  }
  const total = domains.length;
  const list = missList.concat(cachedList); // 未获得在前，便于查看
  return {
    version: VERSION,
    total: total,
    ok: ok,
    missing: total - ok,
    rate: total ? Math.round((ok / total) * 100) : 100,
    deep: !!deep,
    checkedAt: new Date().toISOString(),
    domains: list
  };
}

// 鉴权后：抓取网页标题与图标（后台"自动获取"）
async function fetchMeta(req, res, urlPath) {
  const qi = urlPath.indexOf('?');
  const qs = qi >= 0 ? urlPath.slice(qi + 1) : '';
  const target = (new URLSearchParams(qs).get('url') || '').trim();
  if (!/^https?:\/\//i.test(target)) return sendJson(res, 400, { error: '无效的 url' });
  try {
    const r = await fetchWithTimeout(target, {
      method: 'GET', redirect: 'follow',
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; qiyi-nav/2.2)' }
    }, 6000);
    const text = await r.text();
    let title = '';
    const tm = text.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    if (tm) title = tm[1].replace(/\s+/g, ' ').trim().slice(0, 120);
    let favicon = '';
    const lm = text.match(/<link[^>]+rel\s*=\s*["'](?:shortcut\s+)?icon["'][^>]*>/i);
    if (lm) {
      const hm = lm[0].match(/href\s*=\s*["']([^"']+)["']/i);
      if (hm) { try { favicon = new URL(hm[1], target).href; } catch (e) { favicon = hm[1]; } }
    }
    if (!favicon) { try { favicon = new URL('/favicon.ico', target).href; } catch (e) { favicon = ''; } }
    return sendJson(res, 200, { title: title, favicon: favicon });
  } catch (e) {
    return sendJson(res, 200, { title: '', favicon: '', error: e.message });
  }
}

// 文件夹名 → 分类 关键词映射
const CAT_KEYWORD_MAP = [
  [/ai|人工智能|大模型|gpt|chatgpt|智能|机器人|chat/i, 'side'],
  [/财务|理财|银行|基金|股票|证券|保险|税务|记账/i, 'finance'],
  [/内部|内网|nas|路由|局域网|飞牛|fnos|服务器|私密|家庭/i, 'internal'],
  [/代理|vpn|梯子|科学上网|翻墙/i, 'proxy'],
  [/软件|下载|工具箱|应用|app/i, 'software'],
  [/工作|办公|协作|文档|会议|项目/i, 'work'],
  [/业务|商城|电商|客户|订单|shop|store/i, 'business'],
  [/常用|书签|收藏|其他|other|未分类|默认/i, 'common']
];
function mapFolderToCat(folder) {
  if (!folder) return 'common';
  for (const pair of CAT_KEYWORD_MAP) if (pair[0].test(folder)) return pair[1];
  return 'common';
}

// 解析 Netscape 书签 HTML（浏览器导出的收藏夹），按文件夹归属归类
function parseBookmarksHtml(html) {
  const events = [];
  let m;
  const h3re = /<h3\b[^>]*>([\s\S]*?)<\/h3>/gi;
  while ((m = h3re.exec(html))) events.push({ type: 'folder', pos: m.index, name: m[1].replace(/<[^>]+>/g, '').trim() });
  const are = /<a\b[^>]*\bhref\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  while ((m = are.exec(html))) events.push({ type: 'link', pos: m.index, href: m[1], text: m[2] });
  events.sort(function (a, b) { return a.pos - b.pos; });
  let curFolder = null;
  const map = {};
  for (const ev of events) {
    if (ev.type === 'folder') { curFolder = ev.name; continue; }
    if (!/^https?:\/\//i.test(ev.href)) continue;
    const name = ev.text.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim() || ev.href;
    const cat = mapFolderToCat(curFolder);
    map[ev.href + '|' + name] = { url: ev.href, name: name, cat: cat };
  }
  return Object.values(map);
}

// 鉴权后：导入浏览器书签 HTML（合并去重，不覆盖现有数据）
async function importHtml(req, res) {
  const raw = await readBody(req, 10 * 1024 * 1024);
  let body = {};
  try { body = JSON.parse(raw || '{}'); } catch (e) { return sendJson(res, 400, { error: 'JSON 解析失败' }); }
  const html = body.html || '';
  if (!html) return sendJson(res, 400, { error: '缺少 html 字段' });
  const parsed = parseBookmarksHtml(html);
  const data = loadLinks();
  const seen = new Set();
  CAT_KEYS.forEach(function (c) {
    (Array.isArray(data[c]) ? data[c] : []).forEach(function (it) { if (it.url) seen.add(it.url); });
  });
  let added = 0, skipped = 0;
  const byCat = {};
  parsed.forEach(function (item) {
    if (seen.has(item.url)) { skipped++; return; }
    if (!Array.isArray(data[item.cat])) data[item.cat] = [];
    data[item.cat].push({ id: 'imp_' + Date.now().toString(36) + Math.floor(Math.random() * 1000), name: item.name, url: item.url, class: '' });
    seen.add(item.url);
    byCat[item.cat] = (byCat[item.cat] || 0) + 1;
    added++;
  });
  saveLinks(data);
  return sendJson(res, 200, { ok: true, added: added, skipped: skipped, byCategory: byCat });
}

// ==================== API 路由 ====================
async function handleApi(req, res, urlPath) {
  const method = req.method.toUpperCase();
  const pathname = urlPath.split('?')[0];

  // 公开：获取链接。
  // 默认（公开）视图剥离每条的登录用户名/密码（luser/lpass），仅保留 hasCred 布尔，
  // 供前台卡片显示「免密登录」入口而不泄露密码；后台编辑用 ?full=1（需登录）才返回完整字段。
  if (method === 'GET' && pathname === '/api/links') {
    const data = loadLinks();
    if (/[?&]full=1\b/.test(urlPath)) {
      if (!getAuth(req)) return sendJson(res, 401, { error: '未授权' });
      return sendJson(res, 200, { data, updatedAt: new Date().toISOString(), version: VERSION });
    }
    const pub = {};
    for (const cat in data) {
      pub[cat] = (Array.isArray(data[cat]) ? data[cat] : []).map(function (it) {
        const copy = Object.assign({}, it);
        const hasCred = !!((it.luser && String(it.luser).trim()) || (it.lpass && String(it.lpass).trim()));
        delete copy.luser;
        delete copy.lpass;
        if (hasCred) copy.hasCred = true;
        return copy;
      });
    }
    return sendJson(res, 200, { data: pub, updatedAt: new Date().toISOString(), version: VERSION });
  }

  // 公开：免密登录中转页拉取指定链接的登录凭据（仅返回单条）。
  // 信任模型与 /api/links 一致（个人/局域网导航），用于 /login.html?id=<id> 自动填充登录。
  const credMatch = pathname.match(/^\/api\/cred\/(.+)$/);
  if (method === 'GET' && credMatch) {
    let id;
    try { id = decodeURIComponent(credMatch[1]); } catch (e) { id = credMatch[1]; }
    const data = loadLinks();
    let found = null;
    for (const cat in data) {
      const arr = Array.isArray(data[cat]) ? data[cat] : [];
      for (const it of arr) {
        if ((it.id || '') === id) { found = it; break; }
      }
      if (found) break;
    }
    if (!found) return sendJson(res, 404, { error: '未找到该链接' });
    const u = found.url || found.href || '';
    return sendJson(res, 200, {
      id: found.id || '',
      name: found.name || '',
      url: u,
      luser: found.luser || '',
      lpass: found.lpass || '',
      hasCred: !!((found.luser && String(found.luser).trim()) || (found.lpass && String(found.lpass).trim()))
    });
  }

  // 公开：健康检查
  if (method === 'GET' && pathname === '/api/health') {
    return sendJson(res, 200, { ok: true, version: VERSION });
  }

  // 公开：获取集成设置与站点外观（不含密码哈希）
  if (method === 'GET' && pathname === '/api/settings') {
    const s = CONFIG.searxng || {};
    return sendJson(res, 200, {
      searxng: {
        enabled: s.enabled !== false,
        defaultEngine: !!s.defaultEngine,
        newTab: s.newTab !== false,
        instance: s.url || ''
      },
      site: CONFIG.site || defaultSite()
    });
  }

  // 公开：综合搜索（代理到 SearXNG 的 JSON API）
  if (method === 'GET' && pathname === '/api/search') {
    return proxySearch(req, res, urlPath);
  }

  // 公开：代理获取站点 favicon（前端卡片自动显示图标）
  if (method === 'GET' && pathname === '/api/favicon') {
    return proxyFavicon(req, res, urlPath);
  }

  // 公开：鉴权状态
  if (method === 'GET' && pathname === '/api/me') {
    return sendJson(res, 200, { authenticated: getAuth(req) });
  }

  // 登录
  if (method === 'POST' && pathname === '/api/login') {
    const raw = await readBody(req);
    let body = {};
    try { body = JSON.parse(raw || '{}'); } catch (e) { /* ignore */ }
    const pw = body.password || '';
    if (hashPassword(pw) === CONFIG.passwordHash) {
      const token = issueToken();
      return sendJson(res, 200, { ok: true, expiresIn: TOKEN_TTL },
        { 'Set-Cookie': `qiyi_token=${token}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${Math.floor(TOKEN_TTL / 1000)}` });
    }
    return sendJson(res, 401, { error: '密码错误' });
  }

  // 忘记密码：凭重置令牌重置（无需旧密码）。令牌来源：环境变量 QY_RESET_TOKEN 或数据卷 reset-token.txt
  if (method === 'POST' && pathname === '/api/reset-password') {
    const raw = await readBody(req);
    let body = {};
    try { body = JSON.parse(raw || '{}'); } catch (e) { /* ignore */ }
    const token = String(body.token || '').trim();
    const newP = String(body.newPassword || '');
    // 先校验令牌（无效令牌直接拒绝，不暴露密码策略），再校验新密码长度
    const envToken = (process.env.QY_RESET_TOKEN || '').trim();
    let fileToken = '';
    const tokenFile = path.join(DATA_DIR, 'reset-token.txt');
    try { if (fs.existsSync(tokenFile)) fileToken = fs.readFileSync(tokenFile, 'utf8').trim(); } catch (e) { /* ignore */ }
    const valid = (envToken && token === envToken) || (fileToken && token === fileToken);
    if (!valid) {
      return sendJson(res, 401, { error: '重置令牌无效或已失效' });
    }
    if (newP.length < 6) {
      return sendJson(res, 400, { error: '新密码至少 6 位' });
    }
    CONFIG.passwordHash = hashPassword(newP);
    saveConfig(CONFIG);
    // 文件令牌用后即焚（环境变量令牌需自行移除 compose 中的 QY_RESET_TOKEN 行）
    if (fileToken && token === fileToken) {
      try { fs.unlinkSync(tokenFile); } catch (e) { /* ignore */ }
    }
    return sendJson(res, 200, { ok: true, message: '密码已重置，请用新密码登录' },
      { 'Set-Cookie': 'qiyi_token=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0' });
  }

  // 登出
  if (method === 'POST' && pathname === '/api/logout') {
    return sendJson(res, 200, { ok: true },
      { 'Set-Cookie': 'qiyi_token=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0' });
  }

  // 公开：版本更新检查（后台"有更新版"提示；仅返回版本信息，无敏感数据）
  if (method === 'GET' && pathname === '/api/update-check') {
    return fetchLatestVersion().then(function (d) { sendJson(res, 200, d); });
  }

  // 以下接口需要鉴权
  if (!getAuth(req)) {
    return sendJson(res, 401, { error: '未授权' });
  }

  // 抓取网页标题/图标（后台"自动获取"）
  if (method === 'GET' && pathname === '/api/meta') {
    return fetchMeta(req, res, urlPath);
  }

  // 导入浏览器书签 HTML（合并去重）
  if (method === 'POST' && pathname === '/api/import-html') {
    const r = await importHtml(req, res);
    prefetchAllFavicons(false).catch(() => {});
    return r;
  }

  // 保存全部链接（全量替换）
  if (method === 'PUT' && pathname === '/api/links') {
    const raw = await readBody(req);
    let body = {};
    try { body = JSON.parse(raw || '{}'); } catch (e) {
      return sendJson(res, 400, { error: 'JSON 解析失败' });
    }
    if (!body.data || typeof body.data !== 'object') {
      return sendJson(res, 400, { error: '缺少 data 字段' });
    }
    saveLinks(body.data);
    return sendJson(res, 200, { ok: true, updatedAt: new Date().toISOString() });
  }

  // 导入（与 PUT /api/links 等价，便于后台调用）
  if (method === 'POST' && pathname === '/api/import') {
    const raw = await readBody(req);
    let body = {};
    try { body = JSON.parse(raw || '{}'); } catch (e) {
      return sendJson(res, 400, { error: 'JSON 解析失败' });
    }
    if (!body.data || typeof body.data !== 'object') {
      return sendJson(res, 400, { error: '缺少 data 字段' });
    }
    saveLinks(body.data);
    prefetchAllFavicons(false).catch(() => {});
    return sendJson(res, 200, { ok: true, updatedAt: new Date().toISOString() });
  }

  // 统计
  if (method === 'GET' && pathname === '/api/stats') {
    const data = loadLinks();
    return sendJson(res, 200, Object.assign({ version: VERSION, updatedAt: new Date().toISOString() }, computeStats(data)));
  }

  // 导出（下载文件）
  if (method === 'GET' && pathname === '/api/export') {
    const data = loadLinks();
    const payload = JSON.stringify({ version: VERSION, exportDate: new Date().toISOString(), data }, null, 2);
    res.writeHead(200, {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': `attachment; filename="qiyi_nav_backup_${new Date().toISOString().slice(0, 10)}.json"`
    });
    res.end(payload);
    return;
  }

  // 修改密码
  if (method === 'POST' && pathname === '/api/change-password') {
    const raw = await readBody(req);
    let body = {};
    try { body = JSON.parse(raw || '{}'); } catch (e) { /* ignore */ }
    const oldP = body.oldPassword || '';
    const newP = body.newPassword || '';
    if (hashPassword(oldP) !== CONFIG.passwordHash) {
      return sendJson(res, 400, { error: '原密码不正确' });
    }
    if (newP.length < 6) {
      return sendJson(res, 400, { error: '新密码至少 6 位' });
    }
    CONFIG.passwordHash = hashPassword(newP);
    saveConfig(CONFIG);
    return sendJson(res, 200, { ok: true },
      { 'Set-Cookie': 'qiyi_token=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0' });
  }

  // 重置为默认数据
  if (method === 'POST' && pathname === '/api/reset') {
    ensureSeed();
    const seed = JSON.parse(fs.readFileSync(SEED_FILE, 'utf8'));
    saveLinks(seed);
    prefetchAllFavicons(false).catch(() => {});
    return sendJson(res, 200, { ok: true, updatedAt: new Date().toISOString() });
  }

  // 刷新全部站点图标（后台"刷新图标"按钮）：强制重抓并覆盖本地缓存
  if (method === 'POST' && pathname === '/api/favicons/refresh') {
    prefetchAllFavicons(true).catch(() => {});
    return sendJson(res, 200, { ok: true, msg: '图标刷新已在后台进行，稍后刷新页面即可生效' });
  }

  // 图标自检报告（鉴权）：列出未获得 favicon 的域名 + 成功率；?deep=1 在线探测可获取性
  if (method === 'GET' && pathname === '/api/icon-check') {
    const deep = /[?&]deep=1\b/.test(urlPath);
    try {
      return sendJson(res, 200, await checkIcons(deep));
    } catch (e) {
      return sendJson(res, 500, { error: '图标自检失败: ' + e.message });
    }
  }

  // 保存集成设置（SearXNG 等）
  if (method === 'PUT' && pathname === '/api/settings') {
    const raw = await readBody(req);
    let body = {};
    try { body = JSON.parse(raw || '{}'); } catch (e) {
      return sendJson(res, 400, { error: 'JSON 解析失败' });
    }
    if (body.searxng && typeof body.searxng === 'object') {
      const s = body.searxng;
      CONFIG.searxng = Object.assign({}, CONFIG.searxng || {}, {
        enabled: s.enabled !== false,
        url: (s.url && String(s.url).trim()) || (CONFIG.searxng && CONFIG.searxng.url) || 'http://searxng:8080',
        defaultEngine: !!s.defaultEngine,
        newTab: s.newTab !== false
      });
    }
    if (body.site && typeof body.site === 'object') {
      // 安全清理：禁止通过 PUT 改 logo（只能走 /api/site/upload-logo / clear-logo）
      delete body.site.frontendLogo;
      delete body.site.backendLogo;
      // quickSearches 防御性裁剪：每项 text/url 限制长度，最多 30 项
      if (Array.isArray(body.site.quickSearches)) {
        body.site.quickSearches = body.site.quickSearches
          .map(function (s) {
            return {
              text: String((s && s.text) || '').trim().slice(0, 20),
              url: String((s && s.url) || '').trim().slice(0, 500)
            };
          })
          .filter(function (s) { return s.text; })
          .slice(0, 30);
      }
      CONFIG.site = mergeSite(Object.assign({}, CONFIG.site || {}, body.site));
    }
    saveConfig(CONFIG);
    return sendJson(res, 200, { ok: true });
  }

  // 复原站点外观为出厂默认（不影响网址数据与 SearXNG 设置）
  if (method === 'POST' && pathname === '/api/site/reset') {
    // 同步清理上传的自定义 LOGO
    try {
      const dir = path.join(DATA_DIR, 'site');
      if (fs.existsSync(dir)) {
        for (const f of fs.readdirSync(dir)) {
          if (/^(frontend|backend)-logo\.(png|jpg|jpeg|gif|webp|svg)$/i.test(f)) {
            try { fs.unlinkSync(path.join(dir, f)); } catch (e) { /* ignore */ }
          }
        }
      }
    } catch (e) { /* ignore */ }
    CONFIG.site = defaultSite();
    saveConfig(CONFIG);
    return sendJson(res, 200, { ok: true, site: CONFIG.site });
  }

  // ==================== 自定义 LOGO 上传/清除/服务 ====================
  // 零依赖：前端把图片转 dataURL（base64）POST 上来；服务端落盘 data/site/<which>-logo.<ext>
  // 公开读取 /api/site/logo/<which>：未上传则 404，前端回退到 /assets/logo-default.png
  const SITE_LOGO_DIR = path.join(DATA_DIR, 'site');
  const LOGO_EXTS = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'];
  const DATAURL_RE = /^data:(image\/(png|jpe?g|gif|webp|svg\+xml));base64,(.+)$/i;

  // 提供自定义 LOGO（公开；无文件则 404）
  const logoMatch = pathname.match(/^\/api\/site\/logo\/(frontend|backend)$/);
  if (method === 'GET' && logoMatch) {
    const which = logoMatch[1];
    const cfg = CONFIG.site && CONFIG.site[which + 'Logo'];
    let filePath = null, ct = '';
    if (cfg && cfg.hasCustom && cfg.ext && LOGO_EXTS.indexOf(cfg.ext.toLowerCase()) >= 0) {
      const p = path.join(SITE_LOGO_DIR, which + '-logo.' + cfg.ext.toLowerCase());
      // 防穿越：解析后必须仍在 SITE_LOGO_DIR 下
      const resolved = path.resolve(p);
      if (resolved.startsWith(SITE_LOGO_DIR + path.sep) && fs.existsSync(resolved)) {
        filePath = resolved;
        const ext = cfg.ext.toLowerCase();
        ct = (ext === 'jpg' || ext === 'jpeg') ? 'image/jpeg'
          : ext === 'svg' ? 'image/svg+xml'
          : 'image/' + ext;
      }
    }
    if (!filePath) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' });
      return res.end('Not Found');
    }
    res.writeHead(200, { 'Content-Type': ct, 'Cache-Control': 'no-store' });
    return res.end(fs.readFileSync(filePath));
  }

  // 上传 LOGO（鉴权）
  if (method === 'POST' && pathname === '/api/site/upload-logo') {
    const raw = await readBody(req, 3 * 1024 * 1024);
    let body = {};
    try { body = JSON.parse(raw || '{}'); } catch (e) { return sendJson(res, 400, { error: 'JSON 解析失败' }); }
    const which = body.which;
    if (which !== 'frontend' && which !== 'backend') return sendJson(res, 400, { error: 'which 必须为 frontend 或 backend' });
    const m = DATAURL_RE.exec(String(body.dataUrl || ''));
    if (!m) return sendJson(res, 400, { error: 'dataUrl 格式无效（需 data:image/<png|jpeg|gif|webp|svg+xml>;base64,...）' });
    const mime = m[1].toLowerCase();
    let ext = 'png';
    if (mime === 'image/jpeg' || mime === 'image/jpg') ext = 'jpg';
    else if (mime === 'image/gif') ext = 'gif';
    else if (mime === 'image/webp') ext = 'webp';
    else if (mime === 'image/svg+xml') ext = 'svg';
    let buf;
    try { buf = Buffer.from(m[3], 'base64'); } catch (e) { return sendJson(res, 400, { error: 'base64 解码失败' }); }
    if (!buf || buf.length === 0) return sendJson(res, 400, { error: '图片为空' });
    if (buf.length > 2 * 1024 * 1024) return sendJson(res, 400, { error: '图片超过 2MB' });
    fs.mkdirSync(SITE_LOGO_DIR, { recursive: true });
    // 清理同前缀旧文件，避免残留
    try {
      for (const f of fs.readdirSync(SITE_LOGO_DIR)) {
        if (f.startsWith(which + '-logo.')) {
          try { fs.unlinkSync(path.join(SITE_LOGO_DIR, f)); } catch (e) { /* ignore */ }
        }
      }
    } catch (e) { /* ignore */ }
    const file = path.join(SITE_LOGO_DIR, which + '-logo.' + ext);
    fs.writeFileSync(file, buf);
    CONFIG.site = CONFIG.site || defaultSite();
    CONFIG.site[which + 'Logo'] = { hasCustom: true, ext: ext };
    saveConfig(CONFIG);
    return sendJson(res, 200, { ok: true, which: which, ext: ext, ts: Date.now() });
  }

  // 清除 LOGO（恢复默认；鉴权）
  if (method === 'POST' && pathname === '/api/site/clear-logo') {
    const raw = await readBody(req);
    let body = {};
    try { body = JSON.parse(raw || '{}'); } catch (e) { /* ignore */ }
    const which = body.which;
    if (which !== 'frontend' && which !== 'backend') return sendJson(res, 400, { error: 'which 必须为 frontend 或 backend' });
    try {
      if (fs.existsSync(SITE_LOGO_DIR)) {
        for (const f of fs.readdirSync(SITE_LOGO_DIR)) {
          if (f.startsWith(which + '-logo.')) {
            try { fs.unlinkSync(path.join(SITE_LOGO_DIR, f)); } catch (e) { /* ignore */ }
          }
        }
      }
    } catch (e) { /* ignore */ }
    CONFIG.site = CONFIG.site || defaultSite();
    CONFIG.site[which + 'Logo'] = { hasCustom: false, ext: '' };
    saveConfig(CONFIG);
    return sendJson(res, 200, { ok: true });
  }

  // ==================== 自建页面（后台「自建页面」管理） ====================
  // 列表
  if (method === 'GET' && pathname === '/api/pages') {
    if (!getAuth(req)) return sendJson(res, 401, { error: '未授权' });
    let list = [];
    try {
      list = fs.readdirSync(PAGES_DIR)
        .filter(function (f) { return /\.html?$/i.test(f); })
        .map(function (f) {
          const st = fs.statSync(path.join(PAGES_DIR, f));
          return { name: f, size: st.size, mtime: st.mtime.getTime() };
        })
        .sort(function (a, b) { return b.mtime - a.mtime; });
    } catch (e) { /* 空目录 */ }
    return sendJson(res, 200, { pages: list, dir: 'pages' });
  }

  // 创建 / 上传（文件名 + 内容）
  if (method === 'POST' && pathname === '/api/pages') {
    if (!getAuth(req)) return sendJson(res, 401, { error: '未授权' });
    const raw = await readBody(req, 2 * 1024 * 1024);
    let body = {};
    try { body = JSON.parse(raw || '{}'); } catch (e) { return sendJson(res, 400, { error: 'JSON 解析失败' }); }
    const name = safePageName(body.name || '');
    if (!name) return sendJson(res, 400, { error: '文件名非法（仅允许中文/字母/数字/下划线/连字符，扩展名 .html 或 .htm，最长 60 字）' });
    if (typeof body.content !== 'string') return sendJson(res, 400, { error: '缺少 content' });
    const file = path.join(PAGES_DIR, name);
    if (fs.existsSync(file)) return sendJson(res, 409, { error: '同名页面已存在，请改用「编辑」或换名' });
    try {
      fs.writeFileSync(file, body.content, 'utf8');
      return sendJson(res, 200, { ok: true, name: name, size: Buffer.byteLength(body.content, 'utf8') });
    } catch (e) { return sendJson(res, 500, { error: '写入失败: ' + e.message }); }
  }

  // 读取（编辑用）
  if (method === 'GET' && pathname.startsWith('/api/pages/')) {
    if (!getAuth(req)) return sendJson(res, 401, { error: '未授权' });
    const name = safePageName(pathname.slice('/api/pages/'.length));
    if (!name) return sendJson(res, 400, { error: '非法的页面名' });
    const file = path.join(PAGES_DIR, name);
    if (!fs.existsSync(file)) return sendJson(res, 404, { error: '页面不存在' });
    try {
      const content = fs.readFileSync(file, 'utf8');
      const st = fs.statSync(file);
      return sendJson(res, 200, { name: name, content: content, size: st.size, mtime: st.mtime.getTime() });
    } catch (e) { return sendJson(res, 500, { error: e.message }); }
  }

  // 更新（保存编辑）
  if (method === 'PUT' && pathname.startsWith('/api/pages/')) {
    if (!getAuth(req)) return sendJson(res, 401, { error: '未授权' });
    const name = safePageName(pathname.slice('/api/pages/'.length));
    if (!name) return sendJson(res, 400, { error: '非法的页面名' });
    const raw = await readBody(req, 2 * 1024 * 1024);
    let body = {};
    try { body = JSON.parse(raw || '{}'); } catch (e) { return sendJson(res, 400, { error: 'JSON 解析失败' }); }
    if (typeof body.content !== 'string') return sendJson(res, 400, { error: '缺少 content' });
    const file = path.join(PAGES_DIR, name);
    if (!fs.existsSync(file)) return sendJson(res, 404, { error: '页面不存在' });
    try {
      fs.writeFileSync(file, body.content, 'utf8');
      return sendJson(res, 200, { ok: true, name: name, size: Buffer.byteLength(body.content, 'utf8') });
    } catch (e) { return sendJson(res, 500, { error: '写入失败: ' + e.message }); }
  }

  // 删除
  if (method === 'DELETE' && pathname.startsWith('/api/pages/')) {
    if (!getAuth(req)) return sendJson(res, 401, { error: '未授权' });
    const name = safePageName(pathname.slice('/api/pages/'.length));
    if (!name) return sendJson(res, 400, { error: '非法的页面名' });
    const file = path.join(PAGES_DIR, name);
    if (!fs.existsSync(file)) return sendJson(res, 404, { error: '页面不存在' });
    try { fs.unlinkSync(file); return sendJson(res, 200, { ok: true, name: name }); }
    catch (e) { return sendJson(res, 500, { error: e.message }); }
  }

  // ==================== 数据备份 / 还原（保护升级不丢数据） ====================
  // 导出 DATA_DIR 全量为 zip（鉴权）
  if (method === 'GET' && pathname === '/api/backup') {
    if (!getAuth(req)) return sendJson(res, 401, { error: '未授权' });
    try {
      const entries = [];
      collectDataDir(DATA_DIR, '', entries);
      const zip = zipFiles(entries);
      const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      res.writeHead(200, {
        'Content-Type': 'application/zip',
        'Content-Disposition': 'attachment; filename="qiyi-nav-backup-' + ts + '.zip"',
        'Content-Length': zip.length,
        'Cache-Control': 'no-store'
      });
      return res.end(zip);
    } catch (e) {
      return sendJson(res, 500, { error: '备份失败: ' + e.message });
    }
  }

  // 还原：上传 zip（raw body），先自动备份当前数据到 backups/ 再覆盖写回（鉴权）
  if (method === 'POST' && pathname === '/api/restore') {
    if (!getAuth(req)) return sendJson(res, 401, { error: '未授权' });
    try {
      const raw = await readBodyBuffer(req, 50 * 1024 * 1024);
      let entries;
      try { entries = unzip(raw); }
      catch (e) { return sendJson(res, 400, { error: '不是有效的备份 zip: ' + e.message }); }
      if (!entries.length) return sendJson(res, 400, { error: '备份文件为空' });
      // 还原前先自动备份当前数据，便于回滚
      const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      const backupDir = path.join(DATA_DIR, 'backups');
      fs.mkdirSync(backupDir, { recursive: true });
      const preEntries = [];
      collectDataDir(DATA_DIR, '', preEntries);
      fs.writeFileSync(path.join(backupDir, 'pre-restore-' + ts + '.zip'), zipFiles(preEntries));
      // 清空 DATA_DIR 下除 backups 外的旧内容，再写回
      for (const it of fs.readdirSync(DATA_DIR)) {
        if (it === 'backups') continue;
        fs.rmSync(path.join(DATA_DIR, it), { recursive: true, force: true });
      }
      for (const e of entries) {
        const full = path.join(DATA_DIR, e.name);
        fs.mkdirSync(path.dirname(full), { recursive: true });
        fs.writeFileSync(full, e.data);
      }
      return sendJson(res, 200, { ok: true, restored: entries.length });
    } catch (e) {
      return sendJson(res, 500, { error: '还原失败: ' + e.message });
    }
  }

  return sendJson(res, 404, { error: '接口不存在' });
}

// ==================== SearXNG 代理 ====================
/**
 * 把 /api/search 代理到 SearXNG 实例的 JSON 搜索接口。
 * 采用服务端代理（而非前端直连），避免跨域、隐藏实例地址，并统一鉴权/限流入口。
 */
function proxySearch(req, res, urlPath) {
  const cfg = CONFIG.searxng || {};
  if (cfg.enabled === false) {
    return sendJson(res, 503, { error: '综合搜索(SearXNG)未启用' });
  }
  const targetBase = cfg.url || 'http://searxng:8080';

  // 解析查询参数（q 必填，engines/categories 可选）
  const qIndex = urlPath.indexOf('?');
  const qs = qIndex >= 0 ? urlPath.slice(qIndex + 1) : '';
  const params = new URLSearchParams(qs);
  const q = (params.get('q') || '').trim();
  if (!q) {
    return sendJson(res, 400, { error: '缺少查询参数 q' });
  }
  const engines = params.get('engines') || '';
  const categories = params.get('categories') || '';

  let target;
  try {
    const u = new URL(targetBase);
    const basePath = u.pathname.replace(/\/+$/, '');
    u.pathname = basePath + '/search';
    target = u;
  } catch (e) {
    return sendJson(res, 500, { error: 'SearXNG 地址配置无效: ' + targetBase });
  }
  target.searchParams.set('q', q);
  target.searchParams.set('format', 'json');
  if (engines) target.searchParams.set('engines', engines);
  if (categories) target.searchParams.set('categories', categories);

  const lib = target.protocol === 'https:' ? require('https') : require('http');
  const options = {
    method: 'GET',
    headers: {
      'User-Agent': 'qiyi-nav/2.1 (+https://github.com/searxng/searxng)',
      'Accept': 'application/json'
    },
    timeout: 8000
  };

  const upstream = lib.request(target, options, function (upRes) {
    let buf = '';
    upRes.on('data', function (c) { buf += c; });
    upRes.on('end', function () {
      if (upRes.statusCode !== 200) {
        return sendJson(res, 502, { error: 'SearXNG 返回状态 ' + upRes.statusCode });
      }
      let payload;
      try { payload = JSON.parse(buf); } catch (e) {
        return sendJson(res, 502, { error: 'SearXNG 响应不是合法 JSON' });
      }
      sendJson(res, 200, {
        instance: targetBase,
        query: q,
        results: Array.isArray(payload.results) ? payload.results : [],
        suggestions: Array.isArray(payload.suggestions) ? payload.suggestions : [],
        answers: Array.isArray(payload.answers) ? payload.answers : [],
        engines: Array.isArray(payload.engines) ? payload.engines : []
      });
    });
  });

  upstream.on('timeout', function () { upstream.destroy(new Error('timeout')); });
  upstream.on('error', function (e) {
    sendJson(res, 502, { error: '无法连接 SearXNG（' + targetBase + '）：' + e.message });
  });
  upstream.end();
}

// ==================== 请求入口 ====================
const server = http.createServer(async (req, res) => {
  try {
    const urlPath = req.url || '/';
    if (urlPath.startsWith('/api/')) {
      return await handleApi(req, res, urlPath);
    }
    if (urlPath.startsWith('/pages/')) {
      return serveUserPage(req, res, urlPath);
    }
    return serveStatic(req, res, urlPath);
  } catch (e) {
    console.error('请求处理异常:', e);
    if (!res.headersSent) sendJson(res, 500, { error: '服务器内部错误' });
  }
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`奇易智能导航系统 ${VERSION} 已启动: http://localhost:${PORT}`);
  console.log(`后台管理: http://localhost:${PORT}/admin.html`);
  console.log(`默认管理员密码: ${DEFAULT_PASSWORD}（请尽快在后台修改）`);
  // 启动后异步预抓取站点图标到本地缓存（首次打开首页秒显，不再逐张远程抓取）
  prefetchAllFavicons(false).catch((e) => console.error('[favicon] 启动预抓取异常:', e.message));
});
