// 배경음악 악보 규칙 테스트 (곡은 music.js, 연주는 app.js)
const test = require('node:test');
const assert = require('node:assert/strict');
const M = require('../music.js');

test('toMidi: 음 이름을 MIDI 번호로 (# 올림, b 내림)', () => {
    assert.equal(M.toMidi('A4'), 69);
    assert.equal(M.toMidi('C4'), 60);
    assert.equal(M.toMidi('C6'), 84);
    assert.equal(M.toMidi('Bb2'), 46);
    assert.equal(M.toMidi('F#3'), 54);
    assert.equal(M.toMidi('H4'), null);
    assert.equal(M.toMidi('-'), null);
});

test('midiToFreq: A4 = 440Hz, 한 옥타브 위는 두 배', () => {
    assert.equal(M.midiToFreq(69), 440);
    assert.equal(M.midiToFreq(81), 880);
    assert.ok(Math.abs(M.midiToFreq(60) - 261.63) < 0.01);
});

test('parseTrack: 한 칸 = 8분음표, "-"는 앞 음을 늘이고 "."는 쉼, "|"는 마디 구분', () => {
    const t = M.parseTrack('C5 - . E5 | G5 - - .');
    assert.equal(t.length, 8);
    assert.deepEqual(t.notes, [
        { step: 0, len: 2, midi: 72 },
        { step: 3, len: 1, midi: 76 },
        { step: 4, len: 3, midi: 79 },
    ]);
});

test('parseTrack: 잘못된 악보는 바로 알려 준다', () => {
    assert.throws(() => M.parseTrack('. - C5 D5'), /늘일 음/);
    assert.throws(() => M.parseTrack('- C5'), /늘일 음/);
    assert.throws(() => M.parseTrack('C5 H5'), /모르는 음/);
});

test('곡은 처음 화면(home)과 게임(game) 두 개', () => {
    assert.deepEqual(Object.keys(M.TUNES).sort(), ['game', 'home']);
});

test('곡마다: 마디는 8칸, 16마디 이상, 모든 파트 길이가 같아서 반복해도 어긋나지 않는다', () => {
    for (const [name, tune] of Object.entries(M.TUNES)) {
        assert.ok(tune.bpm >= 70 && tune.bpm <= 140, `${name} 빠르기 ${tune.bpm}`);
        const lens = [];
        for (const [part, score] of Object.entries(tune.tracks)) {
            M.bars(score).forEach((n, i) => assert.equal(n, 8, `${name}.${part} ${i + 1}마디: ${n}칸`));
            const t = M.parseTrack(score);
            assert.ok(t.length >= 16 * 8, `${name}.${part} 마디 수`);
            lens.push(t.length);
        }
        assert.equal(new Set(lens).size, 1, `${name}: 파트 길이가 다르다 ${lens}`);
    }
});

test('음역: 멜로디는 G3~G6, 베이스는 C2~G4 (폰 스피커에서 들리고 귀가 아프지 않게)', () => {
    const range = { lead: [55, 91], bass: [36, 67] };
    for (const [name, tune] of Object.entries(M.TUNES)) {
        assert.deepEqual(Object.keys(tune.tracks).sort(), ['bass', 'lead'], name);
        for (const [part, score] of Object.entries(tune.tracks)) {
            const [lo, hi] = range[part];
            for (const n of M.parseTrack(score).notes) assert.ok(n.midi >= lo && n.midi <= hi, `${name}.${part} ${n.midi}`);
        }
    }
});
