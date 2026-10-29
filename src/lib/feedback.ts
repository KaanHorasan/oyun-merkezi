import { Platform } from 'react-native';
import * as Haptics from 'expo-haptics';
import { createAudioPlayer } from 'expo-audio';
import type { AudioPlayer } from 'expo-audio';

// ---------- Ses ----------

const SOURCES = {
  rotate: require('../../assets/sounds/rotate.wav'),
  hold: require('../../assets/sounds/hold.wav'),
  lock: require('../../assets/sounds/lock.wav'),
  clear: require('../../assets/sounds/clear.wav'),
  tetris: require('../../assets/sounds/tetris.wav'),
  levelup: require('../../assets/sounds/levelup.wav'),
  gameover: require('../../assets/sounds/gameover.wav'),
} as const;

export type SoundName = keyof typeof SOURCES;

// Oynatıcılar ilk kullanımda (tarayıcıda/telefonda, sunucuda değil) oluşturulur.
const players: Partial<Record<SoundName, AudioPlayer>> = {};

export function playSound(name: SoundName) {
  try {
    let player = players[name];
    if (!player) {
      player = createAudioPlayer(SOURCES[name]);
      players[name] = player;
    }
    player.seekTo(0);
    player.play();
  } catch {
    // ses çalmazsa oyun etkilenmesin
  }
}

// ---------- Müzik (döngüde çalan arka plan) ----------

const MUSIC_SOURCES = {
  tetris: require('../../assets/sounds/music-tetris.wav'),
} as const;

export type MusicName = keyof typeof MUSIC_SOURCES;

const MUSIC_VOLUME = 0.3;
const musicPlayers: Partial<Record<MusicName, AudioPlayer>> = {};

function getMusic(name: MusicName): AudioPlayer {
  let player = musicPlayers[name];
  if (!player) {
    player = createAudioPlayer(MUSIC_SOURCES[name]);
    player.loop = true;
    player.volume = MUSIC_VOLUME;
    musicPlayers[name] = player;
  }
  return player;
}

/** Müziği başlatır veya duraklatır. Tarayıcı izin vermezse (kullanıcı henüz dokunmadıysa) sessizce geçer; sonraki dokunuşta tekrar denenir. */
export function setMusic(name: MusicName, on: boolean) {
  try {
    if (!on) {
      musicPlayers[name]?.pause();
      return;
    }
    getMusic(name).play();
  } catch {
    // müzik çalmazsa oyun etkilenmesin
  }
}

/** Müziği başa sarar (yeni oyun başlarken). */
export function rewindMusic(name: MusicName) {
  try {
    musicPlayers[name]?.seekTo(0);
  } catch {
    // önemli değil
  }
}

// ---------- Titreşim ----------

export type HapticKind = 'select' | 'light' | 'medium' | 'success' | 'error';

const WEB_VIBRATE_MS: Record<HapticKind, number> = { select: 8, light: 12, medium: 25, success: 60, error: 120 };

export function haptic(kind: HapticKind) {
  try {
    if (Platform.OS === 'web') {
      if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
        navigator.vibrate(WEB_VIBRATE_MS[kind]);
      }
      return;
    }
    switch (kind) {
      case 'select':
        Haptics.selectionAsync();
        break;
      case 'light':
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        break;
      case 'medium':
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        break;
      case 'success':
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        break;
      case 'error':
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        break;
    }
  } catch {
    // titreşim yoksa sessizce geç
  }
}
