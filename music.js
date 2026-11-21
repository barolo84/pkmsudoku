// 배경음악 — 게임보이 느낌으로 이 게임을 위해 새로 만든 곡 두 개 (다른 게임의 곡을 옮긴 것이 아니다)
// 악보: 한 칸 = 8분음표. 'C5' 음 · '-' 앞 음을 한 칸 늘임 · '.' 쉼 · '|' 마디 구분(8칸마다)
// (브라우저: window.SudokuMusic, Node: require)
(function (root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory();
    else root.SudokuMusic = factory();
}(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    const NOTE = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

    function toMidi(tok) {
        const m = /^([A-G])([#b]?)(\d)$/.exec(tok);
        if (!m) return null;
        return 12 * (+m[3] + 1) + NOTE[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0);
    }

    function midiToFreq(n) {
        return 440 * Math.pow(2, (n - 69) / 12);
    }

    // 악보 문자열 → { length: 칸 수, notes: [{ step, len, midi }] }
    function parseTrack(score) {
        const toks = score.split(/\s+/).filter(t => t && t !== '|');
        const notes = [];
        let last = null;
        toks.forEach((t, i) => {
            if (t === '-') {
                if (!last) throw new Error(`늘일 음이 없다 (${i + 1}번째 칸)`);
                last.len++;
            } else if (t === '.') {
                last = null;
            } else {
                const midi = toMidi(t);
                if (midi === null) throw new Error(`모르는 음: ${t} (${i + 1}번째 칸)`);
                last = { step: i, len: 1, midi };
                notes.push(last);
            }
        });
        return { length: toks.length, notes };
    }

    // 마디마다 칸 수 (악보를 고칠 때 칸이 빠지거나 남는 걸 테스트로 잡는다)
    function bars(score) {
        return score.split('|').map(b => b.trim().split(/\s+/).filter(Boolean).length);
    }

    const TUNES = {
        // 처음 화면·도감·게임 방법: 밝고 통통 튀는 곡 (C장조)
        home: {
            bpm: 116,
            tracks: {
                lead: `
                    E5 - G5 E5 C5 - D5 E5 | A4 - C5 E5 D5 - C5 .  | F5 - A5 F5 C5 - D5 F5 | G5 - - . D5 - B4 . |
                    E5 - G5 E5 C6 - B5 A5 | G5 - E5 C5 A4 - C5 .  | D5 - F5 A5 G5 F5 E5 D5 | G5 - - - . . D5 . |
                    C5 - F5 - A5 - G5 F5  | D5 - G5 - B5 - A5 G5  | E5 G5 B5 G5 E5 - D5 E5 | C5 - E5 A5 - . G5 . |
                    F5 - E5 D5 A5 - G5 F5 | E5 - D5 B4 G4 - A4 B4 | C5 - E5 G5 C6 - G5 E5 | D5 - - B4 C5 - - .`,
                bass: `
                    C3 . G3 . C3 . G3 . | A2 . E3 . A2 . E3 . | F2 . C3 . F2 . C3 . | G2 . D3 . G2 . D3 . |
                    C3 . G3 . C3 . G3 . | A2 . E3 . A2 . E3 . | D3 . A3 . D3 . A3 . | G2 . D3 . G2 . D3 . |
                    F2 . C3 . F2 . C3 . | G2 . D3 . G2 . D3 . | E3 . B3 . E3 . B3 . | A2 . E3 . A2 . E3 . |
                    D3 . A3 . D3 . A3 . | G2 . D3 . G2 . D3 . | C3 . G3 . C3 . G3 . | G2 . D3 . C3 - - .`,
            },
        },
        // 게임 중: 생각하는 데 방해되지 않게 느리고 조용한 곡 (F장조)
        game: {
            bpm: 84,
            tracks: {
                lead: `
                    A4 - - - C5 - - -     | D5 - - F5 E5 - D5 -  | D5 - - - Bb4 - C5 -   | C5 - - - . . . .     |
                    A4 - - - C5 - F5 -    | E5 - - - C5 - A4 -   | Bb4 - D5 - F5 - E5 D5 | C5 - - - - - . .     |
                    F5 - - - E5 - D5 -    | C5 - - - E5 - - -    | D5 - C5 - Bb4 - A4 -  | A4 - - - . . C5 .    |
                    Bb4 - - D5 G5 - F5 -  | E5 - - - G4 - Bb4 -  | A4 - C5 - F5 - - -    | E5 - - - - - . .`,
                bass: `
                    F3 A3 C4 A3 F3 A3 C4 A3 | D3 F3 A3 F3 D3 F3 A3 F3 | Bb2 D3 F3 D3 Bb2 D3 F3 D3 | C3 E3 G3 E3 C3 E3 G3 E3 |
                    F3 A3 C4 A3 F3 A3 C4 A3 | A2 C3 E3 C3 A2 C3 E3 C3 | Bb2 D3 F3 D3 Bb2 D3 F3 D3 | C3 E3 G3 E3 C3 E3 G3 E3 |
                    D3 F3 A3 F3 D3 F3 A3 F3 | A2 C3 E3 C3 A2 C3 E3 C3 | Bb2 D3 F3 D3 Bb2 D3 F3 D3 | F3 A3 C4 A3 F3 A3 C4 A3 |
                    G2 Bb2 D3 Bb2 G2 Bb2 D3 Bb2 | C3 E3 G3 E3 C3 E3 G3 E3 | F3 A3 C4 A3 F3 A3 C4 A3 | C3 E3 G3 E3 C3 E3 G3 E3`,
            },
        },
    };

    return { TUNES, toMidi, midiToFreq, parseTrack, bars };
}));
