# Smart Hospital Guide

Aplikasi navigasi rumah sakit interaktif yang menggunakan algoritma pencarian rute *A-Star (A*)* dan AI *Natural Language Processing* (NLP) menggunakan `SentenceTransformers` untuk membantu pasien menemukan ruangan secara fleksibel.

## 1. Persiapan Kredensial Firebase (Sangat Penting!)

Sebelum menjalankan apapun, *backend* membutuhkan akses ke *database* Firebase Anda.
1. Minta atau *download* file `serviceAccountKey.json` dari *Project Settings* Firebase (Service Accounts).
2. Letakkan file tersebut persis di dalam direktori `backend/`.
   - Jalur lokasinya harus menjadi: `backend/serviceAccountKey.json`

## 2. Setup Awal (Hanya dilakukan sekali)

1. Buka terminal di folder utama (*root*) dari repositori ini, lalu buat dan aktifkan *Virtual Environment* Python:
   ```bash
   python -m venv venv
   ```
   **Cara Aktivasi:**
   - **Windows:** `venv\Scripts\activate`
   - **Mac/Linux:** `source venv/bin/activate`

2. Instal dependensi Backend:
   ```bash
   pip install -r requirements.txt
   ```

3. Masuk ke folder Frontend dan instal dependensi Javascript:
   ```bash
   cd vite-project
   npm install
   ```

## 3. Cara Menjalankan Aplikasi Secara Bersamaan (Backend & Frontend)

Berkat skrip otomatis yang telah disesuaikan dengan semua sistem operasi (Mac, Linux, Windows), Anda **hanya perlu menjalankan satu baris perintah** untuk menghidupkan kedua server secara serentak.

1. Buka terminal Anda.
2. **Wajib:** Pastikan *Virtual Environment* Python sudah dalam posisi **aktif** (lihat cara aktivasi di atas).
3. Masuk ke folder `vite-project` lalu jalankan skrip *dev*:
   ```bash
   cd vite-project
   npm run dev
   ```

Setelah perintah dijalankan:
- **Frontend UI** akan otomatis terbuka di http://localhost:5173
- **Backend API & AI** akan otomatis berjalan di latar belakang pada http://localhost:8000
*(Catatan: Saat dijalankan pertama kali, backend akan memakan waktu sekitar 5 detik untuk melatih model AI).*
