import { useState, useEffect } from "react";
import { useNavigate } from "react-router";
import { TransformWrapper, TransformComponent } from "react-zoom-pan-pinch";
import { collection, onSnapshot } from "firebase/firestore";
import { db } from "../firebase";
import SharedMap from "../components/SharedMap";
import "./Main.css";

// ── Icon components (inline SVG, no extra deps needed) ──
const SearchIcon = () => (
  <svg className="search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="11" cy="11" r="8" />
    <line x1="21" y1="21" x2="16.65" y2="16.65" />
  </svg>
);

const ChevronIcon = () => (
  <svg className="dropdown-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="6 9 12 15 18 9" />
  </svg>
);

const LoginIcon = () => (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
    <polyline points="10 17 15 12 10 7" />
    <line x1="15" y1="12" x2="3" y2="12" />
  </svg>
);

// BARIS YANG SALAH DI LUAR KOMPONEN SUDAH DIHAPUS

// ── Main component ───────────────────────────────────────
export default function App() {
  const navigate = useNavigate();
  const [search,      setSearch]      = useState("");
  const [outputText,  setOutputText]  = useState("");
  const [location,    setLocation]    = useState(""); // Menyimpan ID Kiosk
  
  // PERBAIKAN: Menambahkan state 'floor' untuk lantai aktif dan 'floors' untuk daftar lantai
  const [floor,       setFloor]       = useState("Lantai 1"); 
  const [floors,      setFloors]      = useState(["Lantai 1"]); 
  
  const [isLoginOpen, setIsLoginOpen] = useState(false);
  const [username,    setUsername]    = useState("");
  const [password,    setPassword]    = useState("");
  const [kiosks,      setKiosks]      = useState([]);
  const [pathData,    setPathData]    = useState([]);
  const [targetRoomName, setTargetRoomName] = useState("");

  // Fetch kiosk data DAN deteksi lantai secara dinamis
  useEffect(() => {
    // 1. Listen ke Kiosks
    const unsubscribeKiosks = onSnapshot(collection(db, "Kiosks"), (kioskSnap) => {
      const loadedKiosks = [];
      const foundFloors = new Set(["Lantai 1"]); // Selalu mulai dengan Lantai 1 sebagai default

      kioskSnap.forEach((docSnap) => {
        const data = docSnap.data();
        loadedKiosks.push({ id: docSnap.id, ...data });
        if (data.floor) foundFloors.add(data.floor);
      });
      setKiosks(loadedKiosks);
      
      // Update daftar lantai jika ditemukan lantai baru di Kiosks
      setFloors(prev => {
        const combined = new Set([...prev, ...foundFloors]);
        return Array.from(combined).sort();
      });
    });

    // 2. Listen ke Rooms (Karena lantai baru mungkin cuma berisi ruangan tanpa kiosk)
    const unsubscribeRooms = onSnapshot(collection(db, "Rooms"), (roomSnap) => {
      const foundFloors = new Set();
      roomSnap.forEach((docSnap) => {
        const data = docSnap.data();
        if (data.floor) foundFloors.add(data.floor);
      });

      // Update daftar lantai jika ditemukan lantai baru di Rooms
      setFloors(prev => {
        const combined = new Set([...prev, ...foundFloors]);
        return Array.from(combined).sort();
      });
    });

    return () => {
      unsubscribeKiosks();
      unsubscribeRooms();
    };
  }, []);

  // Fungsi Text-to-Speech (Membacakan Teks per langkah)
  const speakSteps = (langkahNavigasi) => {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel(); // Hentikan suara sebelumnya
      
      langkahNavigasi.forEach((step) => {
        const utterance = new SpeechSynthesisUtterance(step.teks);
        utterance.lang = 'id-ID'; // Aksen Bahasa Indonesia
        utterance.rate = 1.15; // Dipercepat sedikit
        utterance.onstart = () => {
          // Ketika teks ini mulai dibacakan, ganti floor UI sesuai floor langkah ini
          if (step.floor) {
            setFloor(step.floor);
          }
        };
        window.speechSynthesis.speak(utterance);
      });
    }
  };

  // Fungsi pencarian dan navigasi
  const executeSearch = async (overrideLocation) => {
    const searchLocation = typeof overrideLocation === 'string' ? overrideLocation : location;
    
    if (!search.trim()) return;
    
    if (!searchLocation) {
      setOutputText("Silakan pilih Kiosk awal terlebih dahulu.");
      return;
    }

    setOutputText("Mencari rute...");
    try {
      const response = await fetch("http://127.0.0.1:8000/api/route", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          start_node_id: searchLocation,
          teks_pencarian: search.trim()
        })
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        setOutputText(`Gagal: ${data.detail || "Terjadi kesalahan"}`);
        setPathData([]);
      } else {
        const roomName = data.data_target.nama_ruangan;
        setTargetRoomName(roomName);
        
        setPathData(data.jalur_koordinat);
        
        let allText = "Teks navigasi tidak tersedia.";
        if (data.langkah_navigasi && data.langkah_navigasi.length > 0) {
            allText = data.langkah_navigasi.map(l => l.teks).join("\n\n");
            
            const finalText = `Rute ditemukan!\nMenuju: ${roomName}\n\n${allText}`;
            setOutputText(finalText);
            
            // Antrekan bacaan per langkah agar bisa ganti lantai otomatis
            speakSteps(data.langkah_navigasi);
        } else {
            const fallbackText = `Rute ditemukan menuju ${roomName}`;
            setOutputText(fallbackText);
            
            // Set floor otomatis ke lantai awal (jika ada koordinat)
            if (data.jalur_koordinat && data.jalur_koordinat.length > 0 && data.jalur_koordinat[0].floor) {
                setFloor(data.jalur_koordinat[0].floor);
            }
            
            if ('speechSynthesis' in window) {
              window.speechSynthesis.cancel();
              const utterance = new SpeechSynthesisUtterance(fallbackText);
              utterance.lang = 'id-ID';
              utterance.rate = 1.15;
              window.speechSynthesis.speak(utterance);
            }
        }
      }
    } catch (error) {
      setOutputText(`Error: Tidak dapat terhubung ke server (${error.message})`);
      setPathData([]);
    }
  };

  const handleSearchKey = (e) => {
    if (e.key === "Enter") {
      executeSearch();
    }
  };

  const handleLogin = () => {
    if (username.trim() && password.trim()) {
      setIsLoginOpen(false);
      setUsername("");
      setPassword("");
      navigate("/admin");
    }
  };

  return (
    <div>
      {/* ── Header ── */}
      <header className="header">
        <span className="header-logo">Wayfinder</span>
        <button className="header-login-btn Onclick" onClick={() => setIsLoginOpen(true)}>
          <LoginIcon />
          Login
        </button>
      </header>

      {/* MODAL LOGIN */}
      {isLoginOpen && (
        <div className="modal-overlay" onClick={() => setIsLoginOpen(false)}>
          <div className="login-modal" onClick={(e) => e.stopPropagation()}>
            <button className="close-btn" onClick={() => setIsLoginOpen(false)}>×</button>
            <h2>ADMIN LOGIN PAGE</h2>
            <div className="input-group">
              <label>Username</label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleLogin()}
              />
            </div>
            <div className="input-group">
              <label>Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleLogin()}
              />
            </div>
            <button className="submit-login-btn" onClick={handleLogin}>LOGIN</button>
          </div>
        </div>
      )}

      {/* ── Body ── */}
      <div className="main-layout">

        {/* Left panel */}
        <aside className="left-panel">

          {/* Search destination */}
          <div className="search-wrapper">
            <input
              className="search-input"
              type="text"
              placeholder="Search destination"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={handleSearchKey}
            />
            <div style={{ cursor: "pointer", display: "flex", alignItems: "center" }} onClick={() => executeSearch()}>
              <SearchIcon />
            </div>
          </div>

          {/* Destination output */}
          <textarea
            className="destination-output"
            placeholder="Destination output text"
            value={outputText}
            readOnly
            style={{ minHeight: "100px" }}
          />

          {/* Location dropdown */}
          <div className="dropdown-wrapper">
            <select
              className="dropdown-select"
              value={location}
              onChange={(e) => {
                const newLocation = e.target.value;
                setLocation(newLocation);
                if (search.trim()) {
                  executeSearch(newLocation);
                }
              }}
            >
              <option value="" disabled>Pilih Kiosk Awal</option>
              {kiosks.map((kiosk) => (
                <option key={kiosk.id} value={kiosk.id}>
                  {kiosk.name || kiosk.id}
                </option>
              ))}
            </select>
            <ChevronIcon />
          </div>

          {/* Floor dropdown */}
          <div className="floor-group">
            <div className="dropdown-wrapper">
              <select
                className="dropdown-select"
                value={floor}
                onChange={(e) => setFloor(e.target.value)}
              >
                <option value="" disabled>Pilih Lantai</option>
                {floors.map((f) => (
                  <option key={f} value={f}>{f}</option>
                ))}
              </select>
              <ChevronIcon />
            </div>
            {floor && (
              <div className="floor-selected-chip">{floor}</div>
            )}
          </div>

        </aside>

        <main className="map-panel">
          <TransformWrapper
            initialScale={1}
            minScale={0.5}
            maxScale={5}
            centerOnInit={true}
          >
            <TransformComponent
              wrapperStyle={{ width: "100%", height: "100%", cursor: "grab" }}
              contentStyle={{ width: "100%", height: "100vh" }}
            >
              <div className="map-content" style={{ width: "100%", height: "100%" }}>
                <SharedMap path={pathData} currentFloor={floor} />
              </div>
            </TransformComponent>
          </TransformWrapper>
        </main>
      </div>
    </div>
  );
}