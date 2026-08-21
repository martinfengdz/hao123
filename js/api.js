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
    // full=true 时请求 /api/links?full=1（后台编辑需登录，返回含登录用户名/密码的完整字段）；
    // 默认公开视图不含 luser/lpass，仅含 hasCred 布尔（供前台显示「免密登录」入口）。
    getLinks: function (full) { return req('GET', '/api/links' + (full ? '?full=1' : '')); },
    // 免密登录中转页：拉取单条链接的登录凭据（公开，信任模型与 /api/links 一致）
    getCred: function (id) { return req('GET', '/api/cred/' + encodeURIComponent(id)); },
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
    clearLogo: function (which) { return req('POST', '/api/site/clear-logo', { which: which }); },
    // 自建页面：列表/创建/读取/更新/删除
    pages: function () { return req('GET', '/api/pages'); },
    createPage: function (name, content) { return req('POST', '/api/pages', { name: name, content: content }); },
    getPage: function (name) { return req('GET', '/api/pages/' + encodeURIComponent(name)); },
    updatePage: function (name, content) { return req('PUT', '/api/pages/' + encodeURIComponent(name), { content: content }); },
    deletePage: function (name) { return req('DELETE', '/api/pages/' + encodeURIComponent(name)); },
    // 版本更新检查（后台"有更新版"提示）
    updateCheck: function () { return req('GET', '/api/update-check'); },
    // 数据备份：下载 DATA_DIR 全量 zip（触发浏览器下载）
    backup: function () {
      return fetch('/api/backup', { method: 'GET', credentials: 'same-origin' })
        .then(function (res) {
          if (!res.ok) {
            return res.json().then(function (j) { throw new Error(j.error || ('HTTP ' + res.status)); })
              .catch(function () { throw new Error('HTTP ' + res.status); });
          }
          const cd = res.headers.get('Content-Disposition') || '';
          const m = cd.match(/filename="?([^";]+)"?/);
          const fname = m ? m[1] : ('qiyi-nav-backup-' + Date.now() + '.zip');
          return res.blob().then(function (blob) {
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url; a.download = fname; document.body.appendChild(a); a.click();
            document.body.removeChild(a); setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
          });
        });
    },
    // 数据还原：上传 zip 文件（raw binary），后端会先自动备份再覆盖
    restore: function (file) {
      return file.arrayBuffer().then(function (buf) {
        return fetch('/api/restore', {
          method: 'POST', credentials: 'same-origin',
          headers: { 'Content-Type': 'application/zip' }, body: buf
        }).then(function (res) {
          return res.text().then(function (text) {
            let data = null; try { data = JSON.parse(text); } catch (e) { data = text; }
            return { status: res.status, ok: res.ok, data: data };
          });
        });
      });
    }
  };

  window.Api = Api;
})();
