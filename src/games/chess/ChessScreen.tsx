import { useEffect, useRef, useState } from 'react';
import type { ComponentRef } from 'react';
import { Pressable, ScrollView, Share, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import SettingsPanel from '@/components/SettingsPanel';
import { haptic, playSound } from '@/lib/feedback';
import { useSettings } from '@/lib/settings';
import type { GameProps } from '../types';
import ChessBoard from './ChessBoard';
import { INITIAL_UI, checkedKingSquare, choosePromotion, tapSquare, targetsOf } from './controller';
import type { UiState } from './controller';
import { ChessGame } from './engine/game';
import type { GameStatus, MoveRecord } from './engine/game';
import { movetextOf } from './engine/pgn';
import { BISHOP, BLACK, KNIGHT, QUEEN, ROOK, WHITE, makePiece } from './engine/types';
import type { Color } from './engine/types';
import { clearChess, loadChess, saveChess } from './persistence';
import type { LoadedChess } from './persistence';
import { PieceIcon } from './pieces';
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
type FxKind = 'select' | 'move' | 'capture' | 'check' | 'mate' | 'draw';

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
    case 'draw':
      return s.reason === 'fifty'
        ? 'Berabere: 50 hamle kuralı'
        : s.reason === 'repetition'
          ? 'Berabere: aynı pozisyon üç kez tekrarlandı'
          : s.reason === 'insufficient'
            ? 'Berabere: yetersiz materyal'
            : 'Berabere: oyuncular anlaştı';
  }
}

function PlayerBar({ game, color, active }: { game: ChessGame; color: Color; active: boolean }) {
  'use no memo'; // game yerinde değişen bir nesne
  const taken = capturedBy(game, color);
  const adv = advantageOf(game.board, color);
  return (
    <View style={[styles.player, active && styles.playerActive]}>
      <View style={[styles.dot, { backgroundColor: color === WHITE ? '#fff' : '#232b45', borderColor: color === WHITE ? '#aab1c3' : '#aab1c3' }]} />
      <Text style={styles.playerName}>{colorName(color)}</Text>
      <View style={styles.captured}>
        {taken.map((p, i) => (
          <View key={i} style={{ marginLeft: i === 0 ? 0 : -7 }}>
            <PieceIcon piece={p} size={20} />
          </View>
        ))}
        {adv > 0 && <Text style={styles.adv}>+{adv}</Text>}
      </View>
      {active && <Text style={styles.turnBadge}>sıra</Text>}
    </View>
  );
}

export default function ChessScreen({ onExit }: GameProps) {
  'use no memo'; // game yerinde değişen bir nesne; her hamlede ver sayacıyla yeniden çizilir
  const [settings] = useSettings();
  const { width, height } = useWindowDimensions();
  const [phase, setPhase] = useState<Phase>('loading');
  const [saved, setSaved] = useState<LoadedChess | null>(null);
  const [game, setGame] = useState<ChessGame | null>(null);
  const [, setVer] = useState(0);
  const [ui, setUi] = useState<UiState>(INITIAL_UI);
  const [flipped, setFlipped] = useState(false);
  const [confirm, setConfirm] = useState<'resign' | 'draw' | 'new' | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const settingsRef = useRef(settings);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const moveScroll = useRef<ComponentRef<typeof ScrollView>>(null);
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
    }
    if (vibration) {
      if (kind === 'mate') haptic('success');
      else if (kind === 'capture' || kind === 'check') haptic('medium');
      else if (kind === 'draw') haptic('light');
      else haptic('select');
    }
  };

  /** Hamleden/geri almadan sonra: tahta yönü, kayıt, yeniden çizim */
  const refresh = (g: ChessGame) => {
    const nf = settingsRef.current.chessAutoFlip && !g.isOver ? g.turn === BLACK : flipped;
    setFlipped(nf);
    saveChess(g, nf);
    bump();
  };

  const afterMove = (rec: MoveRecord, g: ChessGame) => {
    const st = g.status;
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
    setUi(INITIAL_UI);
    setFlipped(false);
    setConfirm(null);
    setSaved(null);
    setPhase('play');
  };

  const continueGame = () => {
    if (!saved) return;
    setGame(saved.game);
    setUi(INITIAL_UI);
    setFlipped(saved.flipped);
    setConfirm(null);
    setPhase('play');
  };

  const backToMenu = () => {
    if (game && game.records.length > 0 && !game.isOver) setSaved({ game, flipped });
    else {
      setSaved(null);
      if (game && game.isOver) clearChess();
    }
    setGame(null);
    setUi(INITIAL_UI);
    setConfirm(null);
    setPhase('menu');
  };

  const onSquare = (sq: number) => {
    if (!game || confirm) return;
    const prev = ui.selected;
    const res = tapSquare(game, ui, sq);
    setUi(res.ui);
    if (res.moved) afterMove(res.moved, game);
    else if (res.ui.selected !== null && res.ui.selected !== prev) fx('select');
  };

  const onPromotion = (type: number) => {
    if (!game) return;
    const res = choosePromotion(game, ui, type);
    setUi(res.ui);
    if (res.moved) afterMove(res.moved, game);
  };

  const undo = () => {
    if (!game || !game.undo()) return;
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

  // ---------- Çizim ----------

  const boardSize = Math.max(240, Math.floor(Math.min(width - 24, height - 360, 560)));
  const status = game?.status;
  const over = !!game && game.isOver;
  const top: Color = flipped ? WHITE : BLACK;
  const bottom: Color = flipped ? BLACK : WHITE;

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
              <Pressable style={styles.primary} onPress={continueGame}>
                <Text style={styles.primaryText}>Devam et</Text>
              </Pressable>
            </View>
          )}

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
          </View>
        </ScrollView>
      )}

      {phase === 'play' && game && status && (
        <ScrollView contentContainerStyle={styles.play}>
          <View style={{ width: boardSize, gap: 8 }}>
            <PlayerBar game={game} color={top} active={!over && game.turn === top} />

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
                onSquare={onSquare}
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

            <PlayerBar game={game} color={bottom} active={!over && game.turn === bottom} />

            <Text style={[styles.status, over && styles.statusOver, status.kind === 'playing' && status.check && styles.statusCheck]}>
              {statusText(status, game.turn)}
            </Text>

            <ScrollView ref={moveScroll} horizontal showsHorizontalScrollIndicator={false} style={styles.moves}>
              <Text style={styles.movesText}>
                {game.records.length ? movetextOf(game.startFen, game.records.map((r) => r.san)) : 'Hamle yok. Beyaz başlar.'}
              </Text>
            </ScrollView>

            {confirm === 'resign' || confirm === 'draw' ? (
              <View style={styles.card}>
                <Text style={styles.cardValue}>
                  {confirm === 'resign' ? `${colorName(game.turn)} teslim olsun mu?` : 'İki oyuncu da beraberliği kabul ediyor mu?'}
                </Text>
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
            )}
          </View>
        </ScrollView>
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

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 10 },
  headerBtn: { color: C.text, fontSize: 17 },
  title: { color: '#fff', fontSize: 17, fontWeight: '700' },

  menu: { padding: 20, gap: 14, paddingBottom: 40 },
  menuTitle: { color: '#fff', fontSize: 30, fontWeight: '800' },
  menuSub: { color: C.muted, fontSize: 15, lineHeight: 21 },
  card: { backgroundColor: C.card, borderRadius: 16, padding: 16, gap: 6 },
  cardLabel: { color: C.muted, fontSize: 12, letterSpacing: 1.2 },
  cardValue: { color: '#fff', fontSize: 17, fontWeight: '600' },
  how: { color: '#c3c9d8', fontSize: 14, lineHeight: 20 },
  primary: { backgroundColor: C.accent, borderRadius: 14, paddingVertical: 15, alignItems: 'center', marginTop: 8 },
  primaryText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  secondary: { backgroundColor: '#232a3b', borderRadius: 14, paddingVertical: 15, alignItems: 'center' },
  secondaryText: { color: C.text, fontSize: 16, fontWeight: '600' },

  play: { alignItems: 'center', paddingHorizontal: 12, paddingBottom: 30 },
  player: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: C.card, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8, borderWidth: 1.5, borderColor: 'transparent' },
  playerActive: { borderColor: C.accent },
  dot: { width: 14, height: 14, borderRadius: 7, borderWidth: 1.5 },
  playerName: { color: '#fff', fontSize: 15, fontWeight: '700' },
  captured: { flex: 1, flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', minHeight: 22 },
  adv: { color: C.gold, fontSize: 13, fontWeight: '800', marginLeft: 8 },
  turnBadge: { color: C.accent, fontSize: 12, fontWeight: '800', letterSpacing: 0.5 },

  status: { color: '#d1d5db', fontSize: 16, fontWeight: '700', textAlign: 'center', marginTop: 2 },
  statusCheck: { color: C.danger },
  statusOver: { color: C.gold },
  moves: { backgroundColor: C.card, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, maxHeight: 38 },
  movesText: { color: '#c3c9d8', fontSize: 14 },

  actions: { flexDirection: 'row', gap: 8 },
  action: { flex: 1, backgroundColor: '#232a3b', borderRadius: 12, paddingVertical: 12, alignItems: 'center' },
  actionText: { color: C.text, fontSize: 13, fontWeight: '700' },
  overTitle: { color: C.gold, fontSize: 18, fontWeight: '800', textAlign: 'center' },

  promoWrap: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.45)', borderRadius: 10 },
  promo: { backgroundColor: C.card, borderRadius: 16, padding: 14, alignItems: 'center', gap: 10 },
  promoTitle: { color: '#fff', fontSize: 15, fontWeight: '700' },
  promoBtn: { backgroundColor: '#dfe6f5', borderRadius: 12, padding: 6 },

  toast: { position: 'absolute', left: 16, right: 16, bottom: 24, backgroundColor: 'rgba(20,24,33,0.95)', borderRadius: 14, paddingHorizontal: 14, paddingVertical: 10, borderWidth: 1, borderColor: '#2f3750' },
  toastText: { color: '#f3f4f6', fontSize: 14, textAlign: 'center' },
});
