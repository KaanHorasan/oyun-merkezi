import { FlatList, Pressable, Text, View, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import InstallButton from '@/components/InstallButton';
import { games } from '@/games/registry';
import { useProgress } from '@/lib/progress/progress';
import { useWallet } from '@/lib/wallet';

const fmt = (n: number) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '.');

export default function Hub() {
  const { coins } = useWallet();
  const { view } = useProgress();
  const badge = view.loaded ? view.claimable : 0;

  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.title}>Oyun Merkezi</Text>

      <View style={styles.bar}>
        <View style={styles.wallet}>
          <Text style={styles.walletText}>🪙 {fmt(coins)}</Text>
        </View>
        <Pressable style={styles.questBtn} onPress={() => router.push('/quests')}>
          <Text style={styles.questText}>🎯 Görevler</Text>
          {badge > 0 && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{badge}</Text>
            </View>
          )}
        </Pressable>
      </View>

      <InstallButton />
      <FlatList
        data={games}
        keyExtractor={(g) => g.id}
        contentContainerStyle={{ gap: 12 }}
        renderItem={({ item }) => (
          <Pressable
            style={styles.card}
            onPress={() => router.push({ pathname: '/game/[id]', params: { id: item.id } })}
          >
            <Text style={styles.icon}>{item.icon}</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.name}>{item.name}</Text>
              <Text style={styles.desc}>{item.description}</Text>
            </View>
          </Pressable>
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#111', padding: 20 },
  title: { color: '#fff', fontSize: 30, fontWeight: '700', marginBottom: 14 },
  bar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 16 },
  wallet: { backgroundColor: '#232a3b', borderRadius: 20, paddingHorizontal: 14, paddingVertical: 9 },
  walletText: { color: '#facc15', fontSize: 16, fontWeight: '800' },
  questBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#6366f1',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 9,
  },
  questText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  badge: { minWidth: 22, height: 22, borderRadius: 11, backgroundColor: '#ef4444', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 5 },
  badgeText: { color: '#fff', fontSize: 12, fontWeight: '800' },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    backgroundColor: '#1e1e1e',
    padding: 18,
    borderRadius: 14,
  },
  icon: { fontSize: 36 },
  name: { color: '#fff', fontSize: 20, fontWeight: '600' },
  desc: { color: '#aaa', fontSize: 14, marginTop: 2 },
});
