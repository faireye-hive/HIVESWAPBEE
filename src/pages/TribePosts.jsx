import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { getHivePosts } from '../api/hive';
import PostDetailModal from '../components/PostDetailModal';
import PublishModal from '../components/PublishModal';
import './TribePosts.css';

export default function TribePosts() {
    const { tag } = useParams();
    const [posts, setPosts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [selectedPost, setSelectedPost] = useState(null);
    const [showPublish, setShowPublish] = useState(false);

    useEffect(() => {
        let mounted = true;
        setLoading(true);
        getHivePosts(tag, 'trending', 20)
            .then(data => {
                if (mounted) setPosts(data || []);
            })
            .catch(err => {
                if (mounted) setError(err.message);
            })
            .finally(() => {
                if (mounted) setLoading(false);
            });
            
        return () => { mounted = false; };
    }, [tag]);

    return (
        <div className="container page-content tribe-posts-page">
            <div className="page-header" style={{ marginBottom: '2rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <Link to="/tribes" className="btn btn-ghost btn-sm" style={{ padding: '0.4rem 0.6rem' }}>
                        ← Back
                    </Link>
                    <h1 className="page-title">
                        #{tag} <span style={{ color: 'var(--text-secondary)', fontSize: '1.2rem', fontWeight: '500' }}>Trending Posts</span>
                    </h1>
                </div>
                <div>
                    <button className="btn btn-primary btn-sm" onClick={() => setShowPublish(true)}>
                        + Publish Post
                    </button>
                </div>
            </div>

            {loading && <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-secondary)' }}>Loading posts...</div>}
            {error && <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--danger-color)' }}>{error}</div>}

            <div className="posts-list">
                {!loading && !error && posts.map(post => {
                    // Extract a summary or first image if available
                    let thumbnail = null;
                    try {
                        const jsonMeta = JSON.parse(post.json_metadata);
                        if (jsonMeta.image && jsonMeta.image.length > 0) {
                            thumbnail = jsonMeta.image[0];
                        }
                    } catch (e) {
                        // ignore
                    }

                    const earnings = Number(post.pending_token || post.total_payout_value || 0).toFixed(3);
                    const bodyStr = post.body || post.desc || '';

                    return (
                        <div key={`${post.author}/${post.permlink}`} className="card post-card" onClick={() => setSelectedPost(post)}>
                            <div className="post-header">
                                <Link to={`/positions`} className="author-info" onClick={e => e.stopPropagation()}>
                                    <div className="author-avatar">{post.author.charAt(0).toUpperCase()}</div>
                                    <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>@{post.author}</span>
                                </Link>
                                <span className="post-time">{new Date(post.created + 'Z').toLocaleDateString()}</span>
                            </div>
                            
                            <div className="post-body">
                                {thumbnail && (
                                    <div className="post-thumbnail">
                                        <img src={thumbnail} alt={post.title} loading="lazy" />
                                    </div>
                                )}
                                <div className="post-content-preview">
                                    <h2 className="post-title">{post.title}</h2>
                                    <p className="post-summary">{bodyStr.substring(0, 150).replace(/[#*`~]/g, '')}...</p>
                                </div>
                            </div>
                            
                            <div className="post-footer">
                                <div className="post-stats">
                                    <span>❤️ {post.active_votes.length} Votes</span>
                                    <span>💬 {post.children} Comments</span>
                                </div>
                                <div className="post-earnings">
                                    ${earnings}
                                </div>
                            </div>
                        </div>
                    );
                })}

                {!loading && !error && posts.length === 0 && (
                    <div className="card" style={{ textAlign: 'center', padding: '3rem' }}>
                        No posts found for this community.
                    </div>
                )}
            </div>

            {selectedPost && (
                <PostDetailModal post={selectedPost} onClose={() => setSelectedPost(null)} />
            )}

            {showPublish && (
                <PublishModal tag={tag} onClose={() => setShowPublish(false)} />
            )}
        </div>
    );
}
