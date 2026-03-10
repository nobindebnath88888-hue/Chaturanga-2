// pieces.js — SVG-style Chess Piece Renderer (Chess.com inspired)
// Each piece is drawn via Canvas 2D path commands

export const PIECE_COLORS = {
  red:   { fill: '#c0392b', stroke: '#7b241c', light: '#e74c3c', shine: '#f1948a' },
  blue:  { fill: '#2471a3', stroke: '#1a4f7a', light: '#3498db', shine: '#85c1e9' },
  green: { fill: '#1e8449', stroke: '#145a32', light: '#27ae60', shine: '#82e0aa' },
  gold:  { fill: '#b7950b', stroke: '#7d6608', light: '#f39c12', shine: '#f9e79f' },
};

export const PIECE_TYPES = ['K','Q','R','B','N','P']; // King,Queen,Rook,Bishop,Knight,Pawn

// Draw a single piece on canvas at pixel coords (cx, cy) with given size
export function drawPiece(ctx, type, colorKey, cx, cy, size) {
  const c = PIECE_COLORS[colorKey];
  const s = size * 0.82; // scale factor

  ctx.save();
  ctx.translate(cx, cy);

  switch(type) {
    case 'K': drawKing(ctx, c, s);   break;
    case 'Q': drawQueen(ctx, c, s);  break;
    case 'R': drawRook(ctx, c, s);   break;
    case 'B': drawBishop(ctx, c, s); break;
    case 'N': drawKnight(ctx, c, s); break;
    case 'P': drawPawn(ctx, c, s);   break;
  }

  ctx.restore();
}

function applyStyle(ctx, c, lineW = 1.2) {
  ctx.fillStyle = c.fill;
  ctx.strokeStyle = c.stroke;
  ctx.lineWidth = lineW;
}

// ── PAWN ─────────────────────────────────────────────────────────
function drawPawn(ctx, c, s) {
  const r = s * 0.18;
  // Base
  ctx.beginPath();
  ctx.moveTo(-s*0.22, s*0.42);
  ctx.bezierCurveTo(-s*0.25, s*0.28, -s*0.15, s*0.22, 0, s*0.22);
  ctx.bezierCurveTo(s*0.15, s*0.22, s*0.25, s*0.28, s*0.22, s*0.42);
  ctx.closePath();
  applyStyle(ctx, c);
  ctx.fill(); ctx.stroke();
  // Neck
  ctx.beginPath();
  ctx.ellipse(0, s*0.10, s*0.09, s*0.13, 0, 0, Math.PI*2);
  ctx.fill(); ctx.stroke();
  // Head
  ctx.beginPath();
  ctx.arc(0, -s*0.12, r, 0, Math.PI*2);
  ctx.fill(); ctx.stroke();
  // Shine
  ctx.fillStyle = c.shine;
  ctx.globalAlpha = 0.35;
  ctx.beginPath();
  ctx.arc(-r*0.3, -s*0.17, r*0.4, 0, Math.PI*2);
  ctx.fill();
  ctx.globalAlpha = 1;
}

// ── ROOK ──────────────────────────────────────────────────────────
function drawRook(ctx, c, s) {
  applyStyle(ctx, c, 1.3);
  // Base
  ctx.beginPath();
  ctx.roundRect(-s*0.24, s*0.28, s*0.48, s*0.16, 3);
  ctx.fill(); ctx.stroke();
  // Column
  ctx.beginPath();
  ctx.roundRect(-s*0.17, -s*0.18, s*0.34, s*0.48, 2);
  ctx.fill(); ctx.stroke();
  // Battlements
  const tw = s*0.10, th = s*0.12, gap = s*0.04;
  const bx = [-s*0.20, -s*0.05, s*0.10];
  bx.forEach(x => {
    ctx.beginPath();
    ctx.roundRect(x, -s*0.30, tw, th, 2);
    ctx.fill(); ctx.stroke();
  });
  // Shine
  ctx.fillStyle = c.shine;
  ctx.globalAlpha = 0.3;
  ctx.fillRect(-s*0.12, -s*0.16, s*0.07, s*0.38);
  ctx.globalAlpha = 1;
}

// ── BISHOP ────────────────────────────────────────────────────────
function drawBishop(ctx, c, s) {
  applyStyle(ctx, c, 1.2);
  // Base
  ctx.beginPath();
  ctx.ellipse(0, s*0.38, s*0.22, s*0.08, 0, 0, Math.PI*2);
  ctx.fill(); ctx.stroke();
  // Body
  ctx.beginPath();
  ctx.moveTo(-s*0.16, s*0.32);
  ctx.bezierCurveTo(-s*0.20, s*0.10, -s*0.12, -s*0.05, 0, -s*0.18);
  ctx.bezierCurveTo(s*0.12, -s*0.05, s*0.20, s*0.10, s*0.16, s*0.32);
  ctx.closePath();
  ctx.fill(); ctx.stroke();
  // Ball
  ctx.beginPath();
  ctx.arc(0, -s*0.25, s*0.10, 0, Math.PI*2);
  ctx.fill(); ctx.stroke();
  // Point
  ctx.beginPath();
  ctx.moveTo(-s*0.06, -s*0.30);
  ctx.lineTo(0, -s*0.46);
  ctx.lineTo(s*0.06, -s*0.30);
  ctx.fill(); ctx.stroke();
  // Shine
  ctx.fillStyle = c.shine;
  ctx.globalAlpha = 0.3;
  ctx.beginPath();
  ctx.arc(-s*0.03, -s*0.28, s*0.05, 0, Math.PI*2);
  ctx.fill();
  ctx.globalAlpha = 1;
}

// ── KNIGHT ────────────────────────────────────────────────────────
function drawKnight(ctx, c, s) {
  applyStyle(ctx, c, 1.2);
  // Base
  ctx.beginPath();
  ctx.ellipse(0, s*0.38, s*0.22, s*0.08, 0, 0, Math.PI*2);
  ctx.fill(); ctx.stroke();
  // Body/neck
  ctx.beginPath();
  ctx.moveTo(-s*0.14, s*0.32);
  ctx.lineTo(-s*0.14, s*0.06);
  ctx.bezierCurveTo(-s*0.18, -s*0.10, -s*0.10, -s*0.25, s*0.05, -s*0.32);
  ctx.lineTo(s*0.14, -s*0.32);
  ctx.lineTo(s*0.16, s*0.06);
  ctx.lineTo(s*0.14, s*0.32);
  ctx.closePath();
  ctx.fill(); ctx.stroke();
  // Head
  ctx.beginPath();
  ctx.moveTo(-s*0.05, -s*0.10);
  ctx.bezierCurveTo(-s*0.22, -s*0.12, -s*0.24, -s*0.36, -s*0.10, -s*0.42);
  ctx.bezierCurveTo(s*0.04, -s*0.48, s*0.20, -s*0.42, s*0.18, -s*0.28);
  ctx.bezierCurveTo(s*0.18, -s*0.14, s*0.10, -s*0.08, s*0.04, -s*0.10);
  ctx.closePath();
  ctx.fill(); ctx.stroke();
  // Eye
  ctx.fillStyle = c.stroke;
  ctx.beginPath();
  ctx.arc(-s*0.02, -s*0.32, s*0.03, 0, Math.PI*2);
  ctx.fill();
  // Nostril
  ctx.beginPath();
  ctx.arc(s*0.08, -s*0.20, s*0.02, 0, Math.PI*2);
  ctx.fill();
  // Shine
  ctx.fillStyle = c.shine;
  ctx.globalAlpha = 0.3;
  ctx.beginPath();
  ctx.ellipse(-s*0.06, -s*0.30, s*0.04, s*0.07, -0.4, 0, Math.PI*2);
  ctx.fill();
  ctx.globalAlpha = 1;
}

// ── QUEEN ─────────────────────────────────────────────────────────
function drawQueen(ctx, c, s) {
  applyStyle(ctx, c, 1.3);
  // Base
  ctx.beginPath();
  ctx.ellipse(0, s*0.40, s*0.26, s*0.09, 0, 0, Math.PI*2);
  ctx.fill(); ctx.stroke();
  // Skirt
  ctx.beginPath();
  ctx.moveTo(-s*0.22, s*0.34);
  ctx.bezierCurveTo(-s*0.24, s*0.12, -s*0.18, 0, -s*0.06, -s*0.06);
  ctx.bezierCurveTo(0, -s*0.08, s*0.06, -s*0.08, s*0.06, -s*0.06);
  ctx.bezierCurveTo(s*0.18, 0, s*0.24, s*0.12, s*0.22, s*0.34);
  ctx.closePath();
  ctx.fill(); ctx.stroke();
  // Crown base
  ctx.beginPath();
  ctx.ellipse(0, -s*0.12, s*0.13, s*0.06, 0, 0, Math.PI*2);
  ctx.fill(); ctx.stroke();
  // Crown points (5 points)
  const crownAngles = [-72,-36,0,36,72].map(a => a * Math.PI/180);
  const cr = s*0.12, ch = s*0.22;
  crownAngles.forEach(a => {
    ctx.beginPath();
    ctx.moveTo(Math.sin(a)*cr*0.8, -s*0.12 - Math.cos(a)*cr*0.6);
    ctx.arc(Math.sin(a)*cr, -s*0.12 - ch*0.7 + Math.cos(a)*cr*0.2, s*0.045, 0, Math.PI*2);
    ctx.fill(); ctx.stroke();
  });
  // Center jewel
  ctx.fillStyle = c.shine;
  ctx.beginPath();
  ctx.arc(0, -s*0.14, s*0.05, 0, Math.PI*2);
  ctx.fill();
  // Shine
  ctx.globalAlpha = 0.3;
  ctx.fillStyle = c.shine;
  ctx.beginPath();
  ctx.ellipse(-s*0.08, s*0.10, s*0.05, s*0.14, -0.3, 0, Math.PI*2);
  ctx.fill();
  ctx.globalAlpha = 1;
}

// ── KING ──────────────────────────────────────────────────────────
function drawKing(ctx, c, s) {
  applyStyle(ctx, c, 1.4);
  // Base
  ctx.beginPath();
  ctx.ellipse(0, s*0.40, s*0.26, s*0.09, 0, 0, Math.PI*2);
  ctx.fill(); ctx.stroke();
  // Body
  ctx.beginPath();
  ctx.moveTo(-s*0.22, s*0.34);
  ctx.bezierCurveTo(-s*0.24, s*0.12, -s*0.15, -s*0.02, 0, -s*0.06);
  ctx.bezierCurveTo(s*0.15, -s*0.02, s*0.24, s*0.12, s*0.22, s*0.34);
  ctx.closePath();
  ctx.fill(); ctx.stroke();
  // Crown ring
  ctx.beginPath();
  ctx.ellipse(0, -s*0.12, s*0.14, s*0.06, 0, 0, Math.PI*2);
  ctx.fill(); ctx.stroke();
  // Crown band
  ctx.beginPath();
  ctx.roundRect(-s*0.14, -s*0.28, s*0.28, s*0.16, 2);
  ctx.fill(); ctx.stroke();
  // Cross vertical
  ctx.beginPath();
  ctx.roundRect(-s*0.04, -s*0.46, s*0.08, s*0.26, 2);
  ctx.fill(); ctx.stroke();
  // Cross horizontal
  ctx.beginPath();
  ctx.roundRect(-s*0.13, -s*0.40, s*0.26, s*0.07, 2);
  ctx.fill(); ctx.stroke();
  // Jewels on crown
  const jAngles = [-s*0.09, 0, s*0.09];
  jAngles.forEach(x => {
    ctx.fillStyle = c.shine;
    ctx.beginPath();
    ctx.arc(x, -s*0.21, s*0.03, 0, Math.PI*2);
    ctx.fill();
  });
  // Shine
  ctx.fillStyle = c.shine;
  ctx.globalAlpha = 0.3;
  ctx.beginPath();
  ctx.ellipse(-s*0.08, s*0.10, s*0.05, s*0.14, -0.3, 0, Math.PI*2);
  ctx.fill();
  ctx.globalAlpha = 1;
}
