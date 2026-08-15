/**
 * 奇易智能导航系统 - 后端 API 客户端
 * 同源请求自动携带 Cookie（HttpOnly），无需手动管理 token。
 * 仅用于"有后端"模式；无后端时前端回退到 localStorage。
 */
(function () {
  'use strict';

  function req(method, url, body) {
    const opts = { method: method, headers: {}, credentials: 'same-origin' };
    if (body !== undefined) {
      opts.headers['Content-Type'] = 'application/json';
      opts.body = JSON.stringify(body);
    }
    return fetch(url, opts).then(function (res) {
      let data = null;
      return res.text().then(function (text) {
        if (text) {
          try { data = JSON.parse(text); } catch (e) { data = text; }
        }
        return { status: res.status, ok: res.ok, data: data };
      });
    }).catch(function (err) {
      // 网络错误（例如以 file:// 方式直接打开，没有后端）
      return { status: 0, ok: false, data: null, error: err.message };
    });
  }

  const Api = {
    getLinks: function () { return req('GET', '/api/links'); },
    saveLinks: function (data) { return req('PUT', '/api/links', { data: data }); },
    login: function (password) { return req('POST', '/api/login', { password: password }); },
    logout: function () { return req('POST', '/api/logout'); },
    me: function () { return req('GET', '/api/me'); },
    changePassword: function (oldPassword, newPassword) {
      return req('POST', '/api/change-password', { oldPassword: oldPassword, newPassword: newPassword });
    },
    stats: function () { return req('GET', '/api/stats'); },
    importData: function (data) { return req('POST', '/api/import', { data: data }); },
    reset: function () { return req('POST', '/api/reset'); },
    exportData: function () { window.location.href = '/api/export'; },
    health: function () { return req('GET', '/api/health'); },
    // 集成设置（SearXNG 等）
    getSettings: function () { return req('GET', '/api/settings'); },
    saveSettings: function (searxng) { return req('PUT', '/api/settings', { searxng: searxng }); },
    // 站点外观（问候语/页眉页脚代码/自定义CSS/页脚链接/快捷访问/标签页）
    saveSite: function (site) { return req('PUT', '/api/settings', { site: site }); },
    resetSite: function () { return req('POST', '/api/site/reset'); },
    // 综合搜索（代理到 SearXNG）
    search: function (q, opts) {
      let url = '/api/search?q=' + encodeURIComponent(q);
      opts = opts || {};
      if (opts.engines) url += '&engines=' + encodeURIComponent(opts.engines);
      if (opts.categories) url += '&categories=' + encodeURIComponent(opts.categories);
      return req('GET', url);
    },
    // 站点 favicon 代理地址（前端卡片自动显示图标）
    faviconUrl: function (url) { return '/api/favicon?url=' + encodeURIComponent(url); },
    // 强制刷新全部站点图标缓存（后台"刷新图标"按钮）
    refreshFavicons: function () { return req('POST', '/api/favicons/refresh'); },
    // 图标自检报告（后台"图标自检"按钮）：?deep=1 在线探测可获取性
    iconCheck: function (deep) { return req('GET', '/api/icon-check' + (deep ? '?deep=1' : '')); },
    // 抓取网页标题与图标（后台"自动获取"）
    fetchMeta: function (url) { return req('GET', '/api/meta?url=' + encodeURIComponent(url)); },
    // 导入浏览器书签 HTML（合并去重）
    importHtml: function (html) { return req('POST', '/api/import-html', { html: html }); },
    // 自定义 LOGO 上传/清除：which ∈ {'frontend','backend'}；dataUrl 形如 data:image/png;base64,...
    uploadLogo: function (which, dataUrl) { return req('POST', '/api/site/upload-logo', { which: which, dataUrl: dataUrl }); },
    clearLogo: function (which) { return req('POST', '/api/site/clear-logo', { which: which }); }
  };

  window.Api = Api;
})();
