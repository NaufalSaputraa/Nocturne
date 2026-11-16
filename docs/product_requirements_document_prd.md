# Product Requirements Document (PRD): Nocturne

**Versi:** 1.1  
**Tanggal:** November 2026  
**Target Platform:** Desktop (Windows 11 v1 Deliverable; kode Rust/Tauri portabel untuk Linux & macOS)  
**Tech Stack:** Rust + Tauri v2 + React + TypeScript + Tailwind CSS  

---

## 1. Visi & Latar Belakang Produk
**Nocturne** adalah aplikasi pemutar musik desktop modern yang dirancang untuk memutar katalog audio dari YouTube Music secara bebas iklan (*ad-free*), ringan, dan terintegrasi penuh dengan sistem operasi desktop. Aplikasi ini menggabungkan kecepatan *native backend* Rust dengan antarmuka pengguna bergaya studio modern (*Warm Dark Charcoal*), dilengkapi fitur lirik karaoke interaktif per huruf pada kecepatan *refresh rate* layar (60–144fps).

### Tujuan Utama
1. **Bebas Gangguan:** Pemutaran audio stream langsung tanpa iklan video/audio dan tanpa beban memori browser.
2. **Performa Native & Zero-Lag:** Mulai lagu pertama instan (`< 250 ms`) via `rustypipe` native, transisi antar lagu tanpa jeda (`< 200 ms` via *pre-fetch*), kontrol media fisik OS, dan konsumsi RAM minimal (`< 180 MB`).
3. **Pengalaman Imersif & Kontinuitas:** Antarmuka bersih berstandar emas industri dengan mode fokus lirik interaktif, *Endless Queue / Auto-Radio*, *Cold-Start Session Restore* (`< 100 ms`), dukungan *offline*, dan sinkronisasi dua arah opsional dengan akun YouTube Music.

---

## 2. Target Pengguna & Persona
* **Developer / Pekerja Kreatif:** Mendengarkan musik saat bekerja/coding dalam waktu lama, membutuhkan mode gelap ramah mata, *keyboard shortcuts* (`Ctrl+K`), *system tray*, serta integrasi *Discord Rich Presence*.
* **Penikmat Musik Desktop:** Menginginkan antarmuka setara Apple Music / Tidal dengan pencarian katalog YouTube Music yang luas, lirik tersinkronisasi akurat, pengunduhan *offline*, dan manajemen *playlist* lokal maupun akun YTM.

---

## 3. Ruang Lingkup Fitur (Functional Requirements)

### P0 — Fitur Inti (MVP)
| ID | Fitur | Deskripsi & Kriteria Penerimaan |
| :--- | :--- | :--- |
| **FR-01** | **Pencarian Katalog Musik** | Pengguna dapat mencari lagu, artis, album, atau menempelkan URL YouTube langsung melalui *centered search bar* (`Ctrl+K`). Hasil terbagi menjadi *Top Result*, *Songs*, *Albums*, dan *Artists* (klik artis membuka hasil filter artis). |
| **FR-02** | **Ad-Free Audio Streaming (Dual-Tier)** | Mengekstrak *direct audio stream* (`Opus/WebM` atau `M4A`) menggunakan **`rustypipe` native sebagai ekstraktor utama** (`< 250 ms`) dengan *sidecar* `yt-dlp` sebagai *fallback* otomatis, dan memutarnya via *audio engine* tunggal `libmpv2` (gapless + sequential fade) tanpa iklan. |
| **FR-03** | **Kontrol Pemutaran & Session Restore** | Mendukung *Play/Pause*, *Next*, *Previous*, *Shuffle*, *Repeat*, volume, *seek bar*, dan **Instant Cold-Start Session Restore** (`< 100 ms` memulihkan lagu, posisi detik, antrean, dan pengaturan terakhir dari SQLite saat aplikasi dibuka ulang). |
| **FR-04** | **Manajemen Antrean & Auto-Radio** | Panel kanan menampilkan lagu aktif, daftar *Next in Queue* yang dapat diatur ulang atau dihapus, serta tombol toggle **Autoplay (Endless Queue / Auto-Radio)** yang otomatis menarik lagu terkait dari `rustypipe` saat antrean hampir habis. |
| **FR-05** | **Custom Windows 11 Titlebar** | Jendela *frameless* dengan tombol kontrol *Minimize*, *Maximize*, dan *Close* native Windows 11 di pojok kanan atas. |

### P1 — Fitur Pengalaman Lanjutan (High Craft)
| ID | Fitur | Deskripsi & Kriteria Penerimaan |
| :--- | :--- | :--- |
| **FR-06** | **Zen Focus Lyrics Mode** | Tampilan layar penuh 2 kolom: piringan vinyl dengan *circular radial seek ring* di kiri, *subtle ambient artwork glow* (`opacity: 0.12`, `blur(96px)`) di belakang piringan, kontrol *Lyric Offset* (`± ms`) per lagu, serta lirik tersinkronisasi di kanan. |
| **FR-07** | **Character-by-Character Karaoke Lyrics (60–144fps)** | Backend mengirim `playback-sync` setiap `500 ms` (+ seketika saat transisi status); Frontend melakukan interpolasi lokal dengan `requestAnimationFrame` + `performance.now()`. Setiap huruf menyala (*soft glow*) dan mengembang halus dengan batas kecepatan sapuan (`Math.min(totalDuration * 0.88, text.length * 90)` ms), didukung *fallback* lirik bawaan YouTube Music bila LRCLIB tidak tersedia. |
| **FR-08** | **OS Media Controls & Discord RPC** | Muncul di *Windows Media Overlay* (SMTC via `souvlaki`) lengkap dengan *album art* dan tombol media fisik/Bluetooth, serta integrasi opsional **Discord Rich Presence** (`discord-rich-presence`). |
| **FR-09** | **Hybrid Library & Two-Way YTM Sync** | Bekerja 100% lokal (SQLite) tanpa login; jika login akun YTM (opsional), *Liked Songs* lokal digabung dan di-*push* ke YTM, serta mendukung CRUD penuh playlist YTM (buat, ubah nama, hapus, tambah/hapus lagu) dengan *two-way sync* dan *fallback* aman saat sesi kedaluwarsa. |

### P2 — Utilitas, Offline & Pengaturan
| ID | Fitur | Deskripsi & Kriteria Penerimaan |
| :--- | :--- | :--- |
| **FR-10** | **Pre-fetch, URL Cache & LRU Stream Cache** | Otomatis mengambil *stream URL* lagu berikutnya 15 detik sebelum lagu selesai (cache URL TTL `5.5 jam`), serta **Automatic Offline Stream Cache (LRU)** hingga batas ukuran tertentu agar lagu yang diputar ulang mulai seketika. |
| **FR-11** | **Download for Offline** | Tombol unduh per lagu maupun per playlist lengkap dengan indikator progres (*download-progress*), indeks SQLite, serta tab/filter **Offline** di UI untuk pemutaran penuh tanpa koneksi internet. |
| **FR-12** | **Settings & Engine Updater** | Modal pengaturan untuk memilih kualitas audio (`Opus 160kbps`), **Normalize Volume berbasis metadata `perceptualLoudnessDb`**, durasi *Crossfade*, batas & lokasi LRU Cache, folder *Offline Downloads*, toggle Discord Rich Presence, koneksi akun YTM, dan tombol *Check for Updates* untuk *fallback* `yt-dlp`. |

---

## 4. Kebutuhan Non-Fungsional (Non-Functional Requirements)
* **Latensi Pencarian & Start Lagu:** Hasil pencarian muncul dalam `< 400 ms`; ekstraksi stream lagu pertama via `rustypipe` native `< 250 ms`.
* **Transisi Lagu:** Pergantian lagu berurutan di *queue* memiliki jeda `< 200 ms` berkat mekanisme *pre-fetch*.
* **Sinkronisasi & Efisiensi IPC:** Event `playback-sync` dari Rust ke Frontend dikirim setiap `500 ms` (plus saat transisi `play/pause/seek/track-changed`), mengurangi trafik IPC ~95% sambil mempertahankan animasi lirik **60–144fps** via `requestAnimationFrame`.
* **Cold-Start Session Restore:** Pemulihan lagu terakhir, posisi waktu, dan antrean dari SQLite selesai dalam `< 100 ms`.
* **Konsumsi Sumber Daya:** Penggunaan RAM idle/playback di bawah `180 MB` (jauh lebih ringan dibanding klien berbasis Electron/Chrome).

---

## 5. Rencana Fase Pengembangan (Roadmap)
1. **Fase 1 (Foundation & UI Shell):** Setup proyek Tauri v2 + React + Tailwind, implementasi 5 layar UI, dan *custom titlebar* Windows 11.
2. **Fase 2 (Core Audio Pipeline & Caching):** Integrasi `rustypipe` primary + `yt-dlp` fallback, instance tunggal `libmpv2` (dengan `perceptualLoudnessDb` pre-amp & sequential crossfade), *mpsc worker thread*, URL cache (`5.5 jam`), LRU stream cache, serta `playback-sync` 500ms + `requestAnimationFrame`.
3. **Fase 3 (Search, Hybrid Sync, Offline & OS Integration):** Koneksi `rustypipe` untuk pencarian/Auto-Radio, SQLite (`sqlx`) untuk hybrid local + YTM *two-way sync*, *Session Restore*, *Download for Offline*, `souvlaki` SMTC, dan `discord-rich-presence`.
4. **Fase 4 (Zen Lyrics & Polish):** Integrasi API LRCLIB + *fallback* lirik YTM, `InteractiveLyricLine` dengan *sweep cap* & `lyric_offset_ms`, *ambient artwork glow* khusus Zen Mode, serta *testing* dan *bundling installer* `.msi` / `.exe`.
