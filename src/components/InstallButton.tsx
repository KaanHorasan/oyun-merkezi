import { useEffect, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

declare global {
  interface Window {
    __installPrompt?: InstallPromptEvent | null;
  }
}

function isStandalone(): boolean {
  const nav = navigator as Navigator & { standalone?: boolean };
  return window.matchMedia?.('(display-mode: standalone)').matches || nav.standalone === true;
}

function isIos(): boolean {
  return (
    /iphone|ipad|ipod/i.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  );
}

/**
 * "Uygulamayı yükle" butonu (yalnızca web).
 * - Android/Chrome/Edge: tarayıcının kendi yükleme penceresini açar.
 * - iPhone/iPad (Safari) ve diğerleri: tarayıcı buna izin vermediği için adımları gösterir.
 * - Zaten kuruluysa (uygulama olarak açıldıysa) görünmez.
 */
export default function InstallButton() {
  const [visible, setVisible] = useState(false);
  const [ios, setIos] = useState(false);
  const [showHelp, setShowHelp] = useState(false);

  useEffect(() => {
    if (Platform.OS !== 'web' || isStandalone()) return;
    setIos(isIos());
    setVisible(true);
    const onInstalled = () => {
      window.__installPrompt = null;
      setVisible(false);
    };
    window.addEventListener('appinstalled', onInstalled);
    return () => window.removeEventListener('appinstalled', onInstalled);
  }, []);

  const onPress = async () => {
    const evt = window.__installPrompt;
    if (evt) {
      try {
        await evt.prompt();
        const { outcome } = await evt.userChoice;
        window.__installPrompt = null; // bir istek yalnızca bir kez kullanılabilir
        if (outcome === 'accepted') setVisible(false);
        else setShowHelp(false);
      } catch {
        setShowHelp(true);
      }
      return;
    }
    setShowHelp((h) => !h);
  };

  if (!visible) return null;

  return (
    <View style={styles.wrap}>
      <Pressable style={styles.button} onPress={onPress}>
        <Text style={styles.buttonText}>📲 Uygulamayı yükle</Text>
      </Pressable>
      {showHelp && (
        <View style={styles.help}>
          {ios ? (
            <>
              <Text style={styles.helpTitle}>iPhone / iPad</Text>
              <Text style={styles.helpText}>1. Safari’de alttaki Paylaş (⬆︎) düğmesine bas.</Text>
              <Text style={styles.helpText}>2. “Ana Ekrana Ekle”yi seç.</Text>
              <Text style={styles.helpText}>3. Sağ üstten “Ekle”ye bas.</Text>
            </>
          ) : (
            <>
              <Text style={styles.helpTitle}>Yüklemek için</Text>
              <Text style={styles.helpText}>
                Tarayıcı menüsünden (⋮ veya adres çubuğundaki yükle simgesinden) “Uygulamayı yükle” ya da “Ana ekrana
                ekle” seçeneğini kullan.
              </Text>
            </>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: 16, gap: 10 },
  button: { backgroundColor: '#2563eb', borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  help: { backgroundColor: '#1e1e1e', borderRadius: 12, padding: 14, gap: 4 },
  helpTitle: { color: '#fff', fontSize: 15, fontWeight: '700', marginBottom: 2 },
  helpText: { color: '#bbb', fontSize: 14, lineHeight: 20 },
});
