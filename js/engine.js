// engine.js — Main game orchestrator: Firebase sync, UI, events

import {
  createInitialBoard, COLORS, TEAMS,
  getLegalMoves, getAllLegalMoves,
  applyMove, isInCheck, isCheckmate, isStalemate,
  updateCastlingRights, initCastlingRights,
  moveToNotation, squareToAlgebraic
} from './gamelogic.js';
import { BoardRenderer } from './renderer.js';

// ── State ────────────────────────────────────────────────────────
let db, dbRef, dbSet, dbGet, dbPush, dbOnValue, dbUpdate, dbTimestamp;
let roomId, myColor, myName;
let renderer;
let gameState = null; // synced from Firebase
let pendingPromotion = null;

// ── Boot ─────────────────────────────────────────────────────────
export function boot() {
  // Wait for Firebase
  const interval = setInterval(() => {
    if(window._firebaseDB) {
      clearInterval(interval);
      db          = window._firebaseDB;
      dbRef       = window._firebaseRef;
      dbSet       = window._firebaseSet;
      dbGet       = window._firebaseGet;
      dbPush      = window._firebasePush;
      dbOnValue   = window._firebaseOnValue;
      dbUpdate    = window._firebaseUpdate;
      dbTimestamp = window._firebaseTimestamp;
      initUI();
    }
  }, 100);
}

// ── UI Init ───────────────────────────────────────────────────────
function initUI() {
  // Color selection
  document.querySelectorAll('.color-choice').forEach(el => {
    el.addEventListener('click', () => {
      document.querySelectorAll('.color-choice').forEach(e=>e.classList.remove('selected'));
      el.classList.add('selected');
    });
  });

  // Default select red
  document.querySelector('[data-color="red"]').classList.add('selected');

  // Join button
  document.getElementById('join-btn').addEventListener('click', handleJoin);

  // Enter key on inputs
  document.getElementById('player-name-input').addEventListener('keydown', e => {
    if(e.key==='Enter') handleJoin();
  });
  document.getElementById('room-id-input').addEventListener('keydown', e => {
    if(e.key==='Enter') handleJoin();
  });
}

// ── Join / Create Room ────────────────────────────────────────────
async function handleJoin() {
  const nameInput = document.getElementById('player-name-input').value.trim();
  if(!nameInput) {
    setLobbyStatus('Please enter your name!');
    return;
  }
  const selectedColor = document.querySelector('.color-choice.selected')?.dataset?.color;
  if(!selectedColor) {
    setLobbyStatus('Please select a color!');
    return;
  }

  myName  = nameInput;
  myColor = selectedColor;

  let rid = document.getElementById('room-id-input').value.trim().toUpperCase();
  if(!rid) rid = generateRoomId();

  setLobbyStatus('Connecting...');

  try {
    const roomRef  = dbRef(db, `rooms/${rid}`);
    const snapshot = await dbGet(roomRef);

    if(!snapshot.exists()) {
      // Create new room
      const newState = {
        board: createInitialBoard(),
        currentTurn: 'red',
        turnIndex: 0,
        castlingRights: initCastlingRights(),
        enPassantTarget: null,
        eliminated: [],
        players: {},
        createdAt: Date.now()
      };
      newState.players[myColor] = { name: myName, online: true };
      await dbSet(roomRef, newState);
      setLobbyStatus(`Room created! ID: ${rid}`);
    } else {
      const existing = snapshot.val();
      if(existing.players && existing.players[myColor] && existing.players[myColor].name &&
         existing.players[myColor].name !== myName) {
        setLobbyStatus(`Color ${myColor} already taken! Choose another.`);
        return;
      }
      await dbUpdate(dbRef(db, `rooms/${rid}/players/${myColor}`), { name: myName, online: true });
      setLobbyStatus(`Joined room ${rid}!`);
    }

    roomId = rid;
    setTimeout(() => enterGameScreen(), 600);

  } catch(err) {
    console.error(err);
    setLobbyStatus('Connection failed. Check Firebase config.');
  }
}

function setLobbyStatus(msg) {
  document.getElementById('lobby-status').textContent = msg;
}

function generateRoomId() {
  return Math.random().toString(36).substring(2,8).toUpperCase();
}

// ── Enter Game Screen ─────────────────────────────────────────────
function enterGameScreen() {
  document.getElementById('lobby-screen').classList.remove('active');
  const gs = document.getElementById('game-screen');
  gs.classList.add('active');
  gs.style.display = 'flex';

  // Canvas setup
  const canvas = document.getElementById('game-canvas');
  fitCanvas(canvas);
  window.addEventListener('resize', () => fitCanvas(canvas));

  renderer = new BoardRenderer(canvas);

  // Team badge
  const team = TEAMS[myColor];
  document.getElementById('team-label-display').textContent = `TEAM ${team}`;
  document.getElementById('team-label-display').style.color =
    team==='A' ? 'var(--red-light)' : 'var(--green-light)';

  // Chat events
  setupChat();

  // Board click
  canvas.addEventListener('click', handleBoardClick);
  canvas.addEventListener('contextmenu', e => { e.preventDefault(); renderer.clearHighlights(); renderGame(); });

  // Firebase listeners
  listenToGame();
  listenToChats();
}

function fitCanvas(canvas) {
  const minDim = Math.min(
    window.innerWidth - 640, // subtract both side panels
    window.innerHeight - 140
  );
  const size = Math.max(320, Math.min(640, minDim));
  canvas.style.width  = size + 'px';
  canvas.style.height = size + 'px';
}

// ── Firebase Game Listener ────────────────────────────────────────
function listenToGame() {
  dbOnValue(dbRef(db, `rooms/${roomId}`), snapshot => {
    if(!snapshot.exists()) return;
    gameState = snapshot.val();

    // Deserialize board (Firebase may store nulls oddly)
    if(gameState.board && !Array.isArray(gameState.board)) {
      gameState.board = Object.values(gameState.board);
    }
    // Fill any missing indices with null
    if(Array.isArray(gameState.board)) {
      while(gameState.board.length<64) gameState.board.push(null);
    }

    renderGame();
    updatePlayersList();
    updateTurnIndicator();
    updateCheckIndicator();
  });
}

// ── Chat Listeners ────────────────────────────────────────────────
function listenToChats() {
  // Team chat
  const myTeam = TEAMS[myColor];
  const teamKey = myTeam==='A' ? 'teamA' : 'teamB';
  dbOnValue(dbRef(db, `rooms/${roomId}/chats/${teamKey}`), snap => {
    if(!snap.exists()) return;
    const msgs = snap.val();
    renderChatMessages('team-chat-messages', msgs);
  });

  // Public chat
  dbOnValue(dbRef(db, `rooms/${roomId}/chats/public`), snap => {
    if(!snap.exists()) return;
    const msgs = snap.val();
    renderChatMessages('public-chat-messages', msgs);
  });
}

function renderChatMessages(containerId, msgs) {
  const container = document.getElementById(containerId);
  const msgArray = msgs ? Object.values(msgs).sort((a,b)=>a.ts-b.ts) : [];
  container.innerHTML = '';
  msgArray.forEach(msg => {
    const div = document.createElement('div');
    div.className = `chat-msg ${msg.color===myColor?'self':'other'}${msg.system?' system':''}`;

    if(msg.system) {
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
  // Team chat
  const teamInput = document.getElementById('team-chat-input');
  const teamBtn   = document.getElementById('team-send-btn');
  const sendTeam  = () => {
    const txt = teamInput.value.trim();
    if(!txt) return;
    sendChatMessage('team', txt);
    teamInput.value = '';
  };
  teamBtn.addEventListener('click', sendTeam);
  teamInput.addEventListener('keydown', e => { if(e.key==='Enter') sendTeam(); });

  // Public chat
  const pubInput = document.getElementById('public-chat-input');
  const pubBtn   = document.getElementById('public-send-btn');
  const sendPub  = () => {
    const txt = pubInput.value.trim();
    if(!txt) return;
    sendChatMessage('public', txt);
    pubInput.value = '';
  };
  pubBtn.addEventListener('click', sendPub);
  pubInput.addEventListener('keydown', e => { if(e.key==='Enter') sendPub(); });
}

function sendChatMessage(channel, text) {
  const myTeam = TEAMS[myColor];
  const teamKey = myTeam==='A' ? 'teamA' : 'teamB';
  const chatKey = channel==='team' ? teamKey : 'public';

  dbPush(dbRef(db, `rooms/${roomId}/chats/${chatKey}`), {
    name: myName,
    color: myColor,
    text,
    ts: Date.now()
  });
}

// ── Board Click Handling ──────────────────────────────────────────
function handleBoardClick(e) {
  if(!gameState) return;
  if(gameState.currentTurn !== myColor) return;
  if(gameState.eliminated && gameState.eliminated.includes(myColor)) return;

  const sq = renderer.clickToSquare(e.clientX, e.clientY, myColor);
  if(!sq) return;

  const [row, col] = sq;
  const board = gameState.board;
  const piece = board[row*8+col];

  // If we have a selected square, try to move
  if(renderer.selectedSquare) {
    const lm = renderer.legalMoves.find(m=>m.to[0]===row&&m.to[1]===col);
    if(lm) {
      executeMove(lm);
      return;
    }
  }

  // Select piece
  if(piece && piece.color === myColor) {
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
  if(move.promo) {
    pendingPromotion = move;
    showPromotionModal();
    return;
  }
  commitMove(move, 'Q');
}

function showPromotionModal() {
  const modal = document.getElementById('promotion-modal');
  const choices = document.getElementById('promotion-choices');
  choices.innerHTML = '';
  ['Q','R','B','N'].forEach(type => {
    const btn = document.createElement('div');
    btn.className = 'promo-btn';
    const canvas2 = document.createElement('canvas');
    canvas2.width = 56; canvas2.height = 56;
    const ctx2 = canvas2.getContext('2d');
    import('./pieces.js').then(m => m.drawPiece(ctx2, type, myColor, 28, 28, 56));
    btn.appendChild(canvas2);
    btn.addEventListener('click', () => {
      modal.classList.add('hidden');
      commitMove(pendingPromotion, type);
      pendingPromotion = null;
    });
    choices.appendChild(btn);
  });
  modal.classList.remove('hidden');
}

async function commitMove(move, promoteTo) {
  if(!gameState) return;
  const board = gameState.board;
  const piece = board[move.from[0]*8+move.from[1]];

  const newBoard = applyMove(board, move, promoteTo);
  const newCastling = updateCastlingRights(gameState.castlingRights, move, board);

  // En passant target
  let newEP = null;
  if(move.doublePush) {
    newEP = [
      Math.floor((move.from[0]+move.to[0])/2),
      move.from[1]
    ];
  }

  // Advance turn (skip eliminated players)
  const eliminated = gameState.eliminated || [];
  let nextIdx = (gameState.turnIndex + 1) % 4;
  let safety = 0;
  while(eliminated.includes(COLORS[nextIdx]) && safety<4) {
    nextIdx = (nextIdx+1)%4;
    safety++;
  }
  const nextColor = COLORS[nextIdx];

  // Check/checkmate detection for next players
  const newEliminated = [...eliminated];
  let checkColor = null;

  // Check each remaining player for checkmate
  const remaining = COLORS.filter(c=>!newEliminated.includes(c));
  remaining.forEach(c => {
    if(c === myColor) return;
    if(isCheckmate(newBoard, c, newEP, newCastling)) {
      newEliminated.push(c);
      // Log it
      addMoveLog(`${c.toUpperCase()} is checkmated!`, 'system');
      sendSystemChat(`${gameState.players?.[c]?.name||c} has been checkmated! ⚰`);
    } else if(isInCheck(newBoard, c)) {
      checkColor = c;
    }
  });

  // Check team win condition
  const remainingAfter = COLORS.filter(c=>!newEliminated.includes(c));
  let winner = null;
  const teamsLeft = [...new Set(remainingAfter.map(c=>TEAMS[c]))];
  if(teamsLeft.length===1) winner = teamsLeft[0];

  // Notation
  const fromSq = squareToAlgebraic(move.from[0], move.from[1]);
  const toSq   = squareToAlgebraic(move.to[0],   move.to[1]);
  const notation = `${myColor[0].toUpperCase()}: ${piece.type==='P'?'':piece.type}${move.capture?'x':''}${toSq}`;

  // Push to Firebase
  const updates = {
    [`rooms/${roomId}/board`]: newBoard,
    [`rooms/${roomId}/currentTurn`]: winner ? null : nextColor,
    [`rooms/${roomId}/turnIndex`]: nextIdx,
    [`rooms/${roomId}/castlingRights`]: newCastling,
    [`rooms/${roomId}/enPassantTarget`]: newEP,
    [`rooms/${roomId}/eliminated`]: newEliminated,
    [`rooms/${roomId}/lastMove`]: { from: move.from, to: move.to, color: myColor },
    [`rooms/${roomId}/winner`]: winner || null,
    [`rooms/${roomId}/inCheck`]: checkColor,
  };

  // Move log
  dbPush(dbRef(db, `rooms/${roomId}/moveLog`), {
    notation, color: myColor, ts: Date.now()
  });

  renderer.clearHighlights();
  await dbUpdate(dbRef(db, '/'), updates);

  if(winner) {
    setTimeout(() => showWinScreen(winner), 500);
  }
}

function sendSystemChat(text) {
  ['teamA','teamB','public'].forEach(channel => {
    dbPush(dbRef(db, `rooms/${roomId}/chats/${channel}`), {
      system: true, text, ts: Date.now(), color:'system', name:'System'
    });
  });
}

// ── Render ────────────────────────────────────────────────────────
function renderGame() {
  if(!gameState || !renderer) return;
  const board = gameState.board;
  if(!board) return;

  // Set highlights from game state
  if(gameState.lastMove) renderer.setLastMove(gameState.lastMove);
  if(gameState.inCheck) {
    // Find king of inCheck color
    const c = gameState.inCheck;
    for(let i=0;i<64;i++) {
      const p=board[i];
      if(p&&p.type==='K'&&p.color===c) {
        renderer.setCheckSquare([Math.floor(i/8), i%8]);
        break;
      }
    }
  } else {
    renderer.setCheckSquare(null);
  }

  renderer.render(board, myColor, myColor);
}

function updateTurnIndicator() {
  if(!gameState) return;
  const ct = gameState.currentTurn;
  if(!ct) return;
  const playerName = gameState.players?.[ct]?.name || ct;
  const el = document.getElementById('turn-display');
  el.textContent = ct===myColor ? '⚡ YOUR TURN' : `${playerName}'s turn`;
  el.style.color = ct===myColor ? 'var(--gold-shine)' : 'var(--text-secondary)';
}

function updateCheckIndicator() {
  const el = document.getElementById('check-display');
  if(!gameState) return;
  if(gameState.inCheck === myColor) {
    el.classList.remove('hidden');
  } else {
    el.classList.add('hidden');
  }
}

function updatePlayersList() {
  if(!gameState?.players) return;
  const container = document.getElementById('players-list');
  container.innerHTML = '';
  COLORS.forEach(color => {
    const p = gameState.players[color];
    const isElim = gameState.eliminated?.includes(color);
    const isActive = gameState.currentTurn === color;
    const row = document.createElement('div');
    row.className = 'player-row';
    const teamBadge = TEAMS[color]==='A' ? '⚔A' : '⚔B';
    row.innerHTML = `
      <div class="player-dot ${color}"></div>
      <span class="player-name-label" style="${isElim?'opacity:0.4;text-decoration:line-through':''}">
        ${p?.name ? escapeHtml(p.name) : '(waiting…)'}
        <small style="color:var(--text-muted);font-size:10px"> ${teamBadge}</small>
      </span>
      <span class="player-status ${isActive&&!isElim?'active':''}">
        ${isElim ? '☠' : isActive ? '▶' : p?.name ? '●' : '○'}
      </span>
    `;
    container.appendChild(row);
  });

  // Self info
  const selfEl = document.getElementById('self-info');
  selfEl.textContent = `${myName} (${myColor} · Team ${TEAMS[myColor]})`;
  selfEl.style.color = `var(--${myColor==='gold'?'gold-piece-l':myColor+'-light'})`;
}

// Move log listener
function addMoveLog(notation, color) {
  const log = document.getElementById('move-log');
  const entry = document.createElement('div');
  entry.className = `log-entry ${color}`;
  entry.textContent = notation;
  log.appendChild(entry);
  log.scrollTop = log.scrollHeight;
}

// Listen to move log
function listenMoveLog() {
  dbOnValue(dbRef(db, `rooms/${roomId}/moveLog`), snap => {
    if(!snap.exists()) return;
    const log = document.getElementById('move-log');
    log.innerHTML = '';
    const entries = Object.values(snap.val()).sort((a,b)=>a.ts-b.ts);
    entries.forEach(e => {
      const div = document.createElement('div');
      div.className = `log-entry ${e.color}`;
      div.textContent = e.notation;
      log.appendChild(div);
    });
    log.scrollTop = log.scrollHeight;
  });
}

function showWinScreen(team) {
  const msg = `TEAM ${team} WINS! 🏆`;
  document.getElementById('turn-display').textContent = msg;
  document.getElementById('turn-display').style.color = 'var(--gold-shine)';
  document.getElementById('turn-display').style.fontSize = '18px';
  sendSystemChat(`🏆 ${msg}`);
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g,'&amp;')
    .replace(/</g,'&lt;')
    .replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;');
}

// Start listening to move log when entering game
const _origEnter = enterGameScreen;
