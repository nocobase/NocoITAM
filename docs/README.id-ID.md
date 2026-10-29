<h1 align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="images/nocoitam-logo-dark.svg">
    <img src="images/nocoitam-logo.svg" width="240" alt="NocoITAM">
  </picture>
</h1>

<p align="center"><strong>Agen yang urus. Aset TI tetap rapi.</strong></p>

<p align="center">Manajemen aset TI open source · Dibangun di atas NocoBase</p>

<p align="center">
  <a href="../LICENSE"><img src="https://img.shields.io/badge/license-Apache--2.0-blue" alt="Apache-2.0"></a>
  <a href="https://github.com/nocobase/NocoITAM/tags"><img src="https://img.shields.io/github/v/tag/nocobase/NocoITAM?label=version&sort=semver&include_prereleases" alt="version"></a>
  <a href="https://www.nocobase.com"><img src="https://img.shields.io/badge/built%20on-NocoBase-1f6feb" alt="Built on NocoBase"></a>
</p>

<p align="center">
  <a href="https://solutions.nocobase.com/itam/"><strong>Coba online</strong></a> · <a href="https://www.nocobase.com/id-ID/solution-itam/">Situs web</a>
</p>

<p align="center">
  <a href="../README.MD">English</a> · <a href="README.zh-CN.md">简体中文</a> · <a href="README.zh-TW.md">繁體中文</a> · <a href="README.ja-JP.md">日本語</a> · <a href="README.ko-KR.md">한국어</a> · <a href="README.de-DE.md">Deutsch</a> · <a href="README.fr-FR.md">Français</a> · <a href="README.es-ES.md">Español</a> · <a href="README.pt-BR.md">Português</a> · <a href="README.ru-RU.md">Русский</a> · <strong>Bahasa Indonesia</strong> · <a href="README.vi-VN.md">Tiếng Việt</a>
</p>

NocoITAM adalah sistem manajemen aset TI open source yang dibangun di atas [NocoBase](https://www.nocobase.com). Alat ITAM tradisional hanyalah catatan yang diisi manual. Di NocoITAM, agen merapikan selisih MDM, menyiapkan perlengkapan karyawan baru, dan memeriksa stok serta aset tak terpakai sebelum setiap pembelian. Setiap perangkat, seat, dan pengeluaran tercatat.

https://github.com/user-attachments/assets/a33c08b7-b2bb-4834-b222-8d5c95134915

## Fitur

- **Setiap pembelian cek stok dulu.** Saat pesanan dikirim untuk persetujuan, asisten persetujuan memeriksa apakah stok atau perangkat tak terpakai bisa memenuhinya, membandingkan harga sebelumnya dan permintaan serupa, lalu menyusun draf keputusan dan komentar untuk pemberi persetujuan.
- **Karyawan baru siap di hari pertama.** Setiap departemen dan setiap jabatan punya paket onboarding. Rencana karyawan baru diambil dari stok, seat tak terpakai, pesanan yang sedang dikirim, dan barang yang dikembalikan karyawan keluar; AI memilih perangkat beserta alasannya, dan pesanan yang masih kurang dibuat dengan satu klik.
- **Yang keluar mengembalikan semuanya.** Perangkat, aksesori, dan seat karyawan yang keluar dilacak sampai semuanya kembali, catatan yang dipegangnya diserahterimakan, dan akses masuknya dinonaktifkan di hari terakhir.
- **Selisih MDM menjadi rencana.** Microsoft Intune dan Jamf Pro disinkronkan setiap malam dan dicocokkan berdasarkan nomor seri. Agen memilah yang tidak cocok: pengguna yang berbeda diteruskan ke penanggung jawab perangkat, perangkat yang belum terdaftar ke pengelola aset, dan kasus yang meragukan ke manusia.
- **Pencatatan pintar.** Tempel atau seret penawaran, faktur, atau surat jalan: AI mengisi pesanan dengan item yang dicocokkan ke model Anda, memeriksa pengiriman terhadap pesanan (jumlah, nomor seri, garansi), dan membaca laporan perbaikan serta sertifikat pelepasan. Spesifikasi model baru dilengkapi dari web.
- **3 agen, dan AI di tempat pekerjaan dilakukan.** Penjaga Aset menjawab di setiap halaman dari catatan yang boleh Anda baca dan mengusulkan rencana yang Anda konfirmasi di sebuah kartu. Asisten persetujuan dan tindak lanjut MDM bekerja di latar belakang, dan AI membantu di 11 tempat, dari penerimaan barang hingga membandingkan penawaran perbaikan dengan mengganti perangkat. Agen menyarankan, manusia memutuskan.
- **Lisensi dan langganan terkendali.** Per pengguna, per perangkat, situs, atau gratis, dengan seat, kunci, dan tanggal perpanjangan. Kepatuhan dihitung ulang setiap kali seat berubah, dan seat yang berlebih atau menganggur ditandai sebelum perpanjangan.
- **Tidak ada yang terlewat.** Halaman tugas dibuka dengan 14 pemeriksaan risiko (garansi dan langganan yang akan berakhir, seat menganggur, stok di bawah minimum, perangkat yang setahun tidak diperiksa), lalu pekerjaan tim dalam kolom: persetujuan, karyawan masuk dan keluar, pesanan, perbaikan, pelepasan, dan stock opname.
- **Satu register untuk semua milik TI.** Perangkat, aksesori, barang habis pakai, komponen, dan hak penggunaan perangkat lunak, dari pembelian, penerimaan, penugasan, dan peminjaman hingga perbaikan, stock opname, dan pelepasan, setiap catatan dengan riwayatnya. 10 laporan, impor dan ekspor CSV, dan pencarian di semua catatan (⌘K / Ctrl+K).
- **Dapat disesuaikan.** Tuliskan paket standar, anggaran, dan aturan persetujuan dalam bahasa biasa sebagai panduan bisnis, dan setiap agen mengikutinya; metode setiap agen adalah skill yang bisa Anda ubah. Kode sumbernya terbuka, jadi agen pemrograman bisa mengubah sisanya.
- **Di-host sendiri.** Data tetap di server Anda, dengan model pilihan Anda: DeepSeek, OpenAI, Claude, Gemini, Qwen, dan lainnya. 12 bahasa antarmuka. Apache-2.0.

## Mulai cepat

Hanya ingin melihat-lihat? [Coba online](https://solutions.nocobase.com/itam/): Anda langsung masuk dengan akun demo, dan semua datanya fiktif.

### 1. Instal

**Dengan agen pemrograman.** Cara termudah. Buka Claude Code, Codex, atau Cursor di folder tempat NocoITAM akan disimpan, lalu berikan ini:

```text
Instal NocoITAM dari https://github.com/nocobase/NocoITAM dan jalankan, dengan mengikuti AGENTS.md dan README repositori.
```

**Secara manual.** Anda memerlukan Node.js 24 atau lebih baru dan pnpm 10 (`corepack enable`). Data secara bawaan disimpan dalam file SQLite; PostgreSQL dan MySQL juga bisa dipakai.

```bash
git clone https://github.com/nocobase/NocoITAM.git
cd NocoITAM
pnpm install
pnpm nocobase config init --dialect sqlite
pnpm dev
```

### 2. Masuk

Buka alamat `Local:` yang ditampilkan `pnpm dev`, biasanya `http://127.0.0.1:13000/main/`, lalu masuk sebagai `nocobase` dengan kata sandi `admin123`.

### 3. Impor data demo

Banner di bagian atas menawarkannya, atau buka **Pengaturan → Data demo**. Data ini membawa perusahaan sekitar empat puluh orang beserta perangkat, stok, dan lisensinya, pesanan, perbaikan, stock opname, dan pelepasan, serta platform Intune dan Jamf demo; hapus di sana saat Anda mulai sungguhan.

### 4. Siapkan model AI

Tambahkan layanan model beserta kuncinya di **Tim agen → Model**, misalnya DeepSeek, OpenAI, Claude, Gemini, atau Qwen. Penjaga Aset dan para agen memerlukannya; fitur lainnya berjalan tanpanya.

[Panduan](guide.md) (bahasa Inggris) membahas langkah selanjutnya, akun demo, peran, agen, konfigurasi (AI, MDM, basis data), deployment, dan pengembangan.

Untuk produksi, lihat [Deployment](guide.md#deployment); untuk PostgreSQL dan MySQL, lihat [Konfigurasi](guide.md#configuration).

## Lisensi

NocoITAM dibangun di atas NocoBase dan dirilis dengan lisensi [Apache-2.0](../LICENSE).
