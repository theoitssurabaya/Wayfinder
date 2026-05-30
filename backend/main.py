# main.py
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from fastapi.middleware.cors import CORSMiddleware
from database import db, listen_to_firestore 
import threading
import waypoint_graph
from nlp_engine import cari_target_ruangan
from a_star import cari_rute_grid
from nlp_engine import cari_target_ruangan, latih_ulang_nlp

# Model data untuk validasi input ruangan
class RoomModel(BaseModel):
    name: str
    grid_x: int
    grid_y: int
    grid_width: int = 1
    grid_height: int = 1
    keywords: list[str] = []

# Fungsi jembatan ke firestore
def sinkronisasi_peta(data):
    """Mengupdate koordinat dan melatih ulang NLP saat database berubah"""
    print("\n[FIREBASE] Pembaruan denah terdeteksi dari React UI...")
    
    data_nlp_baru = {} # Menampung kamus sementara untuk NLP
    
    # Variabel sementara agar tidak terjadi race condition saat A* dipanggil bersamaan
    temp_ruangan = {}
    temp_grid = {}
    for item in data:
        # Gunakan id_dokumen (contoh: "R016") sebagai penanda unik
        room_id = item.get("id_dokumen") 
        room_name = item.get("name", "Tanpa Nama")
        
        if room_id and "grid_x" in item and "grid_y" in item:
            gx = item["grid_x"]
            gy = item["grid_y"]
            gw = item.get("grid_width", 1)
            gh = item.get("grid_height", 1)
            
            endpoints = item.get("endpoints", ["bottom"])
            
            door_coords = []
            for ep in endpoints:
                if ep == "top":
                    door_coords.append((gx + gw//2, gy))
                elif ep == "bottom":
                    door_coords.append((gx + gw//2, gy + gh - 1))
                elif ep == "left":
                    door_coords.append((gx, gy + gh//2))
                elif ep == "right":
                    door_coords.append((gx + gw - 1, gy + gh//2))
            
            floor = item.get("floor", "Lantai 1")
            
            # 1. Update Memori Sementara untuk Algoritma Theo
            temp_ruangan[room_id] = {
                "x": gx,
                "y": gy,
                "w": gw,
                "h": gh,
                "door_coords": door_coords,
                "name": room_name,
                "floor": floor
            }
            
            # Ambil grid untuk lantai ini (buat baru jika belum ada)
            if floor not in temp_grid:
                temp_grid[floor] = [[0 for _ in range(waypoint_graph.GRID_WIDTH)] for _ in range(waypoint_graph.GRID_HEIGHT)]
            grid = temp_grid[floor]
            
            # Tandai area ruangan/kiosk sebagai rintangan (1)
            for dy in range(gh):
                for dx in range(gw):
                    ny = gy + dy
                    nx = gx + dx
                    if 0 <= ny < waypoint_graph.GRID_HEIGHT and 0 <= nx < waypoint_graph.GRID_WIDTH:
                        grid[ny][nx] = 1
            
            # 2. Update Memori Kamus NLP
            kata_kunci = item.get("keywords", [])
            # Pastikan nama asli ruangan selalu menjadi salah satu keyword untuk NLP
            if room_name not in kata_kunci:
                kata_kunci.append(room_name)
            
            # NLP juga harus dipetakan menggunakan room_id
            data_nlp_baru[room_id] = kata_kunci
            
            print(f" -> Load: [{room_id}] '{room_name}' (X:{item['grid_x']}, Y:{item['grid_y']})")

    # 3. Swap Secara Atomik untuk mencegah Race Condition
    waypoint_graph.RUANGAN_GRID.clear()
    waypoint_graph.RUANGAN_GRID.update(temp_ruangan)
    waypoint_graph.GRID_MAP.clear()
    waypoint_graph.GRID_MAP.update(temp_grid)

    # 4. Eksekusi Pelatihan Ulang NLP secara Real-Time
    latih_ulang_nlp(data_nlp_baru)
    print("[FIREBASE] Sinkronisasi selesai. Matriks A* dan Model NLP siap digunakan!")

# Jalankan listener di thread terpisah agar tidak mengganggu FastAPI
threading.Thread(target=listen_to_firestore, args=(sinkronisasi_peta,), daemon=True).start()

app = FastAPI(title="Smart Hospital Guide API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class RequestRute(BaseModel):
    start_node_id: str
    teks_pencarian: str
    language: str = "id"

# Endpoint navigasi

@app.get("/")
def home():
    return {
        "message": "Server Smart Hospital Backend Aktif!",
        "status": "Bridge Active & Listening to Firestore"
    }

@app.post("/api/route")
def dapatkan_rute(request: RequestRute):
    hasil_nlp = cari_target_ruangan(request.teks_pencarian, request.start_node_id, request.language)
    if hasil_nlp["status"] == "error":
        raise HTTPException(status_code=400, detail=hasil_nlp["pesan"])
        
    target_id = hasil_nlp["target_id"]
    
    hasil_rute = cari_rute_grid(request.start_node_id, target_id, request.language)
    if hasil_rute["status"] == "error":
         raise HTTPException(status_code=400, detail=hasil_rute["pesan"])
         
    return {
        "status": "success",
        "pesan": "Rute grid berhasil ditemukan",
        "data_target": {
            "id_ruangan": target_id,
            "nama_ruangan": waypoint_graph.RUANGAN_GRID.get(target_id, {}).get("name", target_id),
            "confidence_nlp": hasil_nlp["confidence_score"]
        },
        "jalur_koordinat": hasil_rute["jalur_grid"],
        "langkah_navigasi": hasil_rute["teks_navigasi"]
    }

# Endpoint CRUD untuk manajemen ruangan (Admin)
# Tambah/update ruangan (POST)
@app.post("/api/rooms/{room_id}")
def simpan_ruangan(room_id: str, room: RoomModel):
    try:
        # Menggunakan .set() untuk membuat atau menimpa dokumen berdasarkan ID (misal: R001)
        db.collection('Rooms').document(room_id).set(room.dict())
        return {"status": "success", "message": f"Ruangan {room_id} berhasil disimpan."}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Gagal menyimpan data: {str(e)}")

# Edit koordinat/nama (PATCH)
@app.patch("/api/rooms/{room_id}")
def update_ruangan(room_id: str, updates: dict):
    try:
        # Digunakan untuk update parsial, misal saat drag-and-drop hanya koordinat yang berubah
        db.collection('Rooms').document(room_id).update(updates)
        return {"status": "success", "message": f"Data {room_id} berhasil diperbarui."}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Gagal memperbarui data: {str(e)}")

# Hapus ruangan (DELETE)
@app.delete("/api/rooms/{room_id}")
def hapus_ruangan(room_id: str):
    try:
        db.collection('Rooms').document(room_id).delete()
        return {"status": "success", "message": f"Ruangan {room_id} berhasil dihapus."}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Gagal menghapus data: {str(e)}")