/**
 * 奇易智能导航系统 - 完整版主逻辑脚本
 * 版本: 13.6
 * 作者: 奇易科技
 * 功能: 七行五列布局 + 去图标化 + 完整权限管理 + 精准农历日期 + 问候语功能
 */

// ==================== 全局配置 ====================
const CONFIG = {
    VERSION: '3.3.01',
    DEFAULT_PASSWORD: 'admin',
    LINKS_PER_PAGE: 35,
    SEARCH_ENGINES: {
        'baidu': {
            name: '百度',
            url: 'https://www.baidu.com/s?wd=',
            icon: '🔍'
        },
        'google': {
            name: '谷歌',
            url: 'https://www.google.com/search?q=',
            icon: '🌐'
        },
        'bing': {
            name: '必应',
            url: 'https://www.bing.com/search?q=',
            icon: '🔎'
        },
        '360': {
            name: '360搜索',
            url: 'https://www.so.com/s?q=',
            icon: '🔍'
        },
        'searxng': {
            name: '综合(SearXNG)',
            url: '__searxng__',
            icon: '🧭'
        }
    },
    QUICK_SEARCHES: [
        { text: '天气预报', type: 'weather' },
        { text: '今日新闻', type: 'news' },
        { text: '股票行情', type: 'stock' },
        { text: '汇率换算', type: 'currency' },
        { text: '快递查询', type: 'express' },
        { text: '地图导航', type: 'map' }
    ],
    CATEGORIES: {
        'recommended': { name: '推荐网址', icon: 'fas fa-star' },
        'proxy': { name: '代理系统', icon: 'fas fa-server' },
        'internal': { name: '内部系统', icon: 'fas fa-building' },
        'software': { name: '软件工具', icon: 'fas fa-laptop' },
        'business': { name: '在线业务', icon: 'fas fa-briefcase' },
        'common': { name: '常用网址', icon: 'fas fa-globe' },
        'finance': { name: '财务理财', icon: 'fas fa-chart-line' },
        'work': { name: '工作工具', icon: 'fas fa-tools' },
        'side': { name: 'AI工具', icon: 'fas fa-robot' }
    }
};

// ==================== 图标自检占位 ====================
// favicon 加载失败时（/api/favicon 返回 404 或自定义图标地址失效）回退显示的内联 SVG 占位图标（齿轮：代表“自检/自动获取”）
const SELFCHECK_ICON_SVG = '<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" aria-hidden="true" focusable="false"><path d="M19.14 12.94c.04-.31.06-.63.06-.94s-.02-.63-.06-.94l2.03-1.58a.5.5 0 0 0 .12-.64l-1.92-3.32a.5.5 0 0 0-.6-.22l-2.39.96a7.03 7.03 0 0 0-1.62-.94l-.36-2.54a.5.5 0 0 0-.5-.42h-3.84a.5.5 0 0 0-.5.42l-.36 2.54a7.03 7.03 0 0 0-1.62.94l-2.39-.96a.5.5 0 0 0-.6.22L2.74 8.84a.5.5 0 0 0 .12.64l2.03 1.58c-.03.31-.05.62-.05.94s.02.63.05.94l-2.03 1.58a.5.5 0 0 0-.12.64l1.92 3.32a.5.5 0 0 0 .6.22l2.39-.96c.5.38 1.04.7 1.62.94l.36 2.54a.5.5 0 0 0 .5.42h3.84a.5.5 0 0 0 .5-.42l.36-2.54c.58-.24 1.12-.56 1.62-.94l2.39.96a.5.5 0 0 0 .6-.22l1.92-3.32a.5.5 0 0 0-.12-.64l-2.03-1.58zM12 15.5A3.5 3.5 0 1 1 12 8.5a3.5 3.5 0 0 1 0 7z"/></svg>';

// favicon 加载失败时调用：用占位图标替换 <img>，避免空白/裂图；仅替换一次（dataset.fb 防重复）
window.qiyiFaviconFallback = function (img) {
    if (!img || img.dataset.fb) return;
    img.dataset.fb = '1';
    const span = document.createElement('span');
    span.className = 'link-icon link-icon-missing';
    span.innerHTML = SELFCHECK_ICON_SVG;
    if (img.parentNode) img.parentNode.replaceChild(span, img);
};

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

// 站点外观默认配置（与后端 defaultSite 保持一致；无后端时作为兜底）
const DEFAULT_SITE = {
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
    // 搜索栏快捷项：{text, url}。url 含 {q} 时用 item.text 替换打开；url 为空走填搜索框
    quickSearches: [
        { text: '天气预报', url: '' },
        { text: '今日新闻', url: '' },
        { text: '股票行情', url: '' },
        { text: '汇率换算', url: '' },
        { text: '快递查询', url: '' },
        { text: '地图导航', url: '' }
    ],
    // 自定义 LOGO：hasCustom=true 时前端加载 /api/site/logo/<which>，否则回退 /assets/logo-default.png
    frontendLogo: { hasCustom: false, ext: '' },
    backendLogo: { hasCustom: false, ext: '' },
    // 动态背景：效果（none/particles/glow/aurora）与应用页面（frontend/backend/both）
    bgEffect: 'particles',
    bgTarget: 'frontend',
    // 默认搜索引擎（后台「外观」设置；首页进入预选该引擎）
    searchEngine: 'baidu',
    // 首页页首「天气区」嵌入代码（V3.2.33 出厂默认留空 → 启用内置天气组件；
    // 若在后台填了自定义 iframe 嵌入代码（如中国天气网天气条）则优先使用自定义代码）
    weatherCode: '',
    // 内置天气组件城市（后台「外观」可改；数据源 wttr.in 免密钥，默认广州）
    weatherCity: '广州',
    // 首页进入「开幕动画」开关
    splash: true
};

// 合并站点外观配置（补齐缺失字段，避免渲染报错）
function normalizeSite(s) {
    const d = DEFAULT_SITE;
    if (!s || typeof s !== 'object') return JSON.parse(JSON.stringify(d));
    const out = JSON.parse(JSON.stringify(d));
    if (s.greeting && typeof s.greeting === 'object') Object.assign(out.greeting, s.greeting);
    if (typeof s.headerHtml === 'string') out.headerHtml = s.headerHtml;
    out.footerHtml = (typeof s.footerHtml === 'string' && s.footerHtml.length) ? s.footerHtml : DEFAULT_FOOTER_HTML;
    if (typeof s.customCss === 'string') out.customCss = s.customCss;
    if (Array.isArray(s.footerLinks)) out.footerLinks = s.footerLinks;
    if (Array.isArray(s.quickAccess)) out.quickAccess = s.quickAccess;
    if (Array.isArray(s.tabs)) out.tabs = s.tabs;
    if (Array.isArray(s.quickSearches)) out.quickSearches = s.quickSearches.map(function (it) {
        return { text: String((it && it.text) || '').trim().slice(0, 20), url: String((it && it.url) || '').trim().slice(0, 500) };
    }).filter(function (it) { return it.text; }).slice(0, 30);
    if (s.frontendLogo && typeof s.frontendLogo === 'object') {
        out.frontendLogo = { hasCustom: !!s.frontendLogo.hasCustom, ext: String(s.frontendLogo.ext || '') };
    }
    if (s.backendLogo && typeof s.backendLogo === 'object') {
        out.backendLogo = { hasCustom: !!s.backendLogo.hasCustom, ext: String(s.backendLogo.ext || '') };
    }
    if (s.bgEffect && ['none', 'particles', 'glow', 'aurora'].indexOf(s.bgEffect) >= 0) out.bgEffect = s.bgEffect;
    if (s.bgTarget && ['frontend', 'backend', 'both'].indexOf(s.bgTarget) >= 0) out.bgTarget = s.bgTarget;
    if (s.searchEngine && ['baidu', 'google', 'bing', '360', 'searxng'].indexOf(s.searchEngine) >= 0) out.searchEngine = s.searchEngine;
    if (typeof s.weatherCode === 'string') out.weatherCode = s.weatherCode;
    if (typeof s.weatherCity === 'string' && s.weatherCity.trim()) out.weatherCity = s.weatherCity.trim();
    if (typeof s.splash === 'boolean') out.splash = s.splash;
    return out;
}

// ==================== 应用状态管理 ====================
const APP_STATE = {
    hasPermission: false,
    backendMode: false,
    site: DEFAULT_SITE,
    editMode: false,
    permissionTimeout: null,
    PERMISSION_DURATION: 30 * 60 * 1000,
    currentTab: 'recommended',
    currentPage: 1,
    totalPages: 1,
    linksPerPage: CONFIG.LINKS_PER_PAGE,
    currentSearchEngine: 'baidu',
    searchHistory: [],
    MAX_SEARCH_HISTORY: 20,
    darkMode: true,
    linkData: {},
    filteredLinks: [],
    visitCount: 0,
    todayVisits: 0,
    lastVisitDate: null,
    editingLink: null,
    batchMode: false,
    selectedLinks: new Set(),
    menuVisible: false,
    greetingTimeout: null
};

// ==================== 农历计算工具函数 ====================

/**
 * 精准农历计算工具类
 * 使用2026年精确农历数据，确保农历日期准确
 */
class LunarCalendar {
    // 2026年（丙午马年）农历数据 - 修正版
    static lunar2026Data = {
        // 2026年（丙午马年）完整农历数据 - 精确天文计算
        // 格式: 'MM-DD': {month: 农历月, day: 农历日}
        '01-01': {month: 11, day: 13}, '01-02': {month: 11, day: 14}, '01-03': {month: 11, day: 15},
        '01-04': {month: 11, day: 16}, '01-05': {month: 11, day: 17}, '01-06': {month: 11, day: 18},
        '01-07': {month: 11, day: 19}, '01-08': {month: 11, day: 20}, '01-09': {month: 11, day: 21},
        '01-10': {month: 11, day: 22}, '01-11': {month: 11, day: 23}, '01-12': {month: 11, day: 24},
        '01-13': {month: 11, day: 25}, '01-14': {month: 11, day: 26}, '01-15': {month: 11, day: 27},
        '01-16': {month: 11, day: 28}, '01-17': {month: 11, day: 29}, '01-18': {month: 11, day: 30},
        '01-19': {month: 12, day: 1}, '01-20': {month: 12, day: 2}, '01-21': {month: 12, day: 3},
        '01-22': {month: 12, day: 4}, '01-23': {month: 12, day: 5}, '01-24': {month: 12, day: 6},
        '01-25': {month: 12, day: 7}, '01-26': {month: 12, day: 8}, '01-27': {month: 12, day: 9},
        '01-28': {month: 12, day: 10}, '01-29': {month: 12, day: 11}, '01-30': {month: 12, day: 12},
        '01-31': {month: 12, day: 13}, '02-01': {month: 12, day: 14}, '02-02': {month: 12, day: 15},
        '02-03': {month: 12, day: 16}, '02-04': {month: 12, day: 17}, '02-05': {month: 12, day: 18},
        '02-06': {month: 12, day: 19}, '02-07': {month: 12, day: 20}, '02-08': {month: 12, day: 21},
        '02-09': {month: 12, day: 22}, '02-10': {month: 12, day: 23}, '02-11': {month: 12, day: 24},
        '02-12': {month: 12, day: 25}, '02-13': {month: 12, day: 26}, '02-14': {month: 12, day: 27},
        '02-15': {month: 12, day: 28}, '02-16': {month: 12, day: 29}, '02-17': {month: 1, day: 1},
        '02-18': {month: 1, day: 2}, '02-19': {month: 1, day: 3}, '02-20': {month: 1, day: 4},
        '02-21': {month: 1, day: 5}, '02-22': {month: 1, day: 6}, '02-23': {month: 1, day: 7},
        '02-24': {month: 1, day: 8}, '02-25': {month: 1, day: 9}, '02-26': {month: 1, day: 10},
        '02-27': {month: 1, day: 11}, '02-28': {month: 1, day: 12}, '03-01': {month: 1, day: 13},
        '03-02': {month: 1, day: 14}, '03-03': {month: 1, day: 15}, '03-04': {month: 1, day: 16},
        '03-05': {month: 1, day: 17}, '03-06': {month: 1, day: 18}, '03-07': {month: 1, day: 19},
        '03-08': {month: 1, day: 20}, '03-09': {month: 1, day: 21}, '03-10': {month: 1, day: 22},
        '03-11': {month: 1, day: 23}, '03-12': {month: 1, day: 24}, '03-13': {month: 1, day: 25},
        '03-14': {month: 1, day: 26}, '03-15': {month: 1, day: 27}, '03-16': {month: 1, day: 28},
        '03-17': {month: 1, day: 29}, '03-18': {month: 1, day: 30}, '03-19': {month: 2, day: 1},
        '03-20': {month: 2, day: 2}, '03-21': {month: 2, day: 3}, '03-22': {month: 2, day: 4},
        '03-23': {month: 2, day: 5}, '03-24': {month: 2, day: 6}, '03-25': {month: 2, day: 7},
        '03-26': {month: 2, day: 8}, '03-27': {month: 2, day: 9}, '03-28': {month: 2, day: 10},
        '03-29': {month: 2, day: 11}, '03-30': {month: 2, day: 12}, '03-31': {month: 2, day: 13},
        '04-01': {month: 2, day: 14}, '04-02': {month: 2, day: 15}, '04-03': {month: 2, day: 16},
        '04-04': {month: 2, day: 17}, '04-05': {month: 2, day: 18}, '04-06': {month: 2, day: 19},
        '04-07': {month: 2, day: 20}, '04-08': {month: 2, day: 21}, '04-09': {month: 2, day: 22},
        '04-10': {month: 2, day: 23}, '04-11': {month: 2, day: 24}, '04-12': {month: 2, day: 25},
        '04-13': {month: 2, day: 26}, '04-14': {month: 2, day: 27}, '04-15': {month: 2, day: 28},
        '04-16': {month: 2, day: 29}, '04-17': {month: 3, day: 1}, '04-18': {month: 3, day: 2},
        '04-19': {month: 3, day: 3}, '04-20': {month: 3, day: 4}, '04-21': {month: 3, day: 5},
        '04-22': {month: 3, day: 6}, '04-23': {month: 3, day: 7}, '04-24': {month: 3, day: 8},
        '04-25': {month: 3, day: 9}, '04-26': {month: 3, day: 10}, '04-27': {month: 3, day: 11},
        '04-28': {month: 3, day: 12}, '04-29': {month: 3, day: 13}, '04-30': {month: 3, day: 14},
        '05-01': {month: 3, day: 15}, '05-02': {month: 3, day: 16}, '05-03': {month: 3, day: 17},
        '05-04': {month: 3, day: 18}, '05-05': {month: 3, day: 19}, '05-06': {month: 3, day: 20},
        '05-07': {month: 3, day: 21}, '05-08': {month: 3, day: 22}, '05-09': {month: 3, day: 23},
        '05-10': {month: 3, day: 24}, '05-11': {month: 3, day: 25}, '05-12': {month: 3, day: 26},
        '05-13': {month: 3, day: 27}, '05-14': {month: 3, day: 28}, '05-15': {month: 3, day: 29},
        '05-16': {month: 3, day: 30}, '05-17': {month: 4, day: 1}, '05-18': {month: 4, day: 2},
        '05-19': {month: 4, day: 3}, '05-20': {month: 4, day: 4}, '05-21': {month: 4, day: 5},
        '05-22': {month: 4, day: 6}, '05-23': {month: 4, day: 7}, '05-24': {month: 4, day: 8},
        '05-25': {month: 4, day: 9}, '05-26': {month: 4, day: 10}, '05-27': {month: 4, day: 11},
        '05-28': {month: 4, day: 12}, '05-29': {month: 4, day: 13}, '05-30': {month: 4, day: 14},
        '05-31': {month: 4, day: 15}, '06-01': {month: 4, day: 16}, '06-02': {month: 4, day: 17},
        '06-03': {month: 4, day: 18}, '06-04': {month: 4, day: 19}, '06-05': {month: 4, day: 20},
        '06-06': {month: 4, day: 21}, '06-07': {month: 4, day: 22}, '06-08': {month: 4, day: 23},
        '06-09': {month: 4, day: 24}, '06-10': {month: 4, day: 25}, '06-11': {month: 4, day: 26},
        '06-12': {month: 4, day: 27}, '06-13': {month: 4, day: 28}, '06-14': {month: 4, day: 29},
        '06-15': {month: 5, day: 1}, '06-16': {month: 5, day: 2}, '06-17': {month: 5, day: 3},
        '06-18': {month: 5, day: 4}, '06-19': {month: 5, day: 5}, '06-20': {month: 5, day: 6},
        '06-21': {month: 5, day: 7}, '06-22': {month: 5, day: 8}, '06-23': {month: 5, day: 9},
        '06-24': {month: 5, day: 10}, '06-25': {month: 5, day: 11}, '06-26': {month: 5, day: 12},
        '06-27': {month: 5, day: 13}, '06-28': {month: 5, day: 14}, '06-29': {month: 5, day: 15},
        '06-30': {month: 5, day: 16}, '07-01': {month: 5, day: 17}, '07-02': {month: 5, day: 18},
        '07-03': {month: 5, day: 19}, '07-04': {month: 5, day: 20}, '07-05': {month: 5, day: 21},
        '07-06': {month: 5, day: 22}, '07-07': {month: 5, day: 23}, '07-08': {month: 5, day: 24},
        '07-09': {month: 5, day: 25}, '07-10': {month: 5, day: 26}, '07-11': {month: 5, day: 27},
        '07-12': {month: 5, day: 28}, '07-13': {month: 5, day: 29}, '07-14': {month: 6, day: 1},
        '07-15': {month: 6, day: 2}, '07-16': {month: 6, day: 3}, '07-17': {month: 6, day: 4},
        '07-18': {month: 6, day: 5}, '07-19': {month: 6, day: 6}, '07-20': {month: 6, day: 7},
        '07-21': {month: 6, day: 8}, '07-22': {month: 6, day: 9}, '07-23': {month: 6, day: 10},
        '07-24': {month: 6, day: 11}, '07-25': {month: 6, day: 12}, '07-26': {month: 6, day: 13},
        '07-27': {month: 6, day: 14}, '07-28': {month: 6, day: 15}, '07-29': {month: 6, day: 16},
        '07-30': {month: 6, day: 17}, '07-31': {month: 6, day: 18}, '08-01': {month: 6, day: 19},
        '08-02': {month: 6, day: 20}, '08-03': {month: 6, day: 21}, '08-04': {month: 6, day: 22},
        '08-05': {month: 6, day: 23}, '08-06': {month: 6, day: 24}, '08-07': {month: 6, day: 25},
        '08-08': {month: 6, day: 26}, '08-09': {month: 6, day: 27}, '08-10': {month: 6, day: 28},
        '08-11': {month: 6, day: 29}, '08-12': {month: 6, day: 30}, '08-13': {month: 7, day: 1},
        '08-14': {month: 7, day: 2}, '08-15': {month: 7, day: 3}, '08-16': {month: 7, day: 4},
        '08-17': {month: 7, day: 5}, '08-18': {month: 7, day: 6}, '08-19': {month: 7, day: 7},
        '08-20': {month: 7, day: 8}, '08-21': {month: 7, day: 9}, '08-22': {month: 7, day: 10},
        '08-23': {month: 7, day: 11}, '08-24': {month: 7, day: 12}, '08-25': {month: 7, day: 13},
        '08-26': {month: 7, day: 14}, '08-27': {month: 7, day: 15}, '08-28': {month: 7, day: 16},
        '08-29': {month: 7, day: 17}, '08-30': {month: 7, day: 18}, '08-31': {month: 7, day: 19},
        '09-01': {month: 7, day: 20}, '09-02': {month: 7, day: 21}, '09-03': {month: 7, day: 22},
        '09-04': {month: 7, day: 23}, '09-05': {month: 7, day: 24}, '09-06': {month: 7, day: 25},
        '09-07': {month: 7, day: 26}, '09-08': {month: 7, day: 27}, '09-09': {month: 7, day: 28},
        '09-10': {month: 7, day: 29}, '09-11': {month: 8, day: 1}, '09-12': {month: 8, day: 2},
        '09-13': {month: 8, day: 3}, '09-14': {month: 8, day: 4}, '09-15': {month: 8, day: 5},
        '09-16': {month: 8, day: 6}, '09-17': {month: 8, day: 7}, '09-18': {month: 8, day: 8},
        '09-19': {month: 8, day: 9}, '09-20': {month: 8, day: 10}, '09-21': {month: 8, day: 11},
        '09-22': {month: 8, day: 12}, '09-23': {month: 8, day: 13}, '09-24': {month: 8, day: 14},
        '09-25': {month: 8, day: 15}, '09-26': {month: 8, day: 16}, '09-27': {month: 8, day: 17},
        '09-28': {month: 8, day: 18}, '09-29': {month: 8, day: 19}, '09-30': {month: 8, day: 20},
        '10-01': {month: 8, day: 21}, '10-02': {month: 8, day: 22}, '10-03': {month: 8, day: 23},
        '10-04': {month: 8, day: 24}, '10-05': {month: 8, day: 25}, '10-06': {month: 8, day: 26},
        '10-07': {month: 8, day: 27}, '10-08': {month: 8, day: 28}, '10-09': {month: 8, day: 29},
        '10-10': {month: 9, day: 1}, '10-11': {month: 9, day: 2}, '10-12': {month: 9, day: 3},
        '10-13': {month: 9, day: 4}, '10-14': {month: 9, day: 5}, '10-15': {month: 9, day: 6},
        '10-16': {month: 9, day: 7}, '10-17': {month: 9, day: 8}, '10-18': {month: 9, day: 9},
        '10-19': {month: 9, day: 10}, '10-20': {month: 9, day: 11}, '10-21': {month: 9, day: 12},
        '10-22': {month: 9, day: 13}, '10-23': {month: 9, day: 14}, '10-24': {month: 9, day: 15},
        '10-25': {month: 9, day: 16}, '10-26': {month: 9, day: 17}, '10-27': {month: 9, day: 18},
        '10-28': {month: 9, day: 19}, '10-29': {month: 9, day: 20}, '10-30': {month: 9, day: 21},
        '10-31': {month: 9, day: 22}, '11-01': {month: 9, day: 23}, '11-02': {month: 9, day: 24},
        '11-03': {month: 9, day: 25}, '11-04': {month: 9, day: 26}, '11-05': {month: 9, day: 27},
        '11-06': {month: 9, day: 28}, '11-07': {month: 9, day: 29}, '11-08': {month: 9, day: 30},
        '11-09': {month: 10, day: 1}, '11-10': {month: 10, day: 2}, '11-11': {month: 10, day: 3},
        '11-12': {month: 10, day: 4}, '11-13': {month: 10, day: 5}, '11-14': {month: 10, day: 6},
        '11-15': {month: 10, day: 7}, '11-16': {month: 10, day: 8}, '11-17': {month: 10, day: 9},
        '11-18': {month: 10, day: 10}, '11-19': {month: 10, day: 11}, '11-20': {month: 10, day: 12},
        '11-21': {month: 10, day: 13}, '11-22': {month: 10, day: 14}, '11-23': {month: 10, day: 15},
        '11-24': {month: 10, day: 16}, '11-25': {month: 10, day: 17}, '11-26': {month: 10, day: 18},
        '11-27': {month: 10, day: 19}, '11-28': {month: 10, day: 20}, '11-29': {month: 10, day: 21},
        '11-30': {month: 10, day: 22}, '12-01': {month: 10, day: 23}, '12-02': {month: 10, day: 24},
        '12-03': {month: 10, day: 25}, '12-04': {month: 10, day: 26}, '12-05': {month: 10, day: 27},
        '12-06': {month: 10, day: 28}, '12-07': {month: 10, day: 29}, '12-08': {month: 10, day: 30},
        '12-09': {month: 11, day: 1}, '12-10': {month: 11, day: 2}, '12-11': {month: 11, day: 3},
        '12-12': {month: 11, day: 4}, '12-13': {month: 11, day: 5}, '12-14': {month: 11, day: 6},
        '12-15': {month: 11, day: 7}, '12-16': {month: 11, day: 8}, '12-17': {month: 11, day: 9},
        '12-18': {month: 11, day: 10}, '12-19': {month: 11, day: 11}, '12-20': {month: 11, day: 12},
        '12-21': {month: 11, day: 13}, '12-22': {month: 11, day: 14}, '12-23': {month: 11, day: 15},
        '12-24': {month: 11, day: 16}, '12-25': {month: 11, day: 17}, '12-26': {month: 11, day: 18},
        '12-27': {month: 11, day: 19}, '12-28': {month: 11, day: 20}, '12-29': {month: 11, day: 21},
        '12-30': {month: 11, day: 22}, '12-31': {month: 11, day: 23},
    };

    // 天干
    static heavenlyStems = ["甲", "乙", "丙", "丁", "戊", "己", "庚", "辛", "壬", "癸"];

    // 地支
    static earthlyBranches = ["子", "丑", "寅", "卯", "辰", "巳", "午", "未", "申", "酉", "戌", "亥"];

    // 生肖
    static zodiacAnimals = ["鼠", "牛", "虎", "兔", "龙", "蛇", "马", "羊", "猴", "鸡", "狗", "猪"];

    // 月份名称
    static lunarMonths = ["正月", "二月", "三月", "四月", "五月", "六月", "七月", "八月", "九月", "十月", "冬月", "腊月"];

    // 日期名称
    static lunarDays = ["初一", "初二", "初三", "初四", "初五", "初六", "初七", "初八", "初九", "初十",
                       "十一", "十二", "十三", "十四", "十五", "十六", "十七", "十八", "十九", "二十",
                       "廿一", "廿二", "廿三", "廿四", "廿五", "廿六", "廿七", "廿八", "廿九", "三十"];

    /**
     * 获取今天的农历日期（2026年准确版）
     */
    static getTodayLunarDate(date = new Date()) {
        try {
            const year = date.getFullYear();
            const month = date.getMonth() + 1;
            const day = date.getDate();

            // 生成日期键
            const dateKey = `${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

            // 计算天干地支（2026年是丙午年，马年）
            // 天干计算：(year - 4) % 10
            // 地支计算：(year - 4) % 12
            const stemIndex = (year - 4) % 10;
            const branchIndex = (year - 4) % 12;
            const heavenlyStem = this.heavenlyStems[stemIndex];
            const earthlyBranch = this.earthlyBranches[branchIndex];
            const zodiac = this.zodiacAnimals[branchIndex];

            // 查找农历日期
            let lunarMonth = 1;
            let lunarDay = 1;

            if (this.lunar2026Data[dateKey]) {
                // 有精确数据
                lunarMonth = this.lunar2026Data[dateKey].month;
                lunarDay = this.lunar2026Data[dateKey].day;
            } else {
                // 没有精确数据，使用估算算法
                // 2026年春节是2月17日
                const springFestival = new Date(2026, 1, 17); // 2月17日
                const today = new Date(year, month - 1, day);
                const diffDays = Math.floor((today - springFestival) / (1000 * 60 * 60 * 24));

                if (diffDays >= 0) {
                    // 春节后
                    lunarMonth = 1 + Math.floor(diffDays / 30);
                    lunarDay = 1 + (diffDays % 30);
                } else {
                    // 春节前（属于上一年农历腊月）
                    lunarMonth = 12;
                    lunarDay = 30 + diffDays;
                }

                // 边界处理
                if (lunarMonth < 1) lunarMonth = 1;
                if (lunarMonth > 12) lunarMonth = 12;
                if (lunarDay < 1) lunarDay = 1;
                if (lunarDay > 30) {
                    lunarMonth += 1;
                    lunarDay -= 30;
                }
            }

            const lunarMonthName = this.lunarMonths[lunarMonth - 1] || "正月";
            const lunarDayName = this.lunarDays[lunarDay - 1] || "初一";

            return {
                year: year,
                month: lunarMonth,
                day: lunarDay,
                heavenlyStem: heavenlyStem,
                earthlyBranch: earthlyBranch,
                zodiac: zodiac,
                lunarMonthName: lunarMonthName,
                lunarDayName: lunarDayName,
                fullName: `${heavenlyStem}${earthlyBranch}年 ${zodiac}年 ${lunarMonthName}${lunarDayName}`
            };
        } catch (error) {
            console.error('计算农历日期失败:', error);
            return null;
        }
    }

    /**
     * 获取农历日期字符串
     */
    static getLunarDateString(date = new Date()) {
        try {
            const lunar = this.getTodayLunarDate(date);
            if (!lunar) {
                return "农历日期获取失败";
            }

            // 获取节气信息
            const month = date.getMonth() + 1;
            const day = date.getDate();
            let solarTerm = '';
            
            // 24节气检查
            if (month === 2 && day === 4) solarTerm = ' (立春)';
            else if (month === 2 && day === 19) solarTerm = ' (雨水)';
            else if (month === 3 && day === 5) solarTerm = ' (惊蛰)';
            else if (month === 3 && day === 20) solarTerm = ' (春分)';
            else if (month === 4 && day === 4) solarTerm = ' (清明)';
            else if (month === 4 && day === 20) solarTerm = ' (谷雨)';

            return `${lunar.heavenlyStem}${lunar.earthlyBranch}年 ${lunar.zodiac}年 ${lunar.lunarMonthName}${lunar.lunarDayName}${solarTerm}`;
        } catch (error) {
            console.error('计算农历日期失败:', error);
            return "农历日期计算中...";
        }
    }

    /**
     * 检查是否是周末
     */
    static isWeekend(date = new Date()) {
        const day = date.getDay();
        return day === 0 || day === 6;  // 0是周日，6是周六
    }

    /**
     * 检查是否是农历节日
     */
    static checkLunarFestival(lunarMonth, lunarDay) {
        // 农历节日对照表
        const festivals = {
            '1-1': '春节',
            '1-15': '元宵节',
            '2-2': '龙抬头',
            '5-5': '端午节',
            '7-7': '七夕',
            '7-15': '中元节',
            '8-15': '中秋节',
            '9-9': '重阳节',
            '12-8': '腊八节',
            '12-23': '小年',
            '12-30': '除夕'
        };

        const key = `${lunarMonth}-${lunarDay}`;
        return festivals[key] || null;
    }
}

// ==================== 问候语功能 ====================

/**
 * 获取时间段问候语
 */
function getTimeBasedGreeting() {
    const now = new Date();
    const hour = now.getHours();
    const weekdays = ['日', '一', '二', '三', '四', '五', '六'];
    const weekday = weekdays[now.getDay()];

    let greeting = '';

    if (hour >= 5 && hour < 8) {
        greeting = '清晨好！🌅 新的一天开始了，愿您有个美好的开始！';
    } else if (hour >= 8 && hour < 12) {
        greeting = '上午好！☀️ 祝您工作顺利，精神饱满！';
    } else if (hour >= 12 && hour < 14) {
        greeting = '中午好！🍚 用餐愉快，记得休息片刻哦！';
    } else if (hour >= 14 && hour < 18) {
        greeting = '下午好！🌤️ 保持专注，高效工作！';
    } else if (hour >= 18 && hour < 22) {
        greeting = '晚上好！🌙 放松一下，享受夜晚时光！';
    } else if (hour >= 22 || hour < 5) {
        greeting = '深夜好！🌃 夜深了，注意休息，晚安！';
    }

    // 添加特殊日期问候
    const month = now.getMonth() + 1;
    const date = now.getDate();
    const lunarInfo = LunarCalendar.getTodayLunarDate(now);

    if (lunarInfo) {
        const festival = LunarCalendar.checkLunarFestival(lunarInfo.month, lunarInfo.day);
        if (festival) {
            greeting = `${festival}快乐！🎉 ${greeting}`;
        }
    }

    // 周末特殊问候
    if (hour >= 8 && (now.getDay() === 0 || now.getDay() === 6)) {
        greeting = '周末愉快！🎈 ' + (greeting || '放松心情，享受美好时光！');
    }

    return greeting || `您好！今天是周${weekday}，祝您使用愉快！`;
}

/**
 * 解析问候语文案
 * - 自定义模式：直接返回 text
 * - 自动模式：按当前 HH:MM 匹配分时段文案（时间重叠取第一个匹配），无匹配回退首个时段或硬编码兜底
 */
function resolveGreetingText(g) {
    g = g || DEFAULT_SITE.greeting;
    if (g.mode === 'custom' && g.text) {
        return g.text;
    }
    const segs = (g.segments && g.segments.length) ? g.segments : DEFAULT_SITE.greeting.segments;
    const now = new Date();
    const hhmm = String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0');
    for (let i = 0; i < segs.length; i++) {
        const s = segs[i];
        if (s.start && s.end && hhmm >= s.start && hhmm <= s.end) {
            return s.text || '';
        }
    }
    return (segs[0] && segs[0].text) || getTimeBasedGreeting();
}

/**
 * 显示问候语
 */
function showGreeting() {
    const greetingContainer = document.getElementById('greeting-container');
    const greetingText = document.getElementById('greeting-text');

    if (!greetingContainer || !greetingText) return;

    // 后台可关闭问候语横幅
    const g = (APP_STATE.site && APP_STATE.site.greeting) || DEFAULT_SITE.greeting;
    if (g.enabled === false) {
        hideGreeting();
        return;
    }

    // 自定义文案优先，否则按当前时间匹配分时段问候
    greetingText.textContent = resolveGreetingText(g);

    // 显示问候语（触发顶部弹性滑入动画 + 30 秒倒计时进度条）
    greetingContainer.classList.remove('hidden');
    greetingContainer.classList.add('visible');
    restartGreetingProgress(greetingContainer);

    // 清除之前的定时器
    if (APP_STATE.greetingTimeout) {
        clearTimeout(APP_STATE.greetingTimeout);
    }

    // 30秒后自动隐藏
    APP_STATE.greetingTimeout = setTimeout(() => {
        hideGreeting();
    }, 30000); // 30秒

    // 保存显示状态
    localStorage.setItem('qiyiGreetingShown', new Date().toDateString());
    logActivity('显示问候语', 'info');
}

/**
 * 隐藏问候语
 */
function hideGreeting() {
    const greetingContainer = document.getElementById('greeting-container');
    if (greetingContainer) {
        greetingContainer.classList.remove('visible');
        greetingContainer.classList.add('hidden');
        stopGreetingProgress(greetingContainer);
        logActivity('问候语已隐藏', 'info');
    }
}

/**
 * 重启 30 秒倒计时进度条动画（V3.2.33）
 */
function restartGreetingProgress(container) {
    const bar = container && container.querySelector('.greeting-progress');
    if (!bar) return;
    bar.style.animation = 'none';
    void bar.offsetWidth; // 强制重排以重启动画
    bar.style.animation = '';
}

/**
 * 停止 30 秒倒计时进度条动画（V3.2.33）
 */
function stopGreetingProgress(container) {
    const bar = container && container.querySelector('.greeting-progress');
    if (!bar) return;
    bar.style.animation = 'none';
}

/**
 * 初始化问候语
 */
function initGreeting() {
    // 检查今天是否已经显示过问候语
    const lastShown = localStorage.getItem('qiyiGreetingShown');
    const today = new Date().toDateString();

    // 如果今天已经显示过，就不再自动显示
    if (lastShown === today) {
        return;
    }

    // 等待页面加载完成后再显示问候语
    setTimeout(() => {
        showGreeting();
    }, 500); // V3.2.33：延迟0.5秒后从顶部弹性滑入
}

/**
 * 问候语事件监听
 */
function initGreetingEvents() {
    // 关闭问候语按钮
    const closeBtn = document.getElementById('close-greeting');
    if (closeBtn) {
        closeBtn.addEventListener('click', function(e) {
            e.preventDefault();
            hideGreeting();
            showNotification('问候语已关闭，明天会再次显示', 'info');

            // 标记为今天已关闭
            localStorage.setItem('qiyiGreetingShown', new Date().toDateString());
        });
    }

    // 鼠标悬停时停止自动隐藏
    const greetingContainer = document.getElementById('greeting-container');
    if (greetingContainer) {
        let hideTimeout;

        greetingContainer.addEventListener('mouseenter', function() {
            // 暂停：清除自动隐藏的定时器 + 暂停进度条动画
            if (APP_STATE.greetingTimeout) {
                clearTimeout(APP_STATE.greetingTimeout);
                APP_STATE.greetingTimeout = null;
            }
            greetingContainer.classList.add('paused');
        });

        greetingContainer.addEventListener('mouseleave', function() {
            // 恢复：进度条继续 + 重新设置30秒后隐藏
            greetingContainer.classList.remove('paused');
            if (greetingContainer.classList.contains('visible')) {
                APP_STATE.greetingTimeout = setTimeout(() => {
                    hideGreeting();
                }, 30000);
            }
        });
    }

    // 主题切换时保持问候语可见性
    const themeBtn = document.getElementById('toggle-theme');
    if (themeBtn) {
        const originalClick = themeBtn.onclick;
        themeBtn.onclick = function() {
            if (typeof originalClick === 'function') {
                originalClick();
            }

            // 主题切换后，如果问候语是显示的，短暂显示一下确保样式正确
            const greetingContainer = document.getElementById('greeting-container');
            if (greetingContainer && greetingContainer.classList.contains('visible')) {
                greetingContainer.style.opacity = '0';
                setTimeout(() => {
                    greetingContainer.style.opacity = '1';
                }, 100);
            }
        };
    }
}

/**
 * 手动显示问候语（可以绑定到某个按钮）
 */
function showGreetingManually() {
    showGreeting();
    showNotification('问候语已显示', 'success');
}

// ==================== 工具函数 ====================

/**
 * 显示通知消息
 */
function showNotification(message, type = 'info', duration = 3000) {
    const notification = document.getElementById('notification');
    const notificationText = document.getElementById('notification-text');

    if (!notification || !notificationText) {
        console.error('通知组件未找到');
        return;
    }

    notificationText.textContent = message;

    ['success', 'error', 'warning', 'info'].forEach(t => {
        notification.classList.remove(t);
    });

    notification.classList.add(type);
    notification.classList.add('show');

    logActivity(`通知: ${message}`, type);

    setTimeout(() => {
        notification.classList.remove('show');
    }, duration);
}

/**
 * 防抖函数
 */
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

/**
 * 格式化时间
 */
function formatTime(date = new Date(), format = 'full') {
    const now = date;
    const weekdays = ['日', '一', '二', '三', '四', '五', '六'];

    if (format === 'full') {
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        const hours = String(now.getHours()).padStart(2, '0');
        const minutes = String(now.getMinutes()).padStart(2, '0');
        const seconds = String(now.getSeconds()).padStart(2, '0');
        const weekday = weekdays[now.getDay()];

        return `${year}-${month}-${day} ${hours}:${minutes}:${seconds} 周${weekday}`;
    } else if (format === 'date') {
        return now.toLocaleDateString('zh-CN');
    } else if (format === 'time') {
        return now.toLocaleTimeString('zh-CN', {
            hour: '2-digit',
            minute: '2-digit'
        });
    } else if (format === 'relative') {
        const diff = Date.now() - now.getTime();
        const minutes = Math.floor(diff / 60000);
        const hours = Math.floor(diff / 3600000);
        const days = Math.floor(diff / 86400000);

        if (minutes < 1) return '刚刚';
        if (minutes < 60) return `${minutes}分钟前`;
        if (hours < 24) return `${hours}小时前`;
        if (days < 7) return `${days}天前`;
        return formatTime(now, 'date');
    }

    return now.toLocaleString('zh-CN');
}

/**
 * 验证URL格式
 */
function isValidUrl(string) {
    try {
        new URL(string);
        return true;
    } catch (_) {
        return false;
    }
}

// ==================== 农历日期功能 ====================

/**
 * 更新农历日期显示
 */
function updateLunarDate() {
    try {
        const lunarElement = document.getElementById('lunar-date');
        if (!lunarElement) return;

        const now = new Date();
        const lunarDateStr = LunarCalendar.getLunarDateString(now);
        lunarElement.textContent = lunarDateStr;

        // 根据星期几设置不同样式
        const isWeekend = LunarCalendar.isWeekend(now);
        const hour = now.getHours();

        // 周末添加特殊类名
        if (isWeekend) {
            lunarElement.classList.add('weekend');
        } else {
            lunarElement.classList.remove('weekend');
        }

        // 根据时间段调整样式
        if (hour >= 18 || hour < 6) {
            // 晚上时间，降低透明度
            lunarElement.style.opacity = '0.7';
        } else {
            lunarElement.style.opacity = '0.9';
        }

        // 农历特殊节日标记
        const lunarInfo = LunarCalendar.getTodayLunarDate(now);
        if (lunarInfo) {
            // 检查是否是农历节日
            const festival = LunarCalendar.checkLunarFestival(lunarInfo.month, lunarInfo.day);
            if (festival) {
                lunarElement.style.fontWeight = '600';
                lunarElement.style.color = APP_STATE.darkMode ? '#ff9d76' : '#e74c3c';
                lunarElement.title = `今天是${festival}`;
            } else {
                lunarElement.style.fontWeight = '500';
                lunarElement.title = '';
            }
        }

    } catch (error) {
        console.error('更新农历日期失败:', error);
        const lunarElement = document.getElementById('lunar-date');
        if (lunarElement) {
            lunarElement.textContent = "农历日期获取中...";
            lunarElement.style.color = APP_STATE.darkMode ? '#a0aec0' : '#666';
            lunarElement.classList.remove('weekend');
        }
    }
}

// ==================== 时间管理 ====================

/**
 * 计算日期的 ISO 8601 周编号（V3.2.33：#current-time 末尾追加「第N周」）
 * 规则：周一为周首；第 1 周包含 1 月 4 日的那一周
 * @param {Date} date
 * @returns {number} ISO 周编号（1-53）
 */
function getISOWeek(date) {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const dayNum = d.getUTCDay() || 7;            // 周日=0 → 转 7
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);    // 移到当前周的周四
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
}

/**
 * 更新时间和日期显示
 */
function updateTimeDisplay() {
    const now = new Date();

    // 更新当前时间（公历）+ ISO 周编号
    // V3.2.34 修复：formatTime('full') 内部已返回「周X」（第 808 行），这里只追加「第N周」避免「周四 周四 第N周」重复
    const timeElement = document.getElementById('current-time');
    if (timeElement) {
        timeElement.textContent = formatTime(now, 'full') + ' 第' + getISOWeek(now) + '周';

        // 根据时间段调整公历日期颜色
        const hour = now.getHours();
        if (hour >= 18 || hour < 6) {
            timeElement.style.opacity = '0.9';
        } else {
            timeElement.style.opacity = '1';
        }
    }

    // 更新农历日期
    updateLunarDate();

    // 更新年份
    const yearElements = document.querySelectorAll('#current-year, #current-year-footer');
    yearElements.forEach(el => {
        if (el) el.textContent = now.getFullYear();
    });

    // 更新最后更新时间
    const lastUpdatedElement = document.getElementById('last-updated-time');
    if (lastUpdatedElement) {
        lastUpdatedElement.textContent = formatTime(now, 'time');
    }
}

// ==================== 数据管理 ====================

/**
 * 后端感知的链接数据初始化
 * - 有后端：从 /api/links 拉取（补全缺失分类），并标记 backendMode
 * - 无后端：回退到默认数据 + localStorage（直接打开 index.html 时）
 */
async function loadInitialData() {
    try {
        const r = await Api.getLinks();
        if (r.status === 200 && r.data && r.data.data && typeof r.data.data === 'object') {
            const serverData = r.data.data;
            // 补全缺失分类，避免页面报错
            const defaultData = window.getDefaultLinkData ? window.getDefaultLinkData() : {};
            for (const cat in defaultData) {
                if (!Array.isArray(serverData[cat])) serverData[cat] = defaultData[cat];
            }
            APP_STATE.linkData = serverData;
            APP_STATE.backendMode = true;
            return;
        }
    } catch (e) {
        console.warn('后端不可用，回退到本地数据模式:', e.message);
    }
    APP_STATE.backendMode = false;
    APP_STATE.linkData = loadLinkData();
}

/**
 * 从本地存储加载所有数据（仅客户端偏好）
 */
function loadAllDataFromStorage() {
    // 链接数据由 loadInitialData 负责；这里只处理主题/统计/搜索历史等本地偏好

    const savedTheme = localStorage.getItem('qiyiTheme');
    if (savedTheme === 'light') {
        APP_STATE.darkMode = false;
        document.body.classList.remove('dark-mode');
        updateThemeButton();
    } else {
        // 默认启用深色主题（deepseek 风格）
        APP_STATE.darkMode = true;
        document.body.classList.add('dark-mode');
        updateThemeButton();
    }

    loadVisitStats();

    const savedSearchHistory = localStorage.getItem('qiyiSearchHistory');
    if (savedSearchHistory) {
        try {
            APP_STATE.searchHistory = JSON.parse(savedSearchHistory).slice(0, APP_STATE.MAX_SEARCH_HISTORY);
        } catch (e) {
            console.error('加载搜索历史失败:', e);
        }
    }

    const savedLinksPerPage = localStorage.getItem('qiyiLinksPerPage');
    if (savedLinksPerPage) {
        APP_STATE.linksPerPage = parseInt(savedLinksPerPage) || CONFIG.LINKS_PER_PAGE;
    }
}

/**
 * 加载链接数据
 */
function loadLinkData() {
    const defaultData = window.getDefaultLinkData ? window.getDefaultLinkData() : {};

    try {
        const savedData = localStorage.getItem('qiyiTechLinkData');
        if (savedData) {
            const parsedData = JSON.parse(savedData);

            for (const category in parsedData) {
                if (defaultData[category]) {
                    const existingUrls = new Set(defaultData[category].map(item => item.url));
                    const customItems = parsedData[category].filter(item => !existingUrls.has(item.url));

                    defaultData[category] = [...customItems, ...defaultData[category]];
                } else {
                    defaultData[category] = parsedData[category];
                }
            }
        }
    } catch (e) {
        console.error('加载保存的数据失败:', e);
        showNotification('加载数据失败，使用默认数据', 'warning');
    }

    return defaultData;
}

/**
 * 保存数据到本地存储
 */
function saveDataToStorage() {
    // 后端模式：持久化到服务器（实时保存，多设备共享）
    if (APP_STATE.backendMode) {
        Api.saveLinks(APP_STATE.linkData).then(function (r) {
            if (r.status !== 200) {
                showNotification('保存到服务器失败，请检查网络', 'error');
                logActivity('保存到服务器失败: ' + ((r.data && r.data.error) || r.status), 'error');
            } else {
                logActivity('数据已保存到服务器', 'success');
            }
        });
        return true;
    }

    try {
        const customData = {};
        for (const category in APP_STATE.linkData) {
            customData[category] = APP_STATE.linkData[category];
        }

        localStorage.setItem('qiyiTechLinkData', JSON.stringify(customData));
        logActivity('数据保存成功', 'success');
        return true;
    } catch (e) {
        console.error('保存数据失败:', e);
        showNotification('保存数据失败，存储空间可能已满', 'error');
        return false;
    }
}

/**
 * 保存主题设置
 */
function saveThemeSetting() {
    localStorage.setItem('qiyiTheme', APP_STATE.darkMode ? 'dark' : 'light');
}

/**
 * 保存搜索历史
 */
function saveSearchHistory() {
    localStorage.setItem('qiyiSearchHistory', JSON.stringify(APP_STATE.searchHistory.slice(0, APP_STATE.MAX_SEARCH_HISTORY)));
}

// ==================== 主题控制 ====================

/**
 * 切换主题模式
 */
function toggleTheme() {
    APP_STATE.darkMode = !APP_STATE.darkMode;

    if (APP_STATE.darkMode) {
        document.body.classList.add('dark-mode');
        showNotification('已切换为暗色主题', 'info');
        logActivity('切换到暗色主题', 'info');
    } else {
        document.body.classList.remove('dark-mode');
        showNotification('已切换为亮色主题', 'info');
        logActivity('切换到亮色主题', 'info');
    }

    updateThemeButton();
    saveThemeSetting();
}

/**
 * 更新主题按钮图标
 */
function updateThemeButton() {
    const themeBtn = document.getElementById('toggle-theme');
    const floatingThemeBtn = document.getElementById('floating-theme');

    if (themeBtn) {
        const icon = themeBtn.querySelector('i');
        if (APP_STATE.darkMode) {
            icon.className = 'fas fa-sun';
            themeBtn.title = '切换为亮色主题';
        } else {
            icon.className = 'fas fa-moon';
            themeBtn.title = '切换为暗色主题';
        }
    }

    if (floatingThemeBtn) {
        const icon = floatingThemeBtn.querySelector('i');
        if (APP_STATE.darkMode) {
            icon.className = 'fas fa-sun';
            floatingThemeBtn.title = '切换为亮色主题';
        } else {
            icon.className = 'fas fa-moon';
            floatingThemeBtn.title = '切换为暗色主题';
        }
    }
}

// ==================== 访问统计 ====================

/**
 * 加载访问统计
 */
function loadVisitStats() {
    const stats = JSON.parse(localStorage.getItem('qiyiVisitStats') || '{}');
    const today = formatTime(new Date(), 'date');

    if (!stats.totalVisits) stats.totalVisits = 0;
    if (!stats.todayVisits) stats.todayVisits = 0;
    if (!stats.lastVisit) stats.lastVisit = today;
    if (!stats.visitDates) stats.visitDates = {};

    if (stats.lastVisit !== today) {
        stats.todayVisits = 0;
        stats.lastVisit = today;
    }

    stats.totalVisits++;
    stats.todayVisits++;

    if (!stats.visitDates[today]) {
        stats.visitDates[today] = 0;
    }
    stats.visitDates[today]++;

    localStorage.setItem('qiyiVisitStats', JSON.stringify(stats));

    APP_STATE.visitCount = stats.totalVisits;
    APP_STATE.todayVisits = stats.todayVisits;
    APP_STATE.lastVisitDate = today;

    updateStatsDisplay();

    logActivity(`访问计数: 总${stats.totalVisits}次, 今日${stats.todayVisits}次`, 'info');
}

/**
 * 更新统计显示
 */
function updateStatsDisplay() {
    const visitCountElement = document.getElementById('visit-count');
    if (visitCountElement) {
        visitCountElement.textContent = `访问: ${APP_STATE.visitCount}`;
    }
}

/**
 * 记录活动日志
 */
function logActivity(text, type = 'info') {
    const activities = JSON.parse(localStorage.getItem('qiyiActivities') || '[]');

    activities.unshift({
        id: Date.now().toString(),
        text: text,
        type: type,
        time: new Date().toISOString(),
        timestamp: Date.now()
    });

    if (activities.length > 50) {
        activities.length = 50;
    }

    localStorage.setItem('qiyiActivities', JSON.stringify(activities));
}

// ==================== 权限管理 ====================

/**
 * 从存储中获取管理密码
 */
function getPasswordFromStorage() {
    return localStorage.getItem('qiyiTechAdminPassword') || CONFIG.DEFAULT_PASSWORD;
}

/**
 * 保存密码到存储
 */
function setPasswordToStorage(password) {
    localStorage.setItem('qiyiTechAdminPassword', password);
}

/**
 * 检查权限密码
 */
function checkPermission(password) {
    return password === getPasswordFromStorage();
}

/**
 * 授予管理权限
 */
function grantPermission() {
    APP_STATE.hasPermission = true;
    updatePermissionUI();

    if (APP_STATE.permissionTimeout) {
        clearTimeout(APP_STATE.permissionTimeout);
    }
    APP_STATE.permissionTimeout = setTimeout(() => {
        APP_STATE.hasPermission = false;
        updatePermissionUI();
        showNotification('管理权限已过期，请重新验证', 'warning');
        logActivity('管理权限已过期', 'warning');
    }, APP_STATE.PERMISSION_DURATION);

    logActivity('管理权限已解锁', 'success');
}

/**
 * 撤销管理权限
 */
function revokePermission() {
    APP_STATE.hasPermission = false;
    updatePermissionUI();

    if (APP_STATE.permissionTimeout) {
        clearTimeout(APP_STATE.permissionTimeout);
        APP_STATE.permissionTimeout = null;
    }

    logActivity('管理权限已锁定', 'info');
}

/**
 * 更新权限UI状态
 */
function updatePermissionUI() {

    syncAdminMenuIcon();
}

/**
 * 更新浮标菜单中「网址管理」的状态图标（无独立页脚按钮时仍同步权限态）
 */
function syncAdminMenuIcon() {
    const mi = document.getElementById('menu-admin-management');
    if (mi) {
        const icon = mi.querySelector('i');
        if (icon) icon.className = APP_STATE.hasPermission ? 'fas fa-user-shield' : 'fas fa-cogs';
    }
}

/** 待执行的权限回调函数引用 */
let _pendingPermissionCallback = null;

/**
 * 需要权限检查
 */
function requirePermission(callback) {
    if (APP_STATE.hasPermission) {
        callback();
    } else {
        showNotification('需要管理权限才能执行此操作', 'warning');
        const modal = document.getElementById('permission-modal');
        if (modal) {
            modal.style.display = 'flex';
            _pendingPermissionCallback = (typeof callback === 'function') ? callback : null;
        }
        logActivity('请求管理权限', 'info');
    }
}

// ==================== 链接管理 ====================

/**
 * 加载标签数据
 */
function loadTabData(tabName, page = 1) {
    const container = document.getElementById(`${tabName}-links`);
    if (!container || !APP_STATE.linkData[tabName]) return;

    let links = APP_STATE.linkData[tabName];
    const searchQuery = document.getElementById('search-links-input')?.value.trim();

    if (searchQuery) {
        links = links.filter(link => {
            return link.name.toLowerCase().includes(searchQuery.toLowerCase());
        });
    }

    APP_STATE.filteredLinks = links;
    APP_STATE.currentPage = page;
    APP_STATE.totalPages = Math.max(1, Math.ceil(links.length / APP_STATE.linksPerPage));

    const startIndex = (page - 1) * APP_STATE.linksPerPage;
    const endIndex = startIndex + APP_STATE.linksPerPage;
    const pageLinks = links.slice(startIndex, endIndex);

    container.innerHTML = '';

    if (pageLinks.length === 0) {
        container.innerHTML = `
            <div class="no-links-message">
                <i class="fas fa-inbox"></i>
                <p>${searchQuery ? '没有找到匹配的链接' : '此分类暂无链接'}</p>
                ${searchQuery ? '<p>尝试其他搜索词或<a href="#" class="clear-search">清除搜索</a></p>' : ''}
            </div>
        `;

        if (searchQuery) {
            const clearSearchBtn = container.querySelector('.clear-search');
            if (clearSearchBtn) {
                clearSearchBtn.addEventListener('click', function(e) {
                    e.preventDefault();
                    document.getElementById('search-links-input').value = '';
                    loadTabData(tabName, 1);
                });
            }
        }

        updateLinksCount(0);
        updatePagination();
        return;
    }

    const fragment = document.createDocumentFragment();

    pageLinks.forEach((link, index) => {
        const linkItem = createLinkElement(link, tabName, startIndex + index);
        fragment.appendChild(linkItem);
    });

    container.appendChild(fragment);

    updateLinksCount(links.length);
    updatePagination();
}

/**
 * 创建链接元素
 */
function createLinkElement(link, category, index) {
    const linkItem = document.createElement('div');
    linkItem.className = `link-item ${link.class || ''}`;
    linkItem.title = `${link.name}\n${link.url}`;
    linkItem.dataset.id = link.id || `link_${Date.now()}_${index}`;

    const actionsHtml = APP_STATE.hasPermission ? 
        `<div class="link-actions">
            <button class="btn btn-small btn-secondary edit-link" 
                    data-category="${category}" data-index="${index}" 
                    title="编辑链接">
                <i class="fas fa-edit"></i>
            </button>
            <button class="btn btn-small btn-danger delete-link" 
                    data-category="${category}" data-index="${index}"
                    title="删除链接">
                <i class="fas fa-trash"></i>
            </button>
        </div>` : '';

    // V3.2.20：免密登录入口——该链接设置了登录用户名/密码时显示钥匙按钮，
    // 点击打开免密登录中转页 /login.html?id=<id>（凭据不出现在本页，由中转页按需拉取）
    const hasCred = !!(link.hasCred || (link.luser && String(link.luser).trim()) || (link.lpass && String(link.lpass).trim()));
    const loginBtnHtml = hasCred
        ? `<button class="link-login-btn has-cred" data-act="login" data-login-id="${escapeHtml(link.id || '')}" title="免密登录：${escapeHtml(link.name || '')}"><i class="fas fa-key"></i></button>`
        : '';

    const favSrc = link.favicon
        ? link.favicon
        : (typeof Api !== 'undefined' && Api.faviconUrl ? Api.faviconUrl(link.url) : '');
    const iconHtml = favSrc
        ? `<img class="link-icon" src="${escapeHtml(favSrc)}" alt="" loading="lazy" onerror="window.qiyiFaviconFallback(this)">`
        : `<span class="link-icon link-icon-missing">${SELFCHECK_ICON_SVG}</span>`;

    linkItem.innerHTML = `
        <a href="${escapeHtml(link.url)}" target="_blank" rel="noopener noreferrer" class="link-main">
            ${iconHtml}
            <span class="link-name">${escapeHtml(link.name)}</span>
        </a>
        ${loginBtnHtml}
        ${actionsHtml}
    `;

    const linkAnchor = linkItem.querySelector('.link-main');
    if (linkAnchor) {
        linkAnchor.addEventListener('click', function() {
            logActivity(`访问链接: ${link.name}`, 'info');
        });
    }

    // V3.2.20：免密登录按钮——打开中转页自动填充/免密直达
    const loginBtn = linkItem.querySelector('[data-act="login"]');
    if (loginBtn) {
        loginBtn.addEventListener('click', function(e) {
            e.preventDefault();
            e.stopPropagation();
            const lid = this.getAttribute('data-login-id');
            if (!lid) { showNotification('缺少链接标识，无法免密登录', 'error'); return; }
            window.open('/login.html?id=' + encodeURIComponent(lid), '_blank', 'noopener');
        });
    }

    if (APP_STATE.hasPermission) {
        const editBtn = linkItem.querySelector('.edit-link');
        const deleteBtn = linkItem.querySelector('.delete-link');

        if (editBtn) {
            editBtn.addEventListener('click', function(e) {
                e.stopPropagation();
                const category = this.dataset.category;
                const index = parseInt(this.dataset.index);
                editLink(category, index);
            });
        }

        if (deleteBtn) {
            deleteBtn.addEventListener('click', function(e) {
                e.stopPropagation();
                const category = this.dataset.category;
                const index = parseInt(this.dataset.index);
                deleteLink(category, index);
            });
        }
    }

    return linkItem;
}

/**
 * 更新链接计数显示
 */
function updateLinksCount(count) {
    const countElement = document.getElementById('links-count');
    if (countElement) {
        countElement.textContent = count;
    }
}

/**
 * 更新分页显示
 */
function updatePagination() {
    const currentPageElement = document.getElementById('current-page');
    const totalPagesElement = document.getElementById('total-pages');
    const prevPageBtn = document.getElementById('prev-page');
    const nextPageBtn = document.getElementById('next-page');

    if (currentPageElement) {
        currentPageElement.textContent = APP_STATE.currentPage;
    }

    if (totalPagesElement) {
        totalPagesElement.textContent = APP_STATE.totalPages;
    }

    if (prevPageBtn) {
        prevPageBtn.disabled = APP_STATE.currentPage <= 1;
    }

    if (nextPageBtn) {
        nextPageBtn.disabled = APP_STATE.currentPage >= APP_STATE.totalPages;
    }
}

/**
 * 添加新链接
 */
function addLink(category, name, url, colorClass = '', favicon = '') {
    if (!APP_STATE.linkData[category]) {
        APP_STATE.linkData[category] = [];
    }

    const exists = APP_STATE.linkData[category].some(link => 
        link.url === url
    );

    if (exists) {
        showNotification('链接已存在，请勿重复添加', 'warning');
        return false;
    }

    const newLink = {
        id: `new_${Date.now()}`,
        name: name,
        url: url,
        class: colorClass || '',
        favicon: favicon || '',
        createdAt: new Date().toISOString(),
        visitCount: 0
    };

    APP_STATE.linkData[category].unshift(newLink);

    if (saveDataToStorage()) {
        if (APP_STATE.currentTab === category) {
            loadTabData(category, 1);
        }
        refreshSearchIndex();
        showNotification('网址添加成功！', 'success');
        logActivity(`添加链接: ${name}`, 'success');
        return true;
    }

    return false;
}

/**
 * 编辑链接
 */
function editLink(category, index) {
    const links = APP_STATE.linkData[category];
    if (!links || !links[index]) return;

    const link = links[index];

    document.getElementById('modal-action').textContent = '编辑';
    document.getElementById('link-index').value = index;
    document.getElementById('link-original-category').value = category;
    document.getElementById('link-name').value = link.name;
    document.getElementById('link-url').value = link.url;
    document.getElementById('link-category').value = category;
    document.getElementById('link-color').value = link.class || '';
    document.getElementById('link-favicon').value = link.favicon || '';

    document.getElementById('link-modal').style.display = 'flex';
}

/**
 * 删除链接
 */
function deleteLink(category, index) {
    if (confirm('确定要删除这个网址吗？此操作不可撤销。')) {
        APP_STATE.linkData[category].splice(index, 1);

        if (saveDataToStorage()) {
            const currentPage = APP_STATE.currentPage;
            const links = APP_STATE.linkData[category];
            const totalPages = Math.max(1, Math.ceil(links.length / APP_STATE.linksPerPage));

            const newPage = currentPage > totalPages ? totalPages : currentPage;

            loadTabData(category, newPage);
            refreshSearchIndex();
            showNotification('网址删除成功！', 'success');
            logActivity(`删除链接: ${category}分类中的链接`, 'warning');
        }
    }
}

/**
 * 保存链接
 */
function saveLink(event) {
    event.preventDefault();

    const name = document.getElementById('link-name').value.trim();
    const url = document.getElementById('link-url').value.trim();
    const category = document.getElementById('link-category').value;
    const color = document.getElementById('link-color').value;
    const favicon = document.getElementById('link-favicon').value.trim();
    const indexValue = document.getElementById('link-index').value;
    const originalCategory = document.getElementById('link-original-category').value;

    if (!name || !url) {
        showNotification('请填写完整的链接信息', 'warning');
        return;
    }

    if (!isValidUrl(url) && !url.startsWith('http://') && !url.startsWith('https://')) {
        showNotification('请输入有效的网址（以http://或https://开头）', 'warning');
        return;
    }

    const fullUrl = isValidUrl(url) ? url : 
                   (url.startsWith('http') ? url : `https://${url}`);

    if (indexValue !== '') {
        const index = parseInt(indexValue);

        const originalLinks = APP_STATE.linkData[originalCategory];
        if (!originalLinks || !originalLinks[index]) {
            showNotification('链接不存在', 'error');
            return;
        }

        const link = originalLinks[index];

        link.name = name;
        link.url = fullUrl;
        link.class = color;
        link.favicon = favicon;

        if (originalCategory !== category) {
            originalLinks.splice(index, 1);

            if (!APP_STATE.linkData[category]) {
                APP_STATE.linkData[category] = [];
            }
            APP_STATE.linkData[category].unshift(link);

            loadTabData(originalCategory, 1);
            loadTabData(category, 1);
        } else {
            loadTabData(category, APP_STATE.currentPage);
        }

        saveDataToStorage();
        refreshSearchIndex();
        showNotification('网址更新成功！', 'success');
        logActivity(`更新链接: ${name}`, 'success');
    } else {
        if (addLink(category, name, fullUrl, color, favicon)) {
            document.getElementById('link-name').value = '';
            document.getElementById('link-url').value = '';
            document.getElementById('link-favicon').value = '';
            document.getElementById('link-color').value = '';
        }
    }

    document.getElementById('link-modal').style.display = 'none';
}

// ==================== 搜索功能 ====================

/**
 * 执行搜索
 */
function performSearch() {
    const searchInput = document.getElementById('search-input');
    const searchTerm = searchInput.value.trim();

    if (!searchTerm || searchTerm === '请输入搜索关键词...') {
        showNotification('请输入搜索关键词', 'warning');
        searchInput.focus();
        return;
    }

    const selectedEngine = document.querySelector('input[name="search-engine"]:checked');
    const engine = selectedEngine ? selectedEngine.value : 'baidu';

    let searchUrl = '';
    const encodedTerm = encodeURIComponent(searchTerm);

    if (CONFIG.SEARCH_ENGINES[engine]) {
        searchUrl = CONFIG.SEARCH_ENGINES[engine].url + encodedTerm;
    } else {
        searchUrl = CONFIG.SEARCH_ENGINES.baidu.url + encodedTerm;
    }

    if (engine === 'searxng') {
        doSearXNGSearch(searchTerm);
        APP_STATE.searchHistory.unshift({
            term: searchTerm,
            engine: engine,
            time: new Date().toISOString()
        });
        if (APP_STATE.searchHistory.length > APP_STATE.MAX_SEARCH_HISTORY) {
            APP_STATE.searchHistory.length = APP_STATE.MAX_SEARCH_HISTORY;
        }
        saveSearchHistory();
        showNotification(`正在通过综合搜索: ${searchTerm}`, 'success');
        logActivity(`搜索: ${searchTerm} (综合/SearXNG)`, 'info');
        return;
    }

    window.open(searchUrl, '_blank');

    APP_STATE.searchHistory.unshift({
        term: searchTerm,
        engine: engine,
        time: new Date().toISOString()
    });

    if (APP_STATE.searchHistory.length > APP_STATE.MAX_SEARCH_HISTORY) {
        APP_STATE.searchHistory.length = APP_STATE.MAX_SEARCH_HISTORY;
    }

    saveSearchHistory();

    showNotification(`正在搜索: ${searchTerm} (${CONFIG.SEARCH_ENGINES[engine].name})`, 'success');
    logActivity(`搜索: ${searchTerm} (${CONFIG.SEARCH_ENGINES[engine].name})`, 'info');
}

/**
 * 通过 SearXNG 综合搜索（代理 /api/search），结果以浮层展示
 */
function doSearXNGSearch(term) {
    Api.search(term).then(function (r) {
        if (r.status === 200 && r.data) {
            renderSearchOverlay(r.data);
        } else if (r.status === 0) {
            showNotification('未连接到后端，无法使用综合搜索（请通过服务器访问）', 'error');
        } else {
            const msg = (r.data && r.data.error) || ('搜索失败(' + r.status + ')');
            showNotification('综合搜索不可用：' + msg, 'error');
        }
    }).catch(function () {
        showNotification('未连接到后端，无法使用综合搜索', 'error');
    });
}

/**
 * 渲染综合搜索结果浮层
 */
function renderSearchOverlay(data) {
    const overlay = document.getElementById('search-overlay');
    const body = document.getElementById('search-overlay-body');
    const title = document.getElementById('search-overlay-title');
    const inst = document.getElementById('search-overlay-instance');
    if (!overlay || !body) return;

    title.textContent = '综合搜索：' + (data.query || '');
    if (data.instance) {
        inst.href = data.instance.replace(/\/+$/, '') + '/search?q=' + encodeURIComponent(data.query || '');
        inst.style.display = '';
    } else {
        inst.style.display = 'none';
    }

    let html = '';
    if (data.answers && data.answers.length) {
        html += '<div class="search-answer"><i class="fas fa-lightbulb"></i> ' + escapeHtml(data.answers[0]) + '</div>';
    }
    if (!data.results || !data.results.length) {
        const sug = (data.suggestions && data.suggestions.length)
            ? '建议：' + data.suggestions.map(function (s) { return escapeHtml(s); }).join('、') : '';
        html += '<div class="search-empty">未找到相关结果。' + sug + '</div>';
    } else {
        data.results.slice(0, 20).forEach(function (r) {
            const url = r.url || '#';
            const t = r.title || url;
            const content = r.content || '';
            html += '<a class="search-result" href="' + escapeHtml(url) + '" target="_blank" rel="noopener">' +
                '<div class="search-result-title">' + escapeHtml(t) + '</div>' +
                (content ? '<div class="search-result-content">' + escapeHtml(content) + '</div>' : '') +
                '<div class="search-result-url">' + escapeHtml(url) + '</div>' +
            '</a>';
        });
    }
    body.innerHTML = html;
    overlay.style.display = 'flex';
}

/**
 * 读取后台配置，若 SearXNG 设为默认引擎（「设置」里的版头默认 或 「外观」默认搜索引擎=综合）则预选版头"综合"
 */
function applySearchSettings() {
    Api.getSettings().then(function (r) {
        if (r.status === 200 && r.data && r.data.searxng) {
            const s = r.data.searxng;
            const wantSearxng = (APP_STATE.defaultEngine === 'searxng') || !!s.defaultEngine;
            if (s.enabled && wantSearxng) {
                const rb = document.querySelector('input[name="search-engine"][value="searxng"]');
                if (rb) rb.checked = true;
            }
            APP_STATE.searxngNewTab = s.newTab !== false;
        }
    }).catch(function () { /* 无后端或失败：忽略，保持默认百度 */ });
}

/**
 * 初始化搜索建议
 */
function initSearchSuggestions() {
    const container = document.getElementById('search-quick-links');
    if (!container) return;

    container.innerHTML = '';

    // 后端配置了空数组 → 隐藏整条快捷项（连空容器也清掉）
    if (!Array.isArray(CONFIG.QUICK_SEARCHES) || CONFIG.QUICK_SEARCHES.length === 0) {
        container.style.display = 'none';
        return;
    }
    container.style.display = '';

    CONFIG.QUICK_SEARCHES.forEach(item => {
        const link = document.createElement('a');
        link.href = '#';
        link.className = 'search-quick-link';
        link.textContent = item.text;
        link.dataset.type = item.type || '';

        link.addEventListener('click', function(e) {
            e.preventDefault();
            // 后台若给该快捷项配置了 url（含 {q} 时把 item.text 当作查询词），直接打开
            // url 为空则保留旧行为：把文字塞进搜索框走当前选择引擎
            if (item.url && String(item.url).trim()) {
                const u = String(item.url).replace(/\{q\}/g, encodeURIComponent(item.text || ''));
                window.open(u, '_blank');
            } else {
                document.getElementById('search-input').value = item.text;
                performSearch();
            }
        });

        container.appendChild(link);
    });
}

/**
 * 应用前台 LOGO：hasCustom → /api/site/logo/frontend?v=<ts>；失败回退 /assets/logo-default.png
 * 同时刷新 favicon（#site-favicon 或首个 rel*=icon），保证浏览器标签页图标一致
 */
function applySiteLogo(site) {
    const DEFAULT_LOGO = '/assets/logo-default.png';
    const logo = (site && site.frontendLogo) || {};
    const url = (logo.hasCustom ? '/api/site/logo/frontend' : DEFAULT_LOGO) + (logo.hasCustom ? '?v=' + Date.now() : '');
    const img = document.getElementById('site-logo');
    if (img) {
        img.onerror = function () {
            if (!img.dataset.fallback) {
                img.dataset.fallback = '1';
                img.src = DEFAULT_LOGO;
            }
        };
        img.src = url;
    }
    const fav = document.getElementById('site-favicon') || document.querySelector('link[rel*="icon"]');
    if (fav) fav.href = url;
}

// ==================== 浮动菜单功能 ====================

/**
 * 初始化浮动菜单
 */
function initFloatingMenu() {
    const menuBtn = document.getElementById('floating-menu');
    const menuPanel = document.getElementById('floating-menu-panel');

    if (!menuBtn || !menuPanel) return;

    menuBtn.addEventListener('click', function(e) {
        e.stopPropagation();
        APP_STATE.menuVisible = !APP_STATE.menuVisible;

        if (APP_STATE.menuVisible) {
            menuPanel.classList.add('show');
        } else {
            menuPanel.classList.remove('show');
        }
    });

    document.addEventListener('click', function(e) {
        if (APP_STATE.menuVisible && 
            !menuPanel.contains(e.target) && 
            !menuBtn.contains(e.target)) {
            APP_STATE.menuVisible = false;
            menuPanel.classList.remove('show');
        }
    });

    document.getElementById('menu-export-data')?.addEventListener('click', function() {
        exportData();
        closeFloatingMenu();
    });

    document.getElementById('menu-clear-cache')?.addEventListener('click', function() {
        clearCache();
        closeFloatingMenu();
    });

    document.getElementById('menu-show-stats')?.addEventListener('click', function() {
        showStatistics();
        closeFloatingMenu();
    });

    document.getElementById('menu-admin-management')?.addEventListener('click', function() {
        closeFloatingMenu();
        requirePermission(function() { window.location.href = '/admin.html'; });
    });

    document.getElementById('menu-edit-mode')?.addEventListener('click', function() {
        toggleEditMode();
        closeFloatingMenu();
    });

    document.getElementById('menu-batch-delete')?.addEventListener('click', function() {
        startBatchDelete();
        closeFloatingMenu();
    });

    document.getElementById('menu-show-greeting')?.addEventListener('click', function() {
        showGreetingManually();
        closeFloatingMenu();
    });
}

/**
 * 关闭浮动菜单
 */
function closeFloatingMenu() {
    APP_STATE.menuVisible = false;
    document.getElementById('floating-menu-panel')?.classList.remove('show');
}

// ==================== 事件绑定和初始化 ====================

/**
 * 初始化事件监听器
 */
function initEventListeners() {
    console.log('开始初始化事件监听器...');

    document.querySelectorAll('.main-tab').forEach(tab => {
        tab.addEventListener('click', function() {
            const tabName = this.dataset.tab;
            switchTab(tabName);
        });
    });

    document.getElementById('search-form')?.addEventListener('submit', function(e) {
        e.preventDefault();
        performSearch();
    });

    // 综合搜索结果浮层关闭
    const searchOverlay = document.getElementById('search-overlay');
    if (searchOverlay) {
        document.getElementById('search-overlay-close')?.addEventListener('click', function() {
            searchOverlay.style.display = 'none';
        });
        searchOverlay.addEventListener('click', function(e) {
            if (e.target === searchOverlay) searchOverlay.style.display = 'none';
        });
        document.addEventListener('keydown', function(e) {
            if (e.key === 'Escape' && searchOverlay.style.display !== 'none') {
                searchOverlay.style.display = 'none';
            }
        });
    }

    const searchInput = document.getElementById('search-input');
    if (searchInput) {
        searchInput.addEventListener('focus', function() {
            this.classList.add('focused');
        });

        searchInput.addEventListener('blur', function() {
            this.classList.remove('focused');
        });

        document.addEventListener('keydown', function(e) {
            if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
                e.preventDefault();
                searchInput.focus();
                searchInput.select();
            }
        });
    }

    document.getElementById('search-links-input')?.addEventListener('input', debounce(function() {
        loadTabData(APP_STATE.currentTab, 1);
    }, 300));

    document.getElementById('prev-page')?.addEventListener('click', function() {
        if (!this.disabled) {
            loadTabData(APP_STATE.currentTab, APP_STATE.currentPage - 1);
        }
    });

    document.getElementById('next-page')?.addEventListener('click', function() {
        if (!this.disabled) {
            loadTabData(APP_STATE.currentTab, APP_STATE.currentPage + 1);
        }
    });

    document.getElementById('toggle-theme')?.addEventListener('click', toggleTheme);
    document.getElementById('floating-theme')?.addEventListener('click', toggleTheme);

    document.getElementById('modal-close')?.addEventListener('click', function() {
        document.getElementById('link-modal').style.display = 'none';
    });

    document.getElementById('cancel-btn')?.addEventListener('click', function() {
        document.getElementById('link-modal').style.display = 'none';
    });

    document.getElementById('link-form')?.addEventListener('submit', saveLink);

    document.getElementById('permission-modal-close')?.addEventListener('click', function() {
        document.getElementById('permission-modal').style.display = 'none';
    });

    document.getElementById('cancel-permission')?.addEventListener('click', function() {
        document.getElementById('permission-modal').style.display = 'none';
    });

    document.getElementById('confirm-permission')?.addEventListener('click', async function() {
        const password = document.getElementById('permission-password').value;

        if (APP_STATE.backendMode) {
            // 后端模式：调用服务端校验密码，成功由服务端写入 HttpOnly Cookie
            const r = await Api.login(password);
            if (r.status === 200) {
                grantPermission();
                document.getElementById('permission-modal').style.display = 'none';
                document.getElementById('permission-password').value = '';

                if (typeof _pendingPermissionCallback === 'function') {
                    try { _pendingPermissionCallback(); } catch (e) { console.error('执行回调函数失败:', e); }
                    _pendingPermissionCallback = null;
                }
                showNotification('管理权限验证成功！', 'success');
            } else {
                showNotification('密码错误，请重试', 'error');
                document.getElementById('permission-password').focus();
                document.getElementById('permission-password').select();
            }
            return;
        }

        // 无后端模式：本地密码校验
        if (checkPermission(password)) {
            grantPermission();
            document.getElementById('permission-modal').style.display = 'none';
            document.getElementById('permission-password').value = '';

            // 执行待回调的函数（直接引用，不再使用 eval）
            if (typeof _pendingPermissionCallback === 'function') {
                try {
                    _pendingPermissionCallback();
                } catch (e) {
                    console.error('执行回调函数失败:', e);
                }
                _pendingPermissionCallback = null;
            }

            showNotification('管理权限验证成功！', 'success');
        } else {
            showNotification('密码错误，请重试', 'error');
            document.getElementById('permission-password').focus();
            document.getElementById('permission-password').select();
        }
    });

    // 忘记密码（桌面登录窗口）：切换面板 + 提交重置
    document.getElementById('perm-forgot-link')?.addEventListener('click', function (e) {
        e.preventDefault();
        document.getElementById('perm-login-area').style.display = 'none';
        document.getElementById('perm-reset-form').style.display = 'block';
        document.getElementById('perm-reset-error').textContent = '';
        document.getElementById('perm-reset-token').value = '';
        document.getElementById('perm-reset-new').value = '';
        document.getElementById('perm-reset-confirm').value = '';
    });

    document.getElementById('perm-reset-cancel')?.addEventListener('click', function () {
        document.getElementById('perm-reset-form').style.display = 'none';
        document.getElementById('perm-login-area').style.display = 'block';
    });

    document.getElementById('perm-reset-form')?.addEventListener('submit', async function (e) {
        e.preventDefault();
        const token = document.getElementById('perm-reset-token').value.trim();
        const np = document.getElementById('perm-reset-new').value;
        const cp = document.getElementById('perm-reset-confirm').value;
        const errEl = document.getElementById('perm-reset-error');
        errEl.textContent = '';
        if (!token) { errEl.textContent = '请输入重置令牌'; return; }
        if (np.length < 6) { errEl.textContent = '新密码至少 6 位'; return; }
        if (np !== cp) { errEl.textContent = '两次输入的密码不一致'; return; }
        try {
            const r = await Api.resetPassword(token, np);
            if (r.status === 200) {
                errEl.style.color = '#16a34a';
                errEl.textContent = '密码已重置，请用新密码登录';
                setTimeout(function () {
                    document.getElementById('perm-reset-form').style.display = 'none';
                    document.getElementById('perm-login-area').style.display = 'block';
                    errEl.style.color = '';
                    errEl.textContent = '';
                    document.getElementById('permission-password').value = '';
                    document.getElementById('permission-password').focus();
                }, 1500);
            } else if (r.status === 0) {
                errEl.textContent = '网络错误，请确认服务已正常运行';
            } else {
                errEl.textContent = (r.data && r.data.error) ? r.data.error : '重置失败';
            }
        } catch (e2) {
            errEl.textContent = '重置请求失败，请稍后重试';
        }
    });

    document.getElementById('notification-close')?.addEventListener('click', function() {
        document.getElementById('notification').classList.remove('show');
    });

    document.getElementById('floating-top')?.addEventListener('click', function() {
        window.scrollTo({
            top: 0,
            behavior: 'smooth'
        });
    });

    document.getElementById('refresh-page')?.addEventListener('click', function() {
        location.reload();
    });

    document.getElementById('set-homepage')?.addEventListener('click', function() {
        if (confirm('是否将此页面设为浏览器主页？')) {
            try {
                if (window.external && ('AddFavorite' in window.external)) {
                    window.external.AddFavorite(location.href, document.title);
                }
                showNotification('请手动在浏览器设置中设置为主页', 'info');
            } catch (e) {
                showNotification('设置为主页功能需要浏览器支持', 'warning');
            }
        }
    });

    document.getElementById('sort-links')?.addEventListener('click', function() {
        const category = APP_STATE.currentTab;
        const links = APP_STATE.linkData[category];

        if (links && links.length > 0) {
            links.sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'));
            saveDataToStorage();
            loadTabData(category, 1);
            showNotification('已按名称排序', 'success');
        }
    });

    console.log('基本事件监听器初始化完成');
}

/**
 * 切换标签页
 */
function switchTab(tabName) {
    console.log(`切换标签页到: ${tabName}`);

    APP_STATE.currentTab = tabName;

    document.querySelectorAll('.main-tab').forEach(tab => {
        tab.classList.remove('active');
        if (tab.dataset.tab === tabName) {
            tab.classList.add('active');
        }
    });

    document.querySelectorAll('.links-grid').forEach(container => {
        container.style.display = 'none';
    });

    const currentContainer = document.getElementById(`${tabName}-links`);
    if (currentContainer) {
        currentContainer.style.display = 'grid';
    }

    loadTabData(tabName, 1);

    logActivity(`切换到分类: ${CONFIG.CATEGORIES[tabName]?.name || tabName}`, 'info');
}

// ==================== 其他功能 ====================

/**
 * 导出数据
 */
function exportData() {
    if (APP_STATE.backendMode) {
        Api.exportData();
        return;
    }

    const data = {
        version: CONFIG.VERSION,
        exportDate: new Date().toISOString(),
        categories: CONFIG.CATEGORIES,
        linkData: APP_STATE.linkData,
        settings: {
            darkMode: APP_STATE.darkMode,
            linksPerPage: APP_STATE.linksPerPage
        }
    };

    const dataStr = JSON.stringify(data, null, 2);
    const dataUri = 'data:application/json;charset=utf-8,' + encodeURIComponent(dataStr);

    const exportFileDefaultName = `奇易导航_备份_${new Date().toISOString().slice(0, 10)}.json`;
    const linkElement = document.createElement('a');

    linkElement.setAttribute('href', dataUri);
    linkElement.setAttribute('download', exportFileDefaultName);
    linkElement.click();

    showNotification('数据导出成功', 'success');
    logActivity('导出完整数据', 'success');
}

/**
 * 清除缓存
 */
function clearCache() {
    if (confirm('确定要清除所有缓存数据吗？此操作不可撤销。')) {
        localStorage.removeItem('qiyiTechLinkData');
        localStorage.removeItem('qiyiSearchHistory');
        localStorage.removeItem('qiyiVisitStats');
        localStorage.removeItem('qiyiActivities');

        showNotification('缓存已清除，即将重新加载页面', 'success');
        setTimeout(() => location.reload(), 800);
    }
}

/**
 * 显示统计信息
 */
function showStatistics() {
    const totalLinks = Object.values(APP_STATE.linkData).reduce((sum, links) => sum + links.length, 0);

    showNotification(`总链接数: ${totalLinks}, 今日访问: ${APP_STATE.todayVisits}`, 'info');
}

/**
 * 切换编辑模式
 */
function toggleEditMode() {
    if (!APP_STATE.hasPermission) {
        showNotification('需要管理权限才能进入编辑模式', 'warning');
        return;
    }

    APP_STATE.editMode = !APP_STATE.editMode;
    showNotification(APP_STATE.editMode
        ? '编辑模式已开启：可点击链接上的编辑/删除按钮管理网址'
        : '编辑模式已关闭', 'info');
}

/**
 * 开始批量删除
 */
function startBatchDelete() {
    if (!APP_STATE.hasPermission) {
        showNotification('需要管理权限才能进行批量删除', 'warning');
        return;
    }

    showNotification('正在打开后台批量管理...', 'info');
    window.location.href = '/admin.html';
}

// ==================== 站点外观（后台「外观」配置） ====================

/**
 * 读取并应用站点外观配置：
 * - 有后端：从 /api/settings 拉取 site（公开接口）
 * - 无后端：回退 localStorage（若管理员在无后端模式改过）或 DEFAULT_SITE
 */
function loadSiteConfig() {
    if (APP_STATE.backendMode) {
        return Api.getSettings().then(function (r) {
            if (r.status === 200 && r.data) {
                APP_STATE.site = normalizeSite(r.data.site);
            }
            applySiteConfig();
        }).catch(function () {
            APP_STATE.site = DEFAULT_SITE;
            applySiteConfig();
        });
    }
    let local = null;
    try { local = JSON.parse(localStorage.getItem('qiyiSiteConfig') || 'null'); } catch (e) { /* ignore */ }
    APP_STATE.site = normalizeSite(local);
    applySiteConfig();
    return Promise.resolve();
}

/**
 * 将站点外观应用到页面（问候语 / 自定义代码 / 标签页 / 快捷访问 / 页脚链接）
 */
function applySiteConfig() {
    const site = APP_STATE.site || DEFAULT_SITE;
    injectCustomBlocks(site);
    renderTabs(site);
    renderQuickAccess(site.quickAccess);
    // 自定义 LOGO：前台 logo + favicon（hasCustom→/api/site/logo/frontend；失败回退默认）
    applySiteLogo(site);
    // 页首天气区：weatherCode 有自定义代码则注入；否则渲染内置天气组件（城市 weatherCity）
    applyWeatherArea(site);
    // 首页开幕动画：按后台开关控制（默认开启；prefers-reduced-motion 下自动跳过）
    applySplash(site.splash !== false);
    // 默认搜索引擎：预选后台「外观」设置的引擎（百度默认）
    applyDefaultEngine(site.searchEngine);
    // 搜索快捷项：以后端配置为准（无后端/未配置时回退 CONFIG.QUICK_SEARCHES）
    if (Array.isArray(site.quickSearches) && site.quickSearches.length) {
        CONFIG.QUICK_SEARCHES = site.quickSearches;
    } else if (APP_STATE.backendMode && site.quickSearches && site.quickSearches.length === 0) {
        CONFIG.QUICK_SEARCHES = [];
    }
    if (typeof initSearchSuggestions === 'function') initSearchSuggestions();
    // 页脚：footerHtml 非空则整段接管整个 footer（前后台可完全自定义）；
    // 为空则用默认页脚并渲染功能链接（footerLinks）。
    const footerEl = document.getElementById('site-footer') || document.querySelector('footer');
    if (site.footerHtml && site.footerHtml.trim()) {
        if (footerEl) {
            footerEl.innerHTML = site.footerHtml;
            // 接管后重跑动态填充（年份 / 访问量），系统状态与版本为静态保留
            if (typeof initYearDisplay === 'function') initYearDisplay();
            if (typeof updateStatsDisplay === 'function') updateStatsDisplay();
            // 锁定页脚版本号：始终等于 CONFIG.VERSION（构建版本），不在页脚硬编码，避免与更新脱节
            // 优先取 #footer-version；兼容旧模板仅有 .version class（无 id）的情况，防止已存 config 脱节
            const fv = footerEl.querySelector('#footer-version') || footerEl.querySelector('.version');
            if (fv) fv.textContent = 'V' + (CONFIG.VERSION || '');
        }
    } else {
        if (footerEl) {
            const cf = footerEl.querySelector('#custom-footer');
            if (cf) cf.innerHTML = '';
        }
        renderFooterLinks(site.footerLinks);
    }
    // 问候语依赖 site.greeting，若当前可见则重新渲染一次
    if (document.getElementById('greeting-container')?.classList.contains('visible')) {
        showGreeting();
    }
    // 动态背景：按后台「外观」设置应用（前台）
    if (window.QiYiBackground) {
        QiYiBackground.apply({ effect: (site.bgEffect || 'particles'), target: (site.bgTarget || 'frontend'), isBackend: false });
    }
}

// 注入页眉/页脚自定义 HTML 与全站自定义 CSS（前后台通用）
function injectCustomBlocks(site) {
    const ch = document.getElementById('custom-header');
    if (ch) ch.innerHTML = site.headerHtml || '';
    // 前台 footer 由 applySiteConfig 统一接管；此处仅保留页眉与自定义 CSS 注入
    let styleEl = document.getElementById('custom-css');
    if (!styleEl) {
        styleEl = document.createElement('style');
        styleEl.id = 'custom-css';
        document.head.appendChild(styleEl);
    }
    styleEl.textContent = site.customCss || '';
}

// V3.2.33：页首天气区——后台「外观」weatherCode 有自定义嵌入代码则优先注入（如中国天气网 iframe）；
// 否则渲染内置天气组件：实时温度 + 城市 + 风力湿度 + 3 天预报（数据源 wttr.in，免密钥、支持 CORS）
function applyWeatherArea(site) {
    const area = document.getElementById('weather-area');
    if (!area) return;
    const code = (site && typeof site.weatherCode === 'string' && site.weatherCode.trim())
        ? site.weatherCode.trim() : '';
    if (code) {
        // 用户自定义嵌入代码（兼容 V3.2.20-3.2.25 的 iframe 天气卡片）
        stopWeatherWidgetTimer();
        area.innerHTML = code;
        area.style.display = '';
        area.classList.remove('weather-widget-mode');
        return;
    }
    const city = (site && typeof site.weatherCity === 'string' && site.weatherCity.trim())
        ? site.weatherCity.trim() : '广州';
    renderWeatherWidget(area, city);
}

// 天气代码 → 图标 emoji（wttr.in weatherCode 精简映射，未覆盖代码回退 🌡️）
const WEATHER_CODE_ICON = {
    113: '☀️', 116: '🌤️', 119: '☁️', 122: '☁️', 143: '🌫️',
    176: '🌦️', 179: '🌨️', 182: '🌨️', 185: '🌧️', 200: '⛈️',
    227: '🌨️', 230: '🌨️', 248: '🌫️', 260: '🌫️', 263: '🌦️',
    266: '🌧️', 281: '🌧️', 284: '🌧️', 293: '🌦️', 296: '🌧️',
    299: '🌧️', 302: '🌧️', 305: '🌧️', 308: '🌧️', 311: '🌧️',
    314: '🌧️', 317: '🌧️', 320: '🌨️', 323: '🌨️', 326: '🌨️',
    329: '🌨️', 332: '🌨️', 335: '🌨️', 338: '🌨️', 350: '🧊',
    353: '🌦️', 356: '🌧️', 359: '🌧️', 362: '🌧️', 365: '🌧️',
    368: '🌨️', 371: '🌨️', 374: '🌧️', 377: '🌧️', 386: '⛈️',
    389: '⛈️', 392: '⛈️', 395: '🌨️'
};
function weatherIcon(code) {
    return WEATHER_CODE_ICON[Number(code)] || '🌡️';
}
// 英文风向 → 中文
function windDirCn(d) {
    const map = { N: '北', NNE: '东北偏北', NE: '东北', ENE: '东北偏东', E: '东', ESE: '东南偏东', SE: '东南', SSE: '东南偏南', S: '南', SSW: '西南偏南', SW: '西南', WSW: '西南偏西', W: '西', WNW: '西北偏西', NW: '西北', NNW: '西北偏北' };
    return map[d] || d || '';
}

let weatherWidgetTimer = null;
function stopWeatherWidgetTimer() {
    if (weatherWidgetTimer) { clearTimeout(weatherWidgetTimer); weatherWidgetTimer = null; }
}

// 渲染内置天气组件（wttr.in 免密钥 JSON）；每 30 分钟自动刷新一次
function renderWeatherWidget(area, city) {
    if (!area) return;
    stopWeatherWidgetTimer();
    area.innerHTML = '<div class="weather-widget weather-loading">正在获取 <b>' + escapeHtml(city) + '</b> 天气…</div>';
    area.style.display = '';
    area.classList.add('weather-widget-mode');

    const url = 'https://wttr.in/' + encodeURIComponent(city) + '?format=j1&lang=zh&m';
    fetch(url)
        .then(function (resp) {
            if (!resp.ok) throw new Error('HTTP ' + resp.status);
            return resp.json();
        })
        .then(function (data) { renderWeatherWidgetData(area, city, data); })
        .catch(function (err) {
            console.error('天气获取失败:', err);
            area.innerHTML = '<div class="weather-widget weather-error">天气获取失败（30 分钟后自动重试）</div>';
        });
    // 30 分钟自动刷新
    weatherWidgetTimer = setTimeout(function () { renderWeatherWidget(area, city); }, 30 * 60 * 1000);
}

// 渲染天气数据：当前温度 + 城市 + 描述 + 风力湿度 + 3 天预报
function renderWeatherWidgetData(area, city, data) {
    const cur = data && data.current_condition && data.current_condition[0];
    const days = (data && data.weather) || [];
    if (!cur) {
        area.innerHTML = '<div class="weather-widget weather-error">天气数据为空</div>';
        return;
    }
    const temp = cur.temp_C + '°';
    const desc = (cur.lang_zh && cur.lang_zh[0] && cur.lang_zh[0].value) ||
                 (cur.weatherDesc && cur.weatherDesc[0] && cur.weatherDesc[0].value) || '';
    const icon = weatherIcon(cur.weatherCode);
    const wind = '💨 ' + windDirCn(cur.winddir16Point) + '风 ' + (cur.windspeedKmph || 0) + 'km/h';
    const hum = '💧 湿度 ' + (cur.humidity || 0) + '%';

    let fHtml = '';
    days.slice(0, 3).forEach(function (d, i) {
        const name = i === 0 ? '今天' : (i === 1 ? '明天' : '后天');
        const h = (d.hourly && d.hourly.length) ? d.hourly[Math.min(4, d.hourly.length - 1)] : null;
        const c = (h && h.lang_zh && h.lang_zh[0] && h.lang_zh[0].value) ||
                  (h && h.weatherDesc && h.weatherDesc[0] && h.weatherDesc[0].value) || '';
        const ic = weatherIcon(h && h.weatherCode);
        fHtml += '<div class="ww-day">' +
            '<span class="ww-day-name">' + name + '</span>' +
            '<span class="ww-day-icon">' + ic + '</span>' +
            '<span class="ww-day-desc">' + escapeHtml(c) + '</span>' +
            '<span class="ww-day-temp">' + d.mintempC + '°~' + d.maxtempC + '°</span>' +
            '</div>';
    });

    area.innerHTML =
        '<div class="weather-widget">' +
        '  <div class="ww-main">' +
        '    <span class="ww-temp">' + temp + '</span>' +
        '    <span class="ww-info">' +
        '      <span class="ww-city">📍 ' + escapeHtml(city) + '</span>' +
        '      <span class="ww-desc">' + icon + ' ' + escapeHtml(desc) + '</span>' +
        '    </span>' +
        '  </div>' +
        '  <div class="ww-meta"><span>' + wind + '</span><span>' + hum + '</span></div>' +
        '  <div class="ww-forecast">' + fHtml + '</div>' +
        '</div>';
}

// V3.2.20：首页开幕动画——启动遮罩播放后淡出并移除（尊重 prefers-reduced-motion）
function applySplash(enabled) {
    const splash = document.getElementById('splash');
    if (!splash) return;
    const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!enabled || reduceMotion) {
        if (splash.parentNode) splash.parentNode.removeChild(splash);
        return;
    }
    // 页面主内容就绪后（约 1s）淡出遮罩；CSS .splash.done 负责淡出与隐藏
    setTimeout(function () { splash.classList.add('done'); }, 900);
    setTimeout(function () { if (splash.parentNode) splash.parentNode.removeChild(splash); }, 1500);
}

// V3.2.20：默认搜索引擎——后台「外观」设置预选首页引擎（默认百度）。
// 「综合(SearXNG)」由 applySearchSettings 在确认 SearXNG 已启用后再预选，这里不直接选。
function applyDefaultEngine(engine) {
    if (!engine) return;
    APP_STATE.defaultEngine = engine;
    if (engine === 'searxng') return;
    const rb = document.querySelector('input[name="search-engine"][value="' + engine + '"]');
    if (rb) rb.checked = true;
}

// 渲染主标签页导航（顺序/名称/显隐由后台配置决定）
function renderTabs(site) {
    const container = document.getElementById('main-tabs');
    if (!container) return;
    const tabs = (site.tabs || []).filter(function (t) { return t.visible !== false; });
    container.innerHTML = '';
    tabs.forEach(function (t) {
        const div = document.createElement('div');
        div.className = 'main-tab' + (t.key === APP_STATE.currentTab ? ' active' : '');
        div.dataset.tab = t.key;
        const icon = t.icon ? '<i class="' + escapeHtml(t.icon) + '"></i> ' : '';
        div.innerHTML = icon + escapeHtml(t.label || t.key);
        container.appendChild(div);
    });
    // 当前 tab 可能被隐藏，则切到第一个可见 tab
    const stillVisible = tabs.some(function (t) { return t.key === APP_STATE.currentTab; });
    if (!stillVisible && tabs.length) {
        APP_STATE.currentTab = tabs[0].key;
    }
}

// 渲染底部「快捷访问」
function renderQuickAccess(items) {
    const wrap = document.getElementById('quick-access-links');
    if (!wrap) return;
    wrap.innerHTML = '';
    (items || []).forEach(function (it) {
        const a = document.createElement('a');
        a.href = it.href || '#';
        a.className = 'quick-link';
        a.title = it.text || '';
        if (it.target) a.target = it.target;
        const icon = it.icon ? '<i class="' + escapeHtml(it.icon) + '"></i> ' : '';
        a.innerHTML = icon + escapeHtml(it.text || '');
        wrap.appendChild(a);
    });
}

// 渲染页脚「功能链接」
function renderFooterLinks(items) {
    const wrap = document.getElementById('footer-links');
    if (!wrap) return;
    wrap.innerHTML = '';
    (items || []).forEach(function (it) {
        const a = document.createElement('a');
        a.href = it.href || '#';
        a.className = 'footer-link';
        a.title = it.text || '';
        if (it.target) a.target = it.target;
        const icon = it.icon ? '<i class="' + escapeHtml(it.icon) + '"></i> ' : '';
        a.innerHTML = icon + escapeHtml(it.text || '');
        wrap.appendChild(a);
    });
}

// ==================== 应用初始化 ====================

/**
 * 主初始化函数
 */
async function init() {
    console.log('正在初始化奇易智能导航系统...');

    loadAllDataFromStorage();

    // 加载链接数据（有后端走 API，否则回退默认+localStorage）
    await loadInitialData();

    // 加载并应用站点外观（问候语/自定义代码/标签页/快捷访问/页脚链接）
    await loadSiteConfig();

    // 初始化时间显示
    updateTimeDisplay();
    setInterval(updateTimeDisplay, 1000);

    // 初始化农历日期
    updateLunarDate();
    setInterval(updateLunarDate, 60000); // 每分钟更新一次

    // 初始化问候语
    initGreeting();
    initGreetingEvents();

    // 更新问候语中的日期信息（每小时更新一次）
    setInterval(() => {
        const greetingText = document.getElementById('greeting-text');
        const gc = document.getElementById('greeting-container');
        if (!greetingText || (gc && !gc.classList.contains('visible'))) {
            // 问候语处于隐藏状态时不刷新文本
            return;
        }

        const g = (APP_STATE.site && APP_STATE.site.greeting) || DEFAULT_SITE.greeting;
        // 自定义文案模式下不随时段刷新
        if (g.mode === 'custom' && g.text) return;
        const greeting = resolveGreetingText(g);
        if (greetingText && greeting) {
            greetingText.textContent = greeting;
        }
    }, 3600000); // 每小时更新一次

    initSearchSuggestions();
    initSearchAutocomplete();
    applySearchSettings();

    initEventListeners();

    initFloatingMenu();

    loadTabData('recommended', 1);

    updatePermissionUI();

    // 显示欢迎消息和系统信息
    setTimeout(() => {
        console.log('系统初始化完成');
        logActivity('系统启动成功', 'success');

        // 显示系统信息（延迟显示，避免与问候语冲突）
        setTimeout(() => {
            const now = new Date();
            const lunarInfo = LunarCalendar.getTodayLunarDate(now);
            const isWeekend = LunarCalendar.isWeekend(now);
            const festival = lunarInfo ? LunarCalendar.checkLunarFestival(lunarInfo.month, lunarInfo.day) : null;

            let welcomeMsg = `奇易智能导航系统 ${CONFIG.VERSION} 已就绪`;
            if (festival) {
                welcomeMsg += `，今天是${festival}`;
            } else if (isWeekend) {
                welcomeMsg += '，周末愉快！';
            }

            showNotification(welcomeMsg, 'success', 3000);
        }, 1000);
    }, 500);
}

// ==================== 搜索框自动提示功能 ====================

/**
 * 构建全局搜索索引（从所有分类的链接数据中提取）
 */
function buildSearchIndex() {
    const index = [];
    const data = APP_STATE.linkData;
    if (!data || typeof data !== 'object') return index;

    const catNames = CONFIG.CATEGORIES;
    const seen = new Set(); // 去重
    for (const [catKey, links] of Object.entries(data)) {
        if (!Array.isArray(links)) continue;
        const catName = catNames[catKey]?.name || catKey;
        links.forEach(link => {
            if (link && link.name) {
                const key = link.name + '|' + (link.url || '');
                if (seen.has(key)) return;
                seen.add(key);
                index.push({
                    name: link.name,
                    url: link.url || '',
                    category: catName,
                    catKey: catKey
                });
            }
        });
    }
    return index;
}

let _searchIndex = null;
function getSearchIndex() {
    if (!_searchIndex || _searchIndex.length === 0) _searchIndex = buildSearchIndex();
    return _searchIndex;
}

/** 刷新搜索索引（管理员增删改链接后调用） */
function refreshSearchIndex() {
    _searchIndex = null;
}

let _suggestionSelectedIndex = -1;
let _suggestionDebounceTimer = null;

/**
 * 显示热门网站推荐
 */
function showPopularSuggestions() {
    const dropdown = document.getElementById('search-suggestions');
    if (!dropdown) return;

    const popularSites = [
        {name: '百度', url: 'https://www.baidu.com/', category: '推荐网址'},
        {name: '腾讯', url: 'https://www.qq.com/', category: '推荐网址'},
        {name: '淘宝', url: 'https://www.taobao.com/', category: '推荐网址'},
        {name: '知乎', url: 'https://www.zhihu.com/', category: '推荐网址'},
        {name: 'B站', url: 'https://www.bilibili.com/', category: '推荐网址'},
        {name: 'GitHub', url: 'https://github.com/', category: '推荐网址'}
    ];

    let html = '<div style="padding: 8px 12px; color: var(--text-light); font-size: 0.85rem; border-bottom: 1px solid var(--border-color);">🔥 热门网站</div>';
    
    for (const item of popularSites) {
        html += `<div class="suggestion-item" data-url="${item.url.replace(/"/g, '&quot;')}" data-name="${escapeHtml(item.name)}">
            <span class="suggestion-icon">⭐</span>
            <span class="suggestion-name">${escapeHtml(item.name)}</span>
            <span class="suggestion-category">${escapeHtml(item.category)}</span>
        </div>`;
    }

    dropdown.innerHTML = html;
    dropdown.style.display = 'block';
    
    // 绑定点击事件
    dropdown.removeEventListener('click', dropdown._suggestionClickHandler);
    dropdown._suggestionClickHandler = function onSuggestionClick(e) {
        const item = e.target.closest('.suggestion-item');
        if (!item) return;
        const name = item.dataset.name;
        const url = item.dataset.url;
        const input = document.getElementById('search-input');
        if (input) {
            input.value = name;
            dropdown.style.display = 'none';
            if (url) window.open(url, '_blank');
        }
    };
    dropdown.addEventListener('click', dropdown._suggestionClickHandler);
}

/**
 * HTML转义函数
 */
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

/**
 * 显示搜索建议下拉框
 */
function showSuggestions(query) {
    const dropdown = document.getElementById('search-suggestions');
    if (!dropdown) return;

    const q = (query || '').trim();
    if (q.length === 0) {
        // 没有输入时显示热门网站推荐
        showPopularSuggestions();
        return;
    }

    const ql = q.toLowerCase();
    const index = getSearchIndex();

    const matches = [];
    // 精确前缀优先，其次包含
    for (const item of index) {
        const nameL = item.name.toLowerCase();
        if (nameL.startsWith(ql)) {
            matches.push(item);
        }
    }
    for (const item of index) {
        const nameL = item.name.toLowerCase();
        if (nameL.includes(ql) && !nameL.startsWith(ql)) {
            matches.push(item);
        }
    }

    const results = matches.slice(0, 12);

    if (results.length === 0) {
        dropdown.innerHTML = `<div class="suggestion-empty">
            <div style="font-size: 1.2rem; margin-bottom: 8px;">💡</div>
            <div>未找到匹配的网址</div>
            <div style="font-size: 0.85rem; margin-top: 4px; opacity: 0.8;">按回车键使用搜索引擎搜索「${escapeHtml(q)}」</div>
        </div>`;
        dropdown.style.display = 'block';
        _suggestionSelectedIndex = -1;
        return;
    }

    _suggestionSelectedIndex = -1;
    const escaped = ql.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const pattern = new RegExp('(' + escaped + ')', 'gi');

    let html = '';
    for (const item of results) {
        const safeName = escapeHtml(item.name);
        const nameHtml = safeName.replace(pattern, '<span class="suggestion-highlight">$1</span>');
        html += `<div class="suggestion-item" data-url="${item.url.replace(/"/g, '&quot;')}" data-name="${escapeHtml(item.name)}">
            <span class="suggestion-icon">🔗</span>
            <span class="suggestion-name">${nameHtml}</span>
            <span class="suggestion-category">${escapeHtml(item.category)}</span>
        </div>`;
    }

    dropdown.innerHTML = html;
    dropdown.style.display = 'block';

    // 用事件委托代替逐个绑定（先移除旧的再绑定，避免重复）
    dropdown.removeEventListener('click', dropdown._suggestionClickHandler);
    dropdown._suggestionClickHandler = function onSuggestionClick(e) {
        const item = e.target.closest('.suggestion-item');
        if (!item) return;
        const name = item.dataset.name;
        const url = item.dataset.url;
        const input = document.getElementById('search-input');
        if (input) {
            input.value = name;
            dropdown.style.display = 'none';
            if (url) window.open(url, '_blank');
        }
    };
    dropdown.addEventListener('click', dropdown._suggestionClickHandler);
}

/**
 * 处理建议下拉框的键盘导航
 */
function handleSuggestionsKeydown(e) {
    const dropdown = document.getElementById('search-suggestions');
    if (!dropdown || dropdown.style.display === 'none' || dropdown.style.display === '') return;

    const items = dropdown.querySelectorAll('.suggestion-item:not(.suggestion-empty)');
    if (items.length === 0) {
        // 没有可选项时，Enter 走默认搜索
        if (e.key === 'Enter') {
            dropdown.style.display = 'none';
        }
        return;
    }

    if (e.key === 'ArrowDown') {
        e.preventDefault();
        _suggestionSelectedIndex = (_suggestionSelectedIndex + 1) % items.length;
        updateActiveSuggestion(items);
    } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        _suggestionSelectedIndex = (_suggestionSelectedIndex - 1 + items.length) % items.length;
        updateActiveSuggestion(items);
    } else if (e.key === 'Enter' && _suggestionSelectedIndex >= 0) {
        e.preventDefault();
        items[_suggestionSelectedIndex].click();
    } else if (e.key === 'Escape') {
        dropdown.style.display = 'none';
        _suggestionSelectedIndex = -1;
    }
}

function updateActiveSuggestion(items) {
    items.forEach((el, idx) => {
        el.classList.toggle('active', idx === _suggestionSelectedIndex);
        if (idx === _suggestionSelectedIndex) {
            el.scrollIntoView({ block: 'nearest' });
        }
    });
}

/**
 * 初始化搜索框自动提示
 */
function initSearchAutocomplete() {
    const input = document.getElementById('search-input');
    const dropdown = document.getElementById('search-suggestions');
    if (!input || !dropdown) return;

    refreshSearchIndex();

    // 输入防抖：避免频繁重建
    input.addEventListener('input', function() {
        if (_suggestionDebounceTimer) clearTimeout(_suggestionDebounceTimer);
        _suggestionDebounceTimer = setTimeout(() => {
            showSuggestions(this.value);
        }, 80);
    });

    // 键盘导航
    input.addEventListener('keydown', handleSuggestionsKeydown);

    // 点击外部关闭下拉
    document.addEventListener('click', function(e) {
        if (dropdown.style.display !== 'none' &&
            !input.contains(e.target) &&
            !dropdown.contains(e.target)) {
            dropdown.style.display = 'none';
            _suggestionSelectedIndex = -1;
        }
    });

    // 获取焦点时有关键词则显示
    input.addEventListener('focus', function() {
        if (this.value.trim().length > 0) {
            showSuggestions(this.value);
        }
    });

    // 表单提交前关闭下拉
    document.getElementById('search-form')?.addEventListener('submit', function() {
        dropdown.style.display = 'none';
    });
}

// ==================== 无痕模式（退出时自动清理浏览数据） ====================

/** 保存链接数据（确保自定义链接不丢失） */
function saveLinkData() {
    // 后端模式下链接已实时保存到服务器，这里仅保留主题等本地偏好
    if (APP_STATE.backendMode) {
        try { localStorage.setItem('qiyiTheme', APP_STATE.darkMode ? 'dark' : 'light'); } catch (e) {}
        return;
    }
    if (APP_STATE.linkData && typeof APP_STATE.linkData === 'object') {
        try {
            localStorage.setItem('qiyiTechLinkData', JSON.stringify(APP_STATE.linkData));
            localStorage.setItem('qiyiTheme', APP_STATE.darkMode ? 'dark' : 'light');
        } catch (e) {
            console.warn('保存链接数据失败:', e);
        }
    }
}

/** 清理非必要的浏览数据，保留链接数据、主题设置和搜索历史 */
function clearBrowsingData() {
    // 先保存链接数据（确保用户增删的网址不丢）
    saveLinkData();

    // 清理浏览痕迹（保留搜索历史 qiyiSearchHistory）
    const keysToRemove = [
        'qiyiGreetingShown',
        'qiyiLinksPerPage',
        'qiyiVisitStats',
        'qiyiLastTab'
    ];
    keysToRemove.forEach(key => {
        try { localStorage.removeItem(key); } catch (e) { /* ignore */ }
    });

    console.log('🔒 无痕清理完成：浏览痕迹已清除，链接数据和搜索历史已保留');
}

// 页面关闭/刷新时自动清理
window.addEventListener('beforeunload', function() {
    clearBrowsingData();
});

// 用户离开页面（切换标签/关闭标签）时也清理
document.addEventListener('visibilitychange', function() {
    if (document.visibilityState === 'hidden') {
        // 延迟一点保存，确保当前状态被记录
        saveLinkData();
    }
});

// ==================== 启动应用 ====================

/**
 * 初始化年份显示
 */
function initYearDisplay() {
    const currentYear = new Date().getFullYear();
    const yearElements = ['current-year', 'current-year-footer'];
    yearElements.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.textContent = currentYear;
    });
}

// 启动应用时初始化年份
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
    initYearDisplay();
}

window.addEventListener('error', function(e) {
    console.error('全局错误:', e.error);
    showNotification(`系统错误: ${e.message}`, 'error');
});

window.addEventListener('unhandledrejection', function(e) {
    console.error('未处理的Promise错误:', e.reason);
    showNotification('发生未预期的错误', 'error');
});