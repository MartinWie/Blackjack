/**
 * Draft Battle drawings, all as SVG strings: the troops and buildings in a team's
 * colours (cards show them in a neutral cream; the battlefield rasterises them into
 * sprites) and an icon for every card that is not a troop.
 */
(function (root) {
    'use strict';

    const TEAMS = {
        blue: {main: '#3E7BEA', dark: '#1F4FA6', light: '#9CC0FF'},
        red: {main: '#E5484D', dark: '#A8262C', light: '#FFA6A9'},
        neutral: {main: '#E9C98F', dark: '#9A7448', light: '#FFF1D6'},
    };
    const INK = '#3B2C22', SKIN = '#FFD8B5', STEEL = '#D3DCE6', STEEL_DARK = '#8C99A8', WOOD = '#9B6A3E', STONE = '#B9B2A6';

    const svg = (body, view = '0 0 40 40') => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${view}" aria-hidden="true">${body}</svg>`;
    const shadow = (rx = 11) => `<ellipse cx="20" cy="36.5" rx="${rx}" ry="2.6" fill="rgba(40,25,10,.22)"/>`;
    const eyes = (y = 15, dx = 3) => `<circle cx="${20 - dx}" cy="${y}" r="1.3" fill="${INK}"/><circle cx="${20 + dx}" cy="${y}" r="1.3" fill="${INK}"/>`;

    /** A troop or building in a team's colours. */
    function figure(type, team = 'neutral') {
        const c = TEAMS[team] || TEAMS.neutral;
        switch (type) {
            case 'sword': return svg(`${shadow()}
                <path d="M29 26 35 6" stroke="${STEEL_DARK}" stroke-width="4.2" stroke-linecap="round"/><path d="M29 26 35 6" stroke="${STEEL}" stroke-width="2.4" stroke-linecap="round"/>
                <path d="M25.5 24.5l7 2" stroke="${WOOD}" stroke-width="2.6" stroke-linecap="round"/>
                <circle cx="20" cy="26" r="10" fill="${c.main}" stroke="${INK}" stroke-width="1.8"/>
                <path d="M14 27h12" stroke="${c.dark}" stroke-width="2.2"/>
                <circle cx="20" cy="15" r="7.6" fill="${SKIN}" stroke="${INK}" stroke-width="1.8"/>
                <path d="M12.6 14.6a7.4 7.4 0 0 1 14.8 0z" fill="${STEEL}" stroke="${INK}" stroke-width="1.6"/>${eyes(16.4)}`);
            case 'archer': return svg(`${shadow()}
                <path d="M30 6q9 14 0 28" fill="none" stroke="${WOOD}" stroke-width="2.6" stroke-linecap="round"/><path d="M30 6v28" stroke="#F3E9D2" stroke-width="1"/>
                <circle cx="20" cy="26" r="9.6" fill="${c.main}" stroke="${INK}" stroke-width="1.8"/>
                <circle cx="20" cy="15.5" r="7.4" fill="${SKIN}" stroke="${INK}" stroke-width="1.8"/>
                <path d="M12 17c0-9 5-12 8-12s8 3 8 12c-2-4-5-5.5-8-5.5S14 13 12 17z" fill="${c.dark}" stroke="${INK}" stroke-width="1.5"/>${eyes(17)}`);
            case 'knight': return svg(`${shadow(12)}
                <path d="M20 3c3 1 5 3 5 6" fill="none" stroke="${c.main}" stroke-width="3.4" stroke-linecap="round"/>
                <circle cx="20" cy="26.5" r="11" fill="${STEEL}" stroke="${INK}" stroke-width="1.8"/>
                <path d="M11 28h18v4H11z" fill="${c.main}" stroke="${INK}" stroke-width="1.4"/>
                <path d="M11.8 18a8.2 8.2 0 0 1 16.4 0v2.5H11.8z" fill="${STEEL}" stroke="${INK}" stroke-width="1.8"/>
                <path d="M14.5 16.5h11" stroke="${INK}" stroke-width="2.2" stroke-linecap="round"/>
                <path d="M33 14v20" stroke="${STEEL_DARK}" stroke-width="3" stroke-linecap="round"/><path d="M31 15l2-8 2 8z" fill="${STEEL}" stroke="${INK}" stroke-width="1.2"/>`);
            case 'goblin': return svg(`${shadow(9)}
                <path d="M29 30 34 18" stroke="${WOOD}" stroke-width="3" stroke-linecap="round"/>
                <circle cx="20" cy="28" r="8" fill="${c.main}" stroke="${INK}" stroke-width="1.8"/>
                <path d="M10 13 4 9l7 8zM30 13l6-4-7 8z" fill="#8BC56B" stroke="${INK}" stroke-width="1.4" stroke-linejoin="round"/>
                <circle cx="20" cy="17" r="7.6" fill="#8BC56B" stroke="${INK}" stroke-width="1.8"/>
                <circle cx="17" cy="17" r="1.8" fill="#FFF5C0"/><circle cx="23" cy="17" r="1.8" fill="#FFF5C0"/>${eyes(17.2, 3)}
                <path d="M17 21.5q3 1.6 6 0" fill="none" stroke="${INK}" stroke-width="1.2" stroke-linecap="round"/>`);
            case 'giant': return svg(`${shadow(15)}
                <path d="M31 30 36 10" stroke="${WOOD}" stroke-width="5" stroke-linecap="round"/><circle cx="36" cy="9" r="4" fill="${WOOD}" stroke="${INK}" stroke-width="1.4"/>
                <ellipse cx="20" cy="27" rx="14" ry="10.5" fill="#C9A27A" stroke="${INK}" stroke-width="1.8"/>
                <path d="M7 26h26v5c-4 4-22 4-26 0z" fill="${c.main}" stroke="${INK}" stroke-width="1.4"/>
                <circle cx="20" cy="13" r="8.4" fill="#D8B08A" stroke="${INK}" stroke-width="1.8"/>${eyes(13, 3.4)}
                <path d="M15.5 17.5h9" stroke="${INK}" stroke-width="1.6" stroke-linecap="round"/><path d="M14 9.5l4 1.5M26 9.5l-4 1.5" stroke="${INK}" stroke-width="1.6" stroke-linecap="round"/>`);
            case 'tower': return svg(`<ellipse cx="20" cy="37" rx="13" ry="2.6" fill="rgba(40,25,10,.22)"/>
                <path d="M10 36V14h20v22z" fill="${STONE}" stroke="${INK}" stroke-width="1.8"/>
                <path d="M8 14V8h4v3h4V8h8v3h4V8h4v6z" fill="#CFC8BC" stroke="${INK}" stroke-width="1.8" stroke-linejoin="round"/>
                <path d="M16.5 36v-7a3.5 3.5 0 0 1 7 0v7z" fill="${INK}"/><path d="M10 22h20M10 29h6M24 29h6" stroke="#8F877B" stroke-width="1.2"/>
                <path d="M20 8V1" stroke="${INK}" stroke-width="1.6"/><path d="M20 1.5h8l-2.5 2.6L28 6.8h-8z" fill="${c.main}" stroke="${INK}" stroke-width="1.2" stroke-linejoin="round"/>`);
            case 'catapult': return svg(`<ellipse cx="20" cy="37" rx="14" ry="2.6" fill="rgba(40,25,10,.22)"/>
                <path d="M7 31h26" stroke="${WOOD}" stroke-width="4" stroke-linecap="round"/>
                <path d="M12 31l6-12 6 12" fill="none" stroke="${WOOD}" stroke-width="3" stroke-linejoin="round"/>
                <path d="M18 21 31 6" stroke="#7D5230" stroke-width="3.4" stroke-linecap="round"/><path d="M27 4a4.5 4 0 0 1 7 4l-4 1.5z" fill="#7D5230" stroke="${INK}" stroke-width="1.2"/>
                <circle cx="31.5" cy="5" r="2.6" fill="#8D8579" stroke="${INK}" stroke-width="1.2"/>
                <circle cx="11" cy="33" r="4" fill="${c.main}" stroke="${INK}" stroke-width="1.6"/><circle cx="29" cy="33" r="4" fill="${c.main}" stroke="${INK}" stroke-width="1.6"/>`);
            case 'wall': return svg(`<ellipse cx="20" cy="36.5" rx="17" ry="2.4" fill="rgba(40,25,10,.22)"/>
                <path d="M3 35V17h34v18z" fill="${STONE}" stroke="${INK}" stroke-width="1.8"/>
                <path d="M3 23h34M3 29h34M12 17v6M26 17v6M7 23v6M19 23v6M31 23v6M12 29v6M26 29v6" stroke="#8F877B" stroke-width="1.3"/>
                <path d="M3 17h34" stroke="${c.main}" stroke-width="3"/>`);
        }
        return svg('');
    }

    /** Icons for the cards that are not a troop or a building. */
    const ICONS = {
        rally: svg(`<path d="M11 36V5" stroke="${WOOD}" stroke-width="3" stroke-linecap="round"/>
            <path d="M12 6h20l-5 6 5 6H12z" fill="#F2B544" stroke="${INK}" stroke-width="1.8" stroke-linejoin="round"/>
            <path d="M18 12l2.5 2.5L26 9" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>`),
        rage: svg(`<path d="M20 4c3 6 10 8 10 18a10 10 0 0 1-20 0c0-5 3-7 4-10 1 4 3 5 4 5 0-4 0-9 2-13z" fill="#FF7A3D" stroke="${INK}" stroke-width="1.8" stroke-linejoin="round"/>
            <path d="M20 17c2 3 5 5 5 9a5 5 0 0 1-10 0c0-3 2-4 3-6 0 2 1 3 2 3 0-2-1-4 0-6z" fill="#FFD25E"/>
            <path d="M14 27l3-1.5M26 27l-3-1.5" stroke="${INK}" stroke-width="1.6" stroke-linecap="round"/>`),
        armor: svg(`<path d="M10 9l6-3h8l6 3v10c0 9-5 14-10 16-5-2-10-7-10-16z" fill="${STEEL}" stroke="${INK}" stroke-width="1.8" stroke-linejoin="round"/>
            <path d="M20 7v26M12 16h16" stroke="${STEEL_DARK}" stroke-width="1.6"/><path d="M16 6c1 3 7 3 8 0" fill="none" stroke="${INK}" stroke-width="1.6"/>`),
        haste: svg(`<path d="M12 8h10v14l8 5c2 1 2 6-1 6H12z" fill="#8C5A3A" stroke="${INK}" stroke-width="1.8" stroke-linejoin="round"/>
            <path d="M12 29h20" stroke="${INK}" stroke-width="1.6"/><path d="M22 12c4-6 11-6 14-4-4 0-6 2-8 4 3-1 6 0 7 2-4-1-8 0-11 2z" fill="#FFF" stroke="${INK}" stroke-width="1.4" stroke-linejoin="round"/>
            <path d="M3 17h6M2 22h7M4 27h5" stroke="#9CC0FF" stroke-width="2" stroke-linecap="round"/>`),
        fire: svg(`<path d="M6 34 30 10" stroke="${WOOD}" stroke-width="3" stroke-linecap="round"/><path d="M6 34l-1-6M6 34l6 1" stroke="#E9DCC4" stroke-width="2.4" stroke-linecap="round"/>
            <path d="M30 10l-6 1 5 5z" fill="${STEEL}" stroke="${INK}" stroke-width="1.3" stroke-linejoin="round"/>
            <path d="M31 9c3-1 6-5 4-8-1 3-3 2-4 4-1-2 0-4-1-5-2 2-3 6 1 9z" fill="#FF7A3D" stroke="${INK}" stroke-width="1.2" stroke-linejoin="round"/>`),
        shields: svg(`<circle cx="20" cy="20" r="14" fill="#C9874F" stroke="${INK}" stroke-width="1.8"/><circle cx="20" cy="20" r="9.5" fill="${STEEL}" stroke="${INK}" stroke-width="1.5"/>
            <circle cx="20" cy="20" r="3.4" fill="#F2B544" stroke="${INK}" stroke-width="1.3"/><path d="M20 6v4.5M20 29.5V34M6 20h4.5M29.5 20H34" stroke="${INK}" stroke-width="1.4"/>`),
        medics: svg(`<path d="M8 14h24v18a3 3 0 0 1-3 3H11a3 3 0 0 1-3-3z" fill="#FFF7EA" stroke="${INK}" stroke-width="1.8"/><path d="M15 14v-4a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v4" fill="none" stroke="${INK}" stroke-width="1.8"/>
            <path d="M17.5 18.5h5v4h4v5h-4v4h-5v-4h-4v-5h4z" fill="#E5484D" stroke="${INK}" stroke-width="1.2" stroke-linejoin="round"/>`),
        fireball: svg(`<path d="M8 32c-4-8 4-12 6-18 3 4 3 6 2 9 4-3 6-7 5-13 7 4 12 12 9 20-2 6-8 8-12 8-5 0-9-2-10-6z" fill="#FF7A3D" stroke="${INK}" stroke-width="1.8" stroke-linejoin="round"/>
            <circle cx="20" cy="28" r="6" fill="#FFD25E"/><circle cx="20" cy="28" r="2.6" fill="#FFF3C9"/>`),
        lightning: svg(`<path d="M8 13c0-5 5-8 10-6 2-4 9-4 11 1 5 0 7 6 3 9H10c-2 0-2-2-2-4z" fill="#C9D3E2" stroke="${INK}" stroke-width="1.7" stroke-linejoin="round"/>
            <path d="M21 17l-6 10h5l-3 10 10-13h-6l4-7z" fill="#FFD25E" stroke="${INK}" stroke-width="1.6" stroke-linejoin="round"/>`),
    };

    /** The picture on a card: its troop or building, or its icon. */
    function cardArt(id, cards) {
        const c = cards[id];
        if (c.unit) return figure(c.unit);
        if (id === 'tower' || id === 'catapult' || id === 'wall') return figure(id);
        return ICONS[id] || svg('');
    }

    root.DraftArt = {TEAMS, figure, cardArt};
})(typeof self !== 'undefined' ? self : globalThis);
