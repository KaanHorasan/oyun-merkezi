import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { GameProps } from '../types';
import {
  COLS,
  PIECE_TYPES,
  ROWS,
  getDropInterval,
  getGhost,
  getShape,
  hardDrop,
  holdPiece,
  moveHorizontal,
  newGame,
  pieceCells,
  rotate,
  softDrop,
  stepDown,
} from './logic';
import type { GameState, PieceType } from './logic';

const COLORS: Record<PieceType, string> = {
  I: '#22d3ee',
  O: '#facc15',
  T: '#a855f7',
  S: '#4ade80',
  Z: '#f87171',
  J: '#60a5fa',
  L: '#fb923c',
};

const SIDE_WIDTH = 104;

type DisplayCell = { type: PieceType | null; ghost: boolean };

/** Tahta + hayalet parça + aktif parçayı tek bir ızgarada birleştirir. */
function buildDisplay(game: GameState): DisplayCell[][] {
  const grid: DisplayCell[][] = game.board.map((row) =>
    row.map((v) => ({ type: v === 0 ? null : PIECE_TYPES[v - 1], ghost: false })),
  );
  if (!game.gameOver) {
    for (const [r, c] of pieceCells(getGhost(game))) {
      if (r >= 0 && r < ROWS) grid[r][c] = { type: game.current.type, ghost: true };
    }
  }
  for (const [r, c] of pieceCells(game.current)) {
    if (r >= 0 && r < ROWS) grid[r][c] = { type: game.current.type, ghost: false };
  }
  return grid;
}

function MiniPiece({ type }: { type: PieceType | null }) {
  const size = 14;
  const rows = type ? getShape(type, 0).filter((r) => r.some(Boolean)) : [];
  return (
    <View style={styles.miniBox}>
      {rows.map((row, r) => (
        <View key={r} style={{ flexDirection: 'row' }}>
          {row.map((filled, c) => (
            <View
              key={c}
              style={{
                width: size,
                height: size,
                backgroundColor: filled && type ? COLORS[type] : 'transparent',
              }}
            />
          ))}
        </View>
      ))}
    </View>
  );
}

function RepeatButton({
  label,
  onPress,
  repeat = false,
  style,
}: {
  label: string;
  onPress: () => void;
  repeat?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const delayTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const repeatTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  const stop = useCallback(() => {
    if (delayTimer.current) clearTimeout(delayTimer.current);
    if (repeatTimer.current) clearInterval(repeatTimer.current);
    delayTimer.current = null;
    repeatTimer.current = null;
  }, []);

  useEffect(() => stop, [stop]);

  const start = () => {
    stop();
    onPress();
    if (!repeat) return;
    delayTimer.current = setTimeout(() => {
      repeatTimer.current = setInterval(onPress, 70);
    }, 180);
  };

  return (
    <Pressable onPressIn={start} onPressOut={stop} style={({ pressed }) => [styles.btn, style, pressed && styles.btnPressed]}>
      <Text style={styles.btnText} selectable={false}>
        {label}
      </Text>
    </Pressable>
  );
}

export default function TetrisScreen({ onExit }: GameProps) {
  const [game, setGame] = useState<GameState | null>(null);
  const [paused, setPaused] = useState(false);
  const pausedRef = useRef(false);
  const { width, height } = useWindowDimensions();

  // Rastgele başlangıcı sunucu tarafı üretimiyle çakışmasın diye yüklendikten sonra kur.
  useEffect(() => {
    setGame(newGame());
  }, []);

  useEffect(() => {
    pausedRef.current = paused;
  }, [paused]);

  const act = useCallback((fn: (s: GameState) => GameState) => {
    setGame((prev) => (!prev || prev.gameOver || pausedRef.current ? prev : fn(prev)));
  }, []);

  const restart = () => {
    setGame(newGame());
    setPaused(false);
  };

  // Yerçekimi
  const level = game?.level ?? 1;
  const running = !!game && !game.gameOver && !paused;
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => act((s) => stepDown(s)), getDropInterval(level));
    return () => clearInterval(id);
  }, [running, level, act]);

  // Klavye (web)
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const onKey = (e: KeyboardEvent) => {
      const k = e.key;
      if (k === 'ArrowLeft') act((s) => moveHorizontal(s, -1));
      else if (k === 'ArrowRight') act((s) => moveHorizontal(s, 1));
      else if (k === 'ArrowDown') act((s) => softDrop(s));
      else if (k === 'ArrowUp' || k === 'x' || k === 'X') act((s) => rotate(s, 1));
      else if (k === 'z' || k === 'Z') act((s) => rotate(s, -1));
      else if (k === ' ') act((s) => hardDrop(s));
      else if (k === 'c' || k === 'C') act((s) => holdPiece(s));
      else if (k === 'p' || k === 'P') setPaused((p) => !p);
      else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [act]);

  const cell = Math.max(
    14,
    Math.min(32, Math.floor(Math.min((width - 40 - SIDE_WIDTH - 12) / COLS, (height - 340) / ROWS))),
  );

  const display = game ? buildDisplay(game) : null;

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Pressable onPress={onExit} hitSlop={10}>
          <Text style={styles.headerBtn}>‹ Geri</Text>
        </Pressable>
        <Text style={styles.title}>Tetris</Text>
        <Pressable onPress={() => setPaused((p) => !p)} hitSlop={10} disabled={!game || game.gameOver}>
          <Text style={styles.headerBtn}>{paused ? '▶ Devam' : '⏸ Duraklat'}</Text>
        </Pressable>
      </View>

      <View style={styles.playArea}>
        <View style={styles.boardFrame}>
          <View style={{ width: cell * COLS, height: cell * ROWS, backgroundColor: '#141414' }}>
            {display?.map((row, r) => (
              <View key={r} style={{ flexDirection: 'row' }}>
                {row.map((c, col) => {
                  const color = c.type ? COLORS[c.type] : null;
                  return (
                    <View
                      key={col}
                      style={{
                        width: cell,
                        height: cell,
                        borderWidth: color ? 1 : 0.5,
                        borderColor: !color ? '#1f1f1f' : c.ghost ? color : 'rgba(255,255,255,0.25)',
                        backgroundColor: !color || c.ghost ? 'transparent' : color,
                        opacity: c.ghost ? 0.45 : 1,
                      }}
                    />
                  );
                })}
              </View>
            ))}

            {game?.gameOver && (
              <View style={styles.overlay}>
                <Text style={styles.overlayTitle}>Oyun bitti</Text>
                <Text style={styles.overlayText}>Skor: {game.score}</Text>
                <Pressable style={styles.overlayBtn} onPress={restart}>
                  <Text style={styles.btnText}>Tekrar oyna</Text>
                </Pressable>
              </View>
            )}
            {paused && !game?.gameOver && (
              <View style={styles.overlay}>
                <Text style={styles.overlayTitle}>Duraklatıldı</Text>
                <Pressable style={styles.overlayBtn} onPress={() => setPaused(false)}>
                  <Text style={styles.btnText}>Devam</Text>
                </Pressable>
              </View>
            )}
          </View>
        </View>

        <View style={styles.side}>
          <Text style={styles.label}>SKOR</Text>
          <Text style={styles.value}>{game?.score ?? 0}</Text>
          <Text style={styles.label}>SATIR</Text>
          <Text style={styles.value}>{game?.lines ?? 0}</Text>
          <Text style={styles.label}>SEVİYE</Text>
          <Text style={styles.value}>{game?.level ?? 1}</Text>
          <Text style={styles.label}>SIRADAKİ</Text>
          <MiniPiece type={game?.next ?? null} />
          <Text style={styles.label}>TUT</Text>
          <MiniPiece type={game?.hold ?? null} />
        </View>
      </View>

      <View style={styles.controls}>
        <View style={styles.controlRow}>
          <RepeatButton label="◀" repeat onPress={() => act((s) => moveHorizontal(s, -1))} />
          <RepeatButton label="▼" repeat onPress={() => act((s) => softDrop(s))} />
          <RepeatButton label="▶" repeat onPress={() => act((s) => moveHorizontal(s, 1))} />
        </View>
        <View style={styles.controlRow}>
          <RepeatButton label="↻ Döndür" onPress={() => act((s) => rotate(s, 1))} />
          <RepeatButton label="⤓ Düşür" onPress={() => act((s) => hardDrop(s))} />
          <RepeatButton label="⇄ Tut" onPress={() => act((s) => holdPiece(s))} />
        </View>
        {Platform.OS === 'web' && (
          <Text style={styles.hint}>Klavye: ← → ↓ hareket · ↑/X döndür · Z ters döndür · Boşluk düşür · C tut · P duraklat</Text>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#111', paddingHorizontal: 20 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 10 },
  headerBtn: { color: '#ddd', fontSize: 16 },
  title: { color: '#fff', fontSize: 20, fontWeight: '700' },
  playArea: { flexDirection: 'row', justifyContent: 'center', gap: 12, marginTop: 4 },
  boardFrame: { borderWidth: 2, borderColor: '#444', borderRadius: 4, backgroundColor: '#141414' },
  side: { width: SIDE_WIDTH },
  label: { color: '#888', fontSize: 11, letterSpacing: 1, marginTop: 8 },
  value: { color: '#fff', fontSize: 22, fontWeight: '700' },
  miniBox: { height: 36, marginTop: 4, justifyContent: 'center' },
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.75)',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  overlayTitle: { color: '#fff', fontSize: 24, fontWeight: '700' },
  overlayText: { color: '#ddd', fontSize: 18 },
  overlayBtn: { backgroundColor: '#2563eb', paddingHorizontal: 22, paddingVertical: 12, borderRadius: 10 },
  controls: { marginTop: 12, gap: 10 },
  controlRow: { flexDirection: 'row', gap: 10 },
  btn: { flex: 1, backgroundColor: '#2a2a2a', paddingVertical: 16, borderRadius: 12, alignItems: 'center' },
  btnPressed: { backgroundColor: '#444' },
  btnText: { color: '#fff', fontSize: 17, fontWeight: '600' },
  hint: { color: '#777', fontSize: 12, textAlign: 'center', marginTop: 4 },
});
