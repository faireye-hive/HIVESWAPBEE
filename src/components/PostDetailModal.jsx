import React, { useState } from 'react';
import DOMPurify from 'dompurify';
import Modal from './Modal';
import { useKeychainContext } from '../context/KeychainContext';
import { useToast } from '../context/ToastContext';
import { getPostContent } from '../api/hive';
import './PostDetail.css';

export default function PostDetailModal({ post, onClose }) {
    const { user, isKeychainInstalled } = useKeychainContext();
    const { success, error } = useToast();
    const [voting, setVoting] = useState(false);
    const [fullBody, setFullBody] = useState('');
    const [loadingBody, setLoadingBody] = useState(true);

    React.useEffect(() => {
        let mounted = true;
        setLoadingBody(true);
        if (post.body && post.body.length > 500) {
           setFullBody(post.body);
           setLoadingBody(false);
        } else {
           getPostContent(post.author, post.permlink).then(data => {
               if (mounted) {
                   if (data && data.body) {
                       setFullBody(data.body);
                   } else {
                       setFullBody(post.desc || post.body || '');
                   }
                   setLoadingBody(false);
               }
           });
        }
        return () => { mounted = false; };
    }, [post]);
    
    let safeHtml = fullBody || '';
    safeHtml = safeHtml.replace(/\n\n/g, '<br/><br/>');
    safeHtml = safeHtml.replace(/!\[.*?\]\((.*?)\)/g, '<img style="max-width:100%; border-radius: 8px; margin: 10px 0" src="$1" />');
    safeHtml = safeHtml.replace(/\[.*?\]\((.*?)\)/g, '<a href="$1" target="_blank" rel="noopener noreferrer" style="color:var(--primary-color)">$1</a>');
    
    safeHtml = DOMPurify.sanitize(safeHtml, {
        ALLOWED_TAGS: ['b', 'i', 'em', 'strong', 'a', 'p', 'br', 'ul', 'li', 'ol', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'img', 'div', 'iframe'],
        ALLOWED_ATTR: ['href', 'src', 'alt', 'target', 'rel', 'style', 'width', 'height', 'allowfullscreen']
    });

    const handleVote = () => {
        if (!user) {
            error('Please login to vote');
            return;
        }
        if (!isKeychainInstalled()) {
            error('Hive Keychain not installed');
            return;
        }

        setVoting(true);
        window.hive_keychain.requestVote(
            user,
            post.permlink,
            post.author,
            10000, // 100%
            (response) => {
                setVoting(false);
                if (response.success) {
                    success('Vote cast successfully!');
                } else {
                    error(response.message || 'Voting failed');
                }
            }
        );
    };

    return (
        <Modal isOpen={true} title={post.title} onClose={onClose} width="800px">
            <div className="post-detail-container">
                <div className="post-meta" style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1.5rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '1rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem' }}>
                        <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'var(--accent-gradient)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', color: '#000' }}>
                            {post.author.charAt(0).toUpperCase()}
                        </div>
                        <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>@{post.author}</span>
                    </div>
                    <div>
                        <button 
                            className="btn btn-primary btn-sm"
                            onClick={handleVote}
                            disabled={voting}
                        >
                            {voting ? 'Voting...' : '❤️ Upvote (100%)'}
                        </button>
                    </div>
                </div>
                
                {loadingBody ? (
                    <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-secondary)' }}>Loading complete post...</div>
                ) : (
                    <div 
                        className="post-html-content"
                        dangerouslySetInnerHTML={{ __html: safeHtml }}
                    ></div>
                )}
            </div>
        </Modal>
    );
}
