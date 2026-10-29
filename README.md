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
- `src/components/SettingsPanel.tsx` ortak ayarlar paneli
- `assets/sounds/` ses efektleri (kodla üretilmiş kısa `.wav` dosyaları)
- `src/games/tetris/` Tetris: `logic.ts` (saf oyun mantığı), `logic.test.ts` (testler), `TetrisScreen.tsx` (arayüz)
- `src/games/minesweeper/` Mayın Tarlası (şu an yer tutucu)
- `.github/workflows/deploy.yml` push'ta otomatik web yayını (`npm run build:web`)

## Yol haritası

1. [x] İskelet ve hub
2. [x] Web yayını altyapısı
3. [x] Tetris (hareketler, ses, titreşim, rekor, ayarlar, kilit gecikmesi)
   - [x] Uygulama olarak yükleme (PWA) ve internetsiz çalışma
4. [ ] Mayın Tarlası
5. [ ] Hub cilası (ikonlar, ana ekran ayarları, uygulama adı/ikonu)
6. [ ] Online özellikler (opsiyonel)
