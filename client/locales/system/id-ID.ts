import settings from './settings-id-ID.js';
import type { SystemResource } from './en-US.js';
import deviceApprovalIdID from '#extensions/nocobase-device-approval/locales/id-ID';
import inboxIdID from '#extensions/nocobase-inbox/locales/id-ID';

/** The Indonesian copy of what the template ships; see `./en-US.ts`. */
const systemIdID: SystemResource = {
  flowDiagram: {
    controls: 'Kontrol diagram',
    fitView: 'Sesuaikan dengan tampilan',
    fullscreen: 'Layar penuh',
    exitFullscreen: 'Keluar dari layar penuh',
    escapeHint: 'Tekan Escape untuk keluar',
    leavesTo: 'Menuju ke',
    arrivesFrom: 'Datang dari',
    otherRoutes: 'Rute lainnya',
    minimap: 'Ikhtisar diagram',

    configure: 'Atur',
    overview: 'Ikhtisar diagram',
    actualSize: 'Ukuran sebenarnya',
    states: 'Status',
    transitions: 'Transisi',
    configurable: 'Parameter',
    current: 'Saat ini',
    visited: 'Telah dilalui',
    initial: 'Awal',
    final: 'Akhir',
    state: 'Status',
    zoomOut: 'Perkecil',
    zoomIn: 'Perbesar',
    fit: 'Sesuaikan dengan tampilan',

    empty: 'Tidak ada status untuk ditampilkan.',
    loading: 'Menata diagram…',
    failed: 'Tidak dapat menata diagram ini.',
    nodeHelp: 'Tekan Enter atau Spasi untuk memilih status.',
    edgeHelp: 'Tekan Enter atau Spasi untuk memilih transisi.',
  },
  settings,
  'auth.preparingSession': 'Menyiapkan sesi Anda…',
  'auth.connectionFailed': 'Tidak dapat terhubung',
  'auth.connectionFailedDescription':
    'Koneksi realtime tidak dapat disiapkan. Coba lagi untuk masuk ke aplikasi, atau keluar.',

  'auth.passwordResetSuccess':
    'Kata sandi Anda telah diatur ulang. Masuk dengan kata sandi baru Anda.',
  'auth.requestNewResetLink': 'Minta tautan atur ulang baru',

  // The UI Library block of the `/device` page; the keys below may reword it.
  ...deviceApprovalIdID,
  // The UI Library block of the `/inbox` page; the keys below may reword it.
  ...inboxIdID,
  // The UI Library component of the header's inbox button.
  'inboxButton.title': 'Kotak masuk',
  'inboxButton.pending': 'Kotak masuk, {{count}} menunggu',
  'inboxButton.unread': 'Kotak masuk, {{count}} belum dibaca',
  'inboxButton.pendingHint':
    '{{count}} menunggu Anda; jumlahnya berkurang setelah ditangani.',
  'inboxButton.unreadHint':
    '{{count}} belum dibaca; jumlahnya berkurang saat Anda membacanya.',
  'auth.welcome': 'Selamat datang kembali',
  'auth.loginDescription':
    'Masuk dengan nama pengguna atau email dan kata sandi Anda.',
  'auth.registerTitle': 'Buat akun',
  'auth.registerDescription': 'Buat akun untuk memulai.',
  'auth.forgotTitle': 'Lupa kata sandi',
  'auth.forgotDescription':
    'Masukkan email Anda dan kami akan mengirim tautan atur ulang jika akunnya ada.',
  'auth.passwordResetUnavailable':
    'Atur ulang kata sandi mandiri tidak diaktifkan. Hubungi administrator untuk mengatur ulang kata sandi Anda.',
  'auth.capabilityLoadFailed':
    'Tidak dapat memeriksa ketersediaan atur ulang kata sandi.',
  'auth.retry': 'Coba lagi',
  'auth.loading': 'Memuat',
  'auth.resetDescription': 'Pilih kata sandi baru untuk akun Anda.',
  'auth.resetTitle': 'Atur ulang kata sandi',
  'auth.identifier': 'Nama pengguna atau email',
  'auth.password': 'Kata sandi',
  'auth.signIn': 'Masuk',
  'auth.signingIn': 'Sedang masuk…',
  'auth.hidePassword': 'Sembunyikan kata sandi',
  'auth.showPassword': 'Tampilkan kata sandi',
  'auth.forgotLink': 'Lupa kata sandi?',
  'auth.noAccount': 'Belum punya akun?',
  'auth.signUp': 'Daftar',
  'auth.createAccount': 'Buat akun',
  'auth.creatingAccount': 'Membuat akun…',
  'auth.name': 'Nama',
  'auth.username': 'Nama pengguna',
  'auth.email': 'Email',
  'auth.confirmPassword': 'Konfirmasi kata sandi',
  'auth.existingAccount': 'Sudah punya akun?',
  'auth.passwordMismatch': 'Kata sandi tidak cocok.',
  'auth.resetting': 'Mengatur ulang…',
  'auth.newPassword': 'Kata sandi baru',
  'auth.confirmNewPassword': 'Konfirmasi kata sandi baru',
  'auth.invalidResetLink':
    'Tautan atur ulang kata sandi ini tidak valid atau sudah kedaluwarsa.',
  'auth.backToSignIn': 'Kembali ke halaman masuk',
  'auth.sendResetLink': 'Kirim tautan atur ulang',
  'auth.sending': 'Mengirim…',
  'auth.resetSent': 'Jika akunnya ada, tautan atur ulang telah dikirim.',
  'auth.rememberPassword': 'Ingat kata sandi Anda?',
  'auth.methods': 'Metode masuk',
  'auth.or': 'Atau lanjutkan dengan',
  'auth.continueWith': 'Lanjutkan dengan {provider}',
  'auth.about': 'Tentang aplikasi ini',
  'auth.platform': 'Platform aplikasi berbasis AI',
  'auth.marketingTitleFirst': 'Biarkan AI membangun dengan bebas.',
  'auth.marketingTitleSecond': 'NocoBase menjaganya',
  'auth.marketingTitleThird': 'tetap andal.',
  'auth.marketingDescription':
    'Berikan AI kerangka frontend yang fleksibel untuk membentuk setiap pengalaman, sementara NocoBase mengamankan data, izin, dan tata kelola di bawahnya.',
  'auth.frontend': 'Frontend berbasis AI',
  'auth.frontendDescription':
    'Susun antarmuka dengan bebas di atas kerangka yang fleksibel.',
  'auth.foundation': 'Fondasi NocoBase',
  'auth.foundationDescription':
    'Data, kontrol akses, dan tata kelola yang andal.',
  'auth.marketingFooter': 'Bebas di atas. Tenang di bawah.',
  'status.loading': 'Memuat',
  'status.loadingPage': 'Memuat halaman',
  'status.denied': 'Akses ditolak',
  'status.pageFailed': 'Tidak dapat memuat halaman',
  'status.retry': 'Coba lagi',
  'navigation.brandHome': 'Beranda NocoBase',
  'navigation.brandApps': 'Aplikasi NocoBase',
  'routeOverlay.close': 'Tutup',
  'status.deniedDescription':
    'Anda tidak memiliki izin untuk mengakses {{label}}.',
  'status.routeFailedDescription':
    'Rute {{label}} dari {{packageName}} tidak dapat dimuat.',
  shell: {
    buildFreely: 'AI membangun dengan bebas.',
    reliability: '<brand>NocoBase</brand> menjaganya tetap andal.',
  },
  home: {
    platform: 'NocoBase · Platform aplikasi berbasis AI',
    title: 'Jelaskan, dan agen Anda yang membangunnya',
    description:
      'Aplikasi ini dikembangkan dengan berbicara kepada agen pemrograman Anda. Sampaikan kebutuhan bisnis dengan kata-kata sederhana, dan agen menulis halaman, model data, API, dan proses bisnis di proyek ini.',
    steps: {
      describe: {
        title: 'Jelaskan kebutuhannya',
        description:
          'Sebutkan siapa penggunanya, data apa yang disimpan, dan apa yang harus terjadi.',
      },
      build: {
        title: 'Biarkan agen membangun',
        description:
          'Agen membaca proyek ini dan kemampuan bawaannya, lalu menulis kodenya.',
      },
      review: {
        title: 'Periksa dan sempurnakan',
        description:
          'Muat ulang halaman untuk mencobanya, lalu minta perubahan dengan cara yang sama.',
      },
    },
    example: {
      title: 'Coba permintaan seperti ini',
      text: 'Bangun aplikasi pesanan pembelian.\n\nSebuah pesanan memiliki nomor, barang, pemohon, jumlah, dan status persetujuan. Pemohon membuat pesanan dan hanya melihat pesanan miliknya sendiri; peninjau melihat semua pesanan yang menunggu dan menyetujui atau menolaknya.\nSetelah keputusan diambil, beri tahu pemohon di kotak masuk dengan tautan ke pesanan tersebut.',
      hint: 'Tempelkan ke Claude Code, Codex, Cursor, atau agen pemrograman apa pun yang dibuka di proyek ini.',
    },
    capabilitiesTitle: 'Kemampuan bawaan',
    capabilitiesDescription:
      'Agen Anda langsung menggunakan kemampuan ini alih-alih membangunnya dari awal. Buka salah satunya untuk mendapatkan prompt yang dapat Anda ubah dan salin.',
    viewPrompts: 'Lihat prompt ({{count}})',
    prompt: {
      label: 'Prompt',
      hint: 'Sesuaikan prompt dengan bisnis Anda sebelum menyalinnya. Perubahan tidak disimpan setelah dialog ditutup.',
      copy: 'Salin',
      copiedShort: 'Tersalin',
      copied: 'Prompt tersalin',
      copyFailed:
        'Tidak dapat menyalin. Pilih teksnya dan salin secara manual.',
      reset: 'Pulihkan bawaan',
    },
    capabilities: {
      auth: {
        title: 'Autentikasi',
        description:
          'Masuk, pendaftaran, atur ulang kata sandi, dan single sign-on perusahaan.',
        prompts: {
          disableSignUp: {
            label: 'Tutup pendaftaran',
            text: 'Aplikasi ini hanya untuk karyawan perusahaan. Administrator membuat semua akun.\nNonaktifkan pendaftaran mandiri dan hapus tautan pendaftaran dari halaman masuk.\nKaryawan yang sudah ada tetap harus dapat masuk dengan akun dan kata sandinya.\nPertahankan tautan lupa kata sandi.',
          },
          companySso: {
            label: 'SSO perusahaan',
            text: 'Izinkan karyawan masuk dengan platform identitas perusahaan kami menggunakan OIDC.\n\nPertahankan masuk dengan akun dan kata sandi, dan tambahkan tombol Akun perusahaan.\nTombol tersebut membuka platform identitas perusahaan. Setelah berhasil masuk, kembali ke beranda aplikasi.\n\nIzinkan masuk pertama kali membuat akun aplikasi, yang dikenali dari pengenal pengguna yang stabil dari platform tersebut.\nJangan menautkan akun secara otomatis berdasarkan kecocokan nama atau email. Akun baru menggunakan izin bawaan aplikasi.\n\nCantumkan informasi yang harus diberikan administrator platform identitas dan URL callback yang perlu mereka daftarkan.',
          },
          apiKeys: {
            label: 'Kunci API',
            text: 'Tambahkan entri Kunci integrasi ke menu pengguna, menggunakan kemampuan kunci API bawaan aplikasi.\nKaryawan hanya mengelola kunci yang mereka buat, dengan mengisi tujuan dan masa berlaku dalam hari.\nTampilkan kunci lengkap hanya sekali setelah dibuat, dengan pesan untuk segera menyalin dan menyimpannya.\nCantumkan nama, potongan yang dapat dikenali, status, masa berlaku, dan penggunaan terakhir setiap kunci, dan izinkan pencabutannya setelah konfirmasi.\nJangan pernah menampilkan kunci lengkap di daftar, log, atau detail.',
          },
        },
      },
      dataSources: {
        title: 'Sumber data',
        description:
          'Pilih basis data aplikasi dan gunakan data bisnis dari basis data eksternal yang sudah ada.',
        prompts: {
          postgres: {
            label: 'Ganti basis data',
            text: 'Ganti basis data aplikasi dari SQLite ke PostgreSQL.\nBaca detail koneksi dari konfigurasi runtime server, bukan dari kode sumber.\nJelaskan driver basis data mana yang perlu dipasang dan pengaturan mana yang perlu diisi, dan ingatkan saya bahwa data yang sudah ada tidak dimigrasikan secara otomatis.',
          },
          externalDatabase: {
            label: 'Basis data eksternal',
            text: 'Hubungkan basis data keuangan perusahaan yang sudah ada sebagai sumber data eksternal hanya-baca; jangan ubah tabelnya.\nCocokkan catatan berdasarkan nomor pemasok dan tambahkan bagian Penyelesaian ke detail pemasok yang menampilkan siklus penyelesaian, batas kredit, dan status penyelesaian, dengan label sumbernya.\nTetap baca detail kontak pemasok dari basis data aplikasi, dan baca data penyelesaian langsung dari basis data eksternal tanpa mengimpornya.\nBaca kredensial koneksi dari konfigurasi runtime server.',
          },
        },
      },
      authorization: {
        title: 'Izin',
        description:
          'Atur siapa yang dapat membuka halaman mana, menjalankan tindakan mana, dan melihat catatan mana.',
        prompts: {
          jobs: {
            label: 'Jabatan',
            text: 'Buat jabatan Pemohon pembelian dan Peninjau pesanan untuk aplikasi.\nPemohon pembelian dapat membuka halaman pesanan dan melihat pesanan yang mereka minta.\nPeninjau pesanan dapat membuka halaman pesanan, melihat pesanan, serta menyetujui atau menolak pesanan yang menunggu.\nHanya administrator aplikasi yang dapat mengubah izin dan penugasan.\nGunakan kemampuan otorisasi aplikasi yang sudah ada agar administrator dapat menyesuaikan izin dan menugaskan orang nanti.',
          },
          dataScopes: {
            label: 'Cakupan data',
            text: 'Izinkan pemohon pembelian hanya melihat pesanan miliknya sendiri, menggunakan kolom pemohon pada pesanan untuk menentukan kepemilikan.\nPeninjau pesanan dapat melihat semua pesanan dan memproses persetujuan yang menunggu.\nAdministrator dapat menyesuaikan cakupan tampilan pesanan setiap jabatan di set izinnya.',
          },
          restrictions: {
            label: 'Pembatasan',
            text: 'Bob sementara membantu meninjau pesanan pembelian dan hanya boleh melihat pesanan bernilai 2.000 atau kurang.\nTambahkan batas jumlah pada tindakan Lihat pesanan miliknya, dengan tetap mempertahankan jabatan dan cakupan datanya.\nTerapkan batas tersebut pada pesanannya sendiri dan pada pesanan yang dibagikan kepadanya.\nAdministrator dapat mengubah jumlahnya atau menghapus aturannya; sebelum dihapus, jelaskan bahwa cakupan yang dapat dilihatnya mungkin bertambah.',
          },
        },
      },
      workflow: {
        title: 'Alur kerja',
        description:
          'Gerakkan catatan bisnis melalui tahapan, dengan penantian, batas waktu, percobaan ulang, dan riwayat siapa melakukan apa.',
        prompts: {
          stages: {
            label: 'Tahapan',
            text: 'Tambahkan proses pada pesanan pembelian: Menunggu persetujuan → Menunggu pembelian → Diterima → Selesai.\nPeninjau menyetujui atau menolak; penolakan wajib disertai alasan dan mengembalikan pesanan kepada pemohon untuk direvisi dan diajukan kembali.\nSetelah pembeli melakukan pembelian, pesanan menunggu pembelian; mengonfirmasi pengiriman dengan tanda terima yang ditandatangani memindahkannya ke Diterima, dan konfirmasi pemohon menyelesaikannya.\nDetail pesanan hanya menawarkan tindakan tahap saat ini, dan pengubahan biasa tidak dapat mengubah tahapnya.\nPeriksa tahapan dan informasi wajib di server, dan jangan pernah menimpa hasil yang sudah diajukan orang lain.',
          },
          backgroundExport: {
            label: 'Ekspor latar belakang',
            text: 'Tambahkan halaman laporan pesanan yang mengekspor pesanan yang ada ke CSV.\nSetelah diajukan, ekspor menunggu diproses, dibuat di latar belakang, dan selesai dengan tautan unduhan.\nTampilkan tahap saat ini, nama file, jumlah pesanan yang diekspor, serta catatan pengajuan dan pemrosesan sistem.\nCoba lagi pembuatan yang gagal sesuai aturan, dan simpan kegagalan akhir untuk ditangani pemiliknya; menjalankannya lagi tidak boleh membuat file laporan ganda.\nPertahankan kemajuan dan hasil tetap terlihat setelah halaman dimuat ulang, dan hanya izinkan orang yang berwenang mengekspor pesanan.',
          },
          history: {
            label: 'Riwayat',
            text: 'Tampilkan tahap saat ini dan riwayat pemrosesan di detail pesanan.\nSetiap entri menampilkan siapa yang bertindak, kapan, tindakannya, tahap sebelum dan sesudah, serta alasan penolakan atau tanda terima yang ditandatangani.\nTandai tindakan yang dilakukan otomatis sebagai dilakukan oleh sistem.\nPertahankan kemajuan dan riwayat setelah halaman dimuat ulang, sehingga seluruh proses dapat ditinjau setelah selesai.',
          },
        },
      },
      scheduler: {
        title: 'Tugas terjadwal',
        description:
          'Jalankan pekerjaan bisnis pada waktu yang ditentukan, dan lihat eksekusi berikutnya beserta hasilnya.',
        prompts: {
          reminder: {
            label: 'Pengingat harian',
            text: 'Tambahkan pengingat Pesanan tertunda ke aplikasi pesanan yang sudah ada.\n\nPukul 09.00 waktu Beijing setiap hari kerja, cari pesanan yang menunggu persetujuan, kelompokkan menurut peninjau, dan kirim satu notifikasi dalam aplikasi kepada setiap peninjau.\nSertakan jumlah pesanan tertunda dan tautan ke daftar pesanan tertunda. Jangan kirim apa pun jika tidak ada pesanan tertunda.\nAdministrator dapat melihat jadwal dan catatan eksekusi, serta menjeda atau melanjutkan pengingat.',
          },
          weeklyReport: {
            label: 'Laporan mingguan',
            text: 'Pukul 08.00 waktu Beijing setiap Senin, buat ringkasan penjualan minggu lalu dan beri tahu manajer penjualan.\nSertakan pendapatan penjualan, jumlah pesanan, dan total per wilayah. Administrator dapat melihat tugas dan catatan eksekusinya.',
          },
        },
      },
      notification: {
        title: 'Notifikasi',
        description:
          'Kirim pesan dalam aplikasi, email, atau pesan bot grup saat sesuatu terjadi.',
        prompts: {
          inApp: {
            label: 'Pesan dalam aplikasi',
            text: 'Tambahkan persetujuan pesanan ke aplikasi saat ini dan beri tahu pemohon tentang hasilnya melalui pesan dalam aplikasi.\n\nPesanan mencakup nomor, nama, pemohon, jumlah, dan status persetujuan.\nPemohon dapat melihat pesanan miliknya sendiri. Peninjau dapat melihat pesanan yang menunggu serta menyetujui atau menolaknya. Gunakan kembali fitur pesanan dan persetujuan yang sudah ada jika tersedia.\n\nSetelah disetujui atau ditolak, kirim satu pesan dalam aplikasi hanya kepada pemohon pesanan.\nJudulnya menunjukkan apakah pesanan disetujui atau ditolak. Isinya mencakup nomor pesanan, nama, dan hasil persetujuan.\nMengeklik pesan membuka detail pesanan yang bersangkutan.\nJangan kirim selama persetujuan masih menunggu. Kirim notifikasi hanya sekali untuk hasil persetujuan yang sama.\nKegagalan notifikasi tidak memengaruhi hasil persetujuan yang tersimpan.',
          },
          email: {
            label: 'Email',
            text: 'Tambahkan email ke notifikasi persetujuan pesanan yang sudah ada, menggunakan saluran email yang telah dikonfigurasi di aplikasi.\n\nSetelah pesanan disetujui atau ditolak, kirim hasilnya ke email akun pemohon.\nSertakan nomor pesanan di subjek serta nama pesanan dan hasilnya di isi.\nPertahankan pesan dalam aplikasi yang sudah ada. Jika pemohon tidak memiliki alamat email, kirim hanya pesan dalam aplikasi.\nKegagalan email tidak boleh memengaruhi hasil persetujuan atau pesan dalam aplikasi.',
          },
        },
      },
      mail: {
        title: 'Surel',
        description:
          'Hubungkan kotak surat pribadi, lalu baca, balas, dan kirim email bisnis.',
        prompts: {
          providers: {
            label: 'Penyedia surel',
            text: 'Konfigurasikan mailbox.org untuk aplikasi di mail.providers pada konfigurasi server:\n- Server masuk IMAP: imap.mailbox.org, port 993, SSL/TLS.\n- Server keluar SMTP: smtp.mailbox.org, port 465, SSL/TLS.\nPengguna memasukkan alamat email, nama pengguna, dan kata sandinya sendiri di halaman akun kotak surat dan memilih tanggal mulai sinkronisasi pertama; jangan pernah menulis kata sandi kotak surat ke konfigurasi atau kode sumber.',
          },
          mailCenter: {
            label: 'Pusat surel',
            text: 'Surel sudah tersedia di aplikasi ini; gunakan kembali alih-alih membangunnya lagi atau memasang plugin lain.\nTambahkan halaman Pusat surel dan Akun kotak surat ke navigasi, menggunakan halaman ruang kerja surel dan akun kotak surat yang disediakan kemampuan surel.\nPengguna dapat menghubungkan kotak suratnya sendiri, menyinkronkan pesan masuk, membaca pesan dan lampiran, serta membalas, dengan mempertahankan subjek asli dan konteks percakapan serta menujukan balasan kepada pengirim asli.\nSetiap pengguna bekerja dengan kotak surat yang dihubungkannya sendiri.',
          },
          correspondence: {
            label: 'Email pelanggan',
            text: 'Tambahkan bagian korespondensi ke detail pelanggan, menggunakan kembali komponen membaca dan menulis surel bawaan aplikasi.\nTampilkan pesan yang pengirim atau penerimanya cocok dengan alamat email kontak pelanggan saat ini. Perwakilan penjualan dapat membaca pesan, melihat lampiran, dan membalas menggunakan kotak surat yang mereka hubungkan sendiri.',
          },
        },
      },
      file: {
        title: 'File',
        description:
          'Unggah file, lampirkan ke catatan, dan pratinjau atau unduh file.',
        prompts: {
          attachments: {
            label: 'Lampiran',
            text: 'Tambahkan lampiran pembelian ke aplikasi manajemen pesanan saya yang sudah ada.\n\nTambahkan area lampiran ke detail pesanan. Setiap pesanan dapat memiliki beberapa file, termasuk PDF, gambar, dan DOCX.\nTampilkan nama dan ukuran file, dengan tindakan untuk mempratinjau, mengunduh, dan menghapus lampiran.\nSetelah mengunggah, izinkan pengguna menyimpan lampiran ke pesanan saat ini. Lampiran tetap tersedia saat pesanan dibuka kembali.\nSiapa pun yang memiliki akses ke pesanan dapat melihat dan mengunduh lampirannya. Pemohon dan peninjau dapat menambah atau menghapus lampiran.\nMenghapus lampiran hanya melepas tautannya dari pesanan saat ini; file tetap disimpan.',
          },
          avatar: {
            label: 'Avatar',
            text: 'Tambahkan avatar untuk setiap karyawan, dengan satu gambar per karyawan.\nDukung pengunggahan dan penggantian avatar, dan tampilkan di daftar dan detail karyawan.\nGunakan avatar baru setelah diganti dan tetap tampilkan setelah halaman dimuat ulang.',
          },
        },
      },
      i18n: {
        title: 'Bahasa',
        description:
          'Ganti bahasa antarmuka, tambahkan bahasa, dan tetapkan bahasa bawaan.',
        prompts: {
          addLanguage: {
            label: 'Tambah bahasa',
            text: 'Tambahkan bahasa Spanyol ke aplikasi saya. Terjemahkan antarmuka dan pesan server, dan tambahkan bahasa Spanyol ke menu bahasa.',
          },
          defaultLanguage: {
            label: 'Bahasa bawaan',
            text: 'Jadikan bahasa Tionghoa Sederhana sebagai bahasa bawaan aplikasi bagi orang yang belum memilih bahasa. Tetap sediakan bahasa Inggris di menu bahasa.',
          },
        },
      },
      theme: {
        title: 'Tema',
        description:
          'Sesuaikan warna, font, dan kerapatan, serta beralih antara terang dan gelap.',
        prompts: {
          changeTheme: {
            label: 'Ubah tema',
            text: 'Perbarui tema Ringkas: gunakan biru sebagai warna utama dan sedikit perbesar radius sudut. Pertahankan font, ukuran teks, dan jarak ringkas yang ada.',
          },
          newTheme: {
            label: 'Tema baru',
            text: 'Buat tema Hutan dengan hijau sebagai warna utama, latar belakang lembut, sudut cukup membulat, dan bayangan halus.',
          },
        },
      },
    },
  },

  appearance: {
    title: 'Tampilan',
    mode: 'Mode warna',
    preset: 'Tema',
    light: 'Terang',
    dark: 'Gelap',
    system: 'Ikuti sistem',
    themes: { default: 'Lapang', compact: 'Ringkas' },
  },
  app: {
    title: 'NocoBase',
  },
  actions: {
    close: 'Tutup',
    save: 'Simpan',
    cancel: 'Batal',
    confirm: 'Konfirmasi',
    language: 'Bahasa',
  },
  notices: {
    serverLocaleFallback:
      'Server tidak mendukung bahasa ini, sehingga pesan server akan menggunakan bahasa Inggris.',
    languageChangeFailed:
      'Tidak dapat menyelesaikan perubahan bahasa. Silakan coba lagi.',
  },
  account: {
    signOutFailed: 'Gagal keluar. Silakan coba lagi.',
    openMenu: 'Buka menu akun',
    fallback: 'Akun',
    signOut: 'Keluar',
    signingOut: 'Sedang keluar…',
  },
  navigation: {
    home: 'Beranda',
    open: 'Buka navigasi',
    close: 'Tutup navigasi',
    expand: 'Bentangkan navigasi',
    collapse: 'Ciutkan navigasi',
    toggle: 'Bentangkan atau ciutkan navigasi',
    label: 'Navigasi aplikasi',
    description: 'Buka halaman aplikasi ini.',
    breadcrumb: 'Jejak navigasi',
    breadcrumbMore: 'Tampilkan tingkat di antaranya',
    back: 'Kembali',
  },
  dataTable: {
    noResults: 'Tidak ada hasil.',
    sortAscending: 'Naik',
    sortDescending: 'Turun',
    hideColumn: 'Sembunyikan',
    view: 'Tampilan',
    toggleColumns: 'Tampilkan/sembunyikan kolom',
    selectedCount: '{{selected}} dari {{total}} baris dipilih.',
    rowsPerPage: 'Baris per halaman',
    pageOf: 'Halaman {{page}} dari {{pageCount}}',
    firstPage: 'Ke halaman pertama',
    previousPage: 'Ke halaman sebelumnya',
    nextPage: 'Ke halaman berikutnya',
    lastPage: 'Ke halaman terakhir',
  },
  datePicker: {
    placeholder: 'Pilih tanggal',
    rangePlaceholder: 'Pilih rentang tanggal',
  },
};

export default systemIdID;
