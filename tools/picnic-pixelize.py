"""
Turns generated pixel-art PNGs (assets/picnic/*.png) into Ant Picnic pictures and
writes src/jvmMain/resources/static/picnic/picnic-pics.js.

    python3 tools/picnic-pixelize.py

Pure Python: macOS `sips` converts each PNG to BMP, the BMP is read here. The art's
pixel pitch is found from where colours change, every grid cell takes its most
common colour, near-white becomes empty, and the rest is merged into a few colours.
"""
import json
import os
import struct
import subprocess
import sys
import tempfile
from collections import Counter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'assets', 'picnic')
OUT = os.path.join(ROOT, 'src', 'jvmMain', 'resources', 'static', 'picnic', 'picnic-pics.js')
N = 26          # the board is N x N; pictures are centred on it
MAX_COLOURS = 7


def read_bmp(path):
    data = open(path, 'rb').read()
    offset = struct.unpack_from('<I', data, 10)[0]
    width, height = struct.unpack_from('<ii', data, 18)
    bpp = struct.unpack_from('<H', data, 28)[0]
    step = bpp // 8
    row = (width * step + 3) & ~3
    flip = height > 0
    height = abs(height)
    px = []
    for y in range(height):
        base = offset + (height - 1 - y if flip else y) * row
        line = []
        for x in range(width):
            b, g, r = data[base + x * step], data[base + x * step + 1], data[base + x * step + 2]
            a = data[base + x * step + 3] if step == 4 else 255
            line.append((r, g, b) if a > 128 else (255, 255, 255))
        px.append(line)
    return px


def load(png):
    with tempfile.TemporaryDirectory() as tmp:
        bmp = os.path.join(tmp, 'x.bmp')
        subprocess.run(['sips', '-s', 'format', 'bmp', png, '--out', bmp], check=True, capture_output=True)
        return read_bmp(bmp)


def is_white(c):
    return min(c) > 225


def bbox(px):
    h, w = len(px), len(px[0])
    ys = [y for y in range(h) if any(not is_white(px[y][x]) for x in range(0, w, 2))]
    xs = [x for x in range(w) if any(not is_white(px[y][x]) for y in range(0, h, 2))]
    return min(xs), min(ys), max(xs) + 1, max(ys) + 1


def close(a, b, t=40):
    return sum(abs(p - q) for p, q in zip(a, b)) < t


def pitch(px, box):
    """The art's pixel size: the step that best lines up with colour edges."""
    x0, y0, x1, y1 = box
    edges = Counter()
    for y in range(y0, y1, 7):
        for x in range(x0 + 1, x1):
            if not close(px[y][x], px[y][x - 1]):
                edges[x - x0] += 1
    best, score = None, -1
    for p10 in range(200, 900):
        p = p10 / 10
        for off10 in range(0, int(p * 10), 5):
            off = off10 / 10
            s = 0
            k = 0
            while off + k * p < x1 - x0:
                pos = round(off + k * p)
                s += edges[pos] + edges[pos - 1] + edges[pos + 1]
                k += 1
            s /= max(1, k) ** 0.5
            if s > score:
                best, score = (p, off), s
    return best


def grid(px, box, p, off):
    x0, y0, x1, y1 = box
    cols = max(1, round((x1 - x0) / p))
    rows = max(1, round((y1 - y0) / p))
    cells = []
    for r in range(rows):
        line = []
        for c in range(cols):
            votes = Counter()
            cx0, cy0 = x0 + c * p + p * 0.25, y0 + r * p + p * 0.25
            for dy in range(4):
                for dx in range(4):
                    x, y = int(cx0 + dx * p * 0.17), int(cy0 + dy * p * 0.17)
                    if y < len(px) and x < len(px[0]):
                        q = tuple(v // 12 * 12 for v in px[y][x])
                        votes[q] += 1
            colour = votes.most_common(1)[0][0]
            line.append(None if is_white(colour) else colour)
        cells.append(line)
    return cells


def fill_enclosed(cells):
    """White inside the picture (eye shine, egg white, cream) is food, not a hole."""
    h, w = len(cells), len(cells[0])
    outside = set()
    stack = [(y, x) for y in range(h) for x in range(w) if (y in (0, h - 1) or x in (0, w - 1)) and cells[y][x] is None]
    while stack:
        y, x = stack.pop()
        if (y, x) in outside:
            continue
        outside.add((y, x))
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            ny, nx = y + dy, x + dx
            if 0 <= ny < h and 0 <= nx < w and cells[ny][nx] is None and (ny, nx) not in outside:
                stack.append((ny, nx))
    return [[(c if c is not None or (y, x) in outside else (250, 250, 248)) for x, c in enumerate(line)] for y, line in enumerate(cells)]


def merge(cells):
    """Merges similar colours until at most MAX_COLOURS remain."""
    counts = Counter(c for line in cells for c in line if c)
    palette = [list(c) for c, _ in counts.most_common()]
    weights = [n for _, n in counts.most_common()]
    def dist(a, b):
        return sum((p - q) ** 2 for p, q in zip(a, b))
    while len(palette) > MAX_COLOURS or any(dist(palette[i], palette[j]) < 900 for i in range(len(palette)) for j in range(i)):
        i, j = min(((i, j) for i in range(len(palette)) for j in range(i)), key=lambda ij: dist(palette[ij[0]], palette[ij[1]]) * min(weights[ij[0]], weights[ij[1]]))
        keep, drop = (i, j) if weights[i] >= weights[j] else (j, i)
        weights[keep] += weights[drop]
        del palette[drop], weights[drop]
    index = lambda c: min(range(len(palette)), key=lambda k: dist(palette[k], c))
    return ['#%02X%02X%02X' % tuple(min(255, v + 6) for v in c) for c in palette], [[(index(c) if c else -1) for c in line] for line in cells]


def centre(rows):
    h, w = len(rows), len(rows[0])
    if h > N or w > N:
        return None
    top, left = (N - h) // 2, (N - w) // 2
    out = [-1] * (N * N)
    for y, line in enumerate(rows):
        for x, v in enumerate(line):
            out[(top + y) * N + left + x] = v
    return out


def main():
    pics = []
    for name in sorted(os.listdir(SRC)):
        if not name.endswith('.png'):
            continue
        px = load(os.path.join(SRC, name))
        box = bbox(px)
        p, off = pitch(px, box)
        palette, rows = merge(fill_enclosed(grid(px, box, p, off)))
        g = centre(rows)
        if g is None:
            print(f'{name}: {len(rows[0])}x{len(rows)} does not fit the {N}x{N} board, skipped')
            continue
        label = name[:-4].replace('-', ' ').capitalize()
        pics.append({'name': label, 'palette': palette, 'grid': g})
        print(f'{label:14} {len(rows[0])}x{len(rows)}  pitch {p:.1f}  {len(palette)} colours  {sum(v >= 0 for v in g)} pixels')
    body = ',\n'.join(
        '        {name: %s, palette: %s, rows: %s}' % (json.dumps(p['name']), json.dumps(p['palette']),
            json.dumps([''.join('.' if v < 0 else str(v) for v in p['grid'][r * N:(r + 1) * N]) for r in range(N)]))
        for p in pics)
    js = f'''/**
 * Ant Picnic pictures, generated by tools/picnic-pixelize.py from assets/picnic/*.png.
 * Do not edit by hand: change or add a PNG and run the tool. Each row is N characters,
 * a palette index per pixel or "." for empty.
 */
(function (root) {{
    'use strict';

    const N = {N};
    const PICS = [
{body},
    ].map((p) => ({{name: p.name, palette: p.palette, grid: p.rows.join('').split('').map((c) => (c === '.' ? -1 : Number(c)))}}));

    root.PicnicPics = {{N, PICS}};
    if (typeof module !== 'undefined') module.exports = root.PicnicPics;
}})(typeof self !== 'undefined' ? self : globalThis);
'''
    open(OUT, 'w').write(js)
    print(f'{len(pics)} pictures written')


if __name__ == '__main__':
    main()
