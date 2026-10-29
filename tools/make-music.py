#!/usr/bin/env python3
"""
Tetris müziği üreticisi: "Korobeiniki" (Rus halk şarkısı, 1861, telif dışı) melodisinin
sade bir düzenlemesini (melodi + bas) kodla sentezleyip assets/sounds/music-tetris.wav olarak yazar.
Resmi oyun kaydı veya resmi düzenleme KULLANILMAZ; notalar ve ses tamamen bu dosyada üretilir.

Kullanım:  python3 tools/make-music.py   (numpy gerekir)
"""
import subprocess
import numpy as np

BPM = 150
BEAT = 60.0 / BPM            # çeyrek nota süresi (sn)
INTERNAL_SR = 44100          # içeride yüksek örnekleme, sonra ffmpeg ile küçültülür
OUT = 'assets/sounds/music-tetris.wav'

# ---- Nota frekansları ----
NAMES = {'C': 0, 'C#': 1, 'D': 2, 'D#': 3, 'E': 4, 'F': 5, 'F#': 6, 'G': 7, 'G#': 8, 'A': 9, 'A#': 10, 'B': 11}
def freq(name):
    """'E5', 'G#4' gibi bir notanın frekansı (A4 = 440 Hz)."""
    if name == 'R':
        return 0.0
    pitch, octave = name[:-1], int(name[-1])
    midi = 12 * (octave + 1) + NAMES[pitch]
    return 440.0 * 2 ** ((midi - 69) / 12)

# ---- Melodi: (nota, süre) süre çeyrek nota cinsinden (0.5 = sekizlik, 1.5 = noktalı çeyrek) ----
A_PART = [
    # 1. ölçü
    ('E5', 1), ('B4', .5), ('C5', .5), ('D5', 1), ('C5', .5), ('B4', .5),
    # 2
    ('A4', 1), ('A4', .5), ('C5', .5), ('E5', 1), ('D5', .5), ('C5', .5),
    # 3
    ('B4', 1.5), ('C5', .5), ('D5', 1), ('E5', 1),
    # 4
    ('C5', 1), ('A4', 1), ('A4', 2),
    # 5
    ('D5', 1.5), ('F5', .5), ('A5', 1), ('G5', .5), ('F5', .5),
    # 6
    ('E5', 1.5), ('C5', .5), ('E5', 1), ('D5', .5), ('C5', .5),
    # 7
    ('B4', 1), ('B4', .5), ('C5', .5), ('D5', 1), ('E5', 1),
    # 8
    ('C5', 1), ('A4', 1), ('A4', 2),
]
B_PART = [
    ('E5', 2), ('C5', 2),   # 1
    ('D5', 2), ('B4', 2),   # 2
    ('C5', 2), ('A4', 2),   # 3
    ('G#4', 4),             # 4
    ('E5', 2), ('C5', 2),   # 5
    ('D5', 2), ('B4', 2),   # 6
    ('C5', 2), ('E5', 2),   # 7
    ('A5', 4),              # 8  (G#5'i ayrı bir ölçü yapmak yerine A bölümüne dönüşü hızlandırıyoruz)
]

# ---- Bas: ölçü başına akor (kök, beşli) — "bum-ça" kalıbı ----
CHORDS = {
    'Am': ('A2', 'E3'), 'E': ('E2', 'B2'), 'Dm': ('D3', 'A3'), 'G': ('G2', 'D3'),
}
A_BASS = ['Am', 'Am', 'E', 'Am', 'Dm', 'Am', 'E', 'Am']
B_BASS = ['Am', 'G', 'Am', 'E', 'Am', 'G', 'Am', 'E']

SECTIONS = [(A_PART, A_BASS), (A_PART, A_BASS), (B_PART, B_BASS)]


def adsr(n, attack, release, decay_to=1.0):
    env = np.ones(n)
    a = min(n, int(INTERNAL_SR * attack))
    r = min(n, int(INTERNAL_SR * release))
    if a > 0:
        env[:a] = np.linspace(0, 1, a)
    if r > 0:
        env[-r:] *= np.linspace(1, 0, r)
    if decay_to != 1.0:
        env *= np.linspace(1.0, decay_to, n)
    return env


def pulse(f, n, duty):
    t = np.arange(n) / INTERNAL_SR
    phase = (t * f) % 1.0
    return np.where(phase < duty, 1.0, -1.0)


def triangle(f, n):
    t = np.arange(n) / INTERNAL_SR
    return 2 * np.abs(2 * ((t * f) % 1.0) - 1) - 1


def render_section(melody, bass_chords):
    bars = len(bass_chords)
    total = int(round(bars * 4 * BEAT * INTERNAL_SR))
    lead = np.zeros(total)
    bass = np.zeros(total)

    # Melodi (ön plan): %25 darbeli dalga, hafif vibrato yok, kısa nota sonları
    pos = 0.0
    for name, dur in melody:
        start = int(round(pos * BEAT * INTERNAL_SR))
        n = int(round(dur * BEAT * INTERNAL_SR))
        if name != 'R' and n > 0:
            note_len = int(n * 0.92)  # notalar arasında küçük boşluk
            wave = pulse(freq(name), note_len, 0.25) * adsr(note_len, 0.004, 0.02, decay_to=0.75)
            lead[start:start + note_len] += wave
        pos += dur

    # Bas: sekizlik notalarla kök-beşli-kök-beşli
    for bar, chord in enumerate(bass_chords):
        root, fifth = CHORDS[chord]
        for step in range(4):
            beat_pos = bar * 4 + step
            start = int(round(beat_pos * BEAT * INTERNAL_SR))
            n = int(round(BEAT * INTERNAL_SR))
            f = freq(root) if step % 2 == 0 else freq(fifth)
            note_len = int(n * 0.55)
            wave = triangle(f, note_len) * adsr(note_len, 0.005, 0.03)
            bass[start:start + note_len] += wave
    return lead * 0.30 + bass * 0.34


def check_bars(melody, bars, label):
    """Her ölçü tam 4 vuruş olmalı; olmazsa hata ver (nota yazım hatalarını yakalar)."""
    pos = 0.0
    for name, dur in melody:
        pos += dur
    expected = bars * 4
    assert abs(pos - expected) < 1e-9, f'{label}: {pos} vuruş, beklenen {expected}'
    # ölçü sınırlarına denk gelen notaları da kontrol et
    t = 0.0
    for name, dur in melody:
        bar_end = (int(t // 4) + 1) * 4
        assert t + dur <= bar_end + 1e-9, f'{label}: {name} nota ölçü sınırını aşıyor (vuruş {t})'
        t += dur


def main():
    check_bars(A_PART, 8, 'A bölümü')
    check_bars(B_PART, 8, 'B bölümü')
    audio = np.concatenate([render_section(m, b) for m, b in SECTIONS])
    # Döngü başı/sonu tıklamasın: çok kısa giriş/çıkış
    fade = int(INTERNAL_SR * 0.01)
    audio[:fade] *= np.linspace(0, 1, fade)
    audio[-fade:] *= np.linspace(1, 0, fade)
    peak = np.max(np.abs(audio))
    audio = audio / peak * 0.85
    pcm = (audio * 32767).astype('<i2').tobytes()

    # ffmpeg: küçült (16 kHz mono), üst frekansları yumuşat
    cmd = ['ffmpeg', '-y', '-loglevel', 'error', '-f', 's16le', '-ar', str(INTERNAL_SR), '-ac', '1', '-i', 'pipe:0',
           '-af', 'lowpass=f=6500', '-ar', '16000', '-ac', '1', '-c:a', 'pcm_s16le', OUT]
    subprocess.run(cmd, input=pcm, check=True)
    seconds = len(audio) / INTERNAL_SR
    print(f'{OUT} yazıldı: {seconds:.1f} sn')


if __name__ == '__main__':
    main()
