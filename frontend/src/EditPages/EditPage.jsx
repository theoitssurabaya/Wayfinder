import React, { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { useNavigate } from "react-router";
import { TransformWrapper, TransformComponent } from "react-zoom-pan-pinch";
import { Stage, Layer, Rect, Text, Line, Transformer } from "react-konva";
import { collection, getDocs, doc, writeBatch } from "firebase/firestore";
import { db } from "../firebase";
import { translateName } from "../utils/translator";
import "./Edit.css";

const ElementShape = ({ shapeProps, isSelected, onSelect, onChange, setIsDraggingElement, GRID_SIZE, originalElements, language, isDarkMode }) => {
  const shapeRef = useRef();
  const trRef = useRef();

  useEffect(() => {
    if (isSelected && trRef.current) {
      trRef.current.nodes([shapeRef.current]);
      trRef.current.getLayer().batchDraw();
    }
  }, [isSelected]);

  const handleRename = () => {
    const typeLabel = shapeProps.type === 'kiosk' ? 'Kiosk' : 'Ruangan';
    const newName = window.prompt(`Masukkan Nama ${typeLabel}:`, shapeProps.name || "");
    if (newName !== null) {
      const currentLang = localStorage.getItem('language') || 'id';
      const englishKeywords = ['room', 'clinic', 'ward', 'pharmacy', 'emergency', 'lift', 'stairs', 'cashier', 'door'];
      const indoKeywords = ['ruang', 'poli', 'rawat', 'farmasi', 'apotek', 'ugd', 'igd', 'tangga', 'kasir', 'pintu'];

      const lowerName = newName.toLowerCase();
      const hasEnglish = englishKeywords.some(kw => lowerName.includes(kw));
      const hasIndo = indoKeywords.some(kw => lowerName.includes(kw));

      if (currentLang === 'id' && hasEnglish && !hasIndo) {
        alert("Anda sedang dalam mode Bahasa Indonesia (ID), namun Anda memasukkan nama dalam Bahasa Inggris. Tolong sesuaikan!");
      } else if (currentLang === 'en' && hasIndo && !hasEnglish) {
        alert("You are currently in English (EN) mode, but entered an Indonesian name. Please adjust accordingly!");
      }

      onChange({ ...shapeProps, name: newName });
    }
  };

  // ── RUMUS BARU: AUTO SHRINK FONT ──
  const textContent = translateName(shapeProps.name || (shapeProps.type === 'kiosk' ? 'Kiosk' : 'Tanpa Nama'), language);
  const longestWordLen = Math.max(...textContent.split(' ').map(w => w.length), 1);
  const actualUsableWidth = Math.max(10, shapeProps.width - 12);

  const maxFontSizeWidth = actualUsableWidth / (longestWordLen * 0.85);
  const maxFontSizeHeight = shapeProps.height / 2.5;
  const dynamicFontSize = Math.max(6, Math.min(14, maxFontSizeWidth, maxFontSizeHeight));

  const getVisualColors = useCallback(() => {
    if (shapeProps.type === 'kiosk') {
      if (shapeProps.name?.toLowerCase().includes('pintu')) {
        return { fill: "#4CAF50", stroke: "#2E7D32", text: "#FFFFFF" };
      }
      return { fill: "#2196F3", stroke: "#0D47A1", text: "#FFFFFF" };
    }

    const original = originalElements.find(el => el.id === shapeProps.id);
    if (!original) return { fill: isDarkMode ? "#064e3b" : "#d4edda", stroke: isDarkMode ? "#065f46" : "#c3e6cb", text: isDarkMode ? "#d1fae5" : "#155724" };

    const posChanged = Math.abs(original.x - shapeProps.x) > 0.1 || Math.abs(original.y - shapeProps.y) > 0.1;
    const sizeChanged = Math.abs(original.width - shapeProps.width) > 0.1 || Math.abs(original.height - shapeProps.height) > 0.1;

    if (posChanged || sizeChanged) {
      return { fill: isDarkMode ? "#3f3f00" : "#fff3cd", stroke: isDarkMode ? "#666600" : "#ffeeba", text: isDarkMode ? "#fff" : "#856404" };
    }

    return { fill: isDarkMode ? "#1e293b" : "#f8f9fa", stroke: isDarkMode ? "#334155" : "#ced4da", text: isDarkMode ? "#f8fafc" : "#495057" };
  }, [shapeProps, originalElements, isDarkMode]);

  const visualColors = getVisualColors();

  const renderEndpoints = () => {
    if (shapeProps.type !== 'room') return null;
    const endpoints = shapeProps.endpoints || ['bottom'];
    const markerLen = 16;
    const markerThick = 4;

    return endpoints.map((side) => {
      let mX, mY, mW, mH;
      if (side === 'top') {
        mX = shapeProps.x + shapeProps.width / 2 - markerThick / 2; mY = shapeProps.y - markerLen / 2; mW = markerThick; mH = markerLen;
      } else if (side === 'bottom') {
        mX = shapeProps.x + shapeProps.width / 2 - markerThick / 2; mY = shapeProps.y + shapeProps.height - markerLen / 2; mW = markerThick; mH = markerLen;
      } else if (side === 'left') {
        mX = shapeProps.x - markerLen / 2; mY = shapeProps.y + shapeProps.height / 2 - markerThick / 2; mW = markerLen; mH = markerThick;
      } else if (side === 'right') {
        mX = shapeProps.x + shapeProps.width - markerLen / 2; mY = shapeProps.y + shapeProps.height / 2 - markerThick / 2; mW = markerLen; mH = markerThick;
      }
      return <Rect key={side} x={mX} y={mY} width={mW} height={mH} fill="#B71C1C" listening={false} />;
    });
  };

  return (
    <React.Fragment>
      <Rect
        onClick={onSelect}
        onTap={onSelect}
        onDblClick={handleRename}
        onDblTap={handleRename}
        ref={shapeRef}
        {...shapeProps}
        fill={visualColors.fill}
        stroke={visualColors.stroke}
        draggable
        strokeWidth={isSelected ? 3 : 2}
        perfectDrawEnabled={false}
        shadowForStrokeEnabled={false}
        onDragStart={() => setIsDraggingElement(true)}
        onTransformStart={() => setIsDraggingElement(true)}
        dragBoundFunc={(pos) => ({
          x: Math.round(pos.x / GRID_SIZE) * GRID_SIZE,
          y: Math.round(pos.y / GRID_SIZE) * GRID_SIZE,
        })}
        onDragEnd={(e) => {
          setIsDraggingElement(false);
          onChange({
            ...shapeProps,
            x: Math.round(e.target.x() / GRID_SIZE) * GRID_SIZE,
            y: Math.round(e.target.y() / GRID_SIZE) * GRID_SIZE,
          });
        }}
        onTransformEnd={(e) => {
          setIsDraggingElement(false);
          const node = shapeRef.current;
          const scaleX = node.scaleX();
          const scaleY = node.scaleY();
          node.scaleX(1);
          node.scaleY(1);
          onChange({
            ...shapeProps,
            x: Math.round(node.x() / GRID_SIZE) * GRID_SIZE,
            y: Math.round(node.y() / GRID_SIZE) * GRID_SIZE,
            width: Math.max(GRID_SIZE, Math.round((node.width() * scaleX) / GRID_SIZE) * GRID_SIZE),
            height: Math.max(GRID_SIZE, Math.round((node.height() * scaleY) / GRID_SIZE) * GRID_SIZE),
          });
        }}
      />
      <Text
        text={textContent}
        x={shapeProps.x}
        y={shapeProps.y}
        width={shapeProps.width}
        height={shapeProps.height}
        fontSize={dynamicFontSize}
        fontStyle="bold"
        fill={visualColors.text}
        align="center"
        verticalAlign="middle"
        padding={5}
        listening={false}
        wrap="word"
        ellipsis={false}
        perfectDrawEnabled={false}
      />

      {renderEndpoints()}

      {isSelected && (
        <Transformer ref={trRef} rotateEnabled={false} boundBoxFunc={(oldBox, newBox) => {
          if (newBox.width < GRID_SIZE || newBox.height < GRID_SIZE) return oldBox;
          return newBox;
        }} />
      )}
    </React.Fragment>
  );
};

export default function EditPage() {
  const navigate = useNavigate();
  const [placedElements, setPlacedElements] = useState([]);
  const [mapSize, setMapSize] = useState({ width: 2000, height: 1500 });
  const [originalElements, setOriginalElements] = useState([]);

  const [history, setHistory] = useState([]);
  const [historyStep, setHistoryStep] = useState(-1);

  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const [confirmAction, setConfirmAction] = useState(null);
  const [isDraggingElement, setIsDraggingElement] = useState(false);
  const [selectedId, setSelectedId] = useState(null);
  const [deletedElements, setDeletedElements] = useState([]);

  const [floors, setFloors] = useState(["Lantai 1"]);
  const [activeEditFloor, setActiveEditFloor] = useState("Lantai 1");
  const [language, setLanguage] = useState(localStorage.getItem('language') || 'id');
  const [isDarkMode, setIsDarkMode] = useState(() => {
    return localStorage.getItem('theme') === 'dark';
  });

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
      'save_map': { id: 'Simpan Peta', en: 'Save Map' },
      'cancel': { id: 'Batal', en: 'Cancel' },
      'drag_drop_info': { id: 'Drag item ke dalam peta', en: 'Drag items into the map' },
      'room': { id: 'Ruangan', en: 'Room' },
      'kiosk': { id: 'Kiosk', en: 'Kiosk' },
      'entrance': { id: 'Pintu Masuk', en: 'Entrance' },
      'exit': { id: 'Pintu Keluar', en: 'Exit' },
      'add_floor': { id: '+ Tambah', en: '+ Add' },
      'del_floor': { id: 'Hapus', en: 'Delete' },
      'save_confirm': { id: 'Konfirmasi Simpan', en: 'Confirm Save' },
      'cancel_confirm': { id: 'Konfirmasi Batal', en: 'Confirm Cancel' },
      'are_you_sure_save': { id: 'Apakah Anda yakin ingin menyimpan perubahan peta ke database?', en: 'Are you sure you want to save map changes to the database?' },
      'are_you_sure_cancel': { id: 'Semua perubahan yang belum disimpan akan hilang. Lanjutkan?', en: 'All unsaved changes will be lost. Continue?' },
      'yes': { id: 'Iya', en: 'Yes' },
      'no': { id: 'Tidak', en: 'No' },
      'edit_mode': { id: 'Mode Edit', en: 'Edit Mode' },
      'floor_management': { id: 'Manajemen Lantai', en: 'Floor Management' },
      'floors_count': { id: 'Lantai', en: 'Floors' },
      'back_to_main_floor': { id: 'Kembali ke Lantai Utama', en: 'Back to Main Floor' },
      'verification': { id: 'Verifikasi', en: 'Verification' },
      'selected': { id: 'Terpilih', en: 'Selected' },
      'no_element_selected': { id: 'Tidak ada elemen terpilih', en: 'No element selected' },
      'edit_panel': { id: 'Panel Edit', en: 'Edit Panel' },
      'template_elements': { id: 'Template Elemen', en: 'Element Templates' },
      'template_hint': { id: 'Tarik template langsung ke peta.', en: 'Drag templates directly onto the map.' },
      'drag_kiosk': { id: 'Tarik Kiosk', en: 'Drag Kiosk' },
      'del_element': { id: 'Hapus Elemen (Del)', en: 'Delete Element (Del)' },
      'enter_submap': { id: 'Masuk ke Bagian Dalam (Sub-Map)', en: 'Enter Inner Section (Sub-Map)' },
      'active_endpoint_side': { id: '📍 Sisi Endpoint Aktif', en: '📍 Active Endpoint Side' },
      'change_manual_hint': { id: 'Ubah manual jika template tidak sesuai:', en: 'Change manually if template does not fit:' },
      'top': { id: 'Atas', en: 'Top' },
      'bottom': { id: 'Bawah', en: 'Bottom' },
      'left': { id: 'Kiri', en: 'Left' },
      'right': { id: 'Kanan', en: 'Right' },
      'undo': { id: 'Urungkan', en: 'Undo' },
      'redo': { id: 'Ulangi', en: 'Redo' }
    };
    return dict[key] ? dict[key][language] : key;
  };

  const handleLanguageChange = (e) => {
    const newLang = e.target.value;
    setLanguage(newLang);
    localStorage.setItem('language', newLang);
  };

  const mapRef = useRef(null);
  const transformRef = useRef(null);
  const GRID_SIZE = 25;

  const calculatedMapSize = useMemo(() => {
    let maxX = mapSize.width || 2000;
    let maxY = mapSize.height || 1500;

    placedElements.forEach(el => {
      if (el.floor === activeEditFloor) {
        const right = el.x + el.width;
        const bottom = el.y + el.height;
        if (right > maxX) maxX = right;
        if (bottom > maxY) maxY = bottom;
      }
    });

    return {
      width: maxX + 1000,
      height: maxY + 1000
    };
  }, [placedElements, activeEditFloor, mapSize.width, mapSize.height]);

  const saveHistory = useCallback((newElements) => {
    let newHistory = history.slice(0, historyStep + 1);
    newHistory.push(newElements);

    if (newHistory.length > 50) {
      newHistory = newHistory.slice(newHistory.length - 50);
    }

    setHistory(newHistory);
    setHistoryStep(newHistory.length - 1);
  }, [history, historyStep]);

  useEffect(() => {
    const fetchAllData = async () => {
      try {
        const [roomsSnapshot, kioskSnapshot] = await Promise.all([
          getDocs(collection(db, "Rooms")),
          getDocs(collection(db, "Kiosks"))
        ]);

        const allElements = [];
        const uniqueFloors = new Set(["Lantai 1"]);

        roomsSnapshot.forEach((docSnap) => {
          const data = docSnap.data();
          if (data.floor && !data.floor.startsWith("submap_")) uniqueFloors.add(data.floor);
          allElements.push({
            id: docSnap.id,
            type: 'room',
            floor: data.floor || "Lantai 1",
            name: data.name || "Tanpa Nama",
            x: (data.grid_x || 0) * GRID_SIZE,
            y: (data.grid_y || 0) * GRID_SIZE,
            width: (data.grid_width || 1) * GRID_SIZE,
            height: (data.grid_height || 1) * GRID_SIZE,
            endpoints: data.endpoints && data.endpoints.length > 0 ? data.endpoints : ['bottom']
          });
        });

        kioskSnapshot.forEach((docSnap) => {
          const data = docSnap.data();
          if (data.floor && !data.floor.startsWith("submap_")) uniqueFloors.add(data.floor);
          allElements.push({
            id: docSnap.id,
            type: 'kiosk',
            floor: data.floor || "Lantai 1",
            name: data.name || "Kiosk",
            x: (data.grid_x || 0) * GRID_SIZE,
            y: (data.grid_y || 0) * GRID_SIZE,
            width: (data.grid_width || 2) * GRID_SIZE,
            height: (data.grid_height || 2) * GRID_SIZE
          });
        });

        setPlacedElements(allElements);
        setOriginalElements(JSON.parse(JSON.stringify(allElements)));

        setHistory([allElements]);
        setHistoryStep(0);

        const sortedFloors = Array.from(uniqueFloors).sort();
        setFloors(sortedFloors);
        setActiveEditFloor(sortedFloors[0] || "Lantai 1");
      } catch (error) {
        console.error("Gagal mengambil data:", error);
      }
    };
    fetchAllData();
  }, []);

  useEffect(() => {
    const updateMapSize = () => {
      if (mapRef.current) {
        setMapSize({
          width: mapRef.current.clientWidth || 2000,
          height: mapRef.current.clientHeight || 1500
        });
      }
    };
    setTimeout(updateMapSize, 100);
    window.addEventListener("resize", updateMapSize);
    return () => window.removeEventListener("resize", updateMapSize);
  }, []);

  const handleUndo = useCallback(() => {
    if (historyStep > 0) {
      const prevStep = historyStep - 1;
      setHistoryStep(prevStep);
      setPlacedElements(history[prevStep]);
      setSelectedId(null);
    }
  }, [history, historyStep]);

  const handleRedo = useCallback(() => {
    if (historyStep < history.length - 1) {
      const nextStep = historyStep + 1;
      setHistoryStep(nextStep);
      setPlacedElements(history[nextStep]);
      setSelectedId(null);
    }
  }, [history, historyStep]);

  const deleteSelectedElement = useCallback(() => {
    if (selectedId) {
      setDeletedElements((prev) => [...prev, selectedId]);
      const newElements = placedElements.filter((el) => el.id !== selectedId);
      setPlacedElements(newElements);
      saveHistory(newElements);
      setSelectedId(null);
    }
  }, [selectedId, placedElements, saveHistory]);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.target.tagName.toLowerCase() === 'input') return;

      if ((e.key === "Delete" || e.key === "Backspace") && selectedId) {
        deleteSelectedElement();
      }
      if (e.ctrlKey && e.key.toLowerCase() === "z") {
        e.preventDefault();
        handleUndo();
      }
      if (e.ctrlKey && e.key.toLowerCase() === "y") {
        e.preventDefault();
        handleRedo();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedId, deleteSelectedElement, handleUndo, handleRedo]);

  const checkDeselect = (e) => {
    const clickedOnEmpty = e.target === e.target.getStage() || e.target.attrs.id === "bg-grid";
    if (clickedOnEmpty) setSelectedId(null);
  };

  const generateNextRoomId = () => {
    let maxNumber = 0;
    placedElements.forEach((el) => {
      if (el.id.startsWith('R')) {
        const num = parseInt(el.id.substring(1), 10);
        if (!isNaN(num) && num > maxNumber) maxNumber = num;
      }
    });
    return `R${String(maxNumber + 1).padStart(3, '0')}`;
  };

  const generateNextKioskId = () => {
    let maxNumber = 0;
    placedElements.forEach((el) => {
      if (el.id.startsWith('K')) {
        const num = parseInt(el.id.substring(1), 10);
        if (!isNaN(num) && num > maxNumber) maxNumber = num;
      }
    });
    return `K${String(maxNumber + 1).padStart(3, '0')}`;
  };

  const handleAddFloor = () => {
    const newFloor = window.prompt("Masukkan nama lantai baru:\n(Contoh: Lantai 5, Gedung B, Basement)");
    if (newFloor && newFloor.trim() !== "") {
      const formattedFloor = newFloor.trim();
      if (floors.includes(formattedFloor)) {
        alert("Lantai tersebut sudah ada di daftar!");
        return;
      }
      const newFloorsList = [...floors, formattedFloor].sort();
      setFloors(newFloorsList);
      setActiveEditFloor(formattedFloor);
      setSelectedId(null);
    }
  };

  const handleDeleteFloor = () => {
    if (floors.length <= 1) {
      alert("Tidak dapat menghapus. Harus tersisa minimal satu lantai di editor!");
      return;
    }

    const confirmDelete = window.confirm(
      `Apakah Anda yakin ingin menghapus "${activeEditFloor}"?\n\nPERHATIAN: Seluruh elemen (Ruangan & Kiosk) yang berada di lantai ini akan terhapus dari database saat Anda menekan tombol Save.`
    );

    if (confirmDelete) {
      const elementsToDelete = placedElements.filter(el => el.floor === activeEditFloor);
      const idsToDelete = elementsToDelete.map(el => el.id);
      setDeletedElements(prev => [...prev, ...idsToDelete]);

      const newElements = placedElements.filter(el => el.floor !== activeEditFloor);
      setPlacedElements(newElements);
      saveHistory(newElements);

      const remainingFloors = floors.filter(f => f !== activeEditFloor);
      setFloors(remainingFloors);
      setActiveEditFloor(remainingFloors[0]);
      setSelectedId(null);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    const mapRect = mapRef.current.getBoundingClientRect();
    const clientX = e.clientX - mapRect.left;
    const clientY = e.clientY - mapRect.top;

    let dragData;
    try {
      dragData = JSON.parse(e.dataTransfer.getData("text/plain"));
    } catch (err) {
      return;
    }

    if (transformRef.current && dragData) {
      const { scale, positionX, positionY } = transformRef.current.state;
      const x = (clientX - positionX) / scale;
      const y = (clientY - positionY) / scale;
      const snappedX = Math.round(x / GRID_SIZE) * GRID_SIZE;
      const snappedY = Math.round(y / GRID_SIZE) * GRID_SIZE;

      let newElements = [...placedElements];
      let newId;

      if (dragData.type === "new-kiosk" || dragData.type === "new-entrance") {
        newId = generateNextKioskId();
        newElements.push({
          id: newId, type: 'kiosk', floor: activeEditFloor,
          x: snappedX, y: snappedY, width: GRID_SIZE * (dragData.defaultGridWidth || 2), height: GRID_SIZE * (dragData.defaultGridHeight || 2),
          name: dragData.defaultName,
        });
      } else if (dragData.type === "new-room") {
        newId = generateNextRoomId();
        newElements.push({
          id: newId, type: 'room', floor: activeEditFloor,
          x: snappedX, y: snappedY, width: GRID_SIZE * (dragData.defaultGridWidth || 4), height: GRID_SIZE * (dragData.defaultGridHeight || 2),
          endpoints: dragData.endpoints, name: dragData.defaultName,
        });
      }

      setPlacedElements(newElements);
      saveHistory(newElements);
      setSelectedId(newId);
    }
  };

  const handleConfirmYes = async () => {
    setIsConfirmOpen(false);
    if (confirmAction === "save") {
      try {
        const batch = writeBatch(db);
        deletedElements.forEach((id) => {
          const col = id.startsWith('K') ? "Kiosks" : "Rooms";
          batch.delete(doc(db, col, id));
        });

        placedElements.forEach((el) => {
          const col = el.type === 'kiosk' ? "Kiosks" : "Rooms";
          batch.set(doc(db, col, el.id.toString()), {
            id: el.id.toString(),
            name: el.name,
            floor: el.floor,
            grid_x: Math.round(el.x / GRID_SIZE),
            grid_y: Math.round(el.y / GRID_SIZE),
            grid_width: Math.round(el.width / GRID_SIZE),
            grid_height: Math.round(el.height / GRID_SIZE),
            ...(el.type === 'room' && { endpoints: el.endpoints || ['bottom'] })
          }, { merge: true });
        });

        await batch.commit();
        alert("Denah dan setingan endpoint baru berhasil disimpan!");
        navigate("/admin");
      } catch (error) {
        console.error("Gagal simpan:", error);
      }
    } else navigate("/admin");
    setConfirmAction(null);
  };

  const drawGrid = () => {
    const lines = [];
    const { width, height } = calculatedMapSize;
    const gridColor = isDarkMode ? "#334155" : "#9e9e9e";
    for (let i = 0; i < width / GRID_SIZE; i++) lines.push(<Line key={`v${i}`} points={[Math.round(i * GRID_SIZE), 0, Math.round(i * GRID_SIZE), height]} stroke={gridColor} strokeWidth={1} />);
    for (let j = 0; j < height / GRID_SIZE; j++) lines.push(<Line key={`h${j}`} points={[0, Math.round(j * GRID_SIZE), width, Math.round(j * GRID_SIZE)]} stroke={gridColor} strokeWidth={1} />);
    return lines;
  };

  return (
    <div className="edit-page-container">
      <header className="edit-page-header">
        <span className="edit-page-logo">Wayfinder - {getText('edit_mode')}</span>

        <div className="header-actions" style={{ display: "flex", gap: "10px", alignItems: "center" }}>
          <label className="theme-switch" title={isDarkMode ? (language === 'id' ? 'Mode Terang' : 'Light Mode') : (language === 'id' ? 'Mode Gelap' : 'Dark Mode')}>
            <input type="checkbox" checked={isDarkMode} onChange={toggleTheme} />
            <span className="slider">
              <span className="slider-icon">🌙</span>
              <span className="slider-icon">☀️</span>
            </span>
          </label>
          <select
            value={language}
            onChange={handleLanguageChange}
            style={{ background: "transparent", border: "1px solid var(--border)", color: "var(--white)", padding: "5px 10px", borderRadius: "5px", cursor: "pointer", fontWeight: "bold", outline: "none" }}
          >
            <option value="id" style={{color: "black"}}>🇮🇩 ID</option>
            <option value="en" style={{color: "black"}}>🇬🇧 EN</option>
          </select>

          {activeEditFloor.startsWith("submap_") && (
            <button
              onClick={() => {
                const parentRoomId = activeEditFloor.replace("submap_", "");
                const parentRoom = placedElements.find(el => el.id === parentRoomId);
                setActiveEditFloor(parentRoom ? parentRoom.floor : floors[0]);
              }}
              style={{ padding: "8px 15px", background: "transparent", color: "white", border: "1px solid rgba(255,255,255,0.3)", borderRadius: "5px", cursor: "pointer", fontWeight: "bold" }}
            >
              <span>{getText('back_to_main_floor')}</span>
            </button>
          )}

          <button className="edit-page-btn cancel" onClick={() => setIsConfirmOpen(true)}><span>{getText('cancel')}</span></button>
          <button className="edit-page-btn save" onClick={() => { setConfirmAction("save"); setIsConfirmOpen(true); }}><span>{getText('save_map')}</span></button>
        </div>
      </header>

      {isConfirmOpen && (
        <div className="modal-overlay">
          <div className="confirm-modal">
            {confirmAction === "save" ? (
              <div className="confirm-icon-badge save-badge">
                <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path>
                  <polyline points="17 21 17 13 7 13 7 21"></polyline>
                  <polyline points="7 3 7 8 15 8"></polyline>
                </svg>
              </div>
            ) : (
              <div className="confirm-icon-badge cancel-badge">
                <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
                  <line x1="12" y1="9" x2="12" y2="13"></line>
                  <line x1="12" y1="17" x2="12.01" y2="17"></line>
                </svg>
              </div>
            )}
            <h3>{confirmAction === "save" ? getText('save_confirm') : getText('cancel_confirm')}</h3>
            <p>{confirmAction === "save" ? getText('are_you_sure_save') : getText('are_you_sure_cancel')}</p>
            <div className="confirm-modal-actions">
              <button className="confirm-btn no" onClick={() => setIsConfirmOpen(false)}>{getText('no')}</button>
              <button className="confirm-btn yes" onClick={handleConfirmYes}>{getText('yes')}</button>
            </div>
          </div>
        </div>
      )}

      <div className="edit-page-layout">
        <main className="edit-page-map" ref={mapRef} onDrop={handleDrop} onDragOver={(e) => e.preventDefault()}>
          <TransformWrapper ref={transformRef} panning={{ disabled: isDraggingElement }} initialScale={1} minScale={0.05} maxScale={10} limitToBounds={false} wheel={{ step: 0.002, smooth: true }}>
            <TransformComponent wrapperStyle={{ width: "100%", height: "100%", cursor: isDraggingElement ? "grabbing" : "grab" }}>
              <div className="map-content" style={{ width: calculatedMapSize.width, height: calculatedMapSize.height, background: isDarkMode ? "#0f172a" : "#e0e0e0" }}>
                <Stage width={calculatedMapSize.width} height={calculatedMapSize.height} onMouseDown={checkDeselect} onTouchStart={checkDeselect}>
                  <Layer>
                    <Rect id="bg-grid" x={0} y={0} width={calculatedMapSize.width} height={calculatedMapSize.height} fill="transparent" />
                    {drawGrid()}

                    {placedElements
                      .filter(el => el.floor === activeEditFloor)
                      .map((rect, i) => (
                        <ElementShape
                          key={rect.id}
                          shapeProps={rect}
                          isSelected={rect.id === selectedId}
                          setIsDraggingElement={setIsDraggingElement}
                          GRID_SIZE={GRID_SIZE}
                          onSelect={() => setSelectedId(rect.id)}
                          onChange={(newAttrs) => {
                            const index = placedElements.findIndex(e => e.id === rect.id);
                            const newElements = [...placedElements];
                            newElements[index] = newAttrs;
                            setPlacedElements(newElements);
                            saveHistory(newElements);
                          }}
                          originalElements={originalElements}
                          language={language}
                          isDarkMode={isDarkMode}
                        />
                      ))}
                  </Layer>
                </Stage>
              </div>
            </TransformComponent>
          </TransformWrapper>
        </main>

        <aside className="edit-page-right-panel">
          <div className="edit-card">
            <h4 className="edit-card-title">
              <span>🏢 {getText('floor_management')}</span>
              <span className="badge">{floors.length} {getText('floors_count')}</span>
            </h4>
            <select
              value={activeEditFloor}
              onChange={(e) => {
                setActiveEditFloor(e.target.value);
                setSelectedId(null);
              }}
              className="edit-select"
            >
              {floors.map(f => <option key={f} value={f}>{translateName(f, language)}</option>)}
            </select>

            <div className="edit-btn-group">
              <button onClick={handleAddFloor} className="edit-btn btn-success">{getText('add_floor')}</button>
              <button onClick={handleDeleteFloor} className="edit-btn btn-danger">{getText('del_floor')}</button>
            </div>
          </div>

          <div className="edit-btn-group" style={{ marginBottom: "15px" }}>
            <button
              onClick={handleUndo}
              disabled={historyStep <= 0}
              className="edit-btn btn-secondary"
              title="Undo (Ctrl+Z)"
            >
              ↶ {getText('undo')}
            </button>
            <button
              onClick={handleRedo}
              disabled={historyStep >= history.length - 1}
              className="edit-btn btn-secondary"
              title="Redo (Ctrl+Y)"
            >
              {getText('redo')} ↷
            </button>
          </div>

          <h3>{getText('edit_panel')} - {translateName(activeEditFloor, language)}</h3>
          <div className="edit-tools">
            <p className="edit-selected-text">
              {selectedId ? `${getText('selected')}: ${translateName(placedElements.find(el => el.id === selectedId)?.name || "Kiosk", language)}` : getText('no_element_selected')}
            </p>
            <button
              className="edit-btn btn-danger delete-btn"
              onClick={deleteSelectedElement}
              disabled={!selectedId}
            >
              {getText('del_element')}
            </button>

            {selectedId && placedElements.find(el => el.id === selectedId)?.type === 'room' && (() => {
              const room = placedElements.find(el => el.id === selectedId);
              const updateRoom = (changes) => {
                const newElements = placedElements.map(el => el.id === selectedId ? { ...el, ...changes } : el);
                setPlacedElements(newElements);
                saveHistory(newElements);
              };
              return (
                <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                  <button
                    onClick={() => {
                      const submapId = `submap_${room.id}`;
                      setActiveEditFloor(submapId);
                      setSelectedId(null);

                      const hasPintuMasuk = placedElements.some(el => el.floor === submapId && el.name.toLowerCase() === 'pintu masuk');
                      if (!hasPintuMasuk) {
                        const newId = generateNextKioskId();
                        const newElements = [...placedElements, {
                          id: newId, type: 'kiosk',
                          floor: submapId,
                          x: 200, y: 200,
                          width: GRID_SIZE * 2, height: GRID_SIZE * 2,
                          name: "Pintu Masuk", fill: "#FF9800", stroke: "#E65100"
                        }];
                        setPlacedElements(newElements);
                        saveHistory(newElements);
                      }
                    }}
                    className="edit-btn btn-primary"
                  >
                    {getText('enter_submap')}
                  </button>

                  <div className="endpoint-controls edit-card-inner">
                    <h4 className="endpoint-title">{getText('active_endpoint_side')}</h4>
                    <p className="endpoint-hint">{getText('change_manual_hint')}</p>
                    <div className="endpoint-grid">
                      {['top', 'bottom', 'left', 'right'].map(side => {
                        const labels = { top: getText('top'), bottom: getText('bottom'), left: getText('left'), right: getText('right') };
                        const isChecked = (room.endpoints || []).includes(side);
                        return (
                          <label key={side} className="endpoint-label">
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={() => {
                                const curr = room.endpoints || [];
                                const next = isChecked ? curr.filter(s => s !== side) : [...curr, side];
                                updateRoom({ endpoints: next.length > 0 ? next : ['bottom'] });
                              }}
                            />
                            <span className="checkbox-custom"></span>
                            {labels[side]}
                          </label>
                        );
                      })}
                    </div>
                  </div>
                </div>
              );
            })()}
          </div>

          <hr style={{ margin: "20px 0", border: "0.5px solid var(--border)" }} />

          <h3>{getText('template_elements')}</h3>
          <p style={{ fontSize: "11px", color: "var(--text-muted)", marginTop: "-5px", marginBottom: "15px" }}>{getText('template_hint')}</p>

          <div className="dnd-zone" style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            <h5 style={{ margin: "5px 0 0 0", fontSize: "12px", color: "var(--text-main)" }}>Rooms</h5>
            {[
              { name: "Ruangan Pintu Berlawanan", endpoints: ['left', 'right'], color: "#4caf50" },
              { name: "Ruangan 1 Pintu", endpoints: ['top'], color: "#4caf50" },
              { name: "Ruangan 2 Pintu", endpoints: ['left', 'bottom'], color: "#4caf50" },
              { name: "Ruangan 3 Pintu", endpoints: ['left', 'right', 'bottom'], color: "#4caf50" },
              { name: "Ruangan 4 Pintu", endpoints: ['top', 'bottom', 'left', 'right'], color: "#4caf50" }
            ].map(preset => (
              <div
                key={preset.name}
                draggable
                className="template-card template-room"
                onDragStart={(e) => {
                  e.dataTransfer.setData("text/plain", JSON.stringify({
                    type: "new-room",
                    defaultName: preset.name,
                    endpoints: preset.endpoints,
                    defaultGridWidth: 4,
                    defaultGridHeight: 4
                  }));
                }}
                onClick={() => {
                  const newId = generateNextRoomId();
                  const newElements = [...placedElements, {
                    id: newId, type: 'room', floor: activeEditFloor,
                    x: 200, y: 200, width: GRID_SIZE * 4, height: GRID_SIZE * 4,
                    name: preset.name, fill: "#e0e0e0", stroke: "#9e9e9e",
                    endpoints: preset.endpoints
                  }];
                  setPlacedElements(newElements);
                  saveHistory(newElements);
                }}
              >
                <div className="template-icon">🚪</div>
                <p>{translateName(preset.name, language)}</p>
              </div>
            ))}

            <div style={{ margin: "5px 0", borderTop: "1px solid var(--border)" }}></div>

            <h5 style={{ margin: "0", fontSize: "12px", color: "var(--text-main)" }}>Kiosk</h5>
            <div
              draggable
              onDragStart={(e) => {
                e.dataTransfer.setData("text/plain", JSON.stringify({
                  type: "new-kiosk",
                  defaultName: "Kiosk Baru",
                  defaultGridWidth: 2,
                  defaultGridHeight: 2
                }));
              }}
              onClick={() => {
                const newId = generateNextKioskId();
                const newElements = [...placedElements, {
                  id: newId, type: 'kiosk', floor: activeEditFloor,
                  x: 200, y: 200, width: GRID_SIZE * 2, height: GRID_SIZE * 2,
                  name: "Kiosk Baru"
                }];
                setPlacedElements(newElements);
                saveHistory(newElements);
              }}
              className="template-card template-kiosk"
            >
              <div className="template-icon">ℹ️</div>
              <p>{getText('drag_kiosk')}</p>
            </div>

            <div style={{ margin: "5px 0", borderTop: "1px solid var(--border)" }}></div>

            <h5 style={{ margin: "0", fontSize: "12px", color: "var(--text-main)" }}>Entrance Door</h5>
            <div
              draggable
              onDragStart={(e) => {
                e.dataTransfer.setData("text/plain", JSON.stringify({
                  type: "new-entrance",
                  defaultName: language === 'id' ? "Pintu Masuk Utama" : "Main Entrance",
                  defaultGridWidth: 2,
                  defaultGridHeight: 2
                }));
              }}
              onClick={() => {
                const newId = generateNextKioskId();
                const newElements = [...placedElements, {
                  id: newId, type: 'kiosk', floor: activeEditFloor,
                  x: 200, y: 240, width: GRID_SIZE * 2, height: GRID_SIZE * 2,
                  name: language === 'id' ? "Pintu Masuk Utama" : "Main Entrance"
                }];
                setPlacedElements(newElements);
                saveHistory(newElements);
              }}
              className="template-card template-entrance"
            >
              <div className="template-icon">🚪</div>
              <p>{language === 'id' ? 'Pintu Masuk' : 'Entrance'}</p>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}