# Smart Hospital Guide

Aplikasi navigasi rumah sakit interaktif yang menggunakan algoritma pencarian rute *A-Star (A*)* dan AI *Natural Language Processing* (NLP) menggunakan `SentenceTransformers` untuk membantu pasien menemukan ruangan secara fleksibel.

## 1. Persiapan Kredensial Firebase (Sangat Penting!)

Sebelum menjalankan apapun, *backend* membutuhkan akses ke *database* Firebase Anda.
1. Minta atau *download* file `serviceAccountKey.json` dari *Project Settings* Firebase (Service Accounts).
2. Letakkan file tersebut persis di dalam direktori `backend/`.
   - Jalur lokasinya harus menjadi: `backend/serviceAccountKey.json`

## 2. Setup & Menjalankan Backend (Terminal 1)

*Backend* dibangun menggunakan **FastAPI** (Python 3) untuk menjalankan mesin AI pencarian rute.

1. Buka terminal baru dan masuk ke folder backend:
   ```bash
   cd backend
   ```
2. Buat *Virtual Environment*:
   ```bash
   python -m venv venv
   ```
3. Aktifkan *Virtual Environment*:
   - **Windows:** `venv\Scripts\activate`
   - **Mac/Linux:** `source venv/bin/activate`
4. Instal semua library kecerdasan buatan dan API:
   ```bash
   pip install -r ../requirements.txt
   ```
5. Jalankan server Backend:
   ```bash
   uvicorn main:app --host 0.0.0.0 --reload
   ```
*(Catatan: Saat dijalankan pertama kali, backend akan men-download model AI dan memakan waktu sekitar 5 detik untuk sinkronisasi peta).*

## 3. Setup & Menjalankan Frontend (Terminal 2)

*Frontend* dibangun menggunakan **React** + **Vite** dan **React-Konva** untuk antarmuka visual peta gedung.

1. Buka jendela terminal baru lagi, lalu masuk ke folder frontend:
   ```bash
   cd vite-project
   ```
2. Instal semua pustaka JavaScript:
   ```bash
   npm install
   ```
3. Jalankan server UI:
   ```bash
   npm run dev
   ```

## 4. Cara Penggunaan

Setelah kedua terminal berjalan:
- Buka **Frontend UI** di *browser* pada http://localhost:5173
- Pilih bahasa, lalu coba cari rute dengan mengetik kata kunci kasual seperti *"Di mana dokter anak?"* atau memilih Kiosk serta Lantai di bilah samping.
