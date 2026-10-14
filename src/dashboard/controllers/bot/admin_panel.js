/**
 * Fluffingiously Dragooon - Admin Panel Controller
 * Handles administrative system controls, live API telemetry, chart rendering, and process controls.
 */

(function () {
	'use strict';

	let updateInterval = null;
	let lastRequestCount = 0;
	let rpmHistory = Array(30).fill(0);
	let localRequests = [];
	const expandedRows = new Set();

	/**
	 * Safe HTML escaping
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
	 * Toggle expanding headers for a request in stream console
	 */
	window.toggleRowDetails = function (id) {
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
	 * High-DPI Canvas Line Chart for API RPM Traffic
	 */
	function drawApiChart(dataPoints) {
		const canvas = document.getElementById('apiChartCanvas');
		if (!canvas) return;
		const ctx = canvas.getContext('2d');
		const width = canvas.clientWidth;
		const height = canvas.clientHeight;
		if (!width || !height) return;

		const dpr = window.devicePixelRatio || 1;
		canvas.width = width * dpr;
		canvas.height = height * dpr;
		ctx.scale(dpr, dpr);

		ctx.clearRect(0, 0, width, height);

		const maxVal = Math.max(...dataPoints, 5);
		const padding = 12;
		const chartWidth = width - padding * 2;
		const chartHeight = height - padding * 2;

		// Gradient Area Fill
		const gradient = ctx.createLinearGradient(0, padding, 0, height - padding);
		gradient.addColorStop(0, 'rgba(202, 190, 255, 0.35)');
		gradient.addColorStop(1, 'rgba(202, 190, 255, 0.01)');

		ctx.beginPath();
		dataPoints.forEach((val, i) => {
			const x = padding + (i / Math.max(dataPoints.length - 1, 1)) * chartWidth;
			const y = padding + chartHeight - (val / maxVal) * chartHeight;
			if (i === 0) {
				ctx.moveTo(x, y);
			} else {
				ctx.lineTo(x, y);
			}
		});

		ctx.strokeStyle = '#cabeff';
		ctx.lineWidth = 2;
		ctx.lineJoin = 'round';
		ctx.lineCap = 'round';
		ctx.stroke();

		// Close polygon for gradient area
		ctx.lineTo(padding + chartWidth, padding + chartHeight);
		ctx.lineTo(padding, padding + chartHeight);
		ctx.closePath();
		ctx.fillStyle = gradient;
		ctx.fill();

		// Subtle guideline in the middle
		ctx.strokeStyle = 'rgba(255, 255, 255, 0.06)';
		ctx.lineWidth = 1;
		ctx.beginPath();
		ctx.moveTo(padding, padding + chartHeight / 2);
		ctx.lineTo(padding + chartWidth, padding + chartHeight / 2);
		ctx.stroke();
	}

	/**
	 * Fetch status and update telemetry, diagnostics, and stream console
	 */
	async function updateStatus(isInitial = false) {
		const syncBtn = document.getElementById('refreshBtn');
		if (syncBtn && !isInitial) syncBtn.classList.add('is-syncing');

		try {
			if (isInitial) {
				localRequests = [];
			}

			const since = localRequests.length > 0
				? new Date(localRequests[localRequests.length - 1].timestamp).getTime()
				: 0;

			const res = await fetch(`/api/status?since=${since}`);
			if (!res.ok) throw new Error(`HTTP error ${res.status}`);
			const data = await res.json();

			if (isInitial && (!data.user || !data.user.isAdmin)) {
				window.location.href = '/dashboard';
				return;
			}

			// System diagnostics
			if (data.system) {
				const elOs = document.getElementById('sysOs');
				const elNode = document.getElementById('sysNode');
				const elMem = document.getElementById('sysMemory');
				const elUptime = document.getElementById('sysUptime');

				if (elOs) elOs.textContent = data.system.platform || 'Linux/Docker';
				if (elNode) elNode.textContent = data.system.nodeVersion || 'v20.x';
				if (elMem) elMem.textContent = data.system.memoryUsage || '0MB';
				if (elUptime) elUptime.textContent = data.system.uptime || '0h';
			}

			// API Tracker metrics
			if (data.apiTracker) {
				const tracker = data.apiTracker;
				const metrics = tracker.metrics || {};

				const setVal = (id, val) => {
					const el = document.getElementById(id);
					if (el) el.textContent = val !== undefined ? val : 0;
				};

				setVal('apiTotal', metrics.totalRequests);
				setVal('apiDiscord', metrics.discordClientRequests);
				setVal('apiDashboard', metrics.dashboardOAuthRequests);
				setVal('apiExternal', metrics.externalRequests);
				setVal('apiIncoming', metrics.incomingWebRequests);
				setVal('apiRateLimits', metrics.rateLimitsEncountered);

				const rpm = tracker.requestsLastMinute || 0;
				const rpmEl = document.getElementById('apiRpm');
				if (rpmEl) {
					rpmEl.textContent = `${rpm} RPM`;
					if (rpm > 40) {
						rpmEl.style.color = 'var(--status-error)';
					} else if (rpm > 20) {
						rpmEl.style.color = 'var(--status-warning)';
					} else {
						rpmEl.style.color = 'var(--status-online)';
					}
				}

				// Update history for canvas chart
				if (tracker.rpmHistory && Array.isArray(tracker.rpmHistory)) {
					rpmHistory = tracker.rpmHistory;
				} else {
					rpmHistory.push(rpm);
					if (rpmHistory.length > 30) {
						rpmHistory.shift();
					}
				}
				drawApiChart(rpmHistory);

				// Render request streams
				const consoleEl = document.getElementById('requestStreamConsole');
				const newRequests = tracker.recentRequests || [];

				if (newRequests.length > 0) {
					const reversedNew = [...newRequests].reverse();
					localRequests = [...localRequests, ...reversedNew].slice(-500);
				}

				if (consoleEl) {
					if (localRequests.length === 0) {
						consoleEl.innerHTML = `
							<div class="stream-placeholder">
								<span class="material-symbols-outlined">wifi_tethering</span>
								<span>Listening for active API request streams...</span>
							</div>
						`;
					} else {
						const isAtBottom = consoleEl.scrollHeight - consoleEl.clientHeight <= consoleEl.scrollTop + 50;

						const pulseEl = document.getElementById('streamPulse');
						if (pulseEl && metrics.totalRequests > lastRequestCount) {
							pulseEl.classList.add('online');
							setTimeout(() => pulseEl.classList.remove('online'), 4000);
							lastRequestCount = metrics.totalRequests;
						}

						consoleEl.innerHTML = localRequests.map(req => {
							const date = new Date(req.timestamp);
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
							const ipBadge = req.ip ? `<span class="stream-badge badge-ip">${escapeHtml(req.ip)}</span>` : '';

							const isExpanded = expandedRows.has(req.id);
							const detailsDisplay = isExpanded ? 'block' : 'none';

							const formatHeaders = (headersObj) => {
								if (!headersObj || Object.keys(headersObj).length === 0) {
									return '<div style="color: var(--text-subtle); font-style: italic;">No headers tracked</div>';
								}
								return Object.entries(headersObj).map(([k, v]) => `
									<div class="header-entry">
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
								<div class="stream-row-container">
									<div class="stream-row ${req.type || ''}" onclick="window.toggleRowDetails('${req.id}')" title="Click to view headers">
										<div class="stream-left">
											<span class="stream-badge ${badgeMethodClass}">${method}</span>
											<span class="stream-badge badge-type">${escapeHtml(req.type || 'http')}</span>
											${ipBadge}
											<span class="stream-path">${escapeHtml(pathName)}</span>
										</div>
										<div class="stream-right">
											<span class="badge-status ${badgeStatusClass}">${escapeHtml(String(status))}</span>
											<span class="stream-latency">${latencyStr}</span>
											<span class="stream-time">${timeStr}</span>
										</div>
									</div>
									<div id="details-${req.id}" class="stream-details" style="display: ${detailsDisplay};">
										<div class="stream-details-grid">
											<div>
												<div class="details-column-title req">
													<span class="material-symbols-outlined" style="font-size: 1rem;">upload</span> Request Headers
												</div>
												<div class="details-box">${reqHeadersHtml}</div>
											</div>
											<div>
												<div class="details-column-title res">
													<span class="material-symbols-outlined" style="font-size: 1rem;">download</span> Response Headers
												</div>
												<div class="details-box">${resHeadersHtml}</div>
											</div>
										</div>
										${errorMsgHtml}
									</div>
								</div>
							`;
						}).join('');

						if (isAtBottom || isInitial) {
							consoleEl.scrollTop = consoleEl.scrollHeight;
						}
					}
				}
			}
		} catch (e) {
			console.error('[AdminPanel] Error fetching status telemetry:', e);
		} finally {
			if (syncBtn) {
				setTimeout(() => syncBtn.classList.remove('is-syncing'), 400);
			}
		}
	}

	/**
	 * Toggle Auto Refresh (3s)
	 */
	window.toggleAutoRefresh = function () {
		const btn = document.getElementById('autoToggleBtn');
		if (updateInterval) {
			clearInterval(updateInterval);
			updateInterval = null;
			if (btn) {
				btn.classList.remove('active');
				btn.innerHTML = '<span class="material-symbols-outlined">sync_disabled</span> <span>Auto-refresh Off</span>';
			}
			if (typeof CustomModal !== 'undefined') {
				CustomModal.toast('Auto-refresh paused', { type: 'info', duration: 2500 });
			}
		} else {
			updateStatus(false);
			updateInterval = setInterval(() => updateStatus(false), 3000);
			if (btn) {
				btn.classList.add('active');
				btn.innerHTML = '<span class="material-symbols-outlined">sync</span> <span>Auto-refresh (3s)</span>';
			}
			if (typeof CustomModal !== 'undefined') {
				CustomModal.toast('Live auto-refresh enabled', { type: 'success', duration: 2500 });
			}
		}
	};

	/**
	 * Save bot status text
	 */
	window.saveBotStatus = async function () {
		const input = document.getElementById('statusInput');
		if (!input) return;
		const statusVal = input.value.trim();

		try {
			const res = await fetch('/api/admin/bot_status', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ statusText: statusVal })
			});

			if (res.ok) {
				if (typeof CustomModal !== 'undefined') {
					CustomModal.toast('Bot activity status updated successfully!', { type: 'success' });
				}
			} else {
				throw new Error('Server returned an error');
			}
		} catch (err) {
			if (typeof CustomModal !== 'undefined') {
				CustomModal.toast(`Error updating status: ${err.message}`, { type: 'error' });
			}
		}
	};

	/**
	 * Gracefully restart bot process with CustomModal confirm dialog
	 */
	window.restartBot = async function () {
		let confirmed = false;
		if (typeof CustomModal !== 'undefined') {
			confirmed = await CustomModal.confirm(
				'Are you sure you want to gracefully restart the bot process? The connection will drop momentarily while the process manager reboots.',
				{
					title: 'Confirm Bot Restart',
					danger: true,
					confirmText: 'Restart Bot',
					cancelText: 'Cancel'
				}
			);
		} else {
			confirmed = window.confirm('Are you sure you want to gracefully restart the bot process?');
		}

		if (!confirmed) return;

		try {
			const res = await fetch('/api/admin/restart', { method: 'POST' });
			if (res.ok) {
				if (typeof CustomModal !== 'undefined') {
					await CustomModal.alert(
						'Restart signal sent! The page will disconnect momentarily and reconnect when the bot boots back online.',
						{ title: 'Process Restart Initiated', type: 'info' }
					);
				}
				setTimeout(() => { window.location.reload(); }, 6000);
			} else {
				throw new Error('Server rejected restart request');
			}
		} catch (err) {
			if (typeof CustomModal !== 'undefined') {
				CustomModal.alert(`Failed to restart process: ${err.message}`, { type: 'error' });
			}
		}
	};

	/**
	 * Setup event listeners and boot
	 */
	function init() {
		const refreshBtn = document.getElementById('refreshBtn');
		if (refreshBtn) {
			refreshBtn.addEventListener('click', () => updateStatus(false));
		}

		const autoToggleBtn = document.getElementById('autoToggleBtn');
		if (autoToggleBtn) {
			autoToggleBtn.addEventListener('click', window.toggleAutoRefresh);
		}

		const saveBtn = document.getElementById('saveBotStatusBtn');
		if (saveBtn) {
			saveBtn.addEventListener('click', window.saveBotStatus);
		}

		const restartBtn = document.getElementById('restartBotBtn');
		if (restartBtn) {
			restartBtn.addEventListener('click', window.restartBot);
		}

		// Initial status pull
		updateStatus(true);

		// Start 3-second polling
		if (updateInterval) clearInterval(updateInterval);
		updateInterval = setInterval(() => updateStatus(false), 3000);

		// Handle window resize for canvas redraw
		window.addEventListener('resize', () => {
			drawApiChart(rpmHistory);
		});

		window.addEventListener('beforeunload', () => {
			if (updateInterval) clearInterval(updateInterval);
		});
	}

	if (document.readyState === 'loading') {
		document.addEventListener('DOMContentLoaded', init);
	} else {
		init();
	}
})();
