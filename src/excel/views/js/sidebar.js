window.SidebarManager = {
    activeWorkbookId: null,
    activeType: 'dashboard', // 'dashboard' or 'excel'

    init(activeType, activeWorkbookId = null) {
        this.activeType = activeType;
        this.activeWorkbookId = activeWorkbookId ? Number(activeWorkbookId) : null;
        this.loadWorkbooks();
    },

    async loadWorkbooks() {
        const navList = document.getElementById('sidebar-nav-list');
        if (!navList) return;

        try {
            const response = await fetch('/api/workbooks');
            if (response.status === 401) {
                window.location.href = '/login';
                return;
            }
            if (!response.ok) throw new Error('Failed to load workbooks');
            const workbooks = await response.json();

            // Also fetch Reference lookup tables
            const refResponse = await fetch('/api/references');
            let references = [];
            if (refResponse.ok) {
                references = await refResponse.json();
            }

            // Also fetch customizable dashboards
            const dashResponse = await fetch('/api/dashboards');
            let dashboards = [];
            if (dashResponse.ok) {
                dashboards = await dashResponse.json();
            }

            this.renderSidebar(navList, workbooks, references, dashboards);
        } catch (err) {
            console.error('Sidebar load error:', err);
            this.showToast('Failed to load sidebar navigation', 'danger');
        }
    },

    renderSidebar(navList, workbooks, references, dashboards) {
        navList.innerHTML = '';

        // 1. Render Dashboards Title & Add Button
        const dashTitleLi = document.createElement('li');
        dashTitleLi.className = 'nav-section-title';
        dashTitleLi.innerHTML = `
            <span>Dashboards</span>
            <button id="add-dashboard-btn" class="btn-icon-add" title="Create New Dashboard">+</button>
        `;
        navList.appendChild(dashTitleLi);

        dashTitleLi.querySelector('#add-dashboard-btn').addEventListener('click', (e) => {
            e.preventDefault();
            this.addNewDashboard();
        });

        // 1b. Render Dashboard List items
        const activeDashboardId = new URLSearchParams(window.location.search).get('dashboardId');
        if (dashboards && dashboards.length > 0) {
            dashboards.forEach(dbd => {
                const isFirst = dashboards[0].id === dbd.id;
                const isCurrentlyActive = this.activeType === 'dashboard' && (activeDashboardId ? Number(activeDashboardId) === dbd.id : isFirst);
                const activeClass = isCurrentlyActive ? 'active' : '';

                const dbdLi = document.createElement('li');
                dbdLi.className = 'nav-workbook-item';
                dbdLi.innerHTML = `
                    <a href="/dashboard?dashboardId=${dbd.id}" class="nav-link ${activeClass}">
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                        </svg>
                        <span class="nav-text workbook-name-text">${this.escapeHTML(dbd.name)}</span>
                    </a>
                    <div class="workbook-actions">
                        <button class="workbook-btn btn-edit-workbook btn-edit-dashboard" title="Rename Dashboard" data-id="${dbd.id}" data-name="${this.escapeHTML(dbd.name)}">
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                            </svg>
                        </button>
                        <button class="workbook-btn btn-delete-workbook btn-delete-dashboard" title="Delete Dashboard" data-id="${dbd.id}">
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                        </button>
                    </div>
                `;
                navList.appendChild(dbdLi);

                dbdLi.querySelector('.btn-edit-dashboard').addEventListener('click', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    this.renameDashboard(dbd.id, dbd.name);
                });

                dbdLi.querySelector('.btn-delete-dashboard').addEventListener('click', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    this.deleteDashboard(dbd.id);
                });
            });
        }

        // 2. Render Excel Sheets Title & Add Button
        const titleLi = document.createElement('li');
        titleLi.className = 'nav-section-title';
        titleLi.innerHTML = `
            <span>Excel Sheets</span>
            <button id="add-workbook-btn" class="btn-icon-add" title="Create New Sheet">+</button>
        `;
        navList.appendChild(titleLi);

        // Bind Add Workbook Click
        titleLi.querySelector('#add-workbook-btn').addEventListener('click', (e) => {
            e.preventDefault();
            this.addNewWorkbook();
        });

        // 3. Render Workbook List
        if (workbooks && workbooks.length > 0) {
            workbooks.forEach(wb => {
                const isWbActive = this.activeType === 'excel' && this.activeWorkbookId === wb.id && !new URLSearchParams(window.location.search).get('referenceId');
                const activeClass = isWbActive ? 'active' : '';

                const wbLi = document.createElement('li');
                wbLi.className = 'nav-workbook-item';
                wbLi.innerHTML = `
                    <a href="/excel?workbookId=${wb.id}" class="nav-link ${activeClass}">
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 10h18M3 14h18m-9-4v8m-7 0h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                        </svg>
                        <span class="nav-text workbook-name-text">${this.escapeHTML(wb.name)}</span>
                    </a>
                    <div class="workbook-actions">
                        <button class="workbook-btn btn-edit-workbook" title="Rename Sheet" data-id="${wb.id}" data-name="${this.escapeHTML(wb.name)}">
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                            </svg>
                        </button>
                        <button class="workbook-btn btn-delete-workbook" title="Delete Sheet" data-id="${wb.id}">
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                        </button>
                    </div>
                `;

                navList.appendChild(wbLi);

                // Bind Edit/Delete handlers
                wbLi.querySelector('.btn-edit-workbook').addEventListener('click', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    this.renameWorkbook(wb.id, wb.name);
                });

                wbLi.querySelector('.btn-delete-workbook').addEventListener('click', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    this.deleteWorkbook(wb.id);
                });
            });
        }

        // 4. Render REFERENCE Section Title & Add Button
        const refTitleLi = document.createElement('li');
        refTitleLi.className = 'nav-section-title';
        refTitleLi.innerHTML = `
            <span>Reference</span>
            <button id="add-reference-btn" class="btn-icon-add" title="Create New Reference">+</button>
        `;
        navList.appendChild(refTitleLi);

        refTitleLi.querySelector('#add-reference-btn').addEventListener('click', (e) => {
            e.preventDefault();
            this.addNewReference();
        });

        // 5. Render Reference List
        const activeRefId = new URLSearchParams(window.location.search).get('referenceId');
        if (references && references.length > 0) {
            references.forEach(ref => {
                const isRefActive = activeRefId && Number(activeRefId) === ref.id;
                const activeClass = isRefActive ? 'active' : '';

                const refLi = document.createElement('li');
                refLi.className = 'nav-workbook-item';
                refLi.innerHTML = `
                    <a href="/excel?referenceId=${ref.id}" class="nav-link ${activeClass}">
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
                        </svg>
                        <span class="nav-text workbook-name-text">${this.escapeHTML(ref.name)}</span>
                    </a>
                    <div class="workbook-actions">
                        <button class="workbook-btn btn-edit-workbook btn-edit-reference" title="Rename Reference" data-id="${ref.id}" data-name="${this.escapeHTML(ref.name)}">
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                            </svg>
                        </button>
                        <button class="workbook-btn btn-delete-workbook btn-delete-reference" title="Delete Reference" data-id="${ref.id}">
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                        </button>
                    </div>
                `;

                navList.appendChild(refLi);

                // Bind Edit/Delete handlers
                refLi.querySelector('.btn-edit-reference').addEventListener('click', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    this.renameReference(ref.id, ref.name);
                });

                refLi.querySelector('.btn-delete-reference').addEventListener('click', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    this.deleteReference(ref.id);
                });
            });
        }

        // 6. Render Admin Section (SillyDatabase)
        const adminTitleLi = document.createElement('li');
        adminTitleLi.className = 'nav-section-title';
        adminTitleLi.innerHTML = `<span>Admin</span>`;
        navList.appendChild(adminTitleLi);

        const sillyDbActive = this.activeType === 'sillydatabase' ? 'active' : '';
        const sillyDbLi = document.createElement('li');
        sillyDbLi.className = 'nav-workbook-item';
        sillyDbLi.innerHTML = `
            <a href="/sillydatabase" class="nav-link ${sillyDbActive}">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4" />
                </svg>
                <span class="nav-text workbook-name-text">Bot Database</span>
            </a>
        `;
        navList.appendChild(sillyDbLi);
    },

    async addNewWorkbook() {
        const name = await window.customPrompt('Enter workbook name:', 'Excel Sheet');
        if (!name || name.trim() === '') return;

        try {
            const response = await fetch('/api/workbooks', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: name.trim() })
            });

            const data = await response.json();
            if (response.ok && data.success) {
                this.showToast('Workbook created successfully');
                window.location.href = `/excel?workbookId=${data.id}`;
            } else {
                this.showToast(data.error || 'Failed to create workbook', 'danger');
            }
        } catch (err) {
            console.error('Create workbook error:', err);
            this.showToast('Connection error creating workbook', 'danger');
        }
    },

    async renameWorkbook(id, currentName) {
        const name = await window.customPrompt('Rename sheet:', currentName);
        if (!name || name.trim() === '' || name.trim() === currentName) return;

        try {
            const response = await fetch('/api/workbooks', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id, name: name.trim() })
            });

            const data = await response.json();
            if (response.ok && data.success) {
                this.showToast('Workbook renamed successfully');
                this.loadWorkbooks();

                const titleHeader = document.getElementById('workbook-title-header');
                if (titleHeader && this.activeWorkbookId === id) {
                    titleHeader.textContent = name.trim();
                }
            } else {
                this.showToast(data.error || 'Failed to rename workbook', 'danger');
            }
        } catch (err) {
            console.error('Rename workbook error:', err);
            this.showToast('Connection error renaming workbook', 'danger');
        }
    },

    async deleteWorkbook(id) {
        const confirmMsg = 'Are you sure you want to delete this Excel Sheet?\nAll bottom tabs (pages) and daily expenses inside will be deleted permanently!';
        const yes = await window.customConfirm(confirmMsg);
        if (!yes) return;

        try {
            const response = await fetch(`/api/workbooks?id=${id}`, {
                method: 'DELETE'
            });

            const data = await response.json();
            if (response.ok && data.success) {
                this.showToast('Workbook deleted successfully');
                if (this.activeWorkbookId === id) {
                    window.location.href = '/dashboard';
                } else {
                    this.loadWorkbooks();
                }
            } else {
                this.showToast(data.error || 'Failed to delete workbook', 'danger');
            }
        } catch (err) {
            console.error('Delete workbook error:', err);
            this.showToast('Connection error deleting workbook', 'danger');
        }
    },

    // --- REFERENCE LOOKUP TABLES ACTIONS ---

    async addNewReference() {
        const name = await window.customPrompt('Enter reference list name:', 'Branch Code');
        if (!name || name.trim() === '') return;

        try {
            const response = await fetch('/api/references', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: name.trim() })
            });

            const data = await response.json();
            if (response.ok && data.success) {
                this.showToast('Reference list created successfully');
                window.location.href = `/excel?referenceId=${data.reference.id}`;
            } else {
                this.showToast(data.error || 'Failed to create reference list', 'danger');
            }
        } catch (err) {
            console.error('Create reference error:', err);
            this.showToast('Connection error creating reference list', 'danger');
        }
    },

    async renameReference(id, currentName) {
        const name = await window.customPrompt('Rename reference list:', currentName);
        if (!name || name.trim() === '' || name.trim() === currentName) return;

        try {
            const response = await fetch('/api/references', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id, name: name.trim() })
            });

            const data = await response.json();
            if (response.ok && data.success) {
                this.showToast('Reference list renamed successfully');
                this.loadWorkbooks();

                const titleHeader = document.getElementById('workbook-title-header');
                if (titleHeader && new URLSearchParams(window.location.search).get('referenceId') == id) {
                    titleHeader.textContent = name.trim();
                }
            } else {
                this.showToast(data.error || 'Failed to rename reference list', 'danger');
            }
        } catch (err) {
            console.error('Rename reference error:', err);
            this.showToast('Connection error renaming reference list', 'danger');
        }
    },

    async deleteReference(id) {
        const confirmMsg = 'Are you sure you want to delete this Reference list?\nAny columns autotagged to this list will lose autocomplete suggestions!';
        const yes = await window.customConfirm(confirmMsg);
        if (!yes) return;

        try {
            const response = await fetch(`/api/references`, {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id })
            });

            const data = await response.json();
            if (response.ok && data.success) {
                this.showToast('Reference list deleted successfully');
                const activeRefId = new URLSearchParams(window.location.search).get('referenceId');
                if (activeRefId && Number(activeRefId) === id) {
                    window.location.href = '/dashboard';
                } else {
                    this.loadWorkbooks();
                }
            } else {
                this.showToast(data.error || 'Failed to delete reference list', 'danger');
            }
        } catch (err) {
            console.error('Delete reference error:', err);
            this.showToast('Connection error deleting reference list', 'danger');
        }
    },

    async addNewDashboard() {
        const name = await window.customPrompt('Enter dashboard name:', 'New Dashboard');
        if (!name || name.trim() === '') return;

        try {
            const response = await fetch('/api/dashboards', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: name.trim() })
            });

            const data = await response.json();
            if (response.ok && data.success) {
                this.showToast('Dashboard created successfully');
                window.location.href = `/dashboard?dashboardId=${data.id}`;
            } else {
                this.showToast(data.error || 'Failed to create dashboard', 'danger');
            }
        } catch (err) {
            console.error('Create dashboard error:', err);
            this.showToast('Connection error creating dashboard', 'danger');
        }
    },

    async renameDashboard(id, currentName) {
        const name = await window.customPrompt('Rename Dashboard:', currentName);
        if (!name || name.trim() === '' || name.trim() === currentName) return;

        try {
            const response = await fetch('/api/dashboards', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id, name: name.trim() })
            });

            const data = await response.json();
            if (response.ok && data.success) {
                this.showToast('Dashboard renamed successfully');
                this.loadWorkbooks();

                const titleHeader = document.getElementById('workbook-title-header');
                const activeDbdId = new URLSearchParams(window.location.search).get('dashboardId');
                if (titleHeader && activeDbdId == id) {
                    titleHeader.textContent = name.trim();
                }
            } else {
                this.showToast(data.error || 'Failed to rename dashboard', 'danger');
            }
        } catch (err) {
            console.error('Rename dashboard error:', err);
            this.showToast('Connection error renaming dashboard', 'danger');
        }
    },

    async deleteDashboard(id) {
        const confirmMsg = 'Are you sure you want to delete this Dashboard?\nAll customizable cards inside it will be permanently removed!';
        const yes = await window.customConfirm(confirmMsg);
        if (!yes) return;

        try {
            const response = await fetch('/api/dashboards', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id })
            });

            const data = await response.json();
            if (response.ok && data.success) {
                this.showToast('Dashboard deleted successfully');
                const activeDbdId = new URLSearchParams(window.location.search).get('dashboardId');
                if (activeDbdId && Number(activeDbdId) === id) {
                    window.location.href = '/dashboard';
                } else {
                    this.loadWorkbooks();
                }
            } else {
                this.showToast(data.error || 'Failed to delete dashboard', 'danger');
            }
        } catch (err) {
            console.error('Delete dashboard error:', err);
            this.showToast('Connection error deleting dashboard', 'danger');
        }
    },

    escapeHTML(str) {
        if (!str) return '';
        return str
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    },

    showToast(message, type = 'success') {
        const container = document.getElementById('toast-container');
        if (!container) return;

        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.innerHTML = `<span>${message}</span>`;

        container.appendChild(toast);

        setTimeout(() => {
            toast.style.animation = 'slideUp 0.3s cubic-bezier(0.4, 0, 0.2, 1) reverse forwards';
            setTimeout(() => toast.remove(), 300);
        }, 4000);
    }
};
