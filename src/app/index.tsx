import { FlatList, Pressable, Text, View, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { games } from '@/games/registry';

export default function Hub() {
  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.title}>Oyun Merkezi</Text>
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
  title: { color: '#fff', fontSize: 30, fontWeight: '700', marginBottom: 20 },
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
