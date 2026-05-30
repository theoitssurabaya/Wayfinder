# nlp_engine.py
import re
import difflib
import numpy as np
from sentence_transformers import SentenceTransformer, util

print("Memuat mesin NLP (Sentence Transformers)...")
# Menggunakan model multilingual yang mendukung bahasa Indonesia & Inggris
model = SentenceTransformer('paraphrase-multilingual-MiniLM-L12-v2')

# Variabel global kosong yang akan diisi oleh Firebase nanti
DATABASE_RUANGAN = {}
daftar_nama_ruangan = []
embeddings_ruangan = None

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
    
    # Kata tugas yang tidak relevan untuk pencarian rute (ID & EN)
    stopwords = [
        "mau", "ke", "di", "mana", "tolong", "antar", "cari", "ruang", "tempat", "saya", "ingin", "tanya", "mas", "mbak", "kasih", "tau", "arah", "jalan", "buat", "ambil",
        "want", "to", "go", "where", "please", "take", "me", "find", "room", "place", "i", "ask", "show", "way", "direction", "get", "looking", "for"
    ]
    kata_akhir = [kata for kata in teks.split() if kata not in stopwords]
    
    return " ".join(kata_akhir)

# Fungsi untuk melatih ulang model NLP dengan data terbaru dari Firebase
def latih_ulang_nlp(data_kamus_baru):
    global DATABASE_RUANGAN, daftar_nama_ruangan, embeddings_ruangan
    
    if not data_kamus_baru:
        print("[NLP] Peringatan: Database kosong, tidak ada yang dilatih.")
        return

    korpus_dokumen = []
    for sinonim in data_kamus_baru.values():
        teks_gabungan = " ".join(sinonim)
        korpus_dokumen.append(bersihkan_teks(teks_gabungan))

    # Latih ulang model Embeddings dengan data terbaru dari Firebase
    new_embeddings = model.encode(korpus_dokumen, convert_to_tensor=True)
    
    # KUNCI PENTING: Swap variabel secara atomik setelah komputasi 3-5 detik selesai
    # untuk mencegah Race Condition ketika ada pencarian berbarengan
    DATABASE_RUANGAN = data_kamus_baru
    daftar_nama_ruangan = list(DATABASE_RUANGAN.keys())
    embeddings_ruangan = new_embeddings

    print(f"[NLP] Model berhasil dilatih ulang! ({len(daftar_nama_ruangan)} Ruangan Aktif)")

# Fungsi pencocokan NLP utama  
def cari_target_ruangan(input_pengunjung, start_node_id=None, language="id"):
    # Cegah error jika database Firebase belum masuk
    if embeddings_ruangan is None or not daftar_nama_ruangan:
        pesan = "Sistem sedang memuat data peta, mohon tunggu." if language == "id" else "System is loading map data, please wait."
        return {"status": "error", "pesan": pesan}

    input_bersih = bersihkan_teks(input_pengunjung)
    if not input_bersih:
         pesan = "Mohon masukkan tujuan yang lebih spesifik." if language == "id" else "Please enter a more specific destination."
         return {"status": "error", "pesan": pesan}

    # HEURISTIC: Deteksi jika user HANYA ingin pergi ke suatu lantai (misal: "turun lantai 1", "lantai 2", dsb.)
    # Jika iya, kita akan arahkan mereka ke "Lift" di lantai tujuan tersebut.
    teks_cek = input_bersih.replace("naik", "").replace("turun", "").strip()
    match_lantai = re.fullmatch(r'lantai\s+(\w+)', teks_cek) # \w+ agar menangkap angka maupun string "dasar" dsb
    if match_lantai:
        target_floor = f"Lantai {match_lantai.group(1)}"
        import waypoint_graph
        for r_id, room in waypoint_graph.RUANGAN_GRID.items():
            if room.get("floor", "Lantai 1").lower() == target_floor.lower():
                nama = room.get("name", "").lower()
                if "lift" in nama and "tangga" not in nama:
                    return {
                        "status": "success",
                        "target_id": r_id,
                        "confidence_score": 1.0
                    }

    input_embedding = model.encode(input_bersih, convert_to_tensor=True)
    skor_kemiripan = util.cos_sim(input_embedding, embeddings_ruangan)[0].cpu().numpy()
    
    # Penalti Tangga Darurat jika user tidak secara spesifik mengetik "tangga"
    # agar rute antar lantai via pencarian NLP selalu memprioritaskan "Lift"
    if "tangga" not in input_bersih:
        for i, r_id in enumerate(daftar_nama_ruangan):
            nama_keywords = " ".join(DATABASE_RUANGAN.get(r_id, [])).lower()
            if "tangga" in nama_keywords:
                skor_kemiripan[i] -= 0.50
    
    # Cari skor maksimum
    max_score = np.max(skor_kemiripan)
    
    # Ambang batas dinaikkan ke 40% karena semantic embeddings menghasilkan skor cosine > 0 untuk banyak hal
    # Tapi kita ingin yang benar-benar relevan
    if max_score >= 0.40:
        # Cari semua kandidat yang memiliki skor kemiripan maksimum (atau sangat dekat dengan maks)
        kandidat_indeks = np.where(skor_kemiripan >= max_score - 0.01)[0]
        
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