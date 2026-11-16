# UI/UX Design System & Interactive Lyrics Specification

Dokumen ini mengunci aturan desain visual, tipografi, tata letak, dan implementasi komponen lirik interaktif per huruf untuk **Nocturne** agar terhindar dari tampilan generik (*anti-AI slop*) dan menjaga konsistensi standar industri.

---

## 1. Palet Warna (Aturan 60-30-10 Warm Dark Charcoal)

| Peran Warna | Token CSS | Hex / RGBA | Penggunaan |
| :--- | :--- | :--- | :--- |
| **60% Primary Canvas** | `--bg-canvas` | `#121212` | Latar belakang utama area konten tengah dan dasar *Zen Mode*. |
| **30% Elevated Surface** | `--bg-surface` | `#18181B` | *Sidebar* kiri, panel *Queue* kanan, *Bottom Player Dock*, dan kartu. |
| **Interactive Hover / Input** | `--bg-elevated` | `#222226` | *Search bar*, status *hover* baris tabel, dan *tab* aktif. |
| **Hairline Border** | `--border-subtle` | `#27272A` | Pembatas panel `1px solid` (menggantikan *drop-shadow* berat). |
| **10% Primary Accent** | `--accent-white` | `#FFFFFF` | Tombol CTA utama (`Play All`), tombol `Play/Pause`, teks lirik aktif. |
| **10% Status Accent** | `--accent-coral` | `#F43F5E` | Ikon *Liked Heart*, *equalizer* lagu aktif, indikator *Repeat*, garis progres radial. |
| **Primary Text** | `--text-primary` | `#FAFAFA` | Judul lagu, judul halaman, label navigasi aktif. |
| **Secondary Text** | `--text-secondary` | `#A1A1AA` | Nama artis, nama album, subjudul. |
| **Muted Metadata** | `--text-muted` | `#71717A` | Durasi lagu, label kategori sidebar, baris lirik tidak aktif. |

---

## 2. Tipografi & Aturan Layout

* **Font Family:** `'Inter', 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, sans-serif` (Dilarang menggunakan font *serif* atau dekoratif).
* **Tabular Numbers:** Wajib menerapkan `font-variant-numeric: tabular-nums;` (`tabular-nums` di Tailwind) pada seluruh angka durasi lagu (`03:42`) dan *timestamp* pemutar agar rata lurus secara vertikal.
* **Single-Line Controls:** Seluruh *pill button*, *badge* (`CTRL K`), dan header kolom (`DATE ADDED`) wajib menggunakan `whitespace-nowrap` agar teks tidak terpotong ke baris kedua.
* **Rasio Cover Art:** Semua gambar *thumbnail* YouTube menggunakan `aspect-square object-cover` dengan sudut membulat `6px` (`rounded-md`) di tabel, `12px` (`rounded-xl`) di *banner/panel*, dan `full` (`rounded-full`) untuk profil artis serta piringan *Zen Mode*.

---

## 3. Spesifikasi 5 Layar Utama + Panel & Modal

1. **Top Global Header (64px):**
   * Kiri: Logo geometris + teks `"Nocturne"` + tombol navigasi `<` `>`.
   * Tengah: *Search pill bar* lebar (`480px`) dengan pintasan `CTRL K`.
   * Kanan: Ikon *Settings* (gerigi), Avatar profil / status koneksi YTM, dan tombol kontrol jendela Windows 11 (`Minimize`, `Maximize`, `Close`).
2. **Home / Dashboard View:**
   * *Filter pills* (`All`, `Songs`, `Albums`, `Playlists`, `Offline`), *Featured Editorial Banner* dengan tombol putih `Play All`, dan tabel daftar lagu dengan tinggi baris `52px` di atas kanvas `#121212` bersih.
3. **Search Results View:**
   * Grid atas terbagi 2: **Top Result Card** (40% kiri, foto artis bulat `96px` + tombol *Play* putih) dan **Songs List** (60% kanan, 4 lagu teratas), diikuti *carousel* horizontal **Albums** dan **Artists** (klik artis menampilkan hasil filter artis di dalam `SearchView`).
4. **Playlist / Album Detail View:**
   * *Header* horizontal (`176x176px` *cover art*, judul `36px Bold`, deskripsi, tombol putih `Play All`, `Shuffle`, serta tombol `Download All` dengan progres), kotak pencarian lokal `Find in playlist...`, dukungan buat/ubah nama/hapus playlist YTM maupun lokal, serta tabel lagu dengan kolom `DATE ADDED` dan indikator status unduhan *Offline*.
5. **Zen & Synced Lyrics Mode (`Focus View`):**
   * *Header* minimal dengan tombol `← Back to Library`, kontrol penyesuaian sinkronisasi lirik **Lyric Offset (`-100ms` / `0ms` / `+100ms`)**, dan status `YouTube Audio • Ad-Free`.
   * Kiri (45%): Piringan album melingkar (`280px`) dikelilingi *SVG Circular Radial Seek Ring* (`#F43F5E`) tanpa *progress bar* linear ganda di bawahnya, dilengkapi **Subtle Ambient Artwork Glow** khusus di *Zen Mode* berupa bias radial warna dominan *cover art* (`opacity: 0.12`, `blur(96px)`) di belakang piringan vinyl, serta 3 kartu mini *Up Next*.
   * Kanan (55%): Panggung lirik interaktif dengan *auto-scroll* halus ke tengah layar.
6. **Right Panel & Settings Modal:**
   * *Right Panel:* Tab *Queue* dilengkapi toggle **Autoplay (Auto-Radio)** dan tab *Mini Lyrics*.
   * *Settings Modal:* Kualitas audio (`Opus 160kbps`), *Normalize Volume* (berbasis `perceptualLoudnessDb`), durasi *Crossfade*, batas ukuran & lokasi *LRU Stream Cache*, folder *Offline Downloads*, toggle *Discord Rich Presence*, akun YouTube Music (*Connect / Sync / Disconnect*), dan tombol *Check for Updates* untuk `yt-dlp`.

---

## 4. Spesifikasi Lirik Menyala Mengembang Per Huruf (60–144fps)

Efek karaoke interaktif tidak lagi bergantung pada event IPC 30 Hz. Backend Rust mengirim `playback-sync` setiap `500 ms` (dan seketika saat `play`, `pause`, `seek`, `buffering`, atau `track-changed`), lalu Frontend menginterpolasi `currentTimeMs` secara lokal menggunakan `requestAnimationFrame` + `performance.now()` (`usePlaybackClock`) agar mulus mengikuti *refresh rate* monitor (60–144fps) dengan trafik IPC ~95% lebih rendah. Saat menerima `playback-sync` berstatus `is_buffering: true` atau setelah `seek_to`, anchor waktu (`lastSyncServerMs` dan `lastSyncPerfNow`) langsung di-reset, dan interpolasi dibekukan ketika `is_playing: false` atau `is_buffering: true` agar lirik tidak melaju selama *pause* atau *buffering*.

1. **Distribusi Waktu & Batas Kecepatan Sapuan:** Durasi aktif baris dibatasi oleh `Math.min(totalDuration * 0.88, text.length * 90)` ms. Dengan batas maksimal `90 ms` per karakter, baris lirik pendek sebelum *interlude* panjang tetap menyala sesuai ritme vokal normal lalu diam hingga baris berikutnya.
2. **Sumber Lirik & Offset:** Mengutamakan timestamp LRC dari LRCLIB dengan *fallback* ke lirik bawaan YouTube Music (`rustypipe`), lalu menjumlahkan `lyricOffsetMs` per lagu yang tersimpan di SQLite.
3. **Kurva Animasi Sinus (`Math.sin(progress * Math.PI)`):**
   * Saat huruf mulai dinyanyikan (`progress` $0 \rightarrow 0.5$), huruf membesar hingga `scale(1.14)` dan terangkat `-2.5px` (`translateY`) disertai cahaya putih lembut (`text-shadow`).
   * Saat huruf selesai dinyanyikan (`progress` $0.5 \rightarrow 1.0$), ukuran kembali mendarat halus ke `scale(1.0)` dengan warna tetap putih terang (`#FFFFFF`).
4. **Word-Safe Wrapping:** Karakter dibungkus per kata (`inline-flex`) sehingga baris panjang yang turun ke baris baru tidak pernah memotong satu kata di tengah-tengah.

### Kode Komponen (`src/components/lyrics/InteractiveLyricLine.tsx`)

```tsx
import React, { useMemo } from 'react';

export interface InteractiveLyricLineProps {
  text: string;
  startTimeMs: number;
  endTimeMs: number;
  currentTimeMs: number;
  isActive: boolean;
  isPast: boolean;
  onClickLine?: (timeMs: number) => void;
}

export const InteractiveLyricLine: React.FC<InteractiveLyricLineProps> = ({
  text,
  startTimeMs,
  endTimeMs,
  currentTimeMs,
  isActive,
  isPast,
  onClickLine,
}) => {
  const words = useMemo(() => {
    const totalChars = Math.max(text.length, 1);
    const totalDuration = Math.max(endTimeMs - startTimeMs, 200);
    const activeSweepDuration = Math.min(totalDuration * 0.88, text.length * 90);

    let globalCharIndex = 0;
    return text.split(' ').map((word) => {
      const chars = word.split('').map((char) => {
        const charStart =
          startTimeMs + (globalCharIndex / totalChars) * activeSweepDuration;
        const charEnd =
          startTimeMs +
          ((globalCharIndex + 1.8) / totalChars) * activeSweepDuration;
        globalCharIndex++;
        return { char, charStart, charEnd };
      });
      globalCharIndex++; // Hitung spasi antar kata
      return chars;
    });
  }, [text, startTimeMs, endTimeMs]);

  return (
    <div
      onClick={() => onClickLine?.(startTimeMs)}
      className={`cursor-pointer select-none transition-all duration-500 ease-out py-2.5 px-4 rounded-xl ${
        isActive
          ? 'opacity-100 scale-[1.02] origin-left'
          : isPast
          ? 'opacity-40 hover:opacity-70'
          : 'opacity-30 hover:opacity-65'
      }`}
    >
      <p className="text-[28px] leading-[1.45] font-bold tracking-tight flex flex-wrap gap-x-[0.28em]">
        {words.map((wordChars, wIdx) => (
          <span key={wIdx} className="inline-flex">
            {wordChars.map((item, cIdx) => {
              let progress = 0;
              if (isPast) {
                progress = 1;
              } else if (isActive) {
                const raw =
                  (currentTimeMs - item.charStart) /
                  Math.max(item.charEnd - item.charStart, 1);
                progress = Math.min(Math.max(raw, 0), 1);
              }

              // Kurva lonceng (mengembang saat disapu, lalu relaks kembali)
              const popCurve = Math.sin(progress * Math.PI);
              const scale = isActive ? 1 + popCurve * 0.14 : 1;
              const translateY = isActive ? -popCurve * 2.5 : 0;

              return (
                <span
                  key={cIdx}
                  style={{
                    transform: `translate3d(0, ${translateY.toFixed(
                      2
                    )}px, 0) scale(${scale.toFixed(3)})`,
                    color:
                      progress > 0.15
                        ? `rgba(255, 255, 255, ${0.45 + progress * 0.55})`
                        : 'rgba(161, 161, 170, 0.45)',
                    textShadow:
                      isActive && popCurve > 0.1
                        ? `0 0 ${(popCurve * 18).toFixed(
                            1
                          )}px rgba(255, 255, 255, ${(popCurve * 0.55).toFixed(
                            2
                          )})`
                        : 'none',
                  }}
                  className="inline-block will-change-transform transition-[color] duration-75"
                >
                  {item.char}
                </span>
              );
            })}
          </span>
        ))}
      </p>
    </div>
  );
};
```
