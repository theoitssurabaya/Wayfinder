# nlp_engine.py
import re
import difflib
import numpy as np
from Sastrawi.Stemmer.StemmerFactory import StemmerFactory
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity

print("Memuat mesin NLP (Sastrawi & TF-IDF)...")

factory = StemmerFactory()
stemmer = factory.create_stemmer()

# Variabel global kosong yang akan diisi oleh Firebase nanti
DATABASE_RUANGAN = {}
daftar_nama_ruangan = []
matrix_ruangan = None
vectorizer = TfidfVectorizer(ngram_range=(1, 2))

# Pengetahuan dasar asisten agar lebih pintar
KAMUS_SINONIM = {
    "ugd": "igd", "emergency": "igd", "darurat": "igd", "kecelakaan": "igd",
    "wc": "toilet", "kamar mandi": "toilet", "kencing": "toilet", "berak": "toilet", "buang air": "toilet",
    "bayar": "kasir", "uang": "kasir", "pembayaran": "kasir", "tagihan": "kasir",
    "obat": "farmasi", "apotek": "farmasi", "apotik": "farmasi", "resep": "farmasi",
    "rontgen": "radiologi", "xray": "radiologi", "scan": "radiologi", "mri": "radiologi", "usg": "radiologi",
    "kandungan": "poli", "gigi": "poli", "mata": "poli", "periksa": "poli", "dokter": "poli", "konsultasi": "poli", "kontrol": "poli",
    "sholat": "mushola", "masjid": "mushola", "ibadah": "mushola", "sembahyang": "mushola", "prayer": "mushola", "mosque": "mushola",
    "makan": "kantin", "minum": "kantin", "lapar": "kantin", "haus": "kantin", "jajan": "kantin", "eat": "kantin", "drink": "kantin", "food": "kantin", "canteen": "kantin", "cafeteria": "kantin",
    "menginap": "rawat inap", "besuk": "rawat inap", "jenguk": "rawat inap", "opname": "rawat inap", "bangsal": "rawat inap", "inpatient": "rawat inap", "ward": "rawat inap", "visit": "rawat inap",
    "checkup": "mcu", "cek kesehatan": "mcu", "medical check up": "mcu",
    "dokter": "poli", "doctor": "poli", "clinic": "poli",
    "room": "ruang", "door": "pintu", "stairs": "tangga"
}

# Fungsi pembersihan teks untuk NLP
def bersihkan_teks(teks_kotor):
    teks = teks_kotor.lower()
    
    # Perbaikan sinonim (misal: "mau ambil obat" -> "mau ambil farmasi")
    for slang, baku in KAMUS_SINONIM.items():
        teks = re.sub(rf'\b{slang}\b', baku, teks)
        
    teks = re.sub(r'[^\w\s]', '', teks)
    teks_dasar = stemmer.stem(teks)
    
    # Kata tugas yang tidak relevan untuk pencarian rute (ID & EN)
    stopwords = [
        "mau", "ke", "di", "mana", "tolong", "antar", "cari", "ruang", "tempat", "saya", "ingin", "tanya", "mas", "mbak", "kasih", "tau", "arah", "jalan", "buat", "ambil",
        "want", "to", "go", "where", "please", "take", "me", "find", "room", "place", "i", "ask", "show", "way", "direction", "get", "looking", "for"
    ]
    kata_akhir = [kata for kata in teks_dasar.split() if kata not in stopwords]
    
    # Fitur Koreksi Typo Sederhana (Fuzzy matching)
    # Jika ada typo ringan (e.g. "apotikk" -> "apotik"), kita bisa coba benarkan.
    kata_koreksi = []
    semua_kata_kunci = list(KAMUS_SINONIM.keys()) + list(set(KAMUS_SINONIM.values())) + ["informasi", "laboratorium", "rehabilitasi", "medik"]
    for kata in kata_akhir:
        koreksi = difflib.get_close_matches(kata, semua_kata_kunci, n=1, cutoff=0.8)
        if koreksi:
            kata_koreksi.append(koreksi[0])
        else:
            kata_koreksi.append(kata)
            
    return " ".join(kata_koreksi)

# Fungsi untuk melatih ulang model NLP dengan data terbaru dari Firebase
def latih_ulang_nlp(data_kamus_baru):
    global DATABASE_RUANGAN, daftar_nama_ruangan, matrix_ruangan, vectorizer
    
    DATABASE_RUANGAN = data_kamus_baru
    daftar_nama_ruangan = list(DATABASE_RUANGAN.keys())
    
    if not DATABASE_RUANGAN:
        print("[NLP] Peringatan: Database kosong, tidak ada yang dilatih.")
        return

    korpus_dokumen = []
    for sinonim in DATABASE_RUANGAN.values():
        teks_gabungan = " ".join(sinonim)
        korpus_dokumen.append(bersihkan_teks(teks_gabungan))

    # Latih ulang model TF-IDF dengan data terbaru dari Firebase
    matrix_ruangan = vectorizer.fit_transform(korpus_dokumen)
    print(f"[NLP] Model berhasil dilatih ulang! ({len(daftar_nama_ruangan)} Ruangan Aktif)")

# Fungsi pencocokan NLP utama  
def cari_target_ruangan(input_pengunjung, start_node_id=None, language="id"):
    # Cegah error jika database Firebase belum masuk
    if matrix_ruangan is None or not daftar_nama_ruangan:
        pesan = "Sistem sedang memuat data peta, mohon tunggu." if language == "id" else "System is loading map data, please wait."
        return {"status": "error", "pesan": pesan}

    input_bersih = bersihkan_teks(input_pengunjung)
    if not input_bersih:
         pesan = "Mohon masukkan tujuan yang lebih spesifik." if language == "id" else "Please enter a more specific destination."
         return {"status": "error", "pesan": pesan}

    vektor_input = vectorizer.transform([input_bersih])
    skor_kemiripan = cosine_similarity(vektor_input, matrix_ruangan)[0]
    
    # Cari skor maksimum
    max_score = np.max(skor_kemiripan)
    
    # Ambang batas diturunkan ke 5% karena typo correction & tf-idf kadang menghasilkan skor kecil
    # Namun jika sudah tertinggi, kemungkinan besar benar
    if max_score >= 0.05:
        # Cari semua kandidat yang memiliki skor kemiripan maksimum
        kandidat_indeks = np.where(skor_kemiripan == max_score)[0]
        
        terbaik_id = None
        
        if len(kandidat_indeks) == 1:
            terbaik_id = daftar_nama_ruangan[kandidat_indeks[0]]
        else:
            # Jika lebih dari 1 (nama ruangan sama), tentukan berdasarkan jarak terdekat dari start_node_id
            if start_node_id:
                import waypoint_graph
                start_room = waypoint_graph.RUANGAN_GRID.get(start_node_id)
                if start_room:
                    start_floor = start_room.get("floor", "Lantai 1")
                    start_x = start_room.get("x", 0)
                    start_y = start_room.get("y", 0)
                    
                    terbaik_jarak = float('inf')
                    
                    for idx in kandidat_indeks:
                        kandidat_id = daftar_nama_ruangan[idx]
                        kandidat_room = waypoint_graph.RUANGAN_GRID.get(kandidat_id)
                        if not kandidat_room: continue
                        
                        k_floor = kandidat_room.get("floor", "Lantai 1")
                        k_x = kandidat_room.get("x", 0)
                        k_y = kandidat_room.get("y", 0)
                        
                        # Penalty besar jika lantai berbeda (10000)
                        floor_penalty = 0 if k_floor == start_floor else 10000 
                        jarak_manhattan = abs(start_x - k_x) + abs(start_y - k_y)
                        total_jarak = jarak_manhattan + floor_penalty
                        
                        if total_jarak < terbaik_jarak:
                            terbaik_jarak = total_jarak
                            terbaik_id = kandidat_id
                
            # Jika tidak ada start_node_id atau gagal menghitung, pilih yang pertama saja
            if not terbaik_id:
                terbaik_id = daftar_nama_ruangan[kandidat_indeks[0]]
    if terbaik_id:
        # Berhasil menemukan target
        return {
            "status": "success",
            "target_id": terbaik_id,
            "confidence_score": float(max_score)
        }
    else:
        pesan = "Maaf, tujuan tidak dikenali. Silakan coba kata kunci lain." if language == "id" else "Sorry, destination not recognized. Please try another keyword."
        return {
            "status": "error",
            "pesan": pesan
        }