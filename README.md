# Hatim Takip Sistemi

Toplu Kuran-ı Kerim hatmi için sade bir web uygulaması. Herkes okuduğu cüzü/sayfayı işaretler, tüm katılımcılar anlık olarak toplu ilerlemeyi görür. Günlük Excel raporu indirilebilir.

**Özellikler**

- Cüz (1–30) ve sayfa (1–604) bazında okuma kaydı
- Anlık paylaşımlı veri (Firebase Firestore)
- Hicri + Miladi tarih + canlı saat
- Kişiye ve cüze göre ilerleme özetleri
- Excel (XLSX) dışa aktarma — 4 sayfalı rapor (Tüm Kayıtlar / Kişi Bazlı / Cüz Bazlı / Günlük Döküm)
- GitHub Pages ile ücretsiz 7/24 yayın
- Mobil uyumlu sade arayüz

---

## Hızlı Başlangıç — 3 Aşama

### Aşama 1 · Firebase projesini kur (≈ 5 dakika)

1. https://console.firebase.google.com adresine Google hesabınla giriş yap.
2. **"Proje ekle"** → isim ver (örn. `hatim-takip`) → "Devam" → Google Analytics'i KAPAT → "Proje oluştur".
3. Sol menüden **"Build → Firestore Database"** → **"Veritabanı oluştur"**.
   - Konum: `eur3 (europe-west)` seçebilirsin.
   - Mod: **"Test modunda başlat"** → "Etkinleştir". (30 gün boyunca herkese açık. Sonrasında kuralları değiştireceğiz — aşağıda var.)
4. Ana sayfaya dön → dişli çark (⚙) → **"Proje ayarları"**.
5. Aşağı in → **"Uygulamalarınız"** → **`</>` web simgesine** tıkla.
6. Uygulama takma adı ver (örn. `hatim-web`) → "Uygulamayı kaydet".
7. Sana şöyle bir kod bloğu gösterecek:

   ```js
   const firebaseConfig = {
       apiKey: "AIza...",
       authDomain: "xxx.firebaseapp.com",
       projectId: "xxx",
       storageBucket: "xxx.appspot.com",
       messagingSenderId: "1234...",
       appId: "1:1234:web:..."
   };
   ```

8. Bu değerleri **`firebase-config.js`** dosyasına yapıştır. `export const firebaseConfig = { ... }` içindeki alanları doldur.

**Güvenlik kuralları (önemli)** — 30 gün sonra test modu kapanır. Kalıcı kural için Firestore → **"Kurallar"** sekmesine git ve şunu yapıştır:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /hatim_kayitlar/{docId} {
      allow read: if true;
      allow create: if request.resource.data.keys().hasAll(['name','juz','page'])
                    && request.resource.data.name is string
                    && request.resource.data.name.size() > 0
                    && request.resource.data.juz is number
                    && request.resource.data.page is number
                    && request.resource.data.page >= 1
                    && request.resource.data.page <= 604;
      allow update: if false;
      allow delete: if true;
    }
  }
}
```

> Not: Bu kurallar herkesin kayıt eklemesine ve silmesine izin verir (güven bazlı). Daha sıkı istersen "İsim + PIN" moduna geçebiliriz.

---

### Aşama 2 · GitHub'a yükle ve Pages ile yayınla

1. https://github.com adresinde yeni repo oluştur: **"New repository"** → isim: `hatim-takip` → **Public** → "Create repository".
2. Terminalde bu klasöre gir:

   ```bash
   cd hatim-takip
   git init
   git add .
   git commit -m "Initial commit — Hatim Takip"
   git branch -M main
   git remote add origin https://github.com/KULLANICI-ADIN/hatim-takip.git
   git push -u origin main
   ```

3. Repo sayfasında **"Settings" → "Pages"** menüsüne git.
4. **Source** altında **"Deploy from a branch"** → Branch: **`main`** / Folder: **`/ (root)`** → "Save".
5. 1–2 dakika sonra sayfayı yenile. Şu adres verilecek:

   ```
   https://KULLANICI-ADIN.github.io/hatim-takip/
   ```

6. Bu bağlantıyı arkadaşlarınla paylaş. 🎉 **Site artık 7/24 çevrimiçi.**

---

### Aşama 3 · Yerel (localhost) çalıştırma

`file://` ile açarsan Firebase modül import'ları CORS hatası verir. Bu yüzden küçük bir yerel sunucu gerekir:

**Python (önerilen, zaten kurulu):**
```bash
cd hatim-takip
python3 -m http.server 8000
```
Sonra tarayıcıda: http://localhost:8000

**Node varsa:**
```bash
npx serve .
```

**VS Code kullanıyorsan:** "Live Server" eklentisi tek tıkla açar.

---

## Kullanım

1. Siteye gir.
2. **İsim** kutusuna adını yaz (ilk girişten sonra tarayıcı hatırlar).
3. **Cüz** seç → o cüzün sayfaları gelir.
4. **Sayfa** seç → **"Tamam — Okuduğumu Kaydet"** butonuna bas.
5. Altta herkesin okuma geçmişi gerçek zamanlı güncellenir.
6. İstediğin zaman **"Excel İndir"** butonuyla rapor al.

---

## Excel Raporu — İçerik

İndirilen `hatim-takip-YYYY-MM-DD.xlsx` dosyasında 4 sayfa vardır:

| Sayfa | İçerik |
|---|---|
| **Tüm Kayıtlar** | Her bir okuma kaydı — kim, hangi cüz, hangi sayfa, ne zaman (miladi+hicri+saat) |
| **Kişi Bazlı** | Her kişinin okuduğu toplam sayfa sayısı ve listesi |
| **Cüz Bazlı** | Her cüzdeki ilerleme ve kim okumuş |
| **Günlük Döküm** | Tarihe göre sıralı takip — günlük rapor için birebir |

---

## Sık Sorulanlar

**S: Aynı sayfa iki kişi tarafından okunursa?**  
Her ikisi de kayıtlı tutulur. İlerleme çubuğu ise "benzersiz okunan sayfa" üzerinden hesaplanır; böylece hatim bir kez tamamlanır.

**S: Yanlış giriş yaptım, silebilir miyim?**  
Evet. Geçmiş tablosundaki her satırda **"Sil"** butonu var.

**S: Firebase ücretli mi?**  
Hayır, Spark (ücretsiz) planı küçük-orta kullanım için fazlasıyla yeterli (aylık 50.000 okuma / 20.000 yazma).

**S: Siteye özel domain bağlamak istiyorum ileride?**  
GitHub Pages → Settings → Pages → "Custom domain" alanına yazabilirsin. Zorunlu değil, `github.io` adresi işini görür.

**S: Kod içinde Firebase API key herkese açık — tehlikeli mi?**  
Hayır. Firebase web API key'i zaten istemci tarafı içindir. Asıl güvenlik **Firestore Kuralları** ile sağlanır (yukarıda verildi).

---

## Dosya Yapısı

```
hatim-takip/
├── index.html          # Ana sayfa
├── styles.css          # Tasarım
├── app.js              # Tüm uygulama mantığı (ES module)
├── firebase-config.js  # Firebase ayarları (SEN DOLDURACAKSIN)
├── .gitignore
└── README.md           # Bu dosya
```

---

## Sorun Giderme

- **Konsol hatası: "Cannot use import statement outside a module"** → `file://` ile açmışsın. `python3 -m http.server 8000` ile aç.
- **"Missing or insufficient permissions"** → Firestore kuralları test modunda değil. Yukarıdaki kuralları yapıştır.
- **Hicri tarih görünmüyor** → Çok eski tarayıcı. Chrome/Firefox/Safari güncelleyin.
- **Site yayına çıkmıyor** → GitHub Pages Settings'te branch'in `main` / `/ (root)` olduğundan emin ol, 2-3 dk bekle.

---

İyi hatimler. 🤲
