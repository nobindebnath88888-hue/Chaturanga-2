// engine.js — Main game orchestrator: Firebase sync, UI, events

import {
  createInitialBoard, COLORS, TEAMS,
  getLegalMoves,
  applyMove, isInCheck, isCheckmate,
  updateCastlingRights, initCastlingRights,
  squareToAlgebraic
} from './gamelogic.js';
import { BoardRenderer } from './renderer.js';

// ── State ─────────────────────────────────────────────────────────
let db, dbRef, dbSet, dbGet, dbPush, dbOnValue, dbUpdate;
let roomId, myColor, myName;
let renderer;
let gameState = null;
let pendingPromotion = null;

// ── Boot ──────────────────────────────────────────────────────────
export function boot() {
  const interval = setInterval(() => {
    if (window._firebaseDB) {
      clearInterval(interval);
      db        = window._firebaseDB;
      dbRef     = window._firebaseRef;
      dbSet     = window._firebaseSet;
      dbGet     = window._firebaseGet;
      dbPush    = window._firebasePush;
      dbOnValue = window._firebaseOnValue;
      dbUpdate  = window._firebaseUpdate;
      initUI();
    }
  }, 100);
}

// ── UI Init ───────────────────────────────────────────────────────
function initUI() {
  document.querySelectorAll('.color-choice').forEach(el => {
    el.addEventListener('click', () => {
      document.querySelectorAll('.color-choice').forEach(e => e.classList.remove('selected'));
      el.classList.add('selected');
    });
  });
  document.querySelector('[data-color="red"]').classList.add('selected');
  document.getElementById('join-btn').addEventListener('click', handleJoin);
  document.getElementById('player-name-input').addEventListener('keydown', e => { if (e.key === 'Enter') handleJoin(); });
  document.getElementById('room-id-input').addEventListener('keydown', e => { if (e.key === 'Enter') handleJoin(); });
}

// ── Join / Create Room ────────────────────────────────────────────
async function handleJoin() {
  const nameInput = document.getElementById('player-name-input').value.trim();
  if (!nameInput) { setLobbyStatus('Please enter your name!'); return; }

  const selectedColor = document.querySelector('.color-choice.selected')?.dataset?.color;
  if (!selectedColor) { setLobbyStatus('Please select a color!'); return; }

  myName  = nameInput;
  myColor = selectedColor;

  let rid = document.getElementById('room-id-input').value.trim().toUpperCase();
  if (!rid) rid = generateRoomId();

  setLobbyStatus('Connecting...');

  try {
    const roomRef  = dbRef(db, `rooms/${rid}`);
    const snapshot = await dbGet(roomRef);

    if (!snapshot.exists()) {
      const newState = {
        board: createInitialBoard(),
        currentTurn: 'red',
        turnIndex: 0,
        castlingRights: initCastlingRights(),
        enPassantTarget: null,
        eliminated: null,
        players: {},
        createdAt: Date.now()
      };
      newState.players[myColor] = { name: myName, online: true };
      await dbSet(roomRef, newState);
      setLobbyStatus(`Room created! Share this ID: ${rid}`);
    } else {
      const existing = snapshot.val();
      if (existing.players?.[myColor]?.name && existing.players[myColor].name !== myName) {
        setLobbyStatus(`Color ${myColor} is already taken! Choose another.`);
        return;
      }
      await dbUpdate(dbRef(db, `rooms/${rid}/players/${myColor}`), { name: myName, online: true });
      setLobbyStatus(`Joined room ${rid}!`);
    }

    roomId = rid;
    setTimeout(() => enterGameScreen(), 600);

  } catch (err) {
    console.error('Firebase error:', err);
    setLobbyStatus('Connection failed — check your Firebase config in index.html');
  }
}

function setLobbyStatus(msg) {
  document.getElementById('lobby-status').textContent = msg;
}

function generateRoomId() {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

// ── Enter Game Screen ─────────────────────────────────────────────
function enterGameScreen() {
  document.getElementById('lobby-screen').classList.remove('active');
  const gs = document.getElementById('game-screen');
  gs.classList.add('active');
  gs.style.display = 'flex';

  const canvas = document.getElementById('game-canvas');
  fitCanvas(canvas);
  window.addEventListener('resize', () => { fitCanvas(canvas); renderGame(); });

  renderer = new BoardRenderer(canvas);

  const team = TEAMS[myColor];
  document.getElementById('team-label-display').textContent = `TEAM ${team}`;
  document.getElementById('team-label-display').style.color =
    team === 'A' ? 'var(--red-light)' : 'var(--green-light)';

  setupChat();

  canvas.addEventListener('click', handleBoardClick);
  canvas.addEventListener('contextmenu', e => {
    e.preventDefault();
    renderer.clearHighlights();
    renderer.setLegalMoves([]);
    renderGame();
  });

  // All three listeners wired up
  listenToGame();
  listenToChats();
  listenMoveLog();
}

function fitCanvas(canvas) {
  const minDim = Math.min(
    window.innerWidth - 580,
    window.innerHeight - 120
  );
  const size = Math.max(300, Math.min(640, minDim));
  canvas.style.width  = size + 'px';
  canvas.style.height = size + 'px';
}

// ── Firebase: Game State ──────────────────────────────────────────
function listenToGame() {
  dbOnValue(dbRef(db, `rooms/${roomId}`), snapshot => {
    if (!snapshot.exists()) return;
    gameState = snapshot.val();
    gameState.board      = deserializeBoard(gameState.board);
    gameState.eliminated = deserializeEliminated(gameState.eliminated);

    renderGame();
    updatePlayersList();
    updateTurnIndicator();
    updateCheckIndicator();
  });
}

// Firebase strips trailing null entries from arrays — rebuild a full 64-slot board
function deserializeBoard(raw) {
  if (!raw) return Array(64).fill(null);
  const board = Array(64).fill(null);
  if (Array.isArray(raw)) {
    raw.forEach((v, i) => { if (i < 64) board[i] = v || null; });
  } else {
    // Firebase stored as object with numeric string keys
    Object.entries(raw).forEach(([k, v]) => {
      const idx = parseInt(k);
      if (!isNaN(idx) && idx >= 0 && idx < 64) board[idx] = v || null;
    });
  }
  return board;
}

// Firebase stores null for empty arrays; eliminated may be object or array
function deserializeEliminated(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  return Object.values(raw);
}

// ── Firebase: Move Log ────────────────────────────────────────────
function listenMoveLog() {
  dbOnValue(dbRef(db, `rooms/${roomId}/moveLog`), snap => {
    if (!snap.exists()) return;
    const log = document.getElementById('move-log');
    log.innerHTML = '';
    const entries = Object.values(snap.val()).sort((a, b) => a.ts - b.ts);
    entries.forEach(e => {
      const div = document.createElement('div');
      div.className   = `log-entry ${e.color}`;
      div.textContent = e.notation;
      log.appendChild(div);
    });
    log.scrollTop = log.scrollHeight;
  });
}

// ── Firebase: Chat ────────────────────────────────────────────────
function listenToChats() {
  const teamKey = TEAMS[myColor] === 'A' ? 'teamA' : 'teamB';
  dbOnValue(dbRef(db, `rooms/${roomId}/chats/${teamKey}`), snap => {
    renderChatMessages('team-chat-messages', snap.exists() ? snap.val() : null);
  });
  dbOnValue(dbRef(db, `rooms/${roomId}/chats/public`), snap => {
    renderChatMessages('public-chat-messages', snap.exists() ? snap.val() : null);
  });
}

function renderChatMessages(containerId, msgs) {
  const container = document.getElementById(containerId);
  const msgArray  = msgs ? Object.values(msgs).sort((a, b) => a.ts - b.ts) : [];
  container.innerHTML = '';
  msgArray.forEach(msg => {
    const div = document.createElement('div');
    div.className = `chat-msg ${msg.color === myColor ? 'self' : 'other'}${msg.system ? ' system' : ''}`;
    if (msg.system) {
      div.innerHTML = `<span class="msg-text">${escapeHtml(msg.text)}</span>`;
    } else {
      div.innerHTML = `
        <span class="msg-author ${msg.color}">${escapeHtml(msg.name)}</span>
        <span class="msg-text">${escapeHtml(msg.text)}</span>
      `;
    }
    container.appendChild(div);
  });
  container.scrollTop = container.scrollHeight;
}

function setupChat() {
  const wire = (inputId, btnId, channel) => {
    const input = document.getElementById(inputId);
    const btn   = document.getElementById(btnId);
    const send  = () => {
      const txt = input.value.trim();
      if (!txt) return;
      sendChatMessage(channel, txt);
      input.value = '';
    };
    btn.addEventListener('click', send);
    input.addEventListener('keydown', e => { if (e.key === 'Enter') send(); });
  };
  wire('team-chat-input',   'team-send-btn',   'team');
  wire('public-chat-input', 'public-send-btn', 'public');
}

function sendChatMessage(channel, text) {
  const teamKey = TEAMS[myColor] === 'A' ? 'teamA' : 'teamB';
  const chatKey = channel === 'team' ? teamKey : 'public';
  dbPush(dbRef(db, `rooms/${roomId}/chats/${chatKey}`), {
    name: myName, color: myColor, text, ts: Date.now()
  });
}

function sendSystemChat(text) {
  ['teamA', 'teamB', 'public'].forEach(ch => {
    dbPush(dbRef(db, `rooms/${roomId}/chats/${ch}`), {
      system: true, text, ts: Date.now(), color: 'system', name: 'System'
    });
  });
}

// ── Board Click ───────────────────────────────────────────────────
function handleBoardClick(e) {
  if (!gameState) return;
  if (gameState.currentTurn !== myColor) return;
  if (gameState.eliminated?.includes(myColor)) return;

  const sq = renderer.clickToSquare(e.clientX, e.clientY, myColor);
  if (!sq) return;

  const [row, col] = sq;
  const board = gameState.board;
  const piece = board[row * 8 + col];

  if (renderer.selectedSquare) {
    const lm = renderer.legalMoves.find(m => m.to[0] === row && m.to[1] === col);
    if (lm) { executeMove(lm); return; }
  }

  if (piece && piece.color === myColor) {
    renderer.setSelected(sq);
    const ep = gameState.enPassantTarget
      ? [gameState.enPassantTarget[0], gameState.enPassantTarget[1]] : null;
    const moves = getLegalMoves(board, row, col, myColor, ep, gameState.castlingRights);
    renderer.setLegalMoves(moves);
    renderGame();
  } else {
    renderer.clearHighlights();
    renderer.setLegalMoves([]);
    renderGame();
  }
}

function executeMove(move) {
  if (move.promo) {
    pendingPromotion = move;
    showPromotionModal();
  } else {
    commitMove(move, 'Q');
  }
}

function showPromotionModal() {
  const modal   = document.getElementById('promotion-modal');
  const choices = document.getElementById('promotion-choices');
  choices.innerHTML = '';
  ['Q', 'R', 'B', 'N'].forEach(type => {
    const btn     = document.createElement('div');
    btn.className = 'promo-btn';
    const c2      = document.createElement('canvas');
    c2.width = c2.height = 56;
    import('./pieces.js').then(m => m.drawPiece(c2.getContext('2d'), type, myColor, 28, 28, 56));
    btn.appendChild(c2);
    btn.addEventListener('click', () => {
      modal.classList.add('hidden');
      commitMove(pendingPromotion, type);
      pendingPromotion = null;
    });
    choices.appendChild(btn);
  });
  modal.classList.remove('hidden');
}

// ── Commit Move to Firebase ───────────────────────────────────────
async function commitMove(move, promoteTo) {
  if (!gameState) return;
  const board = gameState.board;
  const piece = board[move.from[0] * 8 + move.from[1]];
  if (!piece) return;

  const newBoard    = applyMove(board, move, promoteTo);
  const newCastling = updateCastlingRights(
    gameState.castlingRights || initCastlingRights(), move, board
  );

  let newEP = null;
  if (move.doublePush) {
    newEP = [Math.floor((move.from[0] + move.to[0]) / 2), move.from[1]];
  }

  const eliminated = gameState.eliminated || [];
  let nextIdx = (gameState.turnIndex + 1) % 4;
  for (let i = 0; i < 4; i++) {
    if (!eliminated.includes(COLORS[nextIdx])) break;
    nextIdx = (nextIdx + 1) % 4;
  }
  const nextColor = COLORS[nextIdx];

  const newEliminated = [...eliminated];
  let checkColor = null;

  COLORS.filter(c => c !== myColor && !newEliminated.includes(c)).forEach(c => {
    if (isCheckmate(newBoard, c, newEP, newCastling)) {
      newEliminated.push(c);
      sendSystemChat(`${gameState.players?.[c]?.name || c} has been checkmated! ⚰`);
    } else if (isInCheck(newBoard, c)) {
      checkColor = c;
    }
  });

  const remaining = COLORS.filter(c => !newEliminated.includes(c));
  const teamsLeft = [...new Set(remaining.map(c => TEAMS[c]))];
  const winner    = teamsLeft.length === 1 ? teamsLeft[0] : null;

  const toSq     = squareToAlgebraic(move.to[0], move.to[1]);
  const notation = `${myColor[0].toUpperCase()}: ${piece.type === 'P' ? '' : piece.type}${move.capture ? 'x' : ''}${toSq}${move.promo ? '=' + promoteTo : ''}`;

  // Store eliminated as keyed object — Firebase handles null arrays unreliably
  const elimObj = newEliminated.length
    ? Object.fromEntries(newEliminated.map((c, i) => [i, c]))
    : null;

  const updates = {
    [`rooms/${roomId}/board`]:           newBoard,
    [`rooms/${roomId}/currentTurn`]:     winner ? null : nextColor,
    [`rooms/${roomId}/turnIndex`]:       nextIdx,
    [`rooms/${roomId}/castlingRights`]:  newCastling,
    [`rooms/${roomId}/enPassantTarget`]: newEP,
    [`rooms/${roomId}/eliminated`]:      elimObj,
    [`rooms/${roomId}/lastMove`]:        { from: move.from, to: move.to, color: myColor },
    [`rooms/${roomId}/winner`]:          winner || null,
    [`rooms/${roomId}/inCheck`]:         checkColor || null,
  };

  dbPush(dbRef(db, `rooms/${roomId}/moveLog`), { notation, color: myColor, ts: Date.now() });
  renderer.clearHighlights();
  renderer.setLegalMoves([]);

  await dbUpdate(dbRef(db, '/'), updates);
  if (winner) showWinScreen(winner);
}

// ── Render ────────────────────────────────────────────────────────
function renderGame() {
  if (!gameState || !renderer) return;
  const board = gameState.board;
  if (!board) return;

  if (gameState.lastMove) renderer.setLastMove(gameState.lastMove);

  if (gameState.inCheck) {
    const c = gameState.inCheck;
    for (let i = 0; i < 64; i++) {
      const p = board[i];
      if (p && p.type === 'K' && p.color === c) {
        renderer.setCheckSquare([Math.floor(i / 8), i % 8]);
        break;
      }
    }
  } else {
    renderer.setCheckSquare(null);
  }

  renderer.render(board, myColor, myColor);
}

function updateTurnIndicator() {
  if (!gameState) return;
  const ct = gameState.currentTurn;
  const el = document.getElementById('turn-display');
  if (!ct) { el.textContent = 'Game Over'; return; }
  const playerName = gameState.players?.[ct]?.name || ct;
  el.textContent   = ct === myColor ? '⚡ YOUR TURN' : `${playerName}'s turn`;
  el.style.color   = ct === myColor ? 'var(--gold-shine)' : 'var(--text-secondary)';
}

function updateCheckIndicator() {
  if (!gameState) return;
  const el = document.getElementById('check-display');
  gameState.inCheck === myColor
    ? el.classList.remove('hidden')
    : el.classList.add('hidden');
}

function updatePlayersList() {
  if (!gameState) return;
  const container = document.getElementById('players-list');
  container.innerHTML = '';
  COLORS.forEach(color => {
    const p        = gameState.players?.[color];
    const isElim   = gameState.eliminated?.includes(color);
    const isActive = gameState.currentTurn === color;
    const row      = document.createElement('div');
    row.className  = 'player-row';
    row.innerHTML  = `
      <div class="player-dot ${color}"></div>
      <span class="player-name-label" style="${isElim ? 'opacity:0.4;text-decoration:line-through' : ''}">
        ${p?.name ? escapeHtml(p.name) : '(waiting…)'}
        <small style="color:var(--text-muted);font-size:10px"> ⚔${TEAMS[color]}</small>
      </span>
      <span class="player-status ${isActive && !isElim ? 'active' : ''}">
        ${isElim ? '☠' : isActive ? '▶' : p?.name ? '●' : '○'}
      </span>
    `;
    container.appendChild(row);
  });

  const selfEl       = document.getElementById('self-info');
  selfEl.textContent = `${myName} (${myColor} · Team ${TEAMS[myColor]})`;
  selfEl.style.color = myColor === 'gold' ? 'var(--gold-piece-l)' : `var(--${myColor}-light)`;
}

function showWinScreen(team) {
  const msg = `🏆 TEAM ${team} WINS!`;
  const el  = document.getElementById('turn-display');
  el.textContent = msg;
  el.style.color = 'var(--gold-shine)';
  el.style.fontSize = '18px';
  sendSystemChat(msg);
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
