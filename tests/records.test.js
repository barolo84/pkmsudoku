// 기록·랭킹·도감 보상 로직 테스트
const test = require('node:test');
const assert = require('node:assert/strict');
const R = require('../records.js');
const E = require('../engine.js');

test('finalSeconds: 걸린 시간 + 힌트 15초 + 실수 5초', () => {
    assert.equal(R.finalSeconds(83, 0, 0), 83);
    assert.equal(R.finalSeconds(83, 2, 3), 83 + 30 + 15);
    assert.equal(R.finalSeconds(83.6, 0, 0), 84); // 반올림
    assert.equal(R.finalSeconds(0.2, 0, 0), 1);   // 최소 1초
    assert.equal(R.finalSeconds(999999, 0, 0), R.MAX_SECONDS);
});

test('formatTime: 분:초', () => {
    assert.equal(R.formatTime(0), '0:00');
    assert.equal(R.formatTime(7), '0:07');
    assert.equal(R.formatTime(83), '1:23');
    assert.equal(R.formatTime(600), '10:00');
    assert.equal(R.formatTime(3725), '62:05');
});

test('stars: 힌트·실수 없이 풀면 별 3개', () => {
    assert.equal(R.stars(0, 0), 3);
    assert.equal(R.stars(1, 0), 2);
    assert.equal(R.stars(1, 2), 2);
    assert.equal(R.stars(2, 2), 1);
    assert.equal(R.stars(0, 9), 1);
});

test('sanitizeName: 공백 정리, 12자 제한, 비면 기본 이름', () => {
    assert.equal(R.sanitizeName('  지우  '), '지우');
    assert.equal(R.sanitizeName(''), R.DEFAULT_NAME);
    assert.equal(R.sanitizeName('   '), R.DEFAULT_NAME);
    assert.equal(R.sanitizeName(null), R.DEFAULT_NAME);
    assert.equal(R.sanitizeName('가나다라마바사아자차카타파하'), '가나다라마바사아자차카타');
    assert.equal(R.sanitizeName('a\nb\tc'), 'a b c');
    // 이모지(서로게이트 쌍)를 반으로 자르지 않는다
    const cut = R.sanitizeName('🐱'.repeat(20));
    assert.ok(cut.length <= 12);
    assert.equal(cut, '🐱'.repeat(6));
});

test('makeEntry / isValidEntry: 서버 규칙과 같은 형식', () => {
    const e = R.makeEntry({ name: ' 피카 ', seconds: 95, level: 'b1', hints: 1, date: new Date(2026, 10, 17, 3, 0) });
    assert.deepEqual(e, { n: '피카', s: 95, l: 'b1', h: 1, d: '2026-11-17' });
    assert.equal(R.isValidEntry(e), true);
    // 힌트 수는 99에서 멈춘다
    assert.equal(R.makeEntry({ name: 'a', seconds: 5, level: 'a1', hints: 500, date: new Date() }).h, 99);

    assert.equal(R.isValidEntry({ ...e, n: '' }), false);
    assert.equal(R.isValidEntry({ ...e, n: 'x'.repeat(13) }), false);
    assert.equal(R.isValidEntry({ ...e, s: 0 }), false);
    assert.equal(R.isValidEntry({ ...e, s: 1.5 }), false);
    assert.equal(R.isValidEntry({ ...e, s: R.MAX_SECONDS + 1 }), false);
    assert.equal(R.isValidEntry({ ...e, l: 'zz' }), false);
    assert.equal(R.isValidEntry({ ...e, h: -1 }), false);
    assert.equal(R.isValidEntry({ ...e, d: '2026/11/17' }), false);
    assert.equal(R.isValidEntry({ ...e, extra: 1 }), false);
    assert.equal(R.isValidEntry(null), false);
    // 모든 난이도 id가 허용된다
    for (const l of E.LEVELS) assert.equal(R.isValidEntry({ ...e, l: l.id }), true);
});

test('todayString: 기기 현지 날짜 (UTC 아님)', () => {
    assert.equal(R.todayString(new Date(2026, 0, 5, 0, 30)), '2026-01-05');
    assert.equal(R.todayString(new Date(2026, 11, 31, 23, 59)), '2026-12-31');
});

const mk = (n, s, l = 'a1', d = '2026-11-17', h = 0) => ({ n, s, l, h, d });

test('rankBoard: 해당 난이도만, 빠른 순서, 상위 10개', () => {
    const entries = [mk('느림', 300), mk('빠름', 20), mk('다른판', 5, 'c1'), mk('중간', 100)];
    const board = R.rankBoard(entries, 'a1');
    assert.deepEqual(board.map(r => r.n), ['빠름', '중간', '느림']);
    assert.deepEqual(board.map(r => r.rank), [1, 2, 3]);

    const many = Array.from({ length: 25 }, (_, i) => mk('p' + i, 10 + i));
    assert.equal(R.rankBoard(many, 'a1').length, 10);
    assert.equal(R.rankBoard(many, 'a1', 3).length, 3);
    assert.deepEqual(R.rankBoard([], 'a1'), []);
});

test('rankBoard: 동점은 공동 순위, 다음 순위는 건너뛴다 (1, 1, 3)', () => {
    const board = R.rankBoard([mk('가', 30), mk('나', 30), mk('다', 45), mk('라', 45), mk('마', 60)], 'a1');
    assert.deepEqual(board.map(r => r.rank), [1, 1, 3, 3, 5]);
});

test('rankBoard: 동점이면 먼저 세운 기록이 위', () => {
    const board = R.rankBoard([mk('나중', 30, 'a1', '2026-11-18'), mk('먼저', 30, 'a1', '2026-11-01')], 'a1');
    assert.deepEqual(board.map(r => r.n), ['먼저', '나중']);
});

test('rankBoard: 형식이 깨진 기록은 무시하고 원본을 바꾸지 않는다', () => {
    const entries = [mk('정상', 50), { n: '깨짐', s: 'abc', l: 'a1', h: 0, d: '2026-11-17' }, null];
    const copy = JSON.parse(JSON.stringify(entries));
    assert.deepEqual(R.rankBoard(entries, 'a1').map(r => r.n), ['정상']);
    assert.deepEqual(entries, copy);
});

test('mergeEntries: 서버 기록 + 기기 기록을 합치고 같은 기록은 한 번만', () => {
    const remote = [mk('가', 30), mk('나', 40)];
    const local = [mk('나', 40), mk('다', 50)];
    assert.deepEqual(R.mergeEntries(remote, local).map(r => r.n), ['가', '나', '다']);
    // 기기 전용 표시(p)가 붙어 있어도 같은 기록으로 본다
    assert.equal(R.mergeEntries([mk('가', 30)], [{ ...mk('가', 30), p: 1 }]).length, 1);
});

test('sameEntry: 이름·기록·난이도·날짜가 같으면 같은 기록', () => {
    assert.equal(R.sameEntry(mk('가', 30), { ...mk('가', 30), p: 1 }), true);
    assert.equal(R.sameEntry(mk('가', 30), mk('가', 31)), false);
    assert.equal(R.sameEntry(mk('가', 30), null), false);
});

test('rewardCount: 큰 판일수록 친구를 더 많이', () => {
    assert.equal(R.rewardCount(4), 1);
    assert.equal(R.rewardCount(6), 2);
    assert.equal(R.rewardCount(9), 3);
});

test('pickRewards: 아직 없는 친구 중에서, 함께 논 팀을 먼저', () => {
    const roster = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const rng = E.makeRng(1);
    // 팀 [1,2,3] 중 1은 이미 있음 → 2,3이 먼저 뽑힌다
    const got = R.pickRewards(roster, [1], 2, rng, [1, 2, 3]);
    assert.deepEqual(got.slice().sort(), [2, 3]);
    // 팀을 다 모았으면 나머지에서 뽑는다
    const got2 = R.pickRewards(roster, [1, 2, 3], 2, rng, [1, 2, 3]);
    assert.equal(got2.length, 2);
    for (const id of got2) assert.ok(id >= 4 && id <= 10);
    assert.equal(new Set(got2).size, 2);
    // 팀에서 1마리만 남았으면 1마리는 팀에서, 나머지는 다른 데서
    const got3 = R.pickRewards(roster, [1, 2], 3, rng, [1, 2, 3]);
    assert.equal(got3.length, 3);
    assert.ok(got3.includes(3));
    assert.equal(new Set(got3).size, 3);
});

test('pickRewards: 남은 친구가 모자라면 있는 만큼만, 다 모았으면 빈 배열', () => {
    const rng = E.makeRng(2);
    assert.deepEqual(R.pickRewards([1, 2, 3], [1, 2], 3, rng, []), [3]);
    assert.deepEqual(R.pickRewards([1, 2, 3], [1, 2, 3], 2, rng, [1]), []);
});

test('pickRewards: 같은 시드면 같은 결과, 여러 번 뽑으면 골고루 나온다', () => {
    const roster = Array.from({ length: 20 }, (_, i) => i + 1);
    assert.deepEqual(R.pickRewards(roster, [], 3, E.makeRng(5), []), R.pickRewards(roster, [], 3, E.makeRng(5), []));
    const seen = new Set();
    for (let s = 0; s < 200; s++) R.pickRewards(roster, [], 1, E.makeRng(s), []).forEach(id => seen.add(id));
    assert.equal(seen.size, 20);
});
