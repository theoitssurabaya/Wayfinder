import React, { useState, useRef, useEffect } from 'react';

const LanguageSelector = ({ language, onChange, isMobile = false }) => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const options = [
    { value: 'id', label: 'ID', flag: 'https://flagcdn.com/w20/id.png' },
    { value: 'en', label: 'EN', flag: 'https://flagcdn.com/w20/gb.png' }
  ];

  const currentOption = options.find(opt => opt.value === language) || options[0];

  const desktopStyle = {
    background: "transparent",
    border: "1px solid var(--border, white)",
    color: "var(--white, white)",
    padding: "5px 10px",
    borderRadius: "5px",
    cursor: "pointer",
    fontWeight: "bold",
    display: "flex",
    alignItems: "center",
    gap: "6px",
    minWidth: "70px",
    justifyContent: "space-between"
  };

  const mobileStyle = {
    background: "var(--white)",
    border: "1px solid var(--border)",
    color: "var(--text-main)",
    padding: "8px 12px",
    borderRadius: "10px",
    cursor: "pointer",
    fontWeight: "bold",
    boxShadow: "var(--shadow-md)",
    display: "flex",
    alignItems: "center",
    gap: "6px",
    minWidth: "70px",
    justifyContent: "space-between"
  };

  const containerStyle = {
    position: "relative",
    userSelect: "none"
  };

  const menuStyle = {
    position: "absolute",
    top: "100%",
    right: 0,
    marginTop: "4px",
    background: "var(--white, #fff)",
    border: "1px solid var(--border, #ccc)",
    borderRadius: "5px",
    boxShadow: "0 4px 6px rgba(0,0,0,0.1)",
    zIndex: 1000,
    overflow: "hidden",
    minWidth: "100%"
  };

  const itemStyle = {
    padding: "8px 12px",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    gap: "8px",
    color: "var(--text-main, #333)",
    background: "transparent",
  };

  return (
    <div style={containerStyle} ref={dropdownRef}>
      <div 
        style={isMobile ? mobileStyle : desktopStyle} 
        onClick={() => setIsOpen(!isOpen)}
      >
        <img src={currentOption.flag} alt={currentOption.label} style={{ width: 20, height: 15, objectFit: 'cover', borderRadius: '2px' }} />
        <span style={{color: isMobile ? "var(--text-main)" : "inherit"}}>{currentOption.label}</span>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ transform: isOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s', color: isMobile ? "var(--text-main)" : "inherit" }}>
          <polyline points="6 9 12 15 18 9"></polyline>
        </svg>
      </div>
      {isOpen && (
        <div style={menuStyle}>
          {options.map(opt => (
            <div 
              key={opt.value}
              style={{
                ...itemStyle,
                background: language === opt.value ? 'rgba(0,0,0,0.05)' : 'transparent'
              }}
              onClick={() => {
                onChange({ target: { value: opt.value } });
                setIsOpen(false);
              }}
              onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(0,0,0,0.05)'}
              onMouseLeave={(e) => e.currentTarget.style.background = language === opt.value ? 'rgba(0,0,0,0.05)' : 'transparent'}
            >
              <img src={opt.flag} alt={opt.label} style={{ width: 20, height: 15, objectFit: 'cover', borderRadius: '2px' }} />
              <span style={{color: 'black'}}>{opt.label}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default LanguageSelector;
