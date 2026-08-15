/**
 * 奇易智能导航系统 - 零依赖后端服务器
 * 版本: 3.1.2
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

// ==================== 配置 ====================
const ROOT = __dirname;
const DATA_DIR = path.resolve(process.env.DATA_DIR || path.join(ROOT, 'data'));
const PORT = parseInt(process.env.PORT || '1315', 10);
const DEFAULT_PASSWORD = process.env.ADMIN_PASSWORD || 'admin';
const PEPPER = process.env.SESSION_SECRET || 'qiyi-nav-default-pepper';
const VERSION = '3.1.2';
const TOKEN_TTL = 7 * 24 * 3600 * 1000; // 7 天

fs.mkdirSync(DATA_DIR, { recursive: true });

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
        searxng: cfg.searxng || {
          enabled: true,
          url: process.env.SEARXNG_URL || 'http://searxng:8080',
          defaultEngine: false,
          newTab: true
        }
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
    searxng: {
      enabled: true,
      url: process.env.SEARXNG_URL || 'http://searxng:8080',
      defaultEngine: false,
      newTab: true
    }
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
    '    <span>版本: <span class="version">V3.1.2</span></span>',
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
      { text: '网络测速', href: 'TEST.html', icon: 'fas fa-tachometer-alt', target: '_blank' },
      { text: '税务计算器', href: 'customs.html', icon: 'fas fa-calculator', target: '_blank' },
      { text: '齿轮计算', href: '131.html', icon: 'fas fa-calculator', target: '_blank' },
      { text: '理财计算', href: 'zlcalculator.html', icon: 'fas fa-chart-line', target: '_blank' },
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
    backendLogo: { hasCustom: false, ext: '' }
  };
}

// 把已存 site 与默认值合并（数组整体替换，标量/对象补全），保证结构完整。
function mergeSite(existing) {
  const d = defaultSite();
  if (!existing || typeof existing !== 'object') return d;
  const out = Object.assign({}, d, existing);
  out.greeting = Object.assign({}, d.greeting, existing.greeting || {});
  out.footerLinks = Array.isArray(existing.footerLinks) ? existing.footerLinks : d.footerLinks;
  out.quickAccess = Array.isArray(existing.quickAccess) ? existing.quickAccess : d.quickAccess;
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
  return out;
}

let CONFIG = loadConfig();

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

  // 公开资源白名单：首页、后台页、css/ 、js/ 与 assets/（默认 logo 资源）
  // 从根本上杜绝 server.js / 配置文件 / data 目录被直接访问（含目录穿越）
  const allowed = rel === '/index.html' || rel === '/admin.html' ||
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

  // 公开：获取链接
  if (method === 'GET' && pathname === '/api/links') {
    const data = loadLinks();
    return sendJson(res, 200, { data, updatedAt: new Date().toISOString(), version: VERSION });
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

  // 登出
  if (method === 'POST' && pathname === '/api/logout') {
    return sendJson(res, 200, { ok: true },
      { 'Set-Cookie': 'qiyi_token=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0' });
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
