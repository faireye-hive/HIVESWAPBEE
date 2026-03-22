import React, { useEffect } from 'react';

export default function Modal({ isOpen = true, onClose, title, size = 'lg', children }) {
    useEffect(() => {
        if (!isOpen) return;
        const handler = (e) => { if (e.key === 'Escape') onClose?.(); };
        document.addEventListener('keydown', handler);
        return () => document.removeEventListener('keydown', handler);
    }, [isOpen, onClose]);

    useEffect(() => {
        document.body.style.overflow = isOpen ? 'hidden' : '';
        return () => { document.body.style.overflow = ''; };
    }, [isOpen]);

    if (!isOpen) return null;

    const isFull = size === 'full';

    // Inline style wins over any global CSS — no overflowY here so modal-body can scroll
    const fullStyle = isFull ? {
        width: 'min(72vw, 1100px)',
        maxWidth: 'min(72vw, 1100px)',
        height: 'calc(100vh - 80px)',
        maxHeight: 'calc(100vh - 80px)',
        background: 'rgba(14, 14, 28, 0.88)',
        backdropFilter: 'blur(24px)',
        WebkitBackdropFilter: 'blur(24px)',
        border: '1px solid rgba(255,255,255,0.11)',
        boxShadow: '0 32px 80px rgba(0,0,0,0.6), inset 0 0 0 1px rgba(255,255,255,0.04)',
        // NO padding / overflowY here — let CSS handle it
    } : {};

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div
                className={`modal-content modal-${size}`}
                style={fullStyle}
                onClick={(e) => e.stopPropagation()}
            >
                <div className="modal-header">
                    {title ? <h2 className="modal-title">{title}</h2> : <span />}
                    <button className="modal-close" onClick={onClose} aria-label="Close">✕</button>
                </div>

                <div className="modal-body">
                    {children}
                </div>
            </div>
        </div>
    );
}