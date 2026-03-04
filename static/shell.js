// Mission Control v2 Shell Script
class Shell {
    constructor() {
        this.approvalsBadge = document.getElementById('approvals-badge');
        this.init();
    }

    init() {
        this.updateApprovalsBadge();
        // Update badge every 30 seconds
        setInterval(() => this.updateApprovalsBadge(), 30000);
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