import React, { useState } from 'react';
import Modal from './Modal';
import { useKeychainContext } from '../context/KeychainContext';
import { useToast } from '../context/ToastContext';

export default function PublishModal({ tag, onClose }) {
    const { user, isKeychainInstalled } = useKeychainContext();
    const { success, error } = useToast();
    
    const [title, setTitle] = useState('');
    const [body, setBody] = useState('');
    const [publishing, setPublishing] = useState(false);

    const handlePublish = async (e) => {
        e.preventDefault();
        
        if (!user) {
            error('Please login to publish a post.');
            return;
        }
        if (!isKeychainInstalled()) {
            error('Hive Keychain not installed.');
            return;
        }

        if (!title.trim() || !body.trim()) return;

        setPublishing(true);
        
        // Construct the permlink
        const permlink = title
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-|-$/g, '') 
            + '-' + Date.now().toString(36);

        const commentOptions = {
            author: user,
            permlink: permlink,
            max_accepted_payout: '1000000.000 HBD',
            percent_hbd: 10000,
            allow_votes: true,
            allow_curation_rewards: true,
            extensions: []
        };

        const jsonMetadata = JSON.stringify({
            tags: [tag, 'hiveswapbee'],
            app: 'hiveswapbee/1.0',
            format: 'markdown'
        });

        const operations = [
            ['comment', {
                parent_author: '',
                parent_permlink: tag, // primary tag is the category
                author: user,
                permlink: permlink,
                title: title,
                body: body,
                json_metadata: jsonMetadata
            }],
            ['comment_options', commentOptions]
        ];

        window.hive_keychain.requestBroadcast(
            user,
            operations,
            'Posting',
            (response) => {
                setPublishing(false);
                if (response.success) {
                    success('Post published successfully to #' + tag);
                    onClose();
                } else {
                    error(response.message || 'Publish failed');
                }
            }
        );
    };

    return (
        <Modal title={`Publish to #${tag}`} onClose={onClose} width="600px">
            {!user ? (
                <div style={{ color: 'var(--text-secondary)' }}>
                    Please login to publish.
                </div>
            ) : (
                <form onSubmit={handlePublish}>
                    <div className="form-group" style={{ marginBottom: '1rem' }}>
                        <label className="form-label">Title</label>
                        <input
                            type="text"
                            className="input"
                            value={title}
                            onChange={(e) => setTitle(e.target.value)}
                            placeholder="Enter a catchy title..."
                            required
                        />
                    </div>
                    
                    <div className="form-group" style={{ marginBottom: '1.5rem' }}>
                        <label className="form-label">Content (Markdown supported)</label>
                        <textarea
                            className="input"
                            value={body}
                            onChange={(e) => setBody(e.target.value)}
                            placeholder="Share your thoughts..."
                            rows={10}
                            style={{ resize: 'vertical' }}
                            required
                        />
                    </div>
                    
                    <button type="submit" className="btn btn-primary" style={{ width: '100%' }} disabled={publishing}>
                        {publishing ? 'Publishing...' : 'Publish Post'}
                    </button>
                    
                    <div style={{ marginTop: '1rem', fontSize: '0.8rem', color: 'var(--text-secondary)', textAlign: 'center' }}>
                        Your post will be published to the Hive blockchain under the category <strong>{tag}</strong>.
                    </div>
                </form>
            )}
        </Modal>
    );
}
