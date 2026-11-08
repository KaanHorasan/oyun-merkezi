// Tahtadaki dokunma ve sürükle-bırak hareketleri. Hesaplar `animation.ts` ve `geometry.ts` içindedir (testli);
// burası yalnızca parmak olaylarını onlara bağlar.
//
// Akış: kendi taşına basınca hemen seçilir; kısa dokunuş = seç/seçimi kaldır, başka kareye dokunuş = hamle;
// taşı belli bir mesafeden fazla sürüklersen taş parmağı izler, bırakınca yasal kareye oturur (yasadışıysa geri döner).
import { Animated, Easing, PanResponder, Platform } from 'react-native';
import type { PanResponderInstance } from 'react-native';
import type { Dispatch, SetStateAction } from 'react';
import { dragThreshold, dropKind } from './animation';
import type { ChessGame } from './engine/game';
import { EMPTY, moveTo, pieceColor } from './engine/types';
import { squareOrigin, xyToSquare } from './geometry';

/** Sürüklenen taş, parmağın üstünde bu kadar kare yukarıda durur (parmak taşı kapatmasın); web'de fare ile 0 */
export const LIFT = Platform.OS === 'web' ? 0 : 0.5;
/** Sürüklenen taşın büyüklüğü */
export const DRAG_SCALE = 1.2;
/** Bırakılan taşın yerine oturma süresi (ms) */
export const SETTLE_MS = 110;

/** Sürüklenen taş: `landingTo` bırakılıp yerine oturuyorsa hedef kare, yoksa -1 */
export type DragState = { piece: number; from: number; landingTo: number };

export type GestureProps = {
  game: ChessGame;
  size: number;
  flipped: boolean;
  selected: number | null;
  canDrag: boolean;
  onSquare: (sq: number, viaDrag?: boolean) => void;
  onDragChange?: (dragging: boolean) => void;
};

export type GestureDeps = {
  dragPos: Animated.ValueXY;
  dragScale: Animated.Value;
  hoverPos: Animated.ValueXY;
  hoverOpacity: Animated.Value;
  setDrag: Dispatch<SetStateAction<DragState | null>>;
};

export class BoardGestures {
  /** Her çizimde `update` ile tazelenir (olaylar hep güncel değerleri görür) */
  private props: GestureProps | null = null;
  private startX = 0;
  private startY = 0;
  private startSq = -1;
  private piece: number = EMPTY;
  private startedOnOwn = false;
  private wasSelected = false;
  private dragging = false;
  private from = -1;
  private hover = -1;
  private drops = new Set<number>();
  readonly pan: PanResponderInstance;

  constructor(private readonly d: GestureDeps) {
    this.pan = PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: (e) => this.grant(e.nativeEvent.locationX, e.nativeEvent.locationY),
      onPanResponderMove: (_e, gs) => this.move(gs.dx, gs.dy),
      onPanResponderRelease: (_e, gs) => this.release(gs.dx, gs.dy),
      onPanResponderTerminate: () => this.terminate(),
    });
  }

  update(props: GestureProps): void {
    this.props = props;
  }

  /** Parmağın (sürüklenen taşın merkezinin) tahtadaki yeri: taş parmağın biraz üstünde durur */
  private center(dx: number, dy: number, size: number) {
    return { x: this.startX + dx, y: this.startY + dy - LIFT * (size / 8) };
  }

  /** Taşı `target` karesinin yerine oturtur (ya da geri bırakır), sonra sürükleme durumunu temizler */
  private settle(target: number, size: number, flipped: boolean): void {
    const o = squareOrigin(target, size, flipped);
    Animated.parallel([
      Animated.timing(this.d.dragPos, { toValue: o, duration: SETTLE_MS, easing: Easing.out(Easing.quad), useNativeDriver: false }),
      Animated.timing(this.d.dragScale, { toValue: 1, duration: SETTLE_MS, easing: Easing.out(Easing.quad), useNativeDriver: false }),
    ]).start(({ finished }) => {
      if (finished) this.d.setDrag(null);
    });
  }

  private grant(x: number, y: number): void {
    const p = this.props;
    if (!p) return;
    this.startX = x;
    this.startY = y;
    this.dragging = false;
    this.hover = -1;
    this.startSq = xyToSquare(x, y, p.size, p.flipped);
    this.piece = this.startSq >= 0 ? p.game.board.pieceAt(this.startSq) : EMPTY;
    this.startedOnOwn = p.canDrag && this.piece !== EMPTY && pieceColor(this.piece) === p.game.turn;
    this.wasSelected = p.selected === this.startSq;
    // Kendi taşına basınca hemen seçilir (yasal kareler görünür, sürüklerken de kalır)
    if (this.startedOnOwn && !this.wasSelected) p.onSquare(this.startSq);
  }

  private move(dx: number, dy: number): void {
    const p = this.props;
    if (!p || !this.startedOnOwn) return;
    const cell = p.size / 8;
    if (!this.dragging) {
      if (Math.hypot(dx, dy) < dragThreshold(cell)) return;
      this.dragging = true;
      this.from = this.startSq;
      this.drops = new Set(p.game.legalMovesFrom(this.from).map(moveTo));
      this.d.dragPos.stopAnimation();
      this.d.dragScale.stopAnimation();
      this.d.dragScale.setValue(DRAG_SCALE);
      this.d.hoverOpacity.setValue(0);
      const c0 = this.center(dx, dy, p.size);
      this.d.dragPos.setValue({ x: c0.x - cell / 2, y: c0.y - cell / 2 });
      this.d.setDrag({ piece: this.piece, from: this.from, landingTo: -1 });
      p.onDragChange?.(true);
    }
    const c = this.center(dx, dy, p.size);
    this.d.dragPos.setValue({ x: c.x - cell / 2, y: c.y - cell / 2 });
    const sq = xyToSquare(c.x, c.y, p.size, p.flipped);
    if (sq !== this.hover) {
      this.hover = sq;
      if (sq >= 0 && this.drops.has(sq)) {
        this.d.hoverPos.setValue(squareOrigin(sq, p.size, p.flipped));
        this.d.hoverOpacity.setValue(1);
      } else {
        this.d.hoverOpacity.setValue(0);
      }
    }
  }

  private release(dx: number, dy: number): void {
    const p = this.props;
    if (!p) return;
    if (!this.dragging) {
      // Dokunuş: seçili taşa tekrar dokunmak seçimi kaldırır, başka kareye dokunmak hamle/seçim yapar
      const sq = xyToSquare(this.startX + dx, this.startY + dy, p.size, p.flipped);
      if (!this.startedOnOwn) p.onSquare(sq);
      else if (this.wasSelected && sq === this.startSq) p.onSquare(sq);
      return;
    }
    this.dragging = false;
    this.d.hoverOpacity.setValue(0);
    const c = this.center(dx, dy, p.size);
    const sq = xyToSquare(c.x, c.y, p.size, p.flipped);
    const kind = dropKind(p.game, this.from, sq);
    if (kind === 'move') {
      this.d.setDrag((d) => (d ? { ...d, landingTo: sq } : d));
      this.settle(sq, p.size, p.flipped);
      p.onSquare(sq, true);
    } else {
      if (kind === 'promotion') p.onSquare(sq, true); // terfi seçicisi açılır; taş yerine döner
      this.settle(this.from, p.size, p.flipped);
    }
    p.onDragChange?.(false);
  }

  private terminate(): void {
    const p = this.props;
    if (!p || !this.dragging) return;
    this.dragging = false;
    this.d.hoverOpacity.setValue(0);
    this.settle(this.from, p.size, p.flipped);
    p.onDragChange?.(false);
  }
}
