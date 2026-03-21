import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import './Tribes.css';

export default function Tribes() {
    const [tribes, setTribes] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [search, setSearch] = useState('');

    useEffect(() => {
        let mounted = true;
        setLoading(true);
        Promise.all([
            fetch('https://scot-api.hive-engine.com/config').then(res => res.json()).catch(() => []),
            fetch('https://smt-api.enginerpc.com/config').then(res => res.json()).catch(() => [])
        ])
            .then(([data1, data2]) => {
                if (!mounted) return;
                
                const combined = [...(Array.isArray(data1) ? data1 : []), ...(Array.isArray(data2) ? data2 : [])];
                const validTribes = combined.filter(t => t.token);
                
                // ensure unique tribes
                const uniqueTribesMap = new Map();
                validTribes.forEach(t => {
                   if (!uniqueTribesMap.has(t.token)) {
                       uniqueTribesMap.set(t.token, t);
                   }
                });
                const uniqueTribes = Array.from(uniqueTribesMap.values());
                
                // sort by token symbol alphabetically
                uniqueTribes.sort((a, b) => a.token.localeCompare(b.token));
                setTribes(uniqueTribes);
            })
            .catch(err => {
                if (mounted) setError(err.message);
            })
            .finally(() => {
                if (mounted) setLoading(false);
            });
            
        return () => { mounted = false; };
    }, []);

    const filtered = tribes.filter(t => {
        const tokenName = t.token.toLowerCase();
        const searchName = search.toLowerCase();
        const metaVal = t.json_metadata_value ? String(t.json_metadata_value).toLowerCase() : '';
        return tokenName.includes(searchName) || metaVal.includes(searchName);
    });

    return (
        <div className="container page-content tribes-page">
            <div className="page-header">
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem' }}>
                    <span className="page-icon">🔥</span>
                    <h1 className="page-title">Tribes & Communities</h1>
                </div>
                <div className="search-container">
                    <input
                        type="text"
                        className="input"
                        placeholder="Search tribes..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        style={{ width: '250px' }}
                    />
                </div>
            </div>

            {loading && <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-secondary)' }}>Loading communities...</div>}
            {error && <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--danger-color)' }}>{error}</div>}

            <div className="tribes-grid">
                {!loading && !error && filtered.map(tribe => {
                    const tagStr = tribe.json_metadata_value ? String(tribe.json_metadata_value).split(',')[0].trim() : tribe.token;

                    return (
                        <div key={tribe.token} className="card tribe-card">
                            <div className="tribe-header">
                                <h3>{tribe.token}</h3>
                                <span className="tribe-tag">#{tagStr.toLowerCase()}</span>
                            </div>
                            <div className="tribe-stats">
                                <div className="stat">
                                    <span className="stat-label">Author Reward</span>
                                    <span className="stat-value">{tribe.author_reward_pct || 50}%</span>
                                </div>
                                <div className="stat">
                                    <span className="stat-label">Curation Reward</span>
                                    <span className="stat-value">{tribe.curation_reward_pct || 50}%</span>
                                </div>
                            </div>
                            <Link to={`/tribes/${tribe.token}`} className="btn btn-primary" style={{ width: '100%', textAlign: 'center' }}>
                                View Posts
                            </Link>
                        </div>
                    );
                })}
                {!loading && !error && filtered.length === 0 && (
                    <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '2rem', color: 'var(--text-secondary)' }}>
                        No communities found.
                    </div>
                )}
            </div>
        </div>
    );
}
