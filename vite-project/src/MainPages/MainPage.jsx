import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router";
import { TransformWrapper, TransformComponent } from "react-zoom-pan-pinch";
import { collection, onSnapshot } from "firebase/firestore";
import { db } from "../firebase";
import SharedMap from "../components/SharedMap";
import "./Main.css";

// ── Icon components ──
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

export default function App() {
  const navigate = useNavigate();
  const [search,      setSearch]      = useState("");
  const [outputText,  setOutputText]  = useState("");
  const [location,    setLocation]    = useState(""); 
  const [floor,       setFloor]       = useState("Lantai 1"); 
  const [floors,      setFloors]      = useState(["Lantai 1"]); 
  const [isLoginOpen, setIsLoginOpen] = useState(false);
  const [username,    setUsername]    = useState("");
  const [password,    setPassword]    = useState("");
  const [kiosks,      setKiosks]      = useState([]);
  const [rooms,       setRooms]       = useState([]); // STATE BARU: Daftar Ruangan
  const [pathData,    setPathData]    = useState([]);
  const [targetRoomName, setTargetRoomName] = useState("");
  const [navigationSteps, setNavigationSteps] = useState([]);
  const [activeStepIndex, setActiveStepIndex] = useState(-1);

  useEffect(() => {
    // 1. Listen ke Kiosks
    const unsubscribeKiosks = onSnapshot(collection(db, "Kiosks"), (kioskSnap) => {
      const loadedKiosks = [];
      const foundFloors = new Set(["Lantai 1"]);

      kioskSnap.forEach((docSnap) => {
        const data = docSnap.data();
        loadedKiosks.push({ id: docSnap.id, ...data });
        if (data.floor) foundFloors.add(data.floor);
      });
      setKiosks(loadedKiosks);
      
      setFloors(prev => {
        const combined = new Set([...prev, ...foundFloors]);
        return Array.from(combined).sort();
      });
    });

    // 2. Listen ke Rooms
    const unsubscribeRooms = onSnapshot(collection(db, "Rooms"), (roomSnap) => {
      const foundFloors = new Set();
      const loadedRooms = [];

      roomSnap.forEach((docSnap) => {
        const data = docSnap.data();
        if (data.floor) foundFloors.add(data.floor);
        // Hanya masukkan ruangan yang sudah diberi nama ke dalam dropdown
        if (data.name && data.name !== "Tanpa Nama" && data.name.toLowerCase() !== "pintu masuk") {
          loadedRooms.push({ id: docSnap.id, name: data.name, floor: data.floor || "Lantai 1" });
        }
      });

      // Urutkan ruangan berdasarkan abjad (A-Z) agar rapi
      loadedRooms.sort((a, b) => a.name.localeCompare(b.name));
      setRooms(loadedRooms);

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

  const speakSteps = (langkahNavigasi) => {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      
      langkahNavigasi.forEach((step, index) => {
        const utterance = new SpeechSynthesisUtterance(step.teks);
        utterance.lang = 'id-ID';
        utterance.rate = 1.15;
        utterance.onstart = () => {
          setActiveStepIndex(index);
          if (step.floor) {
            setFloor(step.floor);
          }
        };
        
        // Reset setelah langkah terakhir selesai dibacakan + 3 detik
        if (index === langkahNavigasi.length - 1) {
          utterance.onend = () => {
            setTimeout(() => {
              setSearch("");
              setOutputText("");
              setLocation("");
              setFloor("Lantai 1");
              setPathData([]);
              setNavigationSteps([]);
              setActiveStepIndex(-1);
              setTargetRoomName("");
            }, 10000);
          };
        }

        window.speechSynthesis.speak(utterance);
      });
    }
  };

  // FUNGSI DIPERBARUI: Menerima parameter lokasi dan target
  const executeSearch = async (overrideLocation, overrideTarget) => {
    const searchLocation = typeof overrideLocation === 'string' ? overrideLocation : location;
    const searchTarget = typeof overrideTarget === 'string' ? overrideTarget : search;
    
    if (!searchTarget.trim()) return;
    
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
          teks_pencarian: searchTarget.trim()
        })
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        setOutputText(`Gagal: ${data.detail || "Terjadi kesalahan"}`);
        setPathData([]);
        setNavigationSteps([]);
        setActiveStepIndex(-1);
      } else {
        const roomName = data.data_target.nama_ruangan;
        setTargetRoomName(roomName);
        setPathData(data.jalur_koordinat);
        setNavigationSteps(data.langkah_navigasi);
        setActiveStepIndex(-1);
        
        let allText = "Teks navigasi tidak tersedia.";
        if (data.langkah_navigasi && data.langkah_navigasi.length > 0) {
            allText = data.langkah_navigasi.map(l => l.teks).join("\n\n");
            const finalText = `Rute ditemukan!\nMenuju: ${roomName}\n\n${allText}`;
            setOutputText(finalText);
            speakSteps(data.langkah_navigasi);
        } else {
            const fallbackText = `Rute ditemukan menuju ${roomName}`;
            setOutputText(fallbackText);
            
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

  const activePath = useMemo(() => {
    if (activeStepIndex === -1 || !navigationSteps.length || !pathData.length) return null;
    const startIndex = activeStepIndex === 0 ? 0 : navigationSteps[activeStepIndex - 1].index_akhir;
    const endIndex = navigationSteps[activeStepIndex].index_akhir;
    return pathData.slice(startIndex, endIndex + 1);
  }, [pathData, navigationSteps, activeStepIndex]);

  const handleSearchKey = (e) => {
    if (e.key === "Enter") {
      executeSearch(location, search);
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
      <header className="header">
        <span className="header-logo">Wayfinder</span>
        <button className="header-login-btn Onclick" onClick={() => setIsLoginOpen(true)}>
          <LoginIcon />
          Login
        </button>
      </header>

      {isLoginOpen && (
        <div className="modal-overlay" onClick={() => setIsLoginOpen(false)}>
          <div className="login-modal" onClick={(e) => e.stopPropagation()}>
            <button className="close-btn" onClick={() => setIsLoginOpen(false)}>×</button>
            <h2>ADMIN LOGIN PAGE</h2>
            <div className="input-group">
              <label>Username</label>
              <input type="text" value={username} onChange={(e) => setUsername(e.target.value)} onKeyDown={(e) => e.key === "Enter" && handleLogin()} />
            </div>
            <div className="input-group">
              <label>Password</label>
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} onKeyDown={(e) => e.key === "Enter" && handleLogin()} />
            </div>
            <button className="submit-login-btn" onClick={handleLogin}>LOGIN</button>
          </div>
        </div>
      )}

      <div className="main-layout">
        <aside className="left-panel">
          
          <div className="search-wrapper">
            <input
              className="search-input"
              type="text"
              placeholder="Search destination"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={handleSearchKey}
            />
            <div style={{ cursor: "pointer", display: "flex", alignItems: "center" }} onClick={() => executeSearch(location, search)}>
              <SearchIcon />
            </div>
          </div>

          <textarea
            className="destination-output"
            placeholder="Destination output text"
            value={outputText}
            readOnly
            style={{ minHeight: "100px", marginTop: "15px" }}
          />

          {/* KIOSK DROPDOWN */}
          <div className="dropdown-wrapper">
            <select
              className="dropdown-select"
              value={location}
              onChange={(e) => {
                const newLocation = e.target.value;
                setLocation(newLocation);
                if (search.trim()) {
                  executeSearch(newLocation, search);
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

          {/* RUANGAN DROPDOWN (BARU) */}
          <div className="dropdown-wrapper" style={{ marginTop: "12px" }}>
            <select
              className="dropdown-select"
              // Set value blank jika teks search diketik custom dan tidak ada di dropdown
              value={rooms.some(r => r.name === search) ? search : ""}
              onChange={(e) => {
                const newTarget = e.target.value;
                setSearch(newTarget); // Sinkronkan dropdown ke kotak teks
                executeSearch(location, newTarget);
              }}
            >
              <option value="" disabled>Pilih Ruangan Tujuan</option>
              {rooms.map((room) => (
                <option key={room.id} value={room.name}>{room.name}</option>
              ))}
            </select>
            <ChevronIcon />
          </div>

          <div className="floor-group">
            <div className="dropdown-wrapper">
              <select
                className="dropdown-select"
                value={(() => {
                  if (floor.startsWith("submap_")) {
                    const parentId = floor.replace("submap_", "");
                    const parent = rooms.find(r => r.id === parentId);
                    return parent ? parent.floor : "Lantai 1";
                  }
                  return floor;
                })()}
                onChange={(e) => setFloor(e.target.value)}
              >
                <option value="" disabled>Pilih Lantai</option>
                {floors.filter(f => !f.startsWith("submap_")).map((f) => (
                  <option key={f} value={f}>{f}</option>
                ))}
              </select>
              <ChevronIcon />
            </div>
            {floor && (
              <div className="floor-selected-chip">
                {(() => {
                  if (floor.startsWith("submap_")) {
                    const parentId = floor.replace("submap_", "");
                    const parent = rooms.find(r => r.id === parentId);
                    return parent ? parent.floor : "Lantai 1";
                  }
                  return floor;
                })()}
              </div>
            )}
          </div>

        </aside>

        <main className="map-panel" style={{ position: "relative" }}>
          {floor.startsWith("submap_") && (
              <button 
                  onClick={() => {
                      const parentRoomId = floor.replace("submap_", "");
                      const parentRoom = rooms.find(r => r.id === parentRoomId);
                      setFloor(parentRoom?.floor || "Lantai 1");
                  }}
                  style={{ position: "absolute", top: "20px", left: "20px", zIndex: 100, padding: "10px 20px", background: "#FF9800", color: "white", border: "none", borderRadius: "8px", cursor: "pointer", fontWeight: "bold", boxShadow: "0 4px 6px rgba(0,0,0,0.1)" }}
              >
                  🔙 Kembali ke Lantai Utama
              </button>
          )}
          <TransformWrapper initialScale={1} minScale={0.5} maxScale={5} centerOnInit={true}>
            <TransformComponent wrapperStyle={{ width: "100%", height: "100%", cursor: "grab" }} contentStyle={{ width: "100%", height: "100vh" }}>
              <div className="map-content" style={{ width: "100%", height: "100%" }}>
                <SharedMap 
                  path={pathData} 
                  activePath={activePath}
                  currentFloor={floor} 
                  onRoomClick={(room) => {
                      if (floors.includes(`submap_${room.id}`)) {
                          setFloor(`submap_${room.id}`);
                      }
                  }}
                />
              </div>
            </TransformComponent>
          </TransformWrapper>
        </main>
      </div>
    </div>
  );
}