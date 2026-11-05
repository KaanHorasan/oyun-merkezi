import type { ReactElement } from 'react';
import { StyleSheet, View } from 'react-native';
import type { GestureResponderEvent } from 'react-native';
import Svg, { Circle, Rect, Text as SvgText } from 'react-native-svg';
import type { ChessGame } from './engine/game';
import { EMPTY, fileOf, moveFrom, moveTo, rankOf } from './engine/types';
import type { Target } from './controller';
import { isDarkSquare, squareOrigin, xyToSquare } from './geometry';
import { PieceInSvg } from './pieces';

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
  onSquare: (sq: number) => void;
};

/** Tahtanın tamamı tek bir SVG: kareler, vurgular, koordinatlar, taşlar, yasal hamle noktaları. */
export default function ChessBoard({ game, size, flipped, selected, targets, showHints, checkSquare, onSquare }: Props) {
  'use no memo'; // game dışarıdan değiştirilen (mutable) bir nesne
  const cell = size / 8;
  const last = game.lastMove;
  const lastFrom = last ? moveFrom(last.move) : -1;
  const lastTo = last ? moveTo(last.move) : -1;

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
      if (piece !== EMPTY) pieces.push(<PieceInSvg key={`p${sq}`} piece={piece} x={x} y={y} size={cell} />);
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

  const onRelease = (e: GestureResponderEvent) => {
    onSquare(xyToSquare(e.nativeEvent.locationX, e.nativeEvent.locationY, size, flipped));
  };

  return (
    <View style={{ width: size, height: size, borderRadius: 10, overflow: 'hidden' }}>
      <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        {squares}
        {overlays}
        {coords}
        {pieces}
        {hints}
      </Svg>
      {/* Dokunma katmanı: konum, çizimle aynı formülle kareye çevrilir (geometry.ts, testli) */}
      <View style={StyleSheet.absoluteFill} onStartShouldSetResponder={() => true} onResponderRelease={onRelease} />
    </View>
  );
}
