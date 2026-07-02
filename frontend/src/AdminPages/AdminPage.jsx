import { useState, useEffect, useMemo, useRef } from "react";
import LogoImg from '../assets/Logo.png';
import { useNavigate } from "react-router";
import { TransformWrapper, TransformComponent } from "react-zoom-pan-pinch";
import { collection, onSnapshot, doc, updateDoc, query, orderBy, limit, addDoc, serverTimestamp, deleteDoc, getDocs, where } from "firebase/firestore";
import { db } from "../firebase";
import SharedMap from "../components/SharedMap";
import { translateName } from "../utils/translator";
import { UAParser } from "ua-parser-js";
import { AlertDialog } from "../components/Dialogs";
import LanguageSelector from "../components/LanguageSelector";
import "./Admin.css";

const formatDevice = (uaString) => {
  if (!uaString) return "";
  const parser = new UAParser(uaString);
  const result = parser.getResult();
  const device = result.device || {};
  const os = result.os || {};
  const browser = result.browser || {};
  const cpu = result.cpu || {};
  const engine = result.engine || {};
  
  let parts = [];
  if (device.vendor || device.model) {
    parts.push(`${device.vendor || ""} ${device.model || ""}`.trim());
  } else if (device.type) {
    parts.push(device.type.charAt(0).toUpperCase() + device.type.slice(1));
  } else {
    parts.push("Desktop/Laptop");
  }

  let osInfo = `${os.name || "Unknown OS"} ${os.version || ""}`.trim();
  if (cpu.architecture) {
    osInfo += ` (${cpu.architecture})`;
  }
  parts.push(osInfo);

  let browserInfo = `${browser.name || "Unknown Browser"} ${browser.version || ""}`.trim();
  if (engine.name) {
    browserInfo += ` [${engine.name}]`;
  }
  parts.push(browserInfo);
  
  return parts.join(" • ") || uaString;
};


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

const EditIcon = () => (
  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
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
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const [lockedKiosk, setLockedKiosk] = useState(localStorage.getItem("locked_kiosk_id") || "");
  const [kioskToLock, setKioskToLock] = useState("");
  const [isLockConfirmOpen, setIsLockConfirmOpen] = useState(false);
  const [isUnlockConfirmOpen, setIsUnlockConfirmOpen] = useState(false);
  const [kiosks,      setKiosks]      = useState([]);
  const [rooms,       setRooms]       = useState([]);
  const [pathData,    setPathData]    = useState([]);
  const [targetRoomName, setTargetRoomName] = useState("");
  const [navigationSteps, setNavigationSteps] = useState([]);
  const [activeStepIndex, setActiveStepIndex] = useState(-1);
  const [language, setLanguage] = useState(localStorage.getItem('language') || 'id');
  const [isDarkMode, setIsDarkMode] = useState(() => {
    return localStorage.getItem('theme') === 'dark';
  });

  const [customAlert, setCustomAlert] = useState({ isOpen: false, message: '' });
  const showAlert = (message) => setCustomAlert({ isOpen: true, message });

  const [activities, setActivities] = useState([]);

  const addActivityLog = async (titleId, titleEn, descId, descEn) => {
    try {
      const userAgent = navigator.userAgent;
      await addDoc(collection(db, "Logs"), {
        timestamp: serverTimestamp(),
        title: { id: titleId, en: titleEn },
        desc: { id: descId, en: descEn },
        device: userAgent,
        ram: navigator.deviceMemory || null,
        cores: navigator.hardwareConcurrency || null
      });
    } catch (e) {
      console.error("Failed to add activity log", e);
    }
  };
  useEffect(() => {
    document.body.classList.toggle('dark-mode', isDarkMode);
  }, [isDarkMode]);

  const toggleTheme = () => {
    const newTheme = !isDarkMode ? 'dark' : 'light';
    setIsDarkMode(!isDarkMode);
    localStorage.setItem('theme', newTheme);
    document.body.classList.toggle('dark-mode', newTheme === 'dark');
  };

  const getText = (key) => {
    const dict = {
      'logout': { id: 'Keluar', en: 'Logout' },
      'search_placeholder': { id: 'Cari poli atau keluhan...', en: 'Search clinic or symptoms...' },
      'output_placeholder': { id: 'Keterangan rute akan muncul di sini', en: 'Destination output text will appear here' },
      'select_kiosk': { id: 'Pilih Kios Awal', en: 'Select Start Kiosk' },
      'select_room': { id: 'Pilih Ruangan Tujuan', en: 'Select Destination Room' },
      'select_floor': { id: 'Pilih Lantai', en: 'Select Floor' },
      'fail_kiosk_first': { id: 'Silakan pilih Kios awal terlebih dahulu.', en: 'Please select a starting Kiosk first.' },
      'searching': { id: 'Mencari rute...', en: 'Searching for route...' },
      'failed': { id: 'Gagal:', en: 'Failed:' },
      'route_found': { id: 'Rute ditemukan!', en: 'Route found!' },
      'towards': { id: 'Menuju:', en: 'Towards:' },
      'no_nav_text': { id: 'Teks navigasi tidak tersedia.', en: 'Navigation text is not available.' },
      'edit': { id: 'Edit', en: 'Edit' },
      'confirm_logout': { id: 'Konfirmasi Logout', en: 'Confirm Logout' },
      'are_you_sure_logout': { id: 'Apakah Anda yakin ingin logout?', en: 'Are you sure you want to logout?' },
      'no': { id: 'Tidak', en: 'No' },
      'yes': { id: 'Iya', en: 'Yes' },
      'back_to_main_floor': { id: 'Kembali ke Lantai Utama', en: 'Back to Main Floor' },
      'set_kiosk_placeholder': { id: 'Set Kios Perangkat...', en: 'Set Device Kiosk...' },
      'lock': { id: 'Kunci', en: 'Lock' },
      'unlock': { id: 'Buka Kunci', en: 'Unlock' },
      'confirm_lock_title': { id: 'Konfirmasi Kunci Kios', en: 'Confirm Kiosk Lock' },
      'are_you_sure_lock': { id: 'Apakah Anda yakin ingin mengunci perangkat ini sebagai', en: 'Are you sure you want to lock this device as' },
      'confirm_unlock_title': { id: 'Konfirmasi Buka Kunci', en: 'Confirm Unlock' },
      'are_you_sure_unlock': { id: 'Apakah Anda yakin ingin melepas kunci Kios perangkat ini?', en: 'Are you sure you want to unlock this device?' },
      'fail_lock_kiosk': { id: 'Gagal mengunci kios di database.', en: 'Failed to lock kiosk in database.' },
      'fail_unlock_kiosk': { id: 'Gagal update DB saat unlock', en: 'Failed to update DB on unlock' }
    };
    return dict[key] ? dict[key][language] : key;
  };

  const handleLanguageChange = (e) => {
    const newLang = e.target.value;
    setLanguage(newLang);
    localStorage.setItem('language', newLang);

    const translatedSearch = search ? translateName(search, newLang) : search;
    if (search) setSearch(translatedSearch);
    if (targetRoomName) setTargetRoomName(translateName(targetRoomName, newLang));

    if (navigationSteps.length > 0) {
      executeSearch(location, translatedSearch, newLang, activeStepIndex >= 0 ? activeStepIndex : 0);
    } else if (outputText) {
      setOutputText("");
    }
  };

  const hasAutoSwitchedFloor = useRef(false);
  const floorOrderRef = useRef({});

  useEffect(() => {
    // Membersihkan semua log lama (lebih dari 1 bulan) di background
    const cleanOldLogs = async () => {
      try {
        const oneMonthAgo = new Date();
        oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);
        const qOldLogs = query(collection(db, "Logs"), where("timestamp", "<", oneMonthAgo));
        const oldLogsSnap = await getDocs(qOldLogs);
        oldLogsSnap.forEach(docSnap => {
          deleteDoc(doc(db, "Logs", docSnap.id)).catch(err => console.error("Error deleting old log:", err));
        });
      } catch (e) {
        console.error("Failed to clean old logs", e);
      }
    };
    cleanOldLogs();

    const unsubscribeKiosks = onSnapshot(collection(db, "Kiosks"), (kioskSnap) => {
      const loadedKiosks = [];
      const foundFloors = new Set(["Lantai 1"]);

      let floorToSwitch = null;

      kioskSnap.forEach((docSnap) => {
        const data = docSnap.data();
        loadedKiosks.push({ id: docSnap.id, ...data });
        if (data.floor) foundFloors.add(data.floor);

        const lockedId = localStorage.getItem("locked_kiosk_id");
        if (lockedId && docSnap.id === lockedId && data.floor) {
          floorToSwitch = data.floor;
        }
      });
      setKiosks(loadedKiosks);
      
      setFloors(prev => {
        const combined = new Set([...prev, ...foundFloors]);
        return Array.from(combined).sort((a, b) => {
          const idxA = floorOrderRef.current.indexOf(a);
          const idxB = floorOrderRef.current.indexOf(b);
          if (idxA !== -1 && idxB !== -1) return idxA - idxB;
          if (idxA !== -1) return -1;
          if (idxB !== -1) return 1;
          return a.localeCompare(b);
        });
      });

      if (floorToSwitch && !hasAutoSwitchedFloor.current) {
        setFloor(floorToSwitch);
        hasAutoSwitchedFloor.current = true;
      }
    });


    const unsubscribeRooms = onSnapshot(collection(db, "Rooms"), (roomSnap) => {
      const foundFloors = new Set();
      const loadedRooms = [];

      roomSnap.forEach((docSnap) => {
        const data = docSnap.data();
        if (data.floor) foundFloors.add(data.floor);
        if (data.name && data.name !== "Tanpa Nama") {
          loadedRooms.push({ id: docSnap.id, name: data.name, name_en: data.name_en, floor: data.floor || "Lantai 1" });
        }
      });

      loadedRooms.sort((a, b) => a.name.localeCompare(b.name));
      setRooms(loadedRooms);

      setFloors(prev => {
        const combined = new Set([...prev, ...foundFloors]);
        return Array.from(combined).sort((a, b) => {
          const idxA = floorOrderRef.current.indexOf(a);
          const idxB = floorOrderRef.current.indexOf(b);
          if (idxA !== -1 && idxB !== -1) return idxA - idxB;
          if (idxA !== -1) return -1;
          if (idxB !== -1) return 1;
          return a.localeCompare(b);
        });
      });
    });


    const qLogs = query(collection(db, "Logs"), orderBy("timestamp", "desc"), limit(50));
    const unsubscribeLogs = onSnapshot(qLogs, (logSnap) => {
      const loadedLogs = [];
      const oneMonthAgo = new Date();
      const currentMonth = oneMonthAgo.getMonth();
      oneMonthAgo.setMonth(currentMonth - 1);
      
      if (oneMonthAgo.getMonth() === currentMonth) {
        oneMonthAgo.setDate(0);
      }

      logSnap.forEach((docSnap) => {
        const data = docSnap.data();
        let timeObj = null;
        if (data.timestamp) {
          timeObj = data.timestamp.toDate();
        }
        
        if (timeObj && timeObj < oneMonthAgo) {
          // Jika log lebih dari satu bulan, hapus dari database.
          deleteDoc(doc(db, "Logs", docSnap.id)).catch(err => console.error("Error deleting old log:", err));
        } else {
          loadedLogs.push({ id: docSnap.id, timeObj, ...data });
        }
      });
      setActivities(loadedLogs);
    });


    const unsubscribeConfig = onSnapshot(doc(db, "Settings", "MapConfig"), (docSnap) => {
      if (docSnap.exists() && docSnap.data().floorOrder) {
        floorOrderRef.current = docSnap.data().floorOrder;
        setFloors(prev => {
          return [...prev].sort((a, b) => {
            const idxA = floorOrderRef.current.indexOf(a);
            const idxB = floorOrderRef.current.indexOf(b);
            if (idxA !== -1 && idxB !== -1) return idxA - idxB;
            if (idxA !== -1) return -1;
            if (idxB !== -1) return 1;
            return a.localeCompare(b);
          });
        });
      }
    });

    return () => {
      unsubscribeKiosks();
      unsubscribeRooms();
      unsubscribeLogs();
      unsubscribeConfig();
    };
  }, []);

  const isMountedRef = useRef(true);
  const resetTimeoutRef = useRef(null);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
        window.utterances = [];
      }
      if (resetTimeoutRef.current) {
        clearTimeout(resetTimeoutRef.current);
      }
    };
  }, []);

  const activePath = useMemo(() => {
    if (activeStepIndex === -1 || !navigationSteps.length || !pathData.length) return null;
    const startIndex = activeStepIndex === 0 ? 0 : navigationSteps[activeStepIndex - 1].index_akhir;
    const endIndex = navigationSteps[activeStepIndex].index_akhir;
    return pathData.slice(startIndex, endIndex + 1);
  }, [pathData, navigationSteps, activeStepIndex]);

  const speakSteps = (langkahNavigasi, startIndex = 0, currentLang = language) => {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      window.utterances = []; // Solusi sementara: mencegah garbage collection di browser mobile.
      
      const playNext = (index) => {
        if (!isMountedRef.current) return;
        if (index >= langkahNavigasi.length) return;
        
        const step = langkahNavigasi[index];
        const utterance = new SpeechSynthesisUtterance(step.teks);
        window.utterances.push(utterance);
        
        utterance.lang = currentLang === 'en' ? 'en-US' : 'id-ID';
        utterance.rate = 1.15;
        
        utterance.onstart = () => {
          setActiveStepIndex(index);
          if (step.floor) {
            setFloor(step.floor);
          }
        };

        utterance.onend = () => {
          if (index === langkahNavigasi.length - 1) {
            // Reset setelah langkah terakhir selesai dibacakan + 10 detik.
            resetTimeoutRef.current = setTimeout(() => {
              if (!isMountedRef.current) return;
              setSearch("");
              setOutputText("");
              setLocation("");
              setFloor("Lantai 1");
              setPathData([]);
              setNavigationSteps([]);
              setActiveStepIndex(-1);
              setTargetRoomName("");
            }, 10000);
          } else {
            playNext(index + 1);
          }
        };

        window.speechSynthesis.speak(utterance);
      };

      playNext(startIndex);
    }
  };

  const executeSearch = async (overrideLocation, overrideTarget, overrideLang, resumeStepIndex = 0) => {
    const searchLocation = typeof overrideLocation === 'string' ? overrideLocation : location;
    const searchTarget = typeof overrideTarget === 'string' ? overrideTarget : search;
    const currentLang = overrideLang || language;
    
    if (!searchTarget.trim()) return;
    
    // Solusi mobile: pancing engine suara dengan audio kosong secara sinkron dengan klik tombol.
    if ('speechSynthesis' in window) {
       const silentUtterance = new SpeechSynthesisUtterance('');
       silentUtterance.volume = 0;
       window.speechSynthesis.speak(silentUtterance);
    }

    if (!searchLocation) {
      setOutputText(getText('fail_kiosk_first'));
      return;
    }

    setOutputText(getText('searching'));
    try {
      const response = await fetch("/api/route", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          start_node_id: searchLocation,
          teks_pencarian: searchTarget.trim(),
          language: currentLang
        })
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        setOutputText(`${getText('failed')} ${data.detail || "Terjadi kesalahan"}`);
        setPathData([]);
        setNavigationSteps([]);
        setActiveStepIndex(-1);
      } else {
        const roomName = translateName(data.data_target.nama_ruangan, currentLang, data.data_target.nama_ruangan_en);
        setTargetRoomName(roomName);
        setSearch(roomName);
        setPathData(data.jalur_koordinat);
        setNavigationSteps(data.langkah_navigasi);
        setActiveStepIndex(resumeStepIndex);
        
        let allText = getText('no_nav_text');
        if (data.langkah_navigasi && data.langkah_navigasi.length > 0) {
            allText = data.langkah_navigasi.map(l => l.teks).join("\n\n");
            const finalText = `${getText('route_found')}\n${getText('towards')} ${roomName}\n\n${allText}`;
            setOutputText(finalText);
            speakSteps(data.langkah_navigasi, resumeStepIndex, currentLang);
        } else {
            const fallbackText = `${getText('route_found')} ${getText('towards')} ${roomName}`;
            setOutputText(fallbackText);
            
            if (data.jalur_koordinat && data.jalur_koordinat.length > 0 && data.jalur_koordinat[0].floor) {
                setFloor(data.jalur_koordinat[0].floor);
            }
            
            if ('speechSynthesis' in window) {
              window.speechSynthesis.cancel();
              const utterance = new SpeechSynthesisUtterance(fallbackText);
              utterance.lang = currentLang === 'en' ? 'en-US' : 'id-ID';
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

  const openLogoutConfirm = () => setIsConfirmOpen(true);
  const handleLogoutYes = () => {
    setIsConfirmOpen(false);
    navigate("/");
  };
  const handleLogoutNo = () => setIsConfirmOpen(false);

  const handleLockYes = async () => {
    try {
      await updateDoc(doc(db, "Kiosks", kioskToLock), { isLocked: true });
      localStorage.setItem("locked_kiosk_id", kioskToLock);
      setLockedKiosk(kioskToLock);
      
      const kioskInfo = kiosks.find(k => k.id === kioskToLock);
      const kioskNameId = kioskInfo?.name ? translateName(kioskInfo.name, 'id', kioskInfo.name_en) : kioskToLock;
      const kioskNameEn = kioskInfo?.name ? translateName(kioskInfo.name, 'en', kioskInfo.name_en) : kioskToLock;
      await addActivityLog("Kios Dikunci", "Kiosk Locked", `Mengunci ${kioskNameId}`, `Locked ${kioskNameEn}`);

      setIsLockConfirmOpen(false);
      setKioskToLock("");
    } catch (e) {
      console.error(e);
      showAlert(getText('fail_lock_kiosk'));
    }
  };

  const handleLockNo = () => {
    setIsLockConfirmOpen(false);
    setKioskToLock("");
  };

  const handleUnlockYes = async () => {
    if (lockedKiosk) {
      try {
        await updateDoc(doc(db, "Kiosks", lockedKiosk), { isLocked: false });
        
        const kioskInfo = kiosks.find(k => k.id === lockedKiosk);
        const kioskNameId = kioskInfo?.name ? translateName(kioskInfo.name, 'id', kioskInfo.name_en) : lockedKiosk;
        const kioskNameEn = kioskInfo?.name ? translateName(kioskInfo.name, 'en', kioskInfo.name_en) : lockedKiosk;
        await addActivityLog("Kios Dibuka Kunci", "Kiosk Unlocked", `Melepas kunci ${kioskNameId}`, `Unlocked ${kioskNameEn}`);
      } catch (e) {
        console.error(getText('fail_unlock_kiosk'), e);
      }
    }
    localStorage.removeItem("locked_kiosk_id");
    setLockedKiosk("");
    setIsUnlockConfirmOpen(false);
  };

  const handleUnlockNo = () => {
    setIsUnlockConfirmOpen(false);
  };

  return (
    <div>
      <header className="header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <img src={LogoImg} alt="Wayfinder Logo" style={{ height: '28px', width: 'auto', filter: isDarkMode ? "brightness(0.1)" : "none" }} />
          <span className="header-logo">Wayfinder</span>
        </div>
        <div className="header-actions" style={{display: "flex", gap: "10px", alignItems: "center"}}>

          <label className="theme-switch" title={isDarkMode ? (language === 'id' ? 'Mode Terang' : 'Light Mode') : (language === 'id' ? 'Mode Gelap' : 'Dark Mode')}>
            <input type="checkbox" checked={isDarkMode} onChange={toggleTheme} />
            <span className="slider">
              <span className="slider-icon">🌙</span>
              <span className="slider-icon">☀️</span>
            </span>
          </label>
          <LanguageSelector 
            language={language}
            onChange={handleLanguageChange} 
          />
          <button className="header-edit-btn" onClick={() => navigate("/edit", { state: { authorized: true } })}>
            <EditIcon />
            <span>{getText('edit')}</span>
          </button>
          <button className="header-login-btn" onClick={openLogoutConfirm}>
            <LoginIcon />
            <span>{getText('logout')}</span>
          </button>
        </div>
      </header>

      {isConfirmOpen && (
        <div className="modal-overlay" onClick={handleLogoutNo}>
          <div className="confirm-modal" onClick={(e) => e.stopPropagation()}>
            <div className="confirm-icon-badge logout-badge">
              <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
                <polyline points="16 17 21 12 16 7"></polyline>
                <line x1="21" y1="12" x2="9" y2="12"></line>
              </svg>
            </div>
            <h3>{getText('confirm_logout')}</h3>
            <p>{getText('are_you_sure_logout')}</p>
            <div className="confirm-modal-actions">
              <button className="confirm-btn no" onClick={handleLogoutNo}>{getText('no')}</button>
              <button className="confirm-btn yes" onClick={handleLogoutYes}>{getText('yes')}</button>
            </div>
          </div>
        </div>
      )}

      {isLockConfirmOpen && (
        <div className="modal-overlay" onClick={handleLockNo}>
          <div className="confirm-modal" onClick={(e) => e.stopPropagation()}>
            <div className="confirm-icon-badge lock-badge">
              <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
              </svg>
            </div>
            <h3>{getText('confirm_lock_title')}</h3>
            <p>{getText('are_you_sure_lock')} <strong>{kiosks.find(k => k.id === kioskToLock)?.name ? translateName(kiosks.find(k => k.id === kioskToLock).name, language, kiosks.find(k => k.id === kioskToLock).name_en) : translateName(kioskToLock, language)}</strong>?</p>
            <div className="confirm-modal-actions">
              <button className="confirm-btn no" onClick={handleLockNo}>{getText('no')}</button>
              <button className="confirm-btn yes" onClick={handleLockYes}>{getText('yes')}</button>
            </div>
          </div>
        </div>
      )}

      {isUnlockConfirmOpen && (
        <div className="modal-overlay" onClick={handleUnlockNo}>
          <div className="confirm-modal" onClick={(e) => e.stopPropagation()}>
            <div className="confirm-icon-badge unlock-badge">
              <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                <path d="M7 11V7a5 5 0 0 1 9.9-1"></path>
              </svg>
            </div>
            <h3>{getText('confirm_unlock_title')}</h3>
            <p>{getText('are_you_sure_unlock')}</p>
            <div className="confirm-modal-actions">
              <button className="confirm-btn no" onClick={handleUnlockNo}>{getText('no')}</button>
              <button className="confirm-btn yes" onClick={handleUnlockYes}>{getText('yes')}</button>
            </div>
          </div>
        </div>
      )}

      <div className="main-layout">
        <aside className="left-panel admin-sidebar">
          
          {/* opsi 2: analitik mini */}
          <div className="admin-widget">
            <h3>{language === 'id' ? 'Statistik Sistem' : 'System Analytics'}</h3>
            <div className="stat-grid">
              <div className="stat-card">
                <span className="stat-value">{rooms.length}</span>
                <span className="stat-label">{language === 'id' ? 'Total Ruangan' : 'Total Rooms'}</span>
              </div>
              <div className="stat-card">
                <span className="stat-value">{kiosks.filter(k => !k.name?.toLowerCase().includes('pintu')).length}</span>
                <span className="stat-label">{language === 'id' ? 'Kios Aktif' : 'Active Kiosks'}</span>
              </div>
            </div>
          </div>

          {/* opsi 1: manajer kios */}
          <div className="admin-widget kiosk-manager-widget">
            <h3>{language === 'id' ? 'Manajemen Kios' : 'Kiosk Manager'}</h3>
            <div className="kiosk-list-container">
              {kiosks.filter(k => !k.name?.toLowerCase().includes('pintu')).length > 0 ? 
                kiosks.filter(k => !k.name?.toLowerCase().includes('pintu')).map(k => {
                const isLockedByMe = lockedKiosk === k.id;
                const isLockedByOther = !isLockedByMe && k.isLocked === true;
                return (
                  <div key={k.id} className={`kiosk-list-item ${isLockedByMe ? 'locked' : ''} ${isLockedByOther ? 'locked-other' : ''}`}>
                    <div className="kiosk-info">
                      <span className="kiosk-name">{translateName(k.name, language, k.name_en)}</span>
                      <span className="kiosk-floor">{translateName(k.floor, language)}</span>
                    </div>
                    <div className="kiosk-action">
                      {isLockedByMe ? (
                        <button className="kiosk-action-btn unlock" onClick={() => {
                          setKioskToLock(k.id);
                          setIsUnlockConfirmOpen(true);
                        }}>
                          {getText('unlock')}
                        </button>
                      ) : isLockedByOther ? (
                        <button className="kiosk-action-btn in-use" disabled>
                          {language === 'id' ? 'Digunakan' : 'In Use'}
                        </button>
                      ) : (
                        <button className="kiosk-action-btn lock" onClick={() => {
                          setKioskToLock(k.id);
                          setIsLockConfirmOpen(true);
                        }} disabled={!!lockedKiosk}>
                          {getText('lock')}
                        </button>
                      )}
                    </div>
                  </div>
                );
              }) : (
                <p className="empty-state">{language === 'id' ? 'Tidak ada kiosk terdeteksi' : 'No kiosks detected'}</p>
              )}
            </div>
          </div>

          {/* opsi 3: log aktivitas (mock) */}
          <div className="admin-widget activity-log-widget">
            <h3>{language === 'id' ? 'Aktivitas Terbaru' : 'Recent Activity'}</h3>
            <div className="activity-list">
              {activities.length > 0 ? activities.map((act) => (
                <div key={act.id} className="activity-item">
                  <div className="activity-time" style={{ display: "flex", flexDirection: "column", fontSize: "0.85em", opacity: 0.8, marginBottom: "4px", gap: "2px" }}>
                    {act.timeObj ? (
                      <>
                        <span style={{ fontWeight: "600", color: "var(--text-main)" }}>
                          {act.timeObj.toLocaleDateString(language === 'id' ? 'id-ID' : 'en-US', { day: 'numeric', month: 'short', year: 'numeric' })}
                        </span>
                        <span>
                          {act.timeObj.toLocaleTimeString(language === 'id' ? 'id-ID' : 'en-US', { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </>
                    ) : (
                      <span>--:--</span>
                    )}
                  </div>
                  <div className="activity-details">
                    <div className="activity-title">{act.title ? act.title[language] : ""}</div>
                    <div className="activity-desc">{act.desc ? act.desc[language] : ""}</div>
                    {act.device && (
                      <div className="activity-device" style={{ fontSize: "0.75em", opacity: 0.7, marginTop: "4px" }}>
                        {formatDevice(act.device)}
                        {act.ram ? ` • ${act.ram}GB RAM` : ''}
                        {act.cores ? ` • ${act.cores} Cores` : ''}
                      </div>
                    )}
                  </div>
                </div>
              )) : (
                <p className="empty-state">{language === 'id' ? 'Belum ada aktivitas' : 'No activity yet'}</p>
              )}
            </div>
          </div>
          {/* kotak teks navigasi dinamis */}
          {(outputText || navigationSteps.length > 0) && (
            <div className="destination-output-dynamic">
              {navigationSteps.length > 0 ? (
                <>
                  <div className="nav-header">
                    {getText('route_found')} {getText('towards')} {targetRoomName}
                  </div>
                  {navigationSteps.map((step, idx) => (
                    <div 
                      key={idx} 
                      className={`nav-step ${activeStepIndex === idx ? 'active-step' : ''}`}
                      ref={activeStepIndex === idx ? (el) => el && el.scrollIntoView({ behavior: 'smooth', block: 'nearest' }) : null}
                    >
                      {step.teks}
                    </div>
                  ))}
                </>
              ) : (
                <div className="nav-step">{outputText}</div>
              )}
            </div>
          )}
        </aside>
        
        <main className="map-panel" style={{ position: "relative" }}>
          {/* kontrol lantai vertikal (opsi 1) */}
          <div className="vertical-scrubber-wrapper">
            {(() => {
              const visibleFloors = floors.filter(f => !f.startsWith("submap_"));
              const initialCounts = {};
              visibleFloors.forEach(f => {
                if (!f.toLowerCase().startsWith("lantai ") && f.length > 0) {
                  const initial = f.charAt(0).toUpperCase();
                  initialCounts[initial] = (initialCounts[initial] || 0) + 1;
                }
              });

              return visibleFloors.map((f) => {
                const isActive = (() => {
                  if (floor.startsWith("submap_")) {
                    const parentId = floor.replace("submap_", "");
                    const parent = rooms.find(r => r.id === parentId);
                    return parent ? parent.floor === f : false;
                  }
                  return floor === f;
                })();
                
                let shortName = f;
                if (f.toLowerCase().startsWith("lantai ")) {
                  shortName = f.substring(7).trim();
                } else if (f) {
                  const initial = f.charAt(0).toUpperCase();
                  if (initialCounts[initial] > 1) {
                    const match = f.match(/^([a-zA-Z])[a-z]*\s*(\d+)/i);
                    if (match && match[2]) {
                      shortName = (match[1] + match[2]).toUpperCase();
                    } else {
                      shortName = f.substring(0, 2);
                      shortName = shortName.charAt(0).toUpperCase() + (shortName.length > 1 ? shortName.charAt(1).toLowerCase() : "");
                    }
                  } else {
                    shortName = initial;
                  }
                }

                return (
                  <button
                    key={f}
                    className={`scrubber-btn ${isActive ? 'active' : ''}`}
                    onClick={() => setFloor(f)}
                    title={f}
                  >
                    {shortName}
                  </button>
                );
              });
            })()}
          </div>

          {floor.startsWith("submap_") && (
              <button 
                  onClick={() => {
                      const parentRoomId = floor.replace("submap_", "");
                      const parentRoom = rooms.find(r => r.id === parentRoomId);
                      setFloor(parentRoom?.floor || "Lantai 1");
                  }}
                  style={{ position: "absolute", top: "20px", left: "20px", zIndex: 100, padding: "10px 20px", background: "#1A73C8", color: "white", border: "none", borderRadius: "8px", cursor: "pointer", fontWeight: "bold", boxShadow: "0 4px 6px rgba(0,0,0,0.1)" }}
              >
                  {getText('back_to_main_floor')}
              </button>
          )}
          <TransformWrapper initialScale={1} minScale={0.05} maxScale={10} centerOnInit={true} limitToBounds={false} wheel={{ step: 0.002, smooth: true }}>
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
                  showBorder={true}
                  language={language}
                  isDarkMode={isDarkMode}
                />
              </div>
            </TransformComponent>
          </TransformWrapper>
        </main>
        <AlertDialog 
          isOpen={customAlert.isOpen} 
          message={customAlert.message} 
          onClose={() => setCustomAlert(prev => ({ ...prev, isOpen: false }))} 
        />
      </div>
    </div>
  );
}