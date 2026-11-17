// 기록·랭킹·도감 보상 — 화면/네트워크와 무관한 순수 로직
// (브라우저: window.SudokuRecords, Node: require)
(function (root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory(require('./engine.js'));
    else root.SudokuRecords = factory(root.SudokuEngine);
}(typeof self !== 'undefined' ? self : this, function (Engine) {
    'use strict';

    const HINT_PENALTY = 15;     // 힌트 1번 = +15초
    const MISTAKE_PENALTY = 5;   // 실수 1번 = +5초
    const MAX_SECONDS = 35999;   // 9시간 59분 59초 (서버 규칙 상한)
    const MAX_HINTS = 99;
    const NAME_MAX = 12;         // pkmq 랭킹과 같은 글자 수 제한
    const DEFAULT_NAME = '트레이너';
    const ENTRY_KEYS = ['n', 's', 'l', 'h', 'd'];
    const REWARDS_BY_SIZE = { 4: 1, 6: 2, 9: 3 };

    const isInt = v => typeof v === 'number' && Number.isInteger(v);
    const pad2 = n => String(n).padStart(2, '0');

    function finalSeconds(elapsed, hints, mistakes) {
        const total = Math.round(elapsed) + hints * HINT_PENALTY + mistakes * MISTAKE_PENALTY;
        return Math.min(MAX_SECONDS, Math.max(1, total));
    }

    function formatTime(sec) {
        const s = Math.max(0, Math.round(sec));
        return Math.floor(s / 60) + ':' + pad2(s % 60);
    }

    function stars(hints, mistakes) {
        const slips = hints + mistakes;
        return slips === 0 ? 3 : slips <= 3 ? 2 : 1;
    }

    function sanitizeName(raw) {
        const clean = String(raw == null ? '' : raw).replace(/\s+/g, ' ').trim();
        let out = '';
        for (const ch of clean) { // 코드 포인트 단위 — 이모지를 반으로 자르지 않는다
            if (out.length + ch.length > NAME_MAX) break;
            out += ch;
        }
        return out || DEFAULT_NAME;
    }

    function todayString(date = new Date()) {
        return date.getFullYear() + '-' + pad2(date.getMonth() + 1) + '-' + pad2(date.getDate());
    }

    function makeEntry({ name, seconds, level, hints, date }) {
        return {
            n: sanitizeName(name),
            s: Math.min(MAX_SECONDS, Math.max(1, Math.round(seconds))),
            l: level,
            h: Math.min(MAX_HINTS, Math.max(0, Math.round(hints || 0))),
            d: todayString(date),
        };
    }

    // 값의 형식만 확인 (기기 전용 표시 같은 여분 필드는 허용)
    function isWellFormed(e) {
        return !!e
            && typeof e.n === 'string' && e.n.length >= 1 && e.n.length <= NAME_MAX
            && isInt(e.s) && e.s >= 1 && e.s <= MAX_SECONDS
            && !!Engine.getLevel(e.l)
            && isInt(e.h) && e.h >= 0 && e.h <= MAX_HINTS
            && typeof e.d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(e.d);
    }

    // 서버(Firestore 규칙)에 올릴 수 있는 형식인지 — 필드도 정확히 5개여야 한다
    function isValidEntry(e) {
        return isWellFormed(e) && Object.keys(e).every(k => ENTRY_KEYS.includes(k));
    }

    function sameEntry(a, b) {
        return !!a && !!b && a.n === b.n && a.s === b.s && a.l === b.l && a.d === b.d;
    }

    function mergeEntries(remote, local) {
        const out = remote.slice();
        for (const e of local) if (!out.some(r => sameEntry(r, e))) out.push(e);
        return out;
    }

    // 난이도별 보드: 빠른 순, 동점은 공동 순위(1, 1, 3 …), 동점 안에서는 먼저 세운 기록이 위
    function rankBoard(entries, level, limit = 10) {
        const rows = entries
            .filter(e => isWellFormed(e) && e.l === level)
            .sort((a, b) => a.s - b.s || (a.d < b.d ? -1 : a.d > b.d ? 1 : 0))
            .slice(0, limit);
        let rank = 0, prev = null;
        return rows.map((e, i) => {
            if (e.s !== prev) { rank = i + 1; prev = e.s; }
            return { ...e, rank };
        });
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

    return {
        HINT_PENALTY, MISTAKE_PENALTY, MAX_SECONDS, NAME_MAX, DEFAULT_NAME,
        finalSeconds, formatTime, stars, sanitizeName, todayString,
        makeEntry, isValidEntry, sameEntry, mergeEntries, rankBoard,
        rewardCount, pickRewards,
    };
}));
