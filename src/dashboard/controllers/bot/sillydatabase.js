/**
 * Fluffingiously Dragooon - SillyDatabase Controller
 * Handles table navigation, live data grids, search filtering, inline editing, conflict resolution, and data import/export.
 */

(function () {
	'use strict';

	const state = {
		tables: [],
		activeTable: null,
		schema: null,
		data: [],
		filteredData: [],
		searchQuery: '',
		editRowData: null,
		editOldData: null
	};

	/**
	 * Safe HTML escaping
	 */
	function escapeHtml(str) {
		if (str === null || str === undefined) return '';
		return String(str)
			.replace(/&/g, '&amp;')
			.replace(/</g, '&lt;')
			.replace(/>/g, '&gt;')
			.replace(/"/g, '&quot;')
			.replace(/'/g, '&#039;');
	}

	/**
	 * Toast notification helper using CustomModal if available
	 */
	function notify(message, type = 'info') {
		if (typeof CustomModal !== 'undefined' && CustomModal.toast) {
			CustomModal.toast(message, { type, duration: 3500 });
		} else {
			console.log(`[Database Notice - ${type}]: ${message}`);
		}
	}

	/**
	 * Load all database tables
	 */
	async function init() {
		try {
			const response = await fetch('/api/sillydb/tables');
			if (response.status === 401) {
				window.location.href = '/dashboard';
				return;
			}
			const data = await response.json();
			state.tables = data.tables || [];

			renderTableTabs();

			if (state.tables.length > 0) {
				loadTableData(state.tables[0]);
			} else {
				showEmptyState('No database tables found.');
			}
		} catch (err) {
			console.error('[Database] Failed to load tables:', err);
			notify('Failed to load database tables', 'error');
		}
	}

	/**
	 * Render navigation tabs for all database tables
	 */
	function renderTableTabs() {
		const container = document.getElementById('tableSelector');
		if (!container) return;

		container.innerHTML = '';
		state.tables.forEach(tableName => {
			const tab = document.createElement('button');
			tab.type = 'button';
			tab.className = `db-tab ${tableName === state.activeTable ? 'active' : ''}`;
			tab.innerHTML = `
				<span class="material-symbols-outlined">table</span>
				<span>${escapeHtml(tableName)}</span>
			`;
			tab.addEventListener('click', () => loadTableData(tableName));
			container.appendChild(tab);
		});
	}

	/**
	 * Load schema and row data for a specific table
	 */
	async function loadTableData(tableName) {
		state.activeTable = tableName;
		state.searchQuery = '';
		const searchInput = document.getElementById('dbSearchInput');
		if (searchInput) searchInput.value = '';

		// Update tab active state
		renderTableTabs();

		const tbody = document.getElementById('dataTableBody');
		const thead = document.getElementById('dataTableHead');
		const loadingEl = document.getElementById('dbLoadingSpinner');
		const emptyEl = document.getElementById('dbEmptyState');

		if (tbody) tbody.innerHTML = '';
		if (thead) thead.innerHTML = '';
		if (emptyEl) emptyEl.style.display = 'none';
		if (loadingEl) loadingEl.style.display = 'flex';

		try {
			const response = await fetch(`/api/sillydb/data?table=${encodeURIComponent(tableName)}`);
			if (response.status === 401) {
				window.location.href = '/dashboard';
				return;
			}
			const result = await response.json();

			state.schema = result.schema || { columns: [], pk: '' };
			state.data = result.data || [];
			state.filteredData = [...state.data];

			if (loadingEl) loadingEl.style.display = 'none';

			renderTableHeader();
			renderTableRows();
			updateRecordCount();
		} catch (err) {
			console.error(`[Database] Error loading table "${tableName}":`, err);
			if (loadingEl) loadingEl.style.display = 'none';
			notify(`Failed to load data for ${tableName}`, 'error');
		}
	}

	/**
	 * Render table column headers
	 */
	function renderTableHeader() {
		const thead = document.getElementById('dataTableHead');
		if (!thead || !state.schema || !state.schema.columns) return;

		let thHtml = '<tr>';
		state.schema.columns.forEach(col => {
			const isPk = col === state.schema.pk;
			thHtml += `
				<th class="${isPk ? 'pk-column' : ''}">
					<span>${escapeHtml(col)}</span>
					${isPk ? '<span class="pk-badge"><span class="material-symbols-outlined" style="font-size: 0.75rem; vertical-align: middle;">key</span> PK</span>' : ''}
				</th>
			`;
		});
		thHtml += '<th style="text-align: right; width: 1%;">Actions</th></tr>';
		thead.innerHTML = thHtml;
	}

	/**
	 * Render table rows based on filteredData
	 */
	function renderTableRows() {
		const tbody = document.getElementById('dataTableBody');
		const emptyEl = document.getElementById('dbEmptyState');
		if (!tbody) return;

		tbody.innerHTML = '';

		if (state.filteredData.length === 0) {
			if (emptyEl) {
				emptyEl.style.display = 'flex';
				const msg = state.searchQuery
					? `No records match search "${state.searchQuery}".`
					: `No data found in table "${state.activeTable}".`;
				const descEl = document.getElementById('dbEmptyDesc');
				if (descEl) descEl.textContent = msg;
			}
			return;
		}

		if (emptyEl) emptyEl.style.display = 'none';

		state.filteredData.forEach((row, rowIndex) => {
			const tr = document.createElement('tr');

			state.schema.columns.forEach(col => {
				const td = document.createElement('td');
				const val = row[col];

				if (val === null || val === undefined) {
					td.innerHTML = '<span class="cell-null">null</span>';
				} else if (typeof val === 'object') {
					const jsonStr = JSON.stringify(val);
					td.textContent = jsonStr.length > 50 ? jsonStr.substring(0, 50) + '...' : jsonStr;
					td.title = jsonStr;
					td.classList.add('cell-mono');
				} else {
					const str = String(val);
					if (str.length > 50) {
						td.textContent = str.substring(0, 50) + '...';
						td.title = str;
					} else {
						td.textContent = str;
					}
					if (col === state.schema.pk || typeof val === 'number') {
						td.classList.add('cell-mono');
					}
				}
				tr.appendChild(td);
			});

			// Actions cell
			const actionsTd = document.createElement('td');
			actionsTd.className = 'actions-cell';

			// Edit button
			const editBtn = document.createElement('button');
			editBtn.type = 'button';
			editBtn.className = 'btn-row-action primary';
			editBtn.title = 'Edit Record';
			editBtn.innerHTML = '<span class="material-symbols-outlined">edit</span> <span>Edit</span>';
			editBtn.addEventListener('click', () => openEditModal(row));

			// Export JSON button
			const exportBtn = document.createElement('button');
			exportBtn.type = 'button';
			exportBtn.className = 'btn-row-action';
			exportBtn.title = 'Download Row JSON';
			exportBtn.innerHTML = '<span class="material-symbols-outlined">data_object</span>';
			exportBtn.addEventListener('click', () => {
				const pkVal = row[state.schema.pk];
				window.location.href = `/api/sillydb/export/row?table=${encodeURIComponent(state.activeTable)}&pkColumn=${encodeURIComponent(state.schema.pk)}&pkValue=${encodeURIComponent(pkVal)}&format=json`;
			});

			// Delete button
			const delBtn = document.createElement('button');
			delBtn.type = 'button';
			delBtn.className = 'btn-row-action danger';
			delBtn.title = 'Delete Record';
			delBtn.innerHTML = '<span class="material-symbols-outlined">delete</span>';
			delBtn.addEventListener('click', () => confirmDeleteRow(row));

			actionsTd.appendChild(editBtn);
			actionsTd.appendChild(exportBtn);
			actionsTd.appendChild(delBtn);
			tr.appendChild(actionsTd);

			tbody.appendChild(tr);
		});
	}

	/**
	 * Update record count badge
	 */
	function updateRecordCount() {
		const countEl = document.getElementById('dbRecordCount');
		if (!countEl) return;
		const total = state.data.length;
		const showing = state.filteredData.length;

		if (total === showing) {
			countEl.innerHTML = `<span class="material-symbols-outlined" style="font-size: 1rem;">dataset</span> <span>${total} records</span>`;
		} else {
			countEl.innerHTML = `<span class="material-symbols-outlined" style="font-size: 1rem;">filter_alt</span> <span>${showing} of ${total} records</span>`;
		}
	}

	/**
	 * Filter rows live as user types into search input
	 */
	function handleSearch(query) {
		state.searchQuery = query.trim().toLowerCase();
		if (!state.searchQuery) {
			state.filteredData = [...state.data];
		} else {
			state.filteredData = state.data.filter(row => {
				return Object.values(row).some(val => {
					if (val === null || val === undefined) return false;
					return String(val).toLowerCase().includes(state.searchQuery);
				});
			});
		}
		renderTableRows();
		updateRecordCount();
	}

	/**
	 * Open Edit Modal for a given row
	 */
	function openEditModal(row) {
		state.editOldData = JSON.parse(JSON.stringify(row));
		state.editRowData = { ...row };

		const modal = document.getElementById('editModal');
		const modalBody = document.getElementById('editModalBody');
		if (!modal || !modalBody) return;

		modalBody.innerHTML = '';

		state.schema.columns.forEach(col => {
			const isPk = col === state.schema.pk;
			const val = state.editRowData[col];
			const isLongText = typeof val === 'string' && (val.length > 50 || val.includes('\n'));
			const isObject = typeof val === 'object' && val !== null;

			const group = document.createElement('div');
			group.className = 'db-form-field';

			const label = document.createElement('label');
			label.className = 'db-form-label';
			label.innerHTML = `
				<span>${escapeHtml(col)}</span>
				${isPk ? '<span class="db-pk-tag"><span class="material-symbols-outlined" style="font-size: 0.75rem; vertical-align: middle;">lock</span> Primary Key</span>' : ''}
			`;
			group.appendChild(label);

			let input;
			if (isLongText || isObject) {
				input = document.createElement('textarea');
				input.className = 'db-form-textarea';
				input.rows = 4;
				input.value = isObject ? JSON.stringify(val, null, 2) : (val !== null && val !== undefined ? val : '');
			} else {
				input = document.createElement('input');
				input.className = 'db-form-input';
				input.type = typeof val === 'number' ? 'number' : 'text';
				input.value = val !== null && val !== undefined ? val : '';
			}

			if (isPk) {
				input.disabled = true;
			} else {
				input.addEventListener('input', (e) => {
					const newVal = e.target.value;
					if (typeof val === 'number' && newVal !== '') {
						state.editRowData[col] = Number(newVal);
					} else if (isObject) {
						try {
							state.editRowData[col] = JSON.parse(newVal);
						} catch (_) {
							state.editRowData[col] = newVal;
						}
					} else {
						state.editRowData[col] = newVal;
					}
				});
			}

			group.appendChild(input);
			modalBody.appendChild(group);
		});

		modal.classList.add('active');
	}

	/**
	 * Close Edit Modal
	 */
	function closeEditModal() {
		const modal = document.getElementById('editModal');
		if (modal) modal.classList.remove('active');
	}

	/**
	 * Save edited record (with conflict detection)
	 */
	async function saveEditRecord(force = false) {
		if (!state.activeTable || !state.schema || !state.editOldData) return;
		const pkVal = state.editOldData[state.schema.pk];

		try {
			const response = await fetch('/api/sillydb/data', {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					table: state.activeTable,
					pkColumn: state.schema.pk,
					pkValue: pkVal,
					newValues: state.editRowData,
					expectedOldValues: state.editOldData,
					force: force
				})
			});

			const data = await response.json();

			if (response.status === 409) {
				showConflictModal(data.conflicts, data.currentRow);
				return;
			}

			if (response.ok && data.success) {
				notify('Record updated successfully', 'success');
				closeEditModal();
				closeConflictModal();
				loadTableData(state.activeTable);
			} else {
				notify(data.error || 'Failed to update record', 'error');
			}
		} catch (err) {
			console.error('[Database] Save error:', err);
			notify('Connection error while updating record', 'error');
		}
	}

	/**
	 * Show conflict resolution modal
	 */
	function showConflictModal(conflicts, currentRow) {
		const modal = document.getElementById('conflictModal');
		const body = document.getElementById('conflictModalBody');
		if (!modal || !body) return;

		body.innerHTML = '';

		for (const [col, conflict] of Object.entries(conflicts || {})) {
			const box = document.createElement('div');
			box.className = 'db-conflict-box';

			const title = document.createElement('h4');
			title.className = 'db-conflict-field-title';
			title.innerHTML = `<span class="material-symbols-outlined" style="font-size: 1.1rem; vertical-align: middle;">difference</span> Field: ${escapeHtml(col)}`;
			box.appendChild(title);

			const row = document.createElement('div');
			row.className = 'db-conflict-row';

			// Expected
			const oldVal = document.createElement('div');
			oldVal.className = 'db-conflict-val old';
			oldVal.innerHTML = `
				<span class="db-conflict-val-label">You Originally Saw</span>
				<span>${escapeHtml(String(conflict.expected))}</span>
			`;

			// Current in DB
			const botVal = document.createElement('div');
			botVal.className = 'db-conflict-val bot';
			botVal.innerHTML = `
				<span class="db-conflict-val-label">Bot / Server Current</span>
				<span>${escapeHtml(String(conflict.actual))}</span>
			`;

			// Your proposed
			const yourVal = document.createElement('div');
			yourVal.className = 'db-conflict-val user';
			yourVal.innerHTML = `
				<span class="db-conflict-val-label">Your Proposed Edit</span>
				<span>${escapeHtml(String(state.editRowData[col]))}</span>
			`;

			row.appendChild(oldVal);
			row.appendChild(botVal);
			row.appendChild(yourVal);
			box.appendChild(row);

			body.appendChild(box);
		}

		modal.classList.add('active');
	}

	/**
	 * Close conflict modal
	 */
	function closeConflictModal() {
		const modal = document.getElementById('conflictModal');
		if (modal) modal.classList.remove('active');
	}

	/**
	 * Confirm delete row via CustomModal
	 */
	async function confirmDeleteRow(row) {
		const pkVal = row[state.schema.pk];
		let confirmed = false;

		if (typeof CustomModal !== 'undefined' && CustomModal.confirm) {
			confirmed = await CustomModal.confirm(
				`Are you sure you want to delete this record from table "${state.activeTable}"?\n\n${state.schema.pk}: ${pkVal}`,
				{
					title: 'Confirm Record Deletion',
					danger: true,
					confirmText: 'Delete Record',
					cancelText: 'Cancel'
				}
			);
		} else {
			confirmed = window.confirm(`Are you sure you want to delete record with ${state.schema.pk} = ${pkVal}?`);
		}

		if (!confirmed) return;

		try {
			const response = await fetch('/api/sillydb/data', {
				method: 'DELETE',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					table: state.activeTable,
					pkColumn: state.schema.pk,
					pkValue: pkVal
				})
			});

			const data = await response.json();
			if (response.ok && data.success) {
				notify('Record deleted successfully', 'success');
				loadTableData(state.activeTable);
			} else {
				notify(data.error || 'Failed to delete record', 'error');
			}
		} catch (err) {
			console.error('[Database] Delete error:', err);
			notify('Connection error during deletion', 'error');
		}
	}

	/**
	 * Setup Import Modal
	 */
	function openImportModal() {
		const modal = document.getElementById('importModal');
		const fileInput = document.getElementById('importFile');
		if (fileInput) fileInput.value = '';
		if (modal) modal.classList.add('active');
	}

	function closeImportModal() {
		const modal = document.getElementById('importModal');
		if (modal) modal.classList.remove('active');
	}

	async function executeImport() {
		const fileInput = document.getElementById('importFile');
		const formatSelect = document.getElementById('importFormat');
		const file = fileInput ? fileInput.files[0] : null;
		const format = formatSelect ? formatSelect.value : 'json';

		if (!file) {
			notify('Please select a CSV or JSON file to import.', 'warning');
			return;
		}

		if (!state.activeTable || !state.schema) {
			notify('No active table selected.', 'error');
			return;
		}

		const reader = new FileReader();
		reader.onload = async (e) => {
			const content = e.target.result;
			try {
				const response = await fetch('/api/sillydb/import', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({
						table: state.activeTable,
						pkColumn: state.schema.pk,
						format: format,
						data: content
					})
				});

				const resData = await response.json();
				if (response.ok && resData.success) {
					notify(`Import successful! ${resData.successCount} imported, ${resData.errorCount} skipped/failed.`, 'success');
					closeImportModal();
					loadTableData(state.activeTable);
				} else {
					notify(resData.error || 'Import failed', 'error');
				}
			} catch (err) {
				console.error('[Database] Import error:', err);
				notify('Connection error during file import', 'error');
			}
		};
		reader.readAsText(file);
	}

	/**
	 * Export Full Table
	 */
	function exportTable(format) {
		if (!state.activeTable) return;
		window.location.href = `/api/sillydb/export?table=${encodeURIComponent(state.activeTable)}&format=${format}`;
	}

	/**
	 * Setup event listeners
	 */
	function setupListeners() {
		// Live search input
		const searchInput = document.getElementById('dbSearchInput');
		if (searchInput) {
			searchInput.addEventListener('input', (e) => handleSearch(e.target.value));
		}

		// Refresh button
		const refreshBtn = document.getElementById('dbRefreshBtn');
		if (refreshBtn) {
			refreshBtn.addEventListener('click', () => {
				if (state.activeTable) loadTableData(state.activeTable);
			});
		}

		// Export Menu toggle
		const exportMenuBtn = document.getElementById('exportMenuBtn');
		const exportDropdown = document.getElementById('exportDropdown');
		if (exportMenuBtn && exportDropdown) {
			exportMenuBtn.addEventListener('click', (e) => {
				e.stopPropagation();
				exportDropdown.classList.toggle('show');
			});

			document.addEventListener('click', () => {
				exportDropdown.classList.remove('show');
			});
		}

		const exportCsvBtn = document.getElementById('exportCsvBtn');
		if (exportCsvBtn) {
			exportCsvBtn.addEventListener('click', (e) => {
				e.preventDefault();
				exportTable('csv');
			});
		}

		const exportJsonBtn = document.getElementById('exportJsonBtn');
		if (exportJsonBtn) {
			exportJsonBtn.addEventListener('click', (e) => {
				e.preventDefault();
				exportTable('json');
			});
		}

		// Import modal openers
		const importBtn = document.getElementById('importBtn');
		if (importBtn) importBtn.addEventListener('click', openImportModal);

		const importModalClose = document.getElementById('importModalClose');
		if (importModalClose) importModalClose.addEventListener('click', closeImportModal);

		const importModalCancel = document.getElementById('importModalCancel');
		if (importModalCancel) importModalCancel.addEventListener('click', closeImportModal);

		const importModalConfirm = document.getElementById('importModalConfirm');
		if (importModalConfirm) importModalConfirm.addEventListener('click', executeImport);

		// Edit modal closers
		const editModalClose = document.getElementById('editModalClose');
		if (editModalClose) editModalClose.addEventListener('click', closeEditModal);

		const editModalCancel = document.getElementById('editModalCancel');
		if (editModalCancel) editModalCancel.addEventListener('click', closeEditModal);

		const editModalSave = document.getElementById('editModalSave');
		if (editModalSave) editModalSave.addEventListener('click', () => saveEditRecord(false));

		// Conflict modal closers
		const conflictModalClose = document.getElementById('conflictModalClose');
		if (conflictModalClose) conflictModalClose.addEventListener('click', closeConflictModal);

		const conflictModalCancel = document.getElementById('conflictModalCancel');
		if (conflictModalCancel) conflictModalCancel.addEventListener('click', closeConflictModal);

		const conflictModalForce = document.getElementById('conflictModalForce');
		if (conflictModalForce) conflictModalForce.addEventListener('click', () => saveEditRecord(true));
	}

	if (document.readyState === 'loading') {
		document.addEventListener('DOMContentLoaded', () => {
			setupListeners();
			init();
		});
	} else {
		setupListeners();
		init();
	}
})();
