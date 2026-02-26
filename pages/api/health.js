// Phoenix Agent Chat Room Health Check
// GET /api/health - System status and agent activity

import { getChannels } from '../../lib/database.js';
import db from '../../lib/database.js';

export default function handler(req, res) {
    if (req.method !== 'GET') {
        res.setHeader('Allow', ['GET']);
        return res.status(405).json({ error: 'Method not allowed' });
    }
    
    try {
        // Check database connectivity
        const channels = getChannels();
        
        // Get agent activity stats
        const agentStats = db.prepare(`
            SELECT 
                a.name,
                a.last_seen,
                a.message_count,
                COUNT(m.id) as messages_today
            FROM agents a
            LEFT JOIN messages m ON a.id = m.agent_id 
                AND date(m.created_at) = date('now')
            GROUP BY a.id, a.name, a.last_seen, a.message_count
            ORDER BY a.name
        `).all();
        
        // Get message counts by channel today
        const channelStats = db.prepare(`
            SELECT 
                c.name as channel_name,
                COUNT(m.id) as messages_today
            FROM channels c
            LEFT JOIN messages m ON c.id = m.channel_id 
                AND date(m.created_at) = date('now')
            GROUP BY c.id, c.name
            ORDER BY c.name
        `).all();
        
        // Calculate system health score
        const activeAgents = agentStats.filter(a => {
            const lastSeen = a.last_seen ? new Date(a.last_seen) : null;
            const hoursSinceLastSeen = lastSeen ? (Date.now() - lastSeen.getTime()) / (1000 * 60 * 60) : 999;
            return hoursSinceLastSeen < 24;
        }).length;
        
        const totalMessages = channelStats.reduce((sum, c) => sum + c.messages_today, 0);
        const healthScore = Math.min(100, (activeAgents * 25) + Math.min(50, totalMessages * 2));
        
        res.status(200).json({
            status: 'healthy',
            timestamp: new Date().toISOString(),
            health_score: healthScore,
            database: {
                connected: true,
                mode: 'WAL',
                channels_configured: channels.length,
                agents_registered: agentStats.length
            },
            agents: agentStats,
            channels: channelStats,
            system: {
                process_uptime: process.uptime(),
                memory_usage: process.memoryUsage(),
                node_version: process.version
            }
        });
        
    } catch (error) {
        console.error('Health check failed:', error);
        res.status(500).json({
            status: 'unhealthy',
            timestamp: new Date().toISOString(),
            error: error.message,
            database: {
                connected: false
            }
        });
    }
}