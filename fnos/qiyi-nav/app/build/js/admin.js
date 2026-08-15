/**
 * 奇易导航 · 后台管理逻辑
 * 所有写操作均通过 PUT /api/links（全量保存）完成，鉴权由 HttpOnly Cookie 保障。
 */
(function () {
    'use strict';

    var CAT_NAMES = {
        recommended: '推荐网址', proxy: '代理系统', internal: '内部系统', software: '软件工具',
        business: '在线业务', common: '常用网址', finance: '财务理财', work: '工作工具', side: 'AI工具'
    };
    var CAT_KEYS = Object.keys(CAT_NAMES);

    // 标准图标候选（全量常用 Font Awesome 实心图标，避免手填 class；弹层内可搜索）
    var ICON_CHOICES = [
        // 通用 / 界面
        'fa-link', 'fa-globe', 'fa-home', 'fa-house', 'fa-search', 'fa-star', 'fa-bolt', 'fa-cog', 'fa-cogs',
        'fa-gear', 'fa-tools', 'fa-wrench', 'fa-sliders-h', 'fa-bookmark', 'fa-flag', 'fa-tags', 'fa-tag',
        'fa-bell', 'fa-comment', 'fa-comments', 'fa-envelope', 'fa-phone', 'fa-calendar-alt', 'fa-clock',
        'fa-trash-alt', 'fa-edit', 'fa-pencil', 'fa-plus', 'fa-minus', 'fa-times', 'fa-check', 'fa-ban',
        'fa-exclamation-circle', 'fa-circle-exclamation', 'fa-triangle-exclamation', 'fa-info', 'fa-circle-info',
        'fa-question', 'fa-eye', 'fa-eye-slash', 'fa-lock', 'fa-unlock', 'fa-key', 'fa-user', 'fa-users',
        'fa-id-badge', 'fa-fingerprint', 'fa-heart', 'fa-thumbs-up', 'fa-smile', 'fa-grin', 'fa-magic', 'fa-wand-magic-sparkles',
        // 科技 / 设备
        'fa-server', 'fa-database', 'fa-cloud', 'fa-wifi', 'fa-network-wired', 'fa-microchip', 'fa-desktop',
        'fa-laptop', 'fa-mobile-alt', 'fa-tablet', 'fa-robot', 'fa-code', 'fa-terminal', 'fa-bug', 'fa-rocket',
        'fa-sitemap', 'fa-project-diagram', 'fa-diagram-project', 'fa-plug', 'fa-power-off', 'fa-hdd', 'fa-memory',
        'fa-shield-alt', 'fa-shield', 'fa-satellite', 'fa-signal', 'fa-battery-full',
        // 商业 / 财务
        'fa-briefcase', 'fa-building', 'fa-chart-line', 'fa-chart-bar', 'fa-chart-pie', 'fa-wallet', 'fa-coins',
        'fa-money-bill-wave', 'fa-credit-card', 'fa-calculator', 'fa-receipt', 'fa-file-invoice', 'fa-piggy-bank',
        'fa-dollar-sign', 'fa-percentage', 'fa-handshake', 'fa-store', 'fa-cart-shopping', 'fa-bag-shopping',
        'fa-scale-balanced', 'fa-landmark', 'fa-industry', 'fa-truck', 'fa-boxes', 'fa-warehouse',
        // 媒体 / 文档
        'fa-music', 'fa-film', 'fa-image', 'fa-images', 'fa-camera', 'fa-video', 'fa-tv', 'fa-photo-video',
        'fa-play', 'fa-play-circle', 'fa-podcast', 'fa-microphone', 'fa-headphones', 'fa-volume-up', 'fa-book',
        'fa-book-open', 'fa-newspaper', 'fa-archive', 'fa-file', 'fa-file-alt', 'fa-folder', 'fa-folder-open',
        'fa-folder-plus', 'fa-file-plus', 'fa-copy', 'fa-print', 'fa-pen', 'fa-paper-plane', 'fa-share', 'fa-share-alt',
        'fa-at', 'fa-comment-dots', 'fa-rss', 'fa-bullhorn', 'fa-megaphone', 'fa-address-book',
        // 出行 / 地图
        'fa-map', 'fa-map-marker-alt', 'fa-location-arrow', 'fa-compass', 'fa-plane', 'fa-car', 'fa-train',
        'fa-ship', 'fa-bicycle', 'fa-bus', 'fa-route', 'fa-umbrella',
        // 自然 / 生活
        'fa-sun', 'fa-moon', 'fa-cloud-sun', 'fa-cloud-rain', 'fa-leaf', 'fa-tree', 'fa-recycle', 'fa-fire',
        'fa-heartbeat', 'fa-stethoscope', 'fa-pills', 'fa-first-aid', 'fa-graduation-cap', 'fa-school',
        'fa-university', 'fa-certificate', 'fa-award', 'fa-trophy', 'fa-medal',
        // 其他
        'fa-gem', 'fa-crown', 'fa-gift', 'fa-box', 'fa-box-open', 'fa-cube', 'fa-cubes', 'fa-layer-group',
        'fa-palette', 'fa-paint-brush', 'fa-brush', 'fa-ruler', 'fa-hammer', 'fa-screwdriver', 'fa-saw',
        'fa-anchor', 'fa-traffic-light', 'fa-lightbulb', 'fa-brain', 'fa-dna', 'fa-atom', 'fa-flask',
        'fa-microscope', 'fa-user-plus', 'fa-user-edit', 'fa-gear',
        'fa-chart-area', 'fa-chart-line'
    ];
    // idx: 在数组中的下标；target: 'tabs' | 'quick' | 'footer'，直接指明写入哪个数组
    // 不再依赖 DOM 层级遍历，避免「未找到该图标所属条目」
    function iconPickerMarkup(icon, idx, target) {
        var cur = icon || 'fa-link';
        return '<div class="icon-picker">' +
            '<button type="button" class="icon-pick-btn" data-act="open-icon" data-idx="' + idx + '" data-target="' + target + '" title="选择图标"><i class="fas ' + cur + '"></i></button>' +
        '</div>';
    }

    var state = {
        data: {},
        darkMode: false,
        selected: {}, // key -> true
        activeCat: 'all', // 当前左侧分类：'all' 或具体分类 key
        activeNav: null, // 当前导航设置项：'tabs' | 'quick' | null
        adminView: 'links', // 右侧视图：'links' | 'tabs' | 'quick'
        editRow: null // 表格内联编辑：{ cat, id } 编辑已有 | { isNew:true, cat } 新增
    };

    // ---------- 工具 ----------
    function $(id) { return document.getElementById(id); }

    function notify(msg, type) {
        var n = $('admin-notification');
        var t = $('admin-notification-text');
        if (!n || !t) return;
        t.textContent = msg;
        n.className = 'notification show ' + (type || 'info');
        setTimeout(function () { n.className = 'notification ' + (type || 'info'); }, 2800);
    }

    function genId(cat) {
        return cat.substring(0, 3) + '_' + Date.now().toString(36) + Math.floor(Math.random() * 1000);
    }

    function escapeHtml(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    // 整页页脚默认 HTML（footerHtml 为空时作默认值；也作为后台「恢复默认」写入的整段页脚代码）
    var DEFAULT_FOOTER_HTML = [
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

    // ---------- 鉴权视图切换 ----------
    function showDashboard() {
        $('login-view').style.display = 'none';
        $('dashboard-view').style.display = 'block';
        loadAll();
        loadAppearanceState();
    }
    function showLogin() {
        $('login-view').style.display = 'flex';
        $('dashboard-view').style.display = 'none';
    }

    function checkAuth() {
        Api.me().then(function (r) {
            if (r.status === 200 && r.data && r.data.authenticated) {
                showDashboard();
            } else {
                showLogin();
            }
        }).catch(function () { showLogin(); });
    }

    // ---------- 数据加载与渲染 ----------
    function loadAll() {
        Api.getLinks().then(function (r) {
            if (r.status === 200 && r.data && r.data.data) {
                state.data = r.data.data;
                // 补全缺失分类
                CAT_KEYS.forEach(function (c) { if (!Array.isArray(state.data[c])) state.data[c] = []; });
                renderStats();
                renderTable();
            } else if (r.status === 401) {
                showLogin();
            } else {
                notify('加载数据失败', 'error');
            }
        });
        // 同时拉统计（若失败不影响表格）
        Api.stats().then(function (r) {
            if (r.status === 200 && r.data) renderStats(r.data);
        });
    }

    function renderStats(statsData) {
        var cards = $('stat-cards');
        if (!cards) return;
        var total = 0, marked = 0;
        CAT_KEYS.forEach(function (c) {
            var arr = Array.isArray(state.data[c]) ? state.data[c] : [];
            total += arr.length;
            arr.forEach(function (it) { if (it.class) marked++; });
        });
        var viewLabel, viewNum;
        if (state.activeCat === 'all') { viewLabel = '全部网址'; viewNum = total; }
        else { viewLabel = CAT_NAMES[state.activeCat]; viewNum = Array.isArray(state.data[state.activeCat]) ? state.data[state.activeCat].length : 0; }
        cards.innerHTML =
            statCard('fa-link', 'success', total, '链接总数') +
            statCard('fa-layer-group', 'info', CAT_KEYS.length, '分类数量') +
            statCard('fa-palette', 'warning', marked, '已标记') +
            statCard('fa-filter', '', viewNum, viewLabel);
        renderSidebar();
    }

    function statCard(icon, variant, num, label) {
        return '<div class="stat-card ' + variant + '">' +
            '<div class="stat-icon"><i class="fas ' + icon + '"></i></div>' +
            '<div><div class="stat-num">' + num + '</div><div class="stat-label">' + label + '</div></div>' +
        '</div>';
    }

    function totalCount() {
        var t = 0;
        CAT_KEYS.forEach(function (c) { t += Array.isArray(state.data[c]) ? state.data[c].length : 0; });
        return t;
    }

    // 左侧分类导航（含数量）
    function renderSidebar() {
        var ul = $('sidebar-cats');
        if (!ul) return;
        var html = '<li class="sidebar-cat' + (state.activeCat === 'all' ? ' active' : '') +
            '" data-cat="all">全部网址 <span class="cat-count">' + totalCount() + '</span></li>';
        CAT_KEYS.forEach(function (c) {
            var n = Array.isArray(state.data[c]) ? state.data[c].length : 0;
            html += '<li class="sidebar-cat' + (state.activeCat === c ? ' active' : '') +
                '" data-cat="' + c + '">' + CAT_NAMES[c] + ' <span class="cat-count">' + n + '</span></li>';
        });
        ul.innerHTML = html;
        syncSidebarActive();
    }

    // 左侧选中高亮（网址分类 + 导航设置）
    function syncSidebarActive() {
        document.querySelectorAll('#sidebar-cats .sidebar-cat').forEach(function (li) {
            li.classList.toggle('active', li.getAttribute('data-cat') === state.activeCat);
        });
        document.querySelectorAll('#sidebar-nav .sidebar-nav-item').forEach(function (li) {
            li.classList.toggle('active', li.getAttribute('data-nav') === state.activeNav);
        });
    }

    // 右侧视图切换：links（网址表格）/ tabs（主标签页）/ quick（快捷访问）
    function switchView(view) {
        state.adminView = view;
        var lv = $('links-view'), tv = $('nav-tabs-view'), qv = $('nav-quick-view');
        if (lv) lv.style.display = (view === 'links') ? 'block' : 'none';
        if (tv) tv.style.display = (view === 'tabs') ? 'block' : 'none';
        if (qv) qv.style.display = (view === 'quick') ? 'block' : 'none';
    }

    function renderTable() {
        var tbody = $('admin-rows');
        if (!tbody) return;
        var q = ($('admin-search').value || '').trim().toLowerCase();
        var catFilter = state.activeCat === 'all' ? '' : state.activeCat;

        var rows = '';
        var visibleCount = 0;

        // 内联「新增」行（置顶，直接在原表格里填写）
        if (state.editRow && state.editRow.isNew) {
            rows += editRowMarkup(null, state.editRow.cat, '', true);
            visibleCount++;
        }

        CAT_KEYS.forEach(function (cat) {
            var arr = Array.isArray(state.data[cat]) ? state.data[cat] : [];
            arr.forEach(function (item) {
                var name = item.name || '';
                var url = item.url || '';
                if (catFilter && catFilter !== cat) return;
                if (q && name.toLowerCase().indexOf(q) === -1 && url.toLowerCase().indexOf(q) === -1) return;
                // 该行正在内联编辑 → 渲染为编辑行（不另开窗口）
                if (state.editRow && !state.editRow.isNew && state.editRow.cat === cat && state.editRow.id === (item.id || '')) {
                    rows += editRowMarkup(item, cat, item.id || '', false);
                    visibleCount++;
                    return;
                }
                visibleCount++;
                var key = cat + '::' + (item.id || url);
                var checked = state.selected[key] ? 'checked' : '';
                var color = item.class ? '<span class="color-dot ' + item.class + '"></span>' : '<span class="color-dot" style="background:#ccc"></span>';
                rows += '<tr draggable="true" data-cat="' + cat + '" data-id="' + escapeHtml(item.id || '') + '">' +
                    '<td data-label="选择"><input type="checkbox" class="row-select" data-key="' + escapeHtml(key) + '" ' + checked + '></td>' +
                    '<td data-label="名称"><span class="drag-handle" title="拖拽排序"><i class="fas fa-grip-vertical"></i></span> ' + escapeHtml(name) + '</td>' +
                    '<td data-label="地址"><a class="link-url" href="' + escapeHtml(url) + '" target="_blank" rel="noopener">' + escapeHtml(url) + '</a></td>' +
                    '<td data-label="分类"><span class="cat-tag">' + CAT_NAMES[cat] + '</span></td>' +
                    '<td data-label="标记">' + color + '</td>' +
                    '<td data-label="操作"><div class="row-actions">' +
                        '<button class="btn btn-small btn-secondary" data-act="edit" data-cat="' + cat + '" data-id="' + escapeHtml(item.id || '') + '"><i class="fas fa-edit"></i></button>' +
                        '<button class="btn btn-small btn-danger" data-act="del" data-cat="' + cat + '" data-id="' + escapeHtml(item.id || '') + '"><i class="fas fa-trash"></i></button>' +
                    '</div></td>' +
                '</tr>';
            });
        });

        tbody.innerHTML = rows;
        $('admin-empty').style.display = visibleCount === 0 ? 'block' : 'none';
        var tc = $('table-count'); if (tc) tc.textContent = '共 ' + visibleCount + ' 条';
        updateSelectedCount();
    }

    function updateSelectedCount() {
        var keys = Object.keys(state.selected).filter(function (k) { return state.selected[k]; });
        $('selected-count').textContent = '已选 ' + keys.length + ' 项';
        $('admin-batch-delete').disabled = keys.length === 0;
        $('admin-batch-move').disabled = keys.length === 0;
        var bar = $('batch-bar');
        if (bar) bar.classList.toggle('active', keys.length > 0);
    }

    // ---------- 保存（全量） ----------
    function persist() {
        return Api.saveLinks(state.data).then(function (r) {
            if (r.status === 200) {
                notify('保存成功', 'success');
                renderStats();
                return true;
            } else if (r.status === 401) {
                notify('登录已失效，请重新登录', 'error');
                setTimeout(showLogin, 800);
                return false;
            } else {
                notify('保存失败：' + ((r.data && r.data.error) || r.status), 'error');
                return false;
            }
        });
    }

    // 保存站点外观（整体保存 appearanceState；导航结构/快捷访问/标签页共用）
    function saveAppearance(btn, msg) {
        if (!appearanceState) return;
        var old = btn.innerHTML;
        btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 保存中...';
        Api.saveSite(appearanceState).then(function (r) {
            if (r.status === 200) {
                notify(msg || '已保存', 'success');
                applyAppearanceFromState(appearanceState);
            } else if (r.status === 401) {
                notify('登录已失效，请重新登录', 'error');
            } else {
                notify('保存失败：' + ((r.data && r.data.error) || r.status), 'error');
            }
        }).catch(function () {
            notify('保存失败，请稍后重试', 'error');
        }).finally(function () { btn.disabled = false; btn.innerHTML = old; });
    }

    function findItem(cat, id) {
        var arr = state.data[cat] || [];
        return arr.filter(function (it) { return (it.id || '') === id; })[0];
    }

    // ---------- 分类下拉 / 颜色下拉 ----------
    function catOptions(selected) {
        return CAT_KEYS.map(function (c) {
            return '<option value="' + c + '"' + (c === selected ? ' selected' : '') + '>' + CAT_NAMES[c] + '</option>';
        }).join('');
    }
    function colorOptions(selected) {
        var opts = [['', '默认'], ['red', '红色'], ['green', '绿色'], ['blue', '蓝色'], ['orange', '橙色'], ['purple', '紫色']];
        return opts.map(function (o) {
            return '<option value="' + o[0] + '"' + (o[0] === selected ? ' selected' : '') + '>' + o[1] + '</option>';
        }).join('');
    }

    // ---------- 表格内联编辑行（不再弹窗） ----------
    function editRowMarkup(item, cat, id, isNew) {
        var name = item ? (item.name || '') : '';
        var url = item ? (item.url || '') : '';
        var cls = item ? (item.class || '') : '';
        var defCat = isNew ? (state.activeCat === 'all' ? 'recommended' : state.activeCat) : cat;
        return '<tr class="edit-row" data-cat="' + cat + '" data-id="' + escapeHtml(id || '') + '" data-new="' + (isNew ? 1 : 0) + '">' +
            '<td data-label="选择"></td>' +
            '<td data-label="名称"><input class="inline-input" data-f="name" value="' + escapeHtml(name) + '" placeholder="网站名称 *"></td>' +
            '<td data-label="地址"><div class="inline-url-wrap"><input class="inline-input" data-f="url" value="' + escapeHtml(url) + '" placeholder="https://example.com *">' +
                '<button type="button" class="btn btn-small btn-secondary" data-act="inline-fetch" title="根据网址自动获取名称"><i class="fas fa-magic"></i></button></div></td>' +
            '<td data-label="分类"><select class="inline-select" data-f="cat">' + catOptions(defCat) + '</select></td>' +
            '<td data-label="标记"><select class="inline-select" data-f="class">' + colorOptions(cls) + '</select></td>' +
            '<td data-label="操作"><div class="row-actions">' +
                '<button class="btn btn-small btn-success" data-act="inline-save"><i class="fas fa-check"></i> 保存</button>' +
                '<button class="btn btn-small btn-secondary" data-act="inline-cancel"><i class="fas fa-times"></i> 取消</button>' +
            '</div></td>' +
        '</tr>';
    }

    // 内联保存（新增或编辑）
    function saveInlineRow(tr) {
        var cat = tr.getAttribute('data-cat');
        var id = tr.getAttribute('data-id');
        var isNew = tr.getAttribute('data-new') === '1';
        var nameEl = tr.querySelector('[data-f="name"]');
        var urlEl = tr.querySelector('[data-f="url"]');
        var catEl = tr.querySelector('[data-f="cat"]');
        var clsEl = tr.querySelector('[data-f="class"]');
        var name = nameEl.value.trim();
        var url = urlEl.value.trim();
        var newCat = catEl.value;
        var color = clsEl.value;
        if (!name || !url) { notify('请填写名称和地址', 'warning'); return; }
        if (!/^https?:\/\//i.test(url)) { notify('地址需以 http:// 或 https:// 开头', 'warning'); return; }
        if (isNew) {
            var item = { id: genId(newCat), name: name, url: url, class: color };
            if (!Array.isArray(state.data[newCat])) state.data[newCat] = [];
            state.data[newCat].unshift(item);
        } else {
            var it = findItem(cat, id);
            if (!it) { notify('未找到该项', 'error'); return; }
            it.name = name; it.url = url; it.class = color;
            if (cat !== newCat) {
                state.data[cat] = (state.data[cat] || []).filter(function (x) { return (x.id || '') !== id; });
                if (!Array.isArray(state.data[newCat])) state.data[newCat] = [];
                state.data[newCat].unshift(it);
            }
        }
        state.editRow = null;
        persist().then(function (ok) { if (ok) { renderStats(); renderTable(); } });
    }

    // 内联「自动获取」：根据网址补全名称
    function fetchInlineMeta(tr, btn) {
        var urlEl = tr.querySelector('[data-f="url"]');
        var url = (urlEl ? urlEl.value : '').trim();
        if (!/^https?:\/\//i.test(url)) { notify('请先填写有效的网址', 'warning'); return; }
        var old = btn.innerHTML;
        btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
        Api.fetchMeta(url).then(function (r) {
            btn.disabled = false; btn.innerHTML = old;
            if (r.status === 200 && r.data && r.data.title) {
                var nameEl = tr.querySelector('[data-f="name"]');
                if (nameEl && !nameEl.value.trim()) nameEl.value = r.data.title;
                notify('已自动补全网站名称', 'success');
            } else {
                notify('未获取到标题（可手动填写）', 'warning');
            }
        }).catch(function () {
            btn.disabled = false; btn.innerHTML = old;
            notify('获取失败，请稍后重试', 'error');
        });
    }

    // ---------- 改密码模态框 ----------
    function openPwModal() {
        $('pw-old').value = ''; $('pw-new').value = ''; $('pw-confirm').value = '';
        $('pw-error').textContent = '';
        $('pw-modal').style.display = 'flex';
    }
    function closePwModal() { $('pw-modal').style.display = 'none'; }

    // ---------- 主题 ----------
    function applyTheme() {
        document.body.classList.toggle('dark-mode', state.darkMode);
    }
    function toggleTheme() {
        state.darkMode = !state.darkMode;
        localStorage.setItem('qiyiTheme', state.darkMode ? 'dark' : 'light');
        applyTheme();
    }

    // ==================== 事件绑定 ====================
    function bind() {
        // 登录（加固：loading 态 + 网络错误提示 + 防重复提交，杜绝“输密码没反应”观感）
        $('login-form').addEventListener('submit', function (e) {
            e.preventDefault();
            var pw = $('login-password').value;
            var errEl = $('login-error');
            var btn = e.target.querySelector('button[type="submit"]');
            if (!pw) { errEl.textContent = '请输入管理密码'; return; }
            var oldHtml = btn.innerHTML;
            btn.disabled = true;
            btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 登录中...';
            errEl.textContent = '';
            Api.login(pw).then(function (r) {
                if (r.status === 200) {
                    errEl.textContent = '';
                    showDashboard();
                } else if (r.status === 0) {
                    errEl.textContent = '网络错误，请确认服务已正常运行';
                    btn.disabled = false; btn.innerHTML = oldHtml;
                } else {
                    errEl.textContent = '密码错误，请重试';
                    $('login-password').value = '';
                    btn.disabled = false; btn.innerHTML = oldHtml;
                }
            }).catch(function () {
                errEl.textContent = '登录请求失败，请稍后重试';
                btn.disabled = false; btn.innerHTML = oldHtml;
            });
        });

        // 退出
        $('admin-logout').addEventListener('click', function () {
            Api.logout().then(function () { showLogin(); });
        });

        // 主题
        $('admin-theme').addEventListener('click', toggleTheme);

        // 搜索
        $('admin-search').addEventListener('input', renderTable);

        // 左侧分类导航点击（切回网址管理视图）
        $('sidebar-cats').addEventListener('click', function (e) {
            var li = e.target.closest('.sidebar-cat');
            if (!li) return;
            state.activeCat = li.getAttribute('data-cat');
            state.activeNav = null;
            state.editRow = null; // 切换分类时取消内联编辑
            switchView('links');
            renderSidebar();
            renderTable();
        });

        // 左侧导航设置点击（切到对应编辑视图）
        $('sidebar-nav').addEventListener('click', function (e) {
            var li = e.target.closest('.sidebar-nav-item');
            if (!li) return;
            state.activeNav = li.getAttribute('data-nav');
            state.editRow = null; // 离开网址视图时取消内联编辑
            switchView(state.activeNav === 'tabs' ? 'tabs' : 'quick');
            syncSidebarActive();
            renderSideTabs();
            renderSideQuick();
        });

        // 侧栏分类过滤
        $('sidebar-search').addEventListener('input', function () {
            var q = this.value.trim().toLowerCase();
            document.querySelectorAll('#sidebar-cats .sidebar-cat').forEach(function (li) {
                if (li.getAttribute('data-cat') === 'all') { li.classList.remove('hidden'); return; }
                var name = (CAT_NAMES[li.getAttribute('data-cat')] || '').toLowerCase();
                li.classList.toggle('hidden', q && name.indexOf(q) === -1);
            });
        });

        // 新增（在表格内直接出现内联编辑行，默认归入当前选中分类）
        $('admin-add').addEventListener('click', function () {
            state.editRow = { isNew: true, cat: state.activeCat === 'all' ? 'recommended' : state.activeCat };
            switchView('links');
            renderTable();
        });

        // 导出
        $('admin-export').addEventListener('click', function () { Api.exportData(); });

        // 导入
        $('admin-import').addEventListener('click', function () { $('admin-import-file').click(); });
        $('admin-import-file').addEventListener('change', function (e) {
            var file = e.target.files[0];
            if (!file) return;
            var reader = new FileReader();
            reader.onload = function () {
                try {
                    var parsed = JSON.parse(reader.result);
                    var imported = parsed.data || parsed;
                    if (!imported || typeof imported !== 'object') throw new Error('格式错误');
                    CAT_KEYS.forEach(function (c) { if (!Array.isArray(imported[c])) imported[c] = []; });
                    state.data = imported;
                    persist().then(function (ok) { if (ok) renderTable(); });
                } catch (err) {
                    notify('导入失败：' + err.message, 'error');
                }
            };
            reader.readAsText(file);
            e.target.value = '';
        });

        // 重置
        $('admin-reset').addEventListener('click', function () {
            if (confirm('确定要将所有链接重置为系统默认数据吗？此操作不可撤销。')) {
                Api.reset().then(function (r) {
                    if (r.status === 200) { notify('已重置为默认数据', 'success'); loadAll(); }
                    else notify('重置失败', 'error');
                });
            }
        });

        // 表格内编辑/删除/内联保存（事件委托，不再弹窗）
        $('admin-rows').addEventListener('click', function (e) {
            var btn = e.target.closest('button[data-act]');
            if (!btn) return;
            var act = btn.getAttribute('data-act');
            var tr = btn.closest('tr');
            if (!tr) return;
            var cat = tr.getAttribute('data-cat');
            var id = tr.getAttribute('data-id');
            if (act === 'edit') {
                state.editRow = { cat: cat, id: id };
                renderTable();
            } else if (act === 'del') {
                if (confirm('确定删除该网址吗？')) {
                    state.data[cat] = (state.data[cat] || []).filter(function (it) { return (it.id || '') !== id; });
                    persist().then(function (ok) { if (ok) { renderStats(); renderTable(); } });
                }
            } else if (act === 'inline-save') {
                saveInlineRow(tr);
            } else if (act === 'inline-cancel') {
                state.editRow = null;
                renderTable();
            } else if (act === 'inline-fetch') {
                fetchInlineMeta(tr, btn);
            }
        });

        // 行选择
        $('admin-rows').addEventListener('change', function (e) {
            var cb = e.target.closest('.row-select');
            if (!cb) return;
            var key = cb.getAttribute('data-key');
            if (cb.checked) state.selected[key] = true; else delete state.selected[key];
            updateSelectedCount();
        });
        $('select-all').addEventListener('change', function () {
            var check = this.checked;
            document.querySelectorAll('.row-select').forEach(function (cb) {
                var key = cb.getAttribute('data-key');
                if (check) state.selected[key] = true; else delete state.selected[key];
                cb.checked = check;
            });
            updateSelectedCount();
        });

        // 批量删除
        $('admin-batch-delete').addEventListener('click', function () {
            var keys = Object.keys(state.selected).filter(function (k) { return state.selected[k]; });
            if (keys.length === 0) return;
            if (!confirm('确定删除选中的 ' + keys.length + ' 个网址吗？')) return;
            keys.forEach(function (k) {
                var parts = k.split('::');
                var cat = parts[0], id = parts[1];
                state.data[cat] = (state.data[cat] || []).filter(function (it) { return (it.id || '') !== id; });
            });
            state.selected = {};
            persist().then(function (ok) { if (ok) renderTable(); });
        });

        // 批量移动
        $('admin-batch-move').addEventListener('click', function () {
            var target = $('batch-move-cat').value;
            var keys = Object.keys(state.selected).filter(function (k) { return state.selected[k]; });
            if (keys.length === 0) return;
            if (!confirm('将选中的 ' + keys.length + ' 个网址移动到「' + CAT_NAMES[target] + '」？')) return;
            keys.forEach(function (k) {
                var parts = k.split('::');
                var cat = parts[0], id = parts[1];
                var arr = state.data[cat] || [];
                var idx = -1;
                for (var i = 0; i < arr.length; i++) { if ((arr[i].id || '') === id) { idx = i; break; } }
                if (idx >= 0) {
                    var item = arr.splice(idx, 1)[0];
                    if (!Array.isArray(state.data[target])) state.data[target] = [];
                    state.data[target].push(item);
                }
            });
            state.selected = {};
            persist().then(function (ok) { if (ok) { renderSidebar(); renderTable(); } });
        });

        // 导入浏览器书签（HTML）
        $('admin-import-html').addEventListener('click', function () { $('admin-import-html-file').click(); });
        $('admin-import-html-file').addEventListener('change', function (e) {
            var file = e.target.files[0];
            if (!file) return;
            var reader = new FileReader();
            reader.onload = function () {
                Api.importHtml(reader.result).then(function (r) {
                    if (r.status === 200 && r.data && r.data.ok) {
                        notify('已导入 ' + r.data.added + ' 个网址（跳过重复 ' + r.data.skipped + ' 个）', 'success');
                        loadAll();
                    } else {
                        notify('导入失败：' + ((r.data && r.data.error) || r.status), 'error');
                    }
                });
            };
            reader.readAsText(file);
            e.target.value = '';
        });

        // 拖拽排序（同一分类内）
        var dragSrc = null;
        $('admin-rows').addEventListener('dragstart', function (e) {
            var tr = e.target.closest('tr[draggable="true"]');
            if (!tr) return;
            dragSrc = tr;
            tr.classList.add('dragging');
            e.dataTransfer.effectAllowed = 'move';
        });
        $('admin-rows').addEventListener('dragend', function (e) {
            var tr = e.target.closest('tr');
            if (tr) tr.classList.remove('dragging');
            dragSrc = null;
        });
        $('admin-rows').addEventListener('dragover', function (e) {
            e.preventDefault();
            var tr = e.target.closest('tr[draggable="true"]');
            if (!tr || tr === dragSrc) return;
            var srcCat = dragSrc && dragSrc.getAttribute('data-cat');
            if (srcCat && srcCat !== tr.getAttribute('data-cat')) return; // 仅同分类内排序
            var rect = tr.getBoundingClientRect();
            var after = (e.clientY - rect.top) > rect.height / 2;
            tr.parentNode.insertBefore(dragSrc, after ? tr.nextSibling : tr);
        });
        $('admin-rows').addEventListener('drop', function (e) {
            e.preventDefault();
            if (!dragSrc) return;
            var cat = dragSrc.getAttribute('data-cat');
            var orderIds = Array.prototype.map.call(
                $('admin-rows').querySelectorAll('tr[data-cat="' + cat + '"]'),
                function (tr) { return tr.getAttribute('data-id'); }
            );
            var arr = state.data[cat] || [];
            var map = {};
            arr.forEach(function (it) { map[it.id || ''] = it; });
            var newArr = [];
            orderIds.forEach(function (id) { if (map[id]) { newArr.push(map[id]); delete map[id]; } });
            Object.keys(map).forEach(function (id) { newArr.push(map[id]); });
            state.data[cat] = newArr;
            Api.saveLinks(state.data).then(function (r) {
                if (r.status === 200) { renderTable(); }
                else if (r.status === 401) { notify('登录已失效，请重新登录', 'error'); setTimeout(showLogin, 800); }
                else { notify('保存失败：' + ((r.data && r.data.error) || r.status), 'error'); }
            });
        });

        // 改密码
        $('admin-password').addEventListener('click', openPwModal);
        $('pw-modal-close').addEventListener('click', closePwModal);
        $('pw-cancel').addEventListener('click', closePwModal);
        $('pw-form').addEventListener('submit', function (e) {
            e.preventDefault();
            var oldP = $('pw-old').value, newP = $('pw-new').value, confirmP = $('pw-confirm').value;
            if (newP.length < 6) { $('pw-error').textContent = '新密码至少 6 位'; return; }
            if (newP !== confirmP) { $('pw-error').textContent = '两次输入的新密码不一致'; return; }
            Api.changePassword(oldP, newP).then(function (r) {
                if (r.status === 200) {
                    closePwModal();
                    notify('密码修改成功，请重新登录', 'success');
                    setTimeout(showLogin, 900);
                } else {
                    $('pw-error').textContent = (r.data && r.data.error) || '修改失败';
                }
            });
        });

        // 集成设置
        $('admin-settings').addEventListener('click', function () {
            loadSettings();
            $('settings-modal').style.display = 'flex';
        });
        $('settings-modal-close').addEventListener('click', closeSettingsModal);
        $('settings-cancel').addEventListener('click', closeSettingsModal);
        $('settings-modal').addEventListener('click', function (e) { if (e.target === this) closeSettingsModal(); });
        $('settings-form').addEventListener('submit', function (e) {
            e.preventDefault();
            var payload = {
                enabled: $('set-searxng-enabled').checked,
                url: $('set-searxng-url').value.trim(),
                defaultEngine: $('set-searxng-default').checked,
                newTab: $('set-searxng-newtab').checked
            };
            Api.saveSettings(payload).then(function (r) {
                if (r.status === 200) {
                    closeSettingsModal();
                    notify('集成设置已保存', 'success');
                } else if (r.status === 401) {
                    $('settings-error').textContent = '登录已失效，请重新登录';
                } else {
                    $('settings-error').textContent = (r.data && r.data.error) || '保存失败';
                }
            });
        });

        // 刷新图标（强制重抓全部站点图标缓存）
        $('admin-refresh-favicons').addEventListener('click', function () {
            var btn = this;
            if (btn.disabled) return;
            var original = btn.innerHTML;
            btn.disabled = true;
            btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 刷新中...';
            Api.refreshFavicons().then(function (r) {
                if (r.status === 200) {
                    notify('图标已在后台刷新，稍后刷新前台页面即可生效', 'success');
                } else if (r.status === 401) {
                    notify('登录已失效，请重新登录', 'error');
                } else {
                    notify('图标刷新请求失败，请稍后重试', 'error');
                }
            }).catch(function () {
                notify('图标刷新请求失败，请稍后重试', 'error');
            }).finally(function () {
                btn.disabled = false;
                btn.innerHTML = original;
            });
        });

        // 通知关闭
        $('admin-notification-close').addEventListener('click', function () {
            $('admin-notification').className = 'notification';
        });

        // ---- 左侧：主标签页导航编辑器（事件委托，窄屏紧凑） ----
        var ntc = $('nav-tabs-editor');
        if (ntc) {
            ntc.addEventListener('click', function (e) {
                var btn = e.target.closest('button[data-act]'); if (!btn) return;
                var row = btn.closest('.editor-row'); if (!row) return;
                var idx = parseInt(row.getAttribute('data-idx'), 10);
                var act = btn.getAttribute('data-act');
                var arr = appearanceState.tabs;
                if (act === 'del') { arr.splice(idx, 1); }
                else if (act === 'up' && idx > 0) { var t = arr[idx - 1]; arr[idx - 1] = arr[idx]; arr[idx] = t; }
                else if (act === 'down' && idx < arr.length - 1) { var t2 = arr[idx + 1]; arr[idx + 1] = arr[idx]; arr[idx] = t2; }
                renderSideTabs();
            });
            ntc.addEventListener('input', function (e) {
                var inp = e.target.closest('input[data-field]'); if (!inp) return;
                var row = inp.closest('.editor-row'); if (!row) return;
                var idx = parseInt(row.getAttribute('data-idx'), 10);
                var field = inp.getAttribute('data-field');
                if (field === 'visible') appearanceState.tabs[idx].visible = inp.checked;
                else appearanceState.tabs[idx][field] = inp.value;
            });
        }

        // ---- 左侧：底部快捷访问编辑器（事件委托） ----
        var nqc = $('nav-quick-editor');
        if (nqc) {
            nqc.addEventListener('click', function (e) {
                var btn = e.target.closest('button[data-act]'); if (!btn) return;
                var row = btn.closest('.editor-row'); if (!row) return;
                var idx = parseInt(row.getAttribute('data-idx'), 10);
                var act = btn.getAttribute('data-act');
                var arr = appearanceState.quickAccess;
                if (act === 'del') { arr.splice(idx, 1); }
                else if (act === 'up' && idx > 0) { var t = arr[idx - 1]; arr[idx - 1] = arr[idx]; arr[idx] = t; }
                else if (act === 'down' && idx < arr.length - 1) { var t2 = arr[idx + 1]; arr[idx + 1] = arr[idx]; arr[idx] = t2; }
                renderSideQuick();
            });
            nqc.addEventListener('input', function (e) {
                var inp = e.target.closest('input[data-field]'); if (!inp) return;
                var row = inp.closest('.editor-row'); if (!row) return;
                var idx = parseInt(row.getAttribute('data-idx'), 10);
                appearanceState.quickAccess[idx][inp.getAttribute('data-field')] = inp.value;
            });
        }

        // ---- 站点外观：页脚功能链接编辑器已取消（V3.1.2 起由「整页页脚 HTML」接管整个页脚） ----

        // 左侧：添加快捷访问
        $('nav-add-quick').addEventListener('click', function () {
            if (!appearanceState) return;
            appearanceState.quickAccess.push({ text: '', href: '', icon: 'fas fa-link', target: '_blank' });
            renderSideQuick();
        });

        // 右侧：保存主标签页导航
        $('nav-tabs-save').addEventListener('click', function () {
            saveAppearance(this, '主标签页导航已保存，刷新前台页面即可生效');
        });
        // 右侧：保存底部快捷访问
        $('nav-quick-save').addEventListener('click', function () {
            saveAppearance(this, '底部快捷访问已保存，刷新前台页面即可生效');
        });

        // 外观：打开 / 关闭 / 遮罩
        $('admin-appearance').addEventListener('click', openAppearanceModal);
        $('appearance-modal-close').addEventListener('click', closeAppearanceModal);
        $('appearance-cancel').addEventListener('click', closeAppearanceModal);
        $('appearance-modal').addEventListener('click', function (e) { if (e.target === this) closeAppearanceModal(); });

        // 外观：保存（问候语/页眉页脚代码/CSS；标签页与快捷访问由左框编辑并已在 appearanceState 中）
        $('appearance-save').addEventListener('click', function () {
            if (!appearanceState) return;
            appearanceState.greeting = {
                enabled: $('set-greeting-enabled').checked,
                mode: $('set-greeting-mode').value === 'custom' ? 'custom' : 'auto',
                text: $('set-greeting-text').value,
                segments: Array.isArray(appearanceState.greeting.segments) ? appearanceState.greeting.segments : []
            };
            appearanceState.headerHtml = $('set-header-html').value;
            appearanceState.footerHtml = $('set-footer-html').value;
            appearanceState.customCss = $('set-custom-css').value;
            Api.saveSite(appearanceState).then(function (r) {
                if (r.status === 200) {
                    closeAppearanceModal();
                    notify('外观设置已保存，刷新前台页面即可生效', 'success');
                    applyAppearanceFromState(appearanceState);
                } else if (r.status === 401) {
                    $('appearance-error').textContent = '登录已失效，请重新登录';
                } else {
                    $('appearance-error').textContent = (r.data && r.data.error) || '保存失败';
                }
            });
        });

        // 外观：复原默认（同时重渲染左框编辑器）
        $('appearance-reset').addEventListener('click', function () {
            if (!confirm('确定将站点外观（问候语/页眉页脚代码/快捷访问/标签页）复原为出厂默认吗？不影响网址数据。')) return;
            Api.resetSite().then(function (r) {
                if (r.status === 200 && r.data && r.data.site) {
                    appearanceState = normalizeAppearance(r.data.site);
                    syncAppearanceModal();
                    renderSideTabs();
                    renderSideQuick();
                    notify('已复原为默认外观', 'success');
                    applyAppearanceFromState(appearanceState);
                } else {
                    notify('复原失败', 'error');
                }
            });
        });

        // 问候语模式切换：auto 显示分时段编辑器，custom 显示单一文案
        $('set-greeting-mode').addEventListener('change', function () {
            var auto = this.value !== 'custom';
            $('greeting-auto').style.display = auto ? 'block' : 'none';
            $('greeting-custom').style.display = auto ? 'none' : 'block';
            if (auto) renderGreetingSegments();
        });

        // 分时段问候：增删 / 输入（事件委托）
        var gsc = $('greeting-segments');
        if (gsc) {
            gsc.addEventListener('click', function (e) {
                var btn = e.target.closest('button[data-act="del-seg"]');
                if (!btn) return;
                var row = btn.closest('.seg-row');
                var idx = parseInt(row.getAttribute('data-idx'), 10);
                appearanceState.greeting.segments.splice(idx, 1);
                renderGreetingSegments();
            });
            gsc.addEventListener('input', function (e) {
                var inp = e.target.closest('input[data-field]');
                if (!inp) return;
                var row = inp.closest('.seg-row');
                var idx = parseInt(row.getAttribute('data-idx'), 10);
                var field = inp.getAttribute('data-field');
                if (!appearanceState.greeting.segments[idx]) return;
                appearanceState.greeting.segments[idx][field] = inp.value;
            });
        }
        // 添加时段
        $('add-greeting-seg').addEventListener('click', function () {
            if (!appearanceState) return;
            if (!Array.isArray(appearanceState.greeting.segments)) appearanceState.greeting.segments = [];
            appearanceState.greeting.segments.push({ start: '00:00', end: '23:59', text: '' });
            renderGreetingSegments();
        });

        // 外观：单项恢复默认（清空该项代码，不影响其它）
        document.querySelectorAll('.field-restore').forEach(function (btn) {
            btn.addEventListener('click', function () {
                var t = btn.getAttribute('data-target');
                if (t === 'header') { $('set-header-html').value = ''; notify('已清空页眉代码（点保存后生效）', 'info'); }
                else if (t === 'footer') { $('set-footer-html').value = DEFAULT_FOOTER_HTML; notify('已恢复默认整页页脚代码（点保存后生效）', 'info'); }
                else if (t === 'css') { $('set-custom-css').value = ''; notify('已清空自定义 CSS（点保存后生效）', 'info'); }
            });
        });

        // 把上传的 LOGO 图在前端用 canvas 限制最大边 + 压缩，避免尺寸过大/错乱、文件过大
        function resizeLogoToDataURL(file, maxDim, cb) {
            var reader = new FileReader();
            reader.onerror = function () { cb(new Error('read')); };
            reader.onload = function () {
                var img = new Image();
                img.onerror = function () { cb(new Error('decode')); };
                img.onload = function () {
                    var w = img.naturalWidth || img.width, h = img.naturalHeight || img.height;
                    if (!w || !h) { cb(new Error('size')); return; }
                    var scale = Math.min(1, maxDim / Math.max(w, h));
                    var tw = Math.max(1, Math.round(w * scale));
                    var th = Math.max(1, Math.round(h * scale));
                    var canvas = document.createElement('canvas');
                    canvas.width = tw; canvas.height = th;
                    var ctx = canvas.getContext('2d');
                    ctx.drawImage(img, 0, 0, tw, th);
                    // 检测是否含透明像素 → 决定导出格式（透明用 PNG，不透明用 JPEG 更省体积）
                    var hasAlpha = false;
                    try {
                        var px = ctx.getImageData(0, 0, tw, th).data;
                        for (var i = 3; i < px.length; i += 4) { if (px[i] < 255) { hasAlpha = true; break; } }
                    } catch (ex) { hasAlpha = true; }
                    var out = hasAlpha ? canvas.toDataURL('image/png') : canvas.toDataURL('image/jpeg', 0.9);
                    cb(null, out);
                };
                img.src = reader.result;
            };
            reader.readAsDataURL(file);
        }

        // ==================== LOGO 设计 / 搜索快捷项 事件 ====================
        ['frontend', 'backend'].forEach(function (which) {
            // 「上传」按钮：触发文件选择
            var uploadBtn = $('logo-upload-' + which);
            var fileInput = $('logo-file-' + which);
            if (uploadBtn && fileInput) {
                uploadBtn.addEventListener('click', function () { fileInput.click(); });
            }
            // 文件变更：前端 canvas 限尺寸压缩 → dataURL → POST /api/site/upload-logo
            if (fileInput) {
                fileInput.addEventListener('change', function (e) {
                    var file = e.target.files && e.target.files[0];
                    if (!file) return;
                    if (file.size > 5 * 1024 * 1024) { notify('图片超过 5MB，请换更小图片', 'error'); e.target.value = ''; return; }
                    var btn = $('logo-upload-' + which);
                    var oldBtn = btn ? btn.innerHTML : '';
                    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 处理中...'; }
                    resizeLogoToDataURL(file, 512, function (err, dataUrl) {
                        if (err || !dataUrl) {
                            if (btn) { btn.disabled = false; btn.innerHTML = oldBtn; }
                            notify('图片处理失败，请换图重试', 'error');
                            e.target.value = '';
                            return;
                        }
                        if (btn) { btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 上传中...'; }
                        Api.uploadLogo(which, dataUrl).then(function (r) {
                            if (btn) { btn.disabled = false; btn.innerHTML = oldBtn; }
                            if (r.status === 200 && r.data && r.data.ok) {
                                if (appearanceState) {
                                    appearanceState[which + 'Logo'] = { hasCustom: true, ext: r.data.ext || '' };
                                }
                                renderLogoPreviews();
                                applyAdminLogo(appearanceState || {});
                                notify('LOGO 已上传（前台需刷新页面生效）', 'success');
                            } else {
                                notify('上传失败：' + ((r.data && r.data.error) || r.status), 'error');
                            }
                            e.target.value = '';
                        }).catch(function () {
                            if (btn) { btn.disabled = false; btn.innerHTML = oldBtn; }
                            notify('上传请求失败', 'error');
                            e.target.value = '';
                        });
                    });
                });
            }
            // 「恢复默认」：清除上传 → 回退出厂卡通图
            var clearBtn = $('logo-clear-' + which);
            if (clearBtn) {
                clearBtn.addEventListener('click', function () {
                    if (!confirm('确定清除该 ' + (which === 'frontend' ? '前台' : '后台') + ' LOGO 并恢复默认卡通图吗？')) return;
                    Api.clearLogo(which).then(function (r) {
                        if (r.status === 200) {
                            if (appearanceState) appearanceState[which + 'Logo'] = { hasCustom: false, ext: '' };
                            renderLogoPreviews();
                            applyAdminLogo(appearanceState || {});
                            notify('已恢复默认 LOGO', 'success');
                        } else {
                            notify('清除失败', 'error');
                        }
                    });
                });
            }
        });

        // 搜索快捷项：增删 / 输入 / 上下移（事件委托）
        var qsc = $('quick-searches-editor');
        if (qsc) {
            qsc.addEventListener('click', function (e) {
                var btn = e.target.closest('button[data-act]'); if (!btn) return;
                var row = btn.closest('.qs-row'); if (!row) return;
                var idx = parseInt(row.getAttribute('data-idx'), 10);
                var arr = appearanceState.quickSearches;
                if (!arr || isNaN(idx) || idx < 0 || !arr[idx]) return;
                var act = btn.getAttribute('data-act');
                if (act === 'del') arr.splice(idx, 1);
                else if (act === 'up' && idx > 0) { var t = arr[idx - 1]; arr[idx - 1] = arr[idx]; arr[idx] = t; }
                else if (act === 'down' && idx < arr.length - 1) { var t2 = arr[idx + 1]; arr[idx + 1] = arr[idx]; arr[idx] = t2; }
                renderQuickSearches();
            });
            qsc.addEventListener('input', function (e) {
                var inp = e.target.closest('input[data-field]'); if (!inp) return;
                var row = inp.closest('.qs-row'); if (!row) return;
                var idx = parseInt(row.getAttribute('data-idx'), 10);
                var field = inp.getAttribute('data-field');
                if (!appearanceState.quickSearches[idx]) return;
                appearanceState.quickSearches[idx][field] = inp.value;
            });
        }
        // 添加搜索快捷项
        var addQsBtn = $('add-quick-search');
        if (addQsBtn) {
            addQsBtn.addEventListener('click', function () {
                if (!appearanceState) return;
                if (!Array.isArray(appearanceState.quickSearches)) appearanceState.quickSearches = [];
                appearanceState.quickSearches.push({ text: '', url: '' });
                renderQuickSearches();
                // 聚焦到新行的输入框
                var rows = $('quick-searches-editor').querySelectorAll('.qs-row');
                if (rows.length) {
                    var last = rows[rows.length - 1];
                    var first = last.querySelector('input[data-field="text"]');
                    if (first) first.focus();
                }
            });
        }

        // 图标选择器：点击小图标按钮 → 打开居中模态弹窗（复用 .modal inset:0+flex 居中）
        // 不依赖任何 top/left 坐标定位，彻底避免飞牛 webview 下 position:fixed 飘远问题
        var iconPickCtx = { arr: null, idx: -1, btn: null, target: null };
        function resolveIconTarget(btn) {
            var idx = parseInt(btn.getAttribute('data-idx'), 10);
            var target = btn.getAttribute('data-target');
            var arr = null;
            if (target === 'tabs') arr = appearanceState.tabs;
            else if (target === 'quick') arr = appearanceState.quickAccess;
            if (!arr || isNaN(idx) || idx < 0 || !arr[idx]) return null;
            return { arr: arr, idx: idx, cur: arr[idx].icon || 'fa-link' };
        }
        function openIconModal(btn) {
            var t = resolveIconTarget(btn);
            if (!t) { notify('未找到该图标所属条目', 'warning'); return; }
            iconPickCtx = { arr: t.arr, idx: t.idx, btn: btn, target: btn.getAttribute('data-target') };
            var grid = $('icon-pick-grid');
            var search = $('icon-pick-search');
            if (search) search.value = '';
            if (grid) grid.innerHTML = ICON_CHOICES.map(function (c) {
                return '<button type="button" class="icon-opt' + (c === t.cur ? ' active' : '') +
                    '" data-icon="' + c + '" title="' + c + '"><i class="fas ' + c + '"></i></button>';
            }).join('');
            $('icon-pick-modal').style.display = 'flex';
            if (search) setTimeout(function () { search.focus(); }, 30);
        }
        // 应用选中的图标：写入 appearanceState → 重渲染对应编辑器行（变化一目了然）→ 关闭弹窗 → 提示
        function applyPickedIcon(icon) {
            var ctx = iconPickCtx;
            if (!ctx.arr || ctx.idx < 0) return;
            var item = ctx.arr[ctx.idx];
            if (!item) return;
            item.icon = icon;
            closeIconModal();
            if (ctx.target === 'tabs') renderSideTabs();
            else if (ctx.target === 'quick') renderSideQuick();
            notify('图标已更新（点对应「保存」后生效）', 'info');
        }
        function closeIconModal() {
            $('icon-pick-modal').style.display = 'none';
            iconPickCtx = { arr: null, idx: -1, btn: null, target: null };
        }
        // 打开按钮：用 document 委托（打开按钮在动态渲染的编辑器行里）
        document.addEventListener('click', function (e) {
            var openBtn = e.target.closest('.icon-pick-btn[data-act="open-icon"]');
            if (openBtn) { e.stopPropagation(); openIconModal(openBtn); }
        });
        // 网格内图标：用网格自身委托（更可靠，不受外层上下文影响）
        var iconGrid = $('icon-pick-grid');
        if (iconGrid) {
            iconGrid.addEventListener('click', function (e) {
                var opt = e.target.closest('.icon-opt');
                if (opt) { e.stopPropagation(); applyPickedIcon(opt.getAttribute('data-icon')); }
            });
        }
        // 图标搜索：过滤模态内图标网格
        document.addEventListener('input', function (e) {
            var s = e.target.closest('#icon-pick-search');
            if (!s) return;
            var q = s.value.trim().toLowerCase();
            var grid = $('icon-pick-grid');
            if (!grid) return;
            grid.querySelectorAll('.icon-opt').forEach(function (b) {
                var name = b.getAttribute('data-icon');
                b.style.display = (!q || name.indexOf(q) !== -1) ? '' : 'none';
            });
        });
        // 关闭图标模态：点击遮罩或关闭按钮
        [$('icon-pick-modal')].forEach(function (m) {
            if (!m) return;
            m.addEventListener('click', function (e) {
                if (e.target === m || e.target.closest('#icon-pick-modal-close')) closeIconModal();
            });
        });

        // 点击遮罩关闭模态框
        [$('pw-modal')].forEach(function (m) {
            if (!m) return;
            m.addEventListener('click', function (e) { if (e.target === m) m.style.display = 'none'; });
        });
    }

    // ---------- 集成设置 ----------
    function closeSettingsModal() { $('settings-modal').style.display = 'none'; }
    function loadSettings() {
        Api.getSettings().then(function (r) {
            if (r.status === 200 && r.data && r.data.searxng) {
                var s = r.data.searxng;
                $('set-searxng-enabled').checked = s.enabled !== false;
                $('set-searxng-url').value = s.instance || 'http://searxng:8080';
                $('set-searxng-default').checked = !!s.defaultEngine;
                $('set-searxng-newtab').checked = s.newTab !== false;
                $('settings-error').textContent = '';
            }
        });
    }

    // ==================== 站点外观 ====================
    var appearanceState = null;

    // 默认分时段问候（与后端 defaultSite、前端 DEFAULT_SITE 对齐）
    function defaultGreetingSegments() {
        return [
            { start: '00:00', end: '05:59', text: '夜深了，注意休息 🌃' },
            { start: '06:00', end: '11:59', text: '早上好，新的一天开始啦 ☀️' },
            { start: '12:00', end: '13:59', text: '中午好，记得休息一下 🍚' },
            { start: '14:00', end: '17:59', text: '下午好，保持专注 🌤️' },
            { start: '18:00', end: '23:59', text: '晚上好，放松享受夜晚 🌙' }
        ];
    }

    function normalizeAppearance(s) {
        var def = { greeting: { enabled: true, mode: 'auto', text: '', segments: defaultGreetingSegments() }, headerHtml: '', footerHtml: '', customCss: '', footerLinks: [], quickAccess: [], tabs: [], quickSearches: [], frontendLogo: { hasCustom: false, ext: '' }, backendLogo: { hasCustom: false, ext: '' } };
        if (!s || typeof s !== 'object') return def;
        return {
            greeting: Object.assign({ enabled: true, mode: 'auto', text: '', segments: defaultGreetingSegments() }, s.greeting || {}),
            headerHtml: typeof s.headerHtml === 'string' ? s.headerHtml : '',
            footerHtml: (typeof s.footerHtml === 'string' && s.footerHtml.length) ? s.footerHtml : DEFAULT_FOOTER_HTML,
            customCss: typeof s.customCss === 'string' ? s.customCss : '',
            footerLinks: Array.isArray(s.footerLinks) ? s.footerLinks : [],
            quickAccess: Array.isArray(s.quickAccess) ? s.quickAccess : [],
            tabs: Array.isArray(s.tabs) ? s.tabs : [],
            quickSearches: Array.isArray(s.quickSearches) ? s.quickSearches.map(function (it) { return { text: String((it && it.text) || '').trim().slice(0, 20), url: String((it && it.url) || '').trim().slice(0, 500) }; }).filter(function (it) { return it.text; }).slice(0, 30) : [],
            frontendLogo: (s.frontendLogo && typeof s.frontendLogo === 'object') ? { hasCustom: !!s.frontendLogo.hasCustom, ext: String(s.frontendLogo.ext || '') } : { hasCustom: false, ext: '' },
            backendLogo: (s.backendLogo && typeof s.backendLogo === 'object') ? { hasCustom: !!s.backendLogo.hasCustom, ext: String(s.backendLogo.ext || '') } : { hasCustom: false, ext: '' }
        };
    }

    function closeAppearanceModal() { $('appearance-modal').style.display = 'none'; }

    function openAppearanceModal() {
        if (!appearanceState) {
            Api.getSettings().then(function (r) {
                var site = (r.status === 200 && r.data && r.data.site) ? r.data.site : null;
                appearanceState = normalizeAppearance(site);
                syncAppearanceModal();
                $('appearance-modal').style.display = 'flex';
            }).catch(function () {
                notify('读取外观设置失败', 'error');
            });
        } else {
            syncAppearanceModal();
            $('appearance-modal').style.display = 'flex';
        }
    }

    function syncAppearanceModal() {
        if (!appearanceState) return;
        $('set-greeting-enabled').checked = appearanceState.greeting.enabled !== false;
        var mode = appearanceState.greeting.mode === 'custom' ? 'custom' : 'auto';
        $('set-greeting-mode').value = mode;
        $('set-greeting-text').value = appearanceState.greeting.text || '';
        $('greeting-auto').style.display = mode === 'auto' ? 'block' : 'none';
        $('greeting-custom').style.display = mode === 'auto' ? 'none' : 'block';
        $('set-header-html').value = appearanceState.headerHtml || '';
        $('set-footer-html').value = appearanceState.footerHtml || '';
        $('set-custom-css').value = appearanceState.customCss || '';
        $('appearance-error').textContent = '';
        renderGreetingSegments();
        renderLogoPreviews();
        renderQuickSearches();
    }

    // 分时段问候编辑器
    function renderGreetingSegments() {
        var container = $('greeting-segments');
        if (!container) return;
        var segs = appearanceState.greeting.segments || [];
        var html = '';
        segs.forEach(function (s, i) {
            html += '<div class="seg-row" data-idx="' + i + '">' +
                '<input type="time" class="seg-start" data-field="start" value="' + escapeHtml(s.start || '') + '" title="开始时间">' +
                '<span class="seg-dash">–</span>' +
                '<input type="time" class="seg-end" data-field="end" value="' + escapeHtml(s.end || '') + '" title="结束时间">' +
                '<input type="text" class="seg-text" data-field="text" value="' + escapeHtml(s.text || '') + '" placeholder="该时段问候语文案">' +
                '<button type="button" class="icon-btn" data-act="del-seg" title="删除时段"><i class="fas fa-trash"></i></button>' +
            '</div>';
        });
        if (!segs.length) html = '<div class="form-hint">暂无时段，点「添加时段」新增。</div>';
        container.innerHTML = html;
    }

    // 左侧紧凑：主标签页导航编辑器
    function renderSideTabs() {
        var container = $('nav-tabs-editor');
        if (!container) return;
        var arr = appearanceState.tabs || [];
        var html = '';
        arr.forEach(function (t, i) {
            html += '<div class="editor-row" data-idx="' + i + '">' +
                iconPickerMarkup(t.icon, i, 'tabs') +
                '<input data-field="label" value="' + escapeHtml(t.label || '') + '" placeholder="标签名称" class="er-name">' +
                '<label class="editor-vis"><input type="checkbox" data-field="visible"' + (t.visible !== false ? ' checked' : '') + '> 显示</label>' +
                '<div class="editor-btns">' +
                    '<button type="button" class="icon-btn" data-act="up" title="上移"' + (i === 0 ? ' disabled' : '') + '><i class="fas fa-arrow-up"></i></button>' +
                    '<button type="button" class="icon-btn" data-act="down" title="下移"' + (i === arr.length - 1 ? ' disabled' : '') + '><i class="fas fa-arrow-down"></i></button>' +
                    '<button type="button" class="icon-btn" data-act="del" title="删除"><i class="fas fa-trash"></i></button>' +
                '</div>' +
            '</div>';
        });
        if (!arr.length) html = '<div class="form-hint">暂无标签页。</div>';
        container.innerHTML = html;
    }

    // 左侧紧凑：底部快捷访问编辑器
    function renderSideQuick() {
        var container = $('nav-quick-editor');
        if (!container) return;
        var arr = appearanceState.quickAccess || [];
        var html = '';
        arr.forEach(function (it, i) {
            html += '<div class="editor-row" data-idx="' + i + '">' +
                iconPickerMarkup(it.icon, i, 'quick') +
                '<input data-field="text" value="' + escapeHtml(it.text || '') + '" placeholder="名称" class="er-name">' +
                '<input data-field="href" value="' + escapeHtml(it.href || '') + '" placeholder="地址 URL" class="er-url">' +
                '<div class="editor-btns">' +
                    '<button type="button" class="icon-btn" data-act="up" title="上移"' + (i === 0 ? ' disabled' : '') + '><i class="fas fa-arrow-up"></i></button>' +
                    '<button type="button" class="icon-btn" data-act="down" title="下移"' + (i === arr.length - 1 ? ' disabled' : '') + '><i class="fas fa-arrow-down"></i></button>' +
                    '<button type="button" class="icon-btn" data-act="del" title="删除"><i class="fas fa-trash"></i></button>' +
                '</div>' +
            '</div>';
        });
        if (!arr.length) html = '<div class="form-hint">暂无快捷访问，点下方「添加快捷」新增。</div>';
        container.innerHTML = html;
    }

    // 仪表盘加载时拉取外观配置并渲染左框编辑器 + 应用前后台自定义代码
    function loadAppearanceState() {
        Api.getSettings().then(function (r) {
            var site = (r.status === 200 && r.data && r.data.site) ? r.data.site : null;
            appearanceState = normalizeAppearance(site);
            renderSideTabs();
            renderSideQuick();
            applyAppearanceFromState(appearanceState);
        }).catch(function () { /* 忽略，左框保持空 */ });
    }

    // 后台页面也应用自定义页眉/页脚/代码（前后台一致）
    function applyAppearanceFromState(s) {
        if (!s) return;
        var ch = $('custom-header'); if (ch) ch.innerHTML = s.headerHtml || '';
        var cf = $('custom-footer'); if (cf) cf.innerHTML = s.footerHtml || '';
        var styleEl = $('custom-css');
        if (!styleEl) { styleEl = document.createElement('style'); styleEl.id = 'custom-css'; document.head.appendChild(styleEl); }
        styleEl.textContent = s.customCss || '';
        // 后台 LOGO：登录窗 + 应用栏（hasCustom → /api/site/logo/backend；失败回退默认）
        applyAdminLogo(s);
    }

    // ==================== LOGO 设计 ====================
    var DEFAULT_LOGO_URL = '/assets/logo-default.png';
    function logoUrlFor(which, hasCustom) {
        return hasCustom ? '/api/site/logo/' + which + '?v=' + Date.now() : DEFAULT_LOGO_URL;
    }
    // 把后台 LOGO 渲染到登录窗与应用栏（hasCustom=true 走 /api/site/logo/backend，否则回退默认）
    function applyAdminLogo(s) {
        if (!s) return;
        var logo = s.backendLogo || { hasCustom: false, ext: '' };
        var url = logoUrlFor('backend', logo.hasCustom);
        var imgs = document.querySelectorAll('.login-logo img, .app-logo img');
        imgs.forEach(function (img) {
            img.onerror = function () { if (!img.dataset.fallback) { img.dataset.fallback = '1'; img.src = DEFAULT_LOGO_URL; } };
            img.src = url;
        });
    }
    // 外观弹层里的 LOGO 预览（始终反映当前 appearanceState）
    function renderLogoPreviews() {
        if (!appearanceState) return;
        ['frontend', 'backend'].forEach(function (which) {
            var logo = (which === 'frontend') ? appearanceState.frontendLogo : appearanceState.backendLogo;
            var img = $('logo-preview-img-' + which);
            if (!img) return;
            var hasCustom = logo && logo.hasCustom;
            img.onerror = function () { if (!img.dataset.fallback) { img.dataset.fallback = '1'; img.src = DEFAULT_LOGO_URL; } };
            img.src = logoUrlFor(which, hasCustom);
        });
    }

    // ==================== 搜索快捷项 编辑器 ====================
    function renderQuickSearches() {
        var container = $('quick-searches-editor');
        if (!container) return;
        var arr = (appearanceState && appearanceState.quickSearches) || [];
        var html = '';
        if (!arr.length) {
            html = '<div class="qs-empty">暂无快捷项，点下方「添加快捷项」新增（不添加则保留旧版默认 6 项）。</div>';
        } else {
            arr.forEach(function (it, i) {
                html += '<div class="qs-row" data-idx="' + i + '">' +
                    '<input type="text" class="qs-text" data-field="text" value="' + escapeHtml(it.text || '') + '" placeholder="显示文字"' + (i === 0 ? ' style="flex:1 1 100%;margin-bottom:4px;"' : '') + '>' +
                    '<input type="text" class="qs-url" data-field="url" value="' + escapeHtml(it.url || '') + '" placeholder="URL（留空走搜索框；含 {q} 时用文字替换占位）">' +
                    '<div class="qs-actions">' +
                        '<button type="button" class="btn btn-ghost btn-small" data-act="up" title="上移"' + (i === 0 ? ' disabled' : '') + '><i class="fas fa-arrow-up"></i></button>' +
                        '<button type="button" class="btn btn-ghost btn-small" data-act="down" title="下移"' + (i === arr.length - 1 ? ' disabled' : '') + '><i class="fas fa-arrow-down"></i></button>' +
                        '<button type="button" class="btn btn-ghost btn-small" data-act="del" title="删除"><i class="fas fa-trash"></i></button>' +
                    '</div>' +
                '</div>';
            });
        }
        container.innerHTML = html;
    }

    // ==================== 启动 ====================
    function start() {
        state.darkMode = localStorage.getItem('qiyiTheme') === 'dark';
        applyTheme();
        switchView('links');
        bind();
        checkAuth();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', start);
    } else {
        start();
    }
})();
