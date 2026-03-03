-- Kanban board schema for Mission Control v2
CREATE TABLE IF NOT EXISTS kanban_tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    description TEXT DEFAULT '',
    column_name TEXT NOT NULL DEFAULT 'INBOX',
    position INTEGER DEFAULT 0,
    priority TEXT DEFAULT 'medium',  -- low | medium | high | urgent
    assigned_agent TEXT DEFAULT '',
    tags TEXT DEFAULT '',            -- comma-separated
    ai_notes TEXT DEFAULT '',        -- AI planning output
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    due_date TEXT DEFAULT NULL
);

CREATE INDEX IF NOT EXISTS idx_kanban_column ON kanban_tasks(column_name);
CREATE INDEX IF NOT EXISTS idx_kanban_position ON kanban_tasks(column_name, position);
