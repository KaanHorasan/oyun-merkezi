# Oyun Merkezi

Birden fazla mobil oyunu tek uygulamada toplayan platform (Expo + React Native + TypeScript).
Telefonda Expo Go ile, tarayıcıda ise GitHub Pages üzerinden çalışır.

## Yerelde çalıştırma

Yeni paket eklendiğinde (ses, titreşim, kayıt) önce `npm install` çalıştır.

```bash
npm install
npx expo start          # telefon: Expo Go ile QR kodu okut
npx expo start --web    # tarayıcı
```

## Web'e yayınlama (GitHub Pages)

1. GitHub'da **oyun-merkezi** adında yeni bir repo aç (public olması Pages'in ücretsiz çalışması için en kolay yol).
2. Proje klasöründe:

   ```bash
   git init
   git add .
   git commit -m "ilk sürüm"
   git branch -M main
   git remote add origin https://github.com/KULLANICI_ADIN/oyun-merkezi.git
   git push -u origin main
   ```

3. GitHub'da repo → **Settings → Pages → Build and deployment → Source: GitHub Actions** seç.
4. **Actions** sekmesinde "Web'e yayınla" iş akışı çalışır. Bitince site şu adreste olur:
   `https://KULLANICI_ADIN.github.io/oyun-merkezi/`

Bundan sonra her `git push` siteyi otomatik günceller.

### Repo adını farklı seçersen

`app.json` içindeki şu satırı repo adınla aynı yap:

```json
"experiments": { "baseUrl": "/repo-adin" }
```

(Özel alan adı veya `kullanici.github.io` adlı özel bir repo kullanırsan `baseUrl` satırını sil.)

## Sonsuz Mayın Tarlası

Her yöne sonsuza uzanan bir mayın tarlası. Skor, mayına basmadan açtığın kare sayısıdır; mayına basınca oyun biter.

- **Kontroller:** dokun = aç · basılı tut (web'de sağ tık) = bayrak · sürükle = haritada gez ·
  iki parmak (web'de tekerlek) = yakınlaştır · 🚩/⛏️ düğmesi = dokunmayı bayrak moduna çevirir ·
  bir sayının çevresine o kadar bayrak koyup sayıya dokun = kalan komşuları aç.
- **Zorluk:** Kolay %12, Normal %16, Zor %20 mayın. Her zorluk için ayrı rekor tutulur.
- **İlk dokunuş her zaman güvenli:** çevresindeki 5x5 alanda mayın olmaz, açılış zincirleme genişler.
- **Kayıt:** oyun otomatik kaydedilir; menüden "Devam et" ile kaldığın yerden sürer.

Nasıl çalışır (geliştirici notu):
- Dünya 16x16'lık **bölümlere (chunk)** ayrılır. Mayınlar saklanmaz; bir karenin mayın olup olmadığı
  (tohum, x, y) üçlüsünden karma ile hesaplanır. Bellekte ve kayıtta yalnızca açılan/bayraklanan kareler tutulur,
  bu yüzden dünya gerçekten sınırsızdır.
- Ekranda yalnızca görünen kareler çizilir; kaydırırken sadece kapsayıcı kayar.
- `world.ts` oyun mantığı, `geometry.ts` kamera/dokunma matematiği, `persistence.ts` kayıt,
  `MinesweeperScreen.tsx` arayüz. İlk üçü testlidir.
- Sıradaki fikirler: günlük görevler, başarımlar, oyun içi para birimi (mantık ve ekran buna göre ayrıştırıldı).

## Müzik

Tetris'te arka planda **Korobeiniki** melodisi çalar. ⚙ Ayarlar'da müzik ve ses efektleri için ayrı açma/kapama anahtarı
ve ayrı **ses düzeyi çubuğu** (sürükle veya − / + düğmeleri) vardır. Ayarlar açıkken müzik çalmaya devam eder, böylece
ses düzeyini ayarlarken duyabilirsin; efekt çubuğunu bırakınca örnek bir ses çalar. Seçimler cihazda saklanır.
Oyun çalışırken çalar, duraklatınca / oyun bitince durur, yeni oyunda baştan başlar.

- Korobeiniki, 1861 tarihli bir Rus halk şarkısıdır ve melodisi telif dışıdır. Resmî Tetris oyun kaydı veya
  resmî Game Boy düzenlemesi **kullanılmadı**; melodi ve bas çizgisi `tools/make-music.py` içinde notalarla
  yazılıp kodla sentezlenir. (Kulağa tanıdık gelir ama birebir resmî kayıt değildir.)
- Notaları veya temposu değiştirmek için `tools/make-music.py` dosyasını düzenleyip `python3 tools/make-music.py`
  çalıştırın (numpy ve ffmpeg gerekir); `assets/sounds/music-tetris.wav` yeniden üretilir.
- Tarayıcılar sesi ilk dokunuştan önce engelleyebilir; ilk dokunuş/tuşta müzik başlar.

## Uygulama olarak yükleme (PWA)

Site, telefona uygulama gibi kurulabilir. Ana sayfadaki **📲 Uygulamayı yükle** butonu:

- **Android (Chrome/Edge):** tarayıcının yükleme penceresini açar; onaylayınca ana ekrana ikon eklenir.
- **iPhone/iPad (Safari):** Apple tarayıcıdan yüklemeye izin vermediği için adımları gösterir
  (Paylaş ⬆︎ → Ana Ekrana Ekle).
- Zaten kuruluysa (uygulama olarak açıldıysa) buton görünmez.

Kurulan uygulama tam ekran açılır ve ilk açılıştan sonra **internetsiz de çalışır**
(tüm dosyalar önbelleğe alınır). Yeni sürüm yayınlanınca bir sonraki açılışta kendiliğinden güncellenir.

Teknik notlar:
- `public/manifest.json`, `public/icons/`, `public/apple-touch-icon.png`: uygulama adı, renkleri ve ikonları
- `scripts/post-build.js` + `scripts/sw.template.js`: derlemeden sonra servis çalışanını (`sw.js`) üretir ve
  HTML'e manifest/ikon etiketlerini ekler. Bu yüzden web derlemesi için `npm run build:web` kullanılır
  (GitHub iş akışı bunu zaten yapar).
- Bu Expo sürümünde özel bir `src/app/+html.tsx` eklemek stil dosyasını çıktıdan düşürüyor, bu yüzden eklemeyin.
- Geliştirme modunda (`expo start`) servis çalışanı kapalıdır.

## Testler

Oyun mantığını (arayüzsüz) denemek için:

```bash
npx tsx src/games/tetris/logic.test.ts
npx tsx src/lib/volume.test.ts
npx tsx src/games/minesweeper/world.test.ts
npx tsx src/games/minesweeper/geometry.test.ts
```

## Tetris kontrolleri

**Dokunmatik (telefon ve web):**
- Sağa/sola sürükle: parçayı kaydır
- Aşağı sürükle: yumuşak düşür
- Kısa dokun: döndür
- Aşağı hızlı fırlat: anında düşür
- Yukarı hızlı fırlat: parçayı sakla (Tut)
- İstersen ekran butonları da var; ⚙ Ayarlar'dan kapatılabilir

**Web klavyesi:** ← → ↓ hareket, ↑ veya X döndür, Z ters döndür, Boşluk hızlı düşür, C tut, P duraklat

**Diğer:** parça yere değince kısa kilit gecikmesi (kaydırmaya zaman verir), hayalet parça, ses, titreşim,
rekor kaydı (cihazda saklanır), uygulama arka plana geçince otomatik duraklatma.

## Yapı

- `src/app/` ekranlar (Expo Router): `index.tsx` hub, `game/[id].tsx` seçilen oyun
- `src/games/types.ts` ortak oyun arayüzü
- `src/games/registry.ts` tüm oyunların listesi (yeni oyun = yeni klasör + buraya bir kayıt)
- `src/lib/` ortak altyapı: `storage.ts` (kalıcı kayıt), `settings.ts` (ses/titreşim ayarları), `feedback.ts` (ses + titreşim)
- `src/components/SettingsPanel.tsx` ortak ayarlar paneli, `VolumeSlider.tsx` ses düzeyi çubuğu
- `assets/sounds/` ses efektleri ve müzik (kodla üretilmiş `.wav` dosyaları)
- `tools/make-music.py` Tetris müziği üreticisi
- `src/games/tetris/` Tetris: `logic.ts` (saf oyun mantığı), `logic.test.ts` (testler), `TetrisScreen.tsx` (arayüz)
- `src/games/minesweeper/` Sonsuz Mayın Tarlası: `world.ts` (mantık), `geometry.ts` (kamera), `persistence.ts` (kayıt), `MinesweeperScreen.tsx` (arayüz)
- `.github/workflows/deploy.yml` push'ta otomatik web yayını (`npm run build:web`)

## Yol haritası

1. [x] İskelet ve hub
2. [x] Web yayını altyapısı
3. [x] Tetris (hareketler, ses, titreşim, rekor, ayarlar, kilit gecikmesi)
   - [x] Uygulama olarak yükleme (PWA) ve internetsiz çalışma
   - [x] Arka plan müziği (Korobeiniki)
4. [x] Sonsuz Mayın Tarlası (ilk sürüm: sonsuz dünya, bölümler, kayıt, rekor)
   - [ ] Günlük görevler, başarımlar, oyun içi para birimi
5. [ ] Hub cilası (ikonlar, ana ekran ayarları, uygulama adı/ikonu)
6. [ ] Online özellikler (opsiyonel)
