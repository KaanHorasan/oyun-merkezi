import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { haptic, playSound } from '@/lib/feedback';
import { GAME_LABEL, romanTier } from '@/lib/progress/definitions';
import type { GameTag } from '@/lib/progress/definitions';
import type { AchievementView, QuestView } from '@/lib/progress/engine';
import { useProgress } from '@/lib/progress/progress';
import { useSettings } from '@/lib/settings';
import { useWallet } from '@/lib/wallet';

const C = {
  bg: '#0b0e14',
  card: '#161b27',
  line: '#232a3b',
  text: '#e5e7eb',
  muted: '#8b93a7',
  accent: '#6366f1',
  gold: '#facc15',
  green: '#4ade80',
};

const fmt = (n: number) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '.');

/** Kalan süreyi "5 sa 12 dk" gibi yazar */
function formatRemaining(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 60000));
  const h = Math.floor(total / 60);
  const m = total % 60;
  return h > 0 ? `${h} sa ${m} dk` : `${m} dk`;
}

function ProgressBar({ value, max, color = C.accent }: { value: number; max: number; color?: string }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <View style={styles.barTrack}>
      <View style={[styles.barFill, { width: `${pct}%`, backgroundColor: color }]} />
    </View>
  );
}

function ClaimButton({
  state,
  label,
  onPress,
}: {
  state: 'locked' | 'ready' | 'claimed';
  label: string;
  onPress: () => void;
}) {
  const ready = state === 'ready';
  return (
    <Pressable
      disabled={!ready}
      onPress={onPress}
      style={({ pressed }) => [styles.btn, ready && styles.btnReady, pressed && ready && { opacity: 0.8 }]}
    >
      <Text style={[styles.btnText, !ready && { color: state === 'claimed' ? C.green : C.muted }]}>{label}</Text>
    </Pressable>
  );
}

function QuestCard({ q, onClaim }: { q: QuestView; onClaim: () => void }) {
  const state = q.claimed ? 'claimed' : q.done ? 'ready' : 'locked';
  return (
    <View style={styles.card}>
      <View style={styles.rowBetween}>
        <Text style={styles.gameTag}>{GAME_LABEL[q.game].toUpperCase()}</Text>
        <Text style={styles.reward}>+{q.reward} 🪙</Text>
      </View>
      <Text style={styles.questText}>{q.text}</Text>
      <ProgressBar value={q.progress} max={q.target} color={q.done ? C.green : C.accent} />
      <View style={styles.rowBetween}>
        <Text style={styles.progressText}>
          {fmt(q.progress)} / {fmt(q.target)}
        </Text>
        <ClaimButton
          state={state}
          onPress={onClaim}
          label={q.claimed ? 'Alındı ✓' : q.done ? 'Ödülü al' : 'Devam ediyor'}
        />
      </View>
    </View>
  );
}

function AchievementCard({ a, onClaim }: { a: AchievementView; onClaim: () => void }) {
  const next = a.nextTier;
  const allDone = next === null;
  const ready = a.claimableReward > 0;
  return (
    <View style={styles.card}>
      <View style={styles.rowBetween}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
          <Text style={styles.achIcon}>{a.icon}</Text>
          <View style={{ flex: 1 }}>
            <Text style={styles.achTitle}>{a.title}</Text>
            <Text style={styles.achDesc}>{a.desc}</Text>
          </View>
        </View>
        <View style={styles.tiers}>
          {a.tiers.map((t, i) => (
            <View key={i} style={[styles.tier, t.unlocked && styles.tierOn]}>
              <Text style={[styles.tierText, t.unlocked && { color: '#fff' }]}>{romanTier(i)}</Text>
            </View>
          ))}
        </View>
      </View>

      {allDone ? (
        <Text style={styles.progressText}>Tüm basamaklar tamamlandı · {fmt(a.value)}</Text>
      ) : (
        <>
          <ProgressBar value={a.value} max={next!.target} />
          <Text style={styles.progressText}>
            {fmt(a.value)} / {fmt(next!.target)} · sıradaki ödül +{next!.reward} 🪙
          </Text>
        </>
      )}

      {ready ? (
        <ClaimButton state="ready" label={`Ödülü al · +${fmt(a.claimableReward)} 🪙`} onPress={onClaim} />
      ) : allDone ? (
        <ClaimButton state="claimed" label="Hepsi alındı ✓" onPress={() => {}} />
      ) : null}
    </View>
  );
}

const SECTIONS: GameTag[] = ['minesweeper', 'tetris', 'general'];

export default function QuestsScreen() {
  const { view, refresh, claimQuest, claimBonus, claimAchievement } = useProgress();
  const { coins } = useWallet();
  const [settings] = useSettings();
  const [tab, setTab] = useState<'daily' | 'ach'>('daily');
  const [now, setNow] = useState(() => Date.now());

  // Geri sayımı ve gün değişimini canlı tut
  useEffect(() => {
    const id = setInterval(() => {
      setNow(Date.now());
      refresh();
    }, 30000);
    return () => clearInterval(id);
  }, [refresh]);

  const celebrate = () => {
    if (settings.sound) playSound('levelup', settings.sfxVolume);
    if (settings.vibration) haptic('success');
  };

  const dailyReady = view.loaded ? view.quests.filter((q) => q.done && !q.claimed).length + (view.bonus.done && !view.bonus.claimed ? 1 : 0) : 0;
  const achReady = view.loaded ? view.achievements.filter((a) => a.claimableReward > 0).length : 0;

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Pressable onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} hitSlop={10}>
          <Text style={styles.headerBtn}>‹ Geri</Text>
        </Pressable>
        <Text style={styles.title}>Görevler</Text>
        <View style={styles.wallet}>
          <Text style={styles.walletText}>🪙 {fmt(coins)}</Text>
        </View>
      </View>

      <View style={styles.tabs}>
        <Pressable style={[styles.tab, tab === 'daily' && styles.tabOn]} onPress={() => setTab('daily')}>
          <Text style={[styles.tabText, tab === 'daily' && { color: '#fff' }]}>Günlük{dailyReady > 0 ? `  •${dailyReady}` : ''}</Text>
        </Pressable>
        <Pressable style={[styles.tab, tab === 'ach' && styles.tabOn]} onPress={() => setTab('ach')}>
          <Text style={[styles.tabText, tab === 'ach' && { color: '#fff' }]}>Başarımlar{achReady > 0 ? `  •${achReady}` : ''}</Text>
        </Pressable>
      </View>

      {!view.loaded ? (
        <View style={{ flex: 1 }} />
      ) : tab === 'daily' ? (
        <ScrollView contentContainerStyle={styles.list}>
          <View style={styles.rowBetween}>
            <Text style={styles.section}>BUGÜNÜN GÖREVLERİ</Text>
            <Text style={styles.reset}>Yenilenmeye {formatRemaining(view.nextResetAt - now)}</Text>
          </View>

          {view.quests.map((q) => (
            <QuestCard
              key={q.id}
              q={q}
              onClaim={() => {
                if (claimQuest(q.id)) celebrate();
              }}
            />
          ))}

          <View style={[styles.card, styles.bonus]}>
            <View style={styles.rowBetween}>
              <Text style={styles.questText}>🎁 Tüm görevleri tamamla</Text>
              <Text style={styles.reward}>+{view.bonus.reward} 🪙</Text>
            </View>
            <ProgressBar value={view.bonus.completed} max={view.bonus.total} color={C.gold} />
            <View style={styles.rowBetween}>
              <Text style={styles.progressText}>
                {view.bonus.completed} / {view.bonus.total} görev
              </Text>
              <ClaimButton
                state={view.bonus.claimed ? 'claimed' : view.bonus.done ? 'ready' : 'locked'}
                label={view.bonus.claimed ? 'Alındı ✓' : view.bonus.done ? 'Bonusu al' : 'Devam ediyor'}
                onPress={() => {
                  if (claimBonus()) celebrate();
                }}
              />
            </View>
          </View>

          <Text style={styles.note}>
            Görevler her gece yarısı yenilenir. Sadece bugün yaptıkların sayılır. Ödüller ortak 🪙 cüzdanına eklenir.
          </Text>
        </ScrollView>
      ) : (
        <ScrollView contentContainerStyle={styles.list}>
          {SECTIONS.map((g) => (
            <View key={g} style={{ gap: 12 }}>
              <Text style={styles.section}>{GAME_LABEL[g].toUpperCase()}</Text>
              {view.achievements
                .filter((a) => a.game === g)
                .map((a) => (
                  <AchievementCard
                    key={a.id}
                    a={a}
                    onClaim={() => {
                      if (claimAchievement(a.id) > 0) celebrate();
                    }}
                  />
                ))}
            </View>
          ))}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 10 },
  headerBtn: { color: C.text, fontSize: 17 },
  title: { color: '#fff', fontSize: 18, fontWeight: '800' },
  wallet: { backgroundColor: '#232a3b', borderRadius: 18, paddingHorizontal: 12, paddingVertical: 6 },
  walletText: { color: C.gold, fontWeight: '800', fontSize: 15 },

  tabs: { flexDirection: 'row', gap: 8, paddingHorizontal: 20, marginBottom: 8 },
  tab: { flex: 1, backgroundColor: C.card, borderRadius: 12, paddingVertical: 11, alignItems: 'center' },
  tabOn: { backgroundColor: C.accent },
  tabText: { color: C.muted, fontWeight: '700', fontSize: 15 },

  list: { padding: 20, paddingTop: 8, gap: 12, paddingBottom: 40 },
  section: { color: C.muted, fontSize: 12, letterSpacing: 1.2, marginTop: 4 },
  reset: { color: C.muted, fontSize: 12 },
  note: { color: C.muted, fontSize: 13, lineHeight: 19, marginTop: 4 },

  card: { backgroundColor: C.card, borderRadius: 16, padding: 14, gap: 10 },
  bonus: { borderWidth: 1, borderColor: '#5b4a14' },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  gameTag: { color: '#a5b4fc', fontSize: 11, letterSpacing: 1.1, fontWeight: '700' },
  reward: { color: C.gold, fontWeight: '800', fontSize: 14 },
  questText: { color: '#fff', fontSize: 16, fontWeight: '700', flexShrink: 1 },
  progressText: { color: '#aab1c3', fontSize: 13, flexShrink: 1 },

  barTrack: { height: 8, borderRadius: 4, backgroundColor: '#262d40', overflow: 'hidden' },
  barFill: { height: 8, borderRadius: 4 },

  btn: { backgroundColor: '#232a3b', borderRadius: 11, paddingHorizontal: 14, paddingVertical: 9, alignItems: 'center' },
  btnReady: { backgroundColor: C.accent },
  btnText: { color: '#fff', fontSize: 14, fontWeight: '700' },

  achIcon: { fontSize: 30 },
  achTitle: { color: '#fff', fontSize: 16, fontWeight: '800' },
  achDesc: { color: C.muted, fontSize: 13 },
  tiers: { flexDirection: 'row', gap: 4 },
  tier: { minWidth: 24, height: 24, borderRadius: 12, backgroundColor: '#262d40', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  tierOn: { backgroundColor: C.accent },
  tierText: { color: C.muted, fontSize: 11, fontWeight: '800' },
});
