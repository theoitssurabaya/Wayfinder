# main.py
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from fastapi.middleware.cors import CORSMiddleware
import threading
import socket
import os
import json
from dotenv import load_dotenv
import google.generativeai as genai
from app.core.database import db, listen_to_firestore 
from app.core import state as waypoint_graph
from app.services.nlp_service import cari_target_ruangan, latih_ulang_nlp
from app.services.a_star_service import cari_rute_grid
from app.models.schemas import RoomModel, RoomUpdateModel
from loguru import logger

load_dotenv()
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
if GEMINI_API_KEY:
    genai.configure(api_key=GEMINI_API_KEY)

# Lock global untuk mencegah race condition dari Firebase thread pool
sync_lock = threading.Lock()

def sinkronisasi_peta(data):
    """Mengupdate koordinat dan melatih ulang NLP saat database berubah"""
    with sync_lock:
        logger.info("[FIREBASE] Pembaruan denah terdeteksi dari React UI...")
        
        data_nlp_baru = {}
        
        temp_ruangan = {}
        temp_grid = {}
        for item in data:
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
                
                temp_ruangan[room_id] = {
                    "x": gx,
                    "y": gy,
                    "w": gw,
                    "h": gh,
                    "door_coords": door_coords,
                    "name": room_name,
                    "name_en": item.get("name_en", ""),
                    "floor": floor
                }
                
                if floor not in temp_grid:
                    temp_grid[floor] = [[0 for _ in range(waypoint_graph.GRID_WIDTH)] for _ in range(waypoint_graph.GRID_HEIGHT)]
                grid = temp_grid[floor]
                
                for dy in range(gh):
                    for dx in range(gw):
                        ny = gy + dy
                        nx = gx + dx
                        if 0 <= ny < waypoint_graph.GRID_HEIGHT and 0 <= nx < waypoint_graph.GRID_WIDTH:
                            grid[ny][nx] = 1
                
                kata_kunci = item.get("keywords", [])
                if room_name not in kata_kunci:
                    kata_kunci.append(room_name)
                
                data_nlp_baru[room_id] = kata_kunci
                
                logger.debug(f" -> Load: [{room_id}] '{room_name}' (X:{item['grid_x']}, Y:{item['grid_y']})")

        # Tambahkan nama ruangan induk ke node submap untuk pencocokan NLP yang lebih baik
        for room_id, room in temp_ruangan.items():
            if room["floor"].startswith("submap_"):
                parent_id = room["floor"].replace("submap_", "")
                parent_room = temp_ruangan.get(parent_id)
                if parent_room:
                    parent_name = parent_room["name"]
                    kunci = data_nlp_baru.get(room_id, [])
                    # Tambahkan kombinasi nama (contoh: "Pintu Masuk Poli Gigi")
                    kunci.append(f"{room['name']} {parent_name}")

        waypoint_graph.RUANGAN_GRID.clear()
        waypoint_graph.RUANGAN_GRID.update(temp_ruangan)
        waypoint_graph.GRID_MAP.clear()
        waypoint_graph.GRID_MAP.update(temp_grid)

        latih_ulang_nlp(data_nlp_baru)
        logger.info("[FIREBASE] Sinkronisasi selesai. Matriks A* dan Model NLP siap digunakan!")

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
    current_floor: str = None

class RequestTranslate(BaseModel):
    names: list[str]

@app.post("/api/translate")
def translate_names(request: RequestTranslate):
    translations = {}
    names_to_translate = []
    
    for name in request.names:
        if not name:
            continue
        if "lift" in name.lower():
            translations[name] = {
                "id": name,
                "en": name
            }
        else:
            names_to_translate.append(name)
            
    if names_to_translate and GEMINI_API_KEY:
        try:
            model = genai.GenerativeModel('gemini-2.5-flash')
            prompt = f"""
You are an expert translator for a smart hospital guide application. 
Your task is to translate the following Indonesian hospital room names into English medical/hospital terminology.
Return the result as a raw JSON object (without markdown blocks like ```json) where keys are the original Indonesian names, and values are the English translations.

Names to translate:
{json.dumps(names_to_translate)}
"""
            response = model.generate_content(prompt)
            result_text = response.text.strip()
            if result_text.startswith("```json"):
                result_text = result_text.replace("```json", "").replace("```", "").strip()
            elif result_text.startswith("```"):
                result_text = result_text.replace("```", "").strip()
            
            translated_dict = json.loads(result_text)
            
            for name in names_to_translate:
                en_name = translated_dict.get(name, name)
                translations[name] = {
                    "id": name,
                    "en": en_name
                }
        except Exception as e:
            logger.error(f"Gemini translation failed: {e}")
            for name in names_to_translate:
                translations[name] = {
                    "id": name,
                    "en": name
                }
    else:
        for name in names_to_translate:
            translations[name] = {
                "id": name,
                "en": name
            }

    return {
        "status": "success",
        "translations": translations
    }

@app.get("/")
def home():
    return {
        "message": "Server Smart Hospital Backend Aktif!",
        "status": "Bridge Active & Listening to Firestore"
    }

@app.get("/api/ip")
def get_server_ip():
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(('10.255.255.255', 1))
        ip = s.getsockname()[0]
        s.close()
        return {"ip": ip}
    except Exception:
        return {"ip": "127.0.0.1"}

@app.post("/api/route")
def dapatkan_rute(request: RequestRute):
    hasil_nlp = cari_target_ruangan(request.teks_pencarian, request.start_node_id, request.language, request.current_floor)
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
            "nama_ruangan_en": waypoint_graph.RUANGAN_GRID.get(target_id, {}).get("name_en", ""),
            "confidence_nlp": hasil_nlp["confidence_score"]
        },
        "jalur_koordinat": hasil_rute["jalur_grid"],
        "langkah_navigasi": hasil_rute["teks_navigasi"]
    }

@app.post("/api/rooms/{room_id}")
def simpan_ruangan(room_id: str, room: RoomModel):
    try:
        db.collection('Rooms').document(room_id).set(room.dict())
        return {"status": "success", "message": f"Ruangan {room_id} berhasil disimpan."}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Gagal menyimpan data: {str(e)}")

@app.patch("/api/rooms/{room_id}")
def update_ruangan(room_id: str, updates: RoomUpdateModel):
    try:
        update_data = {k: v for k, v in updates.dict().items() if v is not None}
        if not update_data:
            return {"status": "success", "message": "Tidak ada data yang diubah."}
            
        db.collection('Rooms').document(room_id).update(update_data)
        return {"status": "success", "message": f"Data {room_id} berhasil diperbarui."}
    except Exception as e:
        logger.error(f"Gagal memperbarui data {room_id}: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Gagal memperbarui data: {str(e)}")

@app.delete("/api/rooms/{room_id}")
def hapus_ruangan(room_id: str):
    try:
        db.collection('Rooms').document(room_id).delete()
        return {"status": "success", "message": f"Ruangan {room_id} berhasil dihapus."}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Gagal menghapus data: {str(e)}")