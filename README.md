# Smart Hospital Guide

Aplikasi navigasi rumah sakit interaktif yang menggunakan algoritma pencarian rute *A-Star (A*)* dan AI *Natural Language Processing* (NLP) menggunakan `SentenceTransformers` untuk membantu pasien menemukan ruangan.

## 1. Persiapan Kredensial Firebase (Penting!)

Sebelum menjalankan apapun, *backend* membutuhkan akses ke *database* Firebase.
1. Minta file `serviceAccountKey.json` dari pemilik/admin repositori.
2. Letakkan file tersebut di dalam direktori `backend/`.
   - Jalur file seharusnya menjadi: `backend/serviceAccountKey.json`

## 2. Setup Backend (Python)

*Backend* ditulis menggunakan **FastAPI** dan berjalan di Python 3.

1. Buka terminal dan buat *Virtual Environment* di direktori root:
   ```bash
   python3 -m venv venv
   ```
2. Aktifkan *Virtual Environment*:
   - **Mac/Linux:** `source venv/bin/activate`
   - **Windows:** `venv\Scripts\activate`
3. Instal semua paket Python (dependensi AI & API):
   ```bash
   pip install -r requirements.txt
   ```
4. Siapkan Environment Variables:
   - Salin file `backend/.env.example` (jika ada) menjadi `backend/.env`.

## 3. Setup Frontend (React + Vite)

*Frontend* dibangun menggunakan **React** dan **React-Konva** untuk merender peta interaktif.

1. Buka terminal baru dan arahkan ke folder `vite-project`:
   ```bash
   cd vite-project
   ```
2. Instal semua pustaka Node.js yang diperlukan:
   ```bash
   npm install
   ```
   *(Catatan: Paket seperti react-konva, react-router, dan vite sudah tercatat di package.json).*

## 4. Cara Menjalankan Aplikasi

Anda dapat menyalakan **Frontend** dan **Backend** secara bersamaan dengan hanya menjalankan SATU perintah dari dalam folder `vite-project`.

```bash
cd vite-project
npm run dev
```

- **Frontend UI** akan otomatis terbuka di http://localhost:5173
- **Backend API & AI Engine** akan otomatis berjalan di latar belakang pada http://localhost:8000

---
*Perhatian: Saat pertama kali dijalankan, *backend* mungkin memakan waktu ~5 detik untuk melatih ulang AI berdasarkan data peta terbaru dari Firebase.*
