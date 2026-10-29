import { memo, useCallback, useEffect, useRef, useState } from 'react';
import type { ComponentRef } from 'react';
import { AppState, PanResponder, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { LayoutChangeEvent } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import SettingsPanel from '@/components/SettingsPanel';
import { haptic, playSound } from '@/lib/feedback';
import { useSettings } from '@/lib/settings';
import type { GameProps } from '../types';
import { EMPTY_BEST, clearRun, loadBest, loadRun, restoreWorld, saveBest, saveRun } from './persistence';
import type { BestScores, SavedRun } from './persistence';
import { screenToCell, viewWindow } from './geometry';
import type { Size, View as ViewState } from './geometry';
import {
  CHUNK_BITS,
  DIFFICULTIES,
  FLAGGED,
  HIDDEN,
  REVEALED,
  chord,
  chunkKey,
  createWorld,
  isMine,
  localIndex,
  reveal,
  toggleFlag,
  cellState,
} from './world';
import type { Chunk, Difficulty, RevealResult, World } from './world';

// ---------- Görünüm sabitleri ----------

const MIN_CELL = 24;
const MAX_CELL = 64;
const DEFAULT_CELL = 40;
const TAP_SLOP = 8; // px: bundan fazla kayarsa sürükleme sayılır
const LONG_PRESS_MS = 380;

const C = {
  bg: '#0b0e14',
  ground: '#141821', // açık/boş zemin
  tile0: '#2b3347', // kapalı kare (bölüm rengi 1)
  tile1: '#323b52', // kapalı kare (bölüm rengi 2) -> bölümler ayırt edilir
  numberTile: '#1b2130',
  accent: '#6366f1',
  text: '#e5e7eb',
  muted: '#8b93a7',
  chip: 'rgba(20,24,33,0.9)',
  danger: '#ef4444',
};
const NUMBER_COLORS = ['', '#60a5fa', '#4ade80', '#f87171', '#a78bfa', '#fb923c', '#2dd4bf', '#f472b6', '#cbd5e1'];

// Hücre görünüm kodları: 0..8 = açık sayı, negatifler özel durumlar
const CODE_HIDDEN = -1;
const CODE_FLAG = -2;
const CODE_MINE = 9;
const CODE_EXPLODED = 10;
const CODE_WRONG_FLAG = 11;

const clampCell = (c: number) => Math.min(MAX_CELL, Math.max(MIN_CELL, c));
const fmt = (n: number) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '.');

// ---------- Tek kare ----------

const BoardCell = memo(function BoardCell({
  code,
  tint,
  size,
  left,
  top,
}: {
  code: number;
  tint: number;
  size: number;
  left: number;
  top: number;
}) {
  let bg = tint ? C.tile1 : C.tile0;
  let label = '';
  let color: string = C.text;
  if (code >= 1 && code <= 8) {
    bg = C.numberTile;
    label = String(code);
    color = NUMBER_COLORS[code];
  } else if (code === CODE_FLAG) {
    label = '🚩';
  } else if (code === CODE_MINE) {
    bg = '#3a2230';
    label = '💣';
  } else if (code === CODE_EXPLODED) {
    bg = C.danger;
    label = '💥';
  } else if (code === CODE_WRONG_FLAG) {
    bg = '#3a2a2a';
    label = '✖';
    color = '#f87171';
  }
  return (
    <View
      style={{
        position: 'absolute',
        left: left + 1,
        top: top + 1,
        width: size - 2,
        height: size - 2,
        borderRadius: Math.max(3, size * 0.2),
        backgroundColor: bg,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {label !== '' && (
        <Text selectable={false} style={{ fontSize: size * (code >= 1 && code <= 8 ? 0.56 : 0.5), fontWeight: '800', color }}>
          {label}
        </Text>
      )}
    </View>
  );
});

// ---------- Sonsuz tahta: sadece ekranda görünen kareler çizilir ----------

function Board({ world, view, size }: { world: World; view: ViewState; size: Size; ver: number }) {
  'use no memo'; // world dışarıdan değiştirilen (mutable) bir nesne; derleyici önbelleğe almasın
  const { cell } = view;
  if (size.w === 0 || size.h === 0) return null;

  // Kareler, 16'lık bölüm sınırına hizalı bir "taban"a göre konumlanır; kaydırırken yalnızca
  // kapsayıcı kaydırılır, taban ancak bölüm atlanınca değişir. (Formüller geometry.ts'de, testli.)
  const { x0, x1, y0, y1, baseX, baseY, offX, offY } = viewWindow(view, size);

  const over = world.exploded !== null;
  const cells = [];
  let lastKey = -1;
  let chunk: Chunk | undefined;

  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const cx = x >> CHUNK_BITS;
      const cy = y >> CHUNK_BITS;
      const key = chunkKey(cx, cy);
      if (key !== lastKey) {
        chunk = world.chunks.get(key);
        lastKey = key;
      }
      const i = localIndex(x, y);
      const st = chunk ? chunk.state[i] : HIDDEN;

      let code: number;
      if (st === REVEALED) {
        code = chunk!.count[i];
        if (code === 0) continue; // boş açık kare: zemin rengi yeter, çizmeye gerek yok
      } else if (st === FLAGGED) {
        code = over && !isMine(world, x, y) ? CODE_WRONG_FLAG : CODE_FLAG;
      } else if (over && world.exploded!.x === x && world.exploded!.y === y) {
        code = CODE_EXPLODED;
      } else if (over && isMine(world, x, y)) {
        code = CODE_MINE;
      } else {
        code = CODE_HIDDEN;
      }

      cells.push(
        <BoardCell
          key={`${x},${y}`}
          code={code}
          tint={(cx + cy) & 1}
          size={cell}
          left={(x - baseX) * cell}
          top={(y - baseY) * cell}
        />,
      );
    }
  }

  return (
    <View
      style={{
        position: 'absolute',
        left: 0,
        top: 0,
        width: (x1 - baseX + 2) * cell,
        height: (y1 - baseY + 2) * cell,
        transform: [{ translateX: -offX }, { translateY: -offY }],
        pointerEvents: 'none',
      }}
    >
      {cells}
    </View>
  );
}

// ---------- Küçük parçalar ----------

function Chip({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.chip}>
      <Text style={styles.chipLabel}>{label}</Text>
      <Text style={styles.chipValue}>{value}</Text>
    </View>
  );
}

function RoundButton({ label, onPress, active = false }: { label: string; onPress: () => void; active?: boolean }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.round, active && styles.roundActive, pressed && { opacity: 0.7 }]}
    >
      <Text style={styles.roundText} selectable={false}>
        {label}
      </Text>
    </Pressable>
  );
}

// ---------- Ana ekran ----------

type Phase = 'loading' | 'menu' | 'play';
type FxKind = 'reveal' | 'cascade' | 'flag' | 'boom';

export default function MinesweeperScreen({ onExit }: GameProps) {
  'use no memo'; // world mutable; her hamlede ver sayacıyla yeniden çizilir
  const [settings] = useSettings();
  const [phase, setPhase] = useState<Phase>('loading');
  const [difficulty, setDifficulty] = useState<Difficulty>('normal');
  const [best, setBest] = useState<BestScores>(EMPTY_BEST);
  const [savedRun, setSavedRun] = useState<SavedRun | null>(null);
  const [confirmNew, setConfirmNew] = useState(false);
  const [world, setWorld] = useState<World | null>(null);
  const [ver, setVer] = useState(0);
  const [view, setView] = useState<ViewState>({ x: 0.5, y: 0.5, cell: DEFAULT_CELL });
  const [size, setSize] = useState<Size>({ w: 0, h: 0 });
  const [flagMode, setFlagMode] = useState(false);
  const [newRecord, setNewRecord] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  // Hareket işleyicileri (PanResponder bir kez oluşur) güncel değerlere ref'ler üzerinden ulaşır
  const worldRef = useRef<World | null>(null);
  const viewRef = useRef(view);
  const sizeRef = useRef(size);
  const flagModeRef = useRef(flagMode);
  const settingsRef = useRef(settings);
  const bestRef = useRef<BestScores>(EMPTY_BEST);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const viewportRef = useRef<ComponentRef<typeof View>>(null);
  const actions = useRef({
    tap: (_px: number, _py: number) => {},
    long: (_px: number, _py: number) => {},
    moved: () => {},
  });
  const gesture = useRef({
    mode: 'idle' as 'idle' | 'pan' | 'pinch' | 'long' | 'ignore',
    px: 0,
    py: 0,
    startView: { x: 0, y: 0, cell: DEFAULT_CELL },
    pinchDist: 0,
    pinchCell: DEFAULT_CELL,
    timer: null as ReturnType<typeof setTimeout> | null,
  });

  useEffect(() => {
    viewRef.current = view;
    sizeRef.current = size;
    flagModeRef.current = flagMode;
    settingsRef.current = settings;
  });

  // Açılışta kayıtlı oyunu ve rekorları yükle
  useEffect(() => {
    (async () => {
      const [b, run] = await Promise.all([loadBest(), loadRun()]);
      bestRef.current = b;
      setBest(b);
      setSavedRun(run);
      setPhase('menu');
    })();
  }, []);

  // ---------- Kaydetme ----------

  const flushSave = useCallback(() => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = null;
    const w = worldRef.current;
    if (!w || w.exploded || w.revealed === 0) return;
    saveRun(w, viewRef.current);
  }, []);

  const scheduleSave = useCallback(() => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(flushSave, 1200);
  }, [flushSave]);

  // Arka plana geçince / ekrandan çıkınca hemen kaydet
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => {
      if (s !== 'active') flushSave();
    });
    return () => {
      sub.remove();
      flushSave();
    };
  }, [flushSave]);

  // ---------- Ses / titreşim ----------

  const fx = (kind: FxKind) => {
    const { sound, sfxVolume, vibration } = settingsRef.current;
    if (sound) {
      if (kind === 'reveal') playSound('rotate', sfxVolume * 0.6);
      else if (kind === 'cascade') playSound('clear', sfxVolume);
      else if (kind === 'flag') playSound('hold', sfxVolume);
      else playSound('gameover', sfxVolume);
    }
    if (vibration) haptic(kind === 'boom' ? 'error' : kind === 'cascade' ? 'light' : 'select');
  };

  // ---------- Oyun akışı ----------

  const startRun = (w: World, v: ViewState) => {
    worldRef.current = w;
    setWorld(w);
    setView(v);
    setVer((n) => n + 1);
    setNewRecord(false);
    setFlagMode(false);
    setPhase('play');
  };

  const startNew = () => {
    clearRun();
    setSavedRun(null);
    setConfirmNew(false);
    const seed = Math.floor(Math.random() * 4294967296);
    startRun(createWorld(seed, difficulty), { x: 0.5, y: 0.5, cell: DEFAULT_CELL });
  };

  const continueRun = () => {
    if (!savedRun) return;
    const w = restoreWorld(savedRun);
    if (!w) {
      clearRun();
      setSavedRun(null);
      return;
    }
    startRun(w, { ...savedRun.view, cell: clampCell(savedRun.view.cell) });
  };

  const backToMenu = async () => {
    flushSave();
    const w = worldRef.current;
    worldRef.current = null;
    setWorld(null);
    setPhase('menu');
    // kayıt yazımı bitince menüdeki "Devam et" kartını güncelle
    setTimeout(async () => setSavedRun(w && !w.exploded && w.revealed > 0 ? await loadRun() : null), 150);
  };

  const finishRun = (w: World) => {
    clearRun();
    setSavedRun(null);
    const score = w.revealed;
    if (score > bestRef.current[w.difficulty]) {
      const nb = { ...bestRef.current, [w.difficulty]: score };
      bestRef.current = nb;
      setBest(nb);
      saveBest(nb);
      setNewRecord(true);
    }
  };

  const afterMove = (w: World, res: RevealResult) => {
    if (res.kind === 'mine') {
      fx('boom');
      finishRun(w);
    } else if (res.kind === 'safe') {
      fx(res.opened >= 12 ? 'cascade' : 'reveal');
      scheduleSave();
    }
    setVer((n) => n + 1);
  };

  const worldAt = (px: number, py: number) => screenToCell(viewRef.current, sizeRef.current, px, py);

  const doFlag = (x: number, y: number) => {
    const w = worldRef.current;
    if (!w) return;
    if (toggleFlag(w, x, y) !== 'none') {
      fx('flag');
      scheduleSave();
      setVer((n) => n + 1);
    }
  };

  const doTap = (px: number, py: number) => {
    const w = worldRef.current;
    if (!w || w.exploded) return;
    const { x, y } = worldAt(px, py);
    const st = cellState(w, x, y);
    if (st === REVEALED) afterMove(w, chord(w, x, y));
    else if (flagModeRef.current) doFlag(x, y);
    else if (st === HIDDEN) afterMove(w, reveal(w, x, y));
  };

  const doLong = (px: number, py: number) => {
    const w = worldRef.current;
    if (!w || w.exploded) return;
    const { x, y } = worldAt(px, py);
    doFlag(x, y);
  };

  useEffect(() => {
    actions.current = { tap: doTap, long: doLong, moved: scheduleSave };
  });

  // ---------- Dokunma hareketleri ----------
  // Sürükle: gez · Dokun: aç · Basılı tut: bayrak · İki parmak: yakınlaştır

  const [pan] = useState(() => {
    const clearTimer = () => {
      const g = gesture.current;
      if (g.timer) clearTimeout(g.timer);
      g.timer = null;
    };
    return PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: (e) => {
        const g = gesture.current;
        clearTimer();
        const button = (e.nativeEvent as unknown as { button?: number }).button;
        g.mode = button !== undefined && button !== 0 ? 'ignore' : 'idle'; // web: sağ/orta tuşu başka yerde işlenir
        g.px = e.nativeEvent.locationX;
        g.py = e.nativeEvent.locationY;
        g.startView = { ...viewRef.current };
        if (g.mode === 'ignore') return;
        g.timer = setTimeout(() => {
          if (g.mode === 'idle') {
            g.mode = 'long';
            actions.current.long(g.px, g.py);
          }
        }, LONG_PRESS_MS);
      },
      onPanResponderMove: (e, gs) => {
        const g = gesture.current;
        if (g.mode === 'ignore') return;
        const touches = e.nativeEvent.touches;
        if (touches.length >= 2) {
          clearTimer();
          const d = Math.hypot(touches[0].pageX - touches[1].pageX, touches[0].pageY - touches[1].pageY);
          if (g.mode !== 'pinch') {
            g.mode = 'pinch';
            g.pinchDist = d;
            g.pinchCell = viewRef.current.cell;
          } else if (g.pinchDist > 0) {
            const cell = clampCell((g.pinchCell * d) / g.pinchDist);
            setView((v) => ({ ...v, cell }));
          }
          return;
        }
        if (g.mode === 'pinch' || g.mode === 'long') return;
        if (g.mode === 'idle' && Math.hypot(gs.dx, gs.dy) > TAP_SLOP) {
          g.mode = 'pan';
          clearTimer();
        }
        if (g.mode === 'pan') {
          const s = g.startView;
          setView((v) => ({ ...v, x: s.x - gs.dx / v.cell, y: s.y - gs.dy / v.cell }));
        }
      },
      onPanResponderRelease: () => {
        const g = gesture.current;
        clearTimer();
        if (g.mode === 'idle') actions.current.tap(g.px, g.py);
        else if (g.mode === 'pan' || g.mode === 'pinch') actions.current.moved();
        g.mode = 'idle';
      },
      onPanResponderTerminate: () => {
        clearTimer();
        gesture.current.mode = 'idle';
      },
    });
  });

  const zoomBy = useCallback(
    (factor: number) => {
      setView((v) => ({ ...v, cell: clampCell(v.cell * factor) }));
      scheduleSave();
    },
    [scheduleSave],
  );

  // Web: fare tekerleği ile yakınlaştırma, sağ tık ile bayrak
  useEffect(() => {
    if (Platform.OS !== 'web' || phase !== 'play') return;
    const node = viewportRef.current as unknown as HTMLElement | null;
    if (!node) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      zoomBy(e.deltaY < 0 ? 1.12 : 1 / 1.12);
    };
    const onContext = (e: MouseEvent) => {
      e.preventDefault();
      const r = node.getBoundingClientRect();
      actions.current.long(e.clientX - r.left, e.clientY - r.top);
    };
    node.addEventListener('wheel', onWheel, { passive: false });
    node.addEventListener('contextmenu', onContext);
    return () => {
      node.removeEventListener('wheel', onWheel);
      node.removeEventListener('contextmenu', onContext);
    };
  }, [phase, zoomBy]);

  const onViewportLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setSize({ w: width, h: height });
  };

  const recenter = () => {
    const w = worldRef.current;
    const c = w?.safe ?? { x: 0, y: 0 };
    setView((v) => ({ ...v, x: c.x + 0.5, y: c.y + 0.5 }));
    scheduleSave();
  };

  const onBack = () => {
    if (phase === 'play') backToMenu();
    else onExit();
  };

  // ---------- Çizim ----------

  const over = world?.exploded != null;
  const regionX = Math.floor(view.x) >> CHUNK_BITS;
  const regionY = Math.floor(view.y) >> CHUNK_BITS;

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Pressable onPress={onBack} hitSlop={10}>
          <Text style={styles.headerBtn}>‹ {phase === 'play' ? 'Menü' : 'Geri'}</Text>
        </Pressable>
        <Text style={styles.title}>Sonsuz Mayın Tarlası</Text>
        <Pressable onPress={() => setSettingsOpen(true)} hitSlop={10}>
          <Text style={styles.headerBtn}>⚙</Text>
        </Pressable>
      </View>

      {phase === 'loading' && <View style={{ flex: 1 }} />}

      {phase === 'menu' && (
        <ScrollView contentContainerStyle={styles.menu}>
          <Text style={styles.menuTitle}>Sınırsız bir dünya</Text>
          <Text style={styles.menuSub}>
            Tahta her yöne sonsuza dek uzanır. Mayınlara basmadan ne kadar kare açabilirsin?
          </Text>

          {savedRun && (
            <View style={styles.card}>
              <Text style={styles.cardLabel}>KAYITLI OYUN</Text>
              <Text style={styles.cardValue}>
                {DIFFICULTIES[savedRun.world.difficulty].label} · {fmt(savedRun.world.revealed)} kare
              </Text>
              <Pressable style={styles.primary} onPress={continueRun}>
                <Text style={styles.primaryText}>Devam et</Text>
              </Pressable>
            </View>
          )}

          <Text style={styles.sectionLabel}>YENİ OYUN</Text>
          <View style={styles.diffRow}>
            {(Object.keys(DIFFICULTIES) as Difficulty[]).map((d) => (
              <Pressable
                key={d}
                onPress={() => setDifficulty(d)}
                style={[styles.diff, difficulty === d && styles.diffActive]}
              >
                <Text style={[styles.diffName, difficulty === d && { color: '#fff' }]}>{DIFFICULTIES[d].label}</Text>
                <Text style={styles.diffInfo}>%{Math.round(DIFFICULTIES[d].density * 100)} mayın</Text>
                <Text style={styles.diffBest}>Rekor {fmt(best[d])}</Text>
              </Pressable>
            ))}
          </View>

          {confirmNew ? (
            <View style={styles.card}>
              <Text style={styles.cardValue}>Kayıtlı oyunun silinecek. Emin misin?</Text>
              <View style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}>
                <Pressable style={[styles.secondary, { flex: 1 }]} onPress={() => setConfirmNew(false)}>
                  <Text style={styles.secondaryText}>Vazgeç</Text>
                </Pressable>
                <Pressable style={[styles.primary, { flex: 1, marginTop: 0 }]} onPress={startNew}>
                  <Text style={styles.primaryText}>Sil ve başla</Text>
                </Pressable>
              </View>
            </View>
          ) : (
            <Pressable style={savedRun ? styles.secondary : styles.primary} onPress={() => (savedRun ? setConfirmNew(true) : startNew())}>
              <Text style={savedRun ? styles.secondaryText : styles.primaryText}>Yeni oyun başlat</Text>
            </Pressable>
          )}

          <View style={styles.card}>
            <Text style={styles.cardLabel}>NASIL OYNANIR</Text>
            <Text style={styles.how}>• Dokun: kareyi aç. İlk dokunuş her zaman güvenlidir.</Text>
            <Text style={styles.how}>
              • {Platform.OS === 'web' ? 'Sağ tık veya basılı tut' : 'Basılı tut'}: bayrak koy / kaldır (🚩 düğmesiyle de olur).
            </Text>
            <Text style={styles.how}>• Sayı, çevresindeki 8 karedeki mayın sayısıdır.</Text>
            <Text style={styles.how}>• Bir sayının çevresine o kadar bayrak koyup sayıya dokunursan kalan komşular açılır.</Text>
            <Text style={styles.how}>
              • Sürükle: haritada gez · {Platform.OS === 'web' ? 'Tekerlek' : 'İki parmak'}: yakınlaştır. Her mayın hatasız oyunu bitirir, skorun açtığın kare sayısıdır.
            </Text>
          </View>
        </ScrollView>
      )}

      {phase === 'play' && world && (
        <View
          ref={viewportRef}
          style={[styles.viewport, webNoSelect]}
          onLayout={onViewportLayout}
          {...pan.panHandlers}
        >
          <Board world={world} view={view} size={size} ver={ver} />

          <View style={styles.overlay}>
            <View style={styles.hudTop}>
              <Chip label="SKOR" value={fmt(world.revealed)} />
              <Chip label="BAYRAK" value={String(world.flags)} />
              <Chip label="BÖLGE" value={`${regionX}, ${regionY}`} />
            </View>

            <View style={styles.controls}>
              <RoundButton label={flagMode ? '🚩' : '⛏️'} active={flagMode} onPress={() => setFlagMode((f) => !f)} />
              <RoundButton label="＋" onPress={() => zoomBy(1.25)} />
              <RoundButton label="－" onPress={() => zoomBy(1 / 1.25)} />
              <RoundButton label="⌖" onPress={recenter} />
            </View>

            {world.revealed === 0 && !over && (
              <View style={styles.hint}>
                <Text style={styles.hintText}>
                  Başlamak için bir kareye dokun. {Platform.OS === 'web' ? 'Sağ tık: bayrak · Tekerlek: yakınlaştır' : 'Basılı tut: bayrak · İki parmak: yakınlaştır'}
                </Text>
              </View>
            )}

            {over && (
              <View style={styles.overBox}>
                <View style={styles.overCard}>
                  <Text style={styles.overTitle}>Mayına bastın 💥</Text>
                  <Text style={styles.overScore}>{fmt(world.revealed)} kare</Text>
                  <Text style={styles.overSub}>
                    {newRecord ? '🏆 Yeni rekor!' : `Rekor: ${fmt(best[world.difficulty])}`}
                  </Text>
                  <View style={{ flexDirection: 'row', gap: 10, marginTop: 14 }}>
                    <Pressable style={[styles.secondary, { flex: 1 }]} onPress={backToMenu}>
                      <Text style={styles.secondaryText}>Menü</Text>
                    </Pressable>
                    <Pressable
                      style={[styles.primary, { flex: 1, marginTop: 0 }]}
                      onPress={() => {
                        const seed = Math.floor(Math.random() * 4294967296);
                        startRun(createWorld(seed, world.difficulty), { x: 0.5, y: 0.5, cell: view.cell });
                      }}
                    >
                      <Text style={styles.primaryText}>Yeni oyun</Text>
                    </Pressable>
                  </View>
                  <Text style={styles.overHint}>Haritayı gezip mayınların yerlerine bakabilirsin.</Text>
                </View>
              </View>
            )}
          </View>
        </View>
      )}

      {settingsOpen && <SettingsPanel onClose={() => setSettingsOpen(false)} />}
    </SafeAreaView>
  );
}

const webNoSelect =
  Platform.OS === 'web' ? ({ touchAction: 'none', userSelect: 'none' } as unknown as object) : undefined;

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 10 },
  headerBtn: { color: C.text, fontSize: 17 },
  title: { color: '#fff', fontSize: 17, fontWeight: '700' },

  // Menü
  menu: { padding: 20, gap: 14, paddingBottom: 40 },
  menuTitle: { color: '#fff', fontSize: 30, fontWeight: '800' },
  menuSub: { color: C.muted, fontSize: 15, lineHeight: 21 },
  sectionLabel: { color: C.muted, fontSize: 12, letterSpacing: 1.2, marginTop: 6 },
  card: { backgroundColor: '#161b27', borderRadius: 16, padding: 16, gap: 6 },
  cardLabel: { color: C.muted, fontSize: 12, letterSpacing: 1.2 },
  cardValue: { color: '#fff', fontSize: 17, fontWeight: '600' },
  how: { color: '#c3c9d8', fontSize: 14, lineHeight: 20 },
  diffRow: { flexDirection: 'row', gap: 10 },
  diff: { flex: 1, backgroundColor: '#161b27', borderRadius: 14, padding: 12, borderWidth: 2, borderColor: 'transparent', gap: 2 },
  diffActive: { borderColor: C.accent, backgroundColor: '#1d2240' },
  diffName: { color: C.text, fontSize: 16, fontWeight: '700' },
  diffInfo: { color: C.muted, fontSize: 12 },
  diffBest: { color: '#a5b4fc', fontSize: 12, marginTop: 4 },
  primary: { backgroundColor: C.accent, borderRadius: 14, paddingVertical: 15, alignItems: 'center', marginTop: 8 },
  primaryText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  secondary: { backgroundColor: '#232a3b', borderRadius: 14, paddingVertical: 15, alignItems: 'center' },
  secondaryText: { color: C.text, fontSize: 16, fontWeight: '600' },

  // Oyun
  viewport: { flex: 1, backgroundColor: C.ground, overflow: 'hidden' },
  overlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, pointerEvents: 'box-none' },
  hudTop: { position: 'absolute', top: 10, left: 10, right: 10, flexDirection: 'row', gap: 8, pointerEvents: 'none' },
  chip: { backgroundColor: C.chip, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 6 },
  chipLabel: { color: C.muted, fontSize: 10, letterSpacing: 1 },
  chipValue: { color: '#fff', fontSize: 16, fontWeight: '800' },
  controls: { position: 'absolute', right: 12, bottom: 16, gap: 10 },
  round: { width: 48, height: 48, borderRadius: 24, backgroundColor: C.chip, alignItems: 'center', justifyContent: 'center' },
  roundActive: { backgroundColor: C.accent },
  roundText: { color: '#fff', fontSize: 20 },
  hint: { position: 'absolute', left: 16, right: 80, bottom: 20, backgroundColor: C.chip, borderRadius: 14, padding: 12, pointerEvents: 'none' },
  hintText: { color: '#d1d5db', fontSize: 13, lineHeight: 18 },
  overBox: { position: 'absolute', left: 0, right: 0, bottom: 0, padding: 16, pointerEvents: 'box-none' },
  overCard: { backgroundColor: '#161b27', borderRadius: 20, padding: 18, alignItems: 'center' },
  overTitle: { color: '#fff', fontSize: 22, fontWeight: '800' },
  overScore: { color: '#a5b4fc', fontSize: 34, fontWeight: '800', marginTop: 4 },
  overSub: { color: '#facc15', fontSize: 15, marginTop: 2 },
  overHint: { color: C.muted, fontSize: 12, marginTop: 10 },
});
