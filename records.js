// 걸린 시간·별·도감 보상 — 화면과 무관한 순수 로직
// (브라우저: window.SudokuRecords, Node: require)
(function (root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory(require('./engine.js'));
    else root.SudokuRecords = factory(root.SudokuEngine);
}(typeof self !== 'undefined' ? self : this, function (Engine) {
    'use strict';

    const REWARDS_BY_SIZE = { 4: 1, 6: 2, 9: 3 };
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

    // 도감 보상: 아직 없는 친구 중에서 뽑되, 방금 함께 논 팀(prefer)을 먼저
    function pickRewards(roster, caught, count, rng, prefer = []) {
        const have = new Set(caught), fav = new Set(prefer);
        const left = roster.filter(id => !have.has(id));
        const first = Engine.shuffle(left.filter(id => fav.has(id)), rng);
        const rest = Engine.shuffle(left.filter(id => !fav.has(id)), rng);
        return first.concat(rest).slice(0, count);
    }

    return { elapsedSeconds, formatTime, stars, hintLimit, rewardCount, pickRewards };
}));
