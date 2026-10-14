/**
 * Fluffingiously Dragooon - Server Config Controller
 * Handles guild-level TempVC configuration, economy settings, diff comparisons, and unsaved changes tracking.
 */

(function () {
	'use strict';

	let guildId = null;
	let serverChannels = {
		voiceChannels: [],
		categories: [],
		textChannels: []
	};
	let originalConfig = null;

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
	 * Extract guild ID from pathname (/my_server/:id)
	 */
	function parseGuildId() {
		const parts = window.location.pathname.split('/').filter(Boolean);
		guildId = parts[parts.length - 1] || null;
		return guildId;
	}

	/**
	 * Toggle accordion config panels
	 */
	window.toggleConfigPanel = function (header) {
		const panel = header.closest('.config-panel');
		if (panel) {
			panel.classList.toggle('expanded');
		}
	};

	/**
	 * Channel & category name lookup formatters
	 */
	function getVoiceChannelName(id) {
		if (!id) return 'None (Disabled)';
		const ch = serverChannels.voiceChannels.find(c => c.id === id);
		return ch ? ch.name : id;
	}

	function getCategoryName(id) {
		if (!id) return 'None (Disabled)';
		const cat = serverChannels.categories.find(c => c.id === id);
		return cat ? cat.name : id;
	}

	function getTextChannelName(id) {
		if (!id) return 'None (Disabled)';
		const ch = serverChannels.textChannels.find(c => c.id === id);
		return ch ? ch.name : id;
	}

	/**
	 * Update status indicators (Enabled / Disabled) on panels
	 */
	function updateStatusIndicators() {
		const tempVCCreate = document.getElementById('tempVCCreateChannelSelect').value;
		const tempVCCategory = document.getElementById('tempVCCategorySelect').value;
		const tempVCBadge = document.getElementById('tempVCStatusBadge');

		if (tempVCBadge) {
			if (tempVCCreate && tempVCCategory) {
				tempVCBadge.textContent = 'Enabled';
				tempVCBadge.className = 'config-status-badge enabled';
			} else {
				tempVCBadge.textContent = 'Disabled';
				tempVCBadge.className = 'config-status-badge disabled';
			}
		}

		const levelUpType = document.getElementById('levelUpTypeSelect').value;
		const levelUpBadge = document.getElementById('levelUpStatusBadge');

		if (levelUpBadge) {
			if (levelUpType !== 'disabled') {
				levelUpBadge.textContent = 'Enabled';
				levelUpBadge.className = 'config-status-badge enabled';
			} else {
				levelUpBadge.textContent = 'Disabled';
				levelUpBadge.className = 'config-status-badge disabled';
			}
		}

		checkChanges();
	}

	/**
	 * Toggle level up channel selection visibility based on mode
	 */
	function toggleLevelUpChannelSelect() {
		const typeSelect = document.getElementById('levelUpTypeSelect');
		const group = document.getElementById('levelUpChannelGroup');
		if (!typeSelect || !group) return;

		if (typeSelect.value === 'channel') {
			group.style.display = 'flex';
		} else {
			group.style.display = 'none';
		}
		updateStatusIndicators();
	}

	/**
	 * Check for unsaved changes against originalConfig
	 */
	function checkChanges() {
		if (!originalConfig) return;

		const current = {
			tempVCCreateChannelId: document.getElementById('tempVCCreateChannelSelect').value || '',
			tempVCCategoryId: document.getElementById('tempVCCategorySelect').value || '',
			tempVCNameTemplate: document.getElementById('tempVCNameTemplateInput').value.trim(),
			levelUpType: document.getElementById('levelUpTypeSelect').value || 'popup',
			levelUpChannelId: document.getElementById('levelUpChannelSelect').value || ''
		};

		const tempVCChanged =
			current.tempVCCreateChannelId !== originalConfig.tempVCCreateChannelId ||
			current.tempVCCategoryId !== originalConfig.tempVCCategoryId ||
			current.tempVCNameTemplate !== originalConfig.tempVCNameTemplate;

		const levelingChanged =
			current.levelUpType !== originalConfig.levelUpType ||
			(current.levelUpType === 'channel' && current.levelUpChannelId !== originalConfig.levelUpChannelId);

		const hasAnyChanges = tempVCChanged || levelingChanged;

		// Update card edited pills
		const tempVCEditIndicator = document.getElementById('tempVCEditIndicator');
		if (tempVCEditIndicator) {
			tempVCEditIndicator.style.display = tempVCChanged ? 'inline-flex' : 'none';
		}

		const levelingEditIndicator = document.getElementById('levelingEditIndicator');
		if (levelingEditIndicator) {
			levelingEditIndicator.style.display = levelingChanged ? 'inline-flex' : 'none';
		}

		// Update floating alert bar
		const unsavedBar = document.getElementById('unsavedChangesBar');
		if (unsavedBar) {
			if (hasAnyChanges) {
				unsavedBar.classList.add('active');
			} else {
				unsavedBar.classList.remove('active');
			}
		}
	}

	/**
	 * Discard all changes and restore original cached values
	 */
	function discardAllChanges() {
		if (!originalConfig) return;

		document.getElementById('tempVCCreateChannelSelect').value = originalConfig.tempVCCreateChannelId;
		document.getElementById('tempVCCategorySelect').value = originalConfig.tempVCCategoryId;
		document.getElementById('tempVCNameTemplateInput').value = originalConfig.tempVCNameTemplate;
		document.getElementById('levelUpTypeSelect').value = originalConfig.levelUpType;

		toggleLevelUpChannelSelect();

		document.getElementById('levelUpChannelSelect').value = originalConfig.levelUpChannelId;

		checkChanges();

		if (typeof CustomModal !== 'undefined') {
			CustomModal.toast('Changes discarded', { type: 'info', duration: 2000 });
		}
	}

	/**
	 * Fetch configurations for this server
	 */
	async function fetchServerConfig() {
		if (!guildId) return;

		try {
			const createSelect = document.getElementById('tempVCCreateChannelSelect');
			const categorySelect = document.getElementById('tempVCCategorySelect');
			const nameInput = document.getElementById('tempVCNameTemplateInput');
			const levelUpTypeSelect = document.getElementById('levelUpTypeSelect');
			const levelUpChannelSelect = document.getElementById('levelUpChannelSelect');

			const res = await fetch(`/api/guild/config?guildId=${encodeURIComponent(guildId)}`);
			if (!res.ok) throw new Error(`HTTP error ${res.status}`);
			const data = await res.json();

			// Title and guild label
			const titleEl = document.getElementById('serverConfigTitle');
			if (titleEl) {
				titleEl.textContent = `Manage - ${data.guildName || 'Server'}`;
			}

			serverChannels = {
				voiceChannels: data.voiceChannels || [],
				categories: data.categories || [],
				textChannels: data.textChannels || []
			};

			// Voice Channels select
			createSelect.innerHTML = '<option value="">None (Disabled)</option>';
			if (serverChannels.voiceChannels.length > 0) {
				serverChannels.voiceChannels.forEach(ch => {
					const opt = document.createElement('option');
					opt.value = ch.id;
					opt.textContent = ch.name;
					if (ch.id === data.config.tempVCCreateChannelId) opt.selected = true;
					createSelect.appendChild(opt);
				});
			} else {
				const opt = document.createElement('option');
				opt.value = '';
				opt.textContent = 'No voice channels found';
				opt.disabled = true;
				createSelect.appendChild(opt);
			}

			// Categories select
			categorySelect.innerHTML = '<option value="">None (Disabled)</option>';
			if (serverChannels.categories.length > 0) {
				serverChannels.categories.forEach(cat => {
					const opt = document.createElement('option');
					opt.value = cat.id;
					opt.textContent = cat.name;
					if (cat.id === data.config.tempVCCategoryId) opt.selected = true;
					categorySelect.appendChild(opt);
				});
			} else {
				const opt = document.createElement('option');
				opt.value = '';
				opt.textContent = 'No categories found';
				opt.disabled = true;
				categorySelect.appendChild(opt);
			}

			// Text Channels select
			levelUpChannelSelect.innerHTML = '<option value="">None (Disabled)</option>';
			if (serverChannels.textChannels.length > 0) {
				serverChannels.textChannels.forEach(ch => {
					const opt = document.createElement('option');
					opt.value = ch.id;
					opt.textContent = ch.name;
					if (ch.id === data.config.levelUpChannelId) opt.selected = true;
					levelUpChannelSelect.appendChild(opt);
				});
			} else {
				const opt = document.createElement('option');
				opt.value = '';
				opt.textContent = 'No text channels found';
				opt.disabled = true;
				levelUpChannelSelect.appendChild(opt);
			}

			// Name Template
			nameInput.value = data.config.tempVCNameTemplate || '';

			// Leveling config
			levelUpTypeSelect.value = data.config.levelUpType || 'popup';
			toggleLevelUpChannelSelect();

			// Cache original
			originalConfig = {
				tempVCCreateChannelId: data.config.tempVCCreateChannelId || '',
				tempVCCategoryId: data.config.tempVCCategoryId || '',
				tempVCNameTemplate: data.config.tempVCNameTemplate || '',
				levelUpType: data.config.levelUpType || 'popup',
				levelUpChannelId: data.config.levelUpChannelId || ''
			};

			checkChanges();
		} catch (err) {
			console.error('[ServerConfig] Error fetching config:', err);
			if (typeof CustomModal !== 'undefined') {
				await CustomModal.alert(`Failed to load server configurations: ${err.message}`, { type: 'error' });
			}
			window.location.href = '/my_server';
		}
	}

	/**
	 * Prepare and display save confirmation dialog with diff
	 */
	function showSaveConfirmation() {
		if (!originalConfig) return;

		const nameTemplate = document.getElementById('tempVCNameTemplateInput').value.trim();
		if (nameTemplate.length > 80) {
			if (typeof CustomModal !== 'undefined') {
				CustomModal.toast('Name template exceeds maximum length of 80 characters.', { type: 'warning' });
			}
			return;
		}

		const current = {
			tempVCCreateChannelId: document.getElementById('tempVCCreateChannelSelect').value || '',
			tempVCCategoryId: document.getElementById('tempVCCategorySelect').value || '',
			tempVCNameTemplate: nameTemplate,
			levelUpType: document.getElementById('levelUpTypeSelect').value || 'popup',
			levelUpChannelId: document.getElementById('levelUpChannelSelect').value || ''
		};

		const container = document.getElementById('comparisonContainer');
		if (!container) return;
		container.innerHTML = '';

		const changes = [];

		if (current.tempVCCreateChannelId !== originalConfig.tempVCCreateChannelId) {
			changes.push({
				field: 'Voice Channel to Create Temp VC',
				oldVal: getVoiceChannelName(originalConfig.tempVCCreateChannelId),
				newVal: getVoiceChannelName(current.tempVCCreateChannelId)
			});
		}

		if (current.tempVCCategoryId !== originalConfig.tempVCCategoryId) {
			changes.push({
				field: 'Category for Temporary VCs',
				oldVal: getCategoryName(originalConfig.tempVCCategoryId),
				newVal: getCategoryName(current.tempVCCategoryId)
			});
		}

		if (current.tempVCNameTemplate !== originalConfig.tempVCNameTemplate) {
			changes.push({
				field: 'Default Room Name Template',
				oldVal: originalConfig.tempVCNameTemplate || 'None (Default)',
				newVal: current.tempVCNameTemplate || 'None (Default)'
			});
		}

		if (current.levelUpType !== originalConfig.levelUpType) {
			const map = { popup: 'Popup in Same Channel', channel: 'Specific Text Channel', disabled: 'Disabled' };
			changes.push({
				field: 'Level Up Alert Type',
				oldVal: map[originalConfig.levelUpType] || originalConfig.levelUpType,
				newVal: map[current.levelUpType] || current.levelUpType
			});
		}

		if (current.levelUpType === 'channel' && current.levelUpChannelId !== originalConfig.levelUpChannelId) {
			changes.push({
				field: 'Specific Level Up Channel',
				oldVal: getTextChannelName(originalConfig.levelUpChannelId),
				newVal: getTextChannelName(current.levelUpChannelId)
			});
		}

		if (changes.length === 0) {
			if (typeof CustomModal !== 'undefined') {
				CustomModal.toast('No changes detected to save.', { type: 'info' });
			}
			return;
		}

		changes.forEach(c => {
			const row = document.createElement('div');
			row.className = 'comparison-row';
			row.innerHTML = `
				<span class="comparison-field">${escapeHtml(c.field)}</span>
				<div class="comparison-diff">
					<span class="diff-old">${escapeHtml(c.oldVal)}</span>
					<span class="diff-arrow material-symbols-outlined">arrow_forward</span>
					<span class="diff-new">${escapeHtml(c.newVal)}</span>
				</div>
			`;
			container.appendChild(row);
		});

		const modal = document.getElementById('confirmSaveModal');
		if (modal) modal.classList.add('active');
	}

	function closeSaveConfirmation() {
		const modal = document.getElementById('confirmSaveModal');
		if (modal) modal.classList.remove('active');
	}

	/**
	 * Perform save POST request
	 */
	async function executeSaveConfig() {
		const saveBtn = document.getElementById('confirmSaveBtn');
		const createChannelId = document.getElementById('tempVCCreateChannelSelect').value;
		const categoryId = document.getElementById('tempVCCategorySelect').value;
		const nameTemplate = document.getElementById('tempVCNameTemplateInput').value.trim();
		const levelUpType = document.getElementById('levelUpTypeSelect').value;
		const levelUpChannelId = document.getElementById('levelUpChannelSelect').value;

		if (saveBtn) {
			saveBtn.disabled = true;
			saveBtn.textContent = 'Saving...';
		}

		try {
			const res = await fetch('/api/guild/config', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					guildId: guildId,
					tempVCCreateChannelId: createChannelId || null,
					tempVCCategoryId: categoryId || null,
					tempVCNameTemplate: nameTemplate || null,
					levelUpType: levelUpType || 'popup',
					levelUpChannelId: levelUpChannelId || null
				})
			});

			if (!res.ok) {
				const errData = await res.json().catch(() => ({}));
				throw new Error(errData.error || 'Failed to save settings');
			}

			// Update cached original
			originalConfig = {
				tempVCCreateChannelId: createChannelId || '',
				tempVCCategoryId: categoryId || '',
				tempVCNameTemplate: nameTemplate,
				levelUpType: levelUpType || 'popup',
				levelUpChannelId: levelUpChannelId || ''
			};

			closeSaveConfirmation();
			checkChanges();

			if (typeof CustomModal !== 'undefined') {
				CustomModal.toast('Server configurations saved successfully!', { type: 'success' });
			}
		} catch (err) {
			console.error('[ServerConfig] Save error:', err);
			if (typeof CustomModal !== 'undefined') {
				CustomModal.toast(`Error saving configuration: ${err.message}`, { type: 'error' });
			}
		} finally {
			if (saveBtn) {
				saveBtn.disabled = false;
				saveBtn.textContent = 'Confirm & Save';
			}
		}
	}

	/**
	 * Setup event listeners
	 */
	function setupListeners() {
		const createSelect = document.getElementById('tempVCCreateChannelSelect');
		const catSelect = document.getElementById('tempVCCategorySelect');
		const nameInput = document.getElementById('tempVCNameTemplateInput');
		const levelTypeSelect = document.getElementById('levelUpTypeSelect');
		const levelChSelect = document.getElementById('levelUpChannelSelect');

		if (createSelect) createSelect.addEventListener('change', updateStatusIndicators);
		if (catSelect) catSelect.addEventListener('change', updateStatusIndicators);
		if (nameInput) nameInput.addEventListener('input', checkChanges);
		if (levelTypeSelect) levelTypeSelect.addEventListener('change', toggleLevelUpChannelSelect);
		if (levelChSelect) levelChSelect.addEventListener('change', checkChanges);

		// Save triggers
		const saveBtn = document.getElementById('saveConfigBtn');
		if (saveBtn) saveBtn.addEventListener('click', showSaveConfirmation);

		const unsavedSaveBtn = document.getElementById('unsavedSaveBtn');
		if (unsavedSaveBtn) unsavedSaveBtn.addEventListener('click', showSaveConfirmation);

		const unsavedResetBtn = document.getElementById('unsavedResetBtn');
		if (unsavedResetBtn) unsavedResetBtn.addEventListener('click', discardAllChanges);

		// Confirmation dialog controls
		const modalClose = document.getElementById('confirmSaveModalClose');
		if (modalClose) modalClose.addEventListener('click', closeSaveConfirmation);

		const modalCancel = document.getElementById('confirmSaveModalCancel');
		if (modalCancel) modalCancel.addEventListener('click', closeSaveConfirmation);

		const modalConfirm = document.getElementById('confirmSaveBtn');
		if (modalConfirm) modalConfirm.addEventListener('click', executeSaveConfig);
	}

	if (document.readyState === 'loading') {
		document.addEventListener('DOMContentLoaded', () => {
			parseGuildId();
			setupListeners();
			fetchServerConfig();
		});
	} else {
		parseGuildId();
		setupListeners();
		fetchServerConfig();
	}
})();
