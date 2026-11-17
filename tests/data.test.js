// 도감·난이도별 포켓몬 묶음·팀 데이터의 규칙 테스트
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const D = require('../data.js');
const E = require('../engine.js');
const R = require('../records.js');

const LEVEL_IDS = E.LEVELS.map(l => l.id);
const allPoolIds = () => LEVEL_IDS.flatMap(id => D.POOLS[id]);
const imagePath = id => path.join(__dirname, '..', 'images', id + '.webp');

test('도감은 100마리이고, 모두 이름과 이미지가 있다', () => {
    const ids = Object.keys(D.POKEMON).map(Number);
    assert.equal(ids.length, 100);
    for (const id of ids) {
        assert.ok(typeof D.POKEMON[id] === 'string' && D.POKEMON[id].length > 0, `이름 ${id}`);
        assert.ok(fs.existsSync(imagePath(id)), `이미지 ${id}`);
    }
    // 안 쓰는 이미지가 남아 있지 않다
    const files = fs.readdirSync(path.join(__dirname, '..', 'images')).filter(f => f.endsWith('.webp'));
    assert.equal(files.length, 100);
});

test('난이도마다 얻을 수 있는 포켓몬이 정해져 있다 — 겹치지 않고, 합치면 도감 전체', () => {
    assert.deepEqual(Object.keys(D.POOLS), LEVEL_IDS);
    const all = allPoolIds();
    assert.equal(new Set(all).size, all.length, '두 난이도에 겹치는 포켓몬이 있다');
    assert.deepEqual([...all].sort((a, b) => a - b), Object.keys(D.POKEMON).map(Number).sort((a, b) => a - b));
});

test('난이도마다 14~15마리 (한 판 보상보다 넉넉하다)', () => {
    for (const l of E.LEVELS) {
        const n = D.POOLS[l.id].length;
        assert.ok(n >= 14 && n <= 15, `${l.id}: ${n}`);
        assert.ok(n >= R.rewardCount(l.size));
    }
});

test('전설의 포켓몬은 가장 어려운 판에서만 얻는다', () => {
    const hardest = LEVEL_IDS[LEVEL_IDS.length - 1];
    //             프리져 썬더 파이어 뮤츠 뮤  루기아 칠색조 세레비 가이오가 그란돈 레쿠쟈 지라치 디아루가 펄기아 아르세우스
    const legends = [144, 145, 146, 150, 151, 249, 250, 251, 382, 383, 384, 385, 483, 484, 493];
    assert.deepEqual([...D.POOLS[hardest]].sort((a, b) => a - b), legends);
    const team = D.TEAMS.find(t => t.id === 'legend');
    for (const id of team.members) assert.ok(D.POOLS[hardest].includes(id), `전설 팀 ${id}`);
    // 4칸 판에는 전설이 하나도 없다
    for (const id of [...D.POOLS.a1, ...D.POOLS.a2]) assert.ok(!legends.includes(id));
});

test('팀(판에 붙이는 스티커)은 9마리씩이고 모두 도감에 있는 친구', () => {
    assert.equal(D.TEAMS.length, 8);
    for (const t of D.TEAMS) {
        assert.equal(t.members.length, 9, t.id);
        assert.equal(new Set(t.members).size, 9, t.id);
        for (const id of t.members) assert.ok(D.POKEMON[id], `${t.id}: ${id}`);
    }
    const ids = D.TEAMS.map(t => t.id);
    assert.equal(new Set(ids).size, ids.length);
});

test('난이도·판 크기 표시 이름이 모두 있다', () => {
    for (const l of E.LEVELS) {
        assert.ok(D.LEVEL_INFO[l.id].name);
        assert.ok(D.SIZE_INFO[l.size].label);
    }
    assert.deepEqual(LEVEL_IDS.map(id => D.LEVEL_INFO[id].lv), [1, 2, 3, 4, 5, 6, 7]);
});

test('어떤 판을 깨도 그 판 묶음의 친구만 붙고, 다 모으면 더 나오지 않는다', () => {
    for (const l of E.LEVELS) {
        const pool = D.POOLS[l.id], count = R.rewardCount(l.size), rng = E.makeRng(l.size * 31 + pool.length);
        const caught = [25]; // 다른 판의 친구를 이미 갖고 있어도 상관없다
        let clears = 0;
        for (; ; clears++) {
            const got = R.pickRewards(pool, caught, count, rng, D.TEAMS[clears % D.TEAMS.length].members);
            if (!got.length) break;
            for (const id of got) {
                assert.ok(pool.includes(id), `${l.id}: 다른 판의 포켓몬 ${id}`);
                assert.ok(!caught.includes(id) || id === 25 && l.id !== 'a1', `${l.id}: 중복 ${id}`);
                caught.push(id);
            }
            assert.ok(clears < 40);
        }
        const mine = pool.filter(id => caught.includes(id)).length;
        assert.equal(mine, pool.length);
        assert.equal(clears, Math.ceil((pool.length - (pool.includes(25) ? 1 : 0)) / count), `${l.id} 판 수`);
    }
});
