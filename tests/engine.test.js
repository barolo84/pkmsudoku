// 스도쿠 엔진 테스트 — `node --test tests/` 로 실행
const test = require('node:test');
const assert = require('node:assert/strict');
const E = require('../engine.js');

const SEEDS = [1, 2, 3, 7, 42, 99, 1234, 20261117];

// ---- 도우미 ----
function unitsValid(grid, size) {
    const { boxRows, boxCols } = E.layoutFor(size);
    const full = Array.from({ length: size }, (_, i) => i + 1).join(',');
    const sorted = idxs => idxs.map(i => grid[i]).sort((a, b) => a - b).join(',');
    for (let r = 0; r < size; r++) {
        const row = [], col = [];
        for (let c = 0; c < size; c++) { row.push(r * size + c); col.push(c * size + r); }
        if (sorted(row) !== full || sorted(col) !== full) return false;
    }
    for (let br = 0; br < size; br += boxRows) {
        for (let bc = 0; bc < size; bc += boxCols) {
            const box = [];
            for (let r = br; r < br + boxRows; r++)
                for (let c = bc; c < bc + boxCols; c++) box.push(r * size + c);
            if (sorted(box) !== full) return false;
        }
    }
    return true;
}
const blanksOf = grid => grid.filter(v => v === 0).length;

// ---- 판 구성 ----
test('판 구성: 4·6·9칸의 상자 모양', () => {
    assert.deepEqual(E.layoutFor(4), { size: 4, boxRows: 2, boxCols: 2 });
    assert.deepEqual(E.layoutFor(6), { size: 6, boxRows: 2, boxCols: 3 });
    assert.deepEqual(E.layoutFor(9), { size: 9, boxRows: 3, boxCols: 3 });
    assert.throws(() => E.layoutFor(5));
});

test('난이도: 7단계가 쉬운 순서로 정의되어 있다', () => {
    assert.deepEqual(E.LEVELS.map(l => l.id), ['a1', 'a2', 'b1', 'b2', 'c1', 'c2', 'c3']);
    assert.deepEqual(E.LEVELS.map(l => l.size), [4, 4, 6, 6, 9, 9, 9]);
    for (const l of E.LEVELS) {
        assert.ok(l.blanks > 0 && l.blanks < l.size * l.size, `${l.id} 빈칸 수`);
        assert.equal(E.getLevel(l.id), l);
    }
    // 같은 크기 안에서는 뒤 단계일수록 빈칸이 많다
    for (let i = 1; i < E.LEVELS.length; i++) {
        const a = E.LEVELS[i - 1], b = E.LEVELS[i];
        if (a.size === b.size) assert.ok(b.blanks > a.blanks, `${a.id} < ${b.id}`);
    }
    assert.equal(E.getLevel('zz'), undefined);
});

// ---- 난수 ----
test('makeRng: 같은 시드는 같은 수열, 다른 시드는 다른 수열', () => {
    const a = E.makeRng(5), b = E.makeRng(5), c = E.makeRng(6);
    const sa = [a(), a(), a()], sb = [b(), b(), b()], sc = [c(), c(), c()];
    assert.deepEqual(sa, sb);
    assert.notDeepEqual(sa, sc);
    for (const v of sa) assert.ok(v >= 0 && v < 1);
});

// ---- 완성판 생성 ----
test('generateSolved: 모든 가로줄·세로줄·상자에 1~N이 한 번씩', () => {
    for (const size of [4, 6, 9]) {
        for (const seed of SEEDS) {
            const g = E.generateSolved(size, E.makeRng(seed));
            assert.equal(g.length, size * size);
            assert.ok(unitsValid(g, size), `size ${size} seed ${seed}`);
        }
    }
});

// ---- 풀이 / 해 개수 ----
test('countSolutions: 빈 판은 해가 여러 개(상한에서 멈춤), 모순된 판은 0개', () => {
    assert.equal(E.countSolutions(new Array(16).fill(0), 4, 2), 2);
    const bad = new Array(16).fill(0);
    bad[0] = 1; bad[1] = 1; // 같은 가로줄에 1이 두 번
    assert.equal(E.countSolutions(bad, 4), 0);
});

test('solve: 풀 수 있는 판은 정답을, 모순된 판은 null을 돌려준다', () => {
    const solved = E.generateSolved(6, E.makeRng(11));
    const holes = solved.slice();
    holes[0] = 0; holes[7] = 0; holes[20] = 0;
    assert.deepEqual(E.solve(holes, 6), solved);
    const bad = new Array(16).fill(0);
    bad[0] = 2; bad[4] = 2; // 같은 세로줄
    assert.equal(E.solve(bad, 4), null);
    // 입력은 바뀌지 않는다
    assert.equal(holes[0], 0);
});

// ---- 퍼즐 생성 ----
test('generatePuzzle: 단계별 빈칸 수가 정확하고, 주어진 칸은 정답과 일치', () => {
    for (const level of E.LEVELS) {
        for (const seed of SEEDS) {
            const p = E.generatePuzzle(level.id, E.makeRng(seed));
            assert.equal(p.level, level.id);
            assert.equal(p.size, level.size);
            assert.equal(p.puzzle.length, level.size ** 2);
            assert.ok(unitsValid(p.solution, level.size), `${level.id}/${seed} 정답판`);
            assert.equal(blanksOf(p.puzzle), level.blanks, `${level.id}/${seed} 빈칸 수`);
            p.puzzle.forEach((v, i) => { if (v) assert.equal(v, p.solution[i]); });
        }
    }
});

test('generatePuzzle: 해가 정확히 하나', () => {
    for (const level of E.LEVELS) {
        for (const seed of SEEDS.slice(0, 5)) {
            const p = E.generatePuzzle(level.id, E.makeRng(seed));
            assert.equal(E.countSolutions(p.puzzle, p.size, 2), 1, `${level.id}/${seed}`);
            assert.deepEqual(E.solve(p.puzzle, p.size), p.solution);
        }
    }
});

test('generatePuzzle: 찍지 않고 "하나뿐인 자리" 추론만으로 끝까지 풀린다', () => {
    for (const level of E.LEVELS) {
        for (const seed of SEEDS) {
            const p = E.generatePuzzle(level.id, E.makeRng(seed));
            const r = E.solveBySingles(p.puzzle, p.size);
            assert.equal(r.solved, true, `${level.id}/${seed}`);
            assert.deepEqual(r.grid, p.solution);
        }
    }
});

test('generatePuzzle: 같은 시드는 같은 퍼즐, 다른 시드는 다른 퍼즐', () => {
    const a = E.generatePuzzle('c1', E.makeRng(77));
    const b = E.generatePuzzle('c1', E.makeRng(77));
    const c = E.generatePuzzle('c1', E.makeRng(78));
    assert.deepEqual(a, b);
    assert.notDeepEqual(a.puzzle, c.puzzle);
    assert.throws(() => E.generatePuzzle('zz', E.makeRng(1)));
});

test('generatePuzzle: 9칸 어려움도 1초 안에 만들어진다', () => {
    const t0 = Date.now();
    for (let s = 0; s < 5; s++) E.generatePuzzle('c3', E.makeRng(500 + s));
    assert.ok((Date.now() - t0) / 5 < 1000, `평균 ${(Date.now() - t0) / 5}ms`);
});

// ---- 후보 / 충돌 ----
//  고정 4칸 판 (정답)
//   1 2 | 3 4
//   3 4 | 1 2
//   ----+----
//   2 1 | 4 3
//   4 3 | 2 1
const S4 = [1, 2, 3, 4, 3, 4, 1, 2, 2, 1, 4, 3, 4, 3, 2, 1];

test('candidates: 빈칸에 놓을 수 있는 값만 돌려준다', () => {
    const g = S4.slice();
    g[0] = 0;
    assert.deepEqual(E.candidates(g, 4, 0), [1]);
    g[1] = 0; g[4] = 0; g[5] = 0; g[8] = 0; // 왼쪽 위 상자 전체 + 세로줄의 2도 비움
    // 가로줄에 3·4, 세로줄에 4만 남음 → 1 또는 2
    assert.deepEqual(E.candidates(g, 4, 0), [1, 2]);
    // 이미 채워진 칸은 후보가 없다
    assert.deepEqual(E.candidates(g, 4, 2), []);
});

test('conflictsFor: 왜 틀렸는지 — 같은 줄/상자에서 겹치는 칸을 알려준다', () => {
    const g = S4.slice();
    g[0] = 0;
    // (0,0)에 3을 놓으면: 가로줄의 (0,2), 세로줄의 (1,0)과 겹친다. (1,0)은 같은 상자이기도 하다.
    const hits = E.conflictsFor(g, 4, 0, 3);
    const key = h => `${h.idx}:${h.unit}`;
    assert.deepEqual(hits.map(key).sort(), ['2:row', '4:box', '4:col'].sort());
    // 겹치지 않는 값은 빈 배열
    assert.deepEqual(E.conflictsFor(g, 4, 0, 1), []);
});

test('findConflicts: 겹친 칸들의 위치 집합', () => {
    const g = S4.slice();
    assert.equal(E.findConflicts(g, 4).size, 0);
    g[0] = 2; // (0,1)의 2와 가로줄·상자에서, (2,0)의 2와 세로줄에서 겹침
    assert.deepEqual([...E.findConflicts(g, 4)].sort((a, b) => a - b), [0, 1, 8]);
});

test('isComplete: 다 채워지고 겹침이 없을 때만 true', () => {
    assert.equal(E.isComplete(S4, 4), true);
    const hole = S4.slice(); hole[5] = 0;
    assert.equal(E.isComplete(hole, 4), false);
    const wrong = S4.slice(); wrong[0] = 2;
    assert.equal(E.isComplete(wrong, 4), false);
});

// ---- 완성된 줄/상자 (축하 연출용) ----
test('completedUnits: 방금 채운 칸이 완성시킨 가로줄·세로줄·상자', () => {
    const g = S4.slice();
    g[3] = 0; g[15] = 0; // 마지막 세로줄에 빈칸 2개
    g[3] = 4;            // (0,3)을 채움 → 첫 가로줄과 오른쪽 위 상자는 완성, 세로줄은 아직
    const done = E.completedUnits(g, 4, 3);
    assert.deepEqual(done.map(u => u.type).sort(), ['box', 'row']);
    const row = done.find(u => u.type === 'row');
    assert.deepEqual(row.cells, [0, 1, 2, 3]);
    const box = done.find(u => u.type === 'box');
    assert.deepEqual(box.cells, [2, 3, 6, 7]);
});

// ---- 힌트 ----
test('nextHint: 빈칸 하나와 그 정답을 알려준다', () => {
    for (const level of ['a1', 'b2', 'c2']) {
        const p = E.generatePuzzle(level, E.makeRng(3));
        const h = E.nextHint(p.puzzle, p.size, p.solution);
        assert.equal(p.puzzle[h.idx], 0);
        assert.equal(h.value, p.solution[h.idx]);
        assert.ok(['naked', 'row', 'col', 'box'].includes(h.reason), h.reason);
    }
});

test('nextHint: 후보가 하나뿐인 칸(naked)을 먼저 고른다', () => {
    const g = S4.slice();
    g[0] = 0;
    assert.deepEqual(E.nextHint(g, 4, S4), { idx: 0, value: 1, reason: 'naked' });
});

test('nextHint: 알려주는 이유(reason)가 실제 판 상태와 맞는다', () => {
    let sawNaked = false, sawUnit = false;
    for (let seed = 1; seed <= 12; seed++) {
        const p = E.generatePuzzle('c3', E.makeRng(seed));
        const g = p.puzzle.slice();
        for (let h; (h = E.nextHint(g, p.size, p.solution));) {
            const empties = g.map((v, i) => (v === 0 ? i : -1)).filter(i => i >= 0);
            if (h.reason === 'naked') {
                sawNaked = true;
                assert.deepEqual(E.candidates(g, p.size, h.idx), [h.value]);
            } else {
                sawUnit = true;
                // 후보가 하나뿐인 칸이 있었다면 그쪽을 먼저 골랐어야 한다
                assert.ok(empties.every(i => E.candidates(g, p.size, i).length !== 1));
                // 그 줄(상자) 안에서 이 값이 들어갈 수 있는 빈칸은 여기 하나뿐
                const unit = E.unitsOf(p.size, h.idx)[h.reason];
                const spots = unit.filter(i => g[i] === 0 && E.candidates(g, p.size, i).includes(h.value));
                assert.deepEqual(spots, [h.idx]);
            }
            g[h.idx] = h.value;
        }
    }
    assert.ok(sawNaked && sawUnit, '두 종류의 힌트가 모두 나와야 한다');
});

test('unitsOf: 칸이 속한 가로줄·세로줄·상자의 칸 목록', () => {
    // 6칸 판(상자 2×3)의 (3,4) = idx 22
    const u = E.unitsOf(6, 22);
    assert.deepEqual(u.row, [18, 19, 20, 21, 22, 23]);
    assert.deepEqual(u.col, [4, 10, 16, 22, 28, 34]);
    assert.deepEqual(u.box, [15, 16, 17, 21, 22, 23]);
});

test('nextHint: 빈칸이 없으면 null', () => {
    assert.equal(E.nextHint(S4, 4, S4), null);
});

test('nextHint: 힌트를 계속 따라가면 퍼즐이 끝까지 풀린다', () => {
    const p = E.generatePuzzle('c3', E.makeRng(9));
    const g = p.puzzle.slice();
    let steps = 0;
    for (let h; (h = E.nextHint(g, p.size, p.solution)); steps++) {
        g[h.idx] = h.value;
        assert.ok(steps < 81);
    }
    assert.deepEqual(g, p.solution);
    assert.equal(steps, E.getLevel('c3').blanks);
});
