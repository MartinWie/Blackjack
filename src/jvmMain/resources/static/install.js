/**
 * The offer to put an app (the launcher or one game) on the home screen. Modelled on
 * Huus: Chrome and Edge hand over a real prompt through `beforeinstallprompt`; iOS has
 * none, so there the sheet says where Apple's button is.
 *
 * Asking on its own happens on the launcher only (`data-ask` on this script), once per
 * device, and only on a visit on a later day than the first. Anything with
 * `data-install="open"` opens the sheet on demand, and a page opened with `#install`
 * (the launcher's per-game install link) opens it straight away: a game installs from
 * its own subdomain, since a browser installs one app per origin.
 *
 * The page's look varies per game, so the sheet carries its own styles.
 */
(function () {
    'use strict';

    const KEY = 'games.install';
    const me = document.currentScript;
    const APP = {
        name: me.dataset.name || 'Games',
        icon: me.dataset.icon || '',
        offline: me.dataset.offline === 'true',
        ask: me.dataset.ask === 'true',
    };
    const UA = navigator.userAgent || '';
    let deferred = null;
    let sheet = null;
    let loaded = false;

    /** `{days: ['2026-11-01'], asked: false, off: false}`, per device. */
    function read() {
        try {
            const v = JSON.parse(localStorage.getItem(KEY));
            if (!v || typeof v !== 'object') throw new Error('empty');
            return {days: Array.isArray(v.days) ? v.days.slice(-2) : [], asked: v.asked === true, off: v.off === true};
        } catch (_) {
            return {days: [], asked: false, off: false};
        }
    }

    function write(state) {
        try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (_) { /* asked again next time */ }
    }

    function today() {
        const d = new Date();
        return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
    }

    function installed() {
        try {
            if (navigator.standalone === true) return true;
            return ['standalone', 'minimal-ui', 'fullscreen'].some((m) => matchMedia(`(display-mode: ${m})`).matches);
        } catch (_) {
            return false;
        }
    }

    const isIOS = () => /iPad|iPhone|iPod/.test(UA) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    const inAppBrowser = () => /FBAN|FBAV|Instagram|Line\/|Twitter|MicroMessenger|GSA\//.test(UA);

    /** 'prompt' (the browser's own dialog), 'ios' (Share, then Add), 'menu' (anything else). */
    function offer() {
        if (deferred) return 'prompt';
        if (isIOS() && !/FxiOS/.test(UA)) return 'ios';
        return 'menu';
    }

    /* ---- the sheet ------------------------------------------------------------- */

    const CSS = `
.inst{position:fixed;inset:0;z-index:1000;display:grid;align-items:end;justify-items:center;background:rgba(20,14,10,.45);animation:inst-veil .25s ease-out both;font-family:ui-rounded,"SF Pro Rounded",system-ui,sans-serif}
.inst.out{animation:inst-veil .22s ease-in reverse both}
.inst-card{position:relative;width:min(440px,100%);padding:22px 20px max(20px,env(safe-area-inset-bottom));border-radius:24px 24px 0 0;background:#FFFDF8;color:#3B2C22;box-shadow:0 -10px 40px rgba(0,0,0,.25);animation:inst-up .38s cubic-bezier(.2,.9,.3,1.05) both}
.inst.out .inst-card{animation:inst-down .22s ease-in both}
.inst-head{display:flex;align-items:center;gap:14px}
.inst-head img{width:56px;height:56px;border-radius:14px;box-shadow:0 4px 12px rgba(0,0,0,.18)}
.inst h2{margin:0;font-size:20px;font-weight:900;line-height:1.15;color:#3B2C22}
.inst p{margin:4px 0 0;font-size:14px;font-weight:600;line-height:1.4;color:#7A6656}
.inst ol{margin:14px 0 0;padding:0;list-style:none;display:grid;gap:8px}
.inst li{display:flex;align-items:center;gap:10px;padding:10px 12px;border-radius:14px;background:#F4EDE3;font-size:15px;font-weight:700}
.inst li b{display:grid;place-items:center;width:24px;height:24px;flex:none;border-radius:50%;background:#3B2C22;color:#fff;font-size:13px}
.inst li svg{width:20px;height:20px;flex:none;margin-left:auto}
.inst-row{display:flex;gap:10px;margin-top:16px}
.inst-row button{flex:1;padding:13px;border:0;border-radius:999px;font:inherit;font-size:16px;font-weight:900;cursor:pointer}
.inst-later{background:#F0E6DA;color:#3B2C22}
.inst-go{background:#E5484D;color:#fff;box-shadow:0 4px 0 #B8303A}
.inst-go:active{transform:translateY(2px);box-shadow:0 2px 0 #B8303A}
@keyframes inst-veil{from{background:rgba(20,14,10,0)}}
@keyframes inst-up{from{transform:translateY(100%)}}
@keyframes inst-down{to{transform:translateY(100%)}}
@media (prefers-reduced-motion:reduce){.inst,.inst-card{animation:none!important}}`;

    const SHARE = '<svg viewBox="0 0 24 24" fill="none" stroke="#2F7FE0" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12M8 7l4-4 4 4"/><path d="M6 11v9h12v-9"/></svg>';
    const PLUS = '<svg viewBox="0 0 24 24" fill="none" stroke="#3B2C22" stroke-width="2" stroke-linecap="round"><rect x="4" y="4" width="16" height="16" rx="4"/><path d="M12 8v8M8 12h8"/></svg>';

    function body(kind) {
        const why = APP.offline ? 'It opens full screen like an app and plays offline too.' : 'It opens full screen, like an app.';
        const steps = kind === 'ios'
            ? `<ol><li><b>1</b>Tap Share in Safari's toolbar${SHARE}</li><li><b>2</b>Choose “Add to Home Screen”${PLUS}</li></ol>`
            : kind === 'menu'
                ? '<ol><li><b>1</b>Open your browser\'s menu</li><li><b>2</b>Choose “Install app” or “Add to Home screen”</li></ol>'
                : '';
        const go = kind === 'prompt' ? '<button class="inst-go" data-inst="go">Add</button>' : '';
        return `<div class="inst-card" role="dialog" aria-modal="true" aria-labelledby="inst-title">
            <div class="inst-head">${APP.icon ? `<img src="${APP.icon}" alt="">` : ''}<div><h2 id="inst-title">Add ${APP.name} to your home screen</h2><p>${why}</p></div></div>
            ${steps}
            <div class="inst-row"><button class="inst-later" data-inst="later">${kind === 'prompt' ? 'Not now' : 'Got it'}</button>${go}</div></div>`;
    }

    function show() {
        if (!document.getElementById('inst-css')) {
            const style = document.createElement('style');
            style.id = 'inst-css';
            style.textContent = CSS;
            document.head.appendChild(style);
        }
        if (!sheet) {
            sheet = document.createElement('div');
            sheet.className = 'inst';
            sheet.addEventListener('click', (e) => {
                const b = e.target.closest('[data-inst]');
                if (e.target === sheet || (b && b.dataset.inst === 'later')) hide();
                else if (b && b.dataset.inst === 'go') prompt();
            });
            document.body.appendChild(sheet);
        }
        sheet.dataset.kind = offer();
        sheet.innerHTML = body(sheet.dataset.kind);
    }

    function hide() {
        if (!sheet) return;
        const el = sheet;
        sheet = null;
        el.classList.add('out');
        setTimeout(() => el.remove(), 230);
    }

    /** `prompt()` works once per event and only from a tap; the event is spent either way. */
    function prompt() {
        const event = deferred;
        deferred = null;
        if (!event) { hide(); return; }
        Promise.resolve(event.prompt()).then(() => event.userChoice).then((choice) => {
            if (choice && choice.outcome === 'accepted') stop();
            hide();
        }).catch(hide);
    }

    function stop() {
        const state = read();
        state.off = true;
        write(state);
    }

    /* ---- when to ask ------------------------------------------------------------ */

    /** Install buttons and links (`data-install`), hidden where nothing can be installed. */
    function syncLinks() {
        const hidden = installed() || inAppBrowser();
        // style rather than `hidden`, which a display utility class would override
        document.querySelectorAll('[data-install]').forEach((el) => { el.style.display = hidden ? 'none' : ''; });
    }

    function maybeAsk() {
        if (installed()) { if (!read().off) stop(); return; }
        if (inAppBrowser()) return;
        if (location.hash === '#install') {
            history.replaceState(null, '', location.pathname + location.search);
            show();
            return;
        }
        if (!APP.ask) return;
        const state = read();
        if (state.days.at(-1) !== today()) {
            state.days = state.days.concat(today()).slice(-2);
            write(state);
        }
        // Once, on a visit on a later day: a device that came back.
        if (state.off || state.asked || state.days.length < 2) return;
        if (offer() === 'menu') return;
        state.asked = true;
        write(state);
        show();
    }

    window.addEventListener('beforeinstallprompt', (event) => {
        // Kept for our own button, rather than the browser's bar at a moment of its choosing.
        event.preventDefault();
        deferred = event;
        if (sheet && sheet.dataset.kind !== 'prompt') show();
        else if (!sheet && loaded) maybeAsk();      // Chrome's event often comes after load
    });

    window.addEventListener('appinstalled', () => {
        deferred = null;
        stop();
        hide();
        syncLinks();
    });

    document.addEventListener('click', (e) => {
        const b = e.target.closest && e.target.closest('[data-install="open"]');
        if (!b) return;
        e.preventDefault();
        show();
    });

    function start() {
        syncLinks();
        // After load: an offer should never compete with the first paint of a game.
        const go = () => setTimeout(() => { loaded = true; maybeAsk(); }, 600);
        if (document.readyState === 'complete') go();
        else addEventListener('load', go, {once: true});
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
    else start();
})();
