/**
 * Fluffingiously Dragooon - Log Viewer Controller
 * Handles real-time terminal streaming, log level filtering, instant searching,
 * metric counters, clipboard exports, and auto-refresh mechanisms.
 */

(function () {
	'use strict';

	// Controller State
	let rawLogText = '';
	let parsedLogEntries = [];
	let activeLevelFilter = 'all';
	let currentSearchQuery = '';
	let autoRefreshTimer = null;
	let isAutoRefreshActive = true;
	let isAutoScrollActive = true;
	let isFetching = false;
	let lastSyncTimestamp = null;
	const REFRESH_INTERVAL_MS = 3000;

	// Regex for standard log formatting: [TIMESTAMP] [LEVEL] MESSAGE
	// Example: [2026-10-03 10:15:30] [INFO] Bot client initialized
	const LOG_PATTERN = /^(?:\[(.*?)\]\s*)?(?:\[(INFO|WARN|WARNING|ERROR|DEBUG|FATAL)\])?\s*(.*)$/i;

	/**
	 * Safe HTML escaping to prevent XSS
	 */
	function escapeHtml(str) {
		if (!str) return '';
		return String(str)
			.replace(/&/g, '&amp;')
			.replace(/</g, '&lt;')
			.replace(/>/g, '&gt;')
			.replace(/"/g, '&quot;')
			.replace(/'/g, '&#039;');
	}

	/**
	 * Highlight search matches within a string
	 */
	function highlightText(text, query) {
		if (!query) return escapeHtml(text);
		const escapedQuery = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
		const regex = new RegExp(`(${escapedQuery})`, 'gi');
		const parts = text.split(regex);
		return parts.map(part => {
			if (part.toLowerCase() === query.toLowerCase()) {
				return `<mark class="log-search-match">${escapeHtml(part)}</mark>`;
			}
			return escapeHtml(part);
		}).join('');
	}

	/**
	 * Parse raw log line into structured log entry
	 */
	function parseLine(rawText, index) {
		const match = rawText.match(LOG_PATTERN);
		let timestamp = '';
		let level = 'info';
		let message = rawText;

		if (match) {
			timestamp = match[1] || '';
			const detectedLevel = (match[2] || '').toUpperCase();
			if (detectedLevel === 'WARN' || detectedLevel === 'WARNING') {
				level = 'warn';
			} else if (detectedLevel === 'ERROR' || detectedLevel === 'FATAL') {
				level = 'error';
			} else if (detectedLevel === 'DEBUG') {
				level = 'debug';
			} else if (detectedLevel === 'INFO') {
				level = 'info';
			} else {
				// Fallback inspection if prefix was missing
				if (rawText.includes('[ERROR]') || rawText.includes('Error:') || rawText.toLowerCase().includes('uncaught')) {
					level = 'error';
				} else if (rawText.includes('[WARN]') || rawText.includes('Warning:')) {
					level = 'warn';
				} else if (rawText.includes('[DEBUG]')) {
					level = 'debug';
				} else {
					level = 'info';
				}
			}
			message = match[3] !== undefined && match[3] !== '' ? match[3] : rawText;
		}

		return {
			index: index + 1,
			raw: rawText,
			timestamp: timestamp,
			level: level,
			message: message
		};
	}

	/**
	 * Verify admin authentication before running viewer
	 */
	async function checkAuthStatus() {
		try {
			const res = await fetch('/api/status');
			if (!res.ok) throw new Error(`HTTP ${res.status}`);
			const data = await res.json();

			if (!data.user || !data.user.isAdmin) {
				console.warn('[LogViewer] Unauthorized access attempt, redirecting to /dashboard');
				window.location.href = '/dashboard';
				return false;
			}
			return true;
		} catch (err) {
			console.error('[LogViewer] Failed to verify authorization:', err);
			window.location.href = '/dashboard';
			return false;
		}
	}

	/**
	 * Fetch logs from server API
	 */
	async function fetchLogs() {
		if (isFetching) return;
		isFetching = true;

		const syncBtn = document.getElementById('btnSyncLogs');
		if (syncBtn) syncBtn.classList.add('is-syncing');

		const statusPill = document.getElementById('streamStatusPill');
		const pulseDot = document.getElementById('statusPulseDot');

		try {
			const res = await fetch('/api/admin/logs');

			if (res.status === 401 || res.status === 403) {
				console.warn('[LogViewer] Session invalid or forbidden');
				window.location.href = '/dashboard';
				return;
			}

			if (!res.ok) {
				throw new Error(`Server returned HTTP ${res.status}`);
			}

			const text = await res.text();
			rawLogText = text || '';
			lastSyncTimestamp = new Date();

			processRawLogs(rawLogText);

			if (statusPill && isAutoRefreshActive) {
				statusPill.innerHTML = '<span id="statusPulseDot" class="pulse-dot"></span><span>LIVE STREAMING (3s)</span>';
			}

		} catch (err) {
			console.error('[LogViewer] Error fetching logs:', err);
			if (statusPill) {
				statusPill.innerHTML = '<span id="statusPulseDot" class="pulse-dot error"></span><span>CONNECTION ERROR</span>';
			}
			if (window.CustomModal && typeof window.CustomModal.toast === 'function') {
				window.CustomModal.toast(`Log sync failed: ${err.message}`, { type: 'error', duration: 4000 });
			}
		} finally {
			isFetching = false;
			if (syncBtn) syncBtn.classList.remove('is-syncing');
		}
	}

	/**
	 * Process raw text into parsed log entries and trigger renders
	 */
	function processRawLogs(text) {
		if (!text || text.trim() === '' || text.trim() === 'No logs recorded yet.') {
			parsedLogEntries = [];
		} else {
			const lines = text.split('\n');
			// Filter out trailing empty line if present
			if (lines.length > 0 && lines[lines.length - 1] === '') {
				lines.pop();
			}
			parsedLogEntries = lines.map((line, idx) => parseLine(line, idx));
		}

		updateOverviewMetrics();
		updateFilterBadges();
		renderTerminalLogs();
	}

	/**
	 * Update overview metrics cards
	 */
	function updateOverviewMetrics() {
		const totalLinesEl = document.getElementById('statTotalLines');
		const errorCountEl = document.getElementById('statErrorCount');
		const warnCountEl = document.getElementById('statWarnCount');
		const lastSyncEl = document.getElementById('statLastSync');
		const terminalHeaderLinesEl = document.getElementById('terminalHeaderLines');

		const total = parsedLogEntries.length;
		const errors = parsedLogEntries.filter(e => e.level === 'error').length;
		const warns = parsedLogEntries.filter(e => e.level === 'warn').length;

		if (totalLinesEl) totalLinesEl.textContent = total.toLocaleString();
		if (errorCountEl) errorCountEl.textContent = errors.toLocaleString();
		if (warnCountEl) warnCountEl.textContent = warns.toLocaleString();
		if (terminalHeaderLinesEl) terminalHeaderLinesEl.textContent = `${total} lines`;

		if (lastSyncEl) {
			if (!lastSyncTimestamp) {
				lastSyncEl.textContent = 'Never';
			} else {
				const timeStr = lastSyncTimestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
				lastSyncEl.textContent = timeStr;
			}
		}
	}

	/**
	 * Update counts in level filter chips
	 */
	function updateFilterBadges() {
		const counts = {
			all: parsedLogEntries.length,
			info: 0,
			warn: 0,
			error: 0,
			debug: 0
		};

		parsedLogEntries.forEach(e => {
			if (counts[e.level] !== undefined) {
				counts[e.level]++;
			}
		});

		const setBadge = (id, count) => {
			const el = document.getElementById(id);
			if (el) el.textContent = count;
		};

		setBadge('countFilterAll', counts.all);
		setBadge('countFilterInfo', counts.info);
		setBadge('countFilterWarn', counts.warn);
		setBadge('countFilterError', counts.error);
		setBadge('countFilterDebug', counts.debug);
	}

	/**
	 * Render terminal log lines to the DOM
	 */
	function renderTerminalLogs() {
		const terminalBody = document.getElementById('terminalBody');
		if (!terminalBody) return;

		// Empty state handling
		if (parsedLogEntries.length === 0) {
			terminalBody.innerHTML = `
				<div class="terminal-empty-state">
					<span class="material-symbols-outlined terminal-empty-icon">terminal</span>
					<h4 class="terminal-empty-title">No Log Outputs Recorded</h4>
					<p class="terminal-empty-desc">
						When Fluffingiously Dragooon writes output to stdout or <code>data/logs/bot.log</code>, entries will stream into this terminal automatically.
					</p>
				</div>
			`;
			return;
		}

		// Filter entries
		const filtered = parsedLogEntries.filter(entry => {
			// Level filter
			if (activeLevelFilter !== 'all' && entry.level !== activeLevelFilter) {
				return false;
			}
			// Search filter
			if (currentSearchQuery) {
				const queryLower = currentSearchQuery.toLowerCase();
				return entry.raw.toLowerCase().includes(queryLower);
			}
			return true;
		});

		// Check if search returned no results
		if (filtered.length === 0) {
			terminalBody.innerHTML = `
				<div class="terminal-empty-state">
					<span class="material-symbols-outlined terminal-empty-icon">search_off</span>
					<h4 class="terminal-empty-title">No Matching Log Entries</h4>
					<p class="terminal-empty-desc">
						No entries matched the current query "<strong>${escapeHtml(currentSearchQuery)}</strong>" under level <code>${activeLevelFilter.toUpperCase()}</code>.
					</p>
				</div>
			`;
			return;
		}

		// Preserve scroll position if user scrolled away from bottom
		const isAtBottom = terminalBody.scrollHeight - terminalBody.clientHeight <= terminalBody.scrollTop + 60;

		const html = filtered.map(entry => {
			const rowClass = `log-row log-row-${entry.level}${currentSearchQuery ? ' is-highlighted' : ''}`;
			const timestampHtml = entry.timestamp 
				? `<span class="log-timestamp">[${escapeHtml(entry.timestamp)}]</span>` 
				: '';
			const tagHtml = `<span class="log-tag log-tag-${entry.level}">${entry.level.toUpperCase()}</span>`;
			const highlightedMessage = highlightText(entry.message, currentSearchQuery);

			return `
				<div class="${rowClass}">
					<span class="log-line-num">${entry.index}</span>
					${timestampHtml}
					${tagHtml}
					<span class="log-text">${highlightedMessage}</span>
				</div>
			`;
		}).join('');

		terminalBody.innerHTML = html;

		// Stick to bottom if auto-scroll is active and user is already near bottom
		if (isAutoScrollActive && isAtBottom) {
			terminalBody.scrollTop = terminalBody.scrollHeight;
		}
	}

	/**
	 * Toggle Auto-Refresh interval
	 */
	function toggleAutoRefresh() {
		const btn = document.getElementById('btnToggleAutoRefresh');
		const statusPill = document.getElementById('streamStatusPill');

		if (isAutoRefreshActive) {
			// Pause auto-refresh
			if (autoRefreshTimer) {
				clearInterval(autoRefreshTimer);
				autoRefreshTimer = null;
			}
			isAutoRefreshActive = false;
			if (btn) {
				btn.classList.remove('active');
				btn.innerHTML = '<span class="material-symbols-outlined">play_arrow</span><span>Auto-refresh: OFF</span>';
			}
			if (statusPill) {
				statusPill.innerHTML = '<span id="statusPulseDot" class="pulse-dot paused"></span><span>STREAM PAUSED</span>';
			}
			if (window.CustomModal && typeof window.CustomModal.toast === 'function') {
				window.CustomModal.toast('Auto-refresh paused.', { type: 'info', duration: 2500 });
			}
		} else {
			// Resume auto-refresh
			isAutoRefreshActive = true;
			if (btn) {
				btn.classList.add('active');
				btn.innerHTML = '<span class="material-symbols-outlined">pause</span><span>Auto-refresh: 3s</span>';
			}
			if (statusPill) {
				statusPill.innerHTML = '<span id="statusPulseDot" class="pulse-dot"></span><span>LIVE STREAMING (3s)</span>';
			}
			fetchLogs();
			autoRefreshTimer = setInterval(fetchLogs, REFRESH_INTERVAL_MS);
			if (window.CustomModal && typeof window.CustomModal.toast === 'function') {
				window.CustomModal.toast('Auto-refresh resumed (3s interval).', { type: 'success', duration: 2500 });
			}
		}
	}

	/**
	 * Toggle Auto-Scroll lock
	 */
	function toggleAutoScroll() {
		const btn = document.getElementById('btnToggleAutoScroll');
		const terminalBody = document.getElementById('terminalBody');

		isAutoScrollActive = !isAutoScrollActive;

		if (btn) {
			if (isAutoScrollActive) {
				btn.classList.add('active');
				if (terminalBody) terminalBody.scrollTop = terminalBody.scrollHeight;
			} else {
				btn.classList.remove('active');
			}
		}

		if (window.CustomModal && typeof window.CustomModal.toast === 'function') {
			window.CustomModal.toast(isAutoScrollActive ? 'Auto-scroll enabled' : 'Auto-scroll disabled', { type: 'info', duration: 2000 });
		}
	}

	/**
	 * Copy all currently loaded logs to clipboard
	 */
	async function copyLogsToClipboard() {
		if (!rawLogText || rawLogText.trim() === '') {
			if (window.CustomModal && typeof window.CustomModal.toast === 'function') {
				window.CustomModal.toast('No logs available to copy.', { type: 'warning' });
			}
			return;
		}

		try {
			await navigator.clipboard.writeText(rawLogText);
			if (window.CustomModal && typeof window.CustomModal.toast === 'function') {
				window.CustomModal.toast(`Copied ${parsedLogEntries.length} log lines to clipboard!`, { type: 'success' });
			}
		} catch (err) {
			console.error('[LogViewer] Copy failed:', err);
			// Fallback copy mechanism
			const textarea = document.createElement('textarea');
			textarea.value = rawLogText;
			document.body.appendChild(textarea);
			textarea.select();
			document.execCommand('copy');
			document.body.removeChild(textarea);
			if (window.CustomModal && typeof window.CustomModal.toast === 'function') {
				window.CustomModal.toast('Copied logs to clipboard via fallback.', { type: 'success' });
			}
		}
	}

	/**
	 * Download logs as text file
	 */
	function downloadLogFile() {
		if (!rawLogText || rawLogText.trim() === '') {
			if (window.CustomModal && typeof window.CustomModal.toast === 'function') {
				window.CustomModal.toast('No logs available to download.', { type: 'warning' });
			}
			return;
		}

		const blob = new Blob([rawLogText], { type: 'text/plain;charset=utf-8' });
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
		a.href = url;
		a.download = `dragooon-bot-log-${timestamp}.log`;
		document.body.appendChild(a);
		a.click();
		document.body.removeChild(a);
		URL.revokeObjectURL(url);

		if (window.CustomModal && typeof window.CustomModal.toast === 'function') {
			window.CustomModal.toast('Log file download initiated.', { type: 'success' });
		}
	}

	/**
	 * Clear terminal display buffer locally
	 */
	function clearTerminalDisplay() {
		parsedLogEntries = [];
		rawLogText = '';
		updateOverviewMetrics();
		updateFilterBadges();
		renderTerminalLogs();

		if (window.CustomModal && typeof window.CustomModal.toast === 'function') {
			window.CustomModal.toast('Terminal display buffer cleared locally.', { type: 'info' });
		}
	}

	/**
	 * Toggle Fullscreen Terminal
	 */
	function toggleFullscreen() {
		const win = document.getElementById('terminalWindow');
		const icon = document.getElementById('fullscreenIcon');
		if (!win) return;

		win.classList.toggle('is-fullscreen');
		const isFull = win.classList.contains('is-fullscreen');

		if (icon) {
			icon.textContent = isFull ? 'fullscreen_exit' : 'fullscreen';
		}
	}

	/**
	 * Setup interactive event listeners
	 */
	function setupEventListeners() {
		// Sync Now Button
		const btnSync = document.getElementById('btnSyncLogs');
		if (btnSync) btnSync.addEventListener('click', fetchLogs);

		// Auto Refresh Button
		const btnAutoRefresh = document.getElementById('btnToggleAutoRefresh');
		if (btnAutoRefresh) btnAutoRefresh.addEventListener('click', toggleAutoRefresh);

		// Auto Scroll Button
		const btnAutoScroll = document.getElementById('btnToggleAutoScroll');
		if (btnAutoScroll) btnAutoScroll.addEventListener('click', toggleAutoScroll);

		// Clear Screen Button
		const btnClear = document.getElementById('btnClearTerminal');
		if (btnClear) btnClear.addEventListener('click', clearTerminalDisplay);

		// Download Button
		const btnDownload = document.getElementById('btnDownloadLogs');
		if (btnDownload) btnDownload.addEventListener('click', downloadLogFile);

		// Copy Buttons
		const btnCopyHeader = document.getElementById('btnCopyLogsHeader');
		if (btnCopyHeader) btnCopyHeader.addEventListener('click', copyLogsToClipboard);

		// Fullscreen Button
		const btnFullscreen = document.getElementById('btnToggleFullscreen');
		if (btnFullscreen) btnFullscreen.addEventListener('click', toggleFullscreen);

		// Search Input & Clear
		const searchInput = document.getElementById('logSearchInput');
		const searchClear = document.getElementById('logSearchClear');

		if (searchInput) {
			searchInput.addEventListener('input', (e) => {
				currentSearchQuery = e.target.value.trim();
				if (searchClear) {
					searchClear.style.display = currentSearchQuery ? 'block' : 'none';
				}
				renderTerminalLogs();
			});
		}

		if (searchClear && searchInput) {
			searchClear.addEventListener('click', () => {
				searchInput.value = '';
				currentSearchQuery = '';
				searchClear.style.display = 'none';
				searchInput.focus();
				renderTerminalLogs();
			});
		}

		// Level Filter Chips
		const filterButtons = document.querySelectorAll('.log-filter-btn');
		filterButtons.forEach(btn => {
			btn.addEventListener('click', () => {
				filterButtons.forEach(b => b.classList.remove('active'));
				btn.classList.add('active');
				activeLevelFilter = btn.getAttribute('data-level') || 'all';
				renderTerminalLogs();
			});
		});

		// Auto-scroll detection on terminal manual scrolling
		const terminalBody = document.getElementById('terminalBody');
		if (terminalBody) {
			terminalBody.addEventListener('scroll', () => {
				const isNearBottom = terminalBody.scrollHeight - terminalBody.clientHeight <= terminalBody.scrollTop + 60;
				const scrollBtn = document.getElementById('btnToggleAutoScroll');
				if (scrollBtn) {
					if (isNearBottom) {
						scrollBtn.style.opacity = '1';
					} else if (isAutoScrollActive) {
						scrollBtn.style.opacity = '0.7';
					}
				}
			});
		}

		// Expose key actions globally for inline event handlers if needed
		window.fetchLogs = fetchLogs;
		window.toggleAutoRefresh = toggleAutoRefresh;
		window.toggleAutoScroll = toggleAutoScroll;
		window.copyLogsToClipboard = copyLogsToClipboard;
		window.downloadLogFile = downloadLogFile;
		window.clearTerminalDisplay = clearTerminalDisplay;
		window.toggleFullscreen = toggleFullscreen;
	}

	/**
	 * Controller Initialization
	 */
	async function init() {
		setupEventListeners();

		const authorized = await checkAuthStatus();
		if (!authorized) return;

		await fetchLogs();

		// Start polling
		if (isAutoRefreshActive) {
			autoRefreshTimer = setInterval(fetchLogs, REFRESH_INTERVAL_MS);
		}
	}

	// Boot initialization
	if (document.readyState === 'loading') {
		document.addEventListener('DOMContentLoaded', init);
	} else {
		init();
	}
})();
