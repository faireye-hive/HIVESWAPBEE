import React, { useState } from 'react';
import Modal from './Modal.jsx';
import { getHiveRpc, setHiveRpc, DEFAULT_HIVE_RPC } from '../api/hive';
import { getHiveEngineRpc, setHiveEngineRpc, DEFAULT_HIVE_ENGINE_RPC } from '../api/hiveEngine';

export default function RpcSettingsModal({ onClose }) {
    const [hiveRpc, setLocalHiveRpc] = useState(getHiveRpc());
    const [heRpc, setLocalHeRpc] = useState(getHiveEngineRpc());

    const handleSave = () => {
        setHiveRpc(hiveRpc.trim() || DEFAULT_HIVE_RPC);
        setHiveEngineRpc(heRpc.trim() || DEFAULT_HIVE_ENGINE_RPC);
        
        // Reload to apply settings globally to all hooks easily
        window.location.reload();
    };

    const handleReset = () => {
        setLocalHiveRpc(DEFAULT_HIVE_RPC);
        setLocalHeRpc(DEFAULT_HIVE_ENGINE_RPC);
    };

    return (
        <Modal title="RPC Node Settings" onClose={onClose}>
            <div className="rpc-settings">
                <p style={{ marginBottom: '1rem', color: 'var(--text-light)', fontSize: '0.9rem' }}>
                    Select custom RPC nodes for your connection to the Hive Blockchains.
                </p>

                <div className="form-group" style={{ marginBottom: '1rem' }}>
                    <label style={{ display: 'block', marginBottom: '0.4rem', fontWeight: 'bold' }}>
                        Hive Mainnet RPC
                    </label>
                    <input
                        type="url"
                        className="input"
                        value={hiveRpc}
                        onChange={(e) => setLocalHiveRpc(e.target.value)}
                        placeholder={DEFAULT_HIVE_RPC}
                        style={{ width: '100%' }}
                    />
                </div>

                <div className="form-group" style={{ marginBottom: '1.5rem' }}>
                    <label style={{ display: 'block', marginBottom: '0.4rem', fontWeight: 'bold' }}>
                        Hive-Engine RPC
                    </label>
                    <input
                        type="url"
                        className="input"
                        value={heRpc}
                        onChange={(e) => setLocalHeRpc(e.target.value)}
                        placeholder={DEFAULT_HIVE_ENGINE_RPC}
                        style={{ width: '100%' }}
                    />
                </div>

                <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                    <button className="btn btn-ghost" onClick={handleReset}>
                        Reset Defaults
                    </button>
                    <button className="btn btn-primary" onClick={handleSave}>
                        Save & Reload
                    </button>
                </div>
            </div>
        </Modal>
    );
}
