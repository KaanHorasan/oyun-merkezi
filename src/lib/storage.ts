import AsyncStorage from '@react-native-async-storage/async-storage';

/** Kalıcı kayıt (telefonda AsyncStorage, web'de tarayıcı localStorage). Hata olursa sessizce varsayılana döner. */
export async function loadJSON<T>(key: string, fallback: T): Promise<T> {
  try {
    const raw = await AsyncStorage.getItem(key);
    return raw == null ? fallback : (JSON.parse(raw) as T);
  } catch {
    return fallback;
  }
}

export async function saveJSON(key: string, value: unknown): Promise<void> {
  try {
    await AsyncStorage.setItem(key, JSON.stringify(value));
  } catch {
    // kayıt başarısız olursa oyun yine de devam eder
  }
}

export async function removeKey(key: string): Promise<void> {
  try {
    await AsyncStorage.removeItem(key);
  } catch {
    // önemli değil
  }
}
