import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { AppState, PanResponder, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import type { LayoutChangeEvent, StyleProp, ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import SettingsPanel from '@/components/SettingsPanel';
import { haptic, playSound, rewindMusic, setMusic, setMusicVolume } from '@/lib/feedback';
import type { HapticKind, SoundName } from '@/lib/feedback';
import { record } from '@/lib/progress/progress';
import { useSettings } from '@/lib/settings';
import { loadJSON, saveJSON } from '@/lib/storage';
import type { GameProps } from '../types';
import {
  COLS,
  PIECE_TYPES,
  ROWS,
  getGhost,
  getShape,
  hardDrop,
  holdPiece,
  moveHorizontal,
  newGame,
  pieceCells,
  rotate,
  softDrop,
  tick,
} from './logic';
import type { GameEventKind, GameState, PieceType } from './logic';

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
const TICK_MS = 40;
const BEST_KEY = 'tetris:best';

// Dokunmatik hareket ayarları
const FLICK_VELOCITY = 1.1; // px/ms: bundan hızlı aşağı fırlatma = hızlı düşür
const FLICK_MIN_DIST = 60; // px
const TAP_MAX_MS = 300;
const TAP_SLOP = 10; // px

const SOUND_FOR: Record<GameEventKind, SoundName> = {
  rotate: 'rotate',
  hold: 'hold',
  lock: 'lock',
  clear: 'clear',
  tetris: 'tetris',
  levelup: 'levelup',
  gameover: 'gameover',
};
const HAPTIC_FOR: Record<GameEventKind, HapticKind> = {
  rotate: 'select',
  hold: 'light',
  lock: 'light',
  clear: 'medium',
  tetris: 'success',
  levelup: 'success',
  gameover: 'error',
};

const webNoTouch: ViewStyle | undefined =
  Platform.OS === 'web' ? ({ touchAction: 'none', userSelect: 'none' } as unknown as ViewStyle) : undefined;

/**
 * Tahta + hayalet + aktif parçayı satır satır metne çevirir:
 * '.' boş, büyük harf dolu hücre, küçük harf hayalet parça.
 * (Satırlar metin olduğu için değişmeyen satırlar yeniden çizilmez.)
 */
function buildDisplay(game: GameState, showGhost: boolean): string[] {
  const grid: string[][] = game.board.map((row) => row.map((v) => (v === 0 ? '.' : PIECE_TYPES[v - 1])));
  if (showGhost && !game.gameOver) {
    for (const [r, c] of pieceCells(getGhost(game))) {
      if (r >= 0 && r < ROWS && grid[r][c] === '.') grid[r][c] = game.current.type.toLowerCase();
    }
  }
  for (const [r, c] of pieceCells(game.current)) {
    if (r >= 0 && r < ROWS) grid[r][c] = game.current.type;
  }
  return grid.map((row) => row.join(''));
}

const BoardRow = memo(function BoardRow({ line, cell }: { line: string; cell: number }) {
  return (
    <View style={{ flexDirection: 'row' }}>
      {line.split('').map((ch, i) => {
        if (ch === '.') {
          return (
            <View
              key={i}
              style={{ width: cell, height: cell, borderWidth: 0.5, borderColor: '#1f1f1f' }}
            />
          );
        }
        const ghost = ch === ch.toLowerCase();
        const color = COLORS[ch.toUpperCase() as PieceType];
        return (
          <View
            key={i}
            style={{
              width: cell,
              height: cell,
              borderWidth: 1,
              borderColor: ghost ? color : 'rgba(255,255,255,0.25)',
              backgroundColor: ghost ? 'transparent' : color,
              opacity: ghost ? 0.45 : 1,
            }}
          />
        );
      })}
    </View>
  );
});

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
    <Pressable
      onPressIn={start}
      onPressOut={stop}
      style={({ pressed }) => [styles.btn, style, pressed && styles.btnPressed]}
    >
      <Text style={styles.btnText} selectable={false}>
        {label}
      </Text>
    </Pressable>
  );
}

export default function TetrisScreen({ onExit }: GameProps) {
  const [settings] = useSettings();
  const [game, setGame] = useState<GameState | null>(null);
  const [paused, setPaused] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [best, setBest] = useState(0);
  const [newRecord, setNewRecord] = useState(false);
  const [area, setArea] = useState({ w: 0, h: 0 });

  const pausedRef = useRef(false);
  const settingsRef = useRef(settings);
  const musicWantedRef = useRef(false);
  const bestRef = useRef(0);
  const cellRef = useRef(24);
  const lastTickRef = useRef(0);
  const gestureRef = useRef({ anchorX: 0, anchorY: 0, moved: false, start: 0 });

  // Rastgele başlangıç sunucu tarafı üretimiyle çakışmasın diye yüklendikten sonra kurulur.
  useEffect(() => {
    setGame(newGame());
    loadJSON<number>(BEST_KEY, 0).then((v) => {
      bestRef.current = v;
      setBest(v);
    });
  }, []);

  useEffect(() => {
    pausedRef.current = paused;
  }, [paused]);
  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);

  const act = useCallback((fn: (s: GameState) => GameState) => {
    setGame((prev) => (!prev || prev.gameOver || pausedRef.current ? prev : fn(prev)));
  }, []);

  const restart = () => {
    rewindMusic('tetris');
    setGame(newGame());
    setPaused(false);
    setNewRecord(false);
  };

  // Zaman ilerletme (yerçekimi + kilit gecikmesi)
  const running = !!game && !game.gameOver && !paused;
  useEffect(() => {
    if (!running) return;
    lastTickRef.current = Date.now();
    const id = setInterval(() => {
      const now = Date.now();
      const dt = Math.min(now - lastTickRef.current, 100);
      lastTickRef.current = now;
      act((s) => tick(s, dt));
    }, TICK_MS);
    return () => clearInterval(id);
  }, [running, act]);

  // Müzik: oyun çalışırken ve ayar açıkken çalar; duraklatınca, oyun bitince ve ekrandan çıkınca durur.
  // Ayarlar açıkken (oyun duraklamışken) de çalar ki ses düzeyini ayarlarken duyulsun.
  const musicOn = settings.music && (running || settingsOpen);
  const { musicVolume } = settings;
  useEffect(() => {
    setMusicVolume('tetris', musicVolume);
  }, [musicVolume]);
  useEffect(() => {
    musicWantedRef.current = musicOn;
    setMusic('tetris', musicOn);
  }, [musicOn]);
  useEffect(() => () => setMusic('tetris', false), []);
  // Tarayıcılar sesi ilk dokunuştan önce engelleyebilir; dokunuş/tuşta tekrar dene.
  const nudgeMusic = useCallback(() => {
    if (musicWantedRef.current) setMusic('tetris', true);
  }, []);

  // Ses ve titreşim
  const event = game?.event ?? null;
  useEffect(() => {
    if (!event) return;
    const { sound, sfxVolume, vibration } = settingsRef.current;
    if (sound) playSound(SOUND_FOR[event.kind], sfxVolume);
    if (vibration) haptic(HAPTIC_FOR[event.kind]);
  }, [event]);

  // Rekor
  const isOver = game?.gameOver ?? false;
  const finalScore = game?.score ?? 0;
  useEffect(() => {
    if (isOver && finalScore > bestRef.current) {
      bestRef.current = finalScore;
      setBest(finalScore);
      setNewRecord(true);
      saveJSON(BEST_KEY, finalScore);
    }
  }, [isOver, finalScore]);

  // Görev ve başarımlar için istatistikler (oyundaki kesin sayaçların farkları bildirilir)
  const statLines = game?.lines ?? 0;
  const statTetrises = game?.tetrises ?? 0;
  const statScore = game?.score ?? 0;
  const statLevel = game?.level ?? 1;
  const prevStats = useRef({ lines: 0, tetrises: 0 });
  useEffect(() => {
    const d = statLines - prevStats.current.lines;
    if (d > 0) record('tt.lines', d);
    prevStats.current.lines = statLines; // yeni oyunda 0'a döner
  }, [statLines]);
  useEffect(() => {
    const d = statTetrises - prevStats.current.tetrises;
    if (d > 0) record('tt.tetrises', d);
    prevStats.current.tetrises = statTetrises;
  }, [statTetrises]);
  useEffect(() => {
    if (statScore > 0) record('tt.bestScore', statScore);
  }, [statScore]);
  useEffect(() => {
    if (statLevel > 1) record('tt.maxLevel', statLevel);
  }, [statLevel]);
  useEffect(() => {
    if (isOver) record('tt.games', 1);
  }, [isOver]);

  // Uygulama arka plana geçince otomatik duraklat
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state !== 'active') setPaused(true);
    });
    return () => sub.remove();
  }, []);

  // Klavye (web)
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const onKey = (e: KeyboardEvent) => {
      const k = e.key;
      nudgeMusic();
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
  }, [act, nudgeMusic]);

  // Dokunmatik hareketler:
  //  - sağa/sola sürükle: parçayı kaydır (parmağı hücre hızıyla takip eder)
  //  - aşağı sürükle: yumuşak düşür
  //  - kısa dokunuş: döndür
  //  - hızlı aşağı fırlat: hızlı düşür
  //  - hızlı yukarı fırlat: parçayı sakla (hold)
  const [pan] = useState(() =>
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: () => {
        nudgeMusic();
        const g = gestureRef.current;
        g.anchorX = 0;
        g.anchorY = 0;
        g.moved = false;
        g.start = Date.now();
      },
      onPanResponderMove: (_e, gs) => {
        const g = gestureRef.current;
        const stepX = cellRef.current * 0.9;
        const stepY = cellRef.current * 0.8;
        while (gs.dx - g.anchorX >= stepX) {
          act((s) => moveHorizontal(s, 1));
          g.anchorX += stepX;
          g.moved = true;
        }
        while (gs.dx - g.anchorX <= -stepX) {
          act((s) => moveHorizontal(s, -1));
          g.anchorX -= stepX;
          g.moved = true;
        }
        while (gs.dy - g.anchorY >= stepY) {
          act((s) => softDrop(s));
          g.anchorY += stepY;
          g.moved = true;
        }
        if (Math.abs(gs.dx) > TAP_SLOP || Math.abs(gs.dy) > TAP_SLOP) g.moved = true;
      },
      onPanResponderRelease: (_e, gs) => {
        const g = gestureRef.current;
        const elapsed = Date.now() - g.start;
        const vertical = Math.abs(gs.dy) > Math.abs(gs.dx);
        if (!g.moved && elapsed < TAP_MAX_MS) {
          act((s) => rotate(s, 1));
        } else if (vertical && gs.dy > FLICK_MIN_DIST && gs.vy > FLICK_VELOCITY) {
          act((s) => hardDrop(s));
        } else if (vertical && gs.dy < -FLICK_MIN_DIST && gs.vy < -FLICK_VELOCITY * 0.6) {
          act((s) => holdPiece(s));
        }
      },
    }),
  );

  const onAreaLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setArea({ w: width, h: height });
  };

  const cell =
    area.w > 0
      ? Math.max(12, Math.min(36, Math.floor(Math.min((area.w - SIDE_WIDTH - 12 - 4) / COLS, (area.h - 8 - 4) / ROWS))))
      : 0;
  useEffect(() => {
    if (cell > 0) cellRef.current = cell;
  }, [cell]);

  const lines = game && cell > 0 ? buildDisplay(game, settings.ghost) : null;

  const openSettings = () => {
    setPaused(true);
    setSettingsOpen(true);
  };

  return (
    <SafeAreaView style={styles.container} onTouchStart={nudgeMusic}>
      <View style={styles.header}>
        <Pressable onPress={onExit} hitSlop={10}>
          <Text style={styles.headerBtn}>‹ Geri</Text>
        </Pressable>
        <Text style={styles.title}>Tetris</Text>
        <View style={styles.headerRight}>
          <Pressable onPress={() => setPaused((p) => !p)} hitSlop={10} disabled={!game || game.gameOver}>
            <Text style={styles.headerBtn}>{paused ? '▶' : '⏸'}</Text>
          </Pressable>
          <Pressable onPress={openSettings} hitSlop={10}>
            <Text style={styles.headerBtn}>⚙</Text>
          </Pressable>
        </View>
      </View>

      <View style={[styles.playWrap, webNoTouch]} onLayout={onAreaLayout} {...pan.panHandlers}>
        {lines && (
          <View style={styles.playArea}>
            <View style={styles.boardFrame}>
              <View style={{ width: cell * COLS, height: cell * ROWS, backgroundColor: '#141414' }}>
                {lines.map((line, r) => (
                  <BoardRow key={r} line={line} cell={cell} />
                ))}

                {game?.gameOver && (
                  <View style={styles.overlay}>
                    <Text style={styles.overlayTitle}>Oyun bitti</Text>
                    <Text style={styles.overlayText}>Skor: {game.score}</Text>
                    {newRecord && <Text style={styles.record}>🏆 Yeni rekor!</Text>}
                    <Pressable style={styles.overlayBtn} onPress={restart}>
                      <Text style={styles.btnText}>Tekrar oyna</Text>
                    </Pressable>
                  </View>
                )}
                {paused && !game?.gameOver && !settingsOpen && (
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
              <Text style={styles.label}>REKOR</Text>
              <Text style={styles.value}>{Math.max(best, game?.score ?? 0)}</Text>
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
        )}
      </View>

      {settings.showButtons && (
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
        </View>
      )}
      <Text style={styles.hint}>
        {Platform.OS === 'web'
          ? 'Klavye: ← → ↓ · ↑/X döndür · Z ters · Boşluk düşür · C tut · P duraklat   |   Dokunma: kaydır, dokun = döndür, aşağı fırlat = düşür, yukarı fırlat = tut'
          : 'Kaydır: hareket · Dokun: döndür · Aşağı fırlat: düşür · Yukarı fırlat: tut'}
      </Text>

      {settingsOpen && <SettingsPanel ghost buttons onClose={() => setSettingsOpen(false)} />}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#111', paddingHorizontal: 20 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 10 },
  headerRight: { flexDirection: 'row', gap: 18 },
  headerBtn: { color: '#ddd', fontSize: 18 },
  title: { color: '#fff', fontSize: 20, fontWeight: '700' },
  playWrap: { flex: 1 },
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
  record: { color: '#facc15', fontSize: 18, fontWeight: '700' },
  overlayBtn: { backgroundColor: '#2563eb', paddingHorizontal: 22, paddingVertical: 12, borderRadius: 10 },
  controls: { marginTop: 8, gap: 10 },
  controlRow: { flexDirection: 'row', gap: 10 },
  btn: { flex: 1, backgroundColor: '#2a2a2a', paddingVertical: 16, borderRadius: 12, alignItems: 'center' },
  btnPressed: { backgroundColor: '#444' },
  btnText: { color: '#fff', fontSize: 17, fontWeight: '600' },
  hint: { color: '#666', fontSize: 11, textAlign: 'center', marginTop: 8, marginBottom: 4 },
});
