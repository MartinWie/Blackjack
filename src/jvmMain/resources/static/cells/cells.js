/**
 * Cell Survivor page. Rules in `cells-engine.js`; this file draws a run on a canvas,
 * offers the level-up picks, and keeps the chapters, coins and the lab in localStorage.
 *
 * Drawing is built for a crowded dish: sprites are scaled once to the pixels they are
 * drawn at, the dish and its channel are one cached layer, needles and trails go out in
 * one stroke each, and a phone that falls behind drops its canvas resolution a step.
 */
(function () {
    'use strict';

    const E = window.CellsEngine;
    const STORE_KEY = 'cells.v1';
    const LOOKS = ['green', 'purple', 'orange', 'red', 'boss'];
    const GOO = ['#8BD97F', '#B98BE8', '#F7B26A', '#F2646A', '#A06BE0'];
    const TIER = ['#5DBB63', '#5DBB63', '#5FA0D6', '#5FA0D6', '#9B7BFF', '#9B7BFF', '#F2B544', '#F2B544'];   // a weapon's colour by level
    const BUILD = (new URL(document.querySelector('script[src*="cells-engine.js"]').src).searchParams.get('v')) || '';
    const IMG = (name) => `/static/cells/img/${name}.webp${BUILD ? `?v=${BUILD}` : ''}`;
    const icon = (id) => `<img src="${IMG(id)}" alt="" draggable="false">`;

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

    // --- pictures ----------------------------------------------------------------------------

    const heads = LOOKS.map((l) => `virus-${l}`), bodies = LOOKS.map((l) => `body-${l}`);
    const NAMES = ['dish', 'hero', 'heart', 'pill', 'scalpel', 'bubble', 'tower', 'satellite', 'maw', 'dna', 'swab',
        ...LOOKS.flatMap((l) => [`virus-${l}`, `body-${l}`])];
    const pics = {};
    let loaded = null;
    function loadPics() {
        if (loaded) return loaded;
        loaded = Promise.all(NAMES.map(async (n) => {
            const img = new Image();
            img.src = IMG(n);
            try { await img.decode(); pics[n] = img; } catch (_) { /* drawn without it */ }
        }));
        return loaded;
    }

    // Sprites scaled once to the device pixels they are drawn at, in 4 px steps so a
    // pulse or a beat reuses the same few; dropped on a resize.
    const scaled = new Map(), whites = new Map();
    function sized(name, px, white = false) {
        px = Math.max(4, Math.round(px / 4) * 4);
        const store = white ? whites : scaled;
        let byPx = store.get(name);
        if (!byPx) { byPx = new Map(); store.set(name, byPx); }
        let c = byPx.get(px);
        if (c) return c;
        const img = pics[name];
        if (!img) return null;
        c = document.createElement('canvas');
        c.width = px;
        c.height = Math.max(4, Math.round((px * img.naturalHeight) / img.naturalWidth));
        const g = c.getContext('2d');
        g.imageSmoothingQuality = 'high';
        g.drawImage(img, 0, 0, c.width, c.height);
        if (white) {
            g.globalCompositeOperation = 'source-in';
            g.fillStyle = '#fff';
            g.fillRect(0, 0, c.width, c.height);
        }
        byPx.set(px, c);
        return c;
    }

    /** A soft round glow in one colour, for particles and auras, drawn once. */
    const glows = new Map();
    function glow(colour) {
        let c = glows.get(colour);
        if (c) return c;
        c = document.createElement('canvas');
        c.width = c.height = 32;
        const g = c.getContext('2d'), grad = g.createRadialGradient(16, 16, 0, 16, 16, 16);
        grad.addColorStop(0, colour); grad.addColorStop(0.45, colour); grad.addColorStop(1, 'rgba(0,0,0,0)');
        g.fillStyle = grad;
        g.fillRect(0, 0, 32, 32);
        glows.set(colour, c);
        return c;
    }

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
        loadPics().then(() => { if (els.run.hidden && store.chapter === n) drawPreview(ch); });
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
        if (g.roundRect) g.roundRect(0, 0, E.W, E.H, 46); else g.rect(0, 0, E.W, E.H);
        g.clip();
        paintDish(g, ch);
        const hero = pics.hero;
        if (hero) g.drawImage(hero, ch.cell.x - 34, ch.cell.y - 34, 68, 68);
    }

    // --- drawing ------------------------------------------------------------------------------

    /** The dish under everything: agar, the channel, the hole viruses come from. */
    function paintDish(g, ch) {
        const bg = pics.dish;
        g.save();
        g.setTransform(1, 0, 0, 1, 0, 0);
        if (bg) {
            // Cover the whole canvas, cropping the picture rather than leaving bars.
            const s = Math.max(g.canvas.width / bg.naturalWidth, g.canvas.height / bg.naturalHeight);
            g.drawImage(bg, (g.canvas.width - bg.naturalWidth * s) / 2, (g.canvas.height - bg.naturalHeight * s) / 2, bg.naturalWidth * s, bg.naturalHeight * s);
        } else {
            g.fillStyle = '#F6DFC3';
            g.fillRect(0, 0, g.canvas.width, g.canvas.height);
        }
        g.restore();
        const path = ch.path;
        const stroke = (width, colour) => {
            g.strokeStyle = colour; g.lineWidth = width; g.lineCap = 'round'; g.lineJoin = 'round';
            g.beginPath(); g.moveTo(path[0].x, path[0].y);
            for (let i = 1; i < path.length; i += 2) g.lineTo(path[i].x, path[i].y);
            g.lineTo(path[path.length - 1].x, path[path.length - 1].y);
            g.stroke();
        };
        stroke(66, 'rgba(120, 70, 110, .16)');
        stroke(58, 'rgba(255, 236, 244, .75)');
        stroke(44, 'rgba(255, 248, 250, .85)');
        g.setLineDash([2, 18]);
        stroke(4, 'rgba(190, 120, 150, .35)');
        g.setLineDash([]);
        // Where they come in.
        const start = path[0];
        const hole = g.createRadialGradient(start.x, 20, 4, start.x, 20, 60);
        hole.addColorStop(0, 'rgba(90, 40, 80, .55)'); hole.addColorStop(1, 'rgba(90, 40, 80, 0)');
        g.fillStyle = hole;
        g.beginPath(); g.arc(start.x, 20, 60, 0, Math.PI * 2); g.fill();
    }

    // --- the run -------------------------------------------------------------------------------

    let run = null, raf = 0, last = 0, acc = 0, paused = false;
    let fx = [], shake = 0, dish = null, still = false, layout = null;
    let heroShots = 0, kick = 0, kickA = 0;
    // Canvas resolution as a share of the device's; lowered a step when frames run long.
    let quality = 1, slow = 0;

    async function startRun() {
        const n = store.chapter;
        await loadPics();
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
        const ms = now - last;
        const dt = Math.min(0.1, ms / 1000);
        last = now;
        const playing = !paused && !run.pending && !run.over && !document.hidden;
        if (playing) {
            acc += dt * (store.fast ? 2 : 1);
            while (acc >= E.TICK && !run.pending && !run.over) {
                run.step();
                acc -= E.TICK;
                for (const ev of run.events) collect(ev);
            }
            // Two seconds of long frames: draw fewer pixels.
            slow = ms > 24 ? slow + 1 : Math.max(0, slow - 2);
            if (slow > 120 && quality > 0.55) { quality = Math.max(0.55, quality - 0.15); slow = 0; layout = null; }
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

    const rand = (a, b) => a + Math.random() * (b - a);
    const MAX_FX = 340;

    function particles(x, y, n, colour, speed, life, size) {
        const room = MAX_FX - fx.length;
        if (room <= 0) return;
        n = Math.min(n, room);
        for (let k = 0; k < n; k++) {
            const a = rand(0, Math.PI * 2), v = rand(speed * 0.4, speed);
            fx.push({t: 'p', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, born: run.t, life: rand(life * 0.6, life), r: rand(size * 0.6, size), colour});
        }
    }

    let texts = 0;
    function collect(ev) {
        const t = run.t;
        switch (ev.t) {
            case 'pop':
                // A crowded dish gets fewer drops per pop, so a chain reaction stays smooth.
                particles(ev.x, ev.y, ev.r > 20 ? 16 : fx.length > 200 ? 2 : 6, GOO[ev.look || 0], ev.r > 20 ? 150 : 110, 0.55, ev.r > 20 ? 7 : 4.5);
                fx.push({t: 'ring', x: ev.x, y: ev.y, r: ev.r * 1.6, born: t, life: 0.3, colour: 'rgba(255,255,255,'});
                break;
            case 'hit':
                if (ev.n >= 5 && texts < 24) { texts++; fx.push({t: 'text', x: ev.x, y: ev.y - 16, text: `${ev.n}!`, born: t, life: 0.6}); }
                break;
            case 'shock': case 'laser': case 'zap':
                fx.push({...ev, born: t, life: ev.t === 'shock' ? 0.22 : 0.16, seed: Math.random()});
                break;
            case 'bite':
                fx.push({...ev, born: t, life: 0.4});
                break;
            case 'burst':
                fx.push({t: 'ring', x: ev.x, y: ev.y, r: ev.r, born: t, life: 0.35, colour: ev.pill ? 'rgba(255,140,150,' : 'rgba(150,215,255,'});
                if (!ev.pill) particles(ev.x, ev.y, 4, '#DDF3FF', 120, 0.4, 4);
                break;
            case 'chain':
                fx.push({t: 'ring', x: ev.x, y: ev.y, r: ev.r, born: t, life: 0.3, colour: 'rgba(255,170,70,'});
                fx.push({t: 'glow', x: ev.x, y: ev.y, r: ev.r, born: t, life: 0.25, colour: '#FFB347'});
                break;
            case 'leak':
                shake = 0.3;
                fx.push({t: 'leakflash', born: t, life: 0.5});
                break;
            case 'burst-all': fx.push({t: 'wave', born: t, life: 0.8}); break;
            case 'boss': banner('Boss!'); break;
            case 'midboss': banner('A big one!'); break;
            case 'chest': {
                const mark = els.chestMarks.querySelector(`[data-q="${ev.q}"]`);
                if (mark) mark.classList.add('open');
                if (ev.q < 1) banner('Chest!');
                break;
            }
        }
    }

    /** Canvas size and the field's place on it; redone on a resize or a change of quality. */
    function fit() {
        const c = els.field, r = c.getBoundingClientRect(), dpr = Math.min(2, devicePixelRatio || 1) * quality;
        const w = Math.round(r.width * dpr), h = Math.round(r.height * dpr);
        if (layout && layout.w === w && layout.h === h) return layout;
        if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
        const k = Math.min(w / E.W, h / E.H);
        dish = null;
        scaled.clear();
        whites.clear();
        layout = {k, ox: (w - E.W * k) / 2, oy: (h - E.H * k) / 2, w, h};
        return layout;
    }

    function draw(alpha) {
        const c = els.field, g = c.getContext('2d');
        const {k, ox, oy, w, h} = fit();
        if (!dish) {
            dish = document.createElement('canvas');
            dish.width = w; dish.height = h;
            const d = dish.getContext('2d');
            d.setTransform(k, 0, 0, k, ox, oy);
            paintDish(d, run.ch);
        }
        const sx = shake > 0 && !calm() ? (Math.random() - 0.5) * 8 * shake : 0;
        shake = Math.max(0, shake - 1 / 60);
        g.setTransform(1, 0, 0, 1, 0, 0);
        g.globalAlpha = 1;
        g.drawImage(dish, sx, 0);
        const X = ox + sx;
        const base = () => g.setTransform(k, 0, 0, k, X, oy);
        base();
        const t = run.t;
        /** A sprite of `size` units at (x, y), drawn `grow` times bigger (a pulse, a beat). */
        const sprite = (name, size, x, y, white = false, grow = 1) => {
            const s = sized(name, size * k, white);
            if (!s) return;
            const w = size * grow, hh = (w * s.height) / s.width;
            g.drawImage(s, x - w / 2, y - hh / 2, w, hh);
        };
        /** A sprite turned by `a` about (x, y), without save and restore. */
        const turned = (name, size, x, y, a, grow = 1) => {
            const s = sized(name, size * k);
            if (!s) return;
            const cs = Math.cos(a) * k * grow, sn = Math.sin(a) * k * grow;
            g.setTransform(cs, sn, -sn, cs, X + x * k, oy + y * k);
            g.drawImage(s, -size / 2, -size / 2, size, size);
        };

        // The heart at the end of the channel, beating faster when it is hurt.
        const end = run.ch.path[run.ch.path.length - 1];
        const beat = calm() ? 1 : 1 + Math.max(0, Math.sin(t * (run.core < run.coreMax * 0.3 ? 10 : 5))) * 0.08;
        sprite('heart', 70, end.x, end.y + 6, false, beat);

        // Swabs and towers sit under the viruses.
        for (const z of run.zones) {
            const life = 1 - z.age / z.life;
            g.globalAlpha = 0.35 + 0.4 * life;
            g.drawImage(glow('rgba(225, 245, 255, .9)'), z.x - z.r, z.y - z.r, z.r * 2, z.r * 2);
            g.globalAlpha = 1;
            turned('swab', 40, z.x, z.y, t * 3 + z.x);
            base();
        }
        // Towers jolt as they fire.
        for (const tw of run.towers) sprite('tower', 44, tw.x, tw.y - 8, false, 1 + Math.max(0, tw.cool / tw.rate - 0.75) * 0.7);

        // Viruses, tail first so heads sit on top; bodies turn slowly, a hit flashes white.
        for (const ch of run.chains) {
            for (let i = ch.segs.length - 1; i >= 0; i--) {
                const s = ch.segs[i];
                if (s.d < 0 || s.hp <= 0) continue;
                let x = s.px + (s.x - s.px) * alpha, y = s.py + (s.y - s.py) * alpha;
                const head = i === 0;
                const flash = s.seen !== undefined && s.hp < s.seen;
                s.seen = s.hp;
                if (flash) s.hitAt = t;
                // A blow swells it for a moment; the chain slithers side to side as it crawls.
                const punch = Math.max(0, 1 - (t - (s.hitAt ?? -9)) / 0.18);
                let pulse = 1 + punch * 0.22, tilt = 0;
                if (!calm()) {
                    const mx = s.x - s.px, my = s.y - s.py, ml = Math.hypot(mx, my) || 1;
                    const sway = Math.sin(t * 7 - s.d * 0.07) * (s.slow > t ? 1 : 3.2);
                    x += (-my / ml) * sway; y += (mx / ml) * sway;
                    pulse *= 1 + Math.sin(t * 9 - s.d * 0.07) * 0.06;
                    // Heads rock and snap their jaws.
                    if (head) { tilt = Math.sin(t * 5 + s.id) * 0.22; pulse *= 1 + Math.max(0, Math.sin(t * 11 + s.id)) * 0.08; }
                }
                const size = s.r * (head ? 2.7 : 2.5);
                if (head) {
                    turned(heads[ch.look], size, x, y, tilt, pulse);
                    if (flash) { g.globalAlpha = 0.5; const s2 = sized(heads[ch.look], size * k, true); if (s2) g.drawImage(s2, -size / 2, -size / 2, size, size); g.globalAlpha = 1; }
                    base();
                } else {
                    turned(bodies[ch.look], size, x, y, t * 0.9 + s.id, pulse);
                    if (flash) { g.globalAlpha = 0.5; const s2 = sized(bodies[ch.look], size * k, true); if (s2) g.drawImage(s2, -size / 2, -size / 2, size, size); g.globalAlpha = 1; }
                    base();
                }
                if (s.r > 20 || (head && s.hp < s.max * 0.999)) {
                    const bw = s.r * 2;
                    g.fillStyle = 'rgba(59, 44, 34, .4)'; g.fillRect(x - bw / 2, y - s.r - 16, bw, 5);
                    g.fillStyle = s.r > 20 ? '#F2B544' : '#E5484D'; g.fillRect(x - bw / 2, y - s.r - 16, (bw * s.hp) / s.max, 5);
                }
            }
        }

        // DNA drifting home.
        for (const o of run.orbs) sprite('dna', o.v > 8 ? 24 : 16, o.x, o.y + Math.sin(t * 6 + o.x) * 2);

        // The cell and what circles it.
        const cell = run.cell;
        if (run.charge >= 1) {
            g.globalAlpha = 0.5 + 0.2 * Math.sin(t * 6);
            g.drawImage(glow('rgba(110, 200, 255, .9)'), cell.x - 60, cell.y - 60, 120, 120);
            g.globalAlpha = 1;
        }
        // The cell kicks back from every volley and leans into its aim.
        const fired = run.shots.length;
        if (fired > heroShots && fired) { kick = 1; kickA = run.shots[fired - 1].a; }
        heroShots = fired;
        kick = Math.max(0, kick - 0.09);
        const still2 = calm();
        const kx = still2 ? 0 : -Math.cos(kickA) * 7 * kick, ky = still2 ? 0 : -Math.sin(kickA) * 7 * kick;
        const bounce = still2 ? 0 : Math.abs(Math.sin(t * 4)) * 3;
        turned('hero', 66, cell.x + kx, cell.y + ky - bounce, still2 ? 0 : Math.sin(t * 2.2) * 0.08 + Math.cos(kickA) * 0.2 * kick, 1 + kick * 0.1 + (still2 ? 0 : Math.sin(t * 8) * 0.02));
        base();
        const armed = new Map(run.armed);
        const sc = armed.get('scalpel');
        if (sc) {
            const R = sc.radius * run.mods.area;
            for (let b = 0; b < sc.blades; b++) {
                const a = t * sc.spin + (b * Math.PI * 2) / sc.blades;
                turned('scalpel', 34, cell.x + Math.cos(a) * R, cell.y + Math.sin(a) * R, a + Math.PI * 0.85);
            }
            base();
        }
        const st = armed.get('satellite');
        if (st) {
            for (let s2 = 0; s2 < st.count; s2++) {
                const a = t * 1.6 + (s2 * Math.PI * 2) / st.count;
                turned('satellite', 30, cell.x + Math.cos(a) * 130, cell.y + Math.sin(a) * 130 + Math.sin(t * 5 + s2) * 3, a + Math.PI / 2);
            }
            base();
        }

        // Shots: trails and needles in one stroke each, pills and bubbles as sprites.
        g.lineCap = 'round';
        g.strokeStyle = 'rgba(255, 255, 255, .45)';
        g.lineWidth = 5;
        g.beginPath();
        for (const sh of run.shots) {
            if (sh.kind !== 'pill') continue;
            const x = sh.x - sh.vx * E.TICK * (1 - alpha), y = sh.y - sh.vy * E.TICK * (1 - alpha);
            g.moveTo(x, y); g.lineTo(x - sh.vx * 0.035, y - sh.vy * 0.035);
        }
        g.stroke();
        g.strokeStyle = '#8C99A8';
        g.lineWidth = 2.2;
        g.beginPath();
        for (const sh of run.shots) {
            if (sh.kind !== 'needle') continue;
            const x = sh.x - sh.vx * E.TICK * (1 - alpha), y = sh.y - sh.vy * E.TICK * (1 - alpha);
            g.moveTo(x, y); g.lineTo(x - Math.cos(sh.a) * 16, y - Math.sin(sh.a) * 16);
        }
        g.stroke();
        for (const sh of run.shots) {
            const x = sh.x - sh.vx * E.TICK * (1 - alpha), y = sh.y - sh.vy * E.TICK * (1 - alpha);
            if (sh.kind === 'pill') turned('pill', 22, x, y, sh.a + 0.75);
            else if (sh.kind === 'bubble') { base(); sprite('bubble', sh.small ? 18 : 28, x, y); }
        }
        base();

        // Effects.
        texts = 0;
        g.font = '900 18px ui-rounded, system-ui';
        g.textAlign = 'center';
        for (let i = fx.length - 1; i >= 0; i--) {
            const f = fx[i], age = (t - f.born) / f.life;
            if (age >= 1 || age < 0) { fx[i] = fx[fx.length - 1]; fx.pop(); continue; }
            const fade = 1 - age;
            switch (f.t) {
                case 'p': {
                    const a = age * f.life, r = f.r * (1 - age * 0.5);
                    g.globalAlpha = fade;
                    g.drawImage(glow(f.colour), f.x + f.vx * a - r, f.y + f.vy * a - r, r * 2, r * 2);
                    break;
                }
                case 'text':
                    texts++;
                    g.globalAlpha = fade;
                    g.fillStyle = '#E5484D';
                    g.strokeStyle = '#fff';
                    g.lineWidth = 4;
                    g.strokeText(f.text, f.x, f.y - age * 22);
                    g.fillText(f.text, f.x, f.y - age * 22);
                    break;
                case 'ring':
                    g.globalAlpha = 1;
                    g.strokeStyle = `${f.colour}${fade})`;
                    g.lineWidth = 4 * fade + 1;
                    g.beginPath(); g.arc(f.x, f.y, f.r * (0.4 + 0.6 * age), 0, Math.PI * 2); g.stroke();
                    break;
                case 'glow':
                    g.globalAlpha = 0.8 * fade;
                    g.globalCompositeOperation = 'lighter';
                    g.drawImage(glow(f.colour), f.x - f.r, f.y - f.r, f.r * 2, f.r * 2);
                    g.globalCompositeOperation = 'source-over';
                    break;
                case 'shock':
                    g.globalAlpha = fade;
                    g.lineJoin = 'round';
                    for (const [lw, colour] of [[9, 'rgba(120, 190, 255, .35)'], [3.5, '#FFF3B0']]) {
                        g.strokeStyle = colour; g.lineWidth = lw;
                        g.beginPath();
                        f.path.forEach((p, j) => { const jx = j ? Math.sin(f.seed * 50 + j) * 8 : 0; if (j) g.lineTo(p.x + jx, p.y - jx); else g.moveTo(p.x, p.y); });
                        g.stroke();
                    }
                    break;
                case 'laser': case 'zap':
                    g.globalAlpha = fade;
                    g.strokeStyle = f.t === 'laser' ? '#FF5A6A' : '#7FC4FF';
                    g.lineWidth = f.t === 'laser' ? 4 : 3;
                    g.beginPath(); g.moveTo(f.x0, f.y0); g.lineTo(f.x1, f.y1); g.stroke();
                    break;
                case 'bite':
                    g.globalAlpha = Math.min(1, fade * 2);
                    sprite('maw', 56, f.x, f.y, false, 0.55 + Math.sin(age * Math.PI) * 0.45);
                    break;
                case 'wave':
                    g.globalAlpha = fade;
                    g.strokeStyle = 'rgb(110, 200, 255)'; g.lineWidth = 14;
                    g.beginPath(); g.arc(cell.x, cell.y, 40 + age * 900, 0, Math.PI * 2); g.stroke();
                    break;
                case 'leakflash':
                    g.globalAlpha = 1;
                    g.setTransform(1, 0, 0, 1, 0, 0);
                    g.fillStyle = `rgba(229, 72, 77, ${0.18 * fade})`;
                    g.fillRect(0, 0, w, h);
                    base();
                    break;
            }
        }
        g.globalAlpha = 1;
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
        put('weapons', run.armedAt, () => {
            els.weapons.innerHTML = Object.entries(run.weapons).map(([w, l]) => {
                const evo = run.evolved[w];
                const name = evo ? E.EVOLVE[w].name : E.WEAPONS[w].name;
                return `<span class="wpn${evo ? ' evo' : ''}" role="img" aria-label="${name}, level ${l}" style="--t:${TIER[l - 1]}">${icon(w)}<b>${evo ? '★' : l}</b></span>`;
            }).join('');
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
            let name, text, tag, colour, art = o.id;
            if (o.kind === 'evolve') {
                ({name, text} = E.EVOLVE[o.id]);
                tag = 'Evolve!';
                colour = '#FF7AC8';
            } else if (o.kind === 'boost') {
                ({name, text} = E.BOOSTS[o.id]);
                const has = run.boosts[o.id] || 0;
                const opens = Object.entries(E.EVOLVE).find(([w, ev]) => ev.boost === o.id && run.weapons[w] && !run.evolved[w]);
                tag = has ? `Boost ×${has + 1}` : 'Boost';
                if (opens) text += `. Evolves ${E.WEAPONS[opens[0]].name}`;
                colour = '#FF8DC8';
            } else {
                ({name} = E.WEAPONS[o.id]);
                text = o.kind === 'up' ? E.gains(o.id, o.level) : E.WEAPONS[o.id].text;
                tag = o.kind === 'new' ? 'New' : o.level === E.MAX_LEVEL ? 'Max level' : `Level ${o.level}`;
                colour = TIER[o.level - 1];
            }
            return `<button class="pick ${o.kind}" data-i="${i}" style="--t:${colour}"><span class="tag">${tag}</span>${icon(art)}${o.kind === 'evolve' ? `<i class="star">${icon('evolve')}</i>` : ''}<b>${name}</b><small>${text}</small></button>`;
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
            ${won ? `<img class="chest-art" src="${IMG('chest')}" alt="">` : ''}
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
            const at = E.UNLOCKS.find(([id]) => id === w)[1], ev = E.EVOLVE[w];
            return `<div>${icon(w)}<p><b>${d.name}</b> ${d.text}${at > 1 ? ` (from chapter ${at})` : ''}. At level ${E.MAX_LEVEL} with ${E.BOOSTS[ev.boost].name} it evolves into <b>${ev.name}</b>: ${ev.text.toLowerCase()}.</p></div>`;
        }).join('');
        const boosts = Object.entries(E.BOOSTS).map(([b, d]) => `<div>${icon(b)}<p><b>${d.name}</b> ${d.text}.</p></div>`).join('');
        openSheet(`<h2>How to play</h2>
            <p>Viruses crawl down the channel towards the heart. Every bit that gets through hurts it; lose the heart and the run is over.</p>
            <p>Your cell fights on its own. Popped viruses drop DNA; each level up, pick a new weapon, a stronger one, or a boost. Weapons go to level ${E.MAX_LEVEL}, boosts stack without end, and a weapon at its top level with its partner boost evolves.</p>
            <p>Tap the burst button when it glows to hit every virus at once. Chests at a quarter, half and the end of a chapter pay coins for the lab.</p>
            <h3>Weapons</h3><div class="legend">${weapons}</div>
            <h3>Boosts</h3><div class="legend">${boosts}</div>`);
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
    window.addEventListener('resize', () => { layout = null; if (!run) renderHome(); else still = false; });

    els.fastBtn.classList.toggle('on', store.fast);
    els.fastBtn.setAttribute('aria-pressed', String(store.fast));
    renderHome();
})();
