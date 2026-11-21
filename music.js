// 배경음악과 짧은 곡(징글) — 옛날 휴대용 게임기 RPG 느낌으로 이 게임을 위해 새로 만든 곡.
// 다른 게임의 곡을 옮긴 것이 아니라 "분위기"만 따랐다: 떨리는 멜로디(비브라토), 엇박 화음,
// 옥타브로 튀는 베이스, 잡음 드럼, ♭VI→♭VII→I 로 끝나는 씩씩한 마무리.
//
// 악보: 한 칸 = 16분음표(div: 4) 또는 8분음표(div: 2). 'C5' 음 · 'C5:3' 3칸짜리 음 · '-' 앞 음을 늘임 ·
//       '.' 쉼('.:4' 4칸 쉼) · '|' 마디 구분. 드럼 줄은 음 대신 k 킥 · s 스네어 · h 하이햇.
// 줄: lead 멜로디(25% 펄스파) · harm 화음(50% 펄스파, 짧게) · bass 베이스(삼각파) · drums 드럼(잡음)
// (브라우저: window.SudokuMusic, Node: require)
(function (root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory();
    else root.SudokuMusic = factory();
}(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    const NOTE = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
    const HITS = { k: 1, s: 1, h: 1 };

    function toMidi(tok) {
        const m = /^([A-G])([#b]?)(\d)$/.exec(tok);
        if (!m) return null;
        return 12 * (+m[3] + 1) + NOTE[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0);
    }

    function midiToFreq(n) {
        return 440 * Math.pow(2, (n - 69) / 12);
    }

    const lenOf = raw => (raw.includes(':') ? +raw.split(':')[1] : 1);

    // 악보 문자열 → { length: 칸 수, notes: [{ step, len, midi } 또는 { step, len, hit }] }
    function parseTrack(score, drums = false) {
        const notes = [];
        let step = 0, last = null;
        for (const raw of score.split(/\s+/)) {
            if (!raw || raw === '|') continue;
            const tok = raw.split(':')[0], len = lenOf(raw);
            if (!Number.isInteger(len) || len < 1) throw new Error(`길이가 이상하다: ${raw}`);
            if (tok === '-') {
                if (!last) throw new Error(`늘일 음이 없다 (${step + 1}번째 칸)`);
                last.len += len;
            } else if (tok === '.') {
                last = null;
            } else if (drums) {
                if (!HITS[tok]) throw new Error(`모르는 북소리: ${raw}`);
                last = { step, len, hit: tok };
                notes.push(last);
            } else {
                const midi = toMidi(tok);
                if (midi === null) throw new Error(`모르는 음: ${raw}`);
                last = { step, len, midi };
                notes.push(last);
            }
            step += len;
        }
        return { length: step, notes };
    }

    // 마디마다 칸 수 (악보를 고칠 때 칸이 빠지거나 남는 걸 테스트로 잡는다)
    function bars(score) {
        return score.split('|').map(b => b.trim().split(/\s+/).filter(Boolean).reduce((n, raw) => n + lenOf(raw), 0));
    }

    // 드럼 마디 무늬
    const N = 'k . h . s . h . k . h . s . h .';   // 기본
    const V = 'k . h . s . h k . k h . s . h .';   // 킥이 한 번 엇박으로
    const F = 'k . h . s . h . s . s . s s s s';   // 8마디 끝의 채움
    const Q = 'k . h . . . h . . . h . . . h .';   // 조용한 곡: 첫 박 킥 + 엇박 하이햇

    const TUNES = {
        // 처음 화면·도감·게임 방법: 모험을 떠나는 길 같은 밝은 곡 (G장조)
        // G Em C D | G Em C-D E♭-F | G B7 Em C-D | C D Bm-Em Am-D
        home: {
            bpm: 140, div: 4,
            tracks: {
                lead: `
                    G5:3 D5 B4:2 D5:2 G5:4 A5:2 B5:2 | A5:3 G5 E5:4 B4:2 E5:2 G5:2 E5:2 |
                    C6:3 B5 A5:2 G5:2 E5:2 G5:2 A5:4 | F#5:6 E5:2 D5:4 .:2 D5 E5 |
                    G5:3 D5 B4:2 D5:2 G5:4 B5:2 D6:2 | E6:3 D6 B5:4 G5:2 B5:2 E6:2 B5:2 |
                    C6:4 G5:2 E5:2 F#5:4 A5:2 D6:2 | Eb6:4 Bb5:2 G5:2 F6:4 C6:2 A5:2 |
                    G5:2 B5:2 D6:4 .:2 D6 C6 B5:2 A5:2 | A5:3 B5 F#5:4 D#5:2 F#5:2 B5:2 A5:2 |
                    G5:6 E5:2 B4:4 E5:2 G5:2 | A5:2 G5:2 E5:2 G5:2 F#5:2 E5:2 D5:2 F#5:2 |
                    E5:3 G5 C6:4 B5:2 A5:2 G5:2 E5:2 | F#5:3 G5 A5:4 D6:4 C6:2 A5:2 |
                    B5:4 F#5:2 D5:2 E5:4 G5:2 B5:2 | C6:2 B5:2 A5:2 E5:2 F#5:4 .:2 D5 E5`,
                harm: `
                    .:2 B4:2 .:2 D5:2 .:2 B4:2 .:2 D5:2 | .:2 G4:2 .:2 B4:2 .:2 G4:2 .:2 B4:2 |
                    .:2 E4:2 .:2 G4:2 .:2 E4:2 .:2 G4:2 | .:2 F#4:2 .:2 A4:2 .:2 F#4:2 .:2 A4:2 |
                    .:2 B4:2 .:2 D5:2 .:2 B4:2 .:2 D5:2 | .:2 G4:2 .:2 B4:2 .:2 G4:2 .:2 B4:2 |
                    .:2 E4:2 .:2 G4:2 .:2 F#4:2 .:2 A4:2 | .:2 G4:2 .:2 Bb4:2 .:2 A4:2 .:2 C5:2 |
                    .:2 B4:2 .:2 D5:2 .:2 B4:2 .:2 D5:2 | .:2 F#4:2 .:2 A4:2 .:2 D#4:2 .:2 A4:2 |
                    .:2 G4:2 .:2 B4:2 .:2 G4:2 .:2 B4:2 | .:2 E4:2 .:2 G4:2 .:2 F#4:2 .:2 A4:2 |
                    .:2 E4:2 .:2 G4:2 .:2 E4:2 .:2 G4:2 | .:2 F#4:2 .:2 A4:2 .:2 F#4:2 .:2 A4:2 |
                    .:2 D4:2 .:2 F#4:2 .:2 G4:2 .:2 B4:2 | .:2 C5:2 .:2 E5:2 .:2 F#4:2 .:2 A4:2`,
                bass: `
                    G2:2 G3:2 G2:2 G3:2 G2:2 G3:2 G2:2 G3:2 | E2:2 E3:2 E2:2 E3:2 E2:2 E3:2 E2:2 E3:2 |
                    C3:2 C4:2 C3:2 C4:2 C3:2 C4:2 C3:2 C4:2 | D3:2 D4:2 D3:2 D4:2 D3:2 C4:2 B3:2 A3:2 |
                    G2:2 G3:2 G2:2 G3:2 G2:2 G3:2 G2:2 G3:2 | E2:2 E3:2 E2:2 E3:2 E2:2 E3:2 E2:2 E3:2 |
                    C3:2 C4:2 C3:2 C4:2 D3:2 D4:2 D3:2 D4:2 | Eb3:2 Eb4:2 Eb3:2 Eb4:2 F3:2 F4:2 F3:2 F4:2 |
                    G2:2 G3:2 G2:2 G3:2 G2:2 G3:2 G2:2 G3:2 | B2:2 B3:2 B2:2 B3:2 B2:2 B3:2 F#3:2 D#3:2 |
                    E2:2 E3:2 E2:2 E3:2 E2:2 E3:2 E2:2 E3:2 | C3:2 C4:2 C3:2 C4:2 D3:2 D4:2 D3:2 D4:2 |
                    C3:2 C4:2 C3:2 C4:2 C3:2 C4:2 C3:2 C4:2 | D3:2 D4:2 D3:2 D4:2 D3:2 D4:2 D3:2 D4:2 |
                    B2:2 B3:2 B2:2 B3:2 E3:2 E4:2 E3:2 E4:2 | A2:2 A3:2 A2:2 A3:2 D3:2 D4:2 C4:2 A3:2`,
                drums: [N, V, N, V, N, V, N, F, N, V, N, V, N, V, N, F].join(' | '),
            },
        },
        // 게임 중: 마을 쉼터처럼 포근하고 느린 곡 (F장조) — 생각하는 데 방해되지 않게 드럼은 살짝만
        // F Dm Gm C | F Am B♭ C | Dm Am B♭ F | Gm C F-Dm Gm-C
        game: {
            bpm: 100, div: 4,
            mix: { drums: 0.5, harm: 0.8 },
            tracks: {
                lead: `
                    A4:4 C5:2 F5:2 E5:4 C5:4 | D5:6 F5:2 E5:4 D5:4 | Bb4:4 D5:2 G5:2 F5:4 D5:4 | E5:8 .:4 C5:2 D5:2 |
                    F5:4 A5:2 F5:2 E5:4 C5:4 | E5:6 C5:2 A4:4 C5:4 | D5:3 C5 Bb4:4 D5:4 F5:4 | E5:4 G5:4 C5:8 |
                    F5:4 E5:2 D5:2 A5:6 F5:2 | E5:4 D5:2 C5:2 E5:8 | D5:4 C5:2 Bb4:2 F5:4 D5:4 | C5:8 .:4 A4:2 C5:2 |
                    Bb4:4 D5:4 G5:4 F5:2 D5:2 | E5:4 G5:2 E5:2 C5:4 Bb4:4 | A4:4 C5:4 D5:4 F5:4 | G5:4 F5:2 D5:2 E5:4 C5:4`,
                harm: `
                    .:2 A3:2 .:2 C4:2 .:2 A3:2 .:2 C4:2 | .:2 A3:2 .:2 D4:2 .:2 A3:2 .:2 D4:2 |
                    .:2 Bb3:2 .:2 D4:2 .:2 Bb3:2 .:2 D4:2 | .:2 C4:2 .:2 E4:2 .:2 C4:2 .:2 E4:2 |
                    .:2 A3:2 .:2 C4:2 .:2 A3:2 .:2 C4:2 | .:2 C4:2 .:2 E4:2 .:2 C4:2 .:2 E4:2 |
                    .:2 Bb3:2 .:2 D4:2 .:2 Bb3:2 .:2 D4:2 | .:2 C4:2 .:2 E4:2 .:2 C4:2 .:2 E4:2 |
                    .:2 A3:2 .:2 D4:2 .:2 A3:2 .:2 D4:2 | .:2 C4:2 .:2 E4:2 .:2 C4:2 .:2 E4:2 |
                    .:2 Bb3:2 .:2 D4:2 .:2 Bb3:2 .:2 D4:2 | .:2 A3:2 .:2 C4:2 .:2 A3:2 .:2 C4:2 |
                    .:2 Bb3:2 .:2 D4:2 .:2 Bb3:2 .:2 D4:2 | .:2 C4:2 .:2 E4:2 .:2 C4:2 .:2 E4:2 |
                    .:2 A3:2 .:2 C4:2 .:2 A3:2 .:2 D4:2 | .:2 Bb3:2 .:2 D4:2 .:2 C4:2 .:2 E4:2`,
                bass: `
                    F2:4 C3:4 F2:4 C3:4 | D3:4 A2:4 D3:4 A2:4 | G2:4 D3:4 G2:4 D3:4 | C3:4 G2:4 C3:4 G2:4 |
                    F2:4 C3:4 F2:4 C3:4 | A2:4 E3:4 A2:4 E3:4 | Bb2:4 F3:4 Bb2:4 F3:4 | C3:4 G2:4 C3:4 G2:4 |
                    D3:4 A2:4 D3:4 A2:4 | A2:4 E3:4 A2:4 E3:4 | Bb2:4 F3:4 Bb2:4 F3:4 | F2:4 C3:4 F2:4 C3:4 |
                    G2:4 D3:4 G2:4 D3:4 | C3:4 G2:4 C3:4 G2:4 | F2:4 C3:4 D3:4 A2:4 | G2:4 D3:4 C3:4 G2:4`,
                drums: Array(16).fill(Q).join(' | '),
            },
        },
    };

    const JINGLES = {
        // 판을 다 채웠을 때: 빰빠바밤 빠바 빰~
        clear: {
            bpm: 160, div: 4,
            tracks: {
                lead: 'G5:2 G5 G5 G5:2 E5:2 G5:2 C6:10',
                harm: 'E5:2 E5 E5 E5:2 C5:2 D5:2 E5:10',
                bass: 'C3:2 C3 C3 C3:2 C3:2 G2:2 C3:10',
                drums: 'k . . . s . . . k . s . k . . . . . . .',
            },
        },
        // 새 친구가 도감에 붙을 때: 반짝 올라가는 소리
        reward: {
            bpm: 160, div: 4,
            tracks: {
                lead: 'E5 G5 C6 E6:3 D6 E6:9',
                harm: 'C5 E5 G5 C6:3 B5 C6:9',
                bass: 'C3:4 G2:2 C3:10',
                drums: '. . . . k . . . s . . . . . . .',
            },
        },
        // 포켓몬이 도망갔을 때: 힘 빠지게 내려가는 소리
        fled: {
            bpm: 120, div: 4,
            tracks: {
                lead: 'E5:2 D#5:2 D5:2 C#5:6',
                bass: 'A2:2 G#2:2 G2:2 F#2:6',
            },
        },
    };

    return { TUNES, JINGLES, toMidi, midiToFreq, parseTrack, bars };
}));
