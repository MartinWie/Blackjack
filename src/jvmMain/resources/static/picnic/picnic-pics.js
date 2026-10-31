/**
 * Ant Picnic pictures: sixteen foods drawn on a 16×16 grid from a few shapes, so
 * each one stays easy to adjust. A picture is {name, palette, grid} where grid holds
 * a palette index per pixel, or -1 for empty.
 */
(function (root) {
    'use strict';

    const N = 16;

    function canvas() {
        return new Array(N * N).fill(-1);
    }

    function paint(g, x, y, c) {
        if (x >= 0 && y >= 0 && x < N && y < N) g[y * N + x] = c;
    }

    function ellipse(g, cx, cy, rx, ry, c) {
        for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
            const dx = (x + 0.5 - cx) / rx, dy = (y + 0.5 - cy) / ry;
            if (dx * dx + dy * dy <= 1) paint(g, x, y, c);
        }
    }

    function rect(g, x0, y0, x1, y1, c) {
        for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) paint(g, x, y, c);
    }

    /** Fills only the pixels that already hold colour `under` (shading, stripes). */
    function within(g, under, test, c) {
        for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
            if (g[y * N + x] === under && test(x, y)) g[y * N + x] = c;
        }
    }

    function triangle(g, ax, ay, bx, by, cx, cy, c) {
        const area = (x1, y1, x2, y2, x3, y3) => (x1 - x3) * (y2 - y3) - (x2 - x3) * (y1 - y3);
        for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
            const px = x + 0.5, py = y + 0.5;
            const d1 = area(px, py, ax, ay, bx, by), d2 = area(px, py, bx, by, cx, cy), d3 = area(px, py, cx, cy, ax, ay);
            const neg = d1 < 0 || d2 < 0 || d3 < 0, pos = d1 > 0 || d2 > 0 || d3 > 0;
            if (!(neg && pos)) paint(g, x, y, c);
        }
    }

    const PICS = [
        {name: 'Apple', palette: ['#E5484D', '#B8303A', '#FFB4B4', '#7A4A2A', '#5DBB63'], draw(g) {
            ellipse(g, 8, 9.5, 6.5, 6, 0);
            within(g, 0, (x, y) => x + y > 19, 1);
            ellipse(g, 5.5, 7, 1.4, 1.8, 2);
            rect(g, 7, 1, 8, 3, 3);
            ellipse(g, 11, 2.6, 2.6, 1.3, 4);
        }},
        {name: 'Donut', palette: ['#D9A066', '#FF8FC7', '#FFFFFF', '#6FC3FF', '#FFD34D', '#B57A45'], draw(g) {
            ellipse(g, 8, 8, 7.5, 7.5, 0);
            within(g, 0, (x, y) => y > 11 || x + y > 21, 5);
            ellipse(g, 8, 7.4, 6.4, 6, 1);
            ellipse(g, 8, 8, 2.2, 2.2, -1);
            [[4, 4, 2], [10, 3, 3], [12, 7, 4], [5, 10, 3], [11, 11, 2], [7, 3, 4], [3, 7, 4]].forEach(([x, y, c]) => paint(g, x, y, c));
        }},
        {name: 'Pizza', palette: ['#F2B65A', '#FFE07A', '#D9382F', '#5DBB63', '#C7843B'], draw(g) {
            triangle(g, 1, 1.5, 15, 1.5, 8, 15.5, 1);
            rect(g, 1, 0, 14, 2, 0);
            within(g, 0, (x) => x === 1 || x === 14, 4);
            [[5, 5], [10, 5], [8, 9]].forEach(([x, y]) => ellipse(g, x + 0.5, y + 0.5, 1.6, 1.6, 2));
            [[7, 4], [11, 7], [6, 8]].forEach(([x, y]) => paint(g, x, y, 3));
        }},
        {name: 'Watermelon', palette: ['#3E9B4F', '#B7E3A0', '#F25A6A', '#2B2B33'], draw(g) {
            ellipse(g, 8, 4, 7.6, 11, 0);
            ellipse(g, 8, 4, 6.6, 10, 1);
            ellipse(g, 8, 4, 5.8, 9, 2);
            rect(g, 0, 0, 15, 3, -1);
            [[5, 6], [8, 9], [11, 6], [7, 5], [9, 6]].forEach(([x, y]) => paint(g, x, y, 3));
        }},
        {name: 'Ice cream', palette: ['#E8A85A', '#C47F38', '#FF9EC4', '#FFFFFF', '#D9382F', '#7A4A2A'], draw(g) {
            triangle(g, 3, 7, 13, 7, 8, 16, 0);
            within(g, 0, (x, y) => (x + y) % 3 === 0, 1);
            ellipse(g, 8, 5.5, 5.5, 4.2, 2);
            ellipse(g, 6, 4, 1.6, 1.1, 3);
            ellipse(g, 8.5, 1.5, 1.4, 1.4, 4);
            paint(g, 9, 0, 5);
        }},
        {name: 'Burger', palette: ['#E8A85A', '#FFF3D6', '#5DBB63', '#FFD34D', '#7A4A2A', '#D9382F'], draw(g) {
            ellipse(g, 8, 5.5, 7.4, 4.6, 0);
            rect(g, 0, 6, 15, 15, -1);
            [[4, 2], [8, 1], [11, 3], [6, 4]].forEach(([x, y]) => paint(g, x, y, 1));
            rect(g, 0, 6, 15, 7, 2);
            within(g, 2, (x, y) => y === 7 && x % 2 === 0, -1);
            rect(g, 1, 8, 14, 8, 5);
            rect(g, 1, 9, 14, 10, 3);
            rect(g, 1, 10, 14, 12, 4);
            rect(g, 1, 13, 14, 14, 0);
            paint(g, 1, 14, -1); paint(g, 14, 14, -1);
        }},
        {name: 'Fried egg', palette: ['#FFFFFF', '#FFC73A', '#FFE68A', '#E9E2D8'], draw(g) {
            ellipse(g, 7.5, 8.5, 7.4, 6.4, 0);
            ellipse(g, 11, 6, 3.6, 3.4, 0);
            within(g, 0, (_, y) => y > 12, 3);
            ellipse(g, 7.5, 8, 3.4, 3.2, 1);
            ellipse(g, 6.6, 7, 1.2, 1, 2);
        }},
        {name: 'Cupcake', palette: ['#6FC3FF', '#3E92CF', '#FFB4D9', '#FF7FB8', '#D9382F', '#FFFFFF'], draw(g) {
            triangle(g, 2, 9, 14, 9, 12.5, 16, 0);
            triangle(g, 2, 9, 3.5, 16, 12.5, 16, 0);
            within(g, 0, (x) => x % 2 === 0, 1);
            ellipse(g, 8, 8.5, 7, 2.6, 2);
            ellipse(g, 8, 6, 5.2, 2.6, 3);
            ellipse(g, 8, 3.8, 3.4, 2, 2);
            ellipse(g, 8.5, 1.5, 1.4, 1.4, 4);
            paint(g, 6, 5, 5); paint(g, 9, 6, 5);
        }},
        {name: 'Strawberry', palette: ['#E5484D', '#B8303A', '#FFE07A', '#5DBB63', '#3E9B4F'], draw(g) {
            ellipse(g, 8, 8, 6.6, 6, 0);
            triangle(g, 2, 9, 14, 9, 8, 16, 0);
            within(g, 0, (x, y) => x + y > 19, 1);
            for (let y = 5; y < 15; y += 2) for (let x = 3 + (y % 4 === 1 ? 1 : 0); x < 14; x += 3) if (g[y * N + x] >= 0) paint(g, x, y, 2);
            ellipse(g, 8, 2.6, 5, 1.6, 3);
            rect(g, 7, 0, 8, 1, 4);
        }},
        {name: 'Cherries', palette: ['#D9282F', '#9C1C24', '#FFB4B4', '#3E9B4F', '#7CC36E'], draw(g) {
            ellipse(g, 4.5, 11.5, 3.6, 3.6, 0);
            ellipse(g, 11.5, 11, 3.6, 3.6, 0);
            within(g, 0, (x, y) => (x < 8 ? x + y > 15 : x + y > 22), 1);
            paint(g, 3, 10, 2); paint(g, 10, 9, 2);
            for (let k = 0; k < 7; k++) { paint(g, 5 + Math.round(k * 0.5), 7 - k, 3); paint(g, 11 - Math.round(k * 0.3), 7 - k, 3); }
            ellipse(g, 11, 1.6, 2.6, 1.2, 4);
        }},
        {name: 'Lemon', palette: ['#FFD34D', '#FFF0A8', '#F2B53A', '#FFFFFF'], draw(g) {
            ellipse(g, 8, 8, 7.6, 7.6, 2);
            ellipse(g, 8, 8, 6.6, 6.6, 3);
            ellipse(g, 8, 8, 5.8, 5.8, 0);
            within(g, 0, (x, y) => Math.abs(x - 7.5) < 0.6 || Math.abs(y - 7.5) < 0.6 || Math.abs(x - y) < 0.7 || Math.abs(x + y - 15) < 0.7, 1);
        }},
        {name: 'Sushi', palette: ['#FFFFFF', '#FF8A5B', '#FFC2A3', '#2B3A33', '#E9E2D8'], draw(g) {
            ellipse(g, 8, 10, 7.4, 4.2, 0);
            within(g, 0, (_, y) => y > 12, 4);
            ellipse(g, 8, 7, 7.6, 3.6, 1);
            within(g, 1, (x) => (x + 1) % 4 === 0, 2);
            rect(g, 6, 3, 9, 13, 3);
            within(g, 3, (_, y) => y < 4 || y > 12, -1);
        }},
        {name: 'Cheese', palette: ['#FFD34D', '#F2B53A', '#E39A1E'], draw(g) {
            triangle(g, 1, 13, 15, 13, 15, 3, 0);
            rect(g, 1, 13, 15, 15, 1);
            [[9, 9, 1.4], [12, 7, 1.2], [6, 11.5, 1], [12.5, 11, 1.2]].forEach(([x, y, r]) => ellipse(g, x, y, r, r, 2));
        }},
        {name: 'Carrot', palette: ['#FF8A3D', '#E0661E', '#5DBB63', '#3E9B4F'], draw(g) {
            triangle(g, 4, 4, 12, 4, 8, 16, 0);
            within(g, 0, (x) => x > 8, 1);
            [[5, 7], [10, 9], [6, 11]].forEach(([x, y]) => { paint(g, x, y, 1); paint(g, x + 1, y, 1); });
            ellipse(g, 6, 2, 1.6, 2.4, 2);
            ellipse(g, 10, 2, 1.6, 2.4, 3);
            ellipse(g, 8, 1.6, 1.4, 2, 2);
        }},
        {name: 'Cookie', palette: ['#E3B176', '#C98F4E', '#5A3A28'], draw(g) {
            ellipse(g, 8, 8, 7.5, 7.5, 0);
            within(g, 0, (x, y) => (x * 7 + y * 13) % 11 === 0, 1);
            [[4, 5], [10, 4], [7, 8], [11, 10], [4, 11], [8, 13], [12, 7]].forEach(([x, y]) => { paint(g, x, y, 2); paint(g, x + 1, y, 2); paint(g, x, y + 1, 2); });
        }},
        {name: 'Avocado', palette: ['#3E7D3A', '#C8E28A', '#E8F2B8', '#8A5A35', '#A9744A'], draw(g) {
            ellipse(g, 8, 9, 6.6, 6.8, 0);
            ellipse(g, 8, 4.5, 4.4, 4.4, 0);
            ellipse(g, 8, 9.2, 5.4, 5.6, 1);
            ellipse(g, 8, 5, 3.2, 3.2, 1);
            within(g, 1, (x, y) => Math.abs(x - 7.5) + Math.abs(y - 9) > 6, 2);
            ellipse(g, 8, 10, 2.8, 2.8, 3);
            ellipse(g, 7.2, 9.2, 1, 1, 4);
        }},
    ].map((p) => {
        const grid = canvas();
        p.draw(grid);
        return {name: p.name, palette: p.palette, grid};
    });

    root.PicnicPics = {N, PICS};
    if (typeof module !== 'undefined') module.exports = root.PicnicPics;
})(typeof self !== 'undefined' ? self : globalThis);
