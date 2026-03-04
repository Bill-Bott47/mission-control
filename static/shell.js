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
            // Double the items for seamless scroll loop
            const html = items.concat(items).map(item => {
                const dir = (item.direction || '').toLowerCase();
                const price = item.price ? ` ${item.price}` : '';
                const funding = item.funding ? ` (${item.funding})` : '';
                const conf = item.confidence ? ` ${item.confidence}` : '';
                return `<div class="ticker-item ${dir}">${item.symbol}${price}${funding}${conf}</div>`;
            }).join('');
            track.innerHTML = html;
        } catch (e) {
            console.warn('Ticker fetch failed:', e);
        }
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