/**
 * Fluffingiously Dragooon - My Config Controller
 * Handles user profile rank preferences, Discord Role Connections, and Social SDK sync.
 */

(function () {
	'use strict';

	let currentUser = null;
	let pageRankDropdownInstance = null;

	const RANK_LABELS = {
		"bot dev": "Bot Dev",
		"den boundless resident": "Den Boundless Resident",
		"den disciple echoing": "Den Disciple Echoing",
		"den journeyer": "Den Journeyer",
		"den member": "Den Member",
		"member": "Member"
	};

	/**
	 * Safe modal alert with standard fallback
	 */
	async function notifyUser(message, title = 'Notification', type = 'info') {
		if (window.CustomModal && typeof window.CustomModal.alert === 'function') {
			return await window.CustomModal.alert(message, { title, type });
		}
		alert(`${title}\n\n${message}`);
	}

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
	 * Count and display active connection sync fields
	 */
	function updateActiveSyncCount() {
		const toggleIds = ['syncLevel', 'syncXP', 'syncAchievements', 'syncMessages', 'syncEmojis', 'syncStickers'];
		let activeCount = 0;
		toggleIds.forEach(id => {
			const el = document.getElementById(id);
			if (el && el.checked) activeCount++;
		});

		const statSyncEl = document.getElementById('statActiveSyncCount');
		if (statSyncEl) {
			statSyncEl.textContent = `${activeCount} / 6`;
		}
	}

	/**
	 * Load user profile and configuration state from server
	 */
	async function loadUserProfile() {
		try {
			const res = await fetch('/api/status');
			if (!res.ok) throw new Error('API server returned status: ' + res.status);
			const data = await res.json();

			if (!data.user) {
				window.location.href = '/dashboard';
				return;
			}

			currentUser = data.user;

			// Update Profile Preview Card
			const configAvatar = document.getElementById('configAvatar');
			const configUsername = document.getElementById('configUsername');
			const configRankText = document.getElementById('configRankText');

			if (configAvatar) {
				configAvatar.src = data.user.avatarUrl || 'https://cdn.discordapp.com/embed/avatars/0.png';
			}
			if (configUsername) {
				configUsername.textContent = data.user.username || 'User';
			}
			if (configRankText) {
				configRankText.textContent = (data.user.displayRank || data.user.rankText || 'No custom rank active').toUpperCase();
			}

			// Overview Stat Badges
			const statRank = document.getElementById('statCurrentRank');
			const statEligible = document.getElementById('statEligibleCount');

			if (statRank) {
				const currentRank = data.user.displayRank || data.user.rank || 'MEMBER';
				statRank.textContent = (RANK_LABELS[currentRank.toLowerCase()] || currentRank).toUpperCase();
			}
			if (statEligible) {
				statEligible.textContent = (data.user.eligibleRanks && data.user.eligibleRanks.length) || 0;
			}

			// =========================================================================
			// ARCHITECTURAL EXAMPLE: Using CustomModal.createDropdown
			// Mounts a Stitch Obsidian custom dropdown with search, tags, and chevron
			// =========================================================================
			const rankDropdownContainer = document.getElementById('pageRankDropdown');
			const rankOptions = (data.user.eligibleRanks && data.user.eligibleRanks.length > 0)
				? data.user.eligibleRanks.map(rank => ({
					label: (RANK_LABELS[rank.toLowerCase()] || rank).toUpperCase(),
					value: rank
				}))
				: [{ label: 'None (Default)', value: '' }];

			if (rankDropdownContainer && window.CustomModal && typeof window.CustomModal.createDropdown === 'function') {
				pageRankDropdownInstance = window.CustomModal.createDropdown(rankDropdownContainer, {
					options: rankOptions,
					defaultValue: data.user.displayRank || '',
					placeholder: 'Select active display rank...',
					hiddenInputId: 'pageRankSelect',
					onChange: (chosenRank) => {
						// Live preview text update
						const previewText = chosenRank ? (RANK_LABELS[chosenRank.toLowerCase()] || chosenRank) : 'None (Default)';
						if (configRankText) {
							configRankText.textContent = previewText.toUpperCase();
						}
					}
				});
			}

			// Populate Connection Widget Toggles
			const conn = data.user.connectionsConfig || {
				syncLevel: true,
				syncXP: true,
				syncAchievements: true,
				syncMessages: true,
				syncEmojis: true,
				syncStickers: true
			};

			const setCheck = (id, val) => {
				const el = document.getElementById(id);
				if (el) el.checked = val !== false;
			};

			setCheck('syncLevel', conn.syncLevel);
			setCheck('syncXP', conn.syncXP);
			setCheck('syncAchievements', conn.syncAchievements);
			setCheck('syncMessages', conn.syncMessages);
			setCheck('syncEmojis', conn.syncEmojis);
			setCheck('syncStickers', conn.syncStickers);

			updateActiveSyncCount();

		} catch (err) {
			console.error('[MyConfig] Failed to load session status:', err);
		}
	}

	/**
	 * Live preview of rank dropdown selection
	 */
	function previewPageRankChange() {
		const pageRankSelect = document.getElementById('pageRankSelect');
		const chosen = (pageRankDropdownInstance && typeof pageRankDropdownInstance.getValue === 'function')
			? pageRankDropdownInstance.getValue() 
			: (pageRankSelect ? pageRankSelect.value : '');
		const previewText = chosen ? (RANK_LABELS[chosen.toLowerCase()] || chosen) : 'None (Default)';
		const configRankText = document.getElementById('configRankText');
		if (configRankText) {
			configRankText.textContent = previewText.toUpperCase();
		}
	}

	/**
	 * Save Profile Display Rank
	 */
	async function savePageRankConfig() {
		const saveBtn = document.getElementById('btnSaveRank');
		const pageRankSelect = document.getElementById('pageRankSelect');
		const chosenRank = (pageRankDropdownInstance && typeof pageRankDropdownInstance.getValue === 'function')
			? pageRankDropdownInstance.getValue() 
			: (pageRankSelect ? pageRankSelect.value : '');
		const originalText = saveBtn ? saveBtn.innerHTML : '';

		if (saveBtn) {
			saveBtn.disabled = true;
			saveBtn.innerHTML = '<span class="material-symbols-outlined" style="font-size:18px;">hourglass_top</span><span>Saving...</span>';
		}

		try {
			const res = await fetch('/api/user/config', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ displayRank: chosenRank })
			});

			if (!res.ok) {
				throw new Error(`Failed to save settings: HTTP ${res.status}`);
			}

			if (currentUser) {
				currentUser.displayRank = chosenRank;
				currentUser.rank = chosenRank.toUpperCase();
				currentUser.rankText = chosenRank.toUpperCase();

				const sidebarRank = document.getElementById('sidebarUserRank');
				if (sidebarRank) sidebarRank.textContent = (chosenRank || 'MEMBER').toUpperCase();

				const statRank = document.getElementById('statCurrentRank');
				if (statRank) {
					statRank.textContent = (RANK_LABELS[chosenRank.toLowerCase()] || chosenRank || 'MEMBER').toUpperCase();
				}
			}

			await notifyUser('Your role rank preference has been saved and updated across the dashboard!', 'Rank Updated', 'success');
		} catch (err) {
			console.error('[MyConfig] Error saving rank config:', err);
			await notifyUser('Unable to save rank choice: ' + err.message, 'Save Failed', 'error');
		} finally {
			if (saveBtn) {
				saveBtn.disabled = false;
				saveBtn.innerHTML = originalText;
			}
		}
	}

	/**
	 * Save Discord Profile Connection and Social SDK widget configurations
	 */
	async function saveConnectionsConfig() {
		const saveBtn = document.getElementById('btnSaveConnections');
		const originalText = saveBtn ? saveBtn.innerHTML : '';

		const config = {
			connectionsConfig: {
				syncLevel: !!document.getElementById('syncLevel')?.checked,
				syncXP: !!document.getElementById('syncXP')?.checked,
				syncAchievements: !!document.getElementById('syncAchievements')?.checked,
				syncMessages: !!document.getElementById('syncMessages')?.checked,
				syncEmojis: !!document.getElementById('syncEmojis')?.checked,
				syncStickers: !!document.getElementById('syncStickers')?.checked
			}
		};

		if (saveBtn) {
			saveBtn.disabled = true;
			saveBtn.innerHTML = '<span class="material-symbols-outlined" style="font-size:18px;">sync</span><span>Syncing with Discord...</span>';
		}

		try {
			const res = await fetch('/api/user/connections-config', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(config)
			});

			if (!res.ok) {
				throw new Error(`Server returned HTTP ${res.status}`);
			}

			const result = await res.json();
			let feedbackMsg = 'Configuration saved.';
			let modalType = 'success';

			if (result.roleConnectionSuccess && result.widgetSuccess) {
				feedbackMsg = 'Live metrics successfully synchronized with both Discord Role Connections and your Custom Profile Widget!';
			} else if (result.roleConnectionSuccess) {
				feedbackMsg = 'Live metrics successfully synchronized with Discord Role Connections!';
			} else if (result.widgetSuccess) {
				feedbackMsg = 'Live metrics successfully synchronized with your Custom Profile Widget!';
			} else {
				feedbackMsg = 'Preferences saved locally, but connection sync to Discord APIs is temporarily unavailable.';
				modalType = 'warning';
			}

			updateActiveSyncCount();
			await notifyUser(feedbackMsg, 'Discord Sync Complete', modalType);
		} catch (err) {
			console.error('[MyConfig] Error saving connection config:', err);
			await notifyUser('Failed to synchronize with Discord: ' + err.message, 'Sync Error', 'error');
		} finally {
			if (saveBtn) {
				saveBtn.disabled = false;
				saveBtn.innerHTML = originalText;
			}
		}
	}

	/**
	 * Setup event bindings
	 */
	function setupEventListeners() {
		const pageRankSelect = document.getElementById('pageRankSelect');
		if (pageRankSelect) {
			pageRankSelect.addEventListener('change', previewPageRankChange);
		}

		const btnSaveRank = document.getElementById('btnSaveRank');
		if (btnSaveRank) {
			btnSaveRank.addEventListener('click', savePageRankConfig);
		}

		const btnSaveConnections = document.getElementById('btnSaveConnections');
		if (btnSaveConnections) {
			btnSaveConnections.addEventListener('click', saveConnectionsConfig);
		}

		// Listen to all toggle inputs to update counter live
		const toggleIds = ['syncLevel', 'syncXP', 'syncAchievements', 'syncMessages', 'syncEmojis', 'syncStickers'];
		toggleIds.forEach(id => {
			const el = document.getElementById(id);
			if (el) {
				el.addEventListener('change', updateActiveSyncCount);
			}
		});

		// Expose functions for inline access if needed
		window.previewPageRankChange = previewPageRankChange;
		window.savePageRankConfig = savePageRankConfig;
		window.saveConnectionsConfig = saveConnectionsConfig;
	}

	// Initialization
	if (document.readyState === 'loading') {
		document.addEventListener('DOMContentLoaded', () => {
			setupEventListeners();
			loadUserProfile();
		});
	} else {
		setupEventListeners();
		loadUserProfile();
	}
})();
