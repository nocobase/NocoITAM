# NocoITAM

[English](../README.MD) | [简体中文](README.zh-CN.md) | [繁體中文](README.zh-TW.md) | [日本語](README.ja-JP.md) | [한국어](README.ko-KR.md) | [Deutsch](README.de-DE.md) | [Français](README.fr-FR.md) | [Español](README.es-ES.md) | [Português](README.pt-BR.md) | [Русский](README.ru-RU.md) | Bahasa Indonesia | [Tiếng Việt](README.vi-VN.md)

NocoITAM adalah sistem manajemen aset TI open source yang dibangun di atas [NocoBase 3](https://www.nocobase.com). Alat ITAM tradisional hanyalah catatan yang diisi manual. Di NocoITAM, agen merapikan selisih MDM, menyiapkan perlengkapan karyawan baru, dan memeriksa stok serta aset tak terpakai sebelum setiap pembelian. Setiap perangkat, seat, dan pengeluaran tercatat.

https://github.com/user-attachments/assets/a33c08b7-b2bb-4834-b222-8d5c95134915

[Coba online](https://solutions.nocobase.com/itam/) · [Situs web](https://www.nocobase.com/id-ID/solution-itam/)

## Apa yang bisa dilakukan

- **Setiap pembelian cek stok dulu.** Saat pesanan dikirim untuk persetujuan, asisten persetujuan memeriksa apakah stok atau perangkat tak terpakai bisa memenuhinya, membandingkan harga sebelumnya dan permintaan serupa, lalu menyusun draf keputusan dan komentar untuk pemberi persetujuan.
- **Karyawan baru siap di hari pertama, yang keluar mengembalikan semuanya.** Paket onboarding karyawan baru dicocokkan sekaligus dengan stok dan seat tak terpakai, dan pesanan yang masih kurang dibuat dengan satu klik. Perangkat, aksesori, dan seat karyawan yang keluar dilacak sampai semuanya kembali, dan catatan yang dipegangnya diserahterimakan.
- **Selisih MDM menjadi rencana.** Setelah setiap sinkronisasi dengan Intune atau Jamf Pro, agen memilah yang tidak cocok: pengguna yang berbeda diteruskan ke penanggung jawab perangkat, perangkat yang belum terdaftar ke pengelola aset, dan kasus yang meragukan ke manusia.
- **Satu register untuk semua milik TI.** Perangkat, aksesori, barang habis pakai, komponen, dan hak penggunaan perangkat lunak, dari pembelian, penerimaan, penugasan, dan peminjaman hingga perbaikan, stock opname, dan pelepasan, setiap catatan dengan riwayatnya.
- **Asisten di setiap halaman.** Penjaga Aset menjawab dari catatan yang boleh Anda baca dan mengusulkan rencana yang Anda konfirmasi. Saat tugas datang dengan penawaran, faktur, atau surat jalan, AI membacanya dan mengisi formulir untuk Anda periksa. Agen menyarankan; manusia memutuskan.
- **Aturan Anda, kode Anda.** Tuliskan paket standar, anggaran, dan aturan persetujuan sebagai panduan bisnis, dan setiap agen mengikutinya. Minta agen pemrograman mengubah kode sumber ITAM itu sendiri. Open source, di-host sendiri, dan milik Anda.

## Mulai cepat

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

## Lisensi

[Apache License 2.0](../LICENSE)
