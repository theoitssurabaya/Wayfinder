import React, { useState, useEffect } from 'react';

export const PromptDialog = ({ isOpen, title, defaultValue, onSubmit, onCancel, okText = "OK", cancelText = "Cancel" }) => {
  const [value, setValue] = useState(defaultValue || '');
  useEffect(() => {
    if (isOpen) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setValue(defaultValue || '');
    }
  }, [defaultValue, isOpen]);
  
  if (!isOpen) return null;
  return (
    <div className="modal-overlay" style={{ zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div className="confirm-modal" onClick={(e) => e.stopPropagation()}>
        <h3 style={{ fontSize: '1.4rem', marginBottom: '15px' }}>{title}</h3>
        <input 
          type="text" 
          value={value} 
          onChange={e => setValue(e.target.value)}
          autoFocus
          onKeyDown={(e) => {
            if (e.key === 'Enter') onSubmit(value);
            if (e.key === 'Escape') onCancel();
          }}
          style={{ width: '90%', padding: '10px', marginTop: '15px', marginBottom: '15px', borderRadius: '5px', border: '1px solid #ccc', background: 'var(--bg-card, #fff)', color: 'var(--text-color, #333)', fontSize: '16px' }}
        />
        <div className="confirm-modal-actions">
          <button className="confirm-btn no" onClick={onCancel}>{cancelText}</button>
          <button className="confirm-btn yes" onClick={() => onSubmit(value)}>{okText}</button>
        </div>
      </div>
    </div>
  );
};

export const AlertDialog = ({ isOpen, title, message, onClose, okText = "OK" }) => {
  if (!isOpen) return null;
  return (
    <div className="modal-overlay" style={{ zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div className="confirm-modal" onClick={(e) => e.stopPropagation()}>
        {title && <h3 style={{ fontSize: '1.4rem', marginBottom: '15px' }}>{title}</h3>}
        <p style={{ marginTop: '10px', marginBottom: '20px', fontSize: '1.2rem', lineHeight: '1.5', fontWeight: '500' }}>{message}</p>
        <div className="confirm-modal-actions" style={{ justifyContent: 'center' }}>
          <button className="confirm-btn yes" onClick={onClose}>{okText}</button>
        </div>
      </div>
    </div>
  );
};

export const ConfirmDialog = ({ isOpen, title, message, onConfirm, onCancel, okText = "OK", cancelText = "Cancel" }) => {
  if (!isOpen) return null;
  return (
    <div className="modal-overlay" style={{ zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div className="confirm-modal" onClick={(e) => e.stopPropagation()}>
        {title && <h3 style={{ fontSize: '1.4rem', marginBottom: '15px' }}>{title}</h3>}
        <p style={{ marginTop: '10px', marginBottom: '20px', fontSize: '1.2rem', lineHeight: '1.5', fontWeight: '500' }}>{message}</p>
        <div className="confirm-modal-actions">
          <button className="confirm-btn no" onClick={onCancel}>{cancelText}</button>
          <button className="confirm-btn yes" onClick={onConfirm}>{okText}</button>
        </div>
      </div>
    </div>
  );
};
