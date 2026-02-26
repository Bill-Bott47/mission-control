// Phoenix Agent Chat Room API
// POST /api/chat/messages - Agents post messages
// GET /api/chat/messages - SSE stream for real-time updates

import { authenticateAgent, checkRateLimit, postMessage, getChannelMessages, getAllMessages, getChannels } from '../../../lib/database.js';

const VALID_CHANNELS = ['pipeline', 'client-health', 'competitive-intel', 'general-phoenix'];

// SSE clients for real-time updates
const sseClients = new Set();

function sendToSSEClients(event, data) {
    const message = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    for (const client of sseClients) {
        try {
            client.write(message);
        } catch (error) {
            sseClients.delete(client);
        }
    }
}

export default function handler(req, res) {
    if (req.method === 'POST') {
        return handlePostMessage(req, res);
    } else if (req.method === 'GET' && req.headers.accept === 'text/event-stream') {
        return handleSSE(req, res);
    } else if (req.method === 'GET') {
        return handleGetMessages(req, res);
    } else {
        res.setHeader('Allow', ['GET', 'POST']);
        return res.status(405).json({ error: 'Method not allowed' });
    }
}

async function handlePostMessage(req, res) {
    try {
        const { content, channel } = req.body;
        const authHeader = req.headers.authorization;
        
        // Validate input
        if (!content || !channel) {
            return res.status(400).json({ 
                error: 'Missing required fields: content, channel' 
            });
        }
        
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ 
                error: 'Missing or invalid authorization header' 
            });
        }
        
        const apiKey = authHeader.slice(7);
        
        // Authenticate agent
        const agent = authenticateAgent(apiKey);
        if (!agent) {
            return res.status(401).json({ 
                error: 'Invalid API key' 
            });
        }
        
        // Validate channel
        if (!VALID_CHANNELS.includes(channel)) {
            return res.status(400).json({ 
                error: `Invalid channel. Must be one of: ${VALID_CHANNELS.join(', ')}` 
            });
        }
        
        // Check rate limit
        const rateLimit = checkRateLimit(agent.id);
        if (!rateLimit.allowed) {
            return res.status(429).json({ 
                error: 'Rate limit exceeded', 
                resetAt: rateLimit.resetAt.toISOString() 
            });
        }
        
        // Validate content length (prevent Telegram-style long message issues)
        if (content.length > 2000) {
            return res.status(400).json({ 
                error: 'Message too long (max 2000 characters)' 
            });
        }
        
        // Post message
        const message = postMessage(agent.id, channel, content);
        
        // Send real-time update to SSE clients
        sendToSSEClients('message', {
            id: message.id,
            agent_name: agent.name,
            channel_name: channel,
            content: content,
            created_at: message.created_at
        });
        
        // Return success with rate limit info
        res.status(201).json({
            success: true,
            message_id: message.id,
            rate_limit: {
                remaining: rateLimit.remaining,
                reset_at: new Date(Date.now() + 60000).toISOString()
            }
        });
        
    } catch (error) {
        console.error('Error posting message:', error);
        res.status(500).json({ 
            error: 'Internal server error',
            message: error.message 
        });
    }
}

async function handleGetMessages(req, res) {
    try {
        const { channel, limit = 50 } = req.query;
        
        let messages;
        if (channel) {
            if (!VALID_CHANNELS.includes(channel)) {
                return res.status(400).json({ 
                    error: `Invalid channel. Must be one of: ${VALID_CHANNELS.join(', ')}` 
                });
            }
            messages = getChannelMessages(channel, Math.min(parseInt(limit), 200));
        } else {
            messages = getAllMessages(Math.min(parseInt(limit), 200));
        }
        
        res.status(200).json({
            messages: messages.reverse(), // Reverse to show oldest first
            channels: getChannels()
        });
        
    } catch (error) {
        console.error('Error fetching messages:', error);
        res.status(500).json({ 
            error: 'Internal server error',
            message: error.message 
        });
    }
}

async function handleSSE(req, res) {
    // Set SSE headers
    res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Cache-Control'
    });
    
    // Add client to active connections
    sseClients.add(res);
    
    // Send initial connection confirmation
    res.write(`event: connected\ndata: ${JSON.stringify({ timestamp: new Date().toISOString() })}\n\n`);
    
    // Clean up on client disconnect
    req.on('close', () => {
        sseClients.delete(res);
    });
    
    req.on('end', () => {
        sseClients.delete(res);
    });
}