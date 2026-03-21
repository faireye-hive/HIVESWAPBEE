import React, { useState } from 'react';
import Modal from './Modal.jsx';
import { useKeychainContext } from '../context/KeychainContext.jsx';
import { useToast } from '../context/ToastContext.jsx';

export default function DelegateModal({ symbol, onClose }) {
    const [to, setTo] = useState('');
    const [amount, setAmount] = useState('');
    const [submitting, setSubmitting] = useState(false);
    
    const { user, broadcastCustomJson, isKeychainInstalled } = useKeychainContext();
    const { success, error: toastError } = useToast();

    const handleDelegate = async (e) => {
        e.preventDefault();
        if (!user) {
            toastError('Please login to delegate tokens.');
            return;
        }
        if (!to.trim() || !amount.trim() || isNaN(amount) || Number(amount) <= 0) return;

        setSubmitting(true);
        try {
            await broadcastCustomJson('tokens', 'delegate', {
                symbol,
                to: to.trim().toLowerCase(),
                quantity: Number(amount).toString(), // format safely
            });
            success(`Successfully delegated ${amount} ${symbol} to @${to}`);
            onClose();
        } catch (err) {
            toastError(err.message || 'Delegation failed');
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <Modal title={`Delegate ${symbol}`} onClose={onClose}>
            {!isKeychainInstalled() ? (
                <div style={{ color: 'var(--danger-color)' }}>
                    Hive Keychain is not installed.
                </div>
            ) : !user ? (
                <div style={{ color: 'var(--text-secondary)' }}>
                    Please login to delegate tokens.
                </div>
            ) : (
                <form onSubmit={handleDelegate}>
                    <div className="form-group" style={{ marginBottom: '1rem' }}>
                        <label className="form-label">Delegate To (Username)</label>
                        <input
                            type="text"
                            className="input"
                            value={to}
                            onChange={(e) => setTo(e.target.value)}
                            placeholder="username"
                            required
                        />
                    </div>
                    <div className="form-group" style={{ marginBottom: '1.5rem' }}>
                        <label className="form-label">Amount</label>
                        <input
                            type="number"
                            step="any"
                            min="0.001"
                            className="input"
                            value={amount}
                            onChange={(e) => setAmount(e.target.value)}
                            placeholder="0.00"
                            required
                        />
                    </div>
                    <button type="submit" className="btn btn-primary" style={{ width: '100%' }} disabled={submitting}>
                        {submitting ? 'Broadcasting...' : 'Delegate'}
                    </button>
                    <div style={{ marginTop: '1rem', fontSize: '0.8rem', color: 'var(--text-secondary)', textAlign: 'center' }}>
                        Ensure the token supports delegation before proceeding.
                    </div>
                </form>
            )}
        </Modal>
    );
}
