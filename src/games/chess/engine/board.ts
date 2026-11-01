import {
  BISHOP,
  BLACK,
  CASTLE_BK,
  CASTLE_BQ,
  CASTLE_WK,
  CASTLE_WQ,
  EMPTY,
  FLAG_CASTLE_K,
  FLAG_CASTLE_Q,
  FLAG_DOUBLE,
  FLAG_EP,
  KING,
  KNIGHT,
  PAWN,
  QUEEN,
  ROOK,
  WHITE,
  makePiece,
  moveFlags,
  moveFrom,
  movePromo,
  moveTo,
  pieceType,
} from './types';
import type { Color } from './types';

// Yön farkları (0x88)
export const KNIGHT_STEPS = [33, 31, 18, 14, -14, -18, -31, -33];
export const KING_STEPS = [1, -1, 16, -16, 17, 15, -15, -17];
export const BISHOP_DIRS = [17, 15, -15, -17];
export const ROOK_DIRS = [16, -16, 1, -1];

// Bir kareden hamle yapılınca/kareye hamle yapılınca hangi rok haklarının kalacağı
const CASTLE_MASK = new Int8Array(128).fill(15);
CASTLE_MASK[0x04] = 15 & ~(CASTLE_WK | CASTLE_WQ); // e1: beyaz şah
CASTLE_MASK[0x00] = 15 & ~CASTLE_WQ; // a1
CASTLE_MASK[0x07] = 15 & ~CASTLE_WK; // h1
CASTLE_MASK[0x74] = 15 & ~(CASTLE_BK | CASTLE_BQ); // e8: siyah şah
CASTLE_MASK[0x70] = 15 & ~CASTLE_BQ; // a8
CASTLE_MASK[0x77] = 15 & ~CASTLE_BK; // h8

/**
 * Satranç tahtası ve durumu. Hamle yapma/geri alma (make/unmake) ile çalışır, bu yüzden arama için hızlıdır.
 * Hamle üretimi için moves.ts, FEN için fen.ts'ye bakın.
 */
export class Board {
  /** 128 elemanlı 0x88 tahta; her eleman taş kodu */
  readonly squares = new Int8Array(128);
  turn: Color = WHITE;
  castling = 0;
  /** Geçerken alma hedef karesi (son hamle çift adımlı piyon hamlesiyse, arkasındaki kare); yoksa -1 */
  ep = -1;
  /** Piyon hamlesi veya alıştan beri geçen yarım hamle (50 hamle kuralı) */
  halfmove = 0;
  fullmove = 1;
  /** Şah kareleri [beyaz, siyah] */
  readonly king: [number, number] = [-1, -1];

  // Geri alma yığını
  private hMove: number[] = [];
  private hCaptured: number[] = [];
  private hCastling: number[] = [];
  private hEp: number[] = [];
  private hHalf: number[] = [];

  /** Şimdiye kadar yapılan hamleler (geri alınmamış olanlar) */
  get moveStack(): readonly number[] {
    return this.hMove;
  }

  get ply(): number {
    return this.hMove.length;
  }

  pieceAt(s: number): number {
    return this.squares[s];
  }

  /** Verilen karenin, `by` renginin taşlarınca saldırı altında olup olmadığı */
  isAttacked(sq: number, by: Color): boolean {
    const b = this.squares;

    // Piyonlar: beyaz piyon bir üst sıraya (+15, +17) saldırır, yani saldıran kareden 15/17 aşağıdadır
    if (by === WHITE) {
      let t = sq - 15;
      if (!(t & 0x88) && b[t] === PAWN) return true;
      t = sq - 17;
      if (!(t & 0x88) && b[t] === PAWN) return true;
    } else {
      let t = sq + 15;
      if (!(t & 0x88) && b[t] === (PAWN | 8)) return true;
      t = sq + 17;
      if (!(t & 0x88) && b[t] === (PAWN | 8)) return true;
    }

    const knight = makePiece(by, KNIGHT);
    for (let i = 0; i < 8; i++) {
      const t = sq + KNIGHT_STEPS[i];
      if (!(t & 0x88) && b[t] === knight) return true;
    }

    const king = makePiece(by, KING);
    for (let i = 0; i < 8; i++) {
      const t = sq + KING_STEPS[i];
      if (!(t & 0x88) && b[t] === king) return true;
    }

    const bishop = makePiece(by, BISHOP);
    const queen = makePiece(by, QUEEN);
    for (let i = 0; i < 4; i++) {
      const d = BISHOP_DIRS[i];
      let t = sq + d;
      while (!(t & 0x88)) {
        const p = b[t];
        if (p !== EMPTY) {
          if (p === bishop || p === queen) return true;
          break;
        }
        t += d;
      }
    }

    const rook = makePiece(by, ROOK);
    for (let i = 0; i < 4; i++) {
      const d = ROOK_DIRS[i];
      let t = sq + d;
      while (!(t & 0x88)) {
        const p = b[t];
        if (p !== EMPTY) {
          if (p === rook || p === queen) return true;
          break;
        }
        t += d;
      }
    }
    return false;
  }

  /** Verilen rengin şahı (varsayılan: sıra kimdeyse) tehdit altında mı */
  inCheck(color: Color = this.turn): boolean {
    return this.isAttacked(this.king[color], (color ^ 1) as Color);
  }

  /** Hamleyi yapar. Hamlenin (en azından sözde) yasal olduğu varsayılır: yasallık moves.ts'de denetlenir. */
  makeMove(m: number): void {
    const from = moveFrom(m);
    const to = moveTo(m);
    const promo = movePromo(m);
    const flags = moveFlags(m);
    const sqs = this.squares;
    const piece = sqs[from];
    const us = this.turn;

    this.hMove.push(m);
    this.hCastling.push(this.castling);
    this.hEp.push(this.ep);
    this.hHalf.push(this.halfmove);

    let captured = sqs[to];
    sqs[to] = promo ? makePiece(us, promo) : piece;
    sqs[from] = EMPTY;

    if (flags & FLAG_EP) {
      // Alınan piyon, hedef karenin bir gerisinde durur
      const capSq = to + (us === WHITE ? -16 : 16);
      captured = sqs[capSq];
      sqs[capSq] = EMPTY;
    } else if (flags & FLAG_CASTLE_K) {
      sqs[to - 1] = sqs[to + 1]; // kale h -> f
      sqs[to + 1] = EMPTY;
    } else if (flags & FLAG_CASTLE_Q) {
      sqs[to + 1] = sqs[to - 2]; // kale a -> d
      sqs[to - 2] = EMPTY;
    }
    this.hCaptured.push(captured);

    const type = pieceType(piece);
    if (type === KING) this.king[us] = to;
    this.castling &= CASTLE_MASK[from] & CASTLE_MASK[to];
    this.ep = flags & FLAG_DOUBLE ? (from + to) >> 1 : -1;
    this.halfmove = type === PAWN || captured !== EMPTY ? 0 : this.halfmove + 1;
    if (us === BLACK) this.fullmove++;
    this.turn = (us ^ 1) as Color;
  }

  /** Son hamleyi geri alır; geri alınan hamleyi döndürür (yığın boşsa undefined). */
  unmakeMove(): number | undefined {
    const m = this.hMove.pop();
    if (m === undefined) return undefined;
    const captured = this.hCaptured.pop() as number;
    this.castling = this.hCastling.pop() as number;
    this.ep = this.hEp.pop() as number;
    this.halfmove = this.hHalf.pop() as number;

    const us = (this.turn ^ 1) as Color;
    this.turn = us;
    if (us === BLACK) this.fullmove--;

    const from = moveFrom(m);
    const to = moveTo(m);
    const promo = movePromo(m);
    const flags = moveFlags(m);
    const sqs = this.squares;
    const moved = promo ? makePiece(us, PAWN) : sqs[to];

    sqs[from] = moved;
    if (flags & FLAG_EP) {
      sqs[to] = EMPTY;
      sqs[to + (us === WHITE ? -16 : 16)] = captured;
    } else {
      sqs[to] = captured;
    }
    if (flags & FLAG_CASTLE_K) {
      sqs[to + 1] = sqs[to - 1];
      sqs[to - 1] = EMPTY;
    } else if (flags & FLAG_CASTLE_Q) {
      sqs[to - 2] = sqs[to + 1];
      sqs[to + 1] = EMPTY;
    }
    if (pieceType(moved) === KING) this.king[us] = from;
    return m;
  }

  /** Aynı pozisyonun, geri alma geçmişi olmayan bir kopyası */
  clone(): Board {
    const c = new Board();
    c.squares.set(this.squares);
    c.turn = this.turn;
    c.castling = this.castling;
    c.ep = this.ep;
    c.halfmove = this.halfmove;
    c.fullmove = this.fullmove;
    c.king[0] = this.king[0];
    c.king[1] = this.king[1];
    return c;
  }

  /** Tahtayı ve durumu karşılaştırır (geri alma geçmişi hariç). Testlerde kullanılır. */
  sameAs(o: Board): boolean {
    if (this.turn !== o.turn || this.castling !== o.castling || this.ep !== o.ep) return false;
    if (this.halfmove !== o.halfmove || this.fullmove !== o.fullmove) return false;
    if (this.king[0] !== o.king[0] || this.king[1] !== o.king[1]) return false;
    for (let i = 0; i < 128; i++) if (this.squares[i] !== o.squares[i]) return false;
    return true;
  }
}

