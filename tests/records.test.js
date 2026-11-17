// 걸린 시간·별·도감 보상 로직 테스트
const test = require('node:test');
const assert = require('node:assert/strict');
const R = require('../records.js');
const E = require('../engine.js');

test('elapsedSeconds: 걸린 시간을 초로 (벌점 없이, 최소 1초)', () => {
    assert.equal(R.elapsedSeconds(83000), 83);
    assert.equal(R.elapsedSeconds(83600), 84); // 반올림
    assert.equal(R.elapsedSeconds(200), 1);
    assert.equal(R.elapsedSeconds(0), 1);
});

test('랭킹·기록 남기기 기능은 없다 (목표는 도감 모으기)', () => {
    const gone = ['finalSeconds', 'HINT_PENALTY', 'MISTAKE_PENALTY', 'sanitizeName', 'todayString',
        'makeEntry', 'isValidEntry', 'sameEntry', 'mergeEntries', 'rankBoard'];
    for (const k of gone) assert.equal(R[k], undefined, k);
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
