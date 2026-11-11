/**
 * Cell Survivor page. Rules in `cells-engine.js`; this file draws a run on a canvas,
 * offers the level-up picks, and keeps the chapters, coins and the lab in localStorage.
 */
(function () {
    'use strict';

    const E = window.CellsEngine;
    const STORE_KEY = 'cells.v1';
    const LOOKS = [['#7BC96F', '#4F9A45'], ['#A47BD8', '#7550AE'], ['#F2A65A', '#C77A2E'], ['#E5484D', '#A8262C'], ['#7A4FB5', '#4E2C80']];
    const TIER = ['#5DBB63', '#5FA0D6', '#9B7BFF', '#F2B544', '#F2B544'];   // a weapon's colour by the level it reaches
    const ICONS = {
        pill: '<path d="M9 23 23 9a6 6 0 0 1 8.5 8.5L17.5 31.5A6 6 0 0 1 9 23z" fill="#fff" stroke="#3B2C22" stroke-width="2"/><path d="M16 16l8.5 8.5L31.5 17.5A6 6 0 0 0 23 9z" fill="#E5484D" stroke="#3B2C22" stroke-width="2"/>',
        scalpel: '<path d="M8 32 22 18" stroke="#8C99A8" stroke-width="5" stroke-linecap="round"/><path d="M20 20 31 7c3 3 2 8-1 11l-6 6z" fill="#E6EDF4" stroke="#3B2C22" stroke-width="2" stroke-linejoin="round"/><circle cx="20" cy="20" r="14" fill="none" stroke="#5FA0D6" stroke-width="2" stroke-dasharray="3 4"/>',
        swab: '<path d="M10 30 28 12" stroke="#E9DCC4" stroke-width="3" stroke-linecap="round"/><ellipse cx="29" cy="11" rx="6" ry="4.5" transform="rotate(-45 29 11)" fill="#fff" stroke="#3B2C22" stroke-width="2"/><ellipse cx="9" cy="31" rx="5" ry="4" transform="rotate(-45 9 31)" fill="#fff" stroke="#3B2C22" stroke-width="2"/>',
        bubble: '<circle cx="20" cy="20" r="12" fill="#BDE7FF" stroke="#3B2C22" stroke-width="2"/><path d="M13 16a8 8 0 0 1 6-5" stroke="#fff" stroke-width="2.5" stroke-linecap="round"/><circle cx="31" cy="30" r="4" fill="#DDF3FF" stroke="#3B2C22" stroke-width="1.5"/>',
        needles: '<path d="M8 32 30 10M12 34 33 15M6 28 26 7" stroke="#8C99A8" stroke-width="2.4" stroke-linecap="round"/><circle cx="8" cy="32" r="2.4" fill="#F2B544"/><circle cx="12" cy="34" r="2.4" fill="#F2B544"/><circle cx="6" cy="28" r="2.4" fill="#F2B544"/>',
        tower: '<path d="M12 34V14h16v20z" fill="#FFF7EA" stroke="#3B2C22" stroke-width="2"/><path d="M10 14l10-8 10 8z" fill="#5FA0D6" stroke="#3B2C22" stroke-width="2" stroke-linejoin="round"/><path d="M18 19h4v4h4v4h-4v4h-4v-4h-4v-4h4z" fill="#E5484D"/>',
        shock: '<path d="M22 4 10 22h8l-4 14 14-19h-8l6-13z" fill="#FFD25E" stroke="#3B2C22" stroke-width="2" stroke-linejoin="round"/>',
        satellite: '<circle cx="20" cy="20" r="6" fill="#9CC0FF" stroke="#3B2C22" stroke-width="2"/><path d="M6 8l9 9M25 23l9 9" stroke="#3B2C22" stroke-width="2"/><rect x="2" y="4" width="8" height="5" rx="1" transform="rotate(45 6 6.5)" fill="#5FA0D6" stroke="#3B2C22" stroke-width="1.5"/><rect x="30" y="31" width="8" height="5" rx="1" transform="rotate(45 34 33.5)" fill="#5FA0D6" stroke="#3B2C22" stroke-width="1.5"/>',
        maw: '<path d="M6 16q14-12 28 0l-4 3-3-3-3 3-4-3-4 3-3-3-3 3z" fill="#7A4FB5" stroke="#3B2C22" stroke-width="2" stroke-linejoin="round"/><path d="M6 24q14 12 28 0l-4-3-3 3-3-3-4 3-4-3-3 3-3-3z" fill="#7A4FB5" stroke="#3B2C22" stroke-width="2" stroke-linejoin="round"/>',
        might: '<path d="M10 22c0-7 4-12 10-12s10 5 10 12v6H10z" fill="#E5484D" stroke="#3B2C22" stroke-width="2"/><path d="M14 18h12" stroke="#fff" stroke-width="2.5" stroke-linecap="round"/>',
        haste: '<circle cx="20" cy="21" r="12" fill="#FFF7EA" stroke="#3B2C22" stroke-width="2"/><path d="M20 21V13M20 21l6 4" stroke="#3B2C22" stroke-width="2.4" stroke-linecap="round"/><path d="M16 5h8" stroke="#3B2C22" stroke-width="3" stroke-linecap="round"/>',
        crit: '<circle cx="20" cy="20" r="13" fill="#fff" stroke="#3B2C22" stroke-width="2"/><circle cx="20" cy="20" r="7" fill="#F2B544" stroke="#3B2C22" stroke-width="1.6"/><circle cx="20" cy="20" r="2.4" fill="#E5484D"/>',
        reach: '<circle cx="20" cy="20" r="14" fill="none" stroke="#5DBB63" stroke-width="2.4" stroke-dasharray="4 3"/><circle cx="20" cy="20" r="6" fill="#5DBB63" stroke="#3B2C22" stroke-width="2"/>',
        mend: '<path d="M20 33S7 25 7 15a7 7 0 0 1 13-3 7 7 0 0 1 13 3c0 10-13 18-13 18z" fill="#E5484D" stroke="#3B2C22" stroke-width="2" stroke-linejoin="round"/><path d="M17 18h6M20 15v6" stroke="#fff" stroke-width="2.4" stroke-linecap="round"/>',
        learn: '<path d="M13 6c8 7 6 21 14 28M27 6c-8 7-6 21-14 28" fill="none" stroke="#5FA0D6" stroke-width="2.6" stroke-linecap="round"/><path d="M15 12h10M14 20h12M15 28h10" stroke="#F2B544" stroke-width="2.4" stroke-linecap="round"/>',
    };
    const icon = (id) => `<svg viewBox="0 0 40 40" aria-hidden="true">${ICONS[id] || ''}</svg>`;

    const $ = (id) => document.getElementById(id);
    const els = {
        coins: $('coins'), home: $('home'), run: $('run'),
        preview: $('preview'), chapterName: $('chapter-name'), chapterLine: $('chapter-line'), prevCh: $('prev-ch'), nextCh: $('next-ch'), play: $('play'),
        field: $('field'), progress: $('progress-fill'), chestMarks: $('chests'), core: $('core'), level: $('level'), xp: $('xp-fill'),
        weapons: $('weapons'), ult: $('ult'), pause: $('pause'), banner: $('banner'), overlay: $('overlay'),
        hud: $('hud'), dock: $('dock'), labBtn: $('lab-btn'), helpBtn: $('help-btn'), fastBtn: $('fast-btn'),
        sheet: $('sheet'), sheetBody: $('sheet-body'), sheetClose: $('sheet-close'),
    };

    // --- store ---------------------------------------------------------------------------

    function load() {
        const fresh = {reached: 1, chapter: 1, coins: 0, lab: {attack: 0, cooldown: 0, crit: 0, core: 0}, best: {}, fast: false};
        try {
            const saved = JSON.parse(localStorage.getItem(STORE_KEY));
            if (saved && saved.reached >= 1) return {...fresh, ...saved, lab: {...fresh.lab, ...(saved.lab || {})}};
        } catch (_) { /* private mode or junk */ }
        return fresh;
    }
    const store = load();
    const save = () => { try { localStorage.setItem(STORE_KEY, JSON.stringify(store)); } catch (_) { /* no storage */ } };
    const reduced = matchMedia('(prefers-reduced-motion: reduce)');
    const calm = () => reduced.matches;

    // --- home ------------------------------------------------------------------------------

    function renderHome() {
        els.coins.textContent = store.coins;
        const n = store.chapter;
        const ch = E.chapter(n);
        els.chapterName.textContent = `Chapter ${n}`;
        const best = store.best[n];
        els.chapterLine.textContent = `${ch.cell.kind === 'centre' ? 'You stand in the middle' : 'You guard the bottom'} · ${best === 100 ? 'cleared' : best ? `best ${best}%` : 'new'}`;
        els.prevCh.disabled = n <= 1;
        els.nextCh.disabled = n >= store.reached;
        drawPreview(ch);
    }

    function drawPreview(ch) {
        const c = els.preview, dpr = Math.min(2, devicePixelRatio || 1);
        const r = c.getBoundingClientRect();
        c.width = Math.round(r.width * dpr); c.height = Math.round(r.height * dpr);
        const g = c.getContext('2d');
        const k = Math.min(c.width / E.W, c.height / E.H);
        g.setTransform(k, 0, 0, k, (c.width - E.W * k) / 2, (c.height - E.H * k) / 2);
        // The dish with rounded corners, so the card around it shows its shape.
        g.beginPath();
        g.roundRect(0, 0, E.W, E.H, 46);
        g.clip();
        paintDish(g, ch);
        drawCell(g, ch.cell.x, ch.cell.y, 0, false);
    }

    // --- drawing ------------------------------------------------------------------------------

    /** The dish: agar, colonies, the channel, the hole viruses come from and the core. */
    function paintDish(g, ch) {
        const agar = g.createRadialGradient(E.W / 2, E.H * 0.45, 40, E.W / 2, E.H / 2, E.H * 0.7);
        agar.addColorStop(0, '#FFF6E6'); agar.addColorStop(1, '#F6DFC3');
        g.fillStyle = agar;
        g.fillRect(-60, -60, E.W + 120, E.H + 120);
        let seed = 11;
        const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
        for (let k = 0; k < 40; k++) {
            g.fillStyle = ['rgba(240, 190, 140, .35)', 'rgba(200, 220, 170, .35)', 'rgba(250, 210, 220, .35)'][k % 3];
            g.beginPath(); g.arc(rnd() * E.W, rnd() * E.H, 4 + rnd() * 14, 0, Math.PI * 2); g.fill();
        }
        const path = ch.path;
        const stroke = (w, colour) => {
            g.strokeStyle = colour; g.lineWidth = w; g.lineCap = 'round'; g.lineJoin = 'round';
            g.beginPath(); g.moveTo(path[0].x, path[0].y);
            for (let i = 1; i < path.length; i += 2) g.lineTo(path[i].x, path[i].y);
            g.lineTo(path[path.length - 1].x, path[path.length - 1].y);
            g.stroke();
        };
        stroke(58, '#E9C9A2');
        stroke(46, '#F3D9B9');
        g.setLineDash([2, 18]);
        stroke(4, 'rgba(180, 130, 90, .35)');
        g.setLineDash([]);
        const end = path[path.length - 1];
        // The core: a heart that must not be reached.
        g.save();
        g.translate(end.x, end.y + 10);
        g.fillStyle = '#E5484D'; g.strokeStyle = '#3B2C22'; g.lineWidth = 3;
        g.beginPath();
        g.moveTo(0, 26);
        g.bezierCurveTo(-46, -4, -30, -40, 0, -18);
        g.bezierCurveTo(30, -40, 46, -4, 0, 26);
        g.fill(); g.stroke();
        g.fillStyle = '#3B2C22';
        g.beginPath(); g.arc(-9, -6, 3, 0, Math.PI * 2); g.arc(9, -6, 3, 0, Math.PI * 2); g.fill();
        g.restore();
    }

    const sprites = new Map();
    /** A virus segment, drawn once per look and size and reused. */
    function virusSprite(look, r, head) {
        const key = `${look}:${Math.round(r)}:${head}`;
        if (sprites.has(key)) return sprites.get(key);
        const s = 3, size = Math.ceil((r + 10) * 2 * s);
        const c = document.createElement('canvas');
        c.width = c.height = size;
        const g = c.getContext('2d');
        g.scale(s, s);
        g.translate(size / s / 2, size / s / 2);
        const [fill, dark] = LOOKS[look];
        g.strokeStyle = '#3B2C22'; g.lineWidth = 1.8;
        for (let k = 0; k < 8; k++) {
            const a = (k / 8) * Math.PI * 2;
            g.beginPath();
            g.moveTo(Math.cos(a) * r * 0.8, Math.sin(a) * r * 0.8);
            g.lineTo(Math.cos(a) * (r + 6), Math.sin(a) * (r + 6));
            g.stroke();
            g.fillStyle = dark;
            g.beginPath(); g.arc(Math.cos(a) * (r + 6), Math.sin(a) * (r + 6), 2.6, 0, Math.PI * 2); g.fill(); g.stroke();
        }
        g.fillStyle = fill;
        g.beginPath(); g.arc(0, 0, r, 0, Math.PI * 2); g.fill(); g.stroke();
        g.fillStyle = 'rgba(255,255,255,.35)';
        g.beginPath(); g.arc(-r * 0.35, -r * 0.4, r * 0.3, 0, Math.PI * 2); g.fill();
        if (head) {
            g.fillStyle = '#fff';
            g.beginPath(); g.arc(-r * 0.35, -r * 0.05, r * 0.28, 0, Math.PI * 2); g.arc(r * 0.35, -r * 0.05, r * 0.28, 0, Math.PI * 2); g.fill();
            g.fillStyle = '#3B2C22';
            g.beginPath(); g.arc(-r * 0.3, 0, r * 0.13, 0, Math.PI * 2); g.arc(r * 0.3, 0, r * 0.13, 0, Math.PI * 2); g.fill();
            g.lineWidth = 2;
            g.beginPath(); g.moveTo(-r * 0.6, -r * 0.45); g.lineTo(-r * 0.15, -r * 0.3); g.moveTo(r * 0.6, -r * 0.45); g.lineTo(r * 0.15, -r * 0.3); g.stroke();
            g.beginPath(); g.arc(0, r * 0.45, r * 0.18, Math.PI, 0); g.stroke();
        } else {
            g.fillStyle = dark;
            g.beginPath(); g.arc(r * 0.25, r * 0.2, r * 0.18, 0, Math.PI * 2); g.arc(-r * 0.2, r * 0.35, r * 0.12, 0, Math.PI * 2); g.fill();
        }
        sprites.set(key, c);
        return c;
    }

    /** Our hero: a white blood cell, wobbling a little; a glow when the burst is ready. */
    function drawCell(g, x, y, t, ready) {
        const wob = calm() ? 0 : Math.sin(t * 4) * 1.5;
        g.save();
        g.translate(x, y);
        if (ready) {
            g.fillStyle = `rgba(110, 200, 255, ${0.25 + 0.15 * Math.sin(t * 6)})`;
            g.beginPath(); g.arc(0, 0, 44, 0, Math.PI * 2); g.fill();
        }
        g.fillStyle = 'rgba(60, 40, 20, .18)';
        g.beginPath(); g.ellipse(0, 26, 24, 7, 0, 0, Math.PI * 2); g.fill();
        g.fillStyle = '#FFFFFF'; g.strokeStyle = '#3B2C22'; g.lineWidth = 2.6;
        g.beginPath();
        for (let k = 0; k <= 24; k++) {
            const a = (k / 24) * Math.PI * 2, rr = 26 + Math.sin(a * 5 + t * 3) * 1.6 + wob * 0.4;
            const px = Math.cos(a) * rr, py = Math.sin(a) * (rr - wob);
            k ? g.lineTo(px, py) : g.moveTo(px, py);
        }
        g.closePath(); g.fill(); g.stroke();
        g.fillStyle = '#F7C8D2';
        g.beginPath(); g.arc(-12, 6, 4.5, 0, Math.PI * 2); g.arc(12, 6, 4.5, 0, Math.PI * 2); g.fill();
        g.fillStyle = '#3B2C22';
        g.beginPath(); g.arc(-8, -3, 3.6, 0, Math.PI * 2); g.arc(8, -3, 3.6, 0, Math.PI * 2); g.fill();
        g.fillStyle = '#fff';
        g.beginPath(); g.arc(-7, -4.5, 1.3, 0, Math.PI * 2); g.arc(9, -4.5, 1.3, 0, Math.PI * 2); g.fill();
        g.beginPath(); g.arc(0, 6, 4, 0.15 * Math.PI, 0.85 * Math.PI); g.stroke();
        g.fillStyle = '#E5484D';
        g.fillRect(-4, -26, 8, 8);
        g.fillStyle = '#fff';
        g.fillRect(-1.2, -25, 2.4, 6); g.fillRect(-3, -23.2, 6, 2.4);
        g.restore();
    }

    // --- the run -------------------------------------------------------------------------------

    let run = null, raf = 0, last = 0, acc = 0, paused = false;
    let fx = [], shake = 0, dish = null, still = false;

    function startRun() {
        const n = store.chapter;
        run = new E.Run(n, store.lab, Date.now() >>> 0);
        fx = []; acc = 0; shake = 0; paused = false; still = false; shown = {};
        dish = null;
        els.home.hidden = true;
        els.run.hidden = false;
        hideOverlay();
        document.body.classList.add('running');
        renderChestMarks();
        banner(`Chapter ${n}`);
        last = performance.now();
        cancelAnimationFrame(raf);
        raf = requestAnimationFrame(frame);
    }

    function stopRun() {
        cancelAnimationFrame(raf);
        run = null;
        document.body.classList.remove('running');
        els.run.hidden = true;
        els.home.hidden = false;
        renderHome();
    }

    function renderChestMarks() {
        els.chestMarks.innerHTML = [0.25, 0.5, 1].map((q) => `<i style="left:${q * 100}%" data-q="${q}"></i>`).join('');
    }

    function frame(now) {
        raf = requestAnimationFrame(frame);
        if (!run) return;
        const dt = Math.min(0.1, (now - last) / 1000);
        last = now;
        const playing = !paused && !run.pending && !run.over && !document.hidden;
        if (playing) {
            acc += dt * (store.fast ? 2 : 1);
            while (acc >= E.TICK && !run.pending && !run.over) {
                run.step();
                acc -= E.TICK;
                for (const ev of run.events) collect(ev);
            }
        }
        // The end beats a level-up that came with it; a pick that levels again asks again.
        if (els.overlay.hidden) {
            if (run.over) finish();
            else if (run.pending) offer();
        }
        // A frozen screen (paused, picking, the end) is drawn once, not every frame.
        const frozen = !playing || run.pending || run.over;
        if (frozen && still && !shake) return;
        still = frozen;
        draw(frozen ? 1 : Math.min(1, acc / E.TICK));
        hud();
    }

    function collect(ev) {
        const t = run.t;
        if (ev.t === 'pop') {
            for (let k = 0; k < (ev.r > 20 ? 14 : 6); k++) {
                const a = Math.random() * Math.PI * 2, v = 40 + Math.random() * 90;
                fx.push({t: 'goo', x: ev.x, y: ev.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, born: t, life: 0.5, r: 2 + Math.random() * 3});
            }
        } else if (ev.t === 'hit' && ev.crit && ev.n >= 5 && ev.from !== 'swab') fx.push({t: 'text', x: ev.x, y: ev.y - 16, text: `${ev.n}!`, born: t, life: 0.6});
        else if (ev.t === 'shock' || ev.t === 'laser' || ev.t === 'zap' || ev.t === 'bite' || ev.t === 'burst') fx.push({...ev, born: t, life: ev.t === 'bite' ? 0.35 : ev.t === 'burst' ? 0.35 : 0.18, seed: Math.random()});
        else if (ev.t === 'leak') { shake = 0.3; fx.push({t: 'leakflash', born: t, life: 0.5}); }
        else if (ev.t === 'burst-all') fx.push({t: 'wave', born: t, life: 0.8});
        else if (ev.t === 'boss') banner('Boss!');
        else if (ev.t === 'midboss') banner('A big one!');
        else if (ev.t === 'chest') {
            const mark = els.chestMarks.querySelector(`[data-q="${ev.q}"]`);
            if (mark) mark.classList.add('open');
            if (ev.q < 1) banner('Chest!');
        }
        if (fx.length > 260) fx.splice(0, fx.length - 260);
    }

    function fit() {
        const c = els.field, r = c.getBoundingClientRect(), dpr = Math.min(2, devicePixelRatio || 1);
        const w = Math.round(r.width * dpr), h = Math.round(r.height * dpr);
        if (c.width !== w || c.height !== h) { c.width = w; c.height = h; dish = null; }
        const k = Math.min(w / E.W, h / E.H);
        return {k, ox: (w - E.W * k) / 2, oy: (h - E.H * k) / 2, w, h};
    }

    function draw(alpha) {
        const c = els.field, g = c.getContext('2d');
        const {k, ox, oy, w, h} = fit();
        if (!dish) {
            dish = document.createElement('canvas');
            dish.width = w; dish.height = h;
            const d = dish.getContext('2d');
            d.fillStyle = '#F6DFC3';
            d.fillRect(0, 0, w, h);
            d.setTransform(k, 0, 0, k, ox, oy);
            paintDish(d, run.ch);
        }
        const sx = shake > 0 && !calm() ? (Math.random() - 0.5) * 8 * shake : 0;
        shake = Math.max(0, shake - 1 / 60);
        g.setTransform(1, 0, 0, 1, sx, 0);
        g.drawImage(dish, 0, 0);
        g.setTransform(k, 0, 0, k, ox + sx, oy);
        const t = run.t;

        // Swabs and towers sit under everything.
        for (const z of run.zones) {
            const life = 1 - z.age / z.life;
            g.fillStyle = `rgba(255, 255, 255, ${0.55 * life + 0.15})`;
            g.beginPath(); g.arc(z.x, z.y, z.r, 0, Math.PI * 2); g.fill();
            g.strokeStyle = `rgba(150, 190, 230, ${0.6 * life})`; g.lineWidth = 3; g.setLineDash([6, 6]);
            g.beginPath(); g.arc(z.x, z.y, z.r * (0.8 + 0.2 * Math.sin(t * 8)), 0, Math.PI * 2); g.stroke();
            g.setLineDash([]);
        }
        for (const tw of run.towers) {
            g.save(); g.translate(tw.x, tw.y);
            g.fillStyle = '#FFF7EA'; g.strokeStyle = '#3B2C22'; g.lineWidth = 2;
            g.fillRect(-11, -8, 22, 22); g.strokeRect(-11, -8, 22, 22);
            g.fillStyle = '#5FA0D6';
            g.beginPath(); g.moveTo(-14, -8); g.lineTo(0, -20); g.lineTo(14, -8); g.closePath(); g.fill(); g.stroke();
            g.fillStyle = '#E5484D'; g.fillRect(-2, -3, 4, 12); g.fillRect(-6, 1, 12, 4);
            g.restore();
        }

        // Viruses, tail first so heads sit on top.
        for (const ch of run.chains) {
            for (let i = ch.segs.length - 1; i >= 0; i--) {
                const s = ch.segs[i];
                if (s.d < 0 || s.hp <= 0) continue;
                const x = s.px + (s.x - s.px) * alpha, y = s.py + (s.y - s.py) * alpha;
                const sp = virusSprite(ch.look, s.r, i === 0);
                const size = sp.width / 3;
                const pulse = calm() ? 1 : 1 + Math.sin(t * 6 + s.id) * 0.04;
                g.drawImage(sp, x - (size * pulse) / 2, y - (size * pulse) / 2, size * pulse, size * pulse);
                if (s.r > 20 || s.hp < s.max * 0.999 && i === 0) {
                    const bw = s.r * 2;
                    g.fillStyle = 'rgba(59, 44, 34, .35)'; g.fillRect(x - bw / 2, y - s.r - 14, bw, 4);
                    g.fillStyle = '#E5484D'; g.fillRect(x - bw / 2, y - s.r - 14, (bw * s.hp) / s.max, 4);
                }
            }
        }

        // DNA drifting home.
        for (const o of run.orbs) {
            g.save(); g.translate(o.x, o.y); g.rotate(t * 4 + o.x);
            g.strokeStyle = '#5FA0D6'; g.lineWidth = 2.2;
            g.beginPath(); g.moveTo(-5, -5); g.quadraticCurveTo(5, 0, -5, 5); g.moveTo(5, -5); g.quadraticCurveTo(-5, 0, 5, 5); g.stroke();
            g.restore();
        }

        // The cell and what circles it.
        const cell = run.cell;
        const sc = run.weapons.scalpel ? E.WEAPONS.scalpel.stats(run.weapons.scalpel) : null;
        drawCell(g, cell.x, cell.y, t, run.charge >= 1);
        if (sc) {
            const R = sc.radius * run.mods.area;
            for (let b = 0; b < sc.blades; b++) {
                const a = t * sc.spin + (b * Math.PI * 2) / sc.blades;
                g.save(); g.translate(cell.x + Math.cos(a) * R, cell.y + Math.sin(a) * R); g.rotate(a + Math.PI / 2);
                g.fillStyle = '#E6EDF4'; g.strokeStyle = '#3B2C22'; g.lineWidth = 2;
                g.beginPath(); g.moveTo(0, -16); g.quadraticCurveTo(9, -4, 3, 10); g.lineTo(-3, 10); g.quadraticCurveTo(-5, -6, 0, -16); g.fill(); g.stroke();
                g.fillStyle = '#8C99A8'; g.fillRect(-2.5, 10, 5, 8);
                g.restore();
            }
        }
        if (run.weapons.satellite) {
            const st = E.WEAPONS.satellite.stats(run.weapons.satellite);
            for (let s2 = 0; s2 < st.count; s2++) {
                const a = t * 1.6 + (s2 * Math.PI * 2) / st.count;
                const x = cell.x + Math.cos(a) * 130, y = cell.y + Math.sin(a) * 130;
                g.fillStyle = '#9CC0FF'; g.strokeStyle = '#3B2C22'; g.lineWidth = 2;
                g.beginPath(); g.arc(x, y, 7, 0, Math.PI * 2); g.fill(); g.stroke();
                g.fillStyle = '#5FA0D6';
                g.fillRect(x - 17, y - 3, 8, 6); g.fillRect(x + 9, y - 3, 8, 6);
            }
        }

        // Shots.
        for (const sh of run.shots) {
            const x = sh.x - sh.vx * E.TICK * (1 - alpha), y = sh.y - sh.vy * E.TICK * (1 - alpha);
            if (sh.kind === 'pill') {
                g.save(); g.translate(x, y); g.rotate(sh.a);
                g.fillStyle = '#fff'; g.strokeStyle = '#3B2C22'; g.lineWidth = 1.6;
                g.beginPath(); g.ellipse(0, 0, 9, 4.5, 0, 0, Math.PI * 2); g.fill(); g.stroke();
                g.fillStyle = '#E5484D';
                g.beginPath(); g.ellipse(4, 0, 5, 4.5, 0, -Math.PI / 2, Math.PI / 2); g.fill();
                g.restore();
            } else if (sh.kind === 'needle') {
                g.strokeStyle = '#8C99A8'; g.lineWidth = 2;
                g.beginPath(); g.moveTo(x, y); g.lineTo(x - Math.cos(sh.a) * 14, y - Math.sin(sh.a) * 14); g.stroke();
            } else if (sh.kind === 'bubble') {
                g.fillStyle = 'rgba(189, 231, 255, .55)'; g.strokeStyle = 'rgba(80, 140, 190, .9)'; g.lineWidth = 2;
                g.beginPath(); g.arc(x, y, 13, 0, Math.PI * 2); g.fill(); g.stroke();
                g.strokeStyle = '#fff'; g.lineWidth = 2.5;
                g.beginPath(); g.arc(x, y, 8, Math.PI * 1.1, Math.PI * 1.5); g.stroke();
            }
        }

        // Effects.
        g.font = '900 18px ui-rounded, system-ui';
        g.textAlign = 'center';
        for (let i = fx.length - 1; i >= 0; i--) {
            const f = fx[i], age = (t - f.born) / f.life;
            if (age >= 1 || age < 0) { fx.splice(i, 1); continue; }
            const fade = 1 - age;
            if (f.t === 'goo') {
                g.fillStyle = `rgba(110, 180, 90, ${fade})`;
                g.beginPath(); g.arc(f.x + f.vx * age * f.life, f.y + f.vy * age * f.life, f.r, 0, Math.PI * 2); g.fill();
            } else if (f.t === 'text') {
                g.fillStyle = `rgba(229, 72, 77, ${fade})`;
                g.fillText(f.text, f.x, f.y - age * 20);
            } else if (f.t === 'shock') {
                g.strokeStyle = `rgba(255, 210, 94, ${fade})`; g.lineWidth = 4; g.lineJoin = 'round';
                g.beginPath();
                f.path.forEach((p, j) => { const jx = j ? Math.sin(f.seed * 50 + j) * 8 : 0; j ? g.lineTo(p.x + jx, p.y - jx) : g.moveTo(p.x, p.y); });
                g.stroke();
            } else if (f.t === 'laser' || f.t === 'zap') {
                g.strokeStyle = f.t === 'laser' ? `rgba(229, 72, 77, ${fade})` : `rgba(95, 160, 214, ${fade})`; g.lineWidth = f.t === 'laser' ? 4 : 3;
                g.beginPath(); g.moveTo(f.x0, f.y0); g.lineTo(f.x1, f.y1); g.stroke();
            } else if (f.t === 'bite') {
                const open = Math.sin(age * Math.PI) * 10;
                g.fillStyle = `rgba(122, 79, 181, ${fade})`;
                g.beginPath(); g.ellipse(f.x, f.y - 6 - open, 20, 8, 0, Math.PI, 0); g.fill();
                g.beginPath(); g.ellipse(f.x, f.y + 6 + open, 20, 8, 0, 0, Math.PI); g.fill();
            } else if (f.t === 'burst') {
                g.strokeStyle = `rgba(120, 190, 240, ${fade})`; g.lineWidth = 4;
                g.beginPath(); g.arc(f.x, f.y, f.r * (0.4 + 0.6 * age), 0, Math.PI * 2); g.stroke();
            } else if (f.t === 'wave') {
                g.strokeStyle = `rgba(110, 200, 255, ${fade})`; g.lineWidth = 14;
                g.beginPath(); g.arc(cell.x, cell.y, 40 + age * 900, 0, Math.PI * 2); g.stroke();
            } else if (f.t === 'leakflash') {
                g.setTransform(1, 0, 0, 1, 0, 0);
                g.fillStyle = `rgba(229, 72, 77, ${0.18 * fade})`;
                g.fillRect(0, 0, w, h);
                g.setTransform(k, 0, 0, k, ox + sx, oy);
            }
        }
    }

    let shown = {};
    /** Writes a HUD value only when it changed: every write is layout or paint. */
    function put(key, value, apply) {
        if (shown[key] === value) return;
        shown[key] = value;
        apply(value);
    }

    function hud() {
        if (!run) return;
        const pct = Math.round(run.progress() * 100), core = Math.ceil(run.core);
        put('progress', pct, (v) => { els.progress.style.width = `${v}%`; els.progress.parentElement.setAttribute('aria-valuenow', v); });
        put('core', core, (v) => {
            els.core.textContent = v;
            els.core.parentElement.setAttribute('aria-label', `Heart: ${v} of ${run.coreMax}`);
            els.core.parentElement.classList.toggle('low', v <= run.coreMax * 0.3);
        });
        put('level', run.level, (v) => { els.level.textContent = v; });
        put('xp', Math.min(100, Math.round((run.xp / run.need) * 100)), (v) => { els.xp.style.width = `${v}%`; });
        put('charge', Math.round(run.charge * 100), (v) => {
            els.ult.style.setProperty('--charge', `${v}%`);
            els.ult.classList.toggle('ready', v >= 100);
            els.ult.disabled = v < 100;
        });
        const key = Object.entries(run.weapons).map(([w, l]) => w + l).join(',');
        put('weapons', key, () => {
            els.weapons.innerHTML = Object.entries(run.weapons).map(([w, l]) => `<span class="wpn" role="img" aria-label="${E.WEAPONS[w].name}, level ${l}" style="--t:${TIER[l - 1]}">${icon(w)}<b>${l}</b></span>`).join('');
        });
    }

    function banner(text) {
        els.banner.textContent = text;
        els.banner.classList.remove('show');
        void els.banner.offsetWidth;
        els.banner.classList.add('show');
    }

    // --- level-ups and the end ------------------------------------------------------------------

    function offer() {
        if (!els.overlay.hidden) return;
        const cards = run.pending.map((o, i) => {
            const isWeapon = o.kind !== 'boost';
            const def = isWeapon ? E.WEAPONS[o.id] : E.BOOSTS[o.id];
            const colour = isWeapon ? TIER[o.level - 1] : '#FF8DC8';
            const tag = o.kind === 'new' ? 'New' : o.kind === 'up' ? `Level ${o.level}` : 'Boost';
            const text = o.kind === 'up' ? E.gains(o.id, o.level) : def.text;
            return `<button class="pick" data-i="${i}" style="--t:${colour}"><span class="tag">${tag}</span>${icon(o.id)}<b>${def.name}</b><small>${text}</small></button>`;
        }).join('');
        showOverlay(`<div class="choose"><h2 id="overlay-title">Level ${run.level}!</h2><p>Pick one</p><div class="picks">${cards}</div></div>`);
    }

    /** The overlay is a dialog: the HUD and dock behind it are out of reach until it closes. */
    function showOverlay(html) {
        els.overlay.innerHTML = html;
        els.overlay.hidden = false;
        for (const el of [els.hud, els.dock]) el.inert = true;
        const first = els.overlay.querySelector('button');
        if (first) first.focus();
    }

    function hideOverlay() {
        els.overlay.hidden = true;
        for (const el of [els.hud, els.dock]) el.inert = false;
        still = false;
    }

    /** The end of a run: paid out once, whatever calls it. */
    function finish() {
        if (run.paid) return;
        run.paid = true;
        const n = run.ch.n, won = run.over === 'won';
        // Only a win clears a chapter; leaks count towards progress, so a loss stops short.
        const pct = won ? 100 : Math.min(99, Math.round(run.progress() * 100));
        const coins = E.coins(n, run.chests, won);
        store.coins += coins;
        store.best[n] = Math.max(store.best[n] || 0, pct);
        if (won && n === store.reached) store.reached = n + 1;
        save();
        const title = won ? 'Chapter cleared!' : run.quit ? 'Run abandoned' : 'The heart gave out';
        showOverlay(`<div class="end ${won ? 'won' : 'lost'}">
            <h2 id="overlay-title">${title}</h2>
            <p>${won ? `Chapter ${n} is clean. Chapter ${n + 1} is open.` : `You held out to ${pct}%.`}</p>
            <div class="coins-won"><span class="coin"></span>+${coins}</div>
            <div class="row">${won ? '<button class="mid-btn" data-act="next">Next chapter</button>' : '<button class="mid-btn" data-act="retry">Try again</button>'}
            <button class="text-btn" data-act="lab">Lab</button><button class="text-btn" data-act="home">Home</button></div></div>`);
        banner(won ? 'Victory!' : 'Defeat');
    }

    els.overlay.addEventListener('click', (e) => {
        const pick = e.target.closest('.pick');
        if (pick && run && run.pending) {
            run.choose(Number(pick.dataset.i));
            hideOverlay();
            last = performance.now();
            return;
        }
        const act = e.target.closest('[data-act]');
        if (!act) return;
        const what = act.dataset.act;
        if (what === 'next') { store.chapter = Math.min(store.reached, store.chapter + 1); save(); startRun(); }
        else if (what === 'retry') startRun();
        else if (what === 'home') stopRun();
        else if (what === 'lab') { stopRun(); showLab(); }
        else if (what === 'resume') { paused = false; hideOverlay(); last = performance.now(); }
        else if (what === 'quit') { run.over = 'lost'; run.quit = true; run.pending = null; paused = false; hideOverlay(); finish(); }
    });

    // --- lab and rules ---------------------------------------------------------------------------

    function showLab() {
        const rows = Object.entries(E.LAB).map(([k, def]) => {
            const lvl = store.lab[k], cost = E.labCost(lvl), maxed = lvl >= def.max;
            return `<div class="lab-row"><span class="lab-ic">${icon({attack: 'might', cooldown: 'haste', crit: 'crit', core: 'mend'}[k])}</span>
                <p><b>${def.name} ${lvl}</b>${def.text}</p>
                <button class="mid-btn" data-buy="${k}" ${maxed || store.coins < cost ? 'disabled' : ''}>${maxed ? 'Max' : `<span class="coin"></span>${cost}`}</button></div>`;
        }).join('');
        openSheet(`<h2>Lab</h2><p>Coins from chests and cleared chapters buy upgrades that last.</p><div class="lab">${rows}</div>`);
    }

    function showRules() {
        const weapons = Object.entries(E.WEAPONS).map(([w, d]) => {
            const at = E.UNLOCKS.find(([id]) => id === w)[1];
            return `<div>${icon(w)}<p><b>${d.name}</b> ${d.text}${at > 1 ? ` (from chapter ${at})` : ''}</p></div>`;
        }).join('');
        openSheet(`<h2>How to play</h2>
            <p>Viruses crawl down the channel towards the heart. Every bit that gets through hurts it; lose the heart and the run is over.</p>
            <p>Your cell fights on its own. Popped viruses drop DNA; each level up, pick a new weapon, a stronger one, or a boost.</p>
            <p>Tap the burst button when it glows to hit every virus at once. Chests at a quarter, half and the end of a chapter pay coins for the lab.</p>
            <h3>Weapons</h3><div class="legend">${weapons}</div>`);
    }

    function openSheet(html) {
        els.sheetBody.innerHTML = html;
        els.sheet.classList.remove('closing');
        els.sheet.hidden = false;
        els.sheetClose.focus();
    }

    function closeSheet() {
        if (els.sheet.hidden || els.sheet.classList.contains('closing')) return;
        els.sheet.classList.add('closing');
        setTimeout(() => { els.sheet.hidden = true; els.sheet.classList.remove('closing'); renderHome(); }, 280);
    }

    els.sheet.addEventListener('click', (e) => {
        if (e.target === els.sheet) { closeSheet(); return; }
        const buy = e.target.closest('[data-buy]');
        if (!buy) return;
        const k = buy.dataset.buy, cost = E.labCost(store.lab[k]);
        if (store.coins < cost || store.lab[k] >= E.LAB[k].max) return;
        store.coins -= cost;
        store.lab[k]++;
        save();
        showLab();
        els.coins.textContent = store.coins;
        const again = els.sheetBody.querySelector(`[data-buy="${k}"]`);
        if (again && !again.disabled) again.focus();
    });

    // --- input --------------------------------------------------------------------------------------

    els.play.addEventListener('click', startRun);
    els.prevCh.addEventListener('click', () => { store.chapter = Math.max(1, store.chapter - 1); save(); renderHome(); });
    els.nextCh.addEventListener('click', () => { store.chapter = Math.min(store.reached, store.chapter + 1); save(); renderHome(); });
    function burst() {
        if (!run || paused || !els.overlay.hidden) return;
        const from = run.events.length;
        if (!run.ultimate()) return;
        run.events.slice(from).forEach(collect);
        still = false;
        banner('Antibody burst!');
    }
    els.ult.addEventListener('click', burst);
    els.pause.addEventListener('click', () => {
        if (!run || run.over || run.pending) return;
        paused = true;
        showOverlay(`<div class="end"><h2 id="overlay-title">Paused</h2><div class="row"><button class="mid-btn" data-act="resume">Resume</button><button class="text-btn" data-act="quit">Give up</button></div></div>`);
    });
    els.labBtn.addEventListener('click', showLab);
    els.helpBtn.addEventListener('click', showRules);
    els.fastBtn.addEventListener('click', () => {
        store.fast = !store.fast;
        save();
        els.fastBtn.classList.toggle('on', store.fast);
        els.fastBtn.setAttribute('aria-pressed', String(store.fast));
    });
    els.sheetClose.addEventListener('click', closeSheet);
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') closeSheet();
        // Space fires the burst, but never a focused button's own click or a held key.
        if (e.key === ' ' && run && !e.repeat && els.overlay.hidden && !(e.target instanceof HTMLButtonElement)) { e.preventDefault(); burst(); }
    });
    // Leaving the tab pauses the run; coming back keeps it paused until you resume.
    document.addEventListener('visibilitychange', () => { if (document.hidden && run && !run.over && !run.pending && els.overlay.hidden) els.pause.click(); });
    window.addEventListener('resize', () => { if (!run) renderHome(); });

    els.fastBtn.classList.toggle('on', store.fast);
    els.fastBtn.setAttribute('aria-pressed', String(store.fast));
    renderHome();
})();
