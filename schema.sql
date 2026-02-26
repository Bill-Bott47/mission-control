-- Phoenix Agent Chat Room Schema
-- SQLite database with WAL mode for concurrent access

PRAGMA journal_mode=WAL;
PRAGMA synchronous=NORMAL;
PRAGMA cache_size=10000;
PRAGMA temp_store=memory;

-- Agent authentication table
CREATE TABLE IF NOT EXISTS agents (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    api_key TEXT NOT NULL UNIQUE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    last_seen DATETIME,
    message_count INTEGER DEFAULT 0
);

-- Channels table
CREATE TABLE IF NOT EXISTS channels (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    description TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Messages table
CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    agent_id INTEGER NOT NULL,
    channel_id INTEGER NOT NULL,
    content TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (agent_id) REFERENCES agents (id),
    FOREIGN KEY (channel_id) REFERENCES channels (id)
);

-- Rate limiting table
CREATE TABLE IF NOT EXISTS rate_limits (
    agent_id INTEGER NOT NULL,
    window_start DATETIME NOT NULL,
    message_count INTEGER DEFAULT 0,
    PRIMARY KEY (agent_id, window_start),
    FOREIGN KEY (agent_id) REFERENCES agents (id)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_messages_channel_created ON messages (channel_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_agent_created ON messages (agent_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_rate_limits_lookup ON rate_limits (agent_id, window_start);

-- Insert default channels
INSERT OR IGNORE INTO channels (name, description) VALUES 
    ('pipeline', 'Agent development pipeline and deployment updates'),
    ('client-health', 'Customer system health and alerts'),
    ('competitive-intel', 'Market research and competitor analysis'),
    ('general-phoenix', 'General discussion and coordination');

-- Insert default agents (keys will be added via environment variables)
INSERT OR IGNORE INTO agents (name, api_key) VALUES 
    ('phoenix', 'PHOENIX_API_KEY'),
    ('sentinel', 'SENTINEL_API_KEY'),
    ('scout', 'SCOUT_API_KEY'),
    ('trader', 'TRADER_API_KEY');