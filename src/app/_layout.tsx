import { useEffect } from 'react';
import { Platform } from 'react-native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

export default function RootLayout() {
  // Web: servis çalışanını kaydet (uygulama yüklenebilir olsun, internetsiz de açılsın).
  // Geliştirme sırasında kapalı; önbellek canlı yenilemeyi bozmasın.
  useEffect(() => {
    if (Platform.OS !== 'web' || __DEV__ || !('serviceWorker' in navigator)) return;
    const manifest = document.querySelector<HTMLLinkElement>('link[rel="manifest"]');
    if (!manifest) return;
    const swUrl = new URL('sw.js', manifest.href).href;
    const scope = new URL('./', manifest.href).href;
    navigator.serviceWorker.register(swUrl, { scope }).catch(() => {});
  }, []);

  return (
    <>
      <StatusBar style="light" />
      <Stack screenOptions={{ headerShown: false }} />
    </>
  );
}
