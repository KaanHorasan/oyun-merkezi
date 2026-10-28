import { View, Text, Pressable, StyleSheet } from 'react-native';
import type { GameProps } from '../types';

export default function MinesweeperScreen({ onExit }: GameProps) {
  return (
    <View style={styles.container}>
      <Text style={styles.text}>Mayın Tarlası (yakında)</Text>
      <Pressable style={styles.button} onPress={onExit}>
        <Text style={styles.buttonText}>Geri</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#111' },
  text: { color: '#fff', fontSize: 22, marginBottom: 20 },
  button: { backgroundColor: '#333', paddingHorizontal: 24, paddingVertical: 12, borderRadius: 10 },
  buttonText: { color: '#fff', fontSize: 16 },
});
