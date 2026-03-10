// renderer.js — Canvas-based wooden chess board renderer

import { drawPiece } from './pieces.js';

const LIGHT_SQ = '#f0d9b5';
const DARK_SQ  = '#b58863';
const WOOD_FRAME = '#6b3d10';
const WOOD_INNER = '#4a2c0a';
const COORD_COLOR = 'rgba(80,40,10,0.7)';

// Highlight colors
const HL_SELECTED  = 'rgba(255,215,0,0.45)';
const HL_MOVE      = 'rgba(0,220,100,0.28)';
const HL_CAPTURE   = 'rgba(220,60,60,0.35)';
const HL_LASTMOVE  = 'rgba(255,200,0,0.22)';
const HL_CHECK     = 'rgba(220,0,0,0.50)';

export class BoardRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx    = canvas.getContext('2d');
    this.size   = canvas.width; // square
    this.sqSize = this.size / 8;
    this.selectedSquare = null;
    this.legalMoves     = [];
    this.lastMove       = null;
    this.checkSquare    = null;
  }

  // Full render pass
  render(board, currentColor, perspective) {
    const ctx = this.ctx;
    const S   = this.sqSize;

    ctx.clearRect(0, 0, this.size, this.size);

    // Wood frame
    this._drawWoodFrame();

    // Squares + highlights
    for(let row=0;row<8;row++) {
      for(let col=0;col<8;col++) {
        const [dr,dc] = this._transform(row, col, perspective);
        const x=dc*S, y=dr*S;
        const isLight = (row+col)%2===0;

        // Base square color
        ctx.fillStyle = isLight ? LIGHT_SQ : DARK_SQ;
        ctx.fillRect(x, y, S, S);

        // Last move highlight
        if(this.lastMove) {
          const [fr,fc] = this.lastMove.from;
          const [tr,tc] = this.lastMove.to;
          if((row===fr&&col===fc)||(row===tr&&col===tc)) {
            ctx.fillStyle = HL_LASTMOVE;
            ctx.fillRect(x, y, S, S);
          }
        }

        // Check highlight
        if(this.checkSquare && this.checkSquare[0]===row && this.checkSquare[1]===col) {
          ctx.fillStyle = HL_CHECK;
          ctx.fillRect(x, y, S, S);
        }

        // Selected square
        if(this.selectedSquare && this.selectedSquare[0]===row && this.selectedSquare[1]===col) {
          ctx.fillStyle = HL_SELECTED;
          ctx.fillRect(x, y, S, S);
        }

        // Legal move dots / capture rings
        const lm = this.legalMoves.find(m=>m.to[0]===row&&m.to[1]===col);
        if(lm) {
          const piece = board[row*8+col];
          if(piece) {
            // Capture ring
            ctx.strokeStyle = HL_CAPTURE;
            ctx.lineWidth = S*0.1;
            ctx.beginPath();
            ctx.arc(x+S/2, y+S/2, S*0.45, 0, Math.PI*2);
            ctx.stroke();
          } else {
            // Move dot
            ctx.fillStyle = HL_MOVE;
            ctx.beginPath();
            ctx.arc(x+S/2, y+S/2, S*0.18, 0, Math.PI*2);
            ctx.fill();
          }
        }
      }
    }

    // Wood grain texture overlay
    this._drawWoodGrain();

    // Coordinates
    this._drawCoordinates(perspective);

    // Pieces
    for(let row=0;row<8;row++) {
      for(let col=0;col<8;col++) {
        const piece = board[row*8+col];
        if(!piece) continue;
        const [dr,dc] = this._transform(row, col, perspective);
        const cx = dc*S + S/2;
        const cy = dr*S + S/2;
        drawPiece(this.ctx, piece.type, piece.color, cx, cy, S);
      }
    }
  }

  _transform(row, col, perspective) {
    // perspective: which color is at the bottom
    // red/blue = normal orientation; green/gold = flipped
    if(perspective==='green'||perspective==='gold') {
      return [7-row, 7-col];
    }
    return [row, col];
  }

  _drawWoodFrame() {
    const ctx = this.ctx;
    const S = this.size;
    // Nothing extra needed — board fills canvas
    // The CSS box-shadow on canvas element provides the wooden frame
  }

  _drawWoodGrain() {
    const ctx = this.ctx;
    // Subtle semi-transparent grain lines across the whole board
    ctx.save();
    ctx.globalAlpha = 0.025;
    ctx.strokeStyle = '#8b5523';
    ctx.lineWidth = 1;
    for(let y=0; y<this.size; y+=6) {
      ctx.beginPath();
      ctx.moveTo(0, y + Math.sin(y*0.05)*2);
      ctx.bezierCurveTo(
        this.size*0.3, y + Math.sin(y*0.08)*3,
        this.size*0.7, y + Math.sin(y*0.06)*2,
        this.size, y + Math.sin(y*0.05)*1
      );
      ctx.stroke();
    }
    ctx.restore();
  }

  _drawCoordinates(perspective) {
    const ctx = this.ctx;
    const S = this.sqSize;
    ctx.font = `bold ${S*0.18}px "Cinzel", serif`;
    ctx.fillStyle = COORD_COLOR;

    for(let i=0;i<8;i++) {
      const [dr] = this._transform(i, 0, perspective);
      const [,dc] = this._transform(0, i, perspective);

      // Rank numbers (left edge)
      const rankNum = perspective==='green'||perspective==='gold' ? i+1 : 8-i;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      const isLightFile = i%2===0;
      ctx.fillStyle = isLightFile ? 'rgba(100,55,15,0.7)' : 'rgba(240,217,181,0.7)';
      ctx.fillText(rankNum, dr*S + S*0.04, i*S + S*0.04); // approximate

      // File letters (bottom edge)
      const fileLetter = String.fromCharCode(97 + (perspective==='green'||perspective==='gold' ? 7-i : i));
      const isLightRank = i%2===0;
      ctx.fillStyle = isLightRank ? 'rgba(240,217,181,0.7)' : 'rgba(100,55,15,0.7)';
      ctx.textAlign = 'right';
      ctx.textBaseline = 'bottom';
      ctx.fillText(fileLetter, (i+1)*S - S*0.04, this.size - S*0.04);
    }
  }

  // Convert canvas click to (row, col)
  clickToSquare(clientX, clientY, perspective) {
    const rect = this.canvas.getBoundingClientRect();
    const scaleX = this.size / rect.width;
    const scaleY = this.size / rect.height;
    const x = (clientX - rect.left) * scaleX;
    const y = (clientY - rect.top)  * scaleY;
    const S = this.sqSize;
    const dc = Math.floor(x/S);
    const dr = Math.floor(y/S);
    if(dc<0||dc>7||dr<0||dr>7) return null;
    if(perspective==='green'||perspective==='gold') return [7-dr, 7-dc];
    return [dr, dc];
  }

  setSelected(square) { this.selectedSquare = square; }
  setLegalMoves(moves) { this.legalMoves = moves; }
  setLastMove(move) { this.lastMove = move; }
  setCheckSquare(sq) { this.checkSquare = sq; }
  clearHighlights() {
    this.selectedSquare = null;
    this.legalMoves = [];
    this.checkSquare = null;
  }
}
