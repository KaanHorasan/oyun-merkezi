import { useEffect, useLayoutEffect, useState } from 'react';
import type { ReactElement } from 'react';
import { Animated, Easing, Platform, StyleSheet, View } from 'react-native';
import type { ViewStyle } from 'react-native';
import Svg, { Circle, Rect, Text as SvgText } from 'react-native-svg';
import { slideDuration } from './animation';
import type { SlideAnim } from './animation';
import { BoardGestures } from './boardGestures';
import type { DragState } from './boardGestures';
import type { ChessGame } from './engine/game';
import { EMPTY, fileOf, moveFrom, moveTo, rankOf } from './engine/types';
import type { Target } from './controller';
import { isDarkSquare, squareOrigin } from './geometry';
import { PieceIcon, PieceInSvg } from './pieces';

const COLORS = {
  light: '#dfe6f5',
  dark: '#6b7fb0',
  lastMove: '#facc15',
  selected: '#facc15',
  check: '#ef4444',
  hint: '#1b2236',
  coordOnLight: '#6b7fb0',
  coordOnDark: '#dfe6f5',
};

/** Web'de sürüklerken sayfanın kaymasını/metin seçmesini engeller */
const WEB_NO_SCROLL = (Platform.OS === 'web' ? { touchAction: 'none', userSelect: 'none' } : {}) as ViewStyle;

type Props = {
  game: ChessGame;
  /** Her hamlede artar: oyun nesnesi yerinde değiştiği için yeniden çizimi tetikler */
  ver: number;
  size: number;
  flipped: boolean;
  selected: number | null;
  targets: Target[];
  showHints: boolean;
  checkSquare: number;
  /** Taş sürüklenebilir mi (oyun bitmemiş, onay/terfi penceresi kapalı) */
  canDrag: boolean;
  /** Oynanan hamlenin kayma animasyonu (yoksa null) */
  slide: SlideAnim | null;
  /** Kareye dokunuldu ya da taş o kareye bırakıldı (`viaDrag`) */
  onSquare: (sq: number, viaDrag?: boolean) => void;
  /** Sürükleme başlayınca/bitince (üstteki kaydırmayı kilitlemek için) */
  onDragChange?: (dragging: boolean) => void;
};

/**
 * Tahtanın zemini tek bir SVG: kareler, vurgular, koordinatlar, taşlar, yasal hamle noktaları.
 * Üstünde: dokunma/sürükleme katmanı, sürüklenen taş, hamle kayma animasyonu (hareketli taşlar ayrı katmanlarda çizilir).
 * Dokunma akışı: taşa dokun = seç (sonra hedefe dokun) ya da taşı tutup hedefe sürükle.
 */
export default function ChessBoard({ game, size, flipped, selected, targets, showHints, checkSquare, canDrag, slide, onSquare, onDragChange }: Props) {
  'use no memo'; // game dışarıdan değiştirilen (mutable) bir nesne
  const cell = size / 8;
  const last = game.lastMove;
  const lastFrom = last ? moveFrom(last.move) : -1;
  const lastTo = last ? moveTo(last.move) : -1;

  const [drag, setDrag] = useState<DragState | null>(null);
  const [slideDone, setSlideDone] = useState(-1);
  const [dragPos] = useState(() => new Animated.ValueXY());
  const [dragScale] = useState(() => new Animated.Value(1));
  const [hoverPos] = useState(() => new Animated.ValueXY());
  const [hoverOpacity] = useState(() => new Animated.Value(0));
  const [progress] = useState(() => new Animated.Value(0));

  // Dokunma/sürükleme olayları (boardGestures.ts); güncel değerler her çizimde verilir
  const [gestures] = useState(() => new BoardGestures({ dragPos, dragScale, hoverPos, hoverOpacity, setDrag }));
  useEffect(() => {
    gestures.update({ game, size, flipped, selected, canDrag, onSquare, onDragChange });
  });

  // Hamle kayma animasyonu: yeni bir `slide` gelince 0'dan 1'e oynar (ilk çizimden önce sıfırlanır, taş hedefte yanıp sönmez)
  useLayoutEffect(() => {
    if (!slide || slide.legs.length === 0) return;
    progress.setValue(0);
    const anim = Animated.timing(progress, { toValue: 1, duration: slideDuration(slide.legs[0]), easing: Easing.out(Easing.cubic), useNativeDriver: false });
    anim.start(({ finished }) => {
      if (finished) setSlideDone(slide.id);
    });
    return () => anim.stop();
  }, [slide, progress]);

  const sliding = slide !== null && slide.legs.length > 0 && slideDone !== slide.id;
  // Hareketli (sürüklenen / kayan) taşların kendi katmanında çizildiği kareler: zeminde çizilmez
  const hidden = new Set<number>();
  if (drag) {
    hidden.add(drag.from);
    if (drag.landingTo >= 0) hidden.add(drag.landingTo);
  }
  if (sliding) for (const leg of slide.legs) hidden.add(leg.to);

  const squares: ReactElement[] = [];
  const overlays: ReactElement[] = [];
  const coords: ReactElement[] = [];
  const pieces: ReactElement[] = [];

  for (let r = 0; r < 8; r++) {
    for (let f = 0; f < 8; f++) {
      const sq = r * 16 + f;
      const { x, y } = squareOrigin(sq, size, flipped);
      const dark = isDarkSquare(sq);
      squares.push(<Rect key={`s${sq}`} x={x} y={y} width={cell} height={cell} fill={dark ? COLORS.dark : COLORS.light} />);

      if (sq === lastFrom || sq === lastTo) {
        overlays.push(<Rect key={`l${sq}`} x={x} y={y} width={cell} height={cell} fill={COLORS.lastMove} opacity={0.36} />);
      }
      if (sq === checkSquare) {
        overlays.push(<Rect key={`c${sq}`} x={x} y={y} width={cell} height={cell} fill={COLORS.check} opacity={0.5} />);
      }
      if (sq === selected) {
        overlays.push(<Rect key={`sel${sq}`} x={x} y={y} width={cell} height={cell} fill={COLORS.selected} opacity={0.55} />);
      }

      // Koordinatlar: sol kenarda sıra numarası, alt kenarda dosya harfi
      const labelColor = dark ? COLORS.coordOnDark : COLORS.coordOnLight;
      const fs = cell * 0.2;
      const { col, row } = { col: Math.round(x / cell), row: Math.round(y / cell) };
      if (col === 0) {
        coords.push(
          <SvgText key={`rn${sq}`} x={x + cell * 0.06} y={y + fs * 1.05} fontSize={fs} fontWeight="700" fill={labelColor}>
            {rankOf(sq) + 1}
          </SvgText>,
        );
      }
      if (row === 7) {
        coords.push(
          <SvgText key={`fl${sq}`} x={x + cell - cell * 0.06} y={y + cell - cell * 0.07} fontSize={fs} fontWeight="700" fill={labelColor} textAnchor="end">
            {String.fromCharCode(97 + fileOf(sq))}
          </SvgText>,
        );
      }

      const piece = game.board.pieceAt(sq);
      if (piece !== EMPTY && !hidden.has(sq)) pieces.push(<PieceInSvg key={`p${sq}`} piece={piece} x={x} y={y} size={cell} />);
    }
  }

  const hints: ReactElement[] = [];
  if (showHints) {
    for (const t of targets) {
      const { x, y } = squareOrigin(t.sq, size, flipped);
      hints.push(
        t.capture ? (
          <Circle key={`h${t.sq}`} cx={x + cell / 2} cy={y + cell / 2} r={cell * 0.43} fill="none" stroke={COLORS.hint} strokeWidth={cell * 0.08} opacity={0.4} />
        ) : (
          <Circle key={`h${t.sq}`} cx={x + cell / 2} cy={y + cell / 2} r={cell * 0.17} fill={COLORS.hint} opacity={0.38} />
        ),
      );
    }
  }

  const slideSprites: ReactElement[] = [];
  if (sliding) {
    slide.legs.forEach((leg, i) => {
      const piece = game.board.pieceAt(leg.to);
      if (piece === EMPTY) return;
      const a = squareOrigin(leg.from, size, flipped);
      const b = squareOrigin(leg.to, size, flipped);
      slideSprites.push(
        <Animated.View
          key={`sl${slide.id}-${i}`}
          pointerEvents="none"
          style={[
            styles.sprite,
            {
              width: cell,
              height: cell,
              transform: [
                { translateX: progress.interpolate({ inputRange: [0, 1], outputRange: [a.x, b.x] }) },
                { translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [a.y, b.y] }) },
              ],
            },
          ]}
        >
          <PieceIcon piece={piece} size={cell} />
        </Animated.View>,
      );
    });
  }

  return (
    <View style={[{ width: size, height: size }, WEB_NO_SCROLL]}>
      <View style={{ width: size, height: size, borderRadius: 10, overflow: 'hidden' }}>
        <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
          {squares}
          {overlays}
          {coords}
          {pieces}
          {hints}
        </Svg>
      </View>
      {/* Dokunma/sürükleme katmanı: konum, çizimle aynı formülle kareye çevrilir (geometry.ts, testli) */}
      <View style={[StyleSheet.absoluteFill, WEB_NO_SCROLL]} {...gestures.pan.panHandlers} />
      {slideSprites}
      {drag && (
        <>
          {/* Sürüklerken taşın bırakılabileceği kareyi vurgular */}
          <Animated.View
            pointerEvents="none"
            style={[styles.hover, { width: cell, height: cell, opacity: hoverOpacity, transform: hoverPos.getTranslateTransform() }]}
          />
          <Animated.View
            pointerEvents="none"
            style={[styles.sprite, { width: cell, height: cell, transform: [...dragPos.getTranslateTransform(), { scale: dragScale }] }]}
          >
            <PieceIcon piece={drag.piece} size={cell} />
          </Animated.View>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  sprite: { position: 'absolute', left: 0, top: 0 },
  hover: { position: 'absolute', left: 0, top: 0, borderWidth: 3, borderColor: COLORS.selected, backgroundColor: 'rgba(250,204,21,0.22)', borderRadius: 4 },
});
