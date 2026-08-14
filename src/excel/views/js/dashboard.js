document.addEventListener('DOMContentLoaded', () => {
    // 1. Parse active dashboard ID
    const urlParams = new URLSearchParams(window.location.search);
    let activeDashboardId = urlParams.get('dashboardId');

    // Sign Out trigger
    const logoutBtn = document.getElementById('logout-btn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', async () => {
            try {
                const res = await fetch('/api/logout', { method: 'POST' });
                if (res.ok) {
                    window.location.href = '/login';
                }
            } catch (err) {
                console.error('Logout error:', err);
                showToast('Failed to sign out', 'danger');
            }
        });
    }

    const addCardBtn = document.getElementById('add-card-btn');
    const sortCardsBtn = document.getElementById('sort-cards-btn');
    const cardsContainer = document.getElementById('cards-container');

    // Local state/caches
    let sheetsSchema = [];
    let currentDashboardName = 'Dashboard';
    let isSortingMode = false;

    // 2. Initialize Dashboard
    initDashboard();

    async function initDashboard() {
        try {
            // Fetch dashboards to find active dashboard name and seed if needed
            const res = await fetch('/api/dashboards');
            if (res.status === 401) {
                window.location.href = '/login';
                return;
            }
            const dashboards = await res.json();
            if (dashboards.length > 0) {
                let currentDbd = dashboards.find(d => String(d.id) === String(activeDashboardId));
                if (!currentDbd) {
                    currentDbd = dashboards[0];
                    activeDashboardId = currentDbd.id;
                    const newUrl = `${window.location.pathname}?dashboardId=${activeDashboardId}`;
                    window.history.replaceState(null, '', newUrl);
                }
                currentDashboardName = currentDbd.name;
                document.getElementById('workbook-title-header').textContent = currentDashboardName;
            }

            // Sync Sidebar highlighted item
            window.SidebarManager.init('dashboard', activeDashboardId);

            // Fetch columns schema tree
            await fetchSheetsSchema();

            // Load cards
            await loadDashboardCards();
        } catch (e) {
            console.error('Error initializing dashboard workspace:', e);
        }
    }

    async function fetchSheetsSchema() {
        try {
            const res = await fetch('/api/sheets-schema');
            if (res.ok) {
                sheetsSchema = await res.json();
            }
        } catch (e) {
            console.error('Failed to load columns schema:', e);
        }
    }

    async function loadDashboardCards() {
        if (!activeDashboardId) return;
        cardsContainer.innerHTML = '<div style="text-align: center; color: var(--text-muted); padding: 3rem;">Loading metrics cards...</div>';

        try {
            const res = await fetch(`/api/dashboards/cards?dashboardId=${activeDashboardId}`);
            if (!res.ok) throw new Error();
            const cards = await res.json();

            cardsContainer.innerHTML = '';
            if (cards.length === 0) {
                cardsContainer.innerHTML = `
                    <div class="empty-state" style="padding: 4rem;">
                        <div class="empty-state-icon">📈</div>
                        <h3>Customizable Dashboard</h3>
                        <p style="margin-bottom:1.5rem;">This dashboard has no analytics cards yet. Click the "Add Card" button above to build summaries!</p>
                    </div>
                `;
                return;
            }

            cards.forEach(card => {
                const div = document.createElement('div');
                div.className = 'card dashboard-custom-card';
                div.dataset.id = card.id;

                let cardHeaderHTML = '';
                if (isSortingMode) {
                    // Sorting controls layout
                    cardHeaderHTML = `
                        <div style="display: flex; align-items: center; justify-content: space-between; width: 100%;">
                            <div>
                                <h4 style="margin: 0; color: var(--text-primary); font-size: 1.05rem;">${escapeHTML(card.title)}</h4>
                                <span class="card-meta-tag">Sorting mode active</span>
                            </div>
                            <div class="sorting-arrows" style="display: flex; gap: 0.35rem; align-items: center;">
                                <button class="card-btn-opt move-up-btn" title="Move Up" style="background: white; border: 1px solid var(--border-color); border-radius: var(--radius-md); padding: 0.4rem; cursor: pointer;">
                                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" style="width: 15px; height: 15px; stroke-width: 2.5;">
                                        <path stroke-linecap="round" stroke-linejoin="round" d="M5 15l7-7 7 7" />
                                    </svg>
                                </button>
                                <button class="card-btn-opt move-down-btn" title="Move Down" style="background: white; border: 1px solid var(--border-color); border-radius: var(--radius-md); padding: 0.4rem; cursor: pointer;">
                                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" style="width: 15px; height: 15px; stroke-width: 2.5;">
                                        <path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7" />
                                    </svg>
                                </button>
                            </div>
                        </div>
                    `;
                } else {
                    // Standard labels & Action overlays
                    cardHeaderHTML = `
                        <div class="card-options-overlay">
                            <button class="card-btn-opt duplicate-btn" title="Duplicate Card" data-id="${card.id}">
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7v8a2 2 0 002 2h6M8 7V5a2 2 0 012-2h4.586a1 1 0 01.707.293l4.414 4.414a1 1 0 01.293.707V15a2 2 0 01-2 2h-2M8 7H6a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2v-2" />
                                </svg>
                            </button>
                            <button class="card-btn-opt edit-btn" title="Edit Card Configuration" data-id="${card.id}">
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                                </svg>
                            </button>
                            <button class="card-btn-opt delete-btn" title="Remove Card" data-id="${card.id}">
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                </svg>
                            </button>
                        </div>
                        <div class="card-header-label">
                            <h4>${escapeHTML(card.title)}</h4>
                            <span class="card-meta-tag">
                                Sheet: ${escapeHTML(card.workbook_name || '')} - ${escapeHTML(card.tab_name || '')}
                            </span>
                        </div>
                    `;
                }

                div.innerHTML = `
                    ${cardHeaderHTML}
                    <div class="card-content-body" style="${isSortingMode ? 'display: none;' : ''}">
                        ${renderDatasetHTML(card)}
                    </div>
                `;

                if (isSortingMode) {
                    // Bind reordering clicks
                    div.querySelector('.move-up-btn').addEventListener('click', (e) => {
                        e.preventDefault();
                        const prev = div.previousElementSibling;
                        if (prev) {
                            cardsContainer.insertBefore(div, prev);
                        }
                    });
                    div.querySelector('.move-down-btn').addEventListener('click', (e) => {
                        e.preventDefault();
                        const next = div.nextElementSibling;
                        if (next) {
                            cardsContainer.insertBefore(next, div);
                        }
                    });
                } else {
                    // Bind actions
                    div.querySelector('.edit-btn').addEventListener('click', () => showCardConfigModal(card));
                    div.querySelector('.delete-btn').addEventListener('click', () => removeDashboardCard(card.id));
                    div.querySelector('.duplicate-btn').addEventListener('click', () => duplicateDashboardCard(card.id));
                }

                cardsContainer.appendChild(div);
            });
        } catch (e) {
            console.error('Error rendering dashboard cards:', e);
            cardsContainer.innerHTML = '<div style="text-align: center; color: var(--danger); padding: 3rem;">Connection error loading metrics.</div>';
        }
    }

    function renderDatasetHTML(card) {
        const groupColumns = card.group_columns || [];
        const sumColumns = card.sum_columns || [];
        const dataset = card.dataset || [];

        if (groupColumns.length === 0) {
            return `
                <div style="text-align: center; color: var(--text-muted); padding: 1.5rem 0;">
                    ⚠️ Card has no configuration. Click edit icon to configure.
                </div>
            `;
        }
        if (dataset.length === 0) {
            return `
                <div style="text-align: center; color: var(--text-muted); padding: 1.5rem 0;">
                    No rows or values found to group by.
                </div>
            `;
        }

        // Build Table Headers
        let headersHTML = '';
        groupColumns.forEach(col => {
            headersHTML += `<th style="padding: 0.55rem 0.75rem; color: var(--text-muted); font-size: 0.75rem; text-transform: uppercase;">${escapeHTML(col.name)}</th>`;
        });
        sumColumns.forEach(col => {
            headersHTML += `<th style="padding: 0.55rem 0.75rem; text-align: right; color: var(--text-muted); font-size: 0.75rem; text-transform: uppercase;">${escapeHTML(col.name)}</th>`;
        });

        let html = `
            <table class="card-metrics-table" style="width: 100%; border-collapse: collapse; margin-top: 0.5rem;">
                <thead>
                    <tr style="border-bottom: 1px solid var(--border-color); text-align: left;">
                        ${headersHTML}
                    </tr>
                </thead>
                <tbody>
        `;

        dataset.forEach(row => {
            let colsHTML = '';
            row.group_values.forEach(val => {
                colsHTML += `<td style="padding: 0.6rem 0.75rem; font-weight: 500; font-size: 0.88rem; color: var(--text-primary);">${escapeHTML(val)}</td>`;
            });
            sumColumns.forEach(sc => {
                const metricVal = row.metrics[sc.id] || 0;
                const isCount = sc.id === 'count';
                const displayVal = isCount 
                    ? `${metricVal} record${metricVal === 1 ? '' : 's'}` 
                      : formatCurrency(metricVal);
                colsHTML += `<td style="padding: 0.6rem 0.75rem; text-align: right; font-weight: 600; font-size: 0.88rem; color: var(--primary);">${displayVal}</td>`;
            });

            html += `
                <tr style="border-bottom: 1px dashed rgba(0,0,0,0.05);">
                    ${colsHTML}
                </tr>
            `;
        });

        html += `
                </tbody>
            </table>
        `;
        return html;
    }

    // Sorting Mode Toggler
    sortCardsBtn.addEventListener('click', async () => {
        isSortingMode = !isSortingMode;

        if (isSortingMode) {
            // Enter Sorting mode
            addCardBtn.disabled = true;
            addCardBtn.style.opacity = '0.55';
            addCardBtn.style.pointerEvents = 'none';
            sortCardsBtn.innerHTML = `
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" style="width: 16px; height: 16px; stroke-width: 2.5;">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
                </svg>
                Done Sorting
            `;
            sortCardsBtn.style.borderColor = 'var(--primary)';
            sortCardsBtn.style.color = 'var(--primary)';
            loadDashboardCards();
        } else {
            // Exit Sorting mode and Save order
            addCardBtn.disabled = false;
            addCardBtn.style.opacity = '1';
            addCardBtn.style.pointerEvents = 'auto';
            sortCardsBtn.innerHTML = `
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" style="width: 16px; height: 16px;">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
                </svg>
                Sort Cards
            `;
            sortCardsBtn.style.borderColor = 'var(--border-color)';
            sortCardsBtn.style.color = 'var(--text-secondary)';

            await saveCardsOrder();
        }
    });

    async function saveCardsOrder() {
        const cardElements = cardsContainer.querySelectorAll('.dashboard-custom-card');
        const cardIds = Array.from(cardElements).map(el => Number(el.dataset.id));

        try {
            const res = await fetch('/api/dashboards/cards/order', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ cardIds })
            });

            const data = await res.json();
            if (res.ok && data.success) {
                showToast('Card order saved successfully');
            } else {
                showToast(data.error || 'Failed to save cards order', 'danger');
            }
        } catch (e) {
            console.error('Save card order error:', e);
            showToast('Connection error updating card order', 'danger');
        }

        loadDashboardCards();
    }

    // Modal Trigger
    addCardBtn.addEventListener('click', () => showCardConfigModal());

    async function showCardConfigModal(card = null) {
        const sheetsOptions = [];
        sheetsSchema.forEach(wb => {
            if (wb.tabs && wb.tabs.length > 0) {
                sheetsOptions.push({
                    label: wb.name,
                    children: wb.tabs.map(tab => ({
                        value: tab.id,
                        text: `${wb.name} - ${tab.name}`
                    }))
                });
            }
        });

        const getColumnsForTab = (tabId) => {
            let selectedTab = null;
            for (const wb of sheetsSchema) {
                const found = wb.tabs.find(t => String(t.id) === String(tabId));
                if (found) {
                    selectedTab = found;
                    break;
                }
            }
            return selectedTab ? selectedTab.columns : [];
        };

        const initialTabId = card ? card.tab_id : '';
        const initialCols = initialTabId ? getColumnsForTab(initialTabId) : [];
        const initialGroupColId = card ? card.group_column_id : '';
        const initialSumColId = card ? (card.sum_column_id || '') : '';

        const initialGroupOptions = initialCols.map(c => ({ value: c.id, text: `${c.name} (${c.purpose || 'text'})` }));
        const initialSumOptions = [{ value: 'count', text: 'Record Count' }].concat(initialGroupOptions);

        const modalResult = await window.customFormModal({
            title: card ? 'Configure Dashboard Card' : 'Add Dashboard Card',
            fields: [
                { id: 'title', type: 'text', label: 'Card Title', placeholder: 'e.g., Sales by Branch', required: true, value: card ? card.title : '' },
                { id: 'tabId', type: 'select', label: 'Source Sheet (Page Tab)', required: true, value: initialTabId, options: sheetsOptions },
                { id: 'groupColumnId', type: 'checklist', label: 'Group By Column (Required at least one)', required: true, value: initialGroupColId, options: initialGroupOptions, disabled: !initialTabId },
                { id: 'sumColumnId', type: 'checklist', label: 'Sum Value Columns (Required at least one)', required: true, value: initialSumColId, options: initialSumOptions, disabled: !initialTabId }
            ],
            onFieldChange: (fieldId, value, modalRef) => {
                if (fieldId === 'tabId') {
                    if (value) {
                        const cols = getColumnsForTab(value);
                        const colOpts = cols.map(c => ({ value: c.id, text: `${c.name} (${c.purpose || 'text'})` }));
                        modalRef.setChecklistOptions('groupColumnId', colOpts);
                        
                        const sumOpts = [{ value: 'count', text: 'Record Count' }].concat(colOpts);
                        modalRef.setChecklistOptions('sumColumnId', sumOpts);
                    } else {
                        modalRef.setChecklistOptions('groupColumnId', []);
                        modalRef.setChecklistOptions('sumColumnId', []);
                    }
                }
            }
        });

        if (modalResult) {
            const payload = {
                dashboardId: activeDashboardId,
                title: modalResult.title,
                tabId: modalResult.tabId,
                groupColumnId: modalResult.groupColumnId,
                sumColumnId: modalResult.sumColumnId || null
            };

            let method = 'POST';
            let url = '/api/dashboards/cards';

            if (card && card.id) {
                method = 'PUT';
                payload.id = card.id;
            }

            try {
                const res = await fetch(url, {
                    method,
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });

                const data = await res.json();
                if (res.ok && data.success) {
                    showToast(card ? 'Card updated successfully' : 'Card added successfully');
                    loadDashboardCards();
                } else {
                    showToast(data.error || 'Failed to save card configuration', 'danger');
                }
            } catch (err) {
                console.error('Save card error:', err);
                showToast('Connection error saving card layout', 'danger');
            }
        }
    }

    async function duplicateDashboardCard(cardId) {
        try {
            const res = await fetch('/api/dashboards/cards/duplicate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: cardId })
            });

            const data = await res.json();
            if (res.ok && data.success) {
                showToast('Card duplicated successfully');
                loadDashboardCards();
            } else {
                showToast(data.error || 'Failed to duplicate card', 'danger');
            }
        } catch (err) {
            console.error('Duplicate card error:', err);
            showToast('Connection error duplicating card', 'danger');
        }
    }

    async function removeDashboardCard(cardId) {
        const yes = await window.customConfirm('Are you sure you want to remove this metrics summary card?');
        if (!yes) return;

        try {
            const res = await fetch('/api/dashboards/cards', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: cardId })
            });

            const data = await res.json();
            if (res.ok && data.success) {
                showToast('Card removed successfully');
                loadDashboardCards();
            } else {
                showToast(data.error || 'Failed to delete card', 'danger');
            }
        } catch (err) {
            console.error('Delete card error:', err);
            showToast('Connection error removing card', 'danger');
        }
    }

    function formatCurrency(value) {
        return new Intl.NumberFormat('th-TH', { style: 'currency', currency: 'THB' }).format(value);
    }

    function escapeHTML(str) {
        if (!str) return '';
        return str
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    function showToast(message, type = 'success') {
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
});
