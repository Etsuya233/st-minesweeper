// ============================================
//  Mini Minesweeper - SillyTavern Extension
// ============================================

(function () {
    const MODULE_NAME = 'mini_minesweeper';

    // ── Constants ─────────────────────────────
    const FAB_MARGIN_RIGHT = 20;
    const FAB_MARGIN_BOTTOM = 80;
    const DRAG_THRESHOLD = 3;
    const LONG_PRESS_MS = 400;
    const CELL_SIZE = 30;
    const CELL_SIZE_MOBILE = 26;
    const MOBILE_BREAKPOINT = 1000;

    // ── Haptic Feedback (cross-platform, defensive) ──────
    function triggerHaptic(style = 'light') {
        try {
            // Android / Chrome: Vibration API
            if (navigator.vibrate) {
                navigator.vibrate(style === 'heavy' ? 50 : 15);
                return;
            }
            // iOS 18+ Safari: clicking a <label> associated with a hidden
            // <input type="checkbox" switch> triggers native haptic feedback.
            // Directly setting .checked does NOT trigger the haptic.
            const label = document.getElementById('ms-haptic-label');
            if (label) label.click();
        } catch (_) { /* never block interaction */ }
    }

    // ── Difficulty Presets ──────────────────────
    const DIFFICULTIES = {
        easy:   { rows: 9,  cols: 9,  mines: 10, label: '初级' },
        medium: { rows: 16, cols: 16, mines: 40, label: '中级' },
        hard:   { rows: 16, cols: 30, mines: 99, label: '高级' },
    };

    // ── Default Settings ───────────────────────
    const defaultSettings = Object.freeze({
        difficulty: 'easy',
        bestTimes: { easy: null, medium: null, hard: null },
        fabEnabled: true,
        fabSize: 52,
        fabOpacity: 100,
        fabOffsetX: 0,
        fabOffsetY: 0,
    });

    // ── Game State ─────────────────────────────
    let board = [];         // 2D array of cell data
    let rows = 9;
    let cols = 9;
    let totalMines = 10;
    let flagsPlaced = 0;
    let revealedCount = 0;
    let gameOver = false;
    let gameStarted = false;
    let timerInterval = null;
    let elapsedSeconds = 0;
    let firstClick = true;

    // ── Settings ───────────────────────────────
    function getSettings() {
        const { extensionSettings } = SillyTavern.getContext();
        if (!extensionSettings[MODULE_NAME]) {
            extensionSettings[MODULE_NAME] = structuredClone(defaultSettings);
        }
        for (const key of Object.keys(defaultSettings)) {
            if (!Object.hasOwn(extensionSettings[MODULE_NAME], key)) {
                extensionSettings[MODULE_NAME][key] = defaultSettings[key];
            }
        }
        return extensionSettings[MODULE_NAME];
    }

    function saveSettings() {
        const { saveSettingsDebounced } = SillyTavern.getContext();
        saveSettingsDebounced();
    }

    // ── FAB Positioning ────────────────────────
    // SillyTavern applies CSS transform on ancestors in mobile mode,
    // which breaks position:fixed + right/bottom. Use left/top instead.
    function updateFabPosition(fab) {
        const settings = getSettings();
        const size = settings.fabSize || 52;
        const baseLeft = window.innerWidth - size - FAB_MARGIN_RIGHT;
        const baseTop = window.innerHeight - size - FAB_MARGIN_BOTTOM;
        const left = baseLeft + (settings.fabOffsetX || 0);
        const top = baseTop + (settings.fabOffsetY || 0);
        fab.style.setProperty('left', left + 'px', 'important');
        fab.style.setProperty('top', top + 'px', 'important');
    }

    function applyFabSettings(fab) {
        const settings = getSettings();
        const size = settings.fabSize || 52;
        fab.style.width = size + 'px';
        fab.style.height = size + 'px';
        fab.style.fontSize = Math.max(14, Math.round(size * 0.46)) + 'px';
        fab.style.opacity = (settings.fabOpacity || 100) / 100;
        fab.style.display = settings.fabEnabled ? 'flex' : 'none';
        updateFabPosition(fab);
    }

    // ── FAB Drag ───────────────────────────────
    function initFabDrag(fab) {
        let isDragging = false;
        let hasMoved = false;
        let startX, startY, origLeft, origTop;

        function onStart(e) {
            isDragging = true;
            hasMoved = false;
            const point = e.touches ? e.touches[0] : e;
            const rect = fab.getBoundingClientRect();
            startX = point.clientX;
            startY = point.clientY;
            origLeft = rect.left;
            origTop = rect.top;
            fab.classList.add('fab-dragging');
            e.preventDefault();
        }

        function onMove(e) {
            if (!isDragging) return;
            const point = e.touches ? e.touches[0] : e;
            const dx = point.clientX - startX;
            const dy = point.clientY - startY;
            if (Math.abs(dx) > DRAG_THRESHOLD || Math.abs(dy) > DRAG_THRESHOLD) hasMoved = true;
            fab.style.setProperty('left', (origLeft + dx) + 'px', 'important');
            fab.style.setProperty('top', (origTop + dy) + 'px', 'important');
        }

        function onEnd(e) {
            if (!isDragging) return;
            isDragging = false;
            fab.classList.remove('fab-dragging');
            if (hasMoved) {
                // Calculate offset from default position and save
                const settings = getSettings();
                const size = settings.fabSize || 52;
                const defaultLeft = window.innerWidth - size - FAB_MARGIN_RIGHT;
                const defaultTop = window.innerHeight - size - FAB_MARGIN_BOTTOM;
                const currentLeft = parseInt(fab.style.left) || 0;
                const currentTop = parseInt(fab.style.top) || 0;
                settings.fabOffsetX = currentLeft - defaultLeft;
                settings.fabOffsetY = currentTop - defaultTop;
                saveSettings();
            } else if (e.type === 'touchend') {
                // On touch devices, preventDefault on touchstart suppresses the
                // synthesized click. Manually trigger toggleWindow for short taps.
                toggleWindow();
            }
        }

        fab.addEventListener('mousedown', onStart);
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onEnd);
        fab.addEventListener('touchstart', onStart, { passive: false });
        document.addEventListener('touchmove', onMove, { passive: false });
        document.addEventListener('touchend', onEnd);

        // Override click: suppress if drag occurred
        fab.addEventListener('click', (e) => {
            if (hasMoved) {
                e.stopImmediatePropagation();
                hasMoved = false;
            }
        }, true);
    }

    // ── DOM Injection ──────────────────────────
    function injectUI() {
        // Hidden input + label for iOS haptic feedback hack
        // Safari emits haptic when a <label> associated with <input switch> is clicked
        const hapticHack = document.createElement('input');
        hapticHack.type = 'checkbox';
        hapticHack.id = 'ms-haptic-hack';
        hapticHack.setAttribute('switch', '');
        hapticHack.style.cssText = 'position:fixed;top:-9999px;left:-9999px;opacity:0;pointer-events:none;';
        document.body.appendChild(hapticHack);
        const hapticLabel = document.createElement('label');
        hapticLabel.id = 'ms-haptic-label';
        hapticLabel.setAttribute('for', 'ms-haptic-hack');
        hapticLabel.style.cssText = 'position:fixed;top:-9999px;left:-9999px;opacity:0;pointer-events:none;';
        document.body.appendChild(hapticLabel);

        // FAB Button
        const fab = document.createElement('button');
        fab.id = 'minesweeper-fab';
        fab.textContent = '💣';
        fab.title = 'Mini Minesweeper';
        fab.addEventListener('click', toggleWindow);
        document.body.appendChild(fab);
        applyFabSettings(fab);
        initFabDrag(fab);
        window.addEventListener('resize', () => updateFabPosition(fab));

        // Floating Window
        const win = document.createElement('div');
        win.id = 'minesweeper-window';
        win.innerHTML = `
            <div id="minesweeper-titlebar">
                <span class="ms-title"><span class="ms-title-icon">💣</span>扫雷</span>
                <div class="ms-titlebar-buttons">
                    <button class="ms-titlebar-btn ms-minimize" title="最小化">─</button>
                    <button class="ms-titlebar-btn ms-close" title="关闭">✕</button>
                </div>
            </div>
            <div id="minesweeper-toolbar">
                <div class="ms-counter ms-mine-counter" title="剩余地雷">
                    <span>🚩</span><span id="ms-mine-count">10</span>
                </div>
                <button id="minesweeper-face-btn" title="重新开始">😊</button>
                <div class="ms-counter ms-timer" title="用时">
                    <span>⏱</span><span id="ms-timer">000</span>
                </div>
            </div>
            <div id="minesweeper-difficulty-bar">
                <button class="ms-diff-btn active" data-diff="easy">初级</button>
                <button class="ms-diff-btn" data-diff="medium">中级</button>
                <button class="ms-diff-btn" data-diff="hard">高级</button>
            </div>
            <div id="minesweeper-board-container">
                <div id="minesweeper-board"></div>
            </div>
            <div id="minesweeper-statusbar">
                最佳: <span class="ms-best-time" id="ms-best-time">--</span>
            </div>
            <div class="ms-game-overlay" id="minesweeper-overlay">
                <div class="ms-overlay-emoji" id="ms-overlay-emoji">🎉</div>
                <div class="ms-overlay-text" id="ms-overlay-text">恭喜!</div>
                <div class="ms-overlay-subtext" id="ms-overlay-subtext"></div>
                <button class="ms-overlay-btn" id="ms-overlay-btn">再来一局</button>
            </div>
        `;
        document.body.appendChild(win);

        // Event listeners
        win.querySelector('.ms-close').addEventListener('click', hideWindow);
        win.querySelector('.ms-minimize').addEventListener('click', hideWindow);
        win.querySelector('#minesweeper-face-btn').addEventListener('click', newGame);
        win.querySelector('#ms-overlay-btn').addEventListener('click', () => {
            hideOverlay();
            newGame();
        });

        // Difficulty buttons
        win.querySelectorAll('.ms-diff-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const diff = btn.dataset.diff;
                win.querySelectorAll('.ms-diff-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                const settings = getSettings();
                settings.difficulty = diff;
                saveSettings();
                newGame();
            });
        });

        // Drag support
        initDrag(win, win.querySelector('#minesweeper-titlebar'));

        // Init difficulty from settings
        const settings = getSettings();
        const savedDiff = settings.difficulty || 'easy';
        win.querySelectorAll('.ms-diff-btn').forEach(b => {
            b.classList.toggle('active', b.dataset.diff === savedDiff);
        });
    }

    // ── Window Visibility ──────────────────────
    function toggleWindow() {
        const win = document.getElementById('minesweeper-window');
        if (win.classList.contains('visible')) {
            hideWindow();
        } else {
            showWindow();
        }
    }

    function showWindow() {
        const win = document.getElementById('minesweeper-window');
        // Reset position to center if not dragged
        if (!win.classList.contains('dragged')) {
            win.style.top = '50%';
            win.style.left = '50%';
        }
        win.classList.add('visible');
        if (!gameStarted && revealedCount === 0) {
            newGame();
        }
    }

    function hideWindow() {
        const win = document.getElementById('minesweeper-window');
        win.classList.remove('visible');
    }

    function showOverlay(emoji, text, subtext) {
        const overlay = document.getElementById('minesweeper-overlay');
        document.getElementById('ms-overlay-emoji').textContent = emoji;
        document.getElementById('ms-overlay-text').textContent = text;
        document.getElementById('ms-overlay-subtext').textContent = subtext;
        overlay.classList.add('visible');
    }

    function hideOverlay() {
        document.getElementById('minesweeper-overlay').classList.remove('visible');
    }

    // ── Drag Implementation ────────────────────
    function initDrag(win, handle) {
        let isDragging = false;
        let startX, startY, origX, origY;

        function onStart(e) {
            // Ignore button clicks in titlebar
            if (e.target.closest('.ms-titlebar-btn')) return;
            isDragging = true;
            const point = e.touches ? e.touches[0] : e;
            const rect = win.getBoundingClientRect();

            // On first drag, switch from centered mode to absolute positioned
            if (!win.classList.contains('dragged')) {
                win.classList.add('dragged');
                win.style.top = rect.top + 'px';
                win.style.left = rect.left + 'px';
            }

            startX = point.clientX;
            startY = point.clientY;
            origX = rect.left;
            origY = rect.top;
            e.preventDefault();
        }

        function onMove(e) {
            if (!isDragging) return;
            const point = e.touches ? e.touches[0] : e;
            const dx = point.clientX - startX;
            const dy = point.clientY - startY;
            win.style.left = (origX + dx) + 'px';
            win.style.top = (origY + dy) + 'px';
        }

        function onEnd() {
            isDragging = false;
        }

        handle.addEventListener('mousedown', onStart);
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onEnd);
        handle.addEventListener('touchstart', onStart, { passive: false });
        document.addEventListener('touchmove', onMove, { passive: false });
        document.addEventListener('touchend', onEnd);
    }

    // ── Game Logic ─────────────────────────────

    function newGame() {
        const settings = getSettings();
        const diff = DIFFICULTIES[settings.difficulty] || DIFFICULTIES.easy;
        rows = diff.rows;
        cols = diff.cols;
        totalMines = diff.mines;
        flagsPlaced = 0;
        revealedCount = 0;
        gameOver = false;
        gameStarted = false;
        firstClick = true;
        stopTimer();
        elapsedSeconds = 0;

        // Init board data
        board = [];
        for (let r = 0; r < rows; r++) {
            board[r] = [];
            for (let c = 0; c < cols; c++) {
                board[r][c] = {
                    mine: false,
                    revealed: false,
                    flagged: false,
                    number: 0,
                    _wrongFlag: false,
                    _exploded: false,
                };
            }
        }

        updateMineCount();
        updateTimer();
        updateFace('😊');
        updateBestTime();
        hideOverlay();
        renderBoard();
    }

    function placeMines(excludeR, excludeC) {
        // Place mines randomly, excluding the first-clicked cell and its neighbors
        let placed = 0;
        const excluded = new Set();
        for (let dr = -1; dr <= 1; dr++) {
            for (let dc = -1; dc <= 1; dc++) {
                const nr = excludeR + dr;
                const nc = excludeC + dc;
                if (nr >= 0 && nr < rows && nc >= 0 && nc < cols) {
                    excluded.add(nr * cols + nc);
                }
            }
        }

        const available = rows * cols - excluded.size;
        const minesToPlace = Math.min(totalMines, available);
        while (placed < minesToPlace) {
            const r = Math.floor(Math.random() * rows);
            const c = Math.floor(Math.random() * cols);
            const idx = r * cols + c;
            if (!board[r][c].mine && !excluded.has(idx)) {
                board[r][c].mine = true;
                placed++;
            }
        }

        // Calculate numbers
        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                if (board[r][c].mine) continue;
                let count = 0;
                forEachNeighbor(r, c, (nr, nc) => {
                    if (board[nr][nc].mine) count++;
                });
                board[r][c].number = count;
            }
        }
    }

    function forEachNeighbor(r, c, fn) {
        for (let dr = -1; dr <= 1; dr++) {
            for (let dc = -1; dc <= 1; dc++) {
                if (dr === 0 && dc === 0) continue;
                const nr = r + dr;
                const nc = c + dc;
                if (nr >= 0 && nr < rows && nc >= 0 && nc < cols) {
                    fn(nr, nc);
                }
            }
        }
    }

    function revealCell(r, c) {
        if (gameOver) return;
        const cell = board[r][c];
        if (cell.revealed || cell.flagged) return;

        if (firstClick) {
            firstClick = false;
            placeMines(r, c);
            startTimer();
            gameStarted = true;
        }

        // Direct mine hit
        if (cell.mine) {
            cell.revealed = true;
            revealedCount++;
            gameOver = true;
            stopTimer();
            updateFace('😵');
            revealAllMines(r, c);
            setTimeout(() => {
                showOverlay('💥', '游戏结束', `用时 ${elapsedSeconds} 秒`);
            }, 400);
            return;
        }

        // BFS flood fill (avoids recursive stack overflow on large boards)
        const queue = [[r, c]];
        while (queue.length) {
            const [cr, cc] = queue.shift();
            const current = board[cr][cc];
            if (current.revealed || current.flagged) continue;

            current.revealed = true;
            revealedCount++;
            updateCellDOM(cr, cc);

            if (current.number === 0) {
                forEachNeighbor(cr, cc, (nr, nc) => {
                    if (!board[nr][nc].revealed && !board[nr][nc].flagged) {
                        queue.push([nr, nc]);
                    }
                });
            }
        }

        // Check win
        if (revealedCount === rows * cols - totalMines) {
            gameOver = true;
            stopTimer();
            gameStarted = false;
            updateFace('😎');

            // Save best time
            const settings = getSettings();
            const diff = settings.difficulty;
            const best = settings.bestTimes[diff];
            if (best === null || elapsedSeconds < best) {
                settings.bestTimes[diff] = elapsedSeconds;
                saveSettings();
            }
            updateBestTime();

            setTimeout(() => {
                showOverlay('🎉', '恭喜通关!', `用时 ${elapsedSeconds} 秒`);
            }, 300);
        }
    }

    function toggleFlag(r, c) {
        if (gameOver) return;
        const cell = board[r][c];
        if (cell.revealed) return;

        cell.flagged = !cell.flagged;
        flagsPlaced += cell.flagged ? 1 : -1;
        updateMineCount();
        updateCellDOM(r, c);
    }

    // Chord reveal: click on a revealed number cell to auto-reveal neighbors
    // if the surrounding flag count matches the number
    function chordReveal(r, c) {
        if (gameOver) return;
        const cell = board[r][c];
        if (!cell.revealed || cell.number === 0) return;

        // Count flags around this cell
        let flagCount = 0;
        forEachNeighbor(r, c, (nr, nc) => {
            if (board[nr][nc].flagged) flagCount++;
        });

        // Only chord if flags match the number
        if (flagCount !== cell.number) return;

        // Reveal all unflagged, unrevealed neighbors
        forEachNeighbor(r, c, (nr, nc) => {
            const neighbor = board[nr][nc];
            if (!neighbor.revealed && !neighbor.flagged) {
                revealCell(nr, nc);
            }
        });
        renderBoardState();
    }

    // Unified click handler: reveal if covered, chord if already a number
    function handleCellClick(r, c) {
        const cell = board[r][c];
        if (cell.revealed && cell.number > 0) {
            chordReveal(r, c);
        } else {
            revealCell(r, c);
            renderBoardState();
        }
    }

    function revealAllMines(explodedR, explodedC) {
        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                const cell = board[r][c];
                if (cell.mine && !cell.flagged) {
                    cell.revealed = true;
                }
                // Show wrong flags
                if (cell.flagged && !cell.mine) {
                    cell._wrongFlag = true;
                }
                if (r === explodedR && c === explodedC) {
                    cell._exploded = true;
                }
                updateCellDOM(r, c);
            }
        }
    }

    // ── Rendering ──────────────────────────────

    function renderBoard() {
        const boardEl = document.getElementById('minesweeper-board');
        boardEl.innerHTML = '';
        boardEl.style.gridTemplateColumns = `repeat(${cols}, ${CELL_SIZE}px)`;
        boardEl.style.gridTemplateRows = `repeat(${rows}, ${CELL_SIZE}px)`;

        // Adjust cell size on smaller screens
        if (window.innerWidth <= MOBILE_BREAKPOINT) {
            boardEl.style.gridTemplateColumns = `repeat(${cols}, ${CELL_SIZE_MOBILE}px)`;
            boardEl.style.gridTemplateRows = `repeat(${rows}, ${CELL_SIZE_MOBILE}px)`;
        }

        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                const cellEl = document.createElement('div');
                cellEl.className = 'ms-cell covered';
                cellEl.dataset.row = r;
                cellEl.dataset.col = c;
                boardEl.appendChild(cellEl);
            }
        }
    }

    // ── Board Event Delegation (called once) ──
    function initBoardEvents() {
        const boardEl = document.getElementById('minesweeper-board');
        let longPressTimer = null;
        let longPressTriggered = false;
        let pointerMoved = false;
        let startPointerX = 0;
        let startPointerY = 0;
        let activeCell = null;

        boardEl.addEventListener('pointerdown', (e) => {
            const cellEl = e.target.closest('.ms-cell');
            if (!cellEl) return;
            boardEl.setPointerCapture(e.pointerId);
            activeCell = cellEl;
            longPressTriggered = false;
            pointerMoved = false;
            startPointerX = e.clientX;
            startPointerY = e.clientY;
            const r = +cellEl.dataset.row, c = +cellEl.dataset.col;
            longPressTimer = setTimeout(() => {
                longPressTriggered = true;
                toggleFlag(r, c);
                // Android: vibrate works in setTimeout
                if (navigator.vibrate) triggerHaptic('heavy');
            }, LONG_PRESS_MS);
        });

        boardEl.addEventListener('pointermove', (e) => {
            if (!activeCell) return;
            const dx = e.clientX - startPointerX;
            const dy = e.clientY - startPointerY;
            if (Math.abs(dx) > 5 || Math.abs(dy) > 5) {
                pointerMoved = true;
                clearTimeout(longPressTimer);
            }
        });

        boardEl.addEventListener('pointerup', (e) => {
            if (!activeCell) return;
            clearTimeout(longPressTimer);
            const cellEl = activeCell;
            activeCell = null;
            if (longPressTriggered) {
                // iOS: label.click() needs direct user-gesture context,
                // so fire haptic here on pointerup instead of in setTimeout
                if (!navigator.vibrate) triggerHaptic('heavy');
                return;
            }
            if (pointerMoved) return;
            const r = +cellEl.dataset.row, c = +cellEl.dataset.col;
            handleCellClick(r, c);
            triggerHaptic('light');
        });

        boardEl.addEventListener('pointercancel', () => {
            clearTimeout(longPressTimer);
            activeCell = null;
        });

        // Right-click flag (desktop)
        boardEl.addEventListener('contextmenu', (e) => {
            const cellEl = e.target.closest('.ms-cell');
            if (!cellEl) return;
            e.preventDefault();
            const r = +cellEl.dataset.row, c = +cellEl.dataset.col;
            toggleFlag(r, c);
        });

        // Prevent text selection & touch callout on long press
        boardEl.addEventListener('touchstart', (e) => {
            if (e.target.closest('.ms-cell')) e.preventDefault();
        }, { passive: false });
    }

    function renderBoardState() {
        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                updateCellDOM(r, c);
            }
        }
    }

    function updateCellDOM(r, c) {
        const cell = board[r][c];
        const boardEl = document.getElementById('minesweeper-board');
        const idx = r * cols + c;
        const cellEl = boardEl.children[idx];
        if (!cellEl) return;

        // Reset classes
        cellEl.className = 'ms-cell';
        cellEl.textContent = '';
        cellEl.removeAttribute('data-number');

        if (cell._exploded) {
            cellEl.classList.add('mine-exploded');
            cellEl.textContent = '💥';
        } else if (cell._wrongFlag) {
            cellEl.classList.add('wrong-flag');
            cellEl.textContent = '❌';
        } else if (cell.flagged) {
            cellEl.classList.add('flagged');
            cellEl.textContent = '🚩';
        } else if (!cell.revealed) {
            cellEl.classList.add('covered');
        } else if (cell.mine) {
            cellEl.classList.add('mine-shown');
            cellEl.textContent = '💣';
        } else {
            cellEl.classList.add('revealed');
            if (cell.number > 0) {
                cellEl.textContent = cell.number;
                cellEl.dataset.number = cell.number;
            }
        }
    }

    // ── Timer ──────────────────────────────────

    function startTimer() {
        stopTimer();
        elapsedSeconds = 0;
        timerInterval = setInterval(() => {
            elapsedSeconds++;
            updateTimer();
            if (elapsedSeconds >= 999) stopTimer();
        }, 1000);
    }

    function stopTimer() {
        if (timerInterval) {
            clearInterval(timerInterval);
            timerInterval = null;
        }
    }

    function updateTimer() {
        const el = document.getElementById('ms-timer');
        if (el) el.textContent = String(elapsedSeconds).padStart(3, '0');
    }

    function updateMineCount() {
        const el = document.getElementById('ms-mine-count');
        if (el) el.textContent = String(totalMines - flagsPlaced).padStart(3, '0');
    }

    function updateFace(emoji) {
        const el = document.getElementById('minesweeper-face-btn');
        if (el) el.textContent = emoji;
    }

    function updateBestTime() {
        const el = document.getElementById('ms-best-time');
        if (!el) return;
        const settings = getSettings();
        const best = settings.bestTimes[settings.difficulty];
        el.textContent = best !== null ? `${best}s` : '--';
    }

    // ── Settings Panel ─────────────────────────

    function injectSettings() {
        const container = document.getElementById('extensions_settings2');
        if (!container) return;

        const settings = getSettings();
        const html = `
        <div class="ms-settings-block">
            <div class="inline-drawer">
                <div class="inline-drawer-toggle inline-drawer-header">
                    <b>💣 Mini Minesweeper</b>
                    <div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div>
                </div>
                <div class="inline-drawer-content">
                    <div class="ms-settings-group">
                        <label class="ms-setting-row">
                            <span>启用扫雷按钮</span>
                            <input type="checkbox" id="ms-set-fab-enabled" ${settings.fabEnabled ? 'checked' : ''} />
                        </label>
                        <label class="ms-setting-row">
                            <span>按钮大小</span>
                            <span class="ms-range-value" id="ms-set-fab-size-val">${settings.fabSize}</span>
                            <input type="range" id="ms-set-fab-size" min="32" max="80" value="${settings.fabSize}" />
                        </label>
                        <label class="ms-setting-row">
                            <span>按钮透明度</span>
                            <span class="ms-range-value" id="ms-set-fab-opacity-val">${settings.fabOpacity}%</span>
                            <input type="range" id="ms-set-fab-opacity" min="20" max="100" value="${settings.fabOpacity}" />
                        </label>

                        <div class="ms-setting-row ms-setting-actions">
                            <button id="ms-set-reset-pos" class="menu_button menu_button_default">重置位置</button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
        `;
        container.insertAdjacentHTML('beforeend', html);

        // ── Event bindings ──
        const fab = document.getElementById('minesweeper-fab');

        document.getElementById('ms-set-fab-enabled').addEventListener('change', (e) => {
            const s = getSettings();
            s.fabEnabled = e.target.checked;
            saveSettings();
            if (fab) applyFabSettings(fab);
        });

        document.getElementById('ms-set-fab-size').addEventListener('input', (e) => {
            const s = getSettings();
            s.fabSize = parseInt(e.target.value);
            document.getElementById('ms-set-fab-size-val').textContent = s.fabSize;
            saveSettings();
            if (fab) applyFabSettings(fab);
        });

        document.getElementById('ms-set-fab-opacity').addEventListener('input', (e) => {
            const s = getSettings();
            s.fabOpacity = parseInt(e.target.value);
            document.getElementById('ms-set-fab-opacity-val').textContent = s.fabOpacity + '%';
            saveSettings();
            if (fab) applyFabSettings(fab);
        });



        document.getElementById('ms-set-reset-pos').addEventListener('click', () => {
            const s = getSettings();
            s.fabOffsetX = 0;
            s.fabOffsetY = 0;
            saveSettings();
            if (fab) applyFabSettings(fab);

            // Also reset the game window position
            const win = document.getElementById('minesweeper-window');
            if (win) {
                win.classList.remove('dragged');
                win.style.removeProperty('top');
                win.style.removeProperty('left');
                win.style.removeProperty('transform');
            }
        });
    }

    // ── Init ───────────────────────────────────

    function init() {
        injectUI();
        initBoardEvents();
        injectSettings();
        newGame();
        console.log('[Mini Minesweeper] Extension loaded ✓');
    }

    // Wait for jQuery / DOM ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
