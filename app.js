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

    const POKE = {};
    TEAMS.forEach(t => t.members.forEach(m => { POKE[m.id] = m; }));
    const ROSTER = TEAMS.flatMap(t => t.members.map(m => m.id));
    const teamOf = id => TEAMS.find(t => t.id === id) || TEAMS[0];
    const imgSrc = id => `images/${id}.webp`;

    let teamId = teamOf(store.get('team', TEAMS[0].id)).id;
    let mode = store.get('mode', 'pic') === 'num' ? 'num' : 'pic';   // 칸에 그림을 보일지 숫자를 보일지
    let muted = store.get('mute', '0') === '1';
    const caught = new Set(store.json('caught', []).filter(id => POKE[id]));
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
            tap: () => tone(660, 0.06, { vol: 0.07 }),
            place: () => { tone(587, 0.09); tone(880, 0.15, { at: 0.07 }); },
            wrong: () => { tone(262, 0.16, { type: 'sine', vol: 0.17, slide: 0.78 }); tone(196, 0.22, { type: 'sine', vol: 0.15, at: 0.13, slide: 0.82 }); },
            unit: () => run([523, 659, 784, 1047], 0.15, { step: 0.07 }),
            hint: () => { tone(988, 0.1, { type: 'sine' }); tone(1319, 0.2, { type: 'sine', at: 0.09 }); },
            win: () => run([523, 659, 784, 1047, 784, 1047, 1319], 0.2, { step: 0.11, vol: 0.15 }),
            reward: () => run([1047, 1319, 1568, 2093], 0.18, { type: 'sine', step: 0.09 }),
        };
    })();

    // ===== 화면 전환 (처음 화면이 바닥, 나머지는 한 칸 위) =====
    const VIEWS = ['home', 'game', 'clear', 'book'];
    let view = 'home';

    function setView(name) {
        if (view === 'game' && name !== 'game') leaveGame();
        VIEWS.forEach(v => { $(v).hidden = v !== name; });
        view = name;
        window.scrollTo(0, 0);
    }
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
            const info = LEVEL_INFO[l.id], b = best[l.id];
            const rec = b
                ? `<span class="st" aria-label="별 ${b.st}개">${'★'.repeat(b.st)}${'☆'.repeat(3 - b.st)}</span> ${R.formatTime(b.s)}`
                : '도전해 봐!';
            return `<button class="lvl" data-level="${l.id}">
                        <span class="lvl-no" aria-hidden="true">${info.lv}</span>
                        <span class="lvl-name">${info.name}</span>
                        <span class="lvl-rec">${rec}</span>
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
        store.setJson('game', { level, size, puzzle, solution, grid, notes, team, ms, hints, mistakes });
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
        enterGame('이어서 해 보자!');
    }
    function enterGame(firstWords) {
        sel = -1; armed = 0; memo = false; hint = null; paused = false; result = null;
        preload(syms().map(m => m.id));
        buildBoard();
        buildTray();
        $('buddy-img').src = imgSrc(syms()[0].id);
        $('pause').hidden = true;
        $('t-memo').hidden = game.size === 4;
        $('t-memo').setAttribute('aria-pressed', 'false');
        setHintButton(false);
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
        const board = $('board');
        board.style.setProperty('--cell', cell + 'px');
        board.style.setProperty('--g', m.g + 'px');
        board.style.setProperty('--bp', m.bp + 'px');
        board.style.setProperty('--G', m.G + 'px');
        board.style.setProperty('--pad', m.pad + 'px');
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
        if (document.hidden) saveGame(); else lastTick = performance.now();
    });
    window.addEventListener('pagehide', saveGame);

    function setPaused(on) {
        if (!game || game.done) return;
        paused = on;
        $('pause').hidden = !on;
        $('g-timer').querySelector('.timer-ico').textContent = on ? '▶' : '⏸';
        $('g-timer').setAttribute('aria-label', on ? '다시 시작' : '잠깐 쉬기');
        if (on) { saveGame(); endDrag(); } else lastTick = performance.now();
        sfx.tap();
    }
    $('g-timer').addEventListener('click', () => setPaused(!paused));
    $('pause').addEventListener('click', () => setPaused(false));
    $('g-back').addEventListener('click', () => { sfx.tap(); goHome(); });

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
            say(hits.length
                ? `${name.length > 3 ? '' : '같은 '}${UNIT_NAME[hits[0].unit]}에 ${josa(name, '이', '가')} 있어!`
                : '음… 거긴 아니야. 다시!', true);
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
        if (hint && hint.idx !== i) setHint(null);
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
            if (hint) setHint(null);
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

    // ----- 힌트: 처음엔 칸만 알려주고, 한 번 더 누르면 붙여 준다 -----
    function setHintButton(again) {
        $('t-hint').classList.toggle('again', again);
        $('t-hint').querySelector('.tool-txt').textContent = again ? w('붙여 줘', '써 줘') : '힌트';
    }
    function setHint(h) {
        hint = h;
        setHintButton(!!h);
    }
    function onHint() {
        if (!game || game.done || paused) return;
        if (hint && game.grid[hint.idx] === 0) {
            const { idx, value } = hint;
            game.hints++;
            setHint(null);
            const name = symName(value);
            place(idx, value);
            if (!game.done) say(name + (hasBatchim(name) ? '이었어!' : '였어!'));
            return;
        }
        const h = E.nextHint(game.grid, game.size, game.solution);
        if (!h) return;
        armed = 0; sel = h.idx;
        setHint(h);
        refresh();
        sfx.hint();
        say(h.reason === 'naked' || h.reason === 'solution'
            ? `반짝이는 칸! ${w('누가 올까?', '몇이 올까?')}`
            : `반짝 칸! ${UNIT_NAME[h.reason]}에 ${w('누가', '뭐가')} 없지?`);
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
        setHintButton(!!hint);
        refresh();
        sfx.tap();
    });

    // ----- 키보드 (PC) -----
    document.addEventListener('keydown', e => {
        if (view !== 'game' || !game || game.done || e.metaKey || e.ctrlKey || e.altKey) return;
        const k = e.key, size = game.size;
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
            if (hint && hint.idx !== i) setHint(null);
            sel = i; armed = 0;
            refresh();
        } else if (/^[1-9]$/.test(k) && +k <= size) {
            onSym(+k);
        } else if (k === 'h' || k === 'H') onHint();
        else if (k === 'm' || k === 'M') toggleMemo();
        else if (k === 'Escape') { sel = -1; armed = 0; setHint(null); refresh(); }
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
        store.del('game');
        const { level, size, ms, hints, mistakes } = game;
        const secs = R.elapsedSeconds(ms), st = R.stars(hints, mistakes);
        const prev = best[level];
        const isBest = !prev || secs < prev.s;
        best[level] = { s: isBest ? secs : prev.s, st: Math.max(st, prev ? prev.st : 0) };
        store.setJson('best', best);
        // 보상: 함께 논 팀의 친구가 도감에 붙는다 (이 게임의 목표)
        const before = caught.size;
        const rewards = R.pickRewards(ROSTER, [...caught], R.rewardCount(size), Math.random, syms().map(m => m.id));
        rewards.forEach(id => caught.add(id));
        store.setJson('caught', [...caught]);
        result = { level, size, secs, hints, mistakes, st, isBest: isBest && !!prev, rewards, before };

        sel = -1; armed = 0; setHint(null);
        refresh();
        cells.forEach((el, i) => { // 판 전체가 대각선으로 물결치듯 폴짝
            el.classList.remove('pop');
            el.style.setProperty('--i', Math.floor(i / size) + i % size);
            el.classList.add('hop');
        });
        sfx.win();
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

        const total = ROSTER.length;
        $('rewards-h').textContent = r.rewards.length ? '새 친구가 도감에 붙었어!' : '도감을 모두 모았어! 👑';
        $('rewards').hidden = !r.rewards.length;
        $('rewards').dataset.n = r.rewards.length;
        $('rewards').innerHTML = r.rewards.map((id, i) =>
            `<div class="reward" style="--i:${i}"><img class="stk" src="${imgSrc(id)}" alt=""><span>${esc(POKE[id].name)}</span></div>`).join('');
        if (r.rewards.length) setTimeout(() => { if (view === 'clear') sfx.reward(); }, reducedMotion ? 0 : 1000);

        // 도감이 얼마나 찼는지: 방금 붙은 만큼 차오른다
        const fill = $('meter-fill');
        fill.style.transition = 'none';
        fill.style.transform = `scaleX(${r.before / total})`;
        void fill.offsetWidth;
        fill.style.transition = '';
        fill.style.transform = `scaleX(${caught.size / total})`;
        $('meter-have').textContent = caught.size;
        $('meter-total').textContent = total;
        $('meter').setAttribute('aria-label', `도감 ${total}마리 중 ${caught.size}마리`);
    }

    $('again-btn').addEventListener('click', () => { sfx.place(); startGame(result ? result.level : 'a1'); });
    $('clear-home').addEventListener('click', () => { sfx.tap(); goHome(); });

    $('clear-book').addEventListener('click', () => { sfx.tap(); renderBook(); show('book'); });

    // ===== 도감 =====
    function renderBook() {
        $('book-have').textContent = caught.size;
        $('book-total').textContent = ROSTER.length;
        $('book-note').textContent = caught.size === ROSTER.length ? '모든 친구를 모았어! 👑'
            : caught.size === 0 ? '판을 완성하면 함께 논 친구가 스티커로 붙어요.'
                : '큰 판을 완성할수록 친구를 더 많이 만나요.';
        $('book-body').innerHTML = TEAMS.map(t => {
            const have = t.members.filter(m => caught.has(m.id)).length;
            return `<section class="book-team">
                <h3>${esc(t.name)} <small>${have}/${t.members.length}</small></h3>
                <div class="book-grid">${t.members.map(m => caught.has(m.id)
                ? `<div class="slot"><img class="stk" src="${imgSrc(m.id)}" alt="" loading="lazy"><span>${esc(m.name)}</span></div>`
                : `<div class="slot blank"><img src="${imgSrc(m.id)}" alt="" loading="lazy"><span>?</span></div>`).join('')}</div>
            </section>`;
        }).join('');
    }

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
