// Mission Control v1 - Frontend Logic

class Dashboard {
    constructor() {
        this.refreshInterval = 30000; // 30 seconds
        this.infraRefreshInterval = 60000; // 60 seconds for infrastructure
        this.timer = null;
        this.infraTimer = null;
        this.connectionStatus = document.getElementById('connection-status');
        this.errorStatus = document.getElementById('error-status');
        this.lastUpdate = document.getElementById('last-update');
        
        this.init();
    }
    
    init() {
        this.loadData();
        this.loadInfrastructureData();
        this.startAutoRefresh();
        this.startInfrastructureAutoRefresh();
    }
    
    async loadData() {
        try {
            this.setConnectionStatus('loading');
            
            const response = await fetch('/api/status');
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }
            
            const data = await response.json();
            this.updateDashboard(data);
            this.setConnectionStatus('connected');
            this.clearError();
            
        } catch (error) {
            console.error('Failed to load data:', error);
            this.setConnectionStatus('error');
            this.setError(`Failed to load: ${error.message}`);
        }
    }
    
    async loadInfrastructureData() {
        try {
            const response = await fetch('/api/infrastructure');
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }
            
            const data = await response.json();
            this.updateInfrastructure(data);
            
        } catch (error) {
            console.error('Failed to load infrastructure data:', error);
            document.getElementById('infrastructure').innerHTML = 
                `<div class="loading">Failed to load infrastructure: ${error.message}</div>`;
        }
    }
    
    updateDashboard(data) {
        this.updateTimestamp(data.timestamp);
        this.updateBotStatus(data.bots);
        this.updateCronJobs(data.cron);
        this.updateTradingSignals(data.signals);
        this.updateReminders(data.reminders);
        this.updateSystemHealth(data.system);
    }
    
    updateTimestamp(timestamp) {
        const date = new Date(timestamp);
        this.lastUpdate.textContent = `Last updated: ${date.toLocaleTimeString()}`;
    }
    
    updateBotStatus(bots) {
        const container = document.getElementById('bot-status');
        
        if (!bots || bots.length === 0) {
            container.innerHTML = '<div class="loading">No bots found</div>';
            return;
        }
        
        container.innerHTML = bots.map(bot => {
            const statusClass = bot.status === 'running' ? 'running' : 
                               bot.status === 'stopped' ? 'down' : 'down';
            
            let detailsHtml = '';
            if (bot.status === 'running') {
                detailsHtml = `
                    <div class="bot-pid">PID: ${bot.pid}</div>
                    <div class="bot-uptime">${bot.uptime || 'Unknown'}</div>
                `;
            } else if (bot.error) {
                detailsHtml = `<div class="bot-error">Error: ${bot.error}</div>`;
            }
            
            return `
                <div class="bot-item ${statusClass}">
                    <div class="bot-name">${bot.name}</div>
                    <div class="bot-status">${bot.status.toUpperCase()}</div>
                    ${detailsHtml}
                </div>
            `;
        }).join('');
    }
    
    updateCronJobs(cronData) {
        const container = document.getElementById('cron-jobs');
        
        if (cronData.error) {
            container.innerHTML = `<div class="loading">Error: ${cronData.error}</div>`;
            return;
        }
        
        if (!cronData.jobs || cronData.jobs.length === 0) {
            container.innerHTML = '<div class="loading">No cron jobs</div>';
            return;
        }
        
        container.innerHTML = `
            <table class="cron-table">
                <thead>
                    <tr>
                        <th>Job</th>
                        <th>Schedule</th>
                        <th>Status</th>
                        <th>Last Run</th>
                        <th>Next Run</th>
                    </tr>
                </thead>
                <tbody>
                    ${cronData.jobs.map(job => {
                        const statusClass = job.status === 'active' ? 'status-ok' : 
                                           job.status === 'disabled' ? 'status-unknown' : 'status-error';
                        
                        return `
                            <tr>
                                <td>${job.name}</td>
                                <td class="schedule">${job.schedule}</td>
                                <td class="${statusClass}">${job.status.toUpperCase()}</td>
                                <td>${job.lastRun || 'Never'}</td>
                                <td>${job.nextRun || 'Unknown'}</td>
                            </tr>
                        `;
                    }).join('')}
                </tbody>
            </table>
        `;
    }
    
    updateTradingSignals(signals) {
        const container = document.getElementById('trading-signals');
        
        container.innerHTML = `
            <div class="signals-content">${this.escapeHtml(signals.signals)}</div>
            <div class="opportunities-content">
                <strong>Latest Daily Opportunities:</strong>
                ${this.escapeHtml(signals.daily_opportunities)}
            </div>
        `;
    }
    
    updateReminders(remindersData) {
        const container = document.getElementById('reminders');
        
        if (remindersData.error) {
            container.innerHTML = `<div class="loading">Error: ${remindersData.error}</div>`;
            return;
        }
        
        if (!remindersData.reminders || remindersData.reminders.length === 0) {
            container.innerHTML = '<div class="loading">No reminders found</div>';
            return;
        }
        
        const html = `
            <ul class="reminder-list">
                ${remindersData.reminders.map(reminder => `<li>${this.escapeHtml(reminder)}</li>`).join('')}
            </ul>
        `;
        
        container.innerHTML = html;
    }
    
    updateSystemHealth(system) {
        const container = document.getElementById('system-health');
        
        let html = '<div class="health-grid">';
        
        // Mac Mini Health
        if (system.mac_mini) {
            const mac = system.mac_mini;
            const memoryClass = mac.memory_percent > 90 ? 'critical' : 
                               mac.memory_percent > 75 ? 'warning' : 'good';
            const diskClass = mac.disk_percent > 90 ? 'critical' : 
                             mac.disk_percent > 80 ? 'warning' : 'good';
            const cpuClass = mac.cpu_percent > 90 ? 'critical' : 
                            mac.cpu_percent > 70 ? 'warning' : 'good';
            
            html += `
                <div class="health-section">
                    <h3>🖥️ Mac Mini</h3>
                    <div class="health-metrics">
                        <div class="health-metric">
                            <span>Uptime</span>
                            <span class="metric-value good">${mac.uptime || 'Unknown'}</span>
                        </div>
                        <div class="health-metric">
                            <span>CPU</span>
                            <span class="metric-value ${cpuClass}">${mac.cpu_percent || 0}%</span>
                        </div>
                        <div class="health-metric">
                            <span>Memory</span>
                            <span class="metric-value ${memoryClass}">${mac.memory_percent || 0}%</span>
                        </div>
                        <div class="health-metric">
                            <span>Disk</span>
                            <span class="metric-value ${diskClass}">${mac.disk_percent || 0}%</span>
                        </div>
                    </div>
                    ${mac.error ? `<div class="health-error">Error: ${mac.error}</div>` : ''}
                </div>
            `;
        }
        
        // Phoenix-AI Health
        if (system.phoenix_ai) {
            const phoenix = system.phoenix_ai;
            const statusClass = phoenix.status === 'up' ? 'good' : 'critical';
            
            html += `
                <div class="health-section">
                    <h3>🔥 Phoenix-AI</h3>
                    <div class="health-metrics">
                        <div class="health-metric">
                            <span>Status</span>
                            <span class="metric-value ${statusClass}">${phoenix.status.toUpperCase()}</span>
                        </div>
            `;
            
            if (phoenix.status === 'up') {
                if (phoenix.uptime) {
                    html += `
                        <div class="health-metric">
                            <span>Uptime</span>
                            <span class="metric-value good">${phoenix.uptime}</span>
                        </div>
                    `;
                }
                if (phoenix.cpu_percent !== null) {
                    const cpuClass = phoenix.cpu_percent > 90 ? 'critical' : 
                                    phoenix.cpu_percent > 70 ? 'warning' : 'good';
                    html += `
                        <div class="health-metric">
                            <span>CPU</span>
                            <span class="metric-value ${cpuClass}">${phoenix.cpu_percent}%</span>
                        </div>
                    `;
                }
                if (phoenix.ram_percent !== null) {
                    const ramClass = phoenix.ram_percent > 90 ? 'critical' : 
                                    phoenix.ram_percent > 75 ? 'warning' : 'good';
                    html += `
                        <div class="health-metric">
                            <span>RAM</span>
                            <span class="metric-value ${ramClass}">${phoenix.ram_percent}%</span>
                        </div>
                    `;
                }
                if (phoenix.disk_percent !== null) {
                    const diskClass = phoenix.disk_percent > 90 ? 'critical' : 
                                     phoenix.disk_percent > 80 ? 'warning' : 'good';
                    html += `
                        <div class="health-metric">
                            <span>Disk</span>
                            <span class="metric-value ${diskClass}">${phoenix.disk_percent}%</span>
                        </div>
                    `;
                }
            }
            
            html += '</div>';
            
            if (phoenix.error) {
                html += `<div class="health-error">Error: ${phoenix.error}</div>`;
            }
            
            html += '</div>';
        }
        
        html += '</div>';
        
        container.innerHTML = html;
    }
    
    // Grocery list function removed
    
    updateInfrastructure(data) {
        const container = document.getElementById('infrastructure');
        
        if (!data.machines) {
            container.innerHTML = '<div class="loading">No infrastructure data</div>';
            return;
        }
        
        // Build machines grid
        let machinesHtml = '<div class="machine-grid">';
        
        Object.entries(data.machines).forEach(([key, machine]) => {
            const statusClass = machine.status === 'up' ? 'up' : 
                               machine.status === 'down' ? 'down' : 'unknown';
            
            let servicesHtml = '';
            if (machine.services && Array.isArray(machine.services)) {
                servicesHtml = machine.services.map(service => {
                    if (typeof service === 'string') {
                        return `<span class="service-tag">${service}</span>`;
                    } else {
                        const serviceStatusClass = service.status === 'running' ? 'running' : 'down';
                        return `<span class="service-tag ${serviceStatusClass}">${service.name}</span>`;
                    }
                }).join('');
            } else if (machine.live_status && machine.live_status.services) {
                servicesHtml = machine.live_status.services.map(service => {
                    const serviceStatusClass = service.status === 'running' ? 'running' : 'down';
                    return `<span class="service-tag ${serviceStatusClass}">${service.name}</span>`;
                }).join('');
            }
            
            let metricsHtml = '';
            if (machine.live_status) {
                const live = machine.live_status;
                if (live.gpu_temp || live.ram_usage || live.disk_usage) {
                    metricsHtml = `
                        <div class="machine-metrics">
                            ${live.gpu_temp ? `
                                <div class="metric-item">
                                    <div class="metric-label">GPU Temp</div>
                                    <div class="metric-value ${live.gpu_temp > 80 ? 'critical' : live.gpu_temp > 70 ? 'warning' : 'good'}">${live.gpu_temp}°C</div>
                                </div>
                            ` : ''}
                            ${live.ram_usage ? `
                                <div class="metric-item">
                                    <div class="metric-label">RAM</div>
                                    <div class="metric-value ${live.ram_usage > 90 ? 'critical' : live.ram_usage > 75 ? 'warning' : 'good'}">${live.ram_usage}%</div>
                                </div>
                            ` : ''}
                            ${live.disk_usage ? `
                                <div class="metric-item">
                                    <div class="metric-label">Disk</div>
                                    <div class="metric-value ${live.disk_usage > 90 ? 'critical' : live.disk_usage > 80 ? 'warning' : 'good'}">${live.disk_usage}%</div>
                                </div>
                            ` : ''}
                        </div>
                    `;
                }
                
                if (live.error) {
                    metricsHtml += `<div class="metric-item" style="grid-column: 1/-1; color: #ef4444; font-size: 0.75rem; text-align: center;">${live.error}</div>`;
                }
            }
            
            machinesHtml += `
                <div class="machine-card ${statusClass}">
                    <div class="machine-header">
                        <div class="machine-name">${machine.name}</div>
                        <div class="machine-status ${statusClass}">${machine.status}</div>
                    </div>
                    <div class="machine-role">${machine.role}</div>
                    <div class="machine-services">${servicesHtml}</div>
                    ${metricsHtml}
                </div>
            `;
        });
        
        machinesHtml += '</div>';
        
        // Build migration plan
        let migrationHtml = '';
        if (data.migration_plan && data.migration_plan.length > 0) {
            migrationHtml = `
                <div class="migration-section">
                    <h3>📦 Migration Plan</h3>
                    <div class="migration-list">
                        ${data.migration_plan.map(item => {
                            const statusClass = item.status.includes('✅') ? 'done' : 
                                               item.status.includes('⬜') ? 'planned' : 'blocked';
                            return `
                                <div class="migration-item">
                                    <div class="migration-item-text">${this.escapeHtml(item.item)}</div>
                                    <div class="migration-status ${statusClass}">${item.status}</div>
                                </div>
                            `;
                        }).join('')}
                    </div>
                </div>
            `;
        }
        
        // Build pending tasks
        let tasksHtml = '';
        if (data.pending_tasks && data.pending_tasks.length > 0) {
            tasksHtml = `
                <div class="tasks-section">
                    <h3>📋 Pending Tasks</h3>
                    <div class="tasks-list">
                        ${data.pending_tasks.map(item => {
                            const statusClass = item.status.includes('✅') ? 'done' : 
                                               item.status.includes('⬜') ? 'planned' : 'blocked';
                            return `
                                <div class="task-item">
                                    <div class="task-item-text">
                                        <strong>${this.escapeHtml(item.task)}</strong> (${this.escapeHtml(item.machine)})
                                        ${item.blocker && item.blocker !== 'None' ? `<br><small style="color: #888;">Blocker: ${this.escapeHtml(item.blocker)}</small>` : ''}
                                    </div>
                                    <div class="task-status ${statusClass}">${item.status}</div>
                                </div>
                            `;
                        }).join('')}
                    </div>
                </div>
            `;
        }
        
        container.innerHTML = machinesHtml + migrationHtml + tasksHtml;
    }
    
    setConnectionStatus(status) {
        this.connectionStatus.className = status === 'error' ? 'error' : '';
        this.connectionStatus.textContent = status === 'loading' ? '◐' : 
                                           status === 'error' ? '●' : '●';
    }
    
    setError(message) {
        this.errorStatus.textContent = message;
    }
    
    clearError() {
        this.errorStatus.textContent = '';
    }
    
    startAutoRefresh() {
        this.timer = setInterval(() => {
            this.loadData();
        }, this.refreshInterval);
    }
    
    stopAutoRefresh() {
        if (this.timer) {
            clearInterval(this.timer);
            this.timer = null;
        }
    }
    
    startInfrastructureAutoRefresh() {
        this.infraTimer = setInterval(() => {
            this.loadInfrastructureData();
        }, this.infraRefreshInterval);
    }
    
    stopInfrastructureAutoRefresh() {
        if (this.infraTimer) {
            clearInterval(this.infraTimer);
            this.infraTimer = null;
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
    window.dashboard = new Dashboard();
});

// Handle page visibility for battery saving
document.addEventListener('visibilitychange', () => {
    if (window.dashboard) {
        if (document.hidden) {
            window.dashboard.stopAutoRefresh();
            window.dashboard.stopInfrastructureAutoRefresh();
        } else {
            window.dashboard.loadData();
            window.dashboard.loadInfrastructureData();
            window.dashboard.startAutoRefresh();
            window.dashboard.startInfrastructureAutoRefresh();
        }
    }
});