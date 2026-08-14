document.addEventListener('DOMContentLoaded', () => {
    // 1. Resolve parameters from URL
    const urlParams = new URLSearchParams(window.location.search);
    let workbookId = urlParams.get('workbookId');
    let referenceId = urlParams.get('referenceId');
    
    const isReferenceView = !!referenceId;

    if (!workbookId && !referenceId) {
        redirectToDefaultWorkbook();
        return;
    }

    if (workbookId) workbookId = Number(workbookId);
    if (referenceId) referenceId = Number(referenceId);

    // Initialize Shared Sidebar Manager
    window.SidebarManager.init('excel', workbookId);

    // Sidebar Sign Out Trigger
    const logoutBtn = document.getElementById('logout-btn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', async () => {
            if (isEditingHeaders) return; // Block logout in edit mode
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

    // Active state tracking
    let activeTabId = null;
    let tabsCache = [];
    let currentColumns = []; // Store active column metadata
    
    // Header Edit Mode state
    let isEditingHeaders = false;
    let editableColumns = [];

    // Reference List items tracking
    let referenceItemsCache = [];
    let referenceItems = []; // in-memory copy during editing

    // Autocomplete option references cache
    let autotagReferenceCache = {};

    // DOM Elements
    const excelTabsList = document.getElementById('excel-tabs-list');
    const tabsContainer = document.querySelector('.tabs-container');
    const expenseTbody = document.getElementById('expense-tbody');
    const expenseTheadRow = document.getElementById('expense-thead-row');
    const addRowBtn = document.getElementById('add-row-btn');
    const addColBtn = document.getElementById('add-column-btn');
    const editHeadersBtn = document.getElementById('edit-headers-btn');
    const doneHeadersBtn = document.getElementById('done-headers-btn');
    const cancelHeadersBtn = document.getElementById('cancel-headers-btn');
    const headerEditControls = document.getElementById('header-edit-controls');

    // Customize layout labels if on Reference List View
    if (isReferenceView) {
        document.body.classList.add('reference-view');
        if (tabsContainer) tabsContainer.style.display = 'none';
        if (addColBtn) addColBtn.style.display = 'none'; // Reference tables have fixed Key-Value columns
        if (editHeadersBtn) {
            editHeadersBtn.innerHTML = `
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" style="width:16px;height:16px;margin-right:0.35rem;">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                </svg>
                Edit Reference List
            `;
        }
    }

    // Load spreadsheet tabs and header data
    initSpreadsheet();

    // Bind Add Row Click Event
    addRowBtn.addEventListener('click', () => {
        if (!isReferenceView && !activeTabId) {
            showToast('Please create or select a page tab first.', 'warning');
            return;
        }
        if (isReferenceView) {
            if (isEditingHeaders) return; // Cannot add row while editing reference list
            addNewReferenceRow();
        } else {
            if (isEditingHeaders) return;
            addNewRow();
        }
    });

    // Bind Add Column Click Event
    if (addColBtn) {
        addColBtn.addEventListener('click', () => {
            if (!activeTabId) {
                showToast('Please create or select a page tab first.', 'warning');
                return;
            }
            if (!isEditingHeaders) return;
            addNewColumn();
        });
    }

    // Bind Header Edit Control Events
    if (editHeadersBtn) {
        editHeadersBtn.addEventListener('click', enterHeaderEditMode);
    }
    if (doneHeadersBtn) {
        doneHeadersBtn.addEventListener('click', () => exitHeaderEditMode(true));
    }
    if (cancelHeadersBtn) {
        cancelHeadersBtn.addEventListener('click', () => exitHeaderEditMode(false));
    }

    async function redirectToDefaultWorkbook() {
        try {
            const res = await fetch('/api/workbooks');
            if (res.status === 401) {
                window.location.href = '/login';
                return;
            }
            if (res.ok) {
                const workbooks = await res.json();
                if (workbooks && workbooks.length > 0) {
                    window.location.href = `/excel?workbookId=${workbooks[0].id}`;
                } else {
                    window.location.href = '/dashboard';
                }
            }
        } catch (err) {
            console.error('Error redirecting to default workbook:', err);
        }
    }

    async function initSpreadsheet() {
        if (isReferenceView) {
            await loadReferenceDetails();
        } else {
            await loadWorkbookTitle();
            await loadTabs();
        }
    }

    async function loadWorkbookTitle() {
        try {
            const res = await fetch('/api/workbooks');
            if (res.ok) {
                const workbooks = await res.json();
                const currentWb = workbooks.find(w => w.id === workbookId);
                if (currentWb) {
                    document.getElementById('workbook-title-header').textContent = currentWb.name;
                }
            }
        } catch (err) {
            console.error('Error loading title:', err);
        }
    }

    async function loadTabs() {
        try {
            const res = await fetch(`/api/tabs?workbookId=${workbookId}`);
            if (res.status === 401) {
                window.location.href = '/login';
                return;
            }
            if (!res.ok) throw new Error('Failed to load tabs');

            const tabs = await res.json();
            tabsCache = tabs;
            renderTabs(tabs);
        } catch (err) {
            console.error('Error loading sheet tabs:', err);
            showToast('Failed to load spreadsheet tabs', 'danger');
        }
    }

    function renderTabs(tabs) {
        excelTabsList.innerHTML = '';

        if (!tabs || tabs.length === 0) {
            excelTabsList.innerHTML = `<button id="add-tab-btn" class="btn-tab-add">+</button>`;
            bindAddTabBtn();
            return;
        }

        if (!activeTabId || !tabs.some(t => t.id === activeTabId)) {
            activeTabId = tabs[0].id;
        }

        tabs.forEach(tab => {
            const isActive = tab.id === activeTabId;
            const activeClass = isActive ? 'active' : '';

            const tabDiv = document.createElement('div');
            tabDiv.className = `excel-tab ${activeClass}`;
            tabDiv.dataset.id = tab.id;
            tabDiv.innerHTML = `
                <span class="tab-name-text">${escapeHTML(tab.name)}</span>
                <span class="tab-close" title="Delete page">×</span>
            `;

            excelTabsList.appendChild(tabDiv);

            tabDiv.addEventListener('click', (e) => {
                if (isEditingHeaders) return; // Block tab switching in edit mode

                if (e.target.classList.contains('tab-close')) {
                    e.stopPropagation();
                    deleteTab(tab.id, tab.name);
                    return;
                }
                if (activeTabId !== tab.id) {
                    activeTabId = tab.id;
                    updateTabHighlights();
                    loadGridData();
                }
            });

            tabDiv.addEventListener('dblclick', () => {
                if (isEditingHeaders) return; // Block tab renaming in edit mode
                renameTab(tab.id, tab.name);
            });
        });

        const addBtn = document.createElement('button');
        addBtn.id = 'add-tab-btn';
        addBtn.className = 'btn-tab-add';
        addBtn.textContent = '+';
        excelTabsList.appendChild(addBtn);
        bindAddTabBtn();

        loadGridData();
    }

    function updateTabHighlights() {
        const tabs = excelTabsList.querySelectorAll('.excel-tab');
        tabs.forEach(el => {
            if (Number(el.dataset.id) === activeTabId) {
                el.classList.add('active');
            } else {
                el.classList.remove('active');
            }
        });
    }

    function bindAddTabBtn() {
        document.getElementById('add-tab-btn').addEventListener('click', () => {
            if (isEditingHeaders) return;
            addNewTab();
        });
    }

    async function addNewTab() {
        const defaultName = `Sheet ${tabsCache.length + 1}`;
        const name = await window.customPrompt('Enter page name:', defaultName);
        if (!name || name.trim() === '') return;

        try {
            const response = await fetch('/api/tabs', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ workbookId, name: name.trim() })
            });

            const data = await response.json();
            if (response.ok && data.success) {
                showToast('Page tab added successfully');
                activeTabId = data.id;
                loadTabs();
            } else {
                showToast(data.error || 'Failed to create tab', 'danger');
            }
        } catch (err) {
            console.error('Create tab error:', err);
            showToast('Connection error creating page tab', 'danger');
        }
    }

    async function renameTab(id, currentName) {
        const name = await window.customPrompt('Rename page:', currentName);
        if (!name || name.trim() === '' || name.trim() === currentName) return;

        try {
            const response = await fetch('/api/tabs', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id, name: name.trim() })
            });

            const data = await response.json();
            if (response.ok && data.success) {
                showToast('Page tab renamed successfully');
                loadTabs();
            } else {
                showToast(data.error || 'Failed to rename tab', 'danger');
            }
        } catch (err) {
            console.error('Rename tab error:', err);
            showToast('Connection error renaming page tab', 'danger');
        }
    }

    async function deleteTab(id, tabName) {
        if (tabsCache.length <= 1) {
            showToast('An Excel Sheet must contain at least one page tab.', 'warning');
            return;
        }

        const confirmMsg = `Are you sure you want to delete page "${tabName}"?\nAll expense records inside this tab will be lost forever.`;
        const yes = await window.customConfirm(confirmMsg);
        if (!yes) return;

        try {
            const response = await fetch(`/api/tabs?id=${id}`, { method: 'DELETE' });
            const data = await response.json();
            if (response.ok && data.success) {
                showToast('Page tab deleted successfully');
                if (activeTabId === id) activeTabId = null;
                loadTabs();
            } else {
                showToast(data.error || 'Failed to delete page tab', 'danger');
            }
        } catch (err) {
            console.error('Delete tab error:', err);
            showToast('Connection error deleting page tab', 'danger');
        }
    }

    // --- REFERENCE VIEW INITS ---

    async function loadReferenceDetails() {
        try {
            const res = await fetch('/api/references');
            if (res.ok) {
                const references = await res.json();
                const currentRef = references.find(r => r.id === referenceId);
                if (currentRef) {
                    document.getElementById('workbook-title-header').textContent = currentRef.name + ' [Reference List]';
                }
            }

            // Fetch reference items
            const itemsRes = await fetch(`/api/references/items?referenceId=${referenceId}`);
            if (itemsRes.ok) {
                referenceItemsCache = await itemsRes.json();
            } else {
                referenceItemsCache = [];
            }

            // Render static Key-Value headers
            currentColumns = [
                { id: 'key', name: 'Code / Key', purpose: 'text' },
                { id: 'value', name: 'Value / Description', purpose: 'text' }
            ];

            renderHeaders(currentColumns);
            renderReferenceRows(referenceItemsCache);
        } catch (err) {
            console.error('Error loading reference details:', err);
            showToast('Failed to load reference lookup details', 'danger');
        }
    }

    function renderReferenceRows(items) {
        expenseTbody.innerHTML = '';
        if (!items || items.length === 0) {
            expenseTbody.innerHTML = `
                <tr>
                    <td colspan="3" style="text-align: center; color: var(--text-muted); padding: 3rem;">
                        No reference lookup keys found. Click "Add Row" to start!
                    </td>
                </tr>
            `;
            return;
        }

        items.forEach((item, index) => {
            const tr = document.createElement('tr');
            tr.dataset.index = index;

            // Key Column
            const tdKey = document.createElement('td');
            tdKey.className = 'editable-cell';
            tdKey.dataset.field = 'key';
            tdKey.textContent = escapeHTML(item.key);
            tr.appendChild(tdKey);

            // Value Column
            const tdValue = document.createElement('td');
            tdValue.className = 'editable-cell';
            tdValue.dataset.field = 'value';
            tdValue.textContent = escapeHTML(item.value);
            tr.appendChild(tdValue);

            // Actions Column
            const tdActions = document.createElement('td');
            tdActions.className = 'col-actions';
            tdActions.innerHTML = `
                <button class="btn-delete" title="Delete lookup record">
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                </button>
            `;
            tr.appendChild(tdActions);

            // Double Click cell edits
            tdKey.addEventListener('dblclick', () => {
                if (!isEditingHeaders) return;
                makeReferenceCellEditable(tdKey, index, 'key', item.key);
            });
            tdValue.addEventListener('dblclick', () => {
                if (!isEditingHeaders) return;
                makeReferenceCellEditable(tdValue, index, 'value', item.value);
            });

            // Delete action
            tdActions.querySelector('.btn-delete').addEventListener('click', () => {
                if (!isEditingHeaders) return;
                items.splice(index, 1);
                renderReferenceRows(items);
            });

            expenseTbody.appendChild(tr);
        });
    }

    function makeReferenceCellEditable(cell, index, field, currentValue) {
        const input = document.createElement('input');
        input.className = 'cell-input';
        input.type = 'text';
        input.value = currentValue;

        cell.innerHTML = '';
        cell.appendChild(input);
        input.focus();
        input.select();

        const saveHandler = () => {
            const val = input.value.trim();
            referenceItems[index][field] = val;
            cell.textContent = val;
        };

        input.addEventListener('blur', saveHandler);
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                input.removeEventListener('blur', saveHandler);
                saveHandler();
            } else if (e.key === 'Escape') {
                input.removeEventListener('blur', saveHandler);
                cell.textContent = currentValue;
            }
        });
    }

    // --- SPREADSHEET DYNAMIC GRID LOAD ---

    async function loadAutotagReferences() {
        try {
            const res = await fetch('/api/references');
            if (res.ok) {
                const refs = await res.json();
                autotagReferenceCache = {};
                for (const ref of refs) {
                    const itemRes = await fetch(`/api/references/items?referenceId=${ref.id}`);
                    if (itemRes.ok) {
                        autotagReferenceCache[ref.id] = await itemRes.json();
                    }
                }
            }
        } catch (e) {
            console.error('Error loading lookup references:', e);
        }
    }

    async function loadGridData() {
        if (!activeTabId) return;

        expenseTbody.innerHTML = `
            <tr>
                <td colspan="5" style="text-align: center; color: var(--text-muted); padding: 3rem;">
                    Loading spreadsheet data...
                </td>
            </tr>
        `;

        try {
            await loadAutotagReferences(); // Cache all autotag references lookup lists

            const response = await fetch(`/api/grid?tabId=${activeTabId}`);
            if (response.status === 401) {
                window.location.href = '/login';
                return;
            }
            if (!response.ok) throw new Error('Failed to fetch grid data');

            const gridData = await response.json();
            currentColumns = gridData.columns;
            
            renderHeaders(gridData.columns);
            renderRows(gridData.rows, gridData.columns);
        } catch (err) {
            console.error('Load grid error:', err);
            showToast('Failed to load spreadsheet data', 'danger');
        }
    }

    // --- HEADER / REFERENCE EDIT MODE TOGGLES ---

    function enterHeaderEditMode() {
        if (!isReferenceView && !activeTabId) {
            showToast('Please create or select a page tab first.', 'warning');
            return;
        }

        isEditingHeaders = true;
        document.body.classList.add('header-edit-active');

        if (editHeadersBtn) editHeadersBtn.style.display = 'none';
        if (addRowBtn) addRowBtn.style.display = 'none';
        if (headerEditControls) headerEditControls.style.display = 'flex';

        if (isReferenceView) {
            referenceItems = JSON.parse(JSON.stringify(referenceItemsCache));
            renderReferenceRows(referenceItems);
        } else {
            editableColumns = JSON.parse(JSON.stringify(currentColumns));
            renderHeaders(editableColumns);
        }
    }

    async function exitHeaderEditMode(save) {
        if (save) {
            if (isReferenceView) {
                try {
                    const response = await fetch('/api/references/items/save', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ referenceId, items: referenceItems })
                    });

                    const data = await response.json();
                    if (response.ok && data.success) {
                        showToast('Reference lookup changes saved successfully');
                    } else {
                        showToast(data.error || 'Failed to save lookup items', 'danger');
                    }
                } catch (err) {
                    console.error('Save lookup error:', err);
                    showToast('Connection error saving lookups', 'danger');
                }
            } else {
                try {
                    const response = await fetch('/api/grid/columns/save', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ tabId: activeTabId, columns: editableColumns })
                    });

                    const data = await response.json();
                    if (response.ok && data.success) {
                        showToast('Column layouts saved successfully');
                    } else {
                        showToast(data.error || 'Failed to save columns', 'danger');
                    }
                } catch (err) {
                    console.error('Save columns error:', err);
                    showToast('Connection error saving columns', 'danger');
                }
            }
        }

        isEditingHeaders = false;
        document.body.classList.remove('header-edit-active');

        if (editHeadersBtn) editHeadersBtn.style.display = 'inline-flex';
        if (addRowBtn) addRowBtn.style.display = 'inline-flex';
        if (headerEditControls) headerEditControls.style.display = 'none';

        if (isReferenceView) {
            await loadReferenceDetails();
        } else {
            await loadGridData();
        }
    }

    // --- HEADERS DRAG & ACTION RENDERING ---

    function getColumnTypeBadge(purpose) {
        let text = 'Text';
        let typeClass = 'type-text';
        
        if (purpose === 'amount') {
            text = '฿123';
            typeClass = 'type-amount';
        } else if (purpose === 'date') {
            text = '📅 Date';
            typeClass = 'type-date';
        } else if (purpose === 'category') {
            text = '📁 Cat';
            typeClass = 'type-category';
        } else if (purpose === 'number') {
            text = '123';
            typeClass = 'type-number';
        } else if (purpose === 'autotag') {
            text = '🏷️ Tag';
            typeClass = 'type-autotag';
        }
        
        return `<span class="col-type-badge ${typeClass}">${text}</span>`;
    }

    function renderHeaders(columns) {
        expenseTheadRow.innerHTML = '';

        columns.forEach((col, idx) => {
            const th = document.createElement('th');
            th.setAttribute('draggable', (!isReferenceView && isEditingHeaders) ? 'true' : 'false');
            th.dataset.id = col.id;
            
            if (col.purpose === 'amount') {
                th.className = 'col-amount';
            }

            const canManageColumn = !isReferenceView && isEditingHeaders;

            th.innerHTML = `
                <div class="th-content">
                    <span class="th-label" title="${canManageColumn ? 'Double-click/drag to settings' : ''}">${escapeHTML(col.name)}</span>
                    ${col.purpose ? getColumnTypeBadge(col.purpose) : ''}
                    ${canManageColumn ? `
                    <div class="column-actions">
                        ${idx > 0 ? `
                        <button class="col-btn btn-move-left" title="Move Left">
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path stroke-linecap="round" stroke-linejoin="round" d="M15 19l-7-7 7-7" />
                            </svg>
                        </button>` : ''}
                        
                        <button class="col-btn btn-rename-col" title="Column Settings">
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path stroke-linecap="round" stroke-linejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                                <path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                            </svg>
                        </button>
                        
                        ${idx < columns.length - 1 ? `
                        <button class="col-btn btn-move-right" title="Move Right">
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path stroke-linecap="round" stroke-linejoin="round" d="M9 5l7 7-7 7" />
                            </svg>
                        </button>` : ''}
                        
                        <button class="col-btn btn-delete-col" title="Delete Column">
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>
                    </div>` : ''}
                </div>
            `;

            expenseTheadRow.appendChild(th);

            if (canManageColumn) {
                // Bind click to Column Settings button
                th.querySelector('.btn-rename-col').addEventListener('click', (e) => {
                    e.stopPropagation();
                    renameColumn(col.id, col.name);
                });

                // Bind double click on text label to rename settings
                th.querySelector('.th-label').addEventListener('dblclick', (e) => {
                    e.stopPropagation();
                    renameColumn(col.id, col.name);
                });

                // Bind Move Left click
                const leftBtn = th.querySelector('.btn-move-left');
                if (leftBtn) {
                    leftBtn.addEventListener('click', (e) => {
                        e.stopPropagation();
                        swapColumns(col.id, columns[idx - 1].id);
                    });
                }

                // Bind Move Right click
                const rightBtn = th.querySelector('.btn-move-right');
                if (rightBtn) {
                    rightBtn.addEventListener('click', (e) => {
                        e.stopPropagation();
                        swapColumns(col.id, columns[idx + 1].id);
                    });
                }

                // Bind Delete click
                th.querySelector('.btn-delete-col').addEventListener('click', (e) => {
                    e.stopPropagation();
                    deleteColumn(col.id, col.name, col.purpose);
                });

                // HTML5 Drag & Drop Listeners
                th.addEventListener('dragstart', (e) => {
                    e.dataTransfer.setData('text/plain', col.id);
                    th.style.opacity = '0.4';
                });

                th.addEventListener('dragend', () => {
                    th.style.opacity = '1';
                    expenseTheadRow.querySelectorAll('th').forEach(h => h.classList.remove('drag-over'));
                });

                th.addEventListener('dragover', (e) => {
                    e.preventDefault();
                    th.classList.add('drag-over');
                });

                th.addEventListener('dragleave', () => {
                    th.classList.remove('drag-over');
                });

                th.addEventListener('drop', (e) => {
                    e.preventDefault();
                    th.classList.remove('drag-over');
                    const draggedId = e.dataTransfer.getData('text/plain');
                    if (draggedId && draggedId !== String(col.id)) {
                        swapColumns(draggedId, col.id);
                    }
                });
            }
        });

        // Append static "Actions" header column at the end
        const actTh = document.createElement('th');
        actTh.className = 'col-actions';
        actTh.textContent = 'Actions';
        expenseTheadRow.appendChild(actTh);
    }

    // --- ROWS RENDERING ---

    function renderRows(rows, columns) {
        expenseTbody.innerHTML = '';

        if (!rows || rows.length === 0) {
            expenseTbody.innerHTML = `
                <tr>
                    <td colspan="${columns.length + 1}" style="text-align: center; color: var(--text-muted); padding: 3rem;">
                        No expense logs found on this page. Click "Add Row" to start!
                    </td>
                </tr>
            `;
            return;
        }

        rows.forEach(row => {
            const tr = document.createElement('tr');
            tr.dataset.id = row.id;

            columns.forEach(col => {
                const td = document.createElement('td');
                td.className = 'editable-cell';
                td.dataset.colId = col.id;
                td.dataset.field = col.purpose;

                const val = row.cells[col.id] || '';
                td.dataset.rawVal = val;

                // Handle cell visual displays based on column purpose
                if (col.purpose === 'amount') {
                    td.classList.add('col-amount');
                    td.textContent = formatCurrency(val ? parseFloat(val) : 0);
                } else if (col.purpose === 'date') {
                    td.classList.add('col-date');
                    td.textContent = val;
                } else if (col.purpose === 'category') {
                    td.classList.add('col-category');
                    td.textContent = escapeHTML(val);
                } else if (col.purpose === 'autotag') {
                    td.classList.add('col-autotag');
                    td.textContent = escapeHTML(val);
                    
                    // Validate if cell matches a reference code/value
                    if (col.reference_id && val !== '') {
                        const refItems = autotagReferenceCache[col.reference_id] || [];
                        const isValid = refItems.some(item => 
                            item.key.toLowerCase() === val.toLowerCase() || 
                            item.value.toLowerCase() === val.toLowerCase()
                        );
                        if (!isValid) {
                            td.classList.add('autotag-invalid');
                        }
                    }
                } else {
                    td.textContent = escapeHTML(val);
                }

                tr.appendChild(td);

                td.addEventListener('dblclick', () => {
                    if (isEditingHeaders) return; // Prevent cell edits in header edit mode
                    makeCellEditable(td, row.id, col.id, col.purpose, col.reference_id);
                });
            });

            const actTd = document.createElement('td');
            actTd.className = 'col-actions';
            actTd.innerHTML = `
                <button class="btn-delete" title="Delete record">
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                </button>
            `;
            tr.appendChild(actTd);

            actTd.querySelector('.btn-delete').addEventListener('click', () => {
                if (isEditingHeaders) return; // Prevent row deletion in header edit mode
                deleteRow(row.id, tr);
            });

            expenseTbody.appendChild(tr);
        });
    }

    // --- CELL INTERACTIVE EDITING ---

    function makeCellEditable(cell, rowId, colId, purpose, referenceId) {
        if (isEditingHeaders) return; // Safeguard

        const currentVal = cell.dataset.rawVal;
        const input = document.createElement('input');
        input.className = 'cell-input';

        if (purpose === 'date') {
            input.type = 'date';
            input.value = currentVal;
        } else if (purpose === 'amount') {
            input.type = 'number';
            input.step = '0.01';
            input.min = '0';
            input.value = currentVal;
        } else {
            input.type = 'text';
            input.value = currentVal;
        }

        // Add Autocomplete datalist integration if autotag type
        if (purpose === 'autotag' && referenceId) {
            const listId = `autotag-datalist-${referenceId}`;
            if (!document.getElementById(listId)) {
                const datalist = document.createElement('datalist');
                datalist.id = listId;
                const refItems = autotagReferenceCache[referenceId] || [];
                refItems.forEach(item => {
                    const option = document.createElement('option');
                    option.value = item.key;
                    option.textContent = item.value;
                    datalist.appendChild(option);
                });
                document.body.appendChild(datalist);
            }
            input.setAttribute('list', listId);
        }

        cell.innerHTML = '';
        cell.appendChild(input);
        input.focus();

        if (input.type === 'text') {
            input.select();
        }

        const saveHandler = () => saveCell(cell, input, rowId, colId, purpose, referenceId, currentVal);

        input.addEventListener('blur', saveHandler);
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                input.removeEventListener('blur', saveHandler);
                saveCell(cell, input, rowId, colId, purpose, referenceId, currentVal);
            } else if (e.key === 'Escape') {
                input.removeEventListener('blur', saveHandler);
                revertCell(cell, purpose, currentVal);
            }
        });
    }

    async function saveCell(cell, input, rowId, colId, purpose, referenceId, oldValue) {
        const newValue = input.value.trim();

        if (purpose === 'amount' && (newValue === '' || isNaN(Number(newValue)) || Number(newValue) < 0)) {
            showToast('Amount must be a non-negative number', 'danger');
            revertCell(cell, purpose, oldValue);
            return;
        }
        if (purpose === 'date' && newValue !== '' && !/^\d{4}-\d{2}-\d{2}$/.test(newValue)) {
            showToast('Date must match YYYY-MM-DD', 'danger');
            revertCell(cell, purpose, oldValue);
            return;
        }

        if (newValue === oldValue) {
            revertCell(cell, purpose, oldValue);
            return;
        }

        try {
            const response = await fetch('/api/grid/cells', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ rowId, columnId: colId, value: newValue })
            });

            const data = await response.json();
            if (response.ok && data.success) {
                cell.dataset.rawVal = newValue;
                if (purpose === 'amount') {
                    cell.textContent = formatCurrency(newValue ? parseFloat(newValue) : 0);
                } else {
                    cell.textContent = newValue;
                }

                // Autotag Validation check
                if (purpose === 'autotag' && referenceId) {
                    const refItems = autotagReferenceCache[referenceId] || [];
                    const isValid = refItems.some(item => 
                        item.key.toLowerCase() === newValue.toLowerCase() || 
                        item.value.toLowerCase() === newValue.toLowerCase()
                    );
                    if (newValue !== '' && !isValid) {
                        cell.classList.add('autotag-invalid');
                    } else {
                        cell.classList.remove('autotag-invalid');
                    }
                }

                showToast('Record saved successfully');
            } else {
                showToast(data.error || 'Failed to save cell value', 'danger');
                revertCell(cell, purpose, oldValue);
            }
        } catch (err) {
            console.error('Cell update error:', err);
            showToast('Connection error, changes reverted', 'danger');
            revertCell(cell, purpose, oldValue);
        }
    }

    function revertCell(cell, purpose, oldValue) {
        cell.dataset.rawVal = oldValue;
        if (purpose === 'amount') {
            cell.textContent = formatCurrency(oldValue ? parseFloat(oldValue) : 0);
        } else {
            cell.textContent = oldValue;
        }
    }

    // --- DYNAMIC COLUMN SETTINGS MODAL ---

    function openColumnSettingsModal(col) {
        return new Promise(async (resolve) => {
            // Fetch lookup reference lists
            let refs = [];
            try {
                const res = await fetch('/api/references');
                if (res.ok) refs = await res.json();
            } catch (e) {
                console.error(e);
            }

            const overlay = document.createElement('div');
            overlay.className = 'column-settings-overlay';
            
            overlay.innerHTML = `
                <div class="column-settings-box">
                    <div class="column-settings-header">
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" style="width: 22px; height: 22px; color: var(--primary);">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        </svg>
                        <h3>Column Settings</h3>
                    </div>
                    <div class="column-settings-form">
                        <div class="form-group">
                            <label>Column Header Name</label>
                            <input type="text" id="col-settings-name" value="${escapeHTML(col.name)}" />
                        </div>
                        <div class="form-group">
                            <label>Column Type</label>
                            <select id="col-settings-type">
                                <option value="text" ${['text', 'custom', 'description'].includes(col.purpose) ? 'selected' : ''}>Text (Generic)</option>
                                <option value="amount" ${col.purpose === 'amount' ? 'selected' : ''}>Amount (Dashboard Sum)</option>
                                <option value="date" ${col.purpose === 'date' ? 'selected' : ''}>Date (Ledger Date)</option>
                                <option value="category" ${col.purpose === 'category' ? 'selected' : ''}>Category (Ledger Category)</option>
                                <option value="number" ${col.purpose === 'number' ? 'selected' : ''}>Number (Numeric values)</option>
                                <option value="autotag" ${col.purpose === 'autotag' ? 'selected' : ''}>Autotag (Lookup reference)</option>
                            </select>
                        </div>
                        <div class="form-group" id="col-settings-ref-group" style="${col.purpose === 'autotag' ? '' : 'display: none;'}">
                            <label>Select Reference Lookup List</label>
                            <select id="col-settings-ref-select">
                                <option value="">-- Choose reference list --</option>
                                ${refs.map(r => `<option value="${r.id}" ${col.reference_id && Number(col.reference_id) === r.id ? 'selected' : ''}>${escapeHTML(r.name)}</option>`).join('')}
                            </select>
                        </div>
                    </div>
                    <div class="column-settings-actions">
                        <button class="dialog-btn dialog-btn-cancel" id="col-settings-cancel">Cancel</button>
                        <button class="dialog-btn dialog-btn-confirm" id="col-settings-save">Save</button>
                    </div>
                </div>
            `;

            document.body.appendChild(overlay);

            const typeSelect = overlay.querySelector('#col-settings-type');
            const refGroup = overlay.querySelector('#col-settings-ref-group');
            const refSelect = overlay.querySelector('#col-settings-ref-select');

            typeSelect.addEventListener('change', () => {
                if (typeSelect.value === 'autotag') {
                    refGroup.style.display = 'flex';
                } else {
                    refGroup.style.display = 'none';
                }
            });

            overlay.querySelector('#col-settings-cancel').addEventListener('click', () => {
                closeModal(false);
            });

            overlay.querySelector('#col-settings-save').addEventListener('click', () => {
                const nameVal = overlay.querySelector('#col-settings-name').value.trim();
                if (nameVal === '') {
                    showToast('Column name cannot be empty', 'danger');
                    return;
                }
                
                const typeVal = typeSelect.value;
                let refIdVal = null;
                if (typeVal === 'autotag') {
                    refIdVal = refSelect.value;
                    if (!refIdVal) {
                        showToast('Please select a reference lookup list for Autotag type', 'danger');
                        return;
                    }
                    refIdVal = Number(refIdVal);
                }

                // Update properties on the passed column reference
                col.name = nameVal;
                col.purpose = typeVal;
                col.reference_id = refIdVal;

                closeModal(true);
            });

            function closeModal(result) {
                overlay.classList.add('fade-out');
                overlay.querySelector('.column-settings-box').classList.add('slide-down');
                setTimeout(() => {
                    overlay.remove();
                    resolve(result);
                }, 200);
            }
        });
    }

    // --- IN-MEMORY DYNAMIC COLUMNS ACTION IMPLEMENTATIONS (SAVE/CANCEL FLOW) ---

    async function addNewColumn() {
        if (!isEditingHeaders) return;

        const tempCol = {
            id: 'temp_' + Date.now(),
            name: 'New Column',
            purpose: 'text',
            position: editableColumns.length,
            reference_id: null
        };

        const saved = await openColumnSettingsModal(tempCol);
        if (saved) {
            editableColumns.push(tempCol);
            renderHeaders(editableColumns);
        }
    }

    async function renameColumn(id, currentName) {
        if (!isEditingHeaders) return;

        const col = editableColumns.find(c => String(c.id) === String(id));
        if (col) {
            await openColumnSettingsModal(col);
        }
    }

    function swapColumns(id1, id2) {
        if (!isEditingHeaders) return;

        const idx1 = editableColumns.findIndex(c => String(c.id) === String(id1));
        const idx2 = editableColumns.findIndex(c => String(c.id) === String(id2));

        if (idx1 !== -1 && idx2 !== -1) {
            const temp = editableColumns[idx1];
            editableColumns[idx1] = editableColumns[idx2];
            editableColumns[idx2] = temp;
            renderHeaders(editableColumns);
        }
    }

    async function deleteColumn(id, colName, purpose) {
        if (!isEditingHeaders) return;

        let warningMsg = `Are you sure you want to delete column "${colName}"?\nAll expense data in this column will be lost forever.`;
        if (['date', 'category', 'amount'].includes(purpose)) {
            warningMsg = `⚠️ WARNING: Column "${colName}" is a system-level column!\nDeleting this column will cause dashboard analytics metrics to show ฿0.00!\n\nAre you sure you want to proceed?`;
        }

        const yes = await window.customConfirm(warningMsg);
        if (!yes) return;

        editableColumns = editableColumns.filter(c => String(c.id) !== String(id));
        renderHeaders(editableColumns);
    }

    // --- ROW CONTROLS ---

    async function addNewReferenceRow() {
        if (isEditingHeaders) return;

        try {
            const response = await fetch('/api/references/items', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ referenceId })
            });

            const data = await response.json();
            if (response.ok && data.success) {
                showToast('New lookup row added.');
                await loadReferenceDetails();
            } else {
                showToast(data.error || 'Failed to create lookup row', 'danger');
            }
        } catch (err) {
            console.error('Add lookup row error:', err);
            showToast('Connection error creating lookup row', 'danger');
        }
    }

    async function addNewRow() {
        if (isEditingHeaders) return;

        try {
            const response = await fetch('/api/grid/rows', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ tabId: activeTabId })
            });

            const data = await response.json();
            if (response.ok && data.success) {
                showToast('New row added. Double-click cells to modify.');
                
                const todayStr = getLocalDateString();
                const dateCol = currentColumns.find(c => c.purpose === 'date');
                const categoryCol = currentColumns.find(c => c.purpose === 'category');
                const descCol = currentColumns.find(c => c.purpose === 'description' || c.purpose === 'text');
                const amountCol = currentColumns.find(c => c.purpose === 'amount');

                if (dateCol) await saveCellSilent(data.id, dateCol.id, todayStr);
                if (categoryCol) await saveCellSilent(data.id, categoryCol.id, 'Food');
                if (descCol) await saveCellSilent(data.id, descCol.id, 'New Expense');
                if (amountCol) await saveCellSilent(data.id, amountCol.id, '0');

                loadGridData();
            } else {
                showToast(data.error || 'Failed to create new row', 'danger');
            }
        } catch (err) {
            console.error('Add row error:', err);
            showToast('Connection error creating row', 'danger');
        }
    }

    async function saveCellSilent(rowId, colId, value) {
        try {
            await fetch('/api/grid/cells', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ rowId, columnId: colId, value })
            });
        } catch (e) {
            console.error(e);
        }
    }

    async function deleteRow(id, tr) {
        if (isEditingHeaders) return;

        const yes = await window.customConfirm('Are you sure you want to delete this row record?');
        if (!yes) return;

        try {
            const response = await fetch(`/api/grid/rows?id=${id}`, { method: 'DELETE' });
            const data = await response.json();
            if (response.ok && data.success) {
                tr.remove();
                showToast('Row deleted successfully');
                
                if (expenseTbody.children.length === 0) {
                    expenseTbody.innerHTML = `
                        <tr>
                            <td colspan="${currentColumns.length + 1}" style="text-align: center; color: var(--text-muted); padding: 3rem;">
                                No expense logs found on this page. Click "Add Row" to start!
                            </td>
                        </tr>
                    `;
                }
            } else {
                showToast(data.error || 'Failed to delete row', 'danger');
            }
        } catch (err) {
            console.error('Delete row error:', err);
            showToast('Connection error deleting row', 'danger');
        }
    }

    // --- HELPERS ---

    function getLocalDateString() {
        const d = new Date();
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }

    function formatCurrency(amount) {
        return '฿' + amount.toLocaleString('en-US', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        });
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
