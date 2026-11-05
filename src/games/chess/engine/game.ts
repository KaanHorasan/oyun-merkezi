import { Board } from './board';
import { parseFen, START_FEN, toFen } from './fen';
import { findMove, findMoveUci, legalMoves } from './moves';
import { toPgn } from './pgn';
import type { PgnResult } from './pgn';
import { moveToSan } from './san';
import { cannotEverMate, isInsufficientMaterial, opposite, positionKey } from './status';
import { BLACK, FLAG_EP, PAWN, WHITE, makePiece, moveFlags, moveFrom, movePromo, moveTo, moveToUci } from './types';
import type { Color } from './types';

export type GameStatus =
  | { kind: 'playing'; check: boolean }
  | { kind: 'checkmate'; winner: Color }
  | { kind: 'stalemate' }
  | { kind: 'draw'; reason: 'fifty' | 'repetition' | 'insufficient' | 'agreement' | 'timeout-insufficient' }
  | { kind: 'resigned'; winner: Color }
  | { kind: 'timeout'; winner: Color };

/** Oyunu bitiren, hamle olmayan olaylar */
export type Ending = { kind: 'resigned'; loser: Color } | { kind: 'agreed-draw' } | { kind: 'timeout'; loser: Color };

export type MoveRecord = {
  move: number;
  uci: string;
  san: string;
  mover: Color;
  /** Hamleyi yapan taş (kod) */
  piece: number;
  /** Alınan taş (kod), yoksa 0 */
  captured: number;
  promo: number;
  check: boolean;
};

export type SavedGame = { v: 1; startFen: string; moves: string[]; ending: Ending | null };

/**
 * Arayüzün kullandığı oyun: tahta + hamle geçmişi + oyun durumu (mat, pat, beraberlik, teslim).
 * Beraberlikler (50 hamle, 3 tekrar, yetersiz materyal) kendiliğinden uygulanır.
 */
export class ChessGame {
  readonly board: Board;
  readonly startFen: string;
  private recs: MoveRecord[] = [];
  private keys: string[] = [];
  private ending: Ending | null = null;
  private legalCache: number[] | null = null;
  private statusCache: GameStatus | null = null;

  /** Geçersiz FEN'de hata fırlatır */
  constructor(fen: string = START_FEN) {
    const parsed = parseFen(fen);
    if (!parsed.ok) throw new Error('Geçersiz FEN: ' + parsed.error);
    this.board = parsed.board;
    this.startFen = toFen(parsed.board);
    this.keys.push(positionKey(this.board, this.legalMoves()));
  }

  get turn(): Color {
    return this.board.turn;
  }
  get records(): readonly MoveRecord[] {
    return this.recs;
  }
  get lastMove(): MoveRecord | null {
    return this.recs.length ? this.recs[this.recs.length - 1] : null;
  }
  get isOver(): boolean {
    return this.status.kind !== 'playing';
  }
  /** Oyun süre bitimiyle sona erdiyse süresi biten taraf (beraberlikle bitse de), yoksa null */
  get timeoutLoser(): Color | null {
    return this.ending?.kind === 'timeout' ? this.ending.loser : null;
  }

  legalMoves(): number[] {
    if (!this.legalCache) this.legalCache = legalMoves(this.board);
    return this.legalCache;
  }

  legalMovesFrom(from: number): number[] {
    return this.legalMoves().filter((m) => moveFrom(m) === from);
  }

  get status(): GameStatus {
    if (!this.statusCache) this.statusCache = this.computeStatus();
    return this.statusCache;
  }

  private computeStatus(): GameStatus {
    if (this.ending) {
      const e = this.ending;
      if (e.kind === 'resigned') return { kind: 'resigned', winner: opposite(e.loser) };
      if (e.kind === 'timeout') {
        // Süresi biten oyuncunun rakibi ne yaparsa yapsın mat edemiyorsa (ör. yalnızca şahı kaldıysa) oyun berabere biter
        const winner = opposite(e.loser);
        return cannotEverMate(this.board, winner) ? { kind: 'draw', reason: 'timeout-insufficient' } : { kind: 'timeout', winner };
      }
      return { kind: 'draw', reason: 'agreement' };
    }
    const legal = this.legalMoves();
    const check = this.board.inCheck();
    if (legal.length === 0) return check ? { kind: 'checkmate', winner: opposite(this.board.turn) } : { kind: 'stalemate' };
    if (isInsufficientMaterial(this.board)) return { kind: 'draw', reason: 'insufficient' };
    const key = this.keys[this.keys.length - 1];
    if (this.keys.filter((k) => k === key).length >= 3) return { kind: 'draw', reason: 'repetition' };
    if (this.board.halfmove >= 100) return { kind: 'draw', reason: 'fifty' };
    return { kind: 'playing', check };
  }

  private invalidate() {
    this.legalCache = null;
    this.statusCache = null;
  }

  /** Hamleyi yapar. Hamle yasadışıysa veya oyun bittiyse null döner. Terfi belirtilmezse vezir. */
  play(from: number, to: number, promo = 0): MoveRecord | null {
    if (this.isOver) return null;
    const m = findMove(this.board, from, to, promo);
    return m === null ? null : this.apply(m);
  }

  playUci(uci: string): MoveRecord | null {
    if (this.isOver) return null;
    const m = findMoveUci(this.board, uci);
    return m === null ? null : this.apply(m);
  }

  private apply(m: number): MoveRecord {
    const board = this.board;
    const legal = this.legalMoves();
    const mover = board.turn;
    const piece = board.pieceAt(moveFrom(m));
    const captured = moveFlags(m) & FLAG_EP ? makePiece(opposite(mover), PAWN) : board.pieceAt(moveTo(m));
    const san = moveToSan(board, m, legal);
    board.makeMove(m);
    this.invalidate();
    const rec: MoveRecord = {
      move: m,
      uci: moveToUci(m),
      san,
      mover,
      piece,
      captured,
      promo: movePromo(m),
      check: board.inCheck(),
    };
    this.recs.push(rec);
    this.keys.push(positionKey(board, this.legalMoves()));
    return rec;
  }

  /** Teslim olma/süre bitimi/beraberlik kararı varsa onu kaldırır, yoksa son hamleyi geri alır. Bir şey değiştiyse true. */
  undo(): boolean {
    if (this.ending) {
      this.ending = null;
      this.invalidate();
      return true;
    }
    if (this.recs.length === 0) return false;
    this.board.unmakeMove();
    this.recs.pop();
    this.keys.pop();
    this.invalidate();
    return true;
  }

  resign(loser: Color): boolean {
    if (this.isOver) return false;
    this.ending = { kind: 'resigned', loser };
    this.invalidate();
    return true;
  }

  /** `loser`ın süresi bitti. Rakibi mat edebilecek taşa sahipse rakip kazanır, değilse beraberlik. */
  flag(loser: Color): boolean {
    if (this.isOver) return false;
    this.ending = { kind: 'timeout', loser };
    this.invalidate();
    return true;
  }

  agreeDraw(): boolean {
    if (this.isOver) return false;
    this.ending = { kind: 'agreed-draw' };
    this.invalidate();
    return true;
  }

  get result(): PgnResult {
    const s = this.status;
    if (s.kind === 'checkmate' || s.kind === 'resigned' || s.kind === 'timeout') return s.winner === WHITE ? '1-0' : '0-1';
    if (s.kind === 'stalemate' || s.kind === 'draw') return '1/2-1/2';
    return '*';
  }

  pgn(opts: { white?: string; black?: string; date?: Date } = {}): string {
    return toPgn({ startFen: this.startFen, sans: this.recs.map((r) => r.san), result: this.result, ...opts });
  }

  toSave(): SavedGame {
    return { v: 1, startFen: this.startFen, moves: this.recs.map((r) => r.uci), ending: this.ending };
  }

  /** Kayıttan oyunu kurar; kayıt bozuksa (yasadışı hamle vb.) null. */
  static fromSave(save: SavedGame): ChessGame | null {
    try {
      if (!save || save.v !== 1 || !Array.isArray(save.moves)) return null;
      const g = new ChessGame(save.startFen);
      for (const u of save.moves) if (typeof u !== 'string' || g.playUci(u) === null) return null;
      const e = save.ending;
      if (e) {
        if (e.kind === 'resigned' && (e.loser === WHITE || e.loser === BLACK)) g.resign(e.loser);
        else if (e.kind === 'timeout' && (e.loser === WHITE || e.loser === BLACK)) g.flag(e.loser);
        else if (e.kind === 'agreed-draw') g.agreeDraw();
        else return null;
      }
      return g;
    } catch {
      return null;
    }
  }
}
