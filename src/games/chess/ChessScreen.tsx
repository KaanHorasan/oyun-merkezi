import { useEffect, useMemo, useRef, useState } from 'react';
import type { ComponentRef } from 'react';
import { AppState, Pressable, ScrollView, Share, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import SettingsPanel from '@/components/SettingsPanel';
import { haptic, playSound } from '@/lib/feedback';
import { record } from '@/lib/progress/progress';
import { useSettings } from '@/lib/settings';
import type { GameProps } from '../types';
import { slideLegs } from './animation';
import type { SlideAnim } from './animation';
import ChessBoard from './ChessBoard';
import { ChessClock, TIME_PRESETS, createClock, describeControl, formatClock, lowThresholdMs, nowMs, presetById } from './clock';
import { INITIAL_UI, checkedKingSquare, choosePromotion, tapSquare, targetsOf } from './controller';
import type { UiState } from './controller';
import { ChessGame } from './engine/game';
import type { GameStatus, MoveRecord } from './engine/game';
import { movetextOf } from './engine/pgn';
import { BISHOP, BLACK, KNIGHT, QUEEN, ROOK, WHITE, makePiece } from './engine/types';
import type { Color } from './engine/types';
import { computeLayout } from './layout';
import { clearChess, loadChess, saveChess } from './persistence';
import type { LoadedChess } from './persistence';
import { PieceIcon } from './pieces';
import { statsForFinishedGame } from './progress';
import { advantageOf, capturedBy, colorName, otherColor } from './summary';

const C = {
  bg: '#0b0e14',
  card: '#161b27',
  line: '#232a3b',
  text: '#e5e7eb',
  muted: '#8b93a7',
  accent: '#6366f1',
  gold: '#facc15',
  danger: '#ef4444',
};

type Phase = 'loading' | 'menu' | 'play';
type FxKind = 'select' | 'move' | 'capture' | 'check' | 'mate' | 'draw' | 'tick';

function statusText(s: GameStatus, turn: Color): string {
  switch (s.kind) {
    case 'playing':
      return `${s.check ? 'Şah! ' : ''}Sıra: ${colorName(turn)}`;
    case 'checkmate':
      return `Şah mat! ${colorName(s.winner)} kazandı`;
    case 'stalemate':
      return 'Pat! Oyun berabere bitti';
    case 'resigned':
      return `${colorName(otherColor(s.winner))} teslim oldu. ${colorName(s.winner)} kazandı`;
    case 'timeout':
      return `Süre doldu! ${colorName(s.winner)} kazandı`;
    case 'draw':
      return s.reason === 'fifty'
        ? 'Berabere: 50 hamle kuralı'
        : s.reason === 'repetition'
          ? 'Berabere: aynı pozisyon üç kez tekrarlandı'
          : s.reason === 'insufficient'
            ? 'Berabere: yetersiz materyal'
            : s.reason === 'timeout-insufficient'
              ? 'Süre doldu ama rakibin mat edecek taşı yok: berabere'
              : 'Berabere: oyuncular anlaştı';
  }
}

type Styles = ReturnType<typeof createStyles>;

/** `active` iken saniyede 10 kez güncellenen şimdiki zaman (saat yazısını canlı tutar) */
function useNow(active: boolean): number {
  const [now, setNow] = useState(() => nowMs());
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setNow(nowMs()), 100);
    return () => clearInterval(id);
  }, [active]);
  return now;
}

/** Uygulama arka plana gidince false: saat o sürede akmasın */
function useAppActive(): boolean {
  const [active, setActive] = useState(AppState.currentState === 'active');
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => setActive(s === 'active'));
    return () => sub.remove();
  }, []);
  return active;
}

function ClockLabel({ clock, color, styles }: { clock: ChessClock; color: Color; styles: Styles }) {
  'use no memo'; // clock yerinde değişen bir nesne
  const running = clock.running === color;
  const now = useNow(running);
  const ms = clock.read(color, now);
  const low = clock.started && ms <= lowThresholdMs(clock.control);
  return (
    <View style={[styles.clock, running && styles.clockRunning, low && styles.clockLow]}>
      <Text style={[styles.clockText, low && styles.clockTextLow]}>{formatClock(ms)}</Text>
    </View>
  );
}

function PlayerBar({ game, color, active, clock, styles, iconSize }: { game: ChessGame; color: Color; active: boolean; clock: ChessClock | null; styles: Styles; iconSize: number }) {
  'use no memo'; // game yerinde değişen bir nesne
  const taken = capturedBy(game, color);
  const adv = advantageOf(game.board, color);
  return (
    <View style={[styles.player, active && styles.playerActive]}>
      <View style={[styles.dot, { backgroundColor: color === WHITE ? '#fff' : '#232b45' }]} />
      <Text style={styles.playerName}>{colorName(color)}</Text>
      <View style={styles.captured}>
        {taken.map((p, i) => (
          <View key={i} style={{ marginLeft: i === 0 ? 0 : -Math.round(iconSize * 0.35) }}>
            <PieceIcon piece={p} size={iconSize} />
          </View>
        ))}
        {adv > 0 && <Text style={styles.adv}>+{adv}</Text>}
      </View>
      {clock ? <ClockLabel clock={clock} color={color} styles={styles} /> : active ? <Text style={styles.turnBadge}>sıra</Text> : null}
    </View>
  );
}

export default function ChessScreen({ onExit }: GameProps) {
  'use no memo'; // game yerinde değişen bir nesne; her hamlede ver sayacıyla yeniden çizilir
  const [settings, updateSettings] = useSettings();
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const appActive = useAppActive();
  const [phase, setPhase] = useState<Phase>('loading');
  const [saved, setSaved] = useState<LoadedChess | null>(null);
  const [game, setGame] = useState<ChessGame | null>(null);
  const [clock, setClock] = useState<ChessClock | null>(null);
  const [, setVer] = useState(0);
  const [ui, setUi] = useState<UiState>(INITIAL_UI);
  const [flipped, setFlipped] = useState(false);
  const [confirm, setConfirm] = useState<'resign' | 'draw' | 'new' | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [moveAnim, setMoveAnim] = useState<SlideAnim | null>(null);
  const [dragging, setDragging] = useState(false);

  const settingsRef = useRef(settings);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const moveScroll = useRef<ComponentRef<typeof ScrollView>>(null);
  const tickRef = useRef<() => void>(() => {});
  const warnKey = useRef('');
  const animId = useRef(0);
  const reported = useRef(new WeakSet<ChessGame>()); // ilerleme istatistiği bildirilen oyunlar (oyun başına bir kez)
  useEffect(() => {
    settingsRef.current = settings;
  });
  useEffect(
    () => () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
    },
    [],
  );

  useEffect(() => {
    loadChess().then((l) => {
      setSaved(l && !l.game.isOver ? l : null);
      setPhase('menu');
    });
  }, []);

  const bump = () => setVer((n) => n + 1);

  const showToast = (text: string) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast(text);
    toastTimer.current = setTimeout(() => setToast(null), 2600);
  };

  const fx = (kind: FxKind) => {
    const { sound, sfxVolume, vibration } = settingsRef.current;
    if (sound) {
      if (kind === 'move') playSound('rotate', sfxVolume * 0.7);
      else if (kind === 'capture') playSound('lock', sfxVolume);
      else if (kind === 'check') playSound('clear', sfxVolume);
      else if (kind === 'mate') playSound('levelup', sfxVolume);
      else if (kind === 'draw') playSound('hold', sfxVolume);
      else if (kind === 'tick') playSound('hold', sfxVolume * 0.5);
    }
    if (vibration) {
      if (kind === 'mate') haptic('success');
      else if (kind === 'capture' || kind === 'check') haptic('medium');
      else if (kind === 'draw') haptic('light');
      else haptic('select');
    }
  };

  /** Oyun bittiyse görev/başarım istatistiklerini bildirir (en az 10 hamle; geri alıp yeniden bitirmek tekrar saymaz) */
  const reportFinished = (g: ChessGame) => {
    if (!g.isOver || reported.current.has(g)) return;
    const stats = statsForFinishedGame(g, clock !== null);
    if (stats.length === 0) return;
    reported.current.add(g);
    for (const st of stats) record(st.stat, st.value);
  };

  /** Hamleden/geri almadan sonra: tahta yönü, kayıt, yeniden çizim */
  const refresh = (g: ChessGame) => {
    reportFinished(g);
    const nf = settingsRef.current.chessAutoFlip && !g.isOver ? g.turn === BLACK : flipped;
    setFlipped(nf);
    saveChess(g, nf, clock);
    bump();
  };

  /** Süresi biten oyuncu: saati durdurur, oyunu bitirir */
  const timeUp = (loser: Color) => {
    if (!game || !clock) return;
    clock.pause(nowMs());
    game.flag(loser);
    setUi(INITIAL_UI);
    setConfirm(null);
    fx(game.status.kind === 'timeout' ? 'mate' : 'draw');
    refresh(game);
  };

  /** Süresi dolmuş biri varsa oyunu bitirir ve true döner (hamle/işlem yapılmamalı) */
  const flaggedNow = (): boolean => {
    if (!game || !clock || game.isOver) return false;
    const loser = clock.flagged(nowMs());
    if (loser === null) return false;
    timeUp(loser);
    return true;
  };

  const afterMove = (rec: MoveRecord, g: ChessGame, viaDrag = false) => {
    const st = g.status;
    // Taş kayma animasyonu (sürükle-bırakla konan taş kaymaz; rokun kalesi kayar)
    const legs = settingsRef.current.chessAnimation ? slideLegs(rec, viaDrag) : [];
    animId.current += 1;
    setMoveAnim(legs.length > 0 ? { id: animId.current, legs } : null);
    if (clock) {
      const now = nowMs();
      clock.moved(rec.mover, now);
      if (g.isOver) clock.pause(now);
    }
    if (st.kind === 'checkmate') fx('mate');
    else if (st.kind !== 'playing') fx('draw');
    else if (rec.check) fx('check');
    else if (rec.captured !== 0) fx('capture');
    else fx('move');
    refresh(g);
    setTimeout(() => moveScroll.current?.scrollToEnd({ animated: true }), 60);
  };

  const startNew = () => {
    clearChess();
    const g = new ChessGame();
    setGame(g);
    setClock(createClock(presetById(settings.chessTime).control));
    setMoveAnim(null);
    setUi(INITIAL_UI);
    setFlipped(false);
    setConfirm(null);
    setSaved(null);
    setPhase('play');
  };

  const continueGame = () => {
    if (!saved) return;
    setGame(saved.game);
    setClock(saved.clock);
    setMoveAnim(null);
    setUi(INITIAL_UI);
    setFlipped(saved.flipped);
    setConfirm(null);
    setPhase('play');
  };

  const backToMenu = () => {
    if (game && game.records.length > 0 && !game.isOver) {
      clock?.pause(nowMs()); // menüde süre akmaz; "Devam et" kaldığı yerden sürdürür
      saveChess(game, flipped, clock);
      setSaved({ game, flipped, clock });
    } else {
      setSaved(null);
      if (game && game.isOver) clearChess();
    }
    setGame(null);
    setClock(null);
    setMoveAnim(null);
    setUi(INITIAL_UI);
    setConfirm(null);
    setPhase('menu');
  };

  const onSquare = (sq: number, viaDrag = false) => {
    if (!game || confirm) return;
    if (flaggedNow()) return;
    const prev = ui.selected;
    const res = tapSquare(game, ui, sq);
    setUi(res.ui);
    if (res.moved) afterMove(res.moved, game, viaDrag);
    else if (res.ui.selected !== null && res.ui.selected !== prev) fx('select');
  };

  const onPromotion = (type: number) => {
    if (!game) return;
    if (flaggedNow()) return;
    const res = choosePromotion(game, ui, type);
    setUi(res.ui);
    if (res.moved) afterMove(res.moved, game);
  };

  const undo = () => {
    if (!game) return;
    const before = game.records.length;
    const mover = game.lastMove?.mover ?? null;
    const timeoutLoser = game.timeoutLoser;
    if (!game.undo()) return;
    if (clock) {
      const now = nowMs();
      if (game.records.length < before && mover !== null) clock.undoMove(mover, now);
      else if (timeoutLoser !== null) clock.grantTime(timeoutLoser, now); // süre bitişi geri alındı: kısa ek süre
    }
    setMoveAnim(null);
    setUi(INITIAL_UI);
    setConfirm(null);
    fx('select');
    refresh(game);
  };

  const resign = () => {
    if (!game) return;
    game.resign(game.turn); // sırası gelen oyuncu teslim olur
    setConfirm(null);
    setUi(INITIAL_UI);
    fx('draw');
    refresh(game);
  };

  const agreeDraw = () => {
    if (!game) return;
    game.agreeDraw();
    setConfirm(null);
    setUi(INITIAL_UI);
    fx('draw');
    refresh(game);
  };

  const sharePgn = async () => {
    if (!game) return;
    try {
      await Share.share({ message: game.pgn() });
    } catch {
      showToast('Paylaşım bu cihazda/tarayıcıda desteklenmiyor');
    }
  };

  // ---------- Saat ----------

  const over = !!game && game.isOver;
  const turn: Color = game ? game.turn : WHITE;
  // Ayarlar/onay penceresi açıkken ve uygulama arka plandayken saat durur
  const clockPaused = settingsOpen || confirm !== null || !appActive;
  const clockLive = phase === 'play' && !!game && !!clock && !over && !clockPaused;

  useEffect(() => {
    if (!clock || !game || phase !== 'play') return;
    const now = nowMs();
    if (over || clockPaused) clock.pause(now);
    else clock.resume(turn, now);
  }, [clock, game, phase, over, clockPaused, turn]);

  useEffect(() => {
    // Arka plana giderken saat durmuş olur (yukarıdaki etki önce çalışır); uygulama kapatılırsa kaldığı yerden devam etsin
    if (!appActive && game && clock && phase === 'play' && !game.isOver) saveChess(game, flipped, clock);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appActive]);

  useEffect(() => {
    tickRef.current = () => {
      if (!game || !clock || game.isOver) return;
      if (flaggedNow()) return;
      const c = clock.running;
      if (c === null) return;
      const ms = clock.read(c, nowMs());
      const sec = Math.ceil(ms / 1000);
      if (ms > 5000 || ms <= 0) {
        warnKey.current = '';
        return;
      }
      const key = `${c}:${sec}`;
      if (key !== warnKey.current) {
        warnKey.current = key;
        if (settingsRef.current.chessClockWarn) fx('tick');
      }
    };
  });

  useEffect(() => {
    if (!clockLive) return;
    const id = setInterval(() => tickRef.current(), 100);
    return () => clearInterval(id);
  }, [clockLive]);

  // ---------- Yerleşim ----------

  const layout = computeLayout(width, height, insets);
  const s = layout.scale;
  const styles = useMemo(() => createStyles(s), [s]);
  const landscape = layout.mode === 'landscape';
  const boardSize = layout.boardSize;
  const status = game?.status;
  const top: Color = flipped ? WHITE : BLACK;
  const bottom: Color = flipped ? BLACK : WHITE;
  const iconSize = Math.round(20 * s);
  const preset = presetById(settings.chessTime);

  const presetHint =
    preset.control.kind === 'none'
      ? 'Zaman sınırı yok.'
      : preset.control.kind === 'perMove'
        ? `Her hamle için ${preset.control.sec} saniyen var; süre dolarsa kaybedersin. Sıran gelince süre baştan başlar.`
        : `Her oyuncunun ${describeControl({ kind: 'total', baseSec: preset.control.baseSec, incSec: 0 })} süresi var${preset.control.incSec > 0 ? `; her hamlede ${preset.control.incSec} sn eklenir` : ''}. Süresi biten kaybeder.`;

  const chip = (id: string, label: string) => (
    <Pressable key={id} style={[styles.chip, settings.chessTime === id && styles.chipOn]} onPress={() => updateSettings({ chessTime: id })}>
      <Text style={[styles.chipText, settings.chessTime === id && styles.chipTextOn]}>{label}</Text>
    </Pressable>
  );

  // ---------- Oyun ekranının parçaları (dikeyde alt alta, yatayda tahta + yan panel) ----------

  const topBar = game && <PlayerBar game={game} color={top} active={!over && game.turn === top} clock={clock} styles={styles} iconSize={iconSize} />;
  const bottomBar = game && <PlayerBar game={game} color={bottom} active={!over && game.turn === bottom} clock={clock} styles={styles} iconSize={iconSize} />;

  const boardEl = game && (
    <View>
      <ChessBoard
        game={game}
        ver={game.records.length}
        size={boardSize}
        flipped={flipped}
        selected={ui.selected}
        targets={targetsOf(game, ui.selected)}
        showHints={settings.chessHints}
        checkSquare={checkedKingSquare(game)}
        canDrag={!over && confirm === null && ui.promotion === null}
        slide={moveAnim}
        onSquare={onSquare}
        onDragChange={setDragging}
      />
      {ui.promotion && (
        <View style={styles.promoWrap}>
          <View style={styles.promo}>
            <Text style={styles.promoTitle}>Terfi: bir taş seç</Text>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              {[QUEEN, ROOK, BISHOP, KNIGHT].map((t) => (
                <Pressable key={t} style={styles.promoBtn} onPress={() => onPromotion(t)}>
                  <PieceIcon piece={makePiece(game.turn, t)} size={Math.min(56, boardSize / 8)} />
                </Pressable>
              ))}
            </View>
          </View>
        </View>
      )}
    </View>
  );

  const statusEl = game && status && (
    <Text style={[styles.status, over && styles.statusOver, status.kind === 'playing' && status.check && styles.statusCheck]}>
      {statusText(status, game.turn)}
    </Text>
  );

  const movesLabel = game ? (game.records.length ? movetextOf(game.startFen, game.records.map((r) => r.san)) : 'Hamle yok. Beyaz başlar.') : '';
  const movesEl = landscape ? (
    <View style={styles.movesBox}>
      <Text style={styles.movesText}>{movesLabel}</Text>
    </View>
  ) : (
    <ScrollView ref={moveScroll} horizontal showsHorizontalScrollIndicator={false} style={styles.moves}>
      <Text style={styles.movesText}>{movesLabel}</Text>
    </ScrollView>
  );

  const controlsEl =
    game && status ? (
      confirm === 'resign' || confirm === 'draw' ? (
        <View style={styles.card}>
          <Text style={styles.cardValue}>{confirm === 'resign' ? `${colorName(game.turn)} teslim olsun mu?` : 'İki oyuncu da beraberliği kabul ediyor mu?'}</Text>
          <View style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}>
            <Pressable style={[styles.secondary, { flex: 1 }]} onPress={() => setConfirm(null)}>
              <Text style={styles.secondaryText}>Hayır</Text>
            </Pressable>
            <Pressable style={[styles.primary, { flex: 1, marginTop: 0 }]} onPress={confirm === 'resign' ? resign : agreeDraw}>
              <Text style={styles.primaryText}>Evet</Text>
            </Pressable>
          </View>
        </View>
      ) : over ? (
        <View style={styles.card}>
          <Text style={styles.overTitle}>{statusText(status, game.turn)}</Text>
          <View style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}>
            <Pressable style={[styles.secondary, { flex: 1 }]} onPress={undo}>
              <Text style={styles.secondaryText}>↶ Geri al</Text>
            </Pressable>
            <Pressable style={[styles.secondary, { flex: 1 }]} onPress={sharePgn}>
              <Text style={styles.secondaryText}>PGN paylaş</Text>
            </Pressable>
          </View>
          <Pressable style={styles.primary} onPress={startNew}>
            <Text style={styles.primaryText}>Yeni oyun</Text>
          </Pressable>
        </View>
      ) : (
        <View style={styles.actions}>
          <Pressable style={[styles.action, game.records.length === 0 && { opacity: 0.4 }]} onPress={undo} disabled={game.records.length === 0}>
            <Text style={styles.actionText}>↶ Geri al</Text>
          </Pressable>
          <Pressable style={styles.action} onPress={() => setFlipped((f) => !f)}>
            <Text style={styles.actionText}>⇅ Çevir</Text>
          </Pressable>
          <Pressable style={styles.action} onPress={() => setConfirm('resign')}>
            <Text style={styles.actionText}>🏳 Teslim</Text>
          </Pressable>
          <Pressable style={styles.action} onPress={() => setConfirm('draw')}>
            <Text style={styles.actionText}>½ Beraberlik</Text>
          </Pressable>
        </View>
      )
    ) : null;

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Pressable onPress={() => (phase === 'play' ? backToMenu() : onExit())} hitSlop={10}>
          <Text style={styles.headerBtn}>‹ {phase === 'play' ? 'Menü' : 'Geri'}</Text>
        </Pressable>
        <Text style={styles.title}>Satranç</Text>
        <Pressable onPress={() => setSettingsOpen(true)} hitSlop={10}>
          <Text style={styles.headerBtn}>⚙</Text>
        </Pressable>
      </View>

      {phase === 'loading' && <View style={{ flex: 1 }} />}

      {phase === 'menu' && (
        <ScrollView contentContainerStyle={styles.menu}>
          <Text style={styles.menuTitle}>Satranç</Text>
          <Text style={styles.menuSub}>
            Aynı cihazda iki kişi. Tam kurallar: rok, geçerken alma, terfi, şah mat, pat ve beraberlik kuralları.
          </Text>

          {saved && (
            <View style={styles.card}>
              <Text style={styles.cardLabel}>KAYITLI OYUN</Text>
              <Text style={styles.cardValue}>
                {saved.game.records.length} hamle · Sıra: {colorName(saved.game.turn)}
              </Text>
              {saved.clock && <Text style={styles.cardSub}>Süre: {describeControl(saved.clock.control)}</Text>}
              <Pressable style={styles.primary} onPress={continueGame}>
                <Text style={styles.primaryText}>Devam et</Text>
              </Pressable>
            </View>
          )}

          <View style={styles.card}>
            <Text style={styles.cardLabel}>SÜRE (YENİ OYUN İÇİN)</Text>
            <View style={styles.chips}>{TIME_PRESETS.filter((p) => p.group === 'none').map((p) => chip(p.id, p.label))}</View>
            <Text style={styles.chipGroup}>Hamle başı süre</Text>
            <View style={styles.chips}>{TIME_PRESETS.filter((p) => p.group === 'perMove').map((p) => chip(p.id, p.label))}</View>
            <Text style={styles.chipGroup}>Toplam süre (satranç saati)</Text>
            <View style={styles.chips}>{TIME_PRESETS.filter((p) => p.group === 'total').map((p) => chip(p.id, p.label))}</View>
            <Text style={styles.chipHint}>{presetHint}</Text>
          </View>

          {confirm === 'new' ? (
            <View style={styles.card}>
              <Text style={styles.cardValue}>Kayıtlı oyunun silinecek. Emin misin?</Text>
              <View style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}>
                <Pressable style={[styles.secondary, { flex: 1 }]} onPress={() => setConfirm(null)}>
                  <Text style={styles.secondaryText}>Vazgeç</Text>
                </Pressable>
                <Pressable style={[styles.primary, { flex: 1, marginTop: 0 }]} onPress={startNew}>
                  <Text style={styles.primaryText}>Sil ve başla</Text>
                </Pressable>
              </View>
            </View>
          ) : (
            <Pressable style={saved ? styles.secondary : styles.primary} onPress={() => (saved ? setConfirm('new') : startNew())}>
              <Text style={saved ? styles.secondaryText : styles.primaryText}>Yeni oyun başlat</Text>
            </Pressable>
          )}

          <View style={styles.card}>
            <Text style={styles.cardLabel}>NASIL OYNANIR</Text>
            <Text style={styles.how}>• Önce beyaz oynar, sonra sırayla. Telefonu birbirinize uzatarak ya da karşılıklı oturarak oynayabilirsiniz.</Text>
            <Text style={styles.how}>• Taşa dokun: gidebileceği kareler noktalarla görünür. Sonra gideceği kareye dokun.</Text>
            <Text style={styles.how}>• Piyon son sıraya gelince hangi taş olacağını seçersin.</Text>
            <Text style={styles.how}>• Rok için şahı iki kare yana götür. Geçerken alma ve terfi kuralları tam uygulanır.</Text>
            <Text style={styles.how}>• Geri al ile yanlış hamleyi geri alabilir, Çevir ile tahtayı döndürebilirsin. Ayarlardan her hamlede otomatik çevirmeyi açabilirsin.</Text>
            <Text style={styles.how}>• Aynı pozisyon üç kez tekrarlanırsa, 50 hamlede piyon hamlesi ya da alış olmazsa veya mat için yeterli taş kalmazsa oyun berabere biter.</Text>
            <Text style={styles.how}>• Görevler ve başarımlar oyun bitince sayılır (en az 10 hamle yapılmış olmalı): bitirilen oyun, alınan taş, terfi, rok, şah mat ve süreli oyun. Satrançta oyun sonu para ödülü yok; ödüller görev ve başarımlardan gelir.</Text>
            <Text style={styles.how}>• Süreli oyunda saat beyazın ilk hamlesinden sonra başlar. Süresi biten kaybeder; rakibinin mat edecek taşı yoksa oyun berabere biter. Menüye ya da ayarlara girince saat durur.</Text>
          </View>
        </ScrollView>
      )}

      {phase === 'play' && game && status && !landscape && (
        <ScrollView contentContainerStyle={styles.play} scrollEnabled={!dragging}>
          <View style={{ width: boardSize, gap: Math.round(8 * s) }}>
            {topBar}
            {boardEl}
            {bottomBar}
            {statusEl}
            {movesEl}
            {controlsEl}
          </View>
        </ScrollView>
      )}

      {phase === 'play' && game && status && landscape && (
        <View style={styles.playWide}>
          {boardEl}
          <View style={{ width: layout.sideWidth, height: boardSize, gap: Math.round(8 * s) }}>
            {topBar}
            <ScrollView style={{ flex: 1 }} contentContainerStyle={{ gap: Math.round(8 * s) }} showsVerticalScrollIndicator={false}>
              {statusEl}
              {controlsEl}
              {movesEl}
            </ScrollView>
            {bottomBar}
          </View>
        </View>
      )}

      {toast && (
        <View style={styles.toast}>
          <Text style={styles.toastText}>{toast}</Text>
        </View>
      )}

      {settingsOpen && <SettingsPanel chess onClose={() => setSettingsOpen(false)} />}
    </SafeAreaView>
  );
}

/** Tüm ölçüler `s` (0.85–1.35) ile ölçeklenir: küçük ekranda sıkı, tablet/bilgisayarda büyük */
function createStyles(s: number) {
  const z = (n: number) => Math.round(n * s);
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: C.bg },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, height: 48 },
    headerBtn: { color: C.text, fontSize: z(17) },
    title: { color: '#fff', fontSize: z(17), fontWeight: '700' },

    menu: { padding: z(20), gap: z(14), paddingBottom: z(40), width: '100%', maxWidth: 640, alignSelf: 'center' },
    menuTitle: { color: '#fff', fontSize: z(30), fontWeight: '800' },
    menuSub: { color: C.muted, fontSize: z(15), lineHeight: z(21) },
    card: { backgroundColor: C.card, borderRadius: z(16), padding: z(16), gap: z(6) },
    cardLabel: { color: C.muted, fontSize: z(12), letterSpacing: 1.2 },
    cardValue: { color: '#fff', fontSize: z(17), fontWeight: '600' },
    cardSub: { color: C.muted, fontSize: z(14) },
    how: { color: '#c3c9d8', fontSize: z(14), lineHeight: z(20) },
    primary: { backgroundColor: C.accent, borderRadius: z(14), paddingVertical: z(15), alignItems: 'center', marginTop: z(8) },
    primaryText: { color: '#fff', fontSize: z(16), fontWeight: '700' },
    secondary: { backgroundColor: '#232a3b', borderRadius: z(14), paddingVertical: z(15), alignItems: 'center' },
    secondaryText: { color: C.text, fontSize: z(16), fontWeight: '600' },

    chips: { flexDirection: 'row', flexWrap: 'wrap', gap: z(8) },
    chip: { backgroundColor: '#232a3b', borderRadius: z(12), paddingVertical: z(10), paddingHorizontal: z(14), borderWidth: 1.5, borderColor: 'transparent' },
    chipOn: { borderColor: C.accent, backgroundColor: '#2a2f55' },
    chipText: { color: C.text, fontSize: z(14), fontWeight: '600' },
    chipTextOn: { color: '#fff', fontWeight: '800' },
    chipGroup: { color: C.muted, fontSize: z(13), marginTop: z(6) },
    chipHint: { color: '#c3c9d8', fontSize: z(13), lineHeight: z(18), marginTop: z(6) },

    play: { alignItems: 'center', paddingHorizontal: 12, paddingBottom: z(30) },
    playWide: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12, paddingHorizontal: 12 },
    player: { flexDirection: 'row', alignItems: 'center', gap: z(8), backgroundColor: C.card, borderRadius: z(12), paddingHorizontal: z(12), paddingVertical: z(8), borderWidth: 1.5, borderColor: 'transparent' },
    playerActive: { borderColor: C.accent },
    dot: { width: z(14), height: z(14), borderRadius: z(7), borderWidth: 1.5, borderColor: '#aab1c3' },
    playerName: { color: '#fff', fontSize: z(15), fontWeight: '700' },
    captured: { flex: 1, flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', minHeight: z(22) },
    adv: { color: C.gold, fontSize: z(13), fontWeight: '800', marginLeft: 8 },
    turnBadge: { color: C.accent, fontSize: z(12), fontWeight: '800', letterSpacing: 0.5 },

    clock: { backgroundColor: '#0f1320', borderRadius: z(10), paddingVertical: z(4), paddingHorizontal: z(10), minWidth: z(70), alignItems: 'center', borderWidth: 1.5, borderColor: 'transparent' },
    clockRunning: { backgroundColor: '#23294a', borderColor: C.accent },
    clockLow: { borderColor: C.danger },
    clockText: { color: '#e5e7eb', fontSize: z(20), fontWeight: '800', fontVariant: ['tabular-nums'] },
    clockTextLow: { color: C.danger },

    status: { color: '#d1d5db', fontSize: z(16), fontWeight: '700', textAlign: 'center', marginTop: 2 },
    statusCheck: { color: C.danger },
    statusOver: { color: C.gold },
    moves: { backgroundColor: C.card, borderRadius: z(10), paddingHorizontal: z(12), paddingVertical: z(8), maxHeight: z(38) },
    movesBox: { backgroundColor: C.card, borderRadius: z(10), paddingHorizontal: z(12), paddingVertical: z(8) },
    movesText: { color: '#c3c9d8', fontSize: z(14), lineHeight: z(20) },

    actions: { flexDirection: 'row', gap: z(8), flexWrap: 'wrap' },
    action: { flexGrow: 1, flexBasis: z(70), backgroundColor: '#232a3b', borderRadius: z(12), paddingVertical: z(12), alignItems: 'center' },
    actionText: { color: C.text, fontSize: z(13), fontWeight: '700' },
    overTitle: { color: C.gold, fontSize: z(18), fontWeight: '800', textAlign: 'center' },

    promoWrap: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.45)', borderRadius: 10 },
    promo: { backgroundColor: C.card, borderRadius: 16, padding: 14, alignItems: 'center', gap: 10 },
    promoTitle: { color: '#fff', fontSize: z(15), fontWeight: '700' },
    promoBtn: { backgroundColor: '#dfe6f5', borderRadius: 12, padding: 6 },

    toast: { position: 'absolute', left: 16, right: 16, bottom: 24, backgroundColor: 'rgba(20,24,33,0.95)', borderRadius: 14, paddingHorizontal: 14, paddingVertical: 10, borderWidth: 1, borderColor: '#2f3750', alignSelf: 'center', maxWidth: 560 },
    toastText: { color: '#f3f4f6', fontSize: z(14), textAlign: 'center' },
  });
}
