// 포켓몬 스도쿠 — 화면 동작
// 순수 로직은 engine.js(스도쿠)와 records.js(시간·별·도감 보상)에 있고, 여기는 화면·입력·저장만 다룬다.
(function () {
    'use strict';

    const E = window.SudokuEngine, R = window.SudokuRecords;
    const $ = id => document.getElementById(id);
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    // ===== 이 기기에 저장 (localStorage) =====
    const store = {
        get(k, d) { try { const v = localStorage.getItem('pkms_' + k); return v === null ? d : v; } catch (e) { return d; } },
        set(k, v) { try { localStorage.setItem('pkms_' + k, v); } catch (e) { } },
        del(k) { try { localStorage.removeItem('pkms_' + k); } catch (e) { } },
        json(k, d) { try { const v = JSON.parse(this.get(k, 'null')); return v === null ? d : v; } catch (e) { return d; } },
        setJson(k, v) { this.set(k, JSON.stringify(v)); },
    };

    // 데이터(data.js): 도감 100마리, 난이도별 친구 묶음(POOLS), 판에 붙이는 팀
    const { POOLS, LEVEL_INFO, SIZE_INFO } = window.SudokuData;
    const POKE = {};
    for (const id in window.SudokuData.POKEMON) POKE[id] = { id: +id, name: window.SudokuData.POKEMON[id] };
    const TEAMS = window.SudokuData.TEAMS.map(t => ({ ...t, members: t.members.map(id => POKE[id]) }));
    const ROSTER = E.LEVELS.flatMap(l => POOLS[l.id]); // 도감 순서 = 난이도 순서
    const teamOf = id => TEAMS.find(t => t.id === id) || TEAMS[0];
    const imgSrc = id => `images/${id}.webp`;

    let teamId = teamOf(store.get('team', TEAMS[0].id)).id;
    let mode = store.get('mode', 'pic') === 'num' ? 'num' : 'pic';   // 칸에 그림을 보일지 숫자를 보일지
    let muted = store.get('mute', '0') === '1';                       // 모든 소리 끄기
    let musicOn = store.get('music', '1') === '1';                    // 배경음악 (효과음과 따로 끈다)
    const caught = new Set(store.json('caught', []).filter(id => POKE[id]));
    const poolHave = level => POOLS[level].filter(id => caught.has(id)).length; // 그 난이도 친구 중 모은 수
    const shiny = new Set(store.json('shiny', []).filter(id => caught.has(id))); // 별 3개로 얻은 반짝이 친구
    const best = store.json('best', {});                             // { 난이도: { s: 초, st: 별 } }

    // ===== 말 다듬기 =====
    const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const DIGIT_BATCHIM = { 0: 1, 1: 1, 3: 1, 6: 1, 7: 1, 8: 1 }; // 영·일·삼·육·칠·팔
    function hasBatchim(word) {
        const ch = String(word).slice(-1), code = ch.charCodeAt(0);
        if (code >= 0xAC00 && code <= 0xD7A3) return (code - 0xAC00) % 28 !== 0;
        return !!DIGIT_BATCHIM[ch];
    }
    const josa = (word, withB, without) => word + (hasBatchim(word) ? withB : without);
    const w = (pic, num) => (mode === 'pic' ? pic : num); // 그림 모드/숫자 모드에 따라 다른 말

    // ===== 소리 (pkmq와 같은 방식: 손가락 동작 안에서 매번 resume) =====
    const sfx = (() => {
        let ctx = null;
        function ac() {
            if (muted) return null;
            if (!ctx) {
                const AC = window.AudioContext || window.webkitAudioContext;
                if (!AC) return null;
                ctx = new AC();
            }
            if (ctx.state === 'suspended') ctx.resume();
            return ctx;
        }
        function tone(freq, dur, o = {}) {
            const c = ac();
            if (!c) return;
            try {
                const t = c.currentTime + (o.at || 0), vol = o.vol || 0.13;
                const osc = c.createOscillator(), g = c.createGain();
                osc.type = o.type || 'triangle';
                osc.frequency.setValueAtTime(freq, t);
                if (o.slide) osc.frequency.exponentialRampToValueAtTime(freq * o.slide, t + dur);
                g.gain.setValueAtTime(0.0001, t);
                g.gain.exponentialRampToValueAtTime(vol, t + 0.012);
                g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
                osc.connect(g); g.connect(c.destination);
                osc.start(t); osc.stop(t + dur + 0.03);
            } catch (e) { }
        }
        const run = (notes, dur, o) => notes.forEach((f, i) => tone(f, dur, { ...o, at: i * (o.step || 0.08) }));
        return {
            wake: ac,            // 손가락 동작 안에서 불러 소리를 깨운다 (배경음악도 같은 AudioContext를 쓴다)
            audio: () => ctx,    // 만들지 않고 지금 것만
            tap: () => tone(660, 0.06, { vol: 0.07 }),
            place: () => { tone(587, 0.09); tone(880, 0.15, { at: 0.07 }); },
            wrong: () => { tone(262, 0.16, { type: 'sine', vol: 0.17, slide: 0.78 }); tone(196, 0.22, { type: 'sine', vol: 0.15, at: 0.13, slide: 0.82 }); },
            unit: () => run([523, 659, 784, 1047], 0.15, { step: 0.07 }),
            hint: () => { tone(988, 0.1, { type: 'sine' }); tone(1319, 0.2, { type: 'sine', at: 0.09 }); },
            // 완성·새 친구·도망 소리는 music.js의 짧은 곡(징글)으로 연주한다
        };
    })();

    // ===== 배경음악·짧은 곡: music.js의 악보를 옛날 휴대용 게임기처럼 연주 =====
    // 멜로디 = 25% 펄스파 + 조금 늦게 들어오는 떨림(비브라토), 화음 = 50% 펄스파(짧게 끊어서),
    // 베이스 = 삼각파, 드럼 = 잡음(스네어·하이햇)과 뚝 떨어지는 낮은 음(킥).
    // 0.3초 앞까지 음을 미리 예약해 두는 방식이라 화면이 바빠도 박자가 흔들리지 않는다.
    const music = (() => {
        const M = window.SudokuMusic;
        function compile(t) { // 악보 → 칸마다 울릴 음
            const parts = {};
            let len = 0;
            for (const part in t.tracks) {
                const p = M.parseTrack(t.tracks[part], part === 'drums');
                len = p.length;
                parts[part] = {};
                p.notes.forEach(n => { parts[part][n.step] = n; });
            }
            return { spb: 60 / t.bpm / t.div, len, parts, mix: t.mix || {} };
        }
        const tunes = {}, jingles = {};
        for (const k in M.TUNES) tunes[k] = compile(M.TUNES[k]);
        for (const k in M.JINGLES) jingles[k] = compile(M.JINGLES[k]);

        const VOICE = {
            lead: { vol: 0.045, wave: 'pulse', vib: true },
            harm: { vol: 0.024, wave: 'square', cut: 0.11 },
            bass: { vol: 0.075, wave: 'triangle', cut: 0.24 },
        };
        const DRUM = { k: 0.12, s: 0.05, h: 0.022 };
        let bus = null, cur = '', step = 0, nextT = 0, timer = 0, pulse = null, noise = null;

        function pulseWave(c, duty) {
            try {
                const n = 32, re = new Float32Array(n), im = new Float32Array(n);
                for (let k = 1; k < n; k++) re[k] = 2 / (k * Math.PI) * Math.sin(k * Math.PI * duty);
                return c.createPeriodicWave(re, im);
            } catch (e) { return null; }
        }
        function prepare(c) {
            if (!pulse) pulse = pulseWave(c, 0.25);
            if (!noise) {
                try {
                    noise = c.createBuffer(1, c.sampleRate, c.sampleRate);
                    const d = noise.getChannelData(0);
                    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
                } catch (e) { noise = null; }
            }
        }
        function noteOn(c, out, voice, midi, t, dur, mul) {
            try {
                const osc = c.createOscillator(), g = c.createGain(), f = M.midiToFreq(midi), vol = voice.vol * mul;
                if (voice.wave === 'pulse' && pulse) osc.setPeriodicWave(pulse);
                else osc.type = voice.wave === 'pulse' ? 'square' : voice.wave;
                osc.frequency.setValueAtTime(f, t);
                const end = t + (voice.cut ? Math.min(dur, voice.cut) : Math.max(0.05, dur - 0.02));
                g.gain.setValueAtTime(0.0001, t);
                g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
                if (!voice.cut) g.gain.setValueAtTime(vol, Math.max(t + 0.011, end - 0.04));
                g.gain.exponentialRampToValueAtTime(0.0001, end);
                if (voice.vib && dur > 0.25) { // 긴 음은 조금 있다가 살짝 떨린다
                    const lfo = c.createOscillator(), depth = c.createGain();
                    lfo.frequency.value = 5.5;
                    depth.gain.setValueAtTime(0, t + 0.12);
                    depth.gain.linearRampToValueAtTime(f * 0.012, t + 0.3);
                    lfo.connect(depth);
                    depth.connect(osc.frequency);
                    lfo.start(t);
                    lfo.stop(end + 0.02);
                }
                osc.connect(g); g.connect(out);
                osc.start(t); osc.stop(end + 0.02);
            } catch (e) { }
        }
        function drumHit(c, out, kind, t, mul) {
            try {
                const g = c.createGain(), vol = DRUM[kind] * mul;
                g.connect(out);
                if (kind === 'k' || !noise) { // 킥 (잡음을 못 만드는 기기에서는 다른 북도 짧은 음으로)
                    const o = c.createOscillator(), len = kind === 'k' ? 0.13 : 0.05;
                    o.type = 'sine';
                    o.frequency.setValueAtTime(kind === 'k' ? 150 : 900, t);
                    o.frequency.exponentialRampToValueAtTime(kind === 'k' ? 45 : 500, t + len);
                    g.gain.setValueAtTime(vol, t);
                    g.gain.exponentialRampToValueAtTime(0.0001, t + len);
                    o.connect(g);
                    o.start(t); o.stop(t + len + 0.02);
                } else { // 스네어 = 가운데 잡음, 하이햇 = 높은 잡음
                    const src = c.createBufferSource(), flt = c.createBiquadFilter(), len = kind === 's' ? 0.11 : 0.035;
                    src.buffer = noise;
                    flt.type = kind === 's' ? 'bandpass' : 'highpass';
                    flt.frequency.value = kind === 's' ? 1800 : 7000;
                    g.gain.setValueAtTime(vol, t);
                    g.gain.exponentialRampToValueAtTime(0.0001, t + len);
                    src.connect(flt); flt.connect(g);
                    src.start(t, Math.random() * 0.5);
                    src.stop(t + len + 0.02);
                }
            } catch (e) { }
        }
        function hitStep(c, out, tune, s, t) { // 한 칸에 있는 모든 줄의 소리를 예약
            for (const part in tune.parts) {
                const n = tune.parts[part][s];
                if (!n) continue;
                const mul = part in tune.mix ? tune.mix[part] : 1;
                if (part === 'drums') drumHit(c, out, n.hit, t, mul);
                else noteOn(c, out, VOICE[part], n.midi, t, n.len * tune.spb, mul);
            }
        }
        function tick() {
            const c = sfx.audio();
            if (!c || !bus) return;
            const tune = tunes[cur];
            if (nextT < c.currentTime) nextT = c.currentTime + 0.05; // 멈췄다 돌아오면 밀린 음은 건너뛴다
            while (nextT < c.currentTime + 0.3) {
                hitStep(c, bus, tune, step, nextT);
                step = (step + 1) % tune.len;
                nextT += tune.spb;
            }
        }
        // 짧은 곡은 한 번만 (효과음과 같아서 배경음악을 꺼도 나오고, 모든 소리를 끄면 안 나온다)
        function jingle(name) {
            const c = sfx.wake(), j = jingles[name];
            if (!c || !j) return;
            prepare(c);
            const out = c.createGain(), t0 = c.currentTime + 0.03;
            out.connect(c.destination);
            for (let s = 0; s < j.len; s++) hitStep(c, out, j, s, t0 + s * j.spb);
            setTimeout(() => { try { out.disconnect(); } catch (e) { } }, (j.len * j.spb + 1.5) * 1000);
        }
        function stop() {
            clearInterval(timer);
            timer = 0;
            cur = '';
            if (!bus) return;
            const b = bus;
            bus = null;
            try { b.gain.setTargetAtTime(0, b.context.currentTime, 0.05); } catch (e) { }
            setTimeout(() => { try { b.disconnect(); } catch (e) { } }, 600);
        }
        function play(name) { // 같은 곡이 이미 나오고 있으면 그대로 둔다
            const c = sfx.audio();
            if (!name || !musicOn || muted || !c || c.state !== 'running' || document.hidden) { stop(); return; }
            if (name === cur && timer) return;
            stop();
            prepare(c);
            bus = c.createGain();
            bus.connect(c.destination);
            cur = name;
            step = 0;
            nextT = c.currentTime + 0.08;
            tick();
            timer = setInterval(tick, 60);
        }
        return { play, stop, jingle };
    })();

    // ===== 화면 전환 (처음 화면이 바닥, 나머지는 한 칸 위) =====
    const VIEWS = ['home', 'game', 'clear', 'book', 'help'];
    let view = 'home';

    function setView(name) {
        if (view === 'game' && name !== 'game') leaveGame();
        VIEWS.forEach(v => { $(v).hidden = v !== name; });
        view = name;
        window.scrollTo(0, 0);
        syncMusic();
    }

    // 화면마다 나오는 곡: 게임 중(게임 중에 연 방법 화면 포함)은 조용한 곡, 완성 화면은 축하 소리만
    // 포켓몬이 도망간 화면이 판을 덮고 있을 때도 조용히
    function syncMusic() {
        const tune = view === 'clear' || (view === 'game' && !$('fled').hidden) ? ''
            : view === 'game' || (view === 'help' && helpFrom === 'game') ? 'game' : 'home';
        music.play(tune);
    }
    // 브라우저는 손가락 동작이 있어야 소리를 낼 수 있다: 처음 누를 때 깨우고 곡을 튼다
    function wakeAudio() {
        if (muted) return;
        const c = sfx.wake();
        if (!c) return;
        if (c.state === 'running') syncMusic();
        else c.resume().then(syncMusic, () => { });
    }
    ['pointerup', 'keydown'].forEach(ev => document.addEventListener(ev, wakeAudio, { capture: true, passive: true }));
    function show(name) {
        const prev = view;
        setView(name);
        try {
            if (name === 'home') {
                if (prev !== 'home' && history.state && history.state.v !== 'home') history.back();
            } else if (prev === 'home') history.pushState({ v: name }, '');
            else history.replaceState({ v: name }, '');
        } catch (e) { }
    }
    function goHome() { renderHome(); show('home'); }

    window.addEventListener('popstate', e => {
        const v = (e.state && e.state.v) || 'home';
        if (v === view) return;
        if (v === 'game' && game && !game.done) { setView('game'); layoutGame(); startClock(); return; }
        if (v === 'book') { renderBook(); setView('book'); return; }
        if (v === 'help') { helpFrom = 'home'; renderHelp(); setView('help'); return; }
        try { if (v !== 'home') history.replaceState({ v: 'home' }, ''); } catch (err) { }
        renderHome();
        setView('home');
    });

    // ===== 처음 화면 =====
    function preload(ids) { ids.forEach(id => { new Image().src = imgSrc(id); }); }

    function renderHero() {
        $('hero-stickers').innerHTML = teamOf(teamId).members.slice(0, 4)
            .map(m => `<img class="stk" src="${imgSrc(m.id)}" alt="" draggable="false">`).join('');
    }

    function renderTeams() {
        $('teams').innerHTML = TEAMS.map(t => `
            <button class="team" role="radio" aria-checked="${t.id === teamId}" data-team="${t.id}">
                <span class="team-faces">${t.members.slice(0, 3).map(m => `<img src="${imgSrc(m.id)}" alt="" loading="lazy" draggable="false">`).join('')}</span>
                <span class="team-name">${esc(t.name)}</span>
            </button>`).join('');
    }

    // 판 크기를 닮은 작은 격자 그림 (채워진 칸 무늬는 고정)
    function miniGrid(n) {
        let cells = '';
        for (let i = 0; i < n * n; i++) cells += `<i${(i * 7 + Math.floor(i / n) * 3) % 5 < 2 ? ' class="on"' : ''}></i>`;
        return `<span class="mini" style="--n:${n}" aria-hidden="true">${cells}</span>`;
    }

    function renderLevels() {
        $('levels').innerHTML = [4, 6, 9].map(size => `
            <div class="size-group" data-size="${size}">
                <div class="size-tag">${miniGrid(size)}<b>${SIZE_INFO[size].label}</b><span>${SIZE_INFO[size].hint}</span></div>
                <div class="lvls">${E.LEVELS.filter(l => l.size === size).map(l => {
            const info = LEVEL_INFO[l.id], st = best[l.id] ? best[l.id].st : 0;
            const have = poolHave(l.id), total = POOLS[l.id].length;
            return `<button class="lvl${have === total ? ' full' : ''}" data-level="${l.id}"
                        aria-label="${info.name}, 별 ${st}개, 친구 ${total}마리 중 ${have}마리">
                        <span class="lvl-no" aria-hidden="true">${info.lv}</span>
                        <span class="lvl-name">${info.name}</span>
                        <span class="lvl-rec"><span class="st">${'★'.repeat(st)}${'☆'.repeat(3 - st)}</span> <span class="got">${have}/${total}</span></span>
                    </button>`;
        }).join('')}</div>
            </div>`).join('');
    }

    function renderResume() {
        const s = loadSaved();
        $('resume').hidden = !s;
        if (s) $('resume-info').textContent =
            `${SIZE_INFO[s.size].label} · ${LEVEL_INFO[s.level].name} · ${R.formatTime(s.ms / 1000)}`;
    }

    function renderToggles() {
        $('mode-pic').setAttribute('aria-pressed', mode === 'pic');
        $('mode-num').setAttribute('aria-pressed', mode === 'num');
        $('sound-ico').textContent = muted ? '🔇' : '🔊';
        $('sound-btn').setAttribute('aria-pressed', muted);
        $('sound-btn').setAttribute('aria-label', muted ? '소리 켜기' : '소리 끄기');
        const mb = $('music-btn'), playing = musicOn && !muted; // 모든 소리를 끄면 음악도 꺼진 것으로 보인다
        mb.classList.toggle('off', !playing);
        mb.setAttribute('aria-pressed', playing);
        mb.setAttribute('aria-label', playing ? '배경음악 끄기' : '배경음악 켜기');
    }

    function renderHome() {
        renderHero();
        renderTeams();
        renderLevels();
        renderResume();
        renderToggles();
        $('book-count').textContent = `${caught.size}/${ROSTER.length}`;
    }

    function setMode(m) {
        mode = m;
        store.set('mode', m);
        renderToggles();
    }

    $('teams').addEventListener('click', e => {
        const btn = e.target.closest('.team');
        if (!btn) return;
        teamId = btn.dataset.team;
        store.set('team', teamId);
        document.querySelectorAll('.team').forEach(b => b.setAttribute('aria-checked', b === btn));
        renderHero();
        preload(teamOf(teamId).members.map(m => m.id));
        sfx.tap();
    });
    $('levels').addEventListener('click', e => {
        const btn = e.target.closest('.lvl');
        if (btn) { sfx.place(); startGame(btn.dataset.level); }
    });
    $('resume').addEventListener('click', () => { sfx.place(); resumeGame(); });
    $('mode-pic').addEventListener('click', () => { setMode('pic'); sfx.tap(); });
    $('mode-num').addEventListener('click', () => { setMode('num'); sfx.tap(); });
    $('sound-btn').addEventListener('click', () => {
        muted = !muted;
        store.set('mute', muted ? '1' : '0');
        renderToggles();
        sfx.place();
        syncMusic();
    });
    $('music-btn').addEventListener('click', () => {
        if (muted) { muted = false; store.set('mute', '0'); musicOn = true; } // 다 꺼진 상태에서 누르면 소리를 다시 켠다
        else musicOn = !musicOn;
        store.set('music', musicOn ? '1' : '0');
        renderToggles();
        sfx.tap();
        wakeAudio();
        syncMusic();
    });
    $('open-book').addEventListener('click', () => { sfx.tap(); renderBook(); show('book'); });
    document.querySelectorAll('[data-home]').forEach(b => b.addEventListener('click', () => { sfx.tap(); goHome(); }));

    // ===== 게임 상태 =====
    let game = null;      // { level, size, puzzle, solution, grid, notes, team, ms, hints, mistakes, done }
    let cells = [];       // 칸 버튼들 (판 위치 순서)
    let sel = -1;         // 고른 칸
    let armed = 0;        // 먼저 집어 든 스티커(값). 0이면 없음
    let memo = false;     // 메모 모드
    let hint = null;      // 반짝이고 있는 힌트 { idx, value, reason }
    let paused = false;
    let result = null;    // 마지막으로 끝낸 판의 결과 (완성 화면용)

    const syms = () => teamOf(game.team).members.slice(0, game.size);
    const symName = v => (mode === 'pic' ? syms()[v - 1].name : String(v));
    const symHtml = v => (mode === 'pic'
        ? `<img src="${imgSrc(syms()[v - 1].id)}" alt="" draggable="false">`
        : `<span class="digit">${v}</span>`);
    const leftOf = v => game.size - game.grid.reduce((n, x) => n + (x === v), 0);
    // 틀려도 되는 횟수 = 이 판의 빈칸 수. 음수가 되면 포켓몬이 도망간 것
    const blanksOf = g => g.puzzle.reduce((n, x) => n + (x === 0), 0);
    const chances = () => R.chancesLeft(blanksOf(game), game.mistakes);
    const tintStyle = v => `--tint:var(--t${v});--dig:var(--d${v})`;

    function loadSaved() {
        const s = store.json('game', null);
        try {
            const level = E.getLevel(s.level), n = level.size ** 2;
            const ok = s.size === level.size && teamOf(s.team).id === s.team
                && [s.puzzle, s.solution, s.grid, s.notes].every(a => Array.isArray(a) && a.length === n)
                && s.grid.every((v, i) => v === 0 || v === s.solution[i])
                && s.grid.includes(0) && E.isComplete(s.solution, s.size);
            return ok ? s : null;
        } catch (e) { return null; }
    }
    function saveGame() {
        if (!game || game.done) return;
        const { level, size, puzzle, solution, grid, notes, team, ms, hints, mistakes } = game;
        store.setJson('game', { level, size, puzzle, solution, grid, notes, team, ms, hints, mistakes, hintIdx: hint ? hint.idx : -1 });
    }

    function startGame(levelId) {
        const level = E.getLevel(levelId);
        const p = E.generatePuzzle(levelId, Math.random);
        game = {
            level: levelId, size: level.size, puzzle: p.puzzle, solution: p.solution,
            grid: p.puzzle.slice(), notes: new Array(level.size ** 2).fill(0),
            team: teamId, ms: 0, hints: 0, mistakes: 0, done: false,
        };
        enterGame(level.size === 4 ? w('줄마다 친구는 한 번씩만!', '줄마다 숫자는 한 번씩만!') : w('빈칸을 콕! 친구를 골라 줘', '빈칸을 콕! 숫자를 골라 줘'));
    }
    function resumeGame() {
        const s = loadSaved();
        if (!s) { renderResume(); return; }
        game = { ...s, done: false };
        enterGame(chances() < 0 ? '포켓몬은 도망갔어. 끝까지 해 볼까?' : '이어서 해 보자!');
    }
    function enterGame(firstWords) {
        sel = -1; armed = 0; memo = false; paused = false; result = null;
        // 쓰던 힌트가 남아 있으면 이어서 반짝인다 (이미 센 힌트라 다시 세지 않는다)
        const hi = game.hintIdx;
        hint = hi >= 0 && game.grid[hi] === 0 ? { idx: hi, value: game.solution[hi], reason: 'naked' } : null;
        preload(syms().map(m => m.id));
        buildBoard();
        buildTray();
        $('buddy-img').src = imgSrc(syms()[0].id);
        $('pause').hidden = true;
        $('leave').hidden = true;
        $('fled').hidden = true;
        $('t-memo').hidden = game.size === 4;
        $('t-memo').setAttribute('aria-pressed', 'false');
        updateHintButton();
        updateBalls();
        show('game');
        layoutGame();
        refresh();
        say(firstWords);
        startClock();
        saveGame();
    }
    function leaveGame() {
        stopClock();
        saveGame();
        endDrag();
    }

    // ===== 판 그리기 =====
    function buildBoard() {
        const { size } = game, { boxRows, boxCols } = E.layoutFor(size);
        const bx = size / boxCols, board = $('board');
        board.innerHTML = '';
        board.style.setProperty('--bx', bx);
        board.style.setProperty('--bc', boxCols);
        board.style.setProperty('--nc', boxCols);
        const boxes = [];
        for (let b = 0; b < size; b++) {
            const el = document.createElement('div');
            el.className = 'box' + ((Math.floor(b / bx) + b % bx) % 2 ? ' alt' : '');
            boxes.push(el);
            board.append(el);
        }
        cells = [];
        for (let i = 0; i < size * size; i++) {
            const r = Math.floor(i / size), c = i % size;
            const btn = document.createElement('button');
            btn.dataset.i = i;
            boxes[Math.floor(r / boxRows) * bx + Math.floor(c / boxCols)].append(btn);
            cells.push(btn);
            renderCell(i);
        }
    }

    function notesHtml(mask) {
        if (!mask) return '';
        let out = '<span class="notes">';
        for (let v = 1; v <= game.size; v++) out += `<i style="color:var(--d${v})">${mask & (1 << v) ? v : ''}</i>`;
        return out + '</span>';
    }

    function renderCell(i) {
        const el = cells[i], v = game.grid[i], size = game.size;
        el.className = 'cell ' + (v ? 'filled' : 'empty');
        el.style.cssText = v ? tintStyle(v) : '';
        el.innerHTML = v ? symHtml(v) : notesHtml(game.notes[i]);
        el.setAttribute('aria-label', `${Math.floor(i / size) + 1}번째 줄 ${i % size + 1}번째 칸, ${v ? symName(v) : '빈칸'}`);
    }

    function buildTray() {
        const { size } = game;
        let html = '';
        for (let v = 1; v <= size; v++) {
            html += `<button class="sym" data-v="${v}" style="${tintStyle(v)}">${symHtml(v)}`
                + (mode === 'pic' && size > 4 ? `<span class="no">${v}</span>` : '')
                + `<span class="left"></span></button>`;
        }
        $('tray-syms').innerHTML = html;
        $('t-mode-ico').textContent = mode === 'pic' ? '🔢' : '🖼️';
        $('t-mode-txt').textContent = mode === 'pic' ? '숫자로' : '그림으로';
    }
    const symEl = v => $('tray-syms').querySelector(`[data-v="${v}"]`);

    // 고른 칸·같은 그림·힌트 표시와 스티커 통의 남은 개수를 한 번에 갱신
    function refresh() {
        const size = game.size;
        const show = armed || (sel >= 0 ? game.grid[sel] : 0);
        const peers = new Set();
        if (sel >= 0) { const u = E.unitsOf(size, sel); [...u.row, ...u.col, ...u.box].forEach(i => peers.add(i)); }
        cells.forEach((el, i) => {
            el.classList.toggle('sel', i === sel);
            el.classList.toggle('peer', i !== sel && peers.has(i));
            el.classList.toggle('same', i !== sel && show > 0 && game.grid[i] === show);
            el.classList.toggle('hint', !!hint && hint.idx === i);
        });
        for (let v = 1; v <= size; v++) {
            const el = symEl(v), left = leftOf(v);
            el.classList.toggle('armed', armed === v);
            el.classList.toggle('done', left === 0);
            el.querySelector('.left').textContent = left === 0 ? '✓' : left;
            el.setAttribute('aria-label', `${symName(v)}, ${left === 0 ? '다 붙였어요' : left + '개 남음'}`);
        }
    }

    // 클래스를 잠깐 붙였다 떼서 애니메이션을 다시 재생
    function flash(el, cls, ms = 800) {
        if (!el) return;
        el.classList.remove(cls);
        void el.offsetWidth;
        el.classList.add(cls);
        setTimeout(() => el.classList.remove(cls), ms);
    }

    let lastPraise = '';
    function say(text, oops = false) {
        const p = $('buddy-say');
        p.textContent = text;
        p.classList.toggle('oops', oops);
        flash(p.parentElement, 'talk', 340);
    }
    function praise() {
        const list = ['좋아!', '딱 맞아!', '잘한다!', '찾았다!', '멋져!', '바로 그거야!'];
        let pick;
        do { pick = list[Math.floor(Math.random() * list.length)]; } while (pick === lastPraise);
        lastPraise = pick;
        return pick;
    }

    // ===== 판 크기 맞추기 =====
    // 화면에 맞춰 스티커 통의 줄 수와 칸 크기를 정한다. CSS만으로는 "정사각형 칸 + 상자 간격"을
    // 정확히 맞추기 어려워서 여기서 계산해 CSS 변수로 넘긴다.
    const landscapeMQ = window.matchMedia('(orientation: landscape) and (min-width: 560px)');
    const TRAY_GAP = 6, TOOL_ROW = 60, MIN_TOUCH = 44;

    function layoutGame() {
        if (view !== 'game' || !game) return;
        const size = game.size, { boxRows, boxCols } = E.layoutFor(size);
        const gameEl = $('game'), tray = $('tray'), area = $('board-area'), top = gameEl.querySelector('.g-top');
        const land = landscapeMQ.matches;
        const tools = size === 4 ? 2 : 3;
        const cs = getComputedStyle(gameEl);
        const innerW = gameEl.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
        const innerH = gameEl.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
        const sideW = top.clientWidth;
        // 스티커 한 장의 최대 크기: 옆에 따로 놓이는 가로 화면과 태블릿에서는 더 크게
        const baseMax = land
            ? (size === 4 ? 124 : size === 6 ? 106 : 98)
            : (size === 4 ? 88 : size === 6 ? 76 : 68) * (innerW >= 700 ? 1.3 : 1);

        // 스티커 통 후보: 한 줄에 몇 개 놓을지 (compact = 도구도 같은 줄에 끼워 넣기)
        const options = land
            ? (size === 4 ? [{ cols: 2 }, { cols: 4 }] : size === 6 ? [{ cols: 3 }, { cols: 6 }] : [{ cols: 3 }, { cols: 6, compact: true }])
            : (size === 9 ? [{ cols: 9 }, { cols: 6, compact: true }] : [{ cols: size }]);
        let pick = null;
        for (const o of options) {
            const rows = o.compact ? 2 : Math.ceil(size / o.cols);
            const toolH = o.compact ? 0 : TOOL_ROW;
            const byWidth = ((land ? sideW : innerW) - (o.cols - 1) * TRAY_GAP) / o.cols;
            const byHeight = land
                ? (innerH - top.offsetHeight - 8 - toolH - (rows - 1) * TRAY_GAP - 6) / rows
                : Math.max(MIN_TOUCH, innerH * 0.095);
            const tile = Math.floor(Math.min(baseMax, byWidth, byHeight));
            const trayH = rows * tile + (rows - 1) * TRAY_GAP + toolH + 6;
            const boardRoom = land ? tile : Math.min(innerW, innerH - top.offsetHeight - 16 - trayH);
            const score = boardRoom + tile * 0.01 - (tile < MIN_TOUCH ? 1000 : 0);
            if (!pick || score > pick.score) pick = { ...o, tile, score };
        }
        const toolSpan = pick.compact ? 1 : pick.cols / tools;
        tray.classList.toggle('compact', !!pick.compact);
        // 도구 버튼이 좁으면 그림 아래에 글자를 쌓는다
        tray.classList.toggle('stack', !!pick.compact || toolSpan * pick.tile + (toolSpan - 1) * TRAY_GAP < 104);
        tray.style.setProperty('--tray-cols', pick.cols);
        tray.style.setProperty('--tool-span', toolSpan);
        tray.style.setProperty('--tray-max', pick.cols * pick.tile + (pick.cols - 1) * TRAY_GAP + 'px');
        $('ghost').style.setProperty('--gs', Math.round(pick.tile * 1.2) + 'px');

        // 판: 남은 자리에 들어가는 가장 큰 정사각형 칸
        const roomy = Math.min(area.clientWidth, area.clientHeight) > 520;
        const m = size === 9 ? { g: 2, bp: 2, G: 4, pad: 5 } : { g: 3, bp: 3, G: 5, pad: 6 };
        if (roomy) { m.g += 1; m.bp += 1; m.G += 2; m.pad += 3; }
        const bx = size / boxCols, by = size / boxRows, lip = 6;
        const fixedW = 2 * m.pad + (bx - 1) * m.G + bx * (2 * m.bp + (boxCols - 1) * m.g);
        const fixedH = 2 * m.pad + (by - 1) * m.G + by * (2 * m.bp + (boxRows - 1) * m.g) + lip;
        const maxCell = size === 4 ? 150 : size === 6 ? 112 : 86;
        const cell = Math.max(18, Math.min(maxCell,
            Math.floor(Math.min((area.clientWidth - fixedW) / size, (area.clientHeight - fixedH) / size))));
        const wrap = $('board').parentElement; // 판과 그 위를 덮는 화면(쉬기·나가기)이 같은 크기 값을 쓴다
        wrap.style.setProperty('--cell', cell + 'px');
        wrap.style.setProperty('--g', m.g + 'px');
        wrap.style.setProperty('--bp', m.bp + 'px');
        wrap.style.setProperty('--G', m.G + 'px');
        wrap.style.setProperty('--pad', m.pad + 'px');
    }
    let layoutTimer = 0;
    function queueLayout() { clearTimeout(layoutTimer); layoutTimer = setTimeout(layoutGame, 60); }
    window.addEventListener('resize', queueLayout);
    window.addEventListener('orientationchange', queueLayout);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(queueLayout);

    // ===== 시계 =====
    let clock = 0, lastTick = 0, ticks = 0;
    function startClock() {
        stopClock();
        lastTick = performance.now();
        clock = setInterval(tick, 250);
        showTime();
    }
    function stopClock() { clearInterval(clock); clock = 0; }
    function showTime() { $('g-time').textContent = R.formatTime(Math.floor(game.ms / 1000)); }
    function tick() {
        const now = performance.now();
        if (game && !game.done && !paused && !document.hidden) game.ms += Math.min(2000, now - lastTick);
        lastTick = now;
        if (!game) return;
        showTime();
        if (++ticks % 20 === 0) saveGame();
    }
    document.addEventListener('visibilitychange', () => {
        if (document.hidden) { saveGame(); music.stop(); } else { lastTick = performance.now(); syncMusic(); }
    });
    window.addEventListener('pagehide', saveGame);

    function setPaused(on) {
        if (!game || game.done || !$('leave').hidden || !$('fled').hidden) return;
        paused = on;
        $('pause').hidden = !on;
        $('g-timer').querySelector('.timer-ico').textContent = on ? '▶' : '⏸';
        $('g-timer').setAttribute('aria-label', on ? '다시 시작' : '잠깐 쉬기');
        if (on) { saveGame(); endDrag(); } else lastTick = performance.now();
        sfx.tap();
    }
    $('g-timer').addEventListener('click', () => setPaused(!paused));
    $('pause').addEventListener('click', () => setPaused(false));

    // ----- 나가기: 나중에 이어서 할지, 그냥 나갈지 고른다 -----
    function askLeave() {
        if (!game || game.done) { goHome(); return; }
        if (!$('leave').hidden) { closeLeave(); return; }
        paused = true;
        $('pause').hidden = true;
        $('fled').hidden = true;
        $('leave').hidden = false;
        saveGame();
        endDrag();
        sfx.tap();
    }
    function closeLeave() {
        $('leave').hidden = true;
        paused = false;
        lastTick = performance.now();
        $('g-timer').querySelector('.timer-ico').textContent = '⏸';
        $('g-timer').setAttribute('aria-label', '잠깐 쉬기');
        sfx.tap();
    }
    $('g-back').addEventListener('click', askLeave);
    $('leave-stay').addEventListener('click', closeLeave);
    $('leave-save').addEventListener('click', () => { sfx.tap(); goHome(); }); // 화면을 떠날 때 저장된다
    $('leave-quit').addEventListener('click', () => { // 그냥 나가기: 이 판은 남기지 않는다
        sfx.tap();
        stopClock();
        store.del('game');
        game = null;
        goHome();
    });

    // ----- 틀려도 되는 횟수: 빈칸 수만큼은 괜찮고, 그보다 더 틀리면 포켓몬이 도망간다 -----
    function updateBalls() {
        const el = $('balls'), left = chances();
        el.classList.toggle('low', left >= 0 && left <= 2);
        el.classList.toggle('last', left === 0);
        el.classList.toggle('fled', left < 0);
        $('balls-n').textContent = left < 0 ? '💨' : left;
        el.setAttribute('aria-label', left < 0 ? '포켓몬이 도망갔어요'
            : left === 0 ? '몬스터볼을 다 썼어요. 한 번 더 틀리면 포켓몬이 도망가요'
                : `몬스터볼 ${left}개. ${left}번까지 틀려도 괜찮아요`);
    }
    function showFled() { // 판 위를 덮고, 새 판으로 다시 할지 이 판을 끝까지 풀지 고른다
        if (!game || game.done || view !== 'game') return;
        paused = true;
        $('pause').hidden = true;
        $('leave').hidden = true;
        $('fled-p').textContent = `${blanksOf(game)}번보다 많이 틀려서 이번엔 못 잡았어.`;
        $('fled').hidden = false;
        endDrag();
        saveGame();
        syncMusic(); // 배경음악을 멈추고
        music.jingle('fled'); // 힘 빠지는 소리
    }
    function closeFled() {
        $('fled').hidden = true;
        paused = false;
        lastTick = performance.now();
        syncMusic();
    }
    $('fled-again').addEventListener('click', () => { sfx.place(); startGame(game.level); });
    $('fled-stay').addEventListener('click', () => { sfx.tap(); closeFled(); say('좋아, 끝까지 해 보자!'); });

    // ===== 스티커 붙이기 =====
    const UNIT_NAME = { row: '가로줄', col: '세로줄', box: '상자' };

    function place(i, v) {
        if (!game || game.done || game.grid[i] !== 0) return;
        const size = game.size;
        if (game.solution[i] !== v) { // 틀렸을 때: 붙지 않고 제자리로, 이유를 알려준다
            game.mistakes++;
            const hits = E.conflictsFor(game.grid, size, i, v);
            sel = i; armed = 0;
            refresh();
            flash(cells[i], 'bad');
            hits.forEach(h => flash(cells[h.idx], 'clash'));
            flash(symEl(v), 'nope');
            sfx.wrong();
            if (navigator.vibrate) { try { navigator.vibrate(50); } catch (e) { } }
            const name = symName(v); // 이름이 길면 말풍선 두 줄에 들어가도록 '같은'을 뺀다
            const why = hits.length
                ? `${name.length > 3 ? '' : '같은 '}${UNIT_NAME[hits[0].unit]}에 ${josa(name, '이', '가')} 있어!`
                : '음… 거긴 아니야. 다시!';
            const left = chances();
            updateBalls();
            flash($('balls'), 'used', 600);
            if (left === -1) { // 방금 도망갔다: 틀린 이유를 잠깐 보여 준 뒤 판을 덮는다
                say('포켓몬이 도망갔어!', true);
                setTimeout(showFled, reducedMotion ? 200 : 900);
            } else {
                say(why, true);
                if (left === 0) setTimeout(() => { // 이유를 읽을 시간을 준 뒤 경고
                    if (game && !game.done && chances() === 0 && $('buddy-say').textContent === why) say('또 틀리면 도망가!', true);
                }, 1600);
            }
            saveGame();
            return;
        }
        game.grid[i] = v;
        game.notes[i] = 0;
        const u = E.unitsOf(size, i), bit = 1 << v; // 같은 줄·상자의 메모에서 이 값은 지운다
        new Set([...u.row, ...u.col, ...u.box]).forEach(p => {
            if (game.notes[p] & bit) { game.notes[p] &= ~bit; renderCell(p); }
        });
        if (hint && hint.idx === i) setHint(null);
        armed = 0; // 한 번 붙이면 내려놓는다 (계속 들고 있으면 다음 칸을 누를 때 실수로 붙는다)
        sel = i;
        renderCell(i);
        refresh();
        cells[i].classList.add('pop');
        saveGame();
        if (E.isComplete(game.grid, size)) { win(); return; }
        const done = E.completedUnits(game.grid, size, i);
        if (done.length) {
            const order = new Map();
            done.forEach(d => d.cells.forEach((c, k) => { if (!order.has(c)) order.set(c, k); }));
            order.forEach((k, c) => { cells[c].style.setProperty('--i', k); flash(cells[c], 'hop', 500 + k * 38); });
            sfx.unit();
            say(done.length > 1 ? '한꺼번에 완성! ✨' : `${UNIT_NAME[done[0].type]} 완성! ✨`);
        } else {
            sfx.place();
            say(praise());
        }
    }

    function onCell(i) {
        if (!game || game.done || paused) return;
        if (game.grid[i] === 0 && armed && !memo) { place(i, armed); return; }
        if (game.grid[i] !== 0) { armed = 0; sel = sel === i ? -1 : i; }
        else sel = i;
        sfx.tap();
        refresh();
    }

    function onSym(v) {
        if (!game || game.done || paused) return;
        const emptySel = sel >= 0 && game.grid[sel] === 0;
        if (memo) {
            if (!emptySel) { say('빈칸을 먼저 눌러 줘'); return; }
            game.notes[sel] ^= 1 << v;
            renderCell(sel);
            refresh();
            sfx.tap();
            saveGame();
            return;
        }
        if (leftOf(v) === 0) { say(`${josa(symName(v), '은', '는')} ${w('다 붙였어!', '다 썼어!')}`); return; }
        if (emptySel) { place(sel, v); return; }
        armed = armed === v ? 0 : v; // 칸을 안 골랐으면 스티커를 먼저 집어 든다
        if (armed) say(`${symName(v)}, ${w('어디에 붙일까?', '어디에 쓸까?')}`);
        sfx.tap();
        refresh();
    }

    $('board').addEventListener('click', e => {
        const el = e.target.closest('.cell');
        if (el) onCell(+el.dataset.i);
    });

    // ----- 스티커 통: 누르기 + 끌어다 놓기 -----
    let drag = null, dragged = false;

    function hitCell(x, y) {
        const el = document.elementFromPoint(x, y);
        const cell = el && el.closest ? el.closest('.cell') : null;
        return cell ? +cell.dataset.i : -1;
    }
    function dragPoint(e) { // 손가락이 스티커를 가리지 않도록 터치일 때는 조금 위에 띄운다
        const lift = e.pointerType === 'mouse' ? 0 : drag.size * 0.75;
        return { x: e.clientX, y: e.clientY - lift };
    }
    function setDrop(i) {
        if (drag.over === i) return;
        if (drag.over >= 0) cells[drag.over].classList.remove('drop');
        drag.over = i >= 0 && game.grid[i] === 0 ? i : -1;
        if (drag.over >= 0) cells[drag.over].classList.add('drop');
    }
    function endDrag() {
        if (!drag) return;
        if (drag.over >= 0 && cells[drag.over]) cells[drag.over].classList.remove('drop');
        drag.tile.classList.remove('lifted');
        $('ghost').classList.remove('on');
        drag = null;
    }

    $('tray-syms').addEventListener('pointerdown', e => {
        const tile = e.target.closest('.sym');
        if (!tile || !game || game.done || paused || memo || (e.pointerType === 'mouse' && e.button !== 0)) return;
        endDrag();
        const v = +tile.dataset.v;
        if (leftOf(v) === 0) return;
        drag = { v, tile, id: e.pointerId, x0: e.clientX, y0: e.clientY, moved: false, over: -1, size: parseFloat(getComputedStyle($('ghost')).getPropertyValue('--gs')) || 72 };
        try { tile.setPointerCapture(e.pointerId); } catch (err) { }
    });
    $('tray-syms').addEventListener('pointermove', e => {
        if (!drag || e.pointerId !== drag.id) return;
        if (!drag.moved) {
            if (Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0) < 10) return;
            drag.moved = true; dragged = true;
            const ghost = $('ghost');
            ghost.innerHTML = symHtml(drag.v);
            ghost.style.setProperty('--dig', `var(--d${drag.v})`);
            ghost.classList.add('on');
            drag.tile.classList.add('lifted');
        }
        const p = dragPoint(e);
        $('ghost').style.transform = `translate(${p.x}px, ${p.y}px)`;
        setDrop(hitCell(p.x, p.y));
    });
    function dragEnd(e) {
        if (!drag || e.pointerId !== drag.id) return;
        const d = drag, p = d.moved ? dragPoint(e) : null;
        const target = d.moved && e.type === 'pointerup' ? hitCell(p.x, p.y) : -1;
        endDrag();
        if (d.moved) setTimeout(() => { dragged = false; }, 0);
        if (target >= 0 && game.grid[target] === 0) { armed = 0; place(target, d.v); }
    }
    $('tray-syms').addEventListener('pointerup', dragEnd);
    $('tray-syms').addEventListener('pointercancel', dragEnd);
    $('tray-syms').addEventListener('click', e => {
        const tile = e.target.closest('.sym');
        if (!tile) return;
        if (dragged) { dragged = false; return; } // 끌어다 놓은 직후의 클릭은 무시
        onSym(+tile.dataset.v);
    });

    // ----- 힌트: 한 판에 쓸 수 있는 수가 정해져 있다 (4칸 2개 · 6칸 3개 · 9칸 5개) -----
    // 한 번 쓰면 찾기 쉬운 칸이 반짝이고, 한 번 더 누르면 그 칸에 붙여 준다.
    // 반짝이는 힌트는 그 칸이 채워질 때까지 남아 있다 (다른 칸을 눌러도 사라지지 않는다).
    const hintsLeft = () => Math.max(0, R.hintLimit(game.size) - game.hints);
    function updateHintButton() {
        const btn = $('t-hint'), left = hintsLeft();
        btn.classList.toggle('again', !!hint);
        btn.classList.toggle('spent', !hint && left === 0);
        btn.querySelector('.tool-txt').textContent = hint ? w('붙여 줘', '써 줘') : `힌트 ${left}`;
        btn.setAttribute('aria-label', hint ? '반짝이는 칸에 붙여 주기' : `힌트, ${left}개 남음`);
    }
    function setHint(h) {
        hint = h;
        if (game) updateHintButton();
    }
    function onHint() {
        if (!game || game.done || paused) return;
        if (hint && game.grid[hint.idx] === 0) { // 두 번째: 반짝이던 칸에 붙여 준다 (힌트를 더 쓰지 않는다)
            const { idx, value } = hint, name = symName(value);
            place(idx, value);
            if (game && !game.done) say(name + (hasBatchim(name) ? '이었어!' : '였어!'));
            return;
        }
        if (hintsLeft() === 0) {
            say('힌트를 다 썼어!');
            flash($('t-hint'), 'nope');
            sfx.tap();
            return;
        }
        const h = E.nextHint(game.grid, game.size, game.solution);
        if (!h) return;
        game.hints++;
        armed = 0; sel = h.idx;
        setHint(h);
        refresh();
        sfx.hint();
        say(h.reason === 'naked' || h.reason === 'solution'
            ? `반짝이는 칸! ${w('누가 올까?', '몇이 올까?')}`
            : `반짝 칸! ${UNIT_NAME[h.reason]}에 ${w('누가', '뭐가')} 없지?`);
        saveGame();
    }
    $('t-hint').addEventListener('click', onHint);

    function toggleMemo() {
        if (!game || game.done || paused || game.size === 4) return;
        memo = !memo;
        armed = 0;
        $('t-memo').setAttribute('aria-pressed', memo);
        say(memo ? '메모 켰어! 작게 적을게' : '메모 껐어');
        sfx.tap();
        refresh();
    }
    $('t-memo').addEventListener('click', toggleMemo);

    $('t-mode').addEventListener('click', () => {
        if (!game || paused) return;
        setMode(mode === 'pic' ? 'num' : 'pic');
        cells.forEach((_, i) => renderCell(i));
        buildTray();
        updateHintButton();
        refresh();
        sfx.tap();
    });

    // ----- 키보드 (PC) -----
    document.addEventListener('keydown', e => {
        if (view !== 'game' || !game || game.done || e.metaKey || e.ctrlKey || e.altKey) return;
        const k = e.key, size = game.size;
        if (!$('leave').hidden) { if (k === 'Escape') closeLeave(); return; }
        if (!$('fled').hidden) { if (k === 'Escape') closeFled(); return; }
        if (k === ' ' || k === 'p' || k === 'P') { e.preventDefault(); setPaused(!paused); return; }
        if (paused) return;
        const step = { ArrowUp: -size, ArrowDown: size, ArrowLeft: -1, ArrowRight: 1 }[k];
        if (step) {
            e.preventDefault();
            let i = sel < 0 ? 0 : sel;
            if (sel >= 0) {
                const sameRow = Math.floor((i + step) / size) === Math.floor(i / size);
                if (Math.abs(step) === 1 ? sameRow : i + step >= 0 && i + step < size * size) i += step;
            }
            sel = i; armed = 0;
            refresh();
        } else if (/^[1-9]$/.test(k) && +k <= size) {
            onSym(+k);
        } else if (k === 'h' || k === 'H') onHint();
        else if (k === 'm' || k === 'M') toggleMemo();
        else if (k === 'Escape') { sel = -1; armed = 0; refresh(); }
        else if ((k === 'Backspace' || k === 'Delete') && sel >= 0 && game.notes[sel]) {
            game.notes[sel] = 0;
            renderCell(sel);
            refresh();
            saveGame();
        }
    });

    // ===== 완성 =====
    function win() {
        game.done = true;
        stopClock();
        music.stop(); // 완성 소리가 잘 들리게
        store.del('game');
        const { level, size, ms, hints, mistakes } = game;
        const secs = R.elapsedSeconds(ms), st = R.stars(hints, mistakes);
        const prev = best[level];
        const isBest = !prev || secs < prev.s;
        best[level] = { s: isBest ? secs : prev.s, st: Math.max(st, prev ? prev.st : 0) };
        store.setJson('best', best);
        // 보상: 이 난이도에 정해진 친구들 중에서 도감에 붙는다 (함께 논 팀의 친구가 있으면 먼저).
        // 빈칸 수보다 많이 틀렸으면 없고, 별 3개면 반짝이 (records.js의 clearReward)
        const poolBefore = poolHave(level), blanks = blanksOf(game);
        const out = R.clearReward({
            pool: POOLS[level], caught: [...caught], shiny: [...shiny], size, hints, mistakes, blanks,
            rng: Math.random, prefer: syms().map(m => m.id),
        });
        out.caught.forEach(id => caught.add(id));
        out.shiny.forEach(id => shiny.add(id));
        store.setJson('caught', [...caught]);
        store.setJson('shiny', [...shiny]);
        result = {
            level, size, secs, hints, mistakes, st, isBest: isBest && !!prev, blanks, poolBefore,
            fled: out.fled, rewards: out.caught, shinyIds: out.shiny,
        };

        sel = -1; armed = 0; setHint(null);
        refresh();
        cells.forEach((el, i) => { // 판 전체가 대각선으로 물결치듯 폴짝
            el.classList.remove('pop');
            el.style.setProperty('--i', Math.floor(i / size) + i % size);
            el.classList.add('hop');
        });
        music.jingle('clear');
        say('우와! 다 붙였어!');
        setTimeout(() => {
            if (view !== 'game' || !result) return;
            renderClear();
            show('clear');
            confetti();
        }, reducedMotion ? 300 : 1350);
    }

    function renderClear() {
        const r = result;
        flash($('stamp'), 'in', 1200);
        $('clear-h').textContent = r.st === 3 ? '완벽해!' : r.st === 2 ? '참 잘했어!' : '끝까지 해냈어!';
        $('stars').innerHTML = [0, 1, 2].map(i => `<span class="${i < r.st ? 'on' : ''}" style="--i:${i}">★</span>`).join('');
        $('stars').setAttribute('aria-label', `별 ${r.st}개`);
        $('clear-detail').innerHTML = [
            `${SIZE_INFO[r.size].label} ${LEVEL_INFO[r.level].name}`,
            `⏱ ${R.formatTime(r.secs)}`,
            r.hints ? `힌트 ${r.hints}번` : '',
            r.mistakes ? `앗! ${r.mistakes}번` : '',
        ].filter(Boolean).map(t => `<span>${esc(t)}</span>`).join('')
            + (r.isBest ? '<span class="best-tag">내 최고 기록!</span>' : '');

        const total = POOLS[r.level].length, have = poolHave(r.level);
        const next = E.LEVELS.find(l => poolHave(l.id) < POOLS[l.id].length); // 아직 친구가 남은 가장 쉬운 판
        const shown = r.rewards.length ? r.rewards : r.shinyIds; // 새로 붙은 친구, 또는 반짝이로 바뀐 친구
        const tip = '힌트도 실수도 없이 깨면 반짝이 친구!';
        let head, sub = '';
        if (r.fled) {
            head = '포켓몬이 도망갔어… 💨';
            sub = `${r.blanks}번까지만 틀리면 잡을 수 있어. 다시 해 보자!`;
        } else if (r.rewards.length) {
            head = r.shinyIds.length ? '반짝이 친구가 붙었어! ✨' : '새 친구가 도감에 붙었어!';
            if (!r.shinyIds.length) sub = tip;
        } else if (r.shinyIds.length) {
            head = `${josa(POKE[r.shinyIds[0]].name, '이', '가')} 반짝반짝! ✨`;
            sub = '힌트도 실수도 없이 깨서 반짝이로 바뀌었어';
        } else {
            head = next ? '이 판 친구는 다 모았어!' : '도감을 모두 모았어! 👑';
            sub = next ? `'${LEVEL_INFO[next.id].name}' 판에 새 친구가 있어`
                : POOLS[r.level].some(id => !shiny.has(id)) ? '힌트도 실수도 없이 깨면 친구가 반짝이로 바뀌어!' : '이 판 친구는 모두 반짝이야! ✨';
        }
        $('rewards-h').textContent = head;
        $('rewards-sub').hidden = !sub;
        $('rewards-sub').textContent = sub;
        $('rewards').hidden = !shown.length;
        $('rewards').dataset.n = shown.length;
        $('rewards').innerHTML = shown.map((id, i) =>
            `<div class="reward${r.shinyIds.includes(id) ? ' shiny' : ''}" style="--i:${i}"><img class="stk" src="${imgSrc(id)}" alt=""><span>${esc(POKE[id].name)}</span></div>`).join('');
        if (shown.length) setTimeout(() => { if (view === 'clear') music.jingle('reward'); }, reducedMotion ? 0 : 1000);

        // 이 판의 친구를 얼마나 모았는지: 방금 붙은 만큼 차오른다
        const fill = $('meter-fill');
        fill.style.transition = 'none';
        fill.style.transform = `scaleX(${r.poolBefore / total})`;
        void fill.offsetWidth;
        fill.style.transition = '';
        fill.style.transform = `scaleX(${have / total})`;
        $('meter-have').textContent = have;
        $('meter-total').textContent = total;
        $('meter').setAttribute('aria-label', `이 판 친구 ${total}마리 중 ${have}마리`);
        $('clear-book-count').textContent = `${caught.size}/${ROSTER.length}`;
    }

    $('again-btn').addEventListener('click', () => { sfx.place(); startGame(result ? result.level : 'a1'); });
    $('clear-home').addEventListener('click', () => { sfx.tap(); goHome(); });

    $('clear-book').addEventListener('click', () => { sfx.tap(); renderBook(); show('book'); });

    // ===== 도감 =====
    function renderBook() {
        $('book-reset').hidden = true;
        $('book-have').textContent = caught.size;
        $('book-total').textContent = ROSTER.length;
        $('book-note').textContent = (caught.size === ROSTER.length ? '모든 친구를 모았어! 👑 이제 반짝이를 모아 볼까?'
            : '판마다 만나는 친구가 달라요. 어려운 판일수록 귀한 친구!')
            + (shiny.size ? ` 반짝이 ${shiny.size}마리 ✨` : ' 힌트도 실수도 없이 깨면 반짝이 ✨');
        $('book-body').innerHTML = E.LEVELS.map(l => {
            const info = LEVEL_INFO[l.id], pool = POOLS[l.id], shinyN = pool.filter(id => shiny.has(id)).length;
            return `<section class="book-team">
                <div class="book-head">
                    <h3><span class="book-lv" aria-hidden="true">${info.lv}</span><span class="book-name">${esc(info.name)}</span><small>${SIZE_INFO[l.size].label} · ${poolHave(l.id)}/${pool.length}${shinyN ? ` · ✨${shinyN}` : ''}</small></h3>
                    <button class="chunky book-play" data-level="${l.id}" aria-label="${esc(info.name)} 판 시작하기"><span aria-hidden="true">▶</span> 시작</button>
                </div>
                <div class="book-grid">${pool.map(id => caught.has(id)
                ? `<div class="slot${shiny.has(id) ? ' shiny' : ''}"><img class="stk" src="${imgSrc(id)}" alt="" loading="lazy"><span>${esc(POKE[id].name)}${shiny.has(id) ? '<span class="sr-only"> (반짝이)</span>' : ''}</span></div>`
                : `<div class="slot blank"><img src="${imgSrc(id)}" alt="" loading="lazy"><span>?</span></div>`).join('')}</div>
            </section>`;
        }).join('');
    }

    // 난이도마다 그 판을 바로 시작하는 버튼 (처음 화면에서 난이도를 누른 것과 같다: 고른 팀으로 새 판)
    $('book-body').addEventListener('click', e => {
        const btn = e.target.closest('.book-play');
        if (btn) { sfx.place(); startGame(btn.dataset.level); }
    });

    // 숨은 기능(부모용): 제목의 📖를 1.5초 안에 3번 누르면 도감 초기화를 물어본다 (pkmq의 🏆 3연타와 같은 방식)
    let bookTaps = 0, bookTapTimer = 0;
    $('book-ico').addEventListener('click', () => {
        bookTaps++;
        clearTimeout(bookTapTimer);
        bookTapTimer = setTimeout(() => { bookTaps = 0; }, 1500);
        if (bookTaps < 3) return;
        bookTaps = 0;
        $('book-reset').hidden = false;
        $('book-reset').scrollIntoView({ block: 'nearest' });
    });
    $('book-reset-no').addEventListener('click', () => { $('book-reset').hidden = true; });
    $('book-reset-yes').addEventListener('click', () => { // 모은 친구·반짝이·별을 모두 지운다 (하던 판은 그대로)
        caught.clear();
        store.del('caught');
        shiny.clear();
        store.del('shiny');
        for (const level in best) delete best[level];
        store.del('best');
        renderBook();
        sfx.tap();
    });

    // ===== 게임 방법 =====
    // 지금 고른 팀의 친구들(숫자 모드면 숫자)로 규칙을 그림으로 보여 준다.
    let helpFrom = 'home'; // 어디서 열었는지: 게임 중에 열었으면 그 판으로 돌아간다

    function renderHelp() {
        const team = teamOf(helpFrom === 'game' && game ? game.team : teamId).members;
        const pic = v => (mode === 'pic' ? `<img src="${imgSrc(team[v - 1].id)}" alt="">` : `<span class="digit">${v}</span>`);
        const name = v => (mode === 'pic' ? team[v - 1].name : String(v));
        const friend = w('친구', '숫자');
        // 보기용 4칸 판 (정답). on: 또렷하게 보일 칸들, hole: 빈칸으로 둘 칸
        const S = [1, 2, 3, 4, 3, 4, 1, 2, 2, 1, 4, 3, 4, 3, 2, 1];
        const board = (on, hole = -1) => {
            let out = '<span class="mb">';
            for (let b = 0; b < 4; b++) {
                out += '<span class="mbx">';
                for (let k = 0; k < 4; k++) {
                    const i = (Math.floor(b / 2) * 2 + Math.floor(k / 2)) * 4 + (b % 2) * 2 + k % 2;
                    const cls = on.includes(i) ? 'on' : '';
                    out += i === hole ? `<i class="hole ${cls}">?</i>` : `<i class="${cls}" style="${tintStyle(S[i])}">${pic(S[i])}</i>`;
                }
                out += '</span>';
            }
            return out + '</span>';
        };
        const sticker = v => `<span class="h-sym" style="${tintStyle(v)}">${pic(v)}</span>`;
        const first = POOLS.a1.slice(0, 3);
        $('help-body').innerHTML = `
            <ol class="help-steps">
                <li>
                    <h3>${friend}는 한 번씩만!</h3>
                    <p>가로줄, 세로줄, 상자마다 <b>같은 ${friend}가 두 번 나오면 안 돼요.</b></p>
                    <div class="h-three">
                        <figure>${board([0, 1, 2, 3])}<figcaption>가로줄</figcaption></figure>
                        <figure>${board([1, 5, 9, 13])}<figcaption>세로줄</figcaption></figure>
                        <figure>${board([2, 3, 6, 7])}<figcaption>상자</figcaption></figure>
                    </div>
                </li>
                <li>
                    <h3>빈칸의 주인을 찾아요</h3>
                    <div class="h-find">${board([8, 9, 10, 11], 10)}<span class="h-arrow">→</span>${sticker(4)}</div>
                    <p>이 가로줄에 ${esc(name(2))}, ${esc(name(1))}, ${esc(josa(name(3), '이', '가'))} 있으니까… 빈칸은 <b>${esc(name(4))}</b>!</p>
                </li>
                <li>
                    <h3>이렇게 ${w('붙여요', '써요')}</h3>
                    <div class="h-flow"><span class="h-cell"></span><span class="h-arrow">→</span>${sticker(1)}</div>
                    <p>빈칸을 콕 누르고, ${friend}를 콕! ${w('스티커를 <b>끌어다</b> 빈칸에 놓아도 돼요.', '숫자를 <b>끌어다</b> 빈칸에 놓아도 돼요.')}</p>
                </li>
                <li>
                    <h3>틀리면 몬스터볼이 줄어요</h3>
                    <div class="h-say"><img class="stk" src="${imgSrc(team[0].id)}" alt=""><span>같은 가로줄에 ${esc(josa(name(1), '이', '가'))} 있어!</span></div>
                    <p>틀리면 ${w('붙지', '써지지')} 않고 돌아가요. 왜 안 되는지도 알려 줘요.</p>
                    <div class="h-balls"><span class="balls" aria-hidden="true"><i class="ball"></i>6</span>
                        <p><b>빈칸 수만큼</b> 틀려도 괜찮아요. 빈칸이 6개면 6번까지!</p></div>
                    <p>그보다 더 틀리면 <b>포켓몬이 도망가요</b> 💨 판은 끝까지 풀 수 있지만 도감에는 안 붙어요.</p>
                </li>
                <li>
                    <h3>어려우면 힌트 💡</h3>
                    <p>한 번 누르면 쉬운 칸이 <b>반짝</b>, 한 번 더 누르면 ${w('붙여', '써')} 줘요.</p>
                    <p class="h-small">한 판에 4칸은 ${R.hintLimit(4)}번, 6칸은 ${R.hintLimit(6)}번, 9칸은 ${R.hintLimit(9)}번까지 쓸 수 있어요.</p>
                </li>
                <li>
                    <h3>도감을 채워요 📖</h3>
                    <div class="h-book">
                        <span class="shiny"><img class="stk" src="${imgSrc(first[0])}" alt=""></span><img class="stk" src="${imgSrc(first[1])}" alt=""><img class="blank" src="${imgSrc(first[2])}" alt="">
                    </div>
                    <p>판을 다 채우면 새 친구가 도감에 붙어요. <b>어려운 판일수록 귀한 친구</b>를 만나요.</p>
                    <p>힌트도 실수도 없이 깨면 별 3개! 그 친구는 <b>반짝이</b>가 돼요 ✨</p>
                </li>
            </ol>
            <p class="h-more">더 있어요 — ✏️ <b>메모</b>: 빈칸에 작은 숫자로 적어 두기 (6칸·9칸) · 🔢 <b>숫자로</b>: 그림 대신 숫자로 풀기 · ⏸ 시계를 누르면 <b>잠깐 쉬기</b> · ← 를 누르면 <b>나가기</b> · 처음 화면 왼쪽 위 🎵 로 <b>배경음악</b> 끄고 켜기</p>`;
        $('help-done').textContent = helpFrom === 'game' ? '판으로 돌아가기' : '알겠어!';
    }

    function openHelp() {
        helpFrom = view === 'game' && game && !game.done ? 'game' : 'home';
        store.set('help', '1');
        $('open-help').classList.remove('new');
        sfx.tap();
        renderHelp();
        show('help');
    }
    function closeHelp() {
        sfx.tap();
        if (helpFrom === 'game' && game && !game.done) { // 하던 판으로 돌아간다
            show('game');
            layoutGame();
            refresh();
            startClock();
        } else goHome();
    }
    $('open-help').addEventListener('click', openHelp);
    $('buddy-btn').addEventListener('click', openHelp);
    $('help-back').addEventListener('click', closeHelp);
    $('help-done').addEventListener('click', closeHelp);
    if (store.get('help', '') !== '1') $('open-help').classList.add('new'); // 아직 안 본 사람에게는 살짝 눈에 띄게

    // ===== 색종이 =====
    function confetti(count = 110) {
        if (reducedMotion) return;
        const cv = $('confetti'), ctx = cv.getContext('2d');
        const W = window.innerWidth, H = window.innerHeight, dpr = Math.min(2, window.devicePixelRatio || 1);
        cv.width = W * dpr; cv.height = H * dpr;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        const colors = ['#e94740', '#fdd856', '#80c8ee', '#7fdc9a', '#f2a7a1', '#e6a313'];
        const parts = Array.from({ length: count }, () => ({
            x: W * (0.15 + Math.random() * 0.7), y: H * 0.42,
            vx: (Math.random() - 0.5) * 15, vy: -5 - Math.random() * 13,
            r: 4 + Math.random() * 6, rot: Math.random() * 6.28, vr: (Math.random() - 0.5) * 0.4,
            c: colors[Math.floor(Math.random() * colors.length)], star: Math.random() < 0.4,
        }));
        const t0 = performance.now(), LIFE = 2100;
        (function frame(t) {
            const k = (t - t0) / LIFE;
            ctx.clearRect(0, 0, W, H);
            if (k >= 1) return;
            ctx.globalAlpha = Math.max(0, 1 - k * k * k);
            for (const p of parts) {
                p.vy += 0.42; p.vx *= 0.99; p.x += p.vx; p.y += p.vy; p.rot += p.vr;
                ctx.save();
                ctx.translate(p.x, p.y);
                ctx.rotate(p.rot);
                ctx.fillStyle = p.c;
                if (p.star) {
                    ctx.beginPath();
                    for (let i = 0; i < 10; i++) {
                        const a = i * Math.PI / 5, rad = i % 2 ? p.r * 0.5 : p.r * 1.2;
                        ctx.lineTo(Math.sin(a) * rad, -Math.cos(a) * rad);
                    }
                    ctx.fill();
                } else ctx.fillRect(-p.r, -p.r * 0.6, p.r * 2, p.r * 1.2);
                ctx.restore();
            }
            requestAnimationFrame(frame);
        })(t0);
    }

    // ===== 시작 =====
    try { history.replaceState({ v: 'home' }, ''); } catch (e) { }
    renderHome();
    preload(teamOf(teamId).members.map(m => m.id));
    const picked = $('teams').querySelector('[aria-checked="true"]');
    if (picked && picked.scrollIntoView) picked.scrollIntoView({ inline: 'center', block: 'nearest' });
}());
