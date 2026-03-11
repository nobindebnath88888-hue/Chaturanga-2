// gamelogic.js — Four-Plyer Chaturanga Game Rules

// Turn order: Red(0) → Blue(1) → Green(2) → Gold(3) → repeat
// Teams: Red+Blue (Team A)  vs  Green+Gold (Team B)
// Board: 8x8 standard, each player starts in their corner quadrant

export const COLORS = ['red','blue','green','gold'];
export const TEAMS  = { red:'A', blue:'A', green:'B', gold:'B' };

// Initial board setup for 4-player Chaturanga
// Red starts bottom-left (files a-b, ranks 1-4), Blue bottom-right,
// Green top-right, Gold top-left
// We use a flat 64-square representation: index = row*8 + col
// row 0 = top (rank 8), row 7 = bottom (rank 1)

export function createInitialBoard() {
  // board[idx] = { type:'K'|'Q'|'R'|'B'|'N'|'P', color:'red'|'blue'|'green'|'gold' } | null
  const board = Array(64).fill(null);

  // Helper
  const place = (row, col, type, color) => {
    board[row*8+col] = { type, color };
  };

  // ── RED — bottom-left quadrant (rows 6-7, cols 0-3) ──
  // Back rank (row 7): R N B Q K B N R  → but only cols 0-3
  place(7,0,'R','red'); place(7,1,'N','red'); place(7,2,'B','red'); place(7,3,'K','red');
  // Pawns row 6, cols 0-3
  for(let c=0;c<4;c++) place(6,c,'P','red');

  // ── BLUE — bottom-right quadrant (rows 6-7, cols 4-7) ──
  place(7,4,'K','blue'); place(7,5,'B','blue'); place(7,6,'N','blue'); place(7,7,'R','blue');
  for(let c=4;c<8;c++) place(6,c,'P','blue');

  // ── GREEN — top-right quadrant (rows 0-1, cols 4-7) ──
  place(0,7,'R','green'); place(0,6,'N','green'); place(0,5,'B','green'); place(0,4,'K','green');
  for(let c=4;c<8;c++) place(1,c,'P','green');

  // ── GOLD — top-left quadrant (rows 0-1, cols 0-3) ──
  place(0,3,'K','gold'); place(0,2,'B','gold'); place(0,1,'N','gold'); place(0,0,'R','gold');
  for(let c=0;c<4;c++) place(1,c,'P','gold');

  return board;
}

// Get piece at (row,col)
export function getPiece(board, row, col) {
  if(row<0||row>7||col<0||col>7) return undefined;
  return board[row*8+col];
}

// Each color's pawn advancement direction
const PAWN_DIR = { red:-1, blue:-1, green:1, gold:1 }; // row delta

// Each color's pawn starting row
const PAWN_START_ROW = { red:6, blue:6, green:1, gold:1 };

// Promotion row for each color
const PAWN_PROMO_ROW = { red:0, blue:0, green:7, gold:7 };

export function isEnemy(piece, color) {
  return piece && piece.color !== color;
}
export function isFriend(piece, color) {
  return piece && piece.color === color;
}

// Generate all pseudo-legal moves for a piece at (row,col)
export function generateMoves(board, row, col, color, enPassantTarget, castlingRights) {
  const piece = getPiece(board, row, col);
  if(!piece || piece.color !== color) return [];

  const moves = [];
  const add = (tr, tc, flags={}) => moves.push({ from:[row,col], to:[tr,tc], ...flags });

  switch(piece.type) {

    case 'P': {
      const dir = PAWN_DIR[color];
      const tr = row + dir;
      // Forward
      if(tr>=0 && tr<=7 && !getPiece(board,tr,col)) {
        add(tr, col, { promo: tr===PAWN_PROMO_ROW[color] });
        // Double push
        if(row===PAWN_START_ROW[color] && !getPiece(board,tr+dir,col)) {
          add(tr+dir, col, { doublePush:true });
        }
      }
      // Captures
      [-1,1].forEach(dc => {
        const tc = col+dc;
        if(tc<0||tc>7) return;
        const target = getPiece(board,tr,tc);
        if(target && isEnemy(target,color)) add(tr,tc,{ capture:true, promo: tr===PAWN_PROMO_ROW[color] });
        // En passant
        if(enPassantTarget && enPassantTarget[0]===tr && enPassantTarget[1]===tc)
          add(tr,tc,{ enPassant:true, capture:true });
      });
      break;
    }

    case 'N': {
      [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]].forEach(([dr,dc]) => {
        const tr=row+dr, tc=col+dc;
        if(tr<0||tr>7||tc<0||tc>7) return;
        const t=getPiece(board,tr,tc);
        if(!isFriend(t,color)) add(tr,tc,{capture:!!t});
      });
      break;
    }

    case 'B':
      addSliding(board,row,col,color,moves,[[-1,-1],[-1,1],[1,-1],[1,1]]);
      break;

    case 'R':
      addSliding(board,row,col,color,moves,[[-1,0],[1,0],[0,-1],[0,1]]);
      break;

    case 'Q':
      addSliding(board,row,col,color,moves,[[-1,-1],[-1,1],[1,-1],[1,1],[-1,0],[1,0],[0,-1],[0,1]]);
      break;

    case 'K': {
      [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]].forEach(([dr,dc]) => {
        const tr=row+dr, tc=col+dc;
        if(tr<0||tr>7||tc<0||tc>7) return;
        const t=getPiece(board,tr,tc);
        if(!isFriend(t,color)) add(tr,tc,{capture:!!t});
      });
      // Castling
      if(castlingRights) {
        const rights = castlingRights[color] || {};
        // Kingside
        if(rights.kingSide && !getPiece(board,row,col+1) && !getPiece(board,row,col+2))
          add(row,col+2,{castle:'K'});
        // Queenside
        if(rights.queenSide && !getPiece(board,row,col-1) && !getPiece(board,row,col-2) && !getPiece(board,row,col-3))
          add(row,col-2,{castle:'Q'});
      }
      break;
    }
  }
  return moves;
}

function addSliding(board, row, col, color, moves, dirs) {
  dirs.forEach(([dr,dc]) => {
    let r=row+dr, c=col+dc;
    while(r>=0&&r<=7&&c>=0&&c<=7) {
      const t=getPiece(board,r,c);
      if(isFriend(t,color)) break;
      moves.push({from:[row,col],to:[r,c],capture:!!t});
      if(t) break; // blocked after capture
      r+=dr; c+=dc;
    }
  });
}

// Check if a king of 'color' is in check
export function isInCheck(board, color) {
  // Find king
  let kr=-1, kc=-1;
  for(let i=0;i<64;i++) {
    const p=board[i];
    if(p && p.type==='K' && p.color===color) { kr=Math.floor(i/8); kc=i%8; break; }
  }
  if(kr===-1) return false; // king captured (shouldn't happen in normal play)

  // Check if any enemy can reach king
  for(let i=0;i<64;i++) {
    const p=board[i];
    if(!p || p.color===color) continue;
    const er=Math.floor(i/8), ec=i%8;
    // Generate moves for this enemy (no castling/en-passant needed for attack check)
    const eMoves = generateMoves(board,er,ec,p.color,null,null);
    if(eMoves.some(m=>m.to[0]===kr && m.to[1]===kc)) return true;
  }
  return false;
}

// Apply a move and return new board (immutable)
export function applyMove(board, move, promoteTo='Q') {
  const newBoard = [...board];
  const [fr,fc] = move.from;
  const [tr,tc] = move.to;
  const piece = newBoard[fr*8+fc];

  newBoard[fr*8+fc] = null;

  if(move.enPassant) {
    // Remove captured pawn (it's on the same rank as 'from', same file as 'to')
    const capRow = fr;
    newBoard[capRow*8+tc] = null;
  }

  if(move.castle) {
    // Move rook
    if(move.castle==='K') {
      const rook = newBoard[fr*8+(tc+1)];
      newBoard[fr*8+(tc+1)] = null;
      newBoard[fr*8+(tc-1)] = rook;
    } else {
      const rook = newBoard[fr*8+(tc-2)];
      newBoard[fr*8+(tc-2)] = null;
      newBoard[fr*8+(tc+1)] = rook;
    }
  }

  if(move.promo) {
    newBoard[tr*8+tc] = { type: promoteTo, color: piece.color };
  } else {
    newBoard[tr*8+tc] = piece;
  }

  return newBoard;
}

// Get all legal moves (filtered for check)
export function getLegalMoves(board, row, col, color, enPassantTarget, castlingRights) {
  const pseudo = generateMoves(board,row,col,color,enPassantTarget,castlingRights);
  return pseudo.filter(move => {
    const nb = applyMove(board, move);
    return !isInCheck(nb, color);
  });
}

// Get all legal moves for a color
export function getAllLegalMoves(board, color, enPassantTarget, castlingRights) {
  const allMoves = [];
  for(let i=0;i<64;i++) {
    const p=board[i];
    if(!p||p.color!==color) continue;
    const r=Math.floor(i/8), c=i%8;
    const moves = getLegalMoves(board,r,c,color,enPassantTarget,castlingRights);
    allMoves.push(...moves);
  }
  return allMoves;
}

// Check if a color is checkmated
export function isCheckmate(board, color, enPassantTarget, castlingRights) {
  return isInCheck(board,color) && getAllLegalMoves(board,color,enPassantTarget,castlingRights).length===0;
}

// Check if a color is stalemated
export function isStalemate(board, color, enPassantTarget, castlingRights) {
  return !isInCheck(board,color) && getAllLegalMoves(board,color,enPassantTarget,castlingRights).length===0;
}

// Update castling rights based on a move
export function updateCastlingRights(rights, move, board) {
  const newRights = JSON.parse(JSON.stringify(rights));
  const [fr,fc] = move.from;
  const piece = board[fr*8+fc];
  if(!piece) return newRights;

  if(piece.type==='K') {
    newRights[piece.color] = { kingSide:false, queenSide:false };
  }
  if(piece.type==='R') {
    // Determine side based on starting column
    if(fc===0) newRights[piece.color].queenSide = false;
    if(fc===7) newRights[piece.color].kingSide  = false;
  }
  return newRights;
}

export function initCastlingRights() {
  const r = {};
  COLORS.forEach(c => r[c] = { kingSide:true, queenSide:false }); // only kingside for 4-player simplicity
  return r;
}

// File/rank notation helpers
export function squareToAlgebraic(row, col) {
  return String.fromCharCode(97+col) + (8-row);
}

export function moveToNotation(piece, from, to, isCapture, isCheck, isMate) {
  const f = squareToAlgebraic(from[0],from[1]);
  const t = squareToAlgebraic(to[0],to[1]);
  let n = piece.type==='P' ? '' : piece.type;
  if(isCapture) n += (piece.type==='P' ? f[0] : '') + 'x';
  n += t;
  if(isMate) n += '#';
  else if(isCheck) n += '+';
  return n;
}
