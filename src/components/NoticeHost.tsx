import { useEffect } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { haptic, playSound } from '@/lib/feedback';
import { dismissNotice, useNotice } from '@/lib/progress/notices';
import { useSettings } from '@/lib/settings';

/** Görev/başarım bildirimlerini ekranın üstünde gösterir. Dokununca Görevler ekranı açılır. */
export default function NoticeHost() {
  const notice = useNotice();
  const insets = useSafeAreaInsets();
  const [settings] = useSettings();
  const id = notice?.id;

  useEffect(() => {
    if (!notice) return;
    if (settings.sound) playSound(notice.kind === 'achievement' ? 'levelup' : 'clear', settings.sfxVolume);
    if (settings.vibration) haptic('success');
    // yalnızca yeni bildirim geldiğinde çalsın
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  if (!notice) return null;

  return (
    <View style={[styles.wrap, { top: insets.top + 6 }]}>
      <Pressable
        style={styles.card}
        onPress={() => {
          dismissNotice();
          router.push('/quests');
        }}
      >
        <Text style={styles.icon}>{notice.icon}</Text>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>{notice.title}</Text>
          <Text style={styles.body}>{notice.body}</Text>
        </View>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 12, right: 12, alignItems: 'center', zIndex: 100, pointerEvents: 'box-none' },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    maxWidth: 460,
    width: '100%',
    backgroundColor: '#1b2133',
    borderColor: '#6366f1',
    borderWidth: 1.5,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  icon: { fontSize: 28 },
  title: { color: '#fff', fontSize: 15, fontWeight: '800' },
  body: { color: '#c3c9d8', fontSize: 13, marginTop: 1 },
});
