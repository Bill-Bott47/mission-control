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

-- ============================================================================
-- SharkTime Signal Tracking Schema
-- Integrates with pai signal-intelligence system
-- ============================================================================

-- Trader profiles being tracked
CREATE TABLE IF NOT EXISTS shark_traders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    display_name TEXT,
    platform TEXT DEFAULT 'twitter',
    active INTEGER DEFAULT 1,
    last_tweet_at INTEGER,
    signal_count INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Raw tweets captured from traders
CREATE TABLE IF NOT EXISTS shark_tweets (
    id TEXT PRIMARY KEY,
    trader_id INTEGER NOT NULL,
    text TEXT NOT NULL,
    link TEXT,
    pub_ts INTEGER,
    scraped_at INTEGER DEFAULT (strftime('%s','now')),
    processed INTEGER DEFAULT 0,
    FOREIGN KEY (trader_id) REFERENCES shark_traders (id)
);

-- Extracted trade theses from tweets
CREATE TABLE IF NOT EXISTS shark_theses (
    id TEXT PRIMARY KEY,
    tweet_id TEXT NOT NULL,
    trader_id INTEGER NOT NULL,
    ticker TEXT,
    direction TEXT,
    timeframe TEXT,
    thesis_types TEXT,
    thesis_summary TEXT,
    entry_price REAL,
    target_price REAL,
    stop_loss REAL,
    trader_confidence INTEGER,
    has_trade INTEGER DEFAULT 0,
    extracted_at INTEGER DEFAULT (strftime('%s','now')),
    FOREIGN KEY (tweet_id) REFERENCES shark_tweets(id),
    FOREIGN KEY (trader_id) REFERENCES shark_traders (id)
);

-- Aggregated signals (unified from multiple trader theses)
CREATE TABLE IF NOT EXISTS shark_signals (
    id TEXT PRIMARY KEY,
    ticker TEXT NOT NULL,
    direction TEXT NOT NULL,
    trader_names TEXT,
    thesis_summary TEXT,
    confidence REAL,
    thesis_types TEXT,
    key_levels TEXT,
    tweet_ids TEXT,
    thesis_ids TEXT,
    fired_at INTEGER DEFAULT (strftime('%s','now')),
    notified INTEGER DEFAULT 0,
    status TEXT DEFAULT 'active'
);

-- Signal performance tracking
CREATE TABLE IF NOT EXISTS shark_performance (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    signal_id TEXT NOT NULL,
    ticker TEXT NOT NULL,
    direction TEXT,
    entry_price REAL,
    exit_price REAL,
    pnl_pct REAL,
    realized_at INTEGER,
    notes TEXT,
    FOREIGN KEY (signal_id) REFERENCES shark_signals (id)
);

-- Indexes for SharkTime performance
CREATE INDEX IF NOT EXISTS idx_shark_theses_ticker ON shark_theses(ticker, direction);
CREATE INDEX IF NOT EXISTS idx_shark_theses_trader ON shark_theses(trader_id);
CREATE INDEX IF NOT EXISTS idx_shark_theses_ts ON shark_theses(extracted_at);
CREATE INDEX IF NOT EXISTS idx_shark_tweets_trader ON shark_tweets(trader_id);
CREATE INDEX IF NOT EXISTS idx_shark_signals_ticker ON shark_signals(ticker, status);
CREATE INDEX IF NOT EXISTS idx_shark_signals_fired ON shark_signals(fired_at);

-- Insert default tracked traders
INSERT OR IGNORE INTO shark_traders (username, display_name, platform) VALUES 
    ('Mandelbrot', 'Mandelbrot', 'twitter'),
    ('Altstreet', 'Altstreet Bets', 'twitter'),
    ('CavanXy', 'Cavan', 'twitter'),
    ('Tradermayne', 'Trader Mayne', 'twitter'),
    ('Pegasus', 'Pegasus', 'twitter'),
    ('fejau', 'fejau', 'twitter');