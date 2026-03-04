// Mission Control v2 Dashboard
class Dashboard {
    constructor() {
        this.refreshInterval = 30000; // 30 seconds
        this.init();
    }

    init() {
        this.loadSignals();
        this.loadCrew();
        this.loadSystemHealth();
        this.loadRecentActivity();
        this.loadTaskSummary();
        
        // Auto-refresh
        setInterval(() => {
            this.loadSignals();
            this.loadCrew();
            this.loadSystemHealth();
            this.loadRecentActivity();
            this.loadTaskSummary();
        }, this.refreshInterval);
    }

    async loadSignals() {
        try {
            const response = await fetch('/api/signals');
            if (!response.ok) throw new Error('Failed to fetch signals');
            const data = await response.json();
            this.renderSignals(data.items);
        } catch (error) {
            console.error('Failed to load signals:', error);
            this.renderSignalsError();
        }
    }

    renderSignals(items) {
        const track = document.getElementById('ticker-track');
        if (!items || items.length === 0) {
            track.innerHTML = '<div class="ticker-item">No signals available</div>';
            return;
        }

        const html = items.map(item => {
            const dirClass = item.direction ? item.direction.toLowerCase() : '';
            const price = item.price ? ` ${item.price}` : '';
            const funding = item.funding ? ` (${item.funding})` : '';
            const confidence = item.confidence ? ` ${item.confidence}` : '';
            return `<div class="ticker-item ${dirClass}">${item.symbol}${price}${funding}${confidence}</div>`;
        }).join('');

        track.innerHTML = html;
    }

    renderSignalsError() {
        const track = document.getElementById('ticker-track');
        track.innerHTML = '<div class="ticker-item">Signal data unavailable</div>';
    }

    async loadCrew() {
        try {
            const response = await fetch('/api/crew-status');
            if (!response.ok) throw new Error('Failed to fetch crew');
            const data = await response.json();
            this.renderCrew(data);
        } catch (error) {
            console.error('Failed to load crew:', error);
            this.renderCrewError();
        }
    }

    renderCrew(data) {
        const container = document.getElementById('crew-summary');
        const meta = document.getElementById('crew-meta');
        const active = data.active || 0;
        const erroring = data.erroring || 0;
        const idle = data.idle || 0;
        
        meta.textContent = `${active} active, ${erroring} erroring`;
        
        const html = `
            <div class="crew-summary">
                <div class="crew-row">
                    <span>Active Agents</span>
                    <span class="status-pill up">${active}</span>
                </div>
                <div class="crew-row">
                    <span>Erroring</span>
                    <span class="status-pill ${erroring > 0 ? 'down' : 'up'}">${erroring}</span>
                </div>
                <div class="crew-row">
                    <span>Idle</span>
                    <span class="status-pill warn">${idle}</span>
                </div>
            </div>
        `;
        
        container.innerHTML = html;
    }

    renderCrewError() {
        const container = document.getElementById('crew-summary');
        container.innerHTML = '<div class="placeholder">Failed to load team status</div>';
    }

    async loadSystemHealth() {
        try {
            const response = await fetch('/api/system-health');
            if (!response.ok) throw new Error('Failed to fetch health');
            const data = await response.json();
            this.renderSystemHealth(data);
        } catch (error) {
            console.error('Failed to load system health:', error);
            this.renderSystemHealthError();
        }
    }

    renderSystemHealth(data) {
        const container = document.getElementById('system-health');
        const meta = document.getElementById('health-meta');
        
        const cronOk = data.cron_ok || 0;
        const cronErr = data.cron_errors || 0;
        meta.textContent = `${cronOk} cron ok, ${cronErr} errors`;
        
        const html = `
            <div class="health-grid">
                <div class="health-row">
                    <span>Gateway</span>
                    <span class="status-pill ${data.gateway === 'up' ? 'up' : 'down'}">${data.gateway}</span>
                </div>
                <div class="health-row">
                    <span>pai (compute)</span>
                    <span class="status-pill ${data.pai === 'up' ? 'up' : 'down'}">${data.pai || '?'}</span>
                </div>
                <div class="health-row">
                    <span>Cron Jobs</span>
                    <span class="status-pill ${cronErr > 0 ? 'warn' : 'up'}">${cronOk} ok / ${cronErr} err</span>
                </div>
                <div class="health-row">
                    <span>Uptime</span>
                    <span class="status-pill">${data.uptime || '—'}</span>
                </div>
            </div>
        `;
        
        container.innerHTML = html;
    }

    renderSystemHealthError() {
        const container = document.getElementById('system-health');
        container.innerHTML = '<div class="placeholder">Failed to load health status</div>';
    }

    async loadRecentActivity() {
        try {
            const response = await fetch('/api/recent-activity');
            if (!response.ok) throw new Error('Failed to fetch activity');
            const data = await response.json();
            this.renderRecentActivity(data.items);
        } catch (error) {
            console.error('Failed to load recent activity:', error);
            this.renderRecentActivityError();
        }
    }

    renderRecentActivity(items) {
        const container = document.getElementById('recent-activity');
        
        if (!items || items.length === 0) {
            container.innerHTML = '<div class="placeholder">No recent activity</div>';
            return;
        }

        const html = `
            <div class="activity-list">
                ${items.slice(0, 5).map(item => `
                    <div class="activity-item">
                        <div style="font-weight: 500;">${this.escapeHtml(item.title || 'Unknown event')}</div>
                        <div style="font-size: 12px; color: #7f8dbd; margin-top: 2px;">
                            ${item.agent ? this.escapeHtml(item.agent) + ' • ' : ''}${this.formatTime(item.timestamp)}
                        </div>
                    </div>
                `).join('')}
            </div>
        `;
        
        container.innerHTML = html;
    }

    renderRecentActivityError() {
        const container = document.getElementById('recent-activity');
        container.innerHTML = '<div class="placeholder">Failed to load activity</div>';
    }

    async loadTaskSummary() {
        try {
            const response = await fetch('/api/task-summary');
            if (!response.ok) throw new Error('Failed to fetch tasks');
            const data = await response.json();
            this.renderTaskSummary(data);
        } catch (error) {
            console.error('Failed to load task summary:', error);
            this.renderTaskSummaryError();
        }
    }

    renderTaskSummary(data) {
        const container = document.getElementById('task-summary');
        const counts = data.counts || {};
        
        const html = `
            <div class="task-summary">
                <div class="task-chip">
                    <strong>${counts['INBOX'] || 0}</strong>
                    <span>Inbox</span>
                </div>
                <div class="task-chip">
                    <strong>${counts['IN PROGRESS'] || 0}</strong>
                    <span>Active</span>
                </div>
                <div class="task-chip">
                    <strong>${counts['REVIEW'] || 0}</strong>
                    <span>Review</span>
                </div>
                <div class="task-chip">
                    <strong>${counts['DONE'] || 0}</strong>
                    <span>Done</span>
                </div>
            </div>
        `;
        
        container.innerHTML = html;
    }

    renderTaskSummaryError() {
        const container = document.getElementById('task-summary');
        container.innerHTML = '<div class="placeholder">Failed to load task summary</div>';
    }

    formatTime(timestamp) {
        if (!timestamp) return 'Unknown';
        try {
            const date = new Date(timestamp);
            return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        } catch {
            return 'Unknown';
        }
    }

    escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}

// Initialize dashboard when page loads
document.addEventListener('DOMContentLoaded', () => {
    new Dashboard();
});