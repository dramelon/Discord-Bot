/**
 * Fluffingiously Dragooon - My Server Controller
 * Handles server listing, instant search & status filtering, fallback icons, and error handling.
 */

(function () {
	'use strict';

	let managedGuilds = [];
	let inviteableGuilds = [];
	let currentFilter = 'all';
	let searchQuery = '';

	/**
	 * Extract initials for servers without custom icons
	 */
	function getInitials(name) {
		if (!name) return 'SRV';
		return name
			.split(/\s+/)
			.filter(Boolean)
			.map(word => word.charAt(0))
			.join('')
			.substring(0, 3)
			.toUpperCase() || 'SRV';
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
	 * Render skeleton loaders in containers while fetching
	 */
	function renderSkeletons() {
		const managedContainer = document.getElementById('managedGuildsContainer');
		const inviteContainer = document.getElementById('inviteGuildsContainer');

		const skeletonHtml = Array(3).fill(0).map(() => `
			<div class="skeleton-card">
				<div class="skeleton-shimmer"></div>
				<div class="server-meta-group">
					<div class="skeleton-avatar"></div>
					<div class="skeleton-lines">
						<div class="skeleton-line short"></div>
						<div class="skeleton-line mini"></div>
					</div>
				</div>
				<div class="skeleton-btn"></div>
			</div>
		`).join('');

		if (managedContainer) managedContainer.innerHTML = skeletonHtml;
		if (inviteContainer) inviteContainer.innerHTML = skeletonHtml;
	}

	/**
	 * Create single server card markup
	 */
	function createServerCardHtml(guild, isInviteable = false) {
		const safeName = escapeHtml(guild.name);
		const initials = getInitials(guild.name);

		let avatarHtml = '';
		if (guild.iconUrl) {
			avatarHtml = `
				<div class="server-avatar-wrap">
					<img src="${guild.iconUrl}" alt="${safeName}" class="server-avatar-img" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';">
					<div class="server-avatar-initials" style="display: none;">${initials}</div>
					<span class="server-presence-dot ${isInviteable ? 'inviteable' : ''}"></span>
				</div>
			`;
		} else {
			avatarHtml = `
				<div class="server-avatar-wrap">
					<div class="server-avatar-initials">${initials}</div>
					<span class="server-presence-dot ${isInviteable ? 'inviteable' : ''}"></span>
				</div>
			`;
		}

		let badgeHtml = '';
		let actionHtml = '';

		if (!isInviteable) {
			if (guild.isConfigured) {
				badgeHtml = `<span class="server-badge configured"><span class="badge-dot"></span>Configured</span>`;
			} else {
				badgeHtml = `<span class="server-badge needs-setup"><span class="badge-dot"></span>Setup Required</span>`;
			}
			actionHtml = `
				<a href="/my_server/${guild.id}" class="btn-server-action btn-manage" title="Manage ${safeName}">
					<span class="material-symbols-outlined" style="font-size:16px;">tune</span>
					<span>Manage</span>
				</a>
			`;
		} else {
			badgeHtml = `<span class="server-badge inviteable"><span class="badge-dot"></span>Permission Available</span>`;
			const inviteUrl = guild.inviteUrl || '#';
			actionHtml = `
				<a href="${inviteUrl}" target="_blank" rel="noopener noreferrer" class="btn-server-action btn-invite" title="Invite Bot to ${safeName}">
					<span class="material-symbols-outlined" style="font-size:16px;">open_in_new</span>
					<span>Invite Bot</span>
				</a>
			`;
		}

		return `
			<div class="server-card">
				<div class="server-meta-group">
					${avatarHtml}
					<div class="server-details">
						<h4 class="server-name" title="${safeName}">${safeName}</h4>
						${badgeHtml}
					</div>
				</div>
				${actionHtml}
			</div>
		`;
	}

	/**
	 * Apply search query and category filters to render results
	 */
	function applyFiltersAndRender() {
		const query = searchQuery.trim().toLowerCase();
		const managedSection = document.getElementById('managedSectionPanel');
		const inviteSection = document.getElementById('inviteSectionPanel');
		const managedContainer = document.getElementById('managedGuildsContainer');
		const inviteContainer = document.getElementById('inviteGuildsContainer');
		const managedCountBadge = document.getElementById('managedCountBadge');
		const inviteCountBadge = document.getElementById('inviteCountBadge');

		// 1. Filter Managed
		let filteredManaged = managedGuilds.filter(g => {
			const matchesSearch = !query || (g.name && g.name.toLowerCase().includes(query));
			if (!matchesSearch) return false;

			if (currentFilter === 'inviteable') return false;
			if (currentFilter === 'configured') return !!g.isConfigured;
			if (currentFilter === 'setup') return !g.isConfigured;
			return true; // 'all' or 'managed'
		});

		// 2. Filter Inviteable
		let filteredInviteable = inviteableGuilds.filter(g => {
			const matchesSearch = !query || (g.name && g.name.toLowerCase().includes(query));
			if (!matchesSearch) return false;

			if (currentFilter === 'managed' || currentFilter === 'configured' || currentFilter === 'setup') return false;
			return true; // 'all' or 'inviteable'
		});

		// Update section count badges
		if (managedCountBadge) managedCountBadge.textContent = filteredManaged.length;
		if (inviteCountBadge) inviteCountBadge.textContent = filteredInviteable.length;

		// Section visibility based on filter selection
		if (managedSection) {
			managedSection.style.display = (currentFilter === 'inviteable') ? 'none' : 'flex';
		}
		if (inviteSection) {
			inviteSection.style.display = (currentFilter === 'managed' || currentFilter === 'configured' || currentFilter === 'setup') ? 'none' : 'flex';
		}

		// Render Managed Grid
		if (managedContainer) {
			if (filteredManaged.length > 0) {
				managedContainer.innerHTML = filteredManaged.map(g => createServerCardHtml(g, false)).join('');
			} else {
				const isSearching = !!query;
				managedContainer.innerHTML = `
					<div class="server-empty-state">
						<span class="material-symbols-outlined server-empty-icon">dns</span>
						<h4 class="server-empty-title">${isSearching ? 'No Matching Active Servers' : 'No Active Bot Servers'}</h4>
						<p class="server-empty-desc">${isSearching ? 'No servers where the bot is joined match your search query.' : 'You do not currently manage any servers with the bot active.'}</p>
					</div>
				`;
			}
		}

		// Render Inviteable Grid
		if (inviteContainer) {
			if (filteredInviteable.length > 0) {
				inviteContainer.innerHTML = filteredInviteable.map(g => createServerCardHtml(g, true)).join('');
			} else {
				const isSearching = !!query;
				inviteContainer.innerHTML = `
					<div class="server-empty-state">
						<span class="material-symbols-outlined server-empty-icon">add_to_photos</span>
						<h4 class="server-empty-title">${isSearching ? 'No Matching Inviteable Servers' : 'No Eligible Servers'}</h4>
						<p class="server-empty-desc">${isSearching ? 'No eligible servers match your search query.' : 'You do not have Manage Server permissions on any external servers ready to invite.'}</p>
					</div>
				`;
			}
		}
	}

	/**
	 * Update the quick stats overview widgets
	 */
	function updateSummaryStats() {
		const totalManaged = managedGuilds.length;
		const totalConfigured = managedGuilds.filter(g => g.isConfigured).length;
		const totalSetupNeeded = totalManaged - totalConfigured;
		const totalInviteable = inviteableGuilds.length;
		const totalAll = totalManaged + totalInviteable;

		const statTotal = document.getElementById('statTotalCount');
		const statManaged = document.getElementById('statManagedCount');
		const statConfigured = document.getElementById('statConfiguredCount');
		const statInviteable = document.getElementById('statInviteableCount');

		if (statTotal) statTotal.textContent = totalAll;
		if (statManaged) statManaged.textContent = totalManaged;
		if (statConfigured) statConfigured.textContent = totalConfigured;
		if (statInviteable) statInviteable.textContent = totalInviteable;

		// Update filter tab count badges
		const filterAllCount = document.getElementById('filterAllCount');
		const filterManagedCount = document.getElementById('filterManagedCount');
		const filterConfiguredCount = document.getElementById('filterConfiguredCount');
		const filterSetupCount = document.getElementById('filterSetupCount');
		const filterInviteCount = document.getElementById('filterInviteCount');

		if (filterAllCount) filterAllCount.textContent = totalAll;
		if (filterManagedCount) filterManagedCount.textContent = totalManaged;
		if (filterConfiguredCount) filterConfiguredCount.textContent = totalConfigured;
		if (filterSetupCount) filterSetupCount.textContent = totalSetupNeeded;
		if (filterInviteCount) filterInviteCount.textContent = totalInviteable;
	}

	/**
	 * Fetch guilds from server API
	 */
	async function loadServers() {
		renderSkeletons();

		try {
			const res = await fetch('/api/user/guilds');
			if (!res.ok) {
				throw new Error(`Server returned HTTP ${res.status}: ${res.statusText}`);
			}
			const data = await res.json();

			managedGuilds = Array.isArray(data.managed) ? data.managed : [];
			inviteableGuilds = Array.isArray(data.inviteable) ? data.inviteable : [];

			updateSummaryStats();
			applyFiltersAndRender();
		} catch (err) {
			console.error('[MyServer] Failed to load guilds:', err);
			showErrorState(err.message || 'Unable to connect to guild integration API');
		}
	}

	/**
	 * Render error state in containers with retry action
	 */
	function showErrorState(errorMsg) {
		const managedContainer = document.getElementById('managedGuildsContainer');
		const inviteContainer = document.getElementById('inviteGuildsContainer');

		const errorHtml = `
			<div class="server-empty-state" style="border-color: rgba(239, 68, 68, 0.3);">
				<span class="material-symbols-outlined server-empty-icon" style="color: var(--status-error);">error</span>
				<h4 class="server-empty-title" style="color: var(--status-error);">Failed to Load Server Integrations</h4>
				<p class="server-empty-desc">${escapeHtml(errorMsg)}</p>
				<button class="btn-retry-fetch" onclick="window.retryLoadServers()">
					<span class="material-symbols-outlined" style="font-size:16px;">refresh</span>
					<span>Retry Connection</span>
				</button>
			</div>
		`;

		if (managedContainer) managedContainer.innerHTML = errorHtml;
		if (inviteContainer) inviteContainer.innerHTML = '';
	}

	/**
	 * Event listeners setup
	 */
	function setupEventListeners() {
		const searchInput = document.getElementById('serverSearchInput');
		if (searchInput) {
			searchInput.addEventListener('input', (e) => {
				searchQuery = e.target.value || '';
				applyFiltersAndRender();
			});
		}

		const filterTabs = document.querySelectorAll('.filter-tab');
		filterTabs.forEach(tab => {
			tab.addEventListener('click', () => {
				filterTabs.forEach(t => t.classList.remove('active'));
				tab.classList.add('active');
				currentFilter = tab.getAttribute('data-filter') || 'all';
				applyFiltersAndRender();
			});
		});

		// Expose retry function globally for inline retry button
		window.retryLoadServers = () => {
			loadServers();
		};
	}

	// Initialization
	if (document.readyState === 'loading') {
		document.addEventListener('DOMContentLoaded', () => {
			setupEventListeners();
			loadServers();
		});
	} else {
		setupEventListeners();
		loadServers();
	}
})();
