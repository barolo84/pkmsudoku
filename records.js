// 걸린 시간·별·틀려도 되는 횟수·도감 보상(반짝이 포함) — 화면과 무관한 순수 로직
// (브라우저: window.SudokuRecords, Node: require)
(function (root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory(require('./engine.js'));
    else root.SudokuRecords = factory(root.SudokuEngine);
}(typeof self !== 'undefined' ? self : this, function (Engine) {
    'use strict';

    const REWARDS_BY_SIZE = { 4: 1, 6: 1, 9: 1 };  // 한 판을 완성하면 도감에 붙는 수 (어떤 판이든 한 마리)
    const HINTS_BY_SIZE = { 4: 2, 6: 3, 9: 5 };   // 한 판에 쓸 수 있는 힌트 수

    function elapsedSeconds(ms) {
        return Math.max(1, Math.round(ms / 1000));
    }

    function formatTime(sec) {
        const s = Math.max(0, Math.round(sec));
        return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
    }

    // 힌트·실수 없이 풀면 3개, 합쳐서 3번 이하면 2개
    function stars(hints, mistakes) {
        const slips = hints + mistakes;
        return slips === 0 ? 3 : slips <= 3 ? 2 : 1;
    }

    function hintLimit(size) {
        return HINTS_BY_SIZE[size] || 0;
    }

    function rewardCount(size) {
        return REWARDS_BY_SIZE[size] || 1;
    }

    // 틀려도 되는 횟수 = 그 판의 빈칸 수. 0번 남아도 아직 괜찮고, 그보다 더 틀리면(음수) 포켓몬이 도망간다.
    function chancesLeft(blanks, mistakes) {
        return blanks - mistakes;
    }

    function canCatch(blanks, mistakes) {
        return mistakes <= blanks;
    }

    // 도감 보상: 아직 없는 친구 중에서 뽑되, 방금 함께 논 팀(prefer)을 먼저
    function pickRewards(roster, caught, count, rng, prefer = []) {
        const have = new Set(caught), fav = new Set(prefer);
        const left = roster.filter(id => !have.has(id));
        const first = Engine.shuffle(left.filter(id => fav.has(id)), rng);
        const rest = Engine.shuffle(left.filter(id => !fav.has(id)), rng);
        return first.concat(rest).slice(0, count);
    }

    // 한 판을 끝냈을 때 도감에 생기는 일 (pool = 이 난이도에서 얻을 수 있는 친구들)
    //  - 빈칸 수보다 많이 틀렸으면 포켓몬이 도망가서 아무것도 없다
    //  - 아직 없는 친구가 붙는다. 별 3개(힌트·실수 없음)면 그 친구는 반짝이
    //  - 이 판 친구를 다 모았으면, 별 3개일 때 모은 친구 하나가 반짝이로 바뀐다
    function clearReward({ pool, caught, shiny = [], size, hints, mistakes, blanks, rng, prefer = [] }) {
        if (!canCatch(blanks, mistakes)) return { fled: true, caught: [], shiny: [] };
        const perfect = stars(hints, mistakes) === 3;
        const got = pickRewards(pool, caught, rewardCount(size), rng, prefer);
        if (got.length) return { fled: false, caught: got, shiny: perfect ? got.slice() : [] };
        if (!perfect) return { fled: false, caught: [], shiny: [] };
        const have = new Set(caught);
        return { fled: false, caught: [], shiny: pickRewards(pool.filter(id => have.has(id)), shiny, 1, rng, prefer) };
    }

    return { elapsedSeconds, formatTime, stars, hintLimit, rewardCount, chancesLeft, canCatch, pickRewards, clearReward };
}));
