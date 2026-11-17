// 스도쿠 엔진 — 화면과 무관한 순수 로직 (브라우저: window.SudokuEngine, Node: require)
// 판은 길이 size*size의 1차원 배열, 값은 1..size, 빈칸은 0.
(function (root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory();
    else root.SudokuEngine = factory();
}(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    const LAYOUTS = {
        4: { size: 4, boxRows: 2, boxCols: 2 },
        6: { size: 6, boxRows: 2, boxCols: 3 },
        9: { size: 9, boxRows: 3, boxCols: 3 },
    };

    // id는 랭킹 저장 키로 쓰이므로 바꾸지 말 것.
    // 모든 단계는 "하나뿐인 자리" 추론만으로 풀리도록 만든다 (찍기 불필요).
    const LEVELS = [
        { id: 'a1', size: 4, blanks: 6 },
        { id: 'a2', size: 4, blanks: 9 },
        { id: 'b1', size: 6, blanks: 14 },
        { id: 'b2', size: 6, blanks: 20 },
        { id: 'c1', size: 9, blanks: 36 },
        { id: 'c2', size: 9, blanks: 45 },
        { id: 'c3', size: 9, blanks: 52 },
    ];

    const UNIT_TYPES = ['row', 'col', 'box'];
    const MAX_ATTEMPTS = 60; // 목표 빈칸 수에 못 미치면 새 완성판으로 다시 시도

    function layoutFor(size) {
        const l = LAYOUTS[size];
        if (!l) throw new Error('지원하지 않는 판 크기: ' + size);
        return l;
    }

    function getLevel(id) {
        return LEVELS.find(l => l.id === id);
    }

    // ---- 판의 모양(줄·상자 구성) — 크기별로 한 번만 계산 ----
    const geoCache = {};
    function geo(size) {
        if (geoCache[size]) return geoCache[size];
        const { boxRows, boxCols } = layoutFor(size);
        const boxesAcross = size / boxCols;
        const lines = () => Array.from({ length: size }, () => []);
        const cells = { row: lines(), col: lines(), box: lines() };
        const of = { row: [], col: [], box: [] };
        for (let i = 0; i < size * size; i++) {
            const r = Math.floor(i / size), c = i % size;
            of.row[i] = r;
            of.col[i] = c;
            of.box[i] = Math.floor(r / boxRows) * boxesAcross + Math.floor(c / boxCols);
            for (const t of UNIT_TYPES) cells[t][of[t][i]].push(i);
        }
        const units = [];
        for (const t of UNIT_TYPES) for (const list of cells[t]) units.push({ type: t, cells: list });
        const g = { size, n: size * size, cells, of, units, full: ((1 << (size + 1)) - 1) & ~1 };
        geoCache[size] = g;
        return g;
    }

    function unitsOf(size, idx) {
        const G = geo(size);
        const out = {};
        for (const t of UNIT_TYPES) out[t] = G.cells[t][G.of[t][idx]].slice();
        return out;
    }

    // ---- 비트마스크: 줄·상자마다 이미 쓰인 값 ----
    function masksOf(grid, G) {
        const m = { row: new Array(G.size).fill(0), col: new Array(G.size).fill(0), box: new Array(G.size).fill(0) };
        for (let i = 0; i < G.n; i++) if (grid[i]) mark(m, G, i, grid[i]);
        return m;
    }
    function mark(m, G, i, v) {
        const bit = 1 << v;
        m.row[G.of.row[i]] |= bit; m.col[G.of.col[i]] |= bit; m.box[G.of.box[i]] |= bit;
    }
    function unmark(m, G, i, v) {
        const bit = ~(1 << v);
        m.row[G.of.row[i]] &= bit; m.col[G.of.col[i]] &= bit; m.box[G.of.box[i]] &= bit;
    }
    function candMask(m, G, i) {
        return G.full & ~(m.row[G.of.row[i]] | m.col[G.of.col[i]] | m.box[G.of.box[i]]);
    }
    const isSingleBit = x => x !== 0 && (x & (x - 1)) === 0;
    const bitValue = x => 31 - Math.clz32(x);
    function maskToValues(mask, size) {
        const out = [];
        for (let v = 1; v <= size; v++) if (mask & (1 << v)) out.push(v);
        return out;
    }

    function candidates(grid, size, idx) {
        if (grid[idx]) return [];
        const G = geo(size);
        return maskToValues(candMask(masksOf(grid, G), G, idx), size);
    }

    // ---- 난수 ----
    function makeRng(seed) { // mulberry32
        let a = seed >>> 0;
        return function () {
            a = (a + 0x6D2B79F5) >>> 0;
            let t = a;
            t = Math.imul(t ^ (t >>> 15), t | 1);
            t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
    }
    function shuffle(arr, rng) {
        for (let i = arr.length - 1; i > 0; i--) {
            const j = Math.floor(rng() * (i + 1));
            [arr[i], arr[j]] = [arr[j], arr[i]];
        }
        return arr;
    }

    // ---- 충돌 ----
    function findConflicts(grid, size) {
        const G = geo(size), bad = new Set();
        for (const u of G.units) {
            const seen = {};
            for (const i of u.cells) {
                const v = grid[i];
                if (!v) continue;
                if (seen[v] !== undefined) { bad.add(i); bad.add(seen[v]); }
                else seen[v] = i;
            }
        }
        return bad;
    }

    function conflictsFor(grid, size, idx, val) {
        const G = geo(size), hits = [];
        for (const t of UNIT_TYPES)
            for (const i of G.cells[t][G.of[t][idx]])
                if (i !== idx && grid[i] === val) hits.push({ idx: i, unit: t });
        return hits;
    }

    function isComplete(grid, size) {
        return grid.every(v => v > 0) && findConflicts(grid, size).size === 0;
    }

    function completedUnits(grid, size, idx) {
        const G = geo(size), done = [];
        for (const t of UNIT_TYPES) {
            const list = G.cells[t][G.of[t][idx]];
            if (list.every(i => grid[i] > 0)) done.push({ type: t, cells: list.slice() });
        }
        return done;
    }

    // ---- 되추적 풀이 (후보가 가장 적은 칸부터) ----
    // pickOrder: 후보 값 배열을 받아 시도할 순서를 돌려준다. onSolution이 true를 돌려주면 탐색 중단.
    function search(g, G, m, onSolution, pickOrder) {
        let best = -1, bestMask = 0, bestCount = 99;
        for (let i = 0; i < G.n; i++) {
            if (g[i]) continue;
            const cm = candMask(m, G, i);
            if (cm === 0) return false;
            let count = 0;
            for (let x = cm; x; x &= x - 1) count++;
            if (count < bestCount) { best = i; bestMask = cm; bestCount = count; if (count === 1) break; }
        }
        if (best < 0) return onSolution(g);
        let values = maskToValues(bestMask, G.size);
        if (pickOrder) values = pickOrder(values);
        for (const v of values) {
            g[best] = v; mark(m, G, best, v);
            const stop = search(g, G, m, onSolution, pickOrder);
            g[best] = 0; unmark(m, G, best, v);
            if (stop) return true;
        }
        return false;
    }

    function countSolutions(grid, size, limit = 2) {
        if (findConflicts(grid, size).size) return 0;
        const G = geo(size), g = grid.slice();
        let count = 0;
        search(g, G, masksOf(g, G), () => ++count >= limit);
        return count;
    }

    function solve(grid, size) {
        if (findConflicts(grid, size).size) return null;
        const G = geo(size), g = grid.slice();
        let found = null;
        search(g, G, masksOf(g, G), s => { found = s.slice(); return true; });
        return found;
    }

    function generateSolved(size, rng) {
        const G = geo(size), g = new Array(G.n).fill(0);
        let out = null;
        search(g, G, masksOf(g, G), s => { out = s.slice(); return true; }, vals => shuffle(vals, rng));
        return out;
    }

    // ---- "하나뿐인 자리" 추론 ----
    // 다음에 확실히 채울 수 있는 칸들을 찾는다.
    //  naked: 그 칸에 올 수 있는 값이 하나뿐
    //  row/col/box: 그 줄(상자)에서 어떤 값이 갈 수 있는 칸이 하나뿐
    function nakedSingles(g, G, m) {
        const out = [];
        for (let i = 0; i < G.n; i++) {
            if (g[i]) continue;
            const cm = candMask(m, G, i);
            if (isSingleBit(cm)) out.push({ idx: i, value: bitValue(cm), reason: 'naked' });
        }
        return out;
    }
    function hiddenSingles(g, G, m) {
        const out = [];
        for (const u of G.units) {
            const used = m[u.type][G.of[u.type][u.cells[0]]];
            for (let v = 1; v <= G.size; v++) {
                const bit = 1 << v;
                if (used & bit) continue;
                let spot = -1, count = 0;
                for (const i of u.cells) {
                    if (!g[i] && (candMask(m, G, i) & bit)) { spot = i; if (++count > 1) break; }
                }
                if (count === 1) out.push({ idx: spot, value: v, reason: u.type });
            }
        }
        return out;
    }

    function solveBySingles(grid, size) {
        const G = geo(size), g = grid.slice(), m = masksOf(g, G);
        for (;;) {
            let steps = nakedSingles(g, G, m);
            if (!steps.length) steps = hiddenSingles(g, G, m);
            if (!steps.length) break;
            for (const s of steps) {
                if (g[s.idx]) continue; // 같은 칸이 두 번 잡힌 경우
                if (!(candMask(m, G, s.idx) & (1 << s.value))) return { solved: false, grid: g }; // 모순
                g[s.idx] = s.value; mark(m, G, s.idx, s.value);
            }
        }
        return { solved: g.every(v => v > 0), grid: g };
    }

    // 힌트: 아이가 찾기 쉬운(주변이 많이 채워진) 칸을 고른다.
    function nextHint(grid, size, solution) {
        const firstEmpty = grid.indexOf(0);
        if (firstEmpty < 0) return null;
        const G = geo(size), m = masksOf(grid, G);
        const filledAround = (i, types) => {
            let c = 0;
            for (const t of types) for (const j of G.cells[t][G.of[t][i]]) if (grid[j]) c++;
            return c;
        };
        const easiest = (steps, typesOf) => {
            let best = null, bestScore = -1;
            for (const s of steps) {
                const score = filledAround(s.idx, typesOf(s));
                if (score > bestScore) { best = s; bestScore = score; }
            }
            return best;
        };
        const naked = nakedSingles(grid, G, m);
        if (naked.length) return easiest(naked, () => UNIT_TYPES);
        const hidden = hiddenSingles(grid, G, m);
        if (hidden.length) return easiest(hidden, s => [s.reason]);
        return { idx: firstEmpty, value: solution[firstEmpty], reason: 'solution' };
    }

    // ---- 퍼즐 생성: 완성판에서 칸을 하나씩 비우되, 추론으로 풀리는 동안만 ----
    function generatePuzzle(levelId, rng) {
        const level = getLevel(levelId);
        if (!level) throw new Error('알 수 없는 난이도: ' + levelId);
        const { size, blanks: target } = level;
        let best = null;
        for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
            const solution = generateSolved(size, rng);
            const puzzle = solution.slice();
            const order = shuffle(Array.from({ length: size * size }, (_, i) => i), rng);
            let blanks = 0;
            for (const i of order) {
                if (blanks === target) break;
                const keep = puzzle[i];
                puzzle[i] = 0;
                if (solveBySingles(puzzle, size).solved) blanks++;
                else puzzle[i] = keep;
            }
            if (!best || blanks > best.blanks) best = { puzzle, solution, blanks };
            if (blanks === target) break;
        }
        return { level: level.id, size, puzzle: best.puzzle, solution: best.solution };
    }

    return {
        LEVELS, getLevel, layoutFor, unitsOf, makeRng, shuffle,
        candidates, findConflicts, conflictsFor, isComplete, completedUnits,
        countSolutions, solve, solveBySingles, nextHint,
        generateSolved, generatePuzzle,
    };
}));
