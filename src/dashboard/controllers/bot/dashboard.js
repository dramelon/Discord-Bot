/**
 * Fluffingiously Dragooon - Bot Status Dashboard Controller
 * Handles real-time diagnostics, dynamic widget layouts, reliability logs, and layout customization.
 */

(function () {
	'use strict';

	let currentLayout = null;
	let backupLayout = null;
	let isEditing = false;

	// Widget Template definitions with Google Material Symbols Outlined icons & color tokens
	const WIDGET_TEMPLATES = {
		"uptime": {
			id: "uptime",
			title: "Uptime",
			icon: "timer",
			colorClass: "text-primary",
			desc: "Reliability since last boot",
			valueId: "metricUptime"
		},
		"servers": {
			id: "servers",
			title: "Servers",
			icon: "dns",
			colorClass: "text-secondary",
			desc: "Connected to Discord gateway",
			valueId: "metricServers"
		},
		"installs": {
			id: "installs",
			title: "Installs",
			icon: "group",
			colorClass: "text-tertiary",
			desc: "Active user installations",
			valueId: "metricInstalls"
		},
		"api_ping": {
			id: "api_ping",
			title: "API Ping",
			icon: "bolt",
			colorClass: "text-primary",
			desc: "WebSocket gateway latency",
			valueId: "metricPing"
		},
		"ram_usage": {
			id: "ram_usage",
			title: "RAM Usage",
			icon: "memory",
			colorClass: "text-secondary",
			desc: "Memory heap allocation",
			valueId: "metricMemory",
			descId: "metricMemoryDesc"
		},
		"environment": {
			id: "environment",
			title: "Environment",
			icon: "cloud",
			colorClass: "text-tertiary",
			desc: "Host detection environment",
			valueId: "metricEnv",
			descId: "metricEnvDesc"
		}
	};

	// State tracking for uptime ticker
	const POLL_INTERVAL = 60000; // Poll server every 60s
	let initialLoadDone = false;
	let currentUptimeSeconds = 0;
	let lastFetchTime = 0;

	/**
	 * Helper for modern modals with fallback
	 */
	async function showPrompt(title, message, defaultValue = '') {
		if (window.CustomModal && typeof window.CustomModal.prompt === 'function') {
			return await window.CustomModal.prompt(message, {
				title: title,
				defaultValue: defaultValue,
				inputType: 'text'
			});
		}
		return prompt(`${title}\n\n${message}`, defaultValue);
	}

	async function showConfirm(title, message, danger = false) {
		if (window.CustomModal && typeof window.CustomModal.confirm === 'function') {
			return await window.CustomModal.confirm(message, {
				title: title,
				danger: danger
			});
		}
		return confirm(`${title}\n\n${message}`);
	}

	async function showAlert(title, message, type = 'info') {
		if (window.CustomModal && typeof window.CustomModal.alert === 'function') {
			return await window.CustomModal.alert(message, {
				title: title,
				type: type
			});
		}
		alert(`${title}: ${message}`);
	}

	/**
	 * Fetch layout configuration from server
	 */
	async function fetchLayoutConfig() {
		try {
			const res = await fetch('/api/site/config');
			if (res.ok) {
				currentLayout = await res.json();
				backupLayout = JSON.parse(JSON.stringify(currentLayout));
				renderWidgets();
			}
		} catch (e) {
			console.error('[Dashboard] Failed to load layout configuration:', e);
		}
	}

	/**
	 * Render all category sections and metric cards
	 */
	function renderWidgets() {
		const container = document.getElementById('dashboardWidgets');
		if (!container) return;
		container.innerHTML = '';

		if (!currentLayout || !currentLayout.categories || currentLayout.categories.length === 0) {
			container.innerHTML = `
				<div style="color: var(--text-subtle); padding: 2rem; text-align: center; border: 1px dashed var(--border-color); border-radius: 12px; margin-top: 1rem; width: 100%;">
					No categories configured. Click <strong>Edit Layout</strong> to add one!
				</div>
			`;
			renderUnusedPool();
			return;
		}

		currentLayout.categories.forEach((cat, catIndex) => {
			const catSection = document.createElement('section');
			catSection.className = 'dashboard-category-section';

			const catHeader = document.createElement('div');
			catHeader.className = 'category-header';

			const titleSpan = document.createElement('span');
			titleSpan.className = 'category-title';
			titleSpan.textContent = cat.name;
			catHeader.appendChild(titleSpan);

			const actionsDiv = document.createElement('div');
			actionsDiv.className = 'category-edit-actions';

			const renameBtn = document.createElement('button');
			renameBtn.className = 'btn-cat-action';
			renameBtn.innerHTML = '<span class="material-symbols-outlined" style="font-size:16px;">edit</span> Rename';
			renameBtn.onclick = () => renameCategory(catIndex);
			actionsDiv.appendChild(renameBtn);

			const deleteBtn = document.createElement('button');
			deleteBtn.className = 'btn-cat-action btn-cat-delete';
			deleteBtn.innerHTML = '<span class="material-symbols-outlined" style="font-size:16px;">delete</span> Delete';
			deleteBtn.onclick = () => deleteCategory(catIndex);
			actionsDiv.appendChild(deleteBtn);

			catHeader.appendChild(actionsDiv);
			catSection.appendChild(catHeader);

			const grid = document.createElement('div');
			grid.className = 'metrics-grid';

			if (cat.cards.length === 0) {
				const emptyPlaceholder = document.createElement('div');
				emptyPlaceholder.style.cssText = 'grid-column: 1 / -1; color: var(--text-subtle); font-size: 0.85rem; padding: 1.5rem; text-align: center; border: 1px dashed var(--border-color); border-radius: 12px; width: 100%;';
				emptyPlaceholder.textContent = isEditing ? 'Empty Category. Add widgets from the pool below!' : 'No widgets in this category.';
				grid.appendChild(emptyPlaceholder);
			} else {
				cat.cards.forEach((cardId, cardIndex) => {
					const cardHtml = renderCardHtml(cardId, isEditing, catIndex, cardIndex);
					grid.insertAdjacentHTML('beforeend', cardHtml);
				});
			}

			catSection.appendChild(grid);
			container.appendChild(catSection);
		});

		renderUnusedPool();
	}

	/**
	 * Generate HTML string for single metric card
	 */
	function renderCardHtml(cardId, isInEditMode, catIndex, cardIndex) {
		const template = WIDGET_TEMPLATES[cardId];
		if (!template) return '';

		let editOverlay = '';
		if (isInEditMode) {
			editOverlay = `
				<div class="card-edit-overlay">
					<button class="btn-card-edit" title="Move Left / Up" onclick="window.dashboardMoveCard(${catIndex}, ${cardIndex}, -1)">
						<span class="material-symbols-outlined" style="font-size:16px;">arrow_back</span>
					</button>
					<button class="btn-card-edit" title="Move Right / Down" onclick="window.dashboardMoveCard(${catIndex}, ${cardIndex}, 1)">
						<span class="material-symbols-outlined" style="font-size:16px;">arrow_forward</span>
					</button>
					<button class="btn-card-edit" title="Change Category" onclick="window.dashboardChangeCategory(${catIndex}, ${cardIndex})">
						<span class="material-symbols-outlined" style="font-size:16px;">drive_file_move</span>
					</button>
					<button class="btn-card-edit btn-card-delete" title="Remove Card" onclick="window.dashboardRemoveCard(${catIndex}, ${cardIndex})">
						<span class="material-symbols-outlined" style="font-size:16px;">close</span>
					</button>
				</div>
			`;
		}

		const descIdAttr = template.descId ? `id="${template.descId}"` : '';
		return `
			<div class="metric-card" data-card-id="${cardId}">
				${editOverlay}
				<div class="card-top-row">
					<span class="card-label">${escapeHtml(template.title)}</span>
					<span class="material-symbols-outlined card-icon ${template.colorClass}">${template.icon}</span>
				</div>
				<div id="${template.valueId}" class="card-value">--</div>
				<div ${descIdAttr} class="card-desc">
					<span class="card-desc-highlight ${template.colorClass}">●</span>
					<span>${escapeHtml(template.desc)}</span>
				</div>
			</div>
		`;
	}

	/**
	 * Render pool of unused widgets in edit mode
	 */
	function renderUnusedPool() {
		const grid = document.getElementById('unusedWidgetsGrid');
		if (!grid) return;
		grid.innerHTML = '';

		const usedCards = new Set();
		if (currentLayout && currentLayout.categories) {
			currentLayout.categories.forEach(cat => {
				cat.cards.forEach(cardId => usedCards.add(cardId));
			});
		}

		const unusedCards = Object.keys(WIDGET_TEMPLATES).filter(cardId => !usedCards.has(cardId));

		if (unusedCards.length === 0) {
			grid.innerHTML = '<div style="grid-column: 1 / -1; color: var(--text-subtle); font-size: 0.85rem; padding: 1.5rem; text-align: center;">All widgets are currently placed in categories.</div>';
			return;
		}

		unusedCards.forEach(cardId => {
			const template = WIDGET_TEMPLATES[cardId];

			let catSelectOptions = currentLayout.categories.map((cat, idx) =>
				`<option value="${idx}">${escapeHtml(cat.name)}</option>`
			).join('');

			const cardEl = document.createElement('div');
			cardEl.className = 'unused-card';
			cardEl.innerHTML = `
				<span class="material-symbols-outlined card-icon ${template.colorClass}" style="font-size:28px;">${template.icon}</span>
				<div class="unused-card-info">
					<span class="card-label" style="font-size:0.85rem;">${escapeHtml(template.title)}</span>
					<span class="card-desc" style="font-size:0.75rem;">${escapeHtml(template.desc)}</span>
				</div>
				<div class="unused-card-controls">
					<select id="addSelect_${cardId}" class="unused-cat-select">
						${catSelectOptions}
					</select>
					<button class="btn-cat-action" style="padding: 0.25rem 0.6rem; font-size: 0.75rem;" onclick="window.dashboardAddCard('${cardId}')">
						<span class="material-symbols-outlined" style="font-size:14px;">add</span> Add
					</button>
				</div>
			`;
			grid.appendChild(cardEl);
		});
	}

	/**
	 * Toggle dashboard edit layout mode
	 */
	function toggleEditMode() {
		if (!window.currentUser || !window.currentUser.isAdmin) return;
		isEditing = !isEditing;

		const container = document.querySelector('.dashboard-container') || document.querySelector('main');
		if (isEditing) {
			container.classList.add('edit-active');
		} else {
			container.classList.remove('edit-active');
		}
		renderWidgets();
		updateStatus();
	}

	async function renameCategory(catIndex) {
		const cat = currentLayout.categories[catIndex];
		if (!cat) return;
		const newName = await showPrompt('Rename Category', 'Enter new category name:', cat.name);
		if (newName && newName.trim()) {
			cat.name = newName.trim();
			renderWidgets();
		}
	}

	async function deleteCategory(catIndex) {
		const cat = currentLayout.categories[catIndex];
		if (!cat) return;
		const confirmed = await showConfirm(
			'Delete Category',
			`Are you sure you want to delete category "${cat.name}"? Widgets inside will be returned to the pool.`,
			true
		);
		if (confirmed) {
			currentLayout.categories.splice(catIndex, 1);
			renderWidgets();
		}
	}

	async function addCategory() {
		const name = await showPrompt('Add New Category', 'Enter name for the new category:');
		if (name && name.trim()) {
			const newCat = {
				id: 'cat_' + Date.now(),
				name: name.trim(),
				cards: []
			};
			currentLayout.categories.push(newCat);
			renderWidgets();
		}
	}

	function removeCard(catIndex, cardIndex) {
		currentLayout.categories[catIndex].cards.splice(cardIndex, 1);
		renderWidgets();
		updateStatus();
	}

	function addCardToCategory(cardId) {
		const select = document.getElementById(`addSelect_${cardId}`);
		if (!select) return;
		const catIdx = parseInt(select.value, 10);
		if (isNaN(catIdx) || !currentLayout.categories[catIdx]) return;
		currentLayout.categories[catIdx].cards.push(cardId);
		renderWidgets();
		updateStatus();
	}

	function moveCard(catIndex, cardIndex, direction) {
		const cards = currentLayout.categories[catIndex].cards;
		const targetIndex = cardIndex + direction;
		if (targetIndex < 0 || targetIndex >= cards.length) return;

		const temp = cards[cardIndex];
		cards[cardIndex] = cards[targetIndex];
		cards[targetIndex] = temp;
		renderWidgets();
		updateStatus();
	}

	async function changeCardCategoryPrompt(catIndex, cardIndex) {
		const cardId = currentLayout.categories[catIndex].cards[cardIndex];
		const options = currentLayout.categories.map((cat, idx) => ({
			label: cat.name,
			value: idx
		}));

		if (window.CustomModal && typeof window.CustomModal.prompt === 'function') {
			const targetIdx = await window.CustomModal.prompt('Select destination category:', {
				title: 'Move Widget',
				inputType: 'dropdown',
				options: options,
				defaultValue: catIndex
			});

			if (targetIdx !== null && targetIdx !== undefined && currentLayout.categories[targetIdx]) {
				currentLayout.categories[catIndex].cards.splice(cardIndex, 1);
				currentLayout.categories[targetIdx].cards.push(cardId);
				renderWidgets();
				updateStatus();
			}
			return;
		}

		// Fallback
		const listText = currentLayout.categories.map((cat, idx) => `${idx}: ${cat.name}`).join('\n');
		const choice = prompt(`Select target category number:\n\n${listText}`, catIndex);
		if (choice === null) return;
		const chosenIdx = parseInt(choice, 10);
		if (isNaN(chosenIdx) || !currentLayout.categories[chosenIdx]) {
			alert('Invalid category selection.');
			return;
		}
		currentLayout.categories[catIndex].cards.splice(cardIndex, 1);
		currentLayout.categories[chosenIdx].cards.push(cardId);
		renderWidgets();
		updateStatus();
	}

	async function saveLayout() {
		try {
			const res = await fetch('/api/site/config', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(currentLayout)
			});
			if (res.ok) {
				backupLayout = JSON.parse(JSON.stringify(currentLayout));
				toggleEditMode();
				updateStatus();
				showAlert('Layout Saved', 'Dashboard layout updated successfully.', 'success');
			} else {
				showAlert('Save Error', 'Failed to save layout configuration. Server error.', 'error');
			}
		} catch (e) {
			showAlert('Save Error', 'Error saving layout: ' + e.message, 'error');
		}
	}

	function cancelEditLayout() {
		currentLayout = JSON.parse(JSON.stringify(backupLayout));
		toggleEditMode();
	}

	// Utility formatters
	function formatUptime(seconds) {
		const d = Math.floor(seconds / (3600 * 24));
		const h = Math.floor((seconds % (3600 * 24)) / 3600);
		const m = Math.floor((seconds % 3600) / 60);
		const s = Math.floor(seconds % 60);

		const parts = [];
		if (d > 0) parts.push(`${d}d`);
		if (h > 0) parts.push(`${h}h`);
		if (m > 0) parts.push(`${m}m`);
		parts.push(`${s}s`);

		return parts.join(' ');
	}

	function formatTimeAgo(timestamp) {
		const diff = Date.now() - timestamp;
		const mins = Math.floor(diff / 60000);
		if (mins < 1) return 'just now';
		if (mins < 60) return `${mins}m ago`;
		const hrs = Math.floor(mins / 60);
		if (hrs < 24) return `${hrs}h ago`;
		const days = Math.floor(hrs / 24);
		return `${days}d ago`;
	}

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
	 * Render reliability block grids with tooltips
	 */
	function renderBlocks(containerId, blocksData, isDaily) {
		const container = document.getElementById(containerId);
		if (!container) return;
		container.innerHTML = '';

		if (!blocksData || !blocksData.length) {
			for (let i = 0; i < 24; i++) {
				const block = document.createElement('div');
				block.className = 'block no-data';
				block.title = 'No heartbeat record';
				container.appendChild(block);
			}
			return;
		}

		blocksData.forEach((item, index) => {
			const block = document.createElement('div');
			block.className = `block ${item.status || 'no-data'}`;

			const timeframe = isDaily ? 'Day' : 'Hour';
			const unit = isDaily ? 'days' : 'hours';
			const count = 23 - index;
			const label = count === 0 ? `Current ${timeframe}` : `${count} ${unit} ago`;

			let tooltip = `${label}: `;
			if (item.status === 'active') {
				tooltip += isDaily ? '100% operational' : 'Operational (All checks passed)';
			} else if (item.status === 'degraded') {
				tooltip += isDaily ? 'Slightly degraded (>95% operational)' : 'Minor outage detected';
			} else if (item.status === 'down') {
				tooltip += 'Outage detected';
			} else {
				tooltip += 'No heartbeat recorded';
			}

			if (item.info) {
				tooltip += ` (${item.info})`;
			}

			block.title = tooltip;
			container.appendChild(block);
		});
	}

	/**
	 * Poll status API and update DOM elements
	 */
	async function updateStatus() {
		try {
			const res = await fetch('/api/status');
			if (!res.ok) throw new Error('API server returned status: ' + res.status);
			const data = await res.json();

			// Cache user globally
			window.currentUser = data.user;

			// Handle admin elements visibility
			const editLayoutBtn = document.getElementById('editLayoutBtn');
			if (editLayoutBtn) {
				if (data.user && data.user.isAdmin) {
					editLayoutBtn.style.display = isEditing ? 'none' : 'inline-flex';
				} else {
					editLayoutBtn.style.display = 'none';
				}
			}

			// Live status badge
			const liveStatusBadge = document.getElementById('liveStatusBadge');
			const liveStatusText = document.getElementById('liveStatusText');

			if (liveStatusBadge && liveStatusText) {
				liveStatusBadge.className = 'live-status-badge';
				if (data.online) {
					liveStatusBadge.classList.add('online');
					liveStatusText.innerText = 'ONLINE';
				} else if (data.status === 'starting') {
					liveStatusBadge.classList.add('starting');
					liveStatusText.innerText = 'STARTING';
				} else {
					liveStatusBadge.classList.add('offline');
					liveStatusText.innerText = 'OFFLINE';
				}
			}

			// Update metric raw values
			if (data.uptime !== undefined) {
				currentUptimeSeconds = data.uptime;
				lastFetchTime = Date.now();
				const elUptime = document.getElementById('metricUptime');
				if (elUptime) elUptime.innerText = formatUptime(currentUptimeSeconds);
			}

			const elServers = document.getElementById('metricServers');
			if (elServers) elServers.innerText = data.servers !== undefined ? `${data.servers} Active Guilds` : '0 Active Guilds';

			const elInstalls = document.getElementById('metricInstalls');
			if (elInstalls) elInstalls.innerText = data.installs !== undefined ? `${data.installs} User Installs` : '0 User Installs';

			const elEnv = document.getElementById('metricEnv');
			if (elEnv) elEnv.innerText = data.environment || 'Unknown';

			const elEnvDesc = document.getElementById('metricEnvDesc');
			if (elEnvDesc) {
				elEnvDesc.innerHTML = `
					<span class="card-desc-highlight text-tertiary">●</span>
					<span>${data.environment === 'Local PC' ? 'Running on developer machine' : 'Running on VPS Hosting'}</span>
				`;
			}

			const elPing = document.getElementById('metricPing');
			if (elPing) elPing.innerText = data.ping !== undefined ? `${data.ping} ms` : 'N/A';

			const elMem = document.getElementById('metricMemory');
			const elMemDesc = document.getElementById('metricMemoryDesc');
			if (data.memory && data.memory.heapUsed) {
				if (elMem) elMem.innerText = `${data.memory.heapUsed} MB`;
				if (elMemDesc) {
					elMemDesc.innerHTML = `
						<span class="card-desc-highlight text-secondary">●</span>
						<span>Heap limit: ${data.memory.heapTotal} MB</span>
					`;
				}
			} else {
				if (elMem) elMem.innerText = 'N/A';
				if (elMemDesc) {
					elMemDesc.innerHTML = `
						<span class="card-desc-highlight text-secondary">●</span>
						<span>Memory metrics unavailable</span>
					`;
				}
			}

			// Render reliability grids
			renderBlocks('hourlyReliability', data.hourlyBlocks, false);
			renderBlocks('dailyReliability', data.dailyBlocks, true);

			// Render outages log
			const logContainer = document.getElementById('outagesLogContainer');
			if (logContainer) {
				logContainer.innerHTML = '';
				if (data.outages && data.outages.length > 0) {
					data.outages.forEach(o => {
						const item = document.createElement('div');
						item.className = 'outage-item';

						const startStr = new Date(o.start).toLocaleString('en-US', {
							month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
						});
						const endStr = new Date(o.end).toLocaleTimeString('en-US', {
							hour: '2-digit', minute: '2-digit'
						});

						item.innerHTML = `
							<div>
								<span class="outage-time">${escapeHtml(startStr)} - ${escapeHtml(endStr)}</span>
								<span class="outage-time-ago">(${formatTimeAgo(o.start)})</span>
							</div>
							<span class="outage-duration">${o.durationMin} MIN DOWNTIME</span>
						`;
						logContainer.appendChild(item);
					});
				} else {
					logContainer.innerHTML = `
						<div class="outage-ok">
							<span class="material-symbols-outlined" style="font-size: 20px;">check_circle</span>
							<span>No downtime or outages detected in the last 24 days.</span>
						</div>
					`;
				}
			}

			initialLoadDone = true;
		} catch (err) {
			console.error('[Dashboard] Error polling status:', err);
			const liveStatusBadge = document.getElementById('liveStatusBadge');
			const liveStatusText = document.getElementById('liveStatusText');
			if (liveStatusBadge && liveStatusText) {
				liveStatusBadge.className = 'live-status-badge offline';
				liveStatusText.innerText = 'ERROR';
			}
		}
	}

	/**
	 * Client-side tick to update uptime second by second
	 */
	function tickUptime() {
		if (!currentUptimeSeconds || !lastFetchTime) return;
		const elapsedSeconds = (Date.now() - lastFetchTime) / 1000;
		const liveUptime = currentUptimeSeconds + elapsedSeconds;
		const el = document.getElementById('metricUptime');
		if (el) {
			el.innerText = formatUptime(liveUptime);
		}
	}

	// Expose globally for HTML event handlers
	window.dashboardToggleEdit = toggleEditMode;
	window.dashboardSaveLayout = saveLayout;
	window.dashboardCancelEdit = cancelEditLayout;
	window.dashboardAddCategory = addCategory;
	window.dashboardRenameCategory = renameCategory;
	window.dashboardDeleteCategory = deleteCategory;
	window.dashboardMoveCard = moveCard;
	window.dashboardRemoveCard = removeCard;
	window.dashboardChangeCategory = changeCardCategoryPrompt;
	window.dashboardAddCard = addCardToCategory;

	// Initialization
	function init() {
		fetchLayoutConfig();
		updateStatus();
		setInterval(updateStatus, POLL_INTERVAL);
		setInterval(tickUptime, 1000);
	}

	if (document.readyState === 'loading') {
		document.addEventListener('DOMContentLoaded', init);
	} else {
		init();
	}
})();
