/**
 * Fluffingiously Dragooon - Admin API Logs Controller
 * Handles historical API log querying, multi-field filtering, pagination, and header inspection drawers.
 */

(function () {
	'use strict';

	let currentPage = 1;
	let totalPages = 1;
	const limit = 50;
	const expandedRows = new Set();
	let searchTimeout = null;

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
	 * Toggle expanding headers drawer for a specific log entry
	 */
	window.toggleLogDetails = function (id) {
		const el = document.getElementById(`details-${id}`);
		if (!el) return;
		if (expandedRows.has(id)) {
			expandedRows.delete(id);
			el.style.display = 'none';
		} else {
			expandedRows.add(id);
			el.style.display = 'block';
		}
	};

	/**
	 * Fetch and render historical API logs from server
	 */
	async function fetchLogData(showToastOnComplete = false) {
		const consoleEl = document.getElementById('logsConsole');
		const reloadBtn = document.getElementById('reloadLogsBtn');
		if (reloadBtn) reloadBtn.classList.add('is-syncing');

		const filterType = document.getElementById('filterType') ? document.getElementById('filterType').value : '';
		const filterMethod = document.getElementById('filterMethod') ? document.getElementById('filterMethod').value : '';
		const filterStatus = document.getElementById('filterStatus') ? document.getElementById('filterStatus').value : '';
		const searchQuery = document.getElementById('searchQuery') ? document.getElementById('searchQuery').value.trim() : '';

		const params = new URLSearchParams({
			type: filterType,
			method: filterMethod,
			statusCode: filterStatus,
			search: searchQuery,
			page: currentPage,
			limit: limit
		});

		try {
			const res = await fetch(`/api/admin/api_logs?${params.toString()}`);
			if (!res.ok) throw new Error(`Server returned HTTP ${res.status}`);
			const data = await res.json();

			totalPages = data.totalPages || 1;
			const logs = data.logs || [];
			const total = data.total || 0;

			const btnPrev = document.getElementById('btnPrev');
			const btnNext = document.getElementById('btnNext');
			if (btnPrev) btnPrev.disabled = currentPage <= 1;
			if (btnNext) btnNext.disabled = currentPage >= totalPages;

			const startEntry = total === 0 ? 0 : (currentPage - 1) * limit + 1;
			const endEntry = Math.min(currentPage * limit, total);
			const infoEl = document.getElementById('paginationInfo');
			if (infoEl) {
				infoEl.textContent = `Showing ${startEntry}–${endEntry} of ${total} entries (Page ${currentPage} of ${totalPages})`;
			}

			const countBadge = document.getElementById('logsCountBadge');
			if (countBadge) {
				countBadge.textContent = `${total} Total Logs`;
			}

			if (consoleEl) {
				if (logs.length === 0) {
					consoleEl.innerHTML = `
						<div class="stream-placeholder">
							<span class="material-symbols-outlined" style="font-size: 2rem; opacity: 0.5;">manage_search</span>
							<span>No matching API logs found for current criteria.</span>
						</div>
					`;
					return;
				}

				consoleEl.innerHTML = logs.map(req => {
					const date = new Date(req.timestamp);
					const dateStr = date.toLocaleDateString([], { month: 'short', day: 'numeric' });
					const timeStr = date.toLocaleTimeString([], { hour12: false });

					let badgeMethodClass = 'badge-method-any';
					const method = (req.method || 'GET').toUpperCase();
					if (method === 'GET') badgeMethodClass = 'badge-method-get';
					else if (method === 'POST') badgeMethodClass = 'badge-method-post';
					else if (method === 'PUT') badgeMethodClass = 'badge-method-put';
					else if (method === 'DELETE') badgeMethodClass = 'badge-method-delete';

					let badgeStatusClass = 'status-pending';
					const status = req.statusCode;
					if (status === 'Pending') badgeStatusClass = 'status-pending';
					else if (status === 'Failed') badgeStatusClass = 'status-error';
					else if (status >= 200 && status < 300) badgeStatusClass = 'status-success';
					else if (status >= 300 && status < 400) badgeStatusClass = 'status-warning';
					else badgeStatusClass = 'status-error';

					const latencyStr = req.duration > 0 ? `${req.duration}ms` : (status === 'Pending' ? '...' : '<1ms');
					const pathName = req.path || '/';
					const ipBadge = req.ip ? `<span class="log-badge badge-ip">${escapeHtml(req.ip)}</span>` : '';

					const isExpanded = expandedRows.has(req.id);
					const detailsDisplay = isExpanded ? 'block' : 'none';

					const formatHeaders = (headersObj) => {
						if (!headersObj || Object.keys(headersObj).length === 0) {
							return '<div style="color: var(--text-subtle); font-style: italic;">No headers tracked</div>';
						}
						return Object.entries(headersObj).map(([k, v]) => `
							<div class="header-line">
								<span class="header-key">${escapeHtml(k)}:</span> <span class="header-val">${escapeHtml(v)}</span>
							</div>
						`).join('');
					};

					const reqHeadersHtml = formatHeaders(req.reqHeaders);
					const resHeadersHtml = formatHeaders(req.resHeaders);
					const errorMsgHtml = req.error ? `
						<div style="margin-top: 0.5rem; padding: 0.45rem 0.65rem; background: var(--error-container); border: 1px solid var(--error-border); border-radius: var(--radius-xs); color: var(--status-error); font-size: 0.75rem;">
							<strong>Error:</strong> ${escapeHtml(req.error)}
						</div>
					` : '';

					return `
						<div class="log-row-container">
							<div class="log-row ${req.type || ''}" onclick="window.toggleLogDetails('${req.id}')" title="Click to view headers">
								<div class="log-left">
									<span class="log-badge ${badgeMethodClass}">${method}</span>
									<span class="log-badge badge-type">${escapeHtml(req.type || 'http')}</span>
									${ipBadge}
									<span class="log-path">${escapeHtml(pathName)}</span>
								</div>
								<div class="log-right">
									<span class="badge-status ${badgeStatusClass}">${escapeHtml(String(status))}</span>
									<span class="log-latency">${latencyStr}</span>
									<span class="log-time">${dateStr} ${timeStr}</span>
								</div>
							</div>
							<div id="details-${req.id}" class="log-details" style="display: ${detailsDisplay};">
								<div class="details-grid">
									<div>
										<div class="details-section-title req">
											<span class="material-symbols-outlined" style="font-size: 1rem;">upload</span> Request Headers
										</div>
										<div class="details-headers-box">${reqHeadersHtml}</div>
									</div>
									<div>
										<div class="details-section-title res">
											<span class="material-symbols-outlined" style="font-size: 1rem;">download</span> Response Headers
										</div>
										<div class="details-headers-box">${resHeadersHtml}</div>
									</div>
								</div>
								${errorMsgHtml}
							</div>
						</div>
					`;
				}).join('');
			}

			if (showToastOnComplete && typeof CustomModal !== 'undefined') {
				CustomModal.toast('API logs reloaded', { type: 'success', duration: 2500 });
			}
		} catch (err) {
			console.error('[AdminApiLogs] Error fetching logs:', err);
			if (typeof CustomModal !== 'undefined') {
				CustomModal.toast(`Error fetching logs: ${err.message}`, { type: 'error' });
			}
		} finally {
			if (reloadBtn) {
				setTimeout(() => reloadBtn.classList.remove('is-syncing'), 400);
			}
		}
	}

	/**
	 * Reset filters
	 */
	function resetFilters() {
		const filterType = document.getElementById('filterType');
		const filterMethod = document.getElementById('filterMethod');
		const filterStatus = document.getElementById('filterStatus');
		const searchQuery = document.getElementById('searchQuery');

		if (filterType) filterType.value = '';
		if (filterMethod) filterMethod.value = '';
		if (filterStatus) filterStatus.value = '';
		if (searchQuery) searchQuery.value = '';

		currentPage = 1;
		fetchLogData();
	}

	/**
	 * Setup event handlers
	 */
	function setupListeners() {
		// Reload button
		const reloadBtn = document.getElementById('reloadLogsBtn');
		if (reloadBtn) {
			reloadBtn.addEventListener('click', () => {
				currentPage = 1;
				fetchLogData(true);
			});
		}

		// Filter change events
		['filterType', 'filterMethod', 'filterStatus'].forEach(id => {
			const el = document.getElementById(id);
			if (el) {
				el.addEventListener('change', () => {
					currentPage = 1;
					fetchLogData();
				});
			}
		});

		// Search input debouncing
		const searchInput = document.getElementById('searchQuery');
		if (searchInput) {
			searchInput.addEventListener('input', () => {
				clearTimeout(searchTimeout);
				searchTimeout = setTimeout(() => {
					currentPage = 1;
					fetchLogData();
				}, 350);
			});
		}

		// Reset filters button
		const resetBtn = document.getElementById('resetFiltersBtn');
		if (resetBtn) {
			resetBtn.addEventListener('click', resetFilters);
		}

		// Pagination controls
		const btnPrev = document.getElementById('btnPrev');
		if (btnPrev) {
			btnPrev.addEventListener('click', () => {
				if (currentPage > 1) {
					currentPage--;
					fetchLogData();
				}
			});
		}

		const btnNext = document.getElementById('btnNext');
		if (btnNext) {
			btnNext.addEventListener('click', () => {
				if (currentPage < totalPages) {
					currentPage++;
					fetchLogData();
				}
			});
		}
	}

	if (document.readyState === 'loading') {
		document.addEventListener('DOMContentLoaded', () => {
			setupListeners();
			fetchLogData();
		});
	} else {
		setupListeners();
		fetchLogData();
	}
})();
