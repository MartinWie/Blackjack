/**
 * Hide & Meow cat faces: seven breeds drawn on one face, three moods. Pure strings, so
 * the board can stamp them into cells; blinking and ear twitches are CSS (meow.css)
 * keyed on the `eyes`, `ear-l` and `ear-r` groups.
 */
(function (root) {
    'use strict';

    const BREEDS = [
        {name: 'Tuxedo', fur: '#2B2B33', inner: '#F4A7B9', blaze: '#FFFFFF', eyes: ['#F2C14E', '#F2C14E'], whisker: '#FFFFFF'},
        {name: 'Ginger', fur: '#F0A050', inner: '#F9C3A6', blaze: '#FFE9CF', eyes: ['#7CC36E', '#7CC36E'], whisker: '#8A4B1E', stripes: '#C96E2A'},
        {name: 'Smokey', fur: '#8E96A3', inner: '#F2B8C6', blaze: '#DDE2EA', eyes: ['#F2C14E', '#F2C14E'], whisker: '#FFFFFF', tips: '#5F6673'},
        {name: 'Calico', fur: '#FFF8F0', inner: '#F4A7B9', eyes: ['#6DBE6A', '#6DBE6A'], whisker: '#8A6A55', patches: ['#E8913E', '#3A3434'], outline: true},
        {name: 'Siamese', fur: '#F3E3CC', inner: '#7A5A48', mask: '#5A4033', eyes: ['#6EC1F0', '#6EC1F0'], whisker: '#FFFFFF', tips: '#5A4033', outline: true},
        {name: 'Midnight', fur: '#1E1E24', inner: '#C98AA0', eyes: ['#C6E05A', '#C6E05A'], whisker: '#BDBDC7'},
        {name: 'Snowball', fur: '#FFFFFF', inner: '#F7B6C6', eyes: ['#6EC1F0', '#F2B33D'], whisker: '#B8AFA9', outline: true},
    ];

    const HEAD = '<ellipse cx="50" cy="58" rx="38" ry="32"';

    function eyesFor(b, mood) {
        if (mood === 'happy') {
            return '<g class="eyes"><path d="M28 57q7-8 14 0M58 57q7-8 14 0" fill="none" stroke="#2B1D18" stroke-width="3.4" stroke-linecap="round"/></g>';
        }
        if (mood === 'sleep') {
            return '<g class="eyes"><path d="M28 56q7 6 14 0M58 56q7 6 14 0" fill="none" stroke="#2B1D18" stroke-width="3.2" stroke-linecap="round"/></g>';
        }
        const eye = (cx, colour) =>
            `<circle cx="${cx}" cy="55" r="8" fill="#fff"/><circle cx="${cx}" cy="56" r="6.6" fill="${colour}"/>`
            + `<ellipse cx="${cx}" cy="56.5" rx="2.6" ry="5" fill="#1B1B1F"/><circle cx="${cx - 2.2}" cy="53" r="2" fill="#fff"/>`;
        return `<g class="eyes">${eye(35, b.eyes[0])}${eye(65, b.eyes[1])}</g>`;
    }

    function markings(b) {
        let out = '';
        if (b.blaze) out += `<path d="M50 32c-5 9-9 15-18 23-11 11-6 31 18 31s29-20 18-31c-9-8-13-14-18-23z" fill="${b.blaze}"/>`;
        if (b.stripes) {
            out += `<path d="M50 28v9M43 30l2 8M57 30l-2 8" stroke="${b.stripes}" stroke-width="3" stroke-linecap="round"/>`
                + `<path d="M14 56h9M15 63h8M86 56h-9M85 63h-8" stroke="${b.stripes}" stroke-width="3" stroke-linecap="round"/>`;
        }
        if (b.patches) {
            out += `<path d="M14 52c0-14 10-24 24-25-2 9-5 17-14 27-4 3-8 2-10-2z" fill="${b.patches[0]}"/>`
                + `<path d="M86 50c0-12-9-22-22-23 3 8 7 14 14 20 4 4 7 5 8 3z" fill="${b.patches[1]}"/>`;
        }
        if (b.mask) out += `<ellipse cx="50" cy="70" rx="17" ry="14" fill="${b.mask}" opacity=".85"/>`;
        return out;
    }

    function ears(b) {
        const tip = b.tips || b.fur;
        return `<g class="ear-l"><path d="M14 50 18 12q2-5 7-2l20 17z" fill="${tip}"/><path d="m21 39 2-20 13 12z" fill="${b.inner}"/></g>`
            + `<g class="ear-r"><path d="M86 50 82 12q-2-5-7-2L55 27z" fill="${tip}"/><path d="m79 39-2-20-13 12z" fill="${b.inner}"/></g>`;
    }

    /** A cat face. `mood` is awake, happy or sleep; `delay` staggers its blinking. */
    function cat(breed, mood = 'awake', delay = 0) {
        const b = BREEDS[((breed % BREEDS.length) + BREEDS.length) % BREEDS.length];
        const outline = b.outline ? ' stroke="#00000022" stroke-width="2"' : '';
        const nose = b.mask ? '#3A2A22' : '#F08AA4';
        const whiskers = `<path d="M8 62l17 2M9 70l16-2M92 62l-17 2M91 70l-16-2" stroke="${b.whisker}" stroke-width="1.6" stroke-linecap="round" opacity=".8"/>`;
        const zzz = mood === 'sleep' ? '<g class="zzz"><text x="76" y="30">z</text><text x="84" y="20">z</text></g>' : '';
        return `<svg class="cat ${mood}" viewBox="0 0 100 100" style="--blink:${delay}s" aria-hidden="true">${ears(b)}`
            + `${HEAD} fill="${b.fur}"${outline}/>${markings(b)}${eyesFor(b, mood)}`
            + `<ellipse cx="29" cy="71" rx="5" ry="3" fill="#F7B6C6" opacity=".8"/><ellipse cx="71" cy="71" rx="5" ry="3" fill="#F7B6C6" opacity=".8"/>`
            + `<path d="M46 66h8l-4 5z" fill="${nose}"/><path d="M44 74q3 3 6 0 3 3 6 0" fill="none" stroke="#2B1D18" stroke-width="2" stroke-linecap="round"/>`
            + `${whiskers}${zzz}</svg>`;
    }

    root.MeowCats = {BREEDS, cat};
})(typeof self !== 'undefined' ? self : globalThis);
