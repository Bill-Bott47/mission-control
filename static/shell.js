// Mission Control v2 Shell Script
class Shell {
    constructor() {
        this.approvalsBadge = document.getElementById('approvals-badge');
        this.init();
    }

    init() {
        this.updateApprovalsBadge();
        this.loadGlobalTicker();
        setInterval(() => this.updateApprovalsBadge(), 30000);
        setInterval(() => this.loadGlobalTicker(), 30000);
    }

    async loadGlobalTicker() {
        const track = document.getElementById('global-ticker-track');
        if (!track) return;
        try {
            const resp = await fetch('/api/signals');
            if (!resp.ok) return;
            const data = await resp.json();
            const items = data.items || [];
            if (items.length === 0) {
                track.innerHTML = '<div class="ticker-item">No signals</div>';
                return;
            }
            const itemHtml = items.map(item => {
                const dir = (item.direction || '').toLowerCase();
                const confidence = item.confidence ? String(item.confidence).toUpperCase() : 'MED';
                const asset = this.escapeHtml(item.asset_name || item.symbol || item.asset || 'Unknown');
                const direction = this.escapeHtml((item.direction || '—').toUpperCase());
                const entry = item.entry ? `Entry ${this.escapeHtml(item.entry)}` : 'Entry —';
                const tp = item.tp1 ? `TP ${this.escapeHtml(item.tp1)}` : 'TP —';
                const sl = item.sl ? `SL ${this.escapeHtml(item.sl)}` : 'SL —';
                return `
                    <a href="/signals" class="ticker-item ticker-rich ${dir}">
                        <span class="ticker-line1">${confidence} · ${asset} ${direction}</span>
                        <span class="ticker-line2">${entry} · ${tp} · ${sl}</span>
                    </a>
                `;
            }).join('');
            track.innerHTML = `
                <div class="ticker-segment">${itemHtml}</div>
                <div class="ticker-segment" aria-hidden="true">${itemHtml}</div>
            `;
        } catch (e) {
            console.warn('Ticker fetch failed:', e);
        }
    }

    escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    async updateApprovalsBadge() {
        try {
            const response = await fetch('/api/approvals');
            if (response.ok) {
                const data = await response.json();
                const pendingCount = data.approvals.filter(a => a.status === 'pending').length;
                this.approvalsBadge.textContent = pendingCount;
                this.approvalsBadge.style.display = pendingCount > 0 ? 'inline' : 'none';
            }
        } catch (error) {
            console.warn('Failed to update approvals badge:', error);
        }
    }
}

// Initialize shell when DOM loads
document.addEventListener('DOMContentLoaded', () => {
    new Shell();
});
