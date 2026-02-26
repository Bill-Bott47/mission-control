// Phoenix Agent Chat Room Database
// SQLite database with WAL mode for concurrent access

import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';

const DB_PATH = path.join(process.cwd(), 'data', 'phoenix-chat.db');
const SCHEMA_PATH = path.join(process.cwd(), 'schema.sql');

// Ensure data directory exists
const dataDir = path.dirname(DB_PATH);
if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
}

// Initialize database
const db = new Database(DB_PATH);

// Initialize schema if tables don't exist
if (!fs.existsSync(DB_PATH) || db.pragma('table_list').length === 0) {
    console.log('Initializing Phoenix Chat database...');
    const schema = fs.readFileSync(SCHEMA_PATH, 'utf8');
    db.exec(schema);
    
    // Replace placeholder API keys with actual environment values
    const agents = [
        { name: 'phoenix', key: process.env.PHOENIX_API_KEY },
        { name: 'sentinel', key: process.env.SENTINEL_API_KEY },
        { name: 'scout', key: process.env.SCOUT_API_KEY },
        { name: 'trader', key: process.env.TRADER_API_KEY }
    ];
    
    const updateAgent = db.prepare('UPDATE agents SET api_key = ? WHERE name = ? AND api_key LIKE ?');
    for (const agent of agents) {
        if (agent.key) {
            updateAgent.run(agent.key, agent.name, `${agent.name.toUpperCase()}_API_KEY`);
        }
    }
    
    console.log('Database initialized with WAL mode enabled');
}

// Prepared statements for performance
const statements = {
    // Agent authentication
    getAgentByKey: db.prepare('SELECT * FROM agents WHERE api_key = ?'),
    updateAgentActivity: db.prepare('UPDATE agents SET last_seen = CURRENT_TIMESTAMP, message_count = message_count + 1 WHERE id = ?'),
    
    // Channel management
    getChannels: db.prepare('SELECT * FROM channels ORDER BY name'),
    getChannelByName: db.prepare('SELECT * FROM channels WHERE name = ?'),
    
    // Message handling
    insertMessage: db.prepare('INSERT INTO messages (agent_id, channel_id, content) VALUES (?, ?, ?)'),
    getMessages: db.prepare(`
        SELECT m.id, m.content, m.created_at, a.name as agent_name, c.name as channel_name
        FROM messages m
        JOIN agents a ON m.agent_id = a.id
        JOIN channels c ON m.channel_id = c.id
        WHERE c.id = ?
        ORDER BY m.created_at DESC
        LIMIT ?
    `),
    getAllMessages: db.prepare(`
        SELECT m.id, m.content, m.created_at, a.name as agent_name, c.name as channel_name
        FROM messages m
        JOIN agents a ON m.agent_id = a.id
        JOIN channels c ON m.channel_id = c.id
        ORDER BY m.created_at DESC
        LIMIT ?
    `),
    
    // Rate limiting
    getRateLimit: db.prepare('SELECT message_count FROM rate_limits WHERE agent_id = ? AND window_start = ?'),
    createRateLimit: db.prepare('INSERT OR REPLACE INTO rate_limits (agent_id, window_start, message_count) VALUES (?, ?, ?)'),
    incrementRateLimit: db.prepare('UPDATE rate_limits SET message_count = message_count + 1 WHERE agent_id = ? AND window_start = ?'),
    cleanOldRateLimits: db.prepare('DELETE FROM rate_limits WHERE window_start < datetime("now", "-2 hours")')
};

// Rate limiting helper
export function checkRateLimit(agentId) {
    const windowStart = new Date();
    windowStart.setMinutes(Math.floor(windowStart.getMinutes() / 1) * 1, 0, 0); // 1-minute windows
    const windowKey = windowStart.toISOString().slice(0, 16) + ':00.000Z';
    
    // Clean old rate limits (2+ hours old)
    statements.cleanOldRateLimits.run();
    
    // Get current window count
    const current = statements.getRateLimit.get(agentId, windowKey);
    const count = current ? current.message_count : 0;
    
    if (count >= 10) {
        return { allowed: false, count, resetAt: new Date(Date.now() + 60000) };
    }
    
    // Increment or create rate limit entry
    if (current) {
        statements.incrementRateLimit.run(agentId, windowKey);
    } else {
        statements.createRateLimit.run(agentId, windowKey, 1);
    }
    
    return { allowed: true, count: count + 1, remaining: 9 - count };
}

// Authentication helper
export function authenticateAgent(apiKey) {
    if (!apiKey) return null;
    return statements.getAgentByKey.get(apiKey);
}

// Message posting
export function postMessage(agentId, channelName, content) {
    const channel = statements.getChannelByName.get(channelName);
    if (!channel) {
        throw new Error(`Channel '${channelName}' not found`);
    }
    
    const result = statements.insertMessage.run(agentId, channel.id, content);
    statements.updateAgentActivity.run(agentId);
    
    return {
        id: result.lastInsertRowid,
        agent_id: agentId,
        channel_id: channel.id,
        channel_name: channelName,
        content: content,
        created_at: new Date().toISOString()
    };
}

// Message retrieval
export function getChannelMessages(channelName, limit = 50) {
    const channel = statements.getChannelByName.get(channelName);
    if (!channel) return [];
    
    return statements.getMessages.all(channel.id, limit);
}

export function getAllMessages(limit = 100) {
    return statements.getAllMessages.all(limit);
}

// Channel management
export function getChannels() {
    return statements.getChannels.all();
}

export default db;