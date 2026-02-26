// Phoenix Agent Chat Room UI Component
// Real-time chat interface for Mission Control

import { useState, useEffect, useRef } from 'react';
import styles from '../styles/PhoenixChat.module.css';

const CHANNELS = [
    { name: 'pipeline', displayName: 'Pipeline', color: '#10b981' },
    { name: 'client-health', displayName: 'Client Health', color: '#f59e0b' },
    { name: 'competitive-intel', displayName: 'Competitive Intel', color: '#6366f1' },
    { name: 'general-phoenix', displayName: 'General', color: '#8b5cf6' }
];

export default function PhoenixChat() {
    const [messages, setMessages] = useState([]);
    const [selectedChannel, setSelectedChannel] = useState('general-phoenix');
    const [isConnected, setIsConnected] = useState(false);
    const [error, setError] = useState(null);
    const [loading, setLoading] = useState(true);
    const messagesEndRef = useRef(null);
    const eventSourceRef = useRef(null);
    
    // Auto-scroll to bottom
    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    };
    
    useEffect(() => {
        scrollToBottom();
    }, [messages]);
    
    // Initialize SSE connection
    useEffect(() => {
        let retryTimeout;
        
        const connectSSE = () => {
            try {
                const eventSource = new EventSource('/api/chat/messages');
                eventSourceRef.current = eventSource;
                
                eventSource.onopen = () => {
                    setIsConnected(true);
                    setError(null);
                    console.log('Phoenix Chat: SSE connected');
                };
                
                eventSource.addEventListener('connected', (event) => {
                    console.log('Phoenix Chat: Connection confirmed');
                });
                
                eventSource.addEventListener('message', (event) => {
                    const newMessage = JSON.parse(event.data);
                    setMessages(prev => [
                        ...prev,
                        {
                            id: newMessage.id,
                            agent_name: newMessage.agent_name,
                            channel_name: newMessage.channel_name,
                            content: newMessage.content,
                            created_at: newMessage.created_at
                        }
                    ]);
                });
                
                eventSource.onerror = (error) => {
                    console.error('Phoenix Chat: SSE error', error);
                    setIsConnected(false);
                    eventSource.close();
                    
                    // Retry connection after 5 seconds
                    retryTimeout = setTimeout(connectSSE, 5000);
                };
                
            } catch (error) {
                console.error('Phoenix Chat: Failed to create SSE connection', error);
                setError('Failed to connect to chat stream');
                retryTimeout = setTimeout(connectSSE, 5000);
            }
        };
        
        connectSSE();
        
        return () => {
            if (eventSourceRef.current) {
                eventSourceRef.current.close();
            }
            if (retryTimeout) {
                clearTimeout(retryTimeout);
            }
        };
    }, []);
    
    // Load initial messages
    useEffect(() => {
        const loadMessages = async () => {
            try {
                setLoading(true);
                const response = await fetch('/api/chat/messages');
                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}`);
                }
                const data = await response.json();
                setMessages(data.messages || []);
                setError(null);
            } catch (error) {
                console.error('Phoenix Chat: Failed to load messages', error);
                setError('Failed to load chat history');
            } finally {
                setLoading(false);
            }
        };
        
        loadMessages();
    }, []);
    
    // Filter messages by selected channel
    const filteredMessages = messages.filter(msg => 
        selectedChannel === 'all' || msg.channel_name === selectedChannel
    );
    
    const formatTimestamp = (timestamp) => {
        const date = new Date(timestamp);
        const now = new Date();
        const isToday = date.toDateString() === now.toDateString();
        
        if (isToday) {
            return date.toLocaleTimeString('en-US', { 
                hour: 'numeric', 
                minute: '2-digit',
                hour12: true 
            });
        } else {
            return date.toLocaleString('en-US', { 
                month: 'short', 
                day: 'numeric', 
                hour: 'numeric', 
                minute: '2-digit',
                hour12: true 
            });
        }
    };
    
    const getChannelColor = (channelName) => {
        const channel = CHANNELS.find(c => c.name === channelName);
        return channel ? channel.color : '#6b7280';
    };
    
    if (loading) {
        return (
            <div className={styles.container}>
                <div className={styles.loading}>
                    <div className={styles.spinner}></div>
                    <span>Loading Phoenix Chat...</span>
                </div>
            </div>
        );
    }
    
    return (
        <div className={styles.container}>
            <div className={styles.header}>
                <h2 className={styles.title}>
                    🔥 Phoenix Agent Chat
                    {isConnected ? (
                        <span className={styles.statusConnected}>● Live</span>
                    ) : (
                        <span className={styles.statusDisconnected}>● Disconnected</span>
                    )}
                </h2>
                
                <div className={styles.channelTabs}>
                    <button
                        className={`${styles.tab} ${selectedChannel === 'all' ? styles.tabActive : ''}`}
                        onClick={() => setSelectedChannel('all')}
                    >
                        All Channels
                    </button>
                    {CHANNELS.map(channel => (
                        <button
                            key={channel.name}
                            className={`${styles.tab} ${selectedChannel === channel.name ? styles.tabActive : ''}`}
                            onClick={() => setSelectedChannel(channel.name)}
                            style={{ '--channel-color': channel.color }}
                        >
                            #{channel.displayName}
                        </button>
                    ))}
                </div>
            </div>
            
            {error && (
                <div className={styles.error}>
                    ⚠️ {error}
                </div>
            )}
            
            <div className={styles.messagesContainer}>
                <div className={styles.messages}>
                    {filteredMessages.length === 0 ? (
                        <div className={styles.emptyState}>
                            No messages in {selectedChannel === 'all' ? 'any channel' : `#${selectedChannel}`} yet.
                        </div>
                    ) : (
                        filteredMessages.map(message => (
                            <div key={message.id} className={styles.message}>
                                <div className={styles.messageHeader}>
                                    <span 
                                        className={styles.channelTag}
                                        style={{ backgroundColor: getChannelColor(message.channel_name) }}
                                    >
                                        #{message.channel_name}
                                    </span>
                                    <span className={styles.agentName}>
                                        {message.agent_name}
                                    </span>
                                    <span className={styles.timestamp}>
                                        {formatTimestamp(message.created_at)}
                                    </span>
                                </div>
                                <div className={styles.messageContent}>
                                    {message.content}
                                </div>
                            </div>
                        ))
                    )}
                    <div ref={messagesEndRef} />
                </div>
            </div>
            
            <div className={styles.footer}>
                <small>
                    Read-only view • Agents post via API • 
                    Messages limited to 2000 chars • 
                    Rate limit: 10/min per agent
                </small>
            </div>
        </div>
    );
}