/*
 * background.js — 奇易导航「动态背景」统一引擎（零依赖，原生 canvas）
 * 支持模式（由后台「外观」设置 site.bgEffect 选择）：
 *   none      关闭
 *   particles 鼠标动态粒子连线（DeepSeek 风格）
 *   glow      鼠标光晕跟随（深色背景浅色柔光随光标移动）
 *   aurora    极光渐变流动（多块彩色渐变缓慢流动 + 随鼠标轻微偏移）
 * 目标页面（site.bgTarget）：frontend / backend / both
 * 用法：QiYiBackground.apply({ effect, target, isBackend })
 * - 浮层 canvas（z-index:1, pointer-events:none），不拦截点击
 * - 自适应明暗主题、高分屏(DPR)、窗口缩放
 * - 尊重 prefers-reduced-motion：降级为静态单帧
 */
(function () {
    'use strict';

    var canvas = null, ctx = null, raf = null;
    var dpr = 1, W = 0, H = 0;
    var mode = 'none';
    var mouse = { x: null, y: null, active: false };
    var particles = [], blobs = [];
    var COLORS = null;
    var attached = false;
    var reduceMotion = false;
    var glowPos = { x: 0, y: 0, has: false };
    var LINK_DIST = 130, MOUSE_DIST = 175;

    function ensureCanvas() {
        canvas = document.getElementById('bg-particles');
        if (!canvas) {
            canvas = document.createElement('canvas');
            canvas.id = 'bg-particles';
            var parent = document.body || document.documentElement;
            parent.insertBefore(canvas, parent.firstChild);
        }
        // 内联兜底样式：确保任意页面都浮于内容之下、控件之上，且不拦截点击
        canvas.style.position = 'fixed';
        canvas.style.top = '0';
        canvas.style.left = '0';
        canvas.style.width = '100%';
        canvas.style.height = '100%';
        canvas.style.zIndex = '1';
        canvas.style.pointerEvents = 'none';
        canvas.style.display = 'block';
        ctx = canvas.getContext('2d');
    }

    function themeColors() {
        var dark = document.body && document.body.classList.contains('dark-mode');
        if (dark) {
            return {
                dot: '180,220,255', line: '120,180,255', mouse: '120,200,255',
                glow: '120,200,255',
                aur: ['90,160,255', '170,120,255', '90,220,210']
            };
        }
        return {
            dot: '70,110,180', line: '90,130,200', mouse: '40,110,230',
            glow: '40,110,230',
            aur: ['70,130,220', '150,110,220', '70,200,190']
        };
    }

    function resize() {
        dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
        W = window.innerWidth;
        H = window.innerHeight;
        canvas.width = Math.floor(W * dpr);
        canvas.height = Math.floor(H * dpr);
        canvas.style.width = W + 'px';
        canvas.style.height = H + 'px';
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        if (mode === 'particles') initParticles();
        else if (mode === 'aurora') initBlobs();
    }

    function initParticles() {
        var area = W * H;
        var count = Math.min(120, Math.max(38, Math.round(area / 14000)));
        particles = [];
        for (var i = 0; i < count; i++) {
            particles.push({
                x: Math.random() * W, y: Math.random() * H,
                vx: (Math.random() - 0.5) * 0.45, vy: (Math.random() - 0.5) * 0.45,
                r: Math.random() * 1.5 + 1.1
            });
        }
    }

    function initBlobs() {
        var c = COLORS.aur;
        blobs = [
            { color: c[0], bx: 0.25, by: 0.30, r: 0.55, sx: 0.13, sy: 0.11, px: 0, py: 1.7, a: 0.16 },
            { color: c[1], bx: 0.72, by: 0.62, r: 0.62, sx: 0.09, sy: 0.15, px: 2.1, py: 0.4, a: 0.14 },
            { color: c[2], bx: 0.50, by: 0.85, r: 0.50, sx: 0.17, sy: 0.08, px: 4.0, py: 3.1, a: 0.13 }
        ];
    }

    // -------- 粒子连线 --------
    function drawParticles() {
        ctx.clearRect(0, 0, W, H);
        var i, p, a, b, dx, dy, d, al;
        for (i = 0; i < particles.length; i++) {
            p = particles[i];
            p.x += p.vx; p.y += p.vy;
            if (p.x < 0 || p.x > W) p.vx *= -1;
            if (p.y < 0 || p.y > H) p.vy *= -1;
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(' + COLORS.dot + ',0.55)';
            ctx.fill();
        }
        for (a = 0; a < particles.length; a++) {
            var pa = particles[a];
            for (b = a + 1; b < particles.length; b++) {
                dx = pa.x - particles[b].x; dy = pa.y - particles[b].y;
                d = Math.sqrt(dx * dx + dy * dy);
                if (d < LINK_DIST) {
                    al = (1 - d / LINK_DIST) * 0.16;
                    ctx.strokeStyle = 'rgba(' + COLORS.line + ',' + al.toFixed(3) + ')';
                    ctx.lineWidth = 1;
                    ctx.beginPath();
                    ctx.moveTo(pa.x, pa.y); ctx.lineTo(particles[b].x, particles[b].y);
                    ctx.stroke();
                }
            }
            if (mouse.active && mouse.x !== null) {
                var mdx = pa.x - mouse.x, mdy = pa.y - mouse.y;
                var md = Math.sqrt(mdx * mdx + mdy * mdy);
                if (md < MOUSE_DIST) {
                    var mal = (1 - md / MOUSE_DIST) * 0.5;
                    ctx.strokeStyle = 'rgba(' + COLORS.mouse + ',' + mal.toFixed(3) + ')';
                    ctx.lineWidth = 1;
                    ctx.beginPath();
                    ctx.moveTo(pa.x, pa.y); ctx.lineTo(mouse.x, mouse.y);
                    ctx.stroke();
                }
            }
        }
    }

    // -------- 鼠标光晕跟随 --------
    function drawGlow() {
        ctx.clearRect(0, 0, W, H);
        var tx, ty;
        if (mouse.active && mouse.x !== null) { tx = mouse.x; ty = mouse.y; }
        else {
            var t = performance.now() / 1000;
            tx = W * (0.5 + 0.18 * Math.sin(t * 0.25));
            ty = H * (0.5 + 0.16 * Math.cos(t * 0.21));
        }
        if (!glowPos.has) { glowPos.x = tx; glowPos.y = ty; glowPos.has = true; }
        glowPos.x += (tx - glowPos.x) * 0.08;
        glowPos.y += (ty - glowPos.y) * 0.08;
        var R = Math.max(W, H) * 0.45;
        var grad = ctx.createRadialGradient(glowPos.x, glowPos.y, 0, glowPos.x, glowPos.y, R);
        grad.addColorStop(0, 'rgba(' + COLORS.glow + ',0.20)');
        grad.addColorStop(0.5, 'rgba(' + COLORS.glow + ',0.08)');
        grad.addColorStop(1, 'rgba(' + COLORS.glow + ',0)');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, W, H);
    }

    // -------- 极光渐变流动 --------
    function drawAurora() {
        ctx.clearRect(0, 0, W, H);
        var t = performance.now() / 1000;
        var mox = (mouse.active && mouse.x !== null) ? (mouse.x - W / 2) * 0.05 : 0;
        var moy = (mouse.active && mouse.y !== null) ? (mouse.y - H / 2) * 0.05 : 0;
        for (var i = 0; i < blobs.length; i++) {
            var bl = blobs[i];
            var cx = W * bl.bx + Math.sin(t * bl.sx + bl.px) * W * 0.12 + mox;
            var cy = H * bl.by + Math.cos(t * bl.sy + bl.py) * H * 0.12 + moy;
            var R = Math.max(W, H) * bl.r;
            var g = ctx.createRadialGradient(cx, cy, 0, cx, cy, R);
            g.addColorStop(0, 'rgba(' + bl.color + ',' + bl.a + ')');
            g.addColorStop(1, 'rgba(' + bl.color + ',0)');
            ctx.fillStyle = g;
            ctx.fillRect(0, 0, W, H);
        }
    }

    function drawOnce() {
        if (mode === 'particles') drawParticles();
        else if (mode === 'glow') drawGlow();
        else if (mode === 'aurora') drawAurora();
    }

    function loop() {
        drawOnce();
        if (!reduceMotion) raf = requestAnimationFrame(loop);
    }

    function attach() {
        if (attached) return;
        attached = true;
        window.addEventListener('resize', resize);
        window.addEventListener('mousemove', function (e) {
            mouse.x = e.clientX; mouse.y = e.clientY; mouse.active = true;
        }, { passive: true });
        window.addEventListener('mouseout', function () { mouse.active = false; });
        window.addEventListener('touchmove', function (e) {
            if (e.touches && e.touches[0]) {
                mouse.x = e.touches[0].clientX; mouse.y = e.touches[0].clientY; mouse.active = true;
            }
        }, { passive: true });
        window.addEventListener('touchend', function () { mouse.active = false; });
        if (window.MutationObserver) {
            var obs = new MutationObserver(function () { COLORS = themeColors(); });
            obs.observe(document.body, { attributes: true, attributeFilter: ['class'] });
        }
    }

    function stop() {
        if (raf) { cancelAnimationFrame(raf); raf = null; }
        if (ctx) ctx.clearRect(0, 0, W, H);
        mode = 'none';
    }

    // 后台「外观」调用入口
    function apply(opts) {
        opts = opts || {};
        var effect = opts.effect || 'none';
        var target = opts.target || 'frontend';
        var isBackend = !!opts.isBackend;
        var validEffects = ['none', 'particles', 'glow', 'aurora'];
        if (validEffects.indexOf(effect) < 0) effect = 'none';
        var validTargets = ['frontend', 'backend', 'both'];
        if (validTargets.indexOf(target) < 0) target = 'frontend';

        // 先停掉旧循环，避免多实例叠加
        if (raf) { cancelAnimationFrame(raf); raf = null; }

        var want = (effect !== 'none') &&
            ((isBackend && (target === 'backend' || target === 'both')) ||
             (!isBackend && (target === 'frontend' || target === 'both')));
        if (!want) { stop(); return; }

        ensureCanvas();
        COLORS = themeColors();
        reduceMotion = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
        mode = effect;
        resize();
        attach();
        if (reduceMotion) {
            drawOnce();
            if (raf) { cancelAnimationFrame(raf); raf = null; }
        } else {
            loop();
        }
    }

    window.QiYiBackground = {
        apply: apply,
        stop: stop,
        current: function () { return mode; }
    };
})();
