import { Platform, Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import { useSettings } from '@/lib/settings';

type Props = {
  onClose: () => void;
  /** Oyuna özel seçenekler */
  ghost?: boolean;
  buttons?: boolean;
};

function Row({
  label,
  hint,
  value,
  onChange,
}: {
  label: string;
  hint?: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <View style={styles.row}>
      <View style={{ flex: 1 }}>
        <Text style={styles.label}>{label}</Text>
        {hint ? <Text style={styles.hint}>{hint}</Text> : null}
      </View>
      <Switch value={value} onValueChange={onChange} />
    </View>
  );
}

export default function SettingsPanel({ onClose, ghost = false, buttons = false }: Props) {
  const [settings, update] = useSettings();

  return (
    <View style={styles.backdrop}>
      <View style={styles.card}>
        <Text style={styles.title}>Ayarlar</Text>
        <Row label="Ses" value={settings.sound} onChange={(v) => update({ sound: v })} />
        <Row
          label="Titreşim"
          hint={Platform.OS === 'web' ? 'Web’de yalnızca Android Chrome’da çalışır' : undefined}
          value={settings.vibration}
          onChange={(v) => update({ vibration: v })}
        />
        {ghost && (
          <Row
            label="Hayalet parça"
            hint="Parçanın nereye düşeceğini gösterir"
            value={settings.ghost}
            onChange={(v) => update({ ghost: v })}
          />
        )}
        {buttons && (
          <Row
            label="Ekran butonları"
            hint="Kapalıyken yalnızca dokunmatik hareketler kullanılır, tahta büyür"
            value={settings.showButtons}
            onChange={(v) => update({ showButtons: v })}
          />
        )}
        <Pressable style={styles.close} onPress={onClose}>
          <Text style={styles.closeText}>Kapat</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.7)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    zIndex: 10,
  },
  card: { width: '100%', maxWidth: 380, backgroundColor: '#1e1e1e', borderRadius: 16, padding: 20, gap: 14 },
  title: { color: '#fff', fontSize: 22, fontWeight: '700' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  label: { color: '#fff', fontSize: 16 },
  hint: { color: '#888', fontSize: 12, marginTop: 2 },
  close: { backgroundColor: '#2563eb', borderRadius: 10, paddingVertical: 12, alignItems: 'center', marginTop: 4 },
  closeText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});
