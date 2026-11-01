import { Board } from './board';
import {
  BLACK,
  CASTLE_BK,
  CASTLE_BQ,
  CASTLE_WK,
  CASTLE_WQ,
  EMPTY,
  KING,
  PAWN,
  ROOK,
  WHITE,
  charToPiece,
  makePiece,
  parseSquare,
  pieceToChar,
  rankOf,
  squareName,
} from './types';
import type { Color } from './types';

export const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

export type FenResult = { ok: true; board: Board } | { ok: false; error: string };

const fail = (error: string): FenResult => ({ ok: false, error });

/**
 * FEN metnini okur ve doğrular. Geçersiz bir pozisyonu (iki şah, sırası olmayan tarafın şahına saldırı vb.)
 * kabul etmez: bozuk bir pozisyon hamle üretimini sessizce yanlışa sürükleyebilir.
 */
export function parseFen(fen: string): FenResult {
  const parts = fen.trim().split(/\s+/);
  if (parts.length < 4 || parts.length > 6) return fail('FEN 4 ile 6 alan içermeli');
  const [placement, side, castle, epStr, halfStr = '0', fullStr = '1'] = parts;

  const board = new Board();
  const ranks = placement.split('/');
  if (ranks.length !== 8) return fail('FEN 8 sıra içermeli');

  const kings = [0, 0];
  for (let r = 0; r < 8; r++) {
    const rankIndex = 7 - r;
    let file = 0;
    for (const ch of ranks[r]) {
      if (ch >= '1' && ch <= '8') {
        file += Number(ch);
        if (file > 8) return fail(`${r + 1}. sırada çok fazla kare var`);
        continue;
      }
      const piece = charToPiece(ch);
      if (piece === EMPTY) return fail(`Geçersiz taş harfi: "${ch}"`);
      if (file > 7) return fail(`${r + 1}. sırada çok fazla kare var`);
      const sq = rankIndex * 16 + file;
      const type = piece & 7;
      if (type === PAWN && (rankIndex === 0 || rankIndex === 7)) return fail('Piyon birinci veya sekizinci sırada olamaz');
      if (type === KING) {
        const color = (piece >> 3) as Color;
        kings[color]++;
        board.king[color] = sq;
      }
      board.squares[sq] = piece;
      file++;
    }
    if (file !== 8) return fail(`${r + 1}. sıra tam 8 kare olmalı`);
  }
  if (kings[WHITE] !== 1 || kings[BLACK] !== 1) return fail('Her renkten tam bir şah olmalı');

  if (side === 'w') board.turn = WHITE;
  else if (side === 'b') board.turn = BLACK;
  else return fail('Sıra "w" veya "b" olmalı');

  // Rok hakları: karşılık gelen şah ve kale gerçekten yerinde olmalı
  let rights = 0;
  if (castle !== '-') {
    if (!/^[KQkq]+$/.test(castle) || new Set(castle).size !== castle.length) return fail('Rok hakları geçersiz');
    const sq = board.squares;
    const need = (flag: number, kingSq: number, kingP: number, rookSq: number, rookP: number) => {
      if (sq[kingSq] !== kingP || sq[rookSq] !== rookP) return false;
      rights |= flag;
      return true;
    };
    for (const c of castle) {
      let ok = true;
      if (c === 'K') ok = need(CASTLE_WK, 0x04, makePiece(WHITE, KING), 0x07, makePiece(WHITE, ROOK));
      if (c === 'Q') ok = need(CASTLE_WQ, 0x04, makePiece(WHITE, KING), 0x00, makePiece(WHITE, ROOK));
      if (c === 'k') ok = need(CASTLE_BK, 0x74, makePiece(BLACK, KING), 0x77, makePiece(BLACK, ROOK));
      if (c === 'q') ok = need(CASTLE_BQ, 0x74, makePiece(BLACK, KING), 0x70, makePiece(BLACK, ROOK));
      if (!ok) return fail('Rok hakkı var ama şah veya kale yerinde değil');
    }
  }
  board.castling = rights;

  // Geçerken alma karesi: sıra beyazdaysa 6. sıra, siyahtaysa 3. sıra; arkasında piyon, önünde boşluk olmalı
  if (epStr !== '-') {
    const ep = parseSquare(epStr);
    if (ep < 0) return fail('Geçerken alma karesi geçersiz');
    const expectedRank = board.turn === WHITE ? 5 : 2;
    if (rankOf(ep) !== expectedRank) return fail('Geçerken alma karesi yanlış sırada');
    const pawnSq = ep + (board.turn === WHITE ? -16 : 16);
    const originSq = ep + (board.turn === WHITE ? 16 : -16);
    const enemyPawn = makePiece((board.turn ^ 1) as Color, PAWN);
    if (board.squares[ep] !== EMPTY || board.squares[originSq] !== EMPTY || board.squares[pawnSq] !== enemyPawn) {
      return fail('Geçerken alma karesi tahtayla tutarsız');
    }
    board.ep = ep;
  }

  if (!/^\d+$/.test(halfStr)) return fail('Yarım hamle sayısı geçersiz');
  if (!/^\d+$/.test(fullStr) || Number(fullStr) < 1) return fail('Hamle numarası geçersiz');
  board.halfmove = Number(halfStr);
  board.fullmove = Number(fullStr);

  // Sırası olmayan tarafın şahı, sırası olan tarafça tehdit ediliyorsa pozisyon imkânsızdır
  const other = (board.turn ^ 1) as Color;
  if (board.isAttacked(board.king[other], board.turn)) return fail('Sırası olmayan tarafın şahı tehdit altında');

  return { ok: true, board };
}

/** Geçersizse hata fırlatır (bilinen iyi FEN'ler için kısayol). */
export function boardFromFen(fen: string): Board {
  const r = parseFen(fen);
  if (!r.ok) throw new Error('Geçersiz FEN: ' + r.error);
  return r.board;
}

export function toFen(board: Board): string {
  const rows: string[] = [];
  for (let r = 7; r >= 0; r--) {
    let row = '';
    let empty = 0;
    for (let f = 0; f < 8; f++) {
      const p = board.squares[r * 16 + f];
      if (p === EMPTY) {
        empty++;
      } else {
        if (empty) row += empty;
        empty = 0;
        row += pieceToChar(p);
      }
    }
    if (empty) row += empty;
    rows.push(row);
  }
  let castle = '';
  if (board.castling & CASTLE_WK) castle += 'K';
  if (board.castling & CASTLE_WQ) castle += 'Q';
  if (board.castling & CASTLE_BK) castle += 'k';
  if (board.castling & CASTLE_BQ) castle += 'q';
  const ep = board.ep >= 0 ? squareName(board.ep) : '-';
  return `${rows.join('/')} ${board.turn === WHITE ? 'w' : 'b'} ${castle || '-'} ${ep} ${board.halfmove} ${board.fullmove}`;
}
