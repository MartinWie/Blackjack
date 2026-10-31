/**
 * The gift that drops a power-up: a box shakes, pops open, the prize rises out of a
 * burst of light and flies into its slot. Shared by Hide & Meow and Sweet Swap; it
 * brings its own styles so neither page has to carry them.
 *
 *   Gift.show({icon, name, target: () => element, done})
 *   Gift.fly(icon, fromElement, toElement, done)
 */
(function (root) {
    'use strict';

    const CSS = `
.gift-veil { position: fixed; inset: 0; z-index: 30; display: grid; place-items: center; background: rgba(62, 44, 39, .45); }
.gift-veil .box { width: 150px; height: 150px; animation: gift-in .5s cubic-bezier(.3, 1.6, .5, 1), gift-shake .45s .55s 3; }
.gift-veil .lid { transform-box: view-box; transform-origin: 50px 40px; }
.gift-veil.open .lid { animation: gift-lid .5s ease-out forwards; }
.gift-veil .prize { position: absolute; display: grid; justify-items: center; gap: 8px; opacity: 0; pointer-events: none; }
.gift-veil .prize svg { width: 110px; height: 110px; filter: drop-shadow(0 6px 12px rgba(0,0,0,.25)); }
.gift-veil .prize p { margin: 0; padding: 8px 18px; border-radius: 999px; background: #fff; color: #5B2A4E; font: 900 18px ui-rounded, system-ui, sans-serif; text-align: center; }
.gift-veil.open .prize { animation: gift-prize 2.2s cubic-bezier(.3, 1.4, .5, 1) .25s forwards; }
.gift-veil .ray { position: absolute; width: 340px; height: 340px; border-radius: 50%; opacity: 0; background: repeating-conic-gradient(rgba(255,233,160,.55) 0 10deg, transparent 10deg 24deg); }
.gift-veil.open .ray { animation: gift-rays 2.4s linear forwards; }
.gift-spark { position: fixed; z-index: 31; width: 10px; height: 10px; border-radius: 50%; pointer-events: none; animation: gift-spark .9s ease-out forwards; }
.gift-fly { position: fixed; z-index: 32; width: 64px; height: 64px; pointer-events: none; transition: transform .7s cubic-bezier(.5, 0, .3, 1), opacity .7s; }
.gift-fly svg { width: 100%; height: 100%; }
@keyframes gift-in { from { transform: scale(0) rotate(-20deg); } to { transform: none; } }
@keyframes gift-shake { 0%, 100% { transform: rotate(0); } 25% { transform: rotate(-9deg) scale(1.04); } 75% { transform: rotate(9deg) scale(1.04); } }
@keyframes gift-lid { to { transform: translate(14px, -70px) rotate(28deg); opacity: 0; } }
@keyframes gift-prize { 0% { opacity: 0; transform: translateY(30px) scale(.3); } 25% { opacity: 1; transform: translateY(-40px) scale(1.15); } 40%, 100% { opacity: 1; transform: translateY(-30px) scale(1); } }
@keyframes gift-rays { 0% { opacity: 0; transform: rotate(0) scale(.5); } 20% { opacity: 1; } 100% { opacity: .8; transform: rotate(120deg) scale(1); } }
@keyframes gift-spark { from { transform: translate(0, 0) scale(1); opacity: 1; } to { transform: translate(var(--sx), var(--sy)) scale(.2); opacity: 0; } }
@media (prefers-reduced-motion: reduce) { .gift-veil *, .gift-spark { animation-duration: .01ms !important; animation-iteration-count: 1 !important; } }`;

    const BOX = '<svg class="box" viewBox="0 0 100 100"><rect x="14" y="44" width="72" height="48" rx="6" fill="#E58A9A" stroke="#B9607A" stroke-width="3"/><rect x="45" y="44" width="10" height="48" fill="#F2C14E"/><g class="lid"><rect x="8" y="30" width="84" height="18" rx="5" fill="#F0A0AE" stroke="#B9607A" stroke-width="3"/><rect x="45" y="30" width="10" height="18" fill="#F2C14E"/><path d="M50 30c-6-12-22-14-20-4 1 5 12 5 20 4zM50 30c6-12 22-14 20-4-1 5-12 5-20 4z" fill="#F2C14E" stroke="#C48A1C" stroke-width="2.5" stroke-linejoin="round"/></g></svg>';

    let styled = false;
    function style() {
        if (styled) return;
        styled = true;
        const el = document.createElement('style');
        el.textContent = CSS;
        document.head.appendChild(el);
    }

    function sparks(x, y) {
        const colours = ['#F2C14E', '#F58BB3', '#7CC36E', '#6EC1F0', '#fff'];
        for (let k = 0; k < 26; k++) {
            const s = document.createElement('div');
            s.className = 'gift-spark';
            const angle = (k / 26) * Math.PI * 2, dist = 90 + Math.random() * 90;
            Object.assign(s.style, {left: `${x}px`, top: `${y}px`, background: colours[k % colours.length]});
            s.style.setProperty('--sx', `${Math.cos(angle) * dist}px`);
            s.style.setProperty('--sy', `${Math.sin(angle) * dist}px`);
            document.body.appendChild(s);
            s.addEventListener('animationend', () => s.remove(), {once: true});
        }
    }

    /** Flies an icon between two rects (elements or anything with getBoundingClientRect). */
    function fly(icon, from, to, done = () => {}) {
        style();
        if (!from || !to) { done(); return; }
        const a = from.getBoundingClientRect(), b = to.getBoundingClientRect();
        const el = document.createElement('div');
        el.className = 'gift-fly';
        el.innerHTML = icon;
        Object.assign(el.style, {left: `${a.left + a.width / 2 - 32}px`, top: `${a.top + a.height / 2 - 32}px`});
        document.body.appendChild(el);
        el.getBoundingClientRect();
        el.style.transform = `translate(${b.left + b.width / 2 - (a.left + a.width / 2)}px, ${b.top + b.height / 2 - (a.top + a.height / 2)}px) scale(.45)`;
        el.style.opacity = '.4';
        setTimeout(() => { el.remove(); done(); }, 720);
    }

    function show({icon, name, target, done = () => {}}) {
        style();
        const veil = document.createElement('div');
        veil.className = 'gift-veil';
        veil.innerHTML = `<div class="ray"></div>${BOX}<div class="prize">${icon}<p></p></div>`;
        veil.querySelector('.prize p').textContent = `You got ${/^[aeiou]/i.test(name) ? 'an' : 'a'} ${name}!`;
        document.body.appendChild(veil);
        setTimeout(() => { veil.classList.add('open'); sparks(window.innerWidth / 2, window.innerHeight / 2); }, 1900);
        setTimeout(() => {
            const rect = veil.querySelector('.prize svg').getBoundingClientRect();
            veil.remove();
            fly(icon, {getBoundingClientRect: () => rect}, target(), done);
        }, 4300);
    }

    root.Gift = {show, fly};
})(window);
