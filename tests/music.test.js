// 배경음악·짧은 곡(징글) 악보 규칙 테스트 (곡은 music.js, 연주는 app.js)
const test = require('node:test');
const assert = require('node:assert/strict');
const M = require('../music.js');

const secs = (tune, len) => len * 60 / tune.bpm / tune.div;

test('toMidi: 음 이름을 MIDI 번호로 (# 올림, b 내림)', () => {
    assert.equal(M.toMidi('A4'), 69);
    assert.equal(M.toMidi('C4'), 60);
    assert.equal(M.toMidi('C6'), 84);
    assert.equal(M.toMidi('Bb2'), 46);
    assert.equal(M.toMidi('Eb6'), 87);
    assert.equal(M.toMidi('F#3'), 54);
    assert.equal(M.toMidi('H4'), null);
    assert.equal(M.toMidi('-'), null);
});

test('midiToFreq: A4 = 440Hz, 한 옥타브 위는 두 배', () => {
    assert.equal(M.midiToFreq(69), 440);
    assert.equal(M.midiToFreq(81), 880);
    assert.ok(Math.abs(M.midiToFreq(60) - 261.63) < 0.01);
});

test('parseTrack: 한 칸씩, ":n"은 n칸, "-"는 앞 음을 늘이고 "."는 쉼, "|"는 마디 구분', () => {
    const t = M.parseTrack('C5:2 . E5 | G5:3 - .:2');
    assert.equal(t.length, 10);
    assert.deepEqual(t.notes, [
        { step: 0, len: 2, midi: 72 },
        { step: 3, len: 1, midi: 76 },
        { step: 4, len: 4, midi: 79 },
    ]);
});

test('parseTrack(드럼): k 킥 · s 스네어 · h 하이햇', () => {
    const t = M.parseTrack('k . h . s:2 h h', true);
    assert.equal(t.length, 8);
    assert.deepEqual(t.notes.map(n => [n.step, n.hit]), [[0, 'k'], [2, 'h'], [4, 's'], [6, 'h'], [7, 'h']]);
});

test('parseTrack: 잘못된 악보는 바로 알려 준다', () => {
    assert.throws(() => M.parseTrack('. - C5 D5'), /늘일 음/);
    assert.throws(() => M.parseTrack('C5 H5'), /모르는 음/);
    assert.throws(() => M.parseTrack('C5:0'), /길이/);
    assert.throws(() => M.parseTrack('k C5'), /모르는 음/);       // 멜로디 줄에 북소리
    assert.throws(() => M.parseTrack('k C5', true), /모르는 북소리/); // 드럼 줄에 음
});

test('bars: 마디마다 칸 수 (":n"까지 더해서)', () => {
    assert.deepEqual(M.bars('C5:3 D5 E5:4 | .:2 G5:6'), [8, 8]);
});

test('배경음악은 처음 화면(home)과 게임(game), 짧은 곡은 완성·새 친구·도망 세 개', () => {
    assert.deepEqual(Object.keys(M.TUNES).sort(), ['game', 'home']);
    assert.deepEqual(Object.keys(M.JINGLES).sort(), ['clear', 'fled', 'reward']);
});

test('배경음악: 멜로디·화음·베이스·드럼 네 줄, 마디는 박자대로, 16마디 이상, 모든 줄 길이가 같다', () => {
    for (const [name, tune] of Object.entries(M.TUNES)) {
        assert.ok(tune.bpm >= 70 && tune.bpm <= 160, `${name} 빠르기 ${tune.bpm}`);
        assert.deepEqual(Object.keys(tune.tracks).sort(), ['bass', 'drums', 'harm', 'lead'], name);
        const bar = tune.div * 4, lens = [];
        for (const [part, score] of Object.entries(tune.tracks)) {
            M.bars(score).forEach((n, i) => assert.equal(n, bar, `${name}.${part} ${i + 1}마디: ${n}칸`));
            const t = M.parseTrack(score, part === 'drums');
            assert.ok(t.length >= 16 * bar, `${name}.${part} 마디 수`);
            lens.push(t.length);
        }
        assert.equal(new Set(lens).size, 1, `${name}: 줄 길이가 다르다 ${lens}`);
    }
});

test('짧은 곡: 멜로디가 있고, 줄 길이가 같고, 3초 안에 끝난다', () => {
    for (const [name, tune] of Object.entries(M.JINGLES)) {
        assert.ok(tune.tracks.lead, name);
        const lens = Object.entries(tune.tracks).map(([part, s]) => M.parseTrack(s, part === 'drums').length);
        assert.equal(new Set(lens).size, 1, `${name}: 줄 길이가 다르다 ${lens}`);
        assert.ok(secs(tune, lens[0]) <= 3, `${name}: ${secs(tune, lens[0]).toFixed(2)}초`);
    }
});

test('음역: 폰 스피커에서 들리고 귀가 아프지 않게', () => {
    const range = { lead: [55, 91], harm: [48, 84], bass: [36, 67] };
    for (const [name, tune] of Object.entries({ ...M.TUNES, ...M.JINGLES })) {
        for (const [part, score] of Object.entries(tune.tracks)) {
            if (part === 'drums') continue;
            const [lo, hi] = range[part];
            for (const n of M.parseTrack(score).notes) assert.ok(n.midi >= lo && n.midi <= hi, `${name}.${part} ${n.midi}`);
        }
    }
});
