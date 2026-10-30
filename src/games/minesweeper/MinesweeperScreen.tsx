import { memo, useCallback, useEffect, useRef, useState } from 'react';
import type { ComponentRef, ReactElement } from 'react';
import { AppState, PanResponder, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { LayoutChangeEvent } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import SettingsPanel from '@/components/SettingsPanel';
import { haptic, playSound } from '@/lib/feedback';
import { useSettings } from '@/lib/settings';
import { addCoins, flushWallet, getCoins, loadWallet, spendCoins, useWallet } from '@/lib/wallet';
import type { GameProps } from '../types';
import { chunkScreenRect, screenToCell, viewWindow, visibleRect } from './geometry';
import type { Size, View as ViewState } from './geometry';
import { EMPTY_BEST, clearRun, loadBest, loadRun, restoreWorld, saveBest, saveRun } from './persistence';
import type { BestScores, SavedRun } from './persistence';
import {
  CELLS_PER_COIN,
  CHUNK,
  CHUNK_BITS,
  DIFFICULTIES,
  FLAGGED,
  HIDDEN,
  REVEALED,
  cellState,
  chord,
  chunkKey,
  coinsDue,
  createWorld,
  isLockedAt,
  localIndex,
  markCoinsGranted,
  repairCost,
  repairSection,
  reveal,
  toggleFlag,
} from './world';
import type { Chunk, Difficulty, RevealResult, World } from './world';

// ---------- Görünüm sabitleri ----------

const MIN_CELL = 24;
const MAX_CELL = 64;
const DEFAULT_CELL = 40;
const TAP_SLOP = 8; // px: bundan fazla kayarsa sürükleme sayılır
const LONG_PRESS_MS = 380;
const TOAST_MS = 2800;
const MAX_BADGES = 10;

const C = {
  bg: '#0b0e14',
  ground: '#141821', // açık/boş zemin
  tile0: '#2b3347', // kapalı kare (bölüm rengi 1)
  tile1: '#323b52', // kapalı kare (bölüm rengi 2) -> bölümler ayırt edilir
  numberTile: '#1b2130',
  accent: '#6366f1',
  text: '#e5e7eb',
  muted: '#8b93a7',
  chip: 'rgba(20,24,33,0.92)',
  danger: '#ef4444',
  rubble: '#1d1318', // patlayan bölge
  rubbleBorder: '#6b2d3c',
  gold: '#facc15',
};
const NUMBER_COLORS = ['', '#60a5fa', '#4ade80', '#f87171', '#a78bfa', '#fb923c', '#2dd4bf', '#f472b6', '#cbd5e1'];

// Hücre görünüm kodları: 1..8 = açık sayı, negatifler/özel değerler diğer durumlar
const CODE_HIDDEN = -1;
const CODE_FLAG = -2;
const CODE_EXPLODED = 10;

const clampCell = (c: number) => Math.min(MAX_CELL, Math.max(MIN_CELL, c));
const fmt = (n: number) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
const chunkOf = (key: number) => ({ cx: Math.floor(key / 1048576) - 524288, cy: (key % 1048576) - 524288 });

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
  } else if (code === CODE_EXPLODED) {
    bg = C.danger;
    label = '💥';
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

  const cells: ReactElement[] = [];

  // Patlayıp kilitlenen bölümler: tek parça enkaz levhası + patlayan mayının yeri
  if (world.locked.size > 0) {
    for (let cy = y0 >> CHUNK_BITS; cy <= y1 >> CHUNK_BITS; cy++) {
      for (let cx = x0 >> CHUNK_BITS; cx <= x1 >> CHUNK_BITS; cx++) {
        const hit = world.locked.get(chunkKey(cx, cy));
        if (!hit) continue;
        cells.push(
          <View
            key={`L${cx},${cy}`}
            style={{
              position: 'absolute',
              left: (cx * CHUNK - baseX) * cell + 1,
              top: (cy * CHUNK - baseY) * cell + 1,
              width: CHUNK * cell - 2,
              height: CHUNK * cell - 2,
              borderRadius: cell * 0.4,
              backgroundColor: C.rubble,
              borderWidth: 1.5,
              borderColor: C.rubbleBorder,
            }}
          />,
          <BoardCell
            key={`X${cx},${cy}`}
            code={CODE_EXPLODED}
            tint={0}
            size={cell}
            left={(hit.x - baseX) * cell}
            top={(hit.y - baseY) * cell}
          />,
        );
      }
    }
  }

  let lastKey = -1;
  let chunk: Chunk | undefined;
  let lockedNow = false;

  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const cx = x >> CHUNK_BITS;
      const cy = y >> CHUNK_BITS;
      const key = chunkKey(cx, cy);
      if (key !== lastKey) {
        chunk = world.chunks.get(key);
        lockedNow = world.locked.size > 0 && world.locked.has(key);
        lastKey = key;
      }
      if (lockedNow) continue; // enkazın altındaki kareler gösterilmez (onarılınca geri gelir)

      const i = localIndex(x, y);
      const st = chunk ? chunk.state[i] : HIDDEN;

      let code: number;
      if (st === REVEALED) {
        code = chunk!.count[i];
        if (code === 0) continue; // boş açık kare: zemin rengi yeter, çizmeye gerek yok
      } else if (st === FLAGGED) {
        code = CODE_FLAG;
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

function Chip({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <View style={styles.chip}>
      <Text style={styles.chipLabel}>{label}</Text>
      <Text style={[styles.chipValue, accent ? { color: accent } : null]}>{value}</Text>
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

/** Patlayan bölgenin ortasında duran onarım kartı */
function RepairBadge({
  x,
  y,
  cost,
  affordable,
  onPress,
}: {
  x: number;
  y: number;
  cost: number;
  affordable: boolean;
  onPress: () => void;
}) {
  return (
    <View style={[styles.badge, { left: x - 84, top: y - 38 }]}>
      <Text style={styles.badgeTitle}>💥 Bölge patladı</Text>
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [styles.badgeBtn, !affordable && styles.badgeBtnOff, pressed && { opacity: 0.75 }]}
      >
        <Text style={[styles.badgeBtnText, !affordable && { color: C.muted }]} selectable={false}>
          🔧 Onar · {fmt(cost)} 🪙
        </Text>
      </Pressable>
    </View>
  );
}

// ---------- Ana ekran ----------

type Phase = 'loading' | 'menu' | 'play';
type FxKind = 'reveal' | 'cascade' | 'flag' | 'boom' | 'repair' | 'deny';

export default function MinesweeperScreen({ onExit }: GameProps) {
  'use no memo'; // world mutable; her hamlede ver sayacıyla yeniden çizilir
  const [settings] = useSettings();
  const { coins } = useWallet();
  const [phase, setPhase] = useState<Phase>('loading');
  const [difficulty, setDifficulty] = useState<Difficulty>('normal');
  const [best, setBest] = useState<BestScores>(EMPTY_BEST);
  const [runStartBest, setRunStartBest] = useState(0);
  const [savedRun, setSavedRun] = useState<SavedRun | null>(null);
  const [confirmNew, setConfirmNew] = useState(false);
  const [world, setWorld] = useState<World | null>(null);
  const [ver, setVer] = useState(0);
  const [view, setView] = useState<ViewState>({ x: 0.5, y: 0.5, cell: DEFAULT_CELL });
  const [size, setSize] = useState<Size>({ w: 0, h: 0 });
  const [flagMode, setFlagMode] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [toast, setToast] = useState<{ id: number; text: string } | null>(null);

  // Hareket işleyicileri (PanResponder bir kez oluşur) güncel değerlere ref'ler üzerinden ulaşır
  const worldRef = useRef<World | null>(null);
  const viewRef = useRef(view);
  const sizeRef = useRef(size);
  const flagModeRef = useRef(flagMode);
  const settingsRef = useRef(settings);
  const bestRef = useRef<BestScores>(EMPTY_BEST);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
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

  // Açılışta kayıtlı oyunu, rekorları ve cüzdanı yükle
  useEffect(() => {
    (async () => {
      const [b, run] = await Promise.all([loadBest(), loadRun(), loadWallet()]);
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
    saveBest(bestRef.current);
    flushWallet();
    const w = worldRef.current;
    if (!w || w.revealed === 0) return;
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
      if (toastTimer.current) clearTimeout(toastTimer.current);
    };
  }, [flushSave]);

  // ---------- Ses / titreşim / bildirim ----------

  const fx = (kind: FxKind) => {
    const { sound, sfxVolume, vibration } = settingsRef.current;
    if (sound) {
      if (kind === 'reveal') playSound('rotate', sfxVolume * 0.6);
      else if (kind === 'cascade') playSound('clear', sfxVolume);
      else if (kind === 'flag') playSound('hold', sfxVolume);
      else if (kind === 'boom') playSound('lock', sfxVolume);
      else if (kind === 'repair') playSound('levelup', sfxVolume);
    }
    if (vibration) {
      if (kind === 'boom' || kind === 'deny') haptic('error');
      else if (kind === 'repair') haptic('success');
      else if (kind === 'cascade' || kind === 'flag') haptic('light');
      else haptic('select');
    }
  };

  const showToast = (text: string) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast({ id: Date.now(), text });
    toastTimer.current = setTimeout(() => setToast(null), TOAST_MS);
  };

  // ---------- Oyun akışı ----------

  const startRun = (w: World, v: ViewState) => {
    worldRef.current = w;
    setWorld(w);
    setView(v);
    setVer((n) => n + 1);
    setRunStartBest(bestRef.current[w.difficulty]);
    setFlagMode(false);
    setToast(null);
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
    // eski kayıtlarda ve kaydedilmemiş ilerlemede hak edilen para varsa cüzdana ekle
    grantCoins(w);
  };

  const backToMenu = () => {
    flushSave();
    const w = worldRef.current;
    worldRef.current = null;
    setWorld(null);
    setPhase('menu');
    // kayıt yazımı bitince menüdeki "Devam et" kartını güncelle
    setTimeout(async () => setSavedRun(w && w.revealed > 0 ? await loadRun() : null), 150);
  };

  /** Açılan karelere göre henüz verilmemiş parayı cüzdana ekler. */
  const grantCoins = (w: World) => {
    const due = coinsDue(w);
    if (due > 0) {
      addCoins(due);
      markCoinsGranted(w, due);
    }
  };

  const updateBest = (w: World) => {
    if (w.revealed > bestRef.current[w.difficulty]) {
      bestRef.current = { ...bestRef.current, [w.difficulty]: w.revealed };
      setBest(bestRef.current);
    }
  };

  const afterMove = (w: World, res: RevealResult) => {
    if (res.kind === 'mine' && res.hit) {
      fx('boom');
      const cost = repairCost(w, res.hit.x >> CHUNK_BITS, res.hit.y >> CHUNK_BITS);
      showToast(`💥 Bölge patladı! Onarmak için ${fmt(cost)} 🪙 gerekli`);
    } else if (res.kind === 'safe') {
      fx(res.opened >= 12 ? 'cascade' : 'reveal');
    }
    if (res.opened > 0) {
      grantCoins(w);
      updateBest(w);
    }
    scheduleSave();
    setVer((n) => n + 1);
  };

  const doRepair = (cx: number, cy: number) => {
    const w = worldRef.current;
    if (!w) return;
    const cost = repairCost(w, cx, cy);
    if (!spendCoins(cost)) {
      fx('deny');
      showToast(`Onarım için ${fmt(cost)} 🪙 gerekli, ${fmt(getCoins())} 🪙 var. Kare açtıkça para kazanırsın.`);
      return;
    }
    if (repairSection(w, cx, cy)) {
      fx('repair');
      showToast('🔧 Bölge onarıldı, patlayan mayın etkisizleştirildi');
      scheduleSave();
      setVer((n) => n + 1);
    } else {
      addCoins(cost); // beklenmeyen durum: parayı iade et
    }
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
    if (!w) return;
    const { x, y } = worldAt(px, py);
    if (isLockedAt(w, x, y)) return; // patlamış bölge: önce onar
    const st = cellState(w, x, y);
    if (st === REVEALED) afterMove(w, chord(w, x, y));
    else if (flagModeRef.current) doFlag(x, y);
    else if (st === HIDDEN) afterMove(w, reveal(w, x, y));
  };

  const doLong = (px: number, py: number) => {
    const w = worldRef.current;
    if (!w) return;
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

  const regionX = Math.floor(view.x) >> CHUNK_BITS;
  const regionY = Math.floor(view.y) >> CHUNK_BITS;
  const newRecord = !!world && runStartBest > 0 && world.revealed > runStartBest;

  // Ekranda görünen patlamış bölgelerin onarım kartları
  const badges: ReactElement[] = [];
  if (world && world.locked.size > 0 && size.w > 0 && size.h > 0) {
    const win = viewWindow(view, size);
    for (let cy = win.y0 >> CHUNK_BITS; cy <= win.y1 >> CHUNK_BITS && badges.length < MAX_BADGES; cy++) {
      for (let cx = win.x0 >> CHUNK_BITS; cx <= win.x1 >> CHUNK_BITS && badges.length < MAX_BADGES; cx++) {
        if (!world.locked.has(chunkKey(cx, cy))) continue;
        const vis = visibleRect(chunkScreenRect(view, size, cx, cy), size);
        if (!vis || vis.width < 100 || vis.height < 80) continue;
        const cost = repairCost(world, cx, cy);
        badges.push(
          <RepairBadge
            key={`B${cx},${cy}`}
            x={vis.left + vis.width / 2}
            y={vis.top + vis.height / 2}
            cost={cost}
            affordable={coins >= cost}
            onPress={() => doRepair(cx, cy)}
          />,
        );
      }
    }
  }

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
          <View style={styles.menuTop}>
            <Text style={styles.menuTitle}>Sınırsız bir dünya</Text>
            <View style={styles.walletPill}>
              <Text style={styles.walletText}>🪙 {fmt(coins)}</Text>
            </View>
          </View>
          <Text style={styles.menuSub}>
            Tahta her yöne sonsuza dek uzanır. Mayına basarsan oyun bitmez, sadece o bölge patlar. Kare açtıkça kazandığın 🪙 ile onarırsın.
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
            <Pressable
              style={savedRun ? styles.secondary : styles.primary}
              onPress={() => (savedRun ? setConfirmNew(true) : startNew())}
            >
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
              • Mayına basarsan o bölge (16×16 kare) patlar ve kilitlenir; oyun devam eder. Bölgenin üstündeki 🔧 Onar düğmesiyle
              🪙 harcayıp geri açarsın, patlayan mayın da etkisizleşir.
            </Text>
            <Text style={styles.how}>
              • Her {CELLS_PER_COIN} güvenli kare = 1 🪙. Paran tüm oyunlar için ortaktır. Bölgede ne kadar kare açtıysan onarım o kadar pahalıdır.
            </Text>
            <Text style={styles.how}>
              • Sürükle: haritada gez · {Platform.OS === 'web' ? 'Tekerlek' : 'İki parmak'}: yakınlaştır. Skor, açtığın kare sayısıdır.
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
              <Chip label={newRecord ? 'SKOR 🏆' : 'SKOR'} value={fmt(world.revealed)} accent={newRecord ? C.gold : undefined} />
              <Chip label="PARA" value={`🪙 ${fmt(coins)}`} accent={C.gold} />
              <Chip label="BÖLGE" value={`${regionX}, ${regionY}`} />
            </View>

            {badges}

            {toast && (
              <View style={styles.toast}>
                <Text style={styles.toastText}>{toast.text}</Text>
              </View>
            )}

            <View style={styles.controls}>
              <RoundButton label={flagMode ? '🚩' : '⛏️'} active={flagMode} onPress={() => setFlagMode((f) => !f)} />
              <RoundButton label="＋" onPress={() => zoomBy(1.25)} />
              <RoundButton label="－" onPress={() => zoomBy(1 / 1.25)} />
              <RoundButton label="⌖" onPress={recenter} />
            </View>

            {world.revealed === 0 && (
              <View style={styles.hint}>
                <Text style={styles.hintText}>
                  Başlamak için bir kareye dokun. Mayına basarsan sadece o bölge patlar, 🪙 ile onarırsın.{' '}
                  {Platform.OS === 'web' ? 'Sağ tık: bayrak · Tekerlek: yakınlaştır' : 'Basılı tut: bayrak · İki parmak: yakınlaştır'}
                </Text>
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
  menuTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  menuTitle: { color: '#fff', fontSize: 30, fontWeight: '800', flexShrink: 1 },
  walletPill: { backgroundColor: '#232a3b', borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8 },
  walletText: { color: C.gold, fontSize: 16, fontWeight: '800' },
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
  toast: { position: 'absolute', top: 66, left: 16, right: 16, backgroundColor: C.chip, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 10, borderWidth: 1, borderColor: '#2f3750', pointerEvents: 'none' },
  toastText: { color: '#f3f4f6', fontSize: 14, lineHeight: 19, textAlign: 'center' },
  badge: { position: 'absolute', width: 168, backgroundColor: C.chip, borderRadius: 16, padding: 10, gap: 8, alignItems: 'center', borderWidth: 1, borderColor: C.rubbleBorder },
  badgeTitle: { color: '#fecaca', fontSize: 13, fontWeight: '700' },
  badgeBtn: { backgroundColor: C.accent, borderRadius: 12, paddingVertical: 9, paddingHorizontal: 12, alignSelf: 'stretch', alignItems: 'center' },
  badgeBtnOff: { backgroundColor: '#2a3040' },
  badgeBtnText: { color: '#fff', fontSize: 14, fontWeight: '700' },
});
