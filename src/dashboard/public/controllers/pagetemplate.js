/**
 * Page Template Orchestrator & Component Controller
 * Fluffingiously Dragooon Dashboard
 */

(function() {
	'use strict';

	let currentUser = null;

	/**
	 * Setup debug logging for API calls in localhost/debug mode
	 */
	function setupApiDebugLogger() {
		const isLocal = window.location.hostname === 'localhost' || 
			window.location.hostname === '127.0.0.1' || 
			window.location.hostname.endsWith('.localhost');

		if (!isLocal || window.__apiDebugLoggerInitialized) return;
		window.__apiDebugLoggerInitialized = true;

		// Track all fetch requests (API, web requests, assets)
		const originalFetch = window.fetch;
		window.fetch = async function(...args) {
			const [resource, config] = args;
			const method = (config && config.method) ? config.method.toUpperCase() : 'GET';
			const url = typeof resource === 'string' ? resource : (resource ? resource.url : '');
			const isApi = url.startsWith('/api/') || url.includes('/api/');
			const tagPrefix = isApi ? '[API Debug - Client]' : '[Web Debug - Client]';
			const tagColor = isApi ? '#7bd0ff' : '#a5b4fc';

			console.log(
				`%c${tagPrefix}%c Calling: %c${method} ${url}`,
				`background: #171f33; color: ${tagColor}; font-weight: bold; padding: 2px 4px; border-radius: 4px;`,
				'',
				'color: #cabeff; font-weight: 600;',
				config || {}
			);

			try {
				const response = await originalFetch.apply(this, args);
				const isError = !response.ok;
				const statusStyle = isError 
					? 'color: #f85149; font-weight: bold;' 
					: 'color: #85e89d; font-weight: bold;';

				if (isError) {
					console.warn(
						`%c[Invalid Debug - Client]%c ${tagPrefix} %c${method} ${url}%c failed with %c${response.status} ${response.statusText}`,
						'background: #3b1818; color: #ff7b72; font-weight: bold; padding: 2px 4px; border-radius: 4px;',
						'',
						'color: #cabeff; font-weight: 600;',
						'',
						statusStyle
					);
				} else {
					console.log(
						`%c${tagPrefix}%c Response for %c${method} ${url}%c: %c${response.status} ${response.statusText}`,
						`background: #171f33; color: ${tagColor}; font-weight: bold; padding: 2px 4px; border-radius: 4px;`,
						'',
						'color: #cabeff;',
						'',
						statusStyle
					);
				}
				return response;
			} catch (err) {
				console.warn(
					`%c[Invalid Debug - Client]%c Network error calling %c${method} ${url}%c:`,
					'background: #3b1818; color: #ff7b72; font-weight: bold; padding: 2px 4px; border-radius: 4px;',
					'',
					'color: #cabeff;',
					'',
					err
				);
				throw err;
			}
		};

		// Track static resource assets loaded by the page (CSS, images, scripts, fonts)
		if (typeof window.PerformanceObserver !== 'undefined') {
			try {
				const resourceObserver = new PerformanceObserver((list) => {
					for (const entry of list.getEntries()) {
						if (entry.initiatorType === 'fetch' || entry.initiatorType === 'xmlhttprequest') {
							continue; // Already handled by fetch wrapper
						}
						const type = (entry.initiatorType || 'other').toUpperCase();
						console.log(
							`%c[Asset Debug - Client]%c Loaded (%c${type}%c): %c${entry.name}`,
							'background: #171f33; color: #85e89d; font-weight: bold; padding: 2px 4px; border-radius: 4px;',
							'',
							'color: #eec200; font-weight: bold;',
							'',
							'color: #7bd0ff;'
						);
					}
				});
				resourceObserver.observe({ entryTypes: ['resource'] });
			} catch (obsErr) {
				// PerformanceObserver fallback if resource entryTypes not supported
			}
		}

		// Track failed static asset loads (404 images, missing stylesheets, broken scripts)
		window.addEventListener('error', (event) => {
			if (event.target && (event.target.tagName === 'IMG' || event.target.tagName === 'LINK' || event.target.tagName === 'SCRIPT')) {
				const tag = event.target.tagName;
				const assetUrl = event.target.src || event.target.href || '';
				console.warn(
					`%c[Invalid Asset - Client]%c 404/Failed to load %c<${tag}>%c %c${assetUrl}`,
					'background: #3b1818; color: #ff7b72; font-weight: bold; padding: 2px 4px; border-radius: 4px;',
					'',
					'color: #eec200; font-weight: bold;',
					'',
					'color: #7bd0ff;'
				);
			}
		}, true); // capture phase

	}

	// Initialize debug logger immediately so all initial page fetches are captured
	setupApiDebugLogger();

	/**
	 * Initialize all page template behaviors
	 */
	function init() {
		setupSidebarToggle();
		setupNavbarScroll();
		setupDynamicLinks();
		highlightActiveRoute();
		fetchBotStatus();
		fetchUserSession();
		setupFooterYear();
		hideLoadingOverlay();
	}

	/**
	 * Setup mobile sidebar toggle
	 */
	function setupSidebarToggle() {
		const toggleBtn = document.getElementById('sidebarToggleBtn');
		if (toggleBtn) {
			toggleBtn.addEventListener('click', (e) => {
				e.preventDefault();
				document.body.classList.toggle('mobile-sidebar-open');
			});
		}

		// Close mobile sidebar on window resize if enlarged to desktop
		window.addEventListener('resize', () => {
			if (window.innerWidth > 768) {
				document.body.classList.remove('mobile-sidebar-open');
			}
		});

		// Close mobile sidebar when clicking outside on mobile
		document.addEventListener('click', (e) => {
			if (document.body.classList.contains('mobile-sidebar-open')) {
				const sidebar = document.getElementById('sidebar');
				const toggleBtn = document.getElementById('sidebarToggleBtn');
				if (sidebar && !sidebar.contains(e.target) && toggleBtn && !toggleBtn.contains(e.target)) {
					document.body.classList.remove('mobile-sidebar-open');
				}
			}
		});
	}

	/**
	 * Setup top navbar glassy effect on scroll
	 */
	function setupNavbarScroll() {
		const topNavbar = document.getElementById('topNavbar');
		if (!topNavbar) return;

		window.addEventListener('scroll', () => {
			if (window.scrollY > 15) {
				topNavbar.classList.add('scrolled');
			} else {
				topNavbar.classList.remove('scrolled');
			}
		}, { passive: true });
	}

	/**
	 * Dynamic URL resolution based on current hosting environment
	 */
	function setupDynamicLinks() {
		const isLocal = window.location.hostname === 'localhost' || 
		                window.location.hostname === '127.0.0.1' || 
		                window.location.hostname.endsWith('.localhost');
		
		const mainSiteUrl = isLocal 
			? `http://localhost:${window.location.port}` 
			: 'https://furred.site';

		const navbarMainSite = document.getElementById('navbarMainSiteLink');
		const footerMainSite = document.getElementById('footerMainSiteLink');

		if (navbarMainSite) navbarMainSite.href = mainSiteUrl;
		if (footerMainSite) footerMainSite.href = mainSiteUrl;
	}

	/**
	 * Highlight active sidebar navigation item based on path
	 */
	function highlightActiveRoute() {
		const path = window.location.pathname;

		const navItems = [
			{ id: 'navStatus', match: path === '/' || path === '/home' || path === '/dashboard' },
			{ id: 'navMyServer', match: path.startsWith('/my_server') },
			{ id: 'navMyConfig', match: path.startsWith('/my_config') },
			{ id: 'navLogViewer', match: path.startsWith('/log_viewer') },
			{ id: 'navAdminPanel', match: path.startsWith('/admin_panel') },
			{ id: 'navSillyDatabase', match: path.startsWith('/sillydatabase') }
		];

		navItems.forEach(item => {
			const el = document.getElementById(item.id);
			if (el) {
				if (item.match) {
					el.classList.add('active');
				} else {
					el.classList.remove('active');
				}
			}
		});
	}

	/**
	 * Fetch live bot status, avatar and tag name
	 */
	async function fetchBotStatus() {
		try {
			const res = await fetch('/api/status');
			if (!res.ok) return;
			const data = await res.json();

			const botAvatar = document.getElementById('botAvatar');
			const botTagName = document.getElementById('botTagName');
			const statusDot = document.getElementById('sidebarStatusDot');

			if (botAvatar && data.bot && data.bot.avatarUrl) {
				botAvatar.src = data.bot.avatarUrl;
			}
			if (botTagName && data.bot && data.bot.username) {
				botTagName.textContent = data.bot.username;
			}
			if (statusDot) {
				statusDot.className = 'sidebar-status-dot';
				if (data.status === 'online' || data.isOnline) {
					statusDot.classList.add('online');
				} else if (data.status === 'starting') {
					statusDot.classList.add('starting');
				}
			}
		} catch (err) {
			console.warn('[PageTemplate] Bot status fetch failed:', err);
		}
	}

	/**
	 * Fetch user session profile and render user profile card or Discord login
	 */
	async function fetchUserSession() {
		const userSection = document.getElementById('userProfileSection');
		if (!userSection) return;

		try {
			const res = await fetch('/api/auth/me');
			if (res.ok) {
				const data = await res.json();
				if (data && data.authenticated && data.user) {
					currentUser = data.user;
					renderUserProfile(data.user);
					
					// If admin, owner, or web_dev, show all admin-only navigation links
					if (data.user.isAdmin || data.user.isOwner || data.user.isWebDev) {
						document.querySelectorAll('.admin-only').forEach(el => {
							el.style.display = 'flex';
						});
					}
					return;
				}
			}
		} catch (e) {
			console.warn('[PageTemplate] Auth verification check error:', e);
		}

		// Fallback: Render Discord login button
		renderLoginButton();
	}

	function renderUserProfile(user) {
		const userSection = document.getElementById('userProfileSection');
		if (!userSection) return;

		const avatarSrc = user.avatarUrl || `https://cdn.discordapp.com/avatars/${user.userId}/${user.avatar}.png?size=64`;
		const displayRankName = (user.displayRank || user.rank || (user.isAdmin ? 'Admin' : 'Member')).toUpperCase();

		userSection.innerHTML = `
			<div class="user-card" onclick="window.toggleProfileModal(true)" style="cursor: pointer;" title="Profile Settings">
				<div class="user-details">
					<img src="${avatarSrc}" alt="Avatar" class="user-avatar" onerror="this.src='https://cdn.discordapp.com/embed/avatars/0.png'">
					<div class="user-info">
						<span class="user-name">${escapeHtml(user.username || 'User')}</span>
						<span class="rank-soft-text" id="sidebarUserRank">${escapeHtml(displayRankName)}</span>
					</div>
				</div>
				<a href="/api/auth/logout" class="logout-btn" title="Logout" onclick="event.stopPropagation();">
					<span class="material-symbols-outlined">logout</span>
				</a>
			</div>
		`;
	}

	function renderLoginButton() {
		const userSection = document.getElementById('userProfileSection');
		if (!userSection) return;

		userSection.innerHTML = `
			<a href="/api/auth/login" class="login-btn" title="Login with Discord">
				<svg viewBox="0 0 127.14 96.36" class="login-btn-icon">
					<path fill="currentColor" d="M107.7,8.07A105.15,105.15,0,0,0,81.47,0a72.06,72.06,0,0,0-3.36,6.83A97.68,97.68,0,0,0,49,6.83,72.37,72.37,0,0,0,45.64,0,105.89,105.89,0,0,0,19.39,8.09C2.79,32.65-1.71,56.6.54,80.21h0A105.73,105.73,0,0,0,32.71,96.36,77.7,77.7,0,0,0,39.6,85.25a68.42,68.42,0,0,1-10.85-5.18c.91-.66,1.8-1.34,2.66-2a75.57,75.57,0,0,0,64.32,0c.87.71,1.76,1.39,2.66,2a68.68,68.68,0,0,1-10.87,5.19,77,77,0,0,0,6.89,11.1A105.25,105.25,0,0,0,126.6,80.22h0C129.24,52.84,122.09,29.11,107.7,8.07ZM42.45,65.69C36.18,65.69,31,60,31,53s5-12.74,11.43-12.74S54,45.91,53.89,53,48.84,65.69,42.45,65.69Zm42.24,0C78.41,65.69,73.25,60,73.25,53s5-12.74,11.44-12.74S96.23,45.91,96.12,53,91.08,65.69,84.69,65.69Z"/>
				</svg>
				<span>Login with Discord</span>
			</a>
		`;
	}

	/**
	 * Setup current footer year
	 */
	function setupFooterYear() {
		const yearEl = document.getElementById('footerCurrentYear');
		if (yearEl) {
			yearEl.textContent = new Date().getFullYear().toString();
		}
	}

	/**
	 * Dismiss loading screen
	 */
	function hideLoadingOverlay() {
		const overlay = document.getElementById('loadingOverlay');
		if (overlay) {
			setTimeout(() => {
				overlay.classList.add('hidden');
			}, 200);
		}
	}

	/**
	 * Helper function to escape HTML
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

	// Profile Modal Global Handlers
	// Reference instance for the Profile Modal Custom Dropdown
	window.modalRankDropdownInstance = null;

	/**
	 * Toggle Profile Settings Modal with CustomModal.createDropdown integration
	 * Serves as an architectural example for future modals with dropdown components.
	 */
	window.toggleProfileModal = function(show) {
		const modal = document.getElementById('profileModal');
		if (!modal) return;
		if (show) {
			modal.classList.add('active');
			if (currentUser) {
				const avatarEl = document.getElementById('modalAvatar');
				const usernameEl = document.getElementById('modalUsername');
				const rankTextEl = document.getElementById('modalRankText');
				const rankDropdownContainer = document.getElementById('modalRankDropdown');

				if (avatarEl) avatarEl.src = currentUser.avatarUrl || `https://cdn.discordapp.com/avatars/${currentUser.userId}/${currentUser.avatar}.png?size=128`;
				if (usernameEl) usernameEl.textContent = currentUser.username;
				
				const displayRank = currentUser.displayRank || currentUser.rank || 'MEMBER';
				if (rankTextEl) rankTextEl.textContent = displayRank.toUpperCase();

				// Build options list for CustomModal.createDropdown
				const rankOptions = (currentUser.eligibleRanks && currentUser.eligibleRanks.length > 0)
					? currentUser.eligibleRanks.map(rank => ({
						label: rank.toUpperCase(),
						value: rank
					}))
					: [{ label: 'Default / None', value: '' }];

				// Initialize CustomModal.createDropdown
				if (rankDropdownContainer && window.CustomModal && typeof window.CustomModal.createDropdown === 'function') {
					window.modalRankDropdownInstance = window.CustomModal.createDropdown(rankDropdownContainer, {
						options: rankOptions,
						defaultValue: currentUser.displayRank || '',
						placeholder: 'Choose display rank...',
						hiddenInputId: 'rankSelect',
						onChange: (chosenRank) => {
							if (rankTextEl) {
								rankTextEl.textContent = (chosenRank ? chosenRank : 'DEFAULT').toUpperCase();
							}
						}
					});
				}
			}
		} else {
			modal.classList.remove('active');
			if (window.modalRankDropdownInstance) {
				window.modalRankDropdownInstance.close();
			}
		}
	};

	window.updateRankSelection = function() {
		const rankSelect = document.getElementById('rankSelect');
		const rankTextEl = document.getElementById('modalRankText');
		if (rankSelect && rankTextEl) {
			rankTextEl.textContent = rankSelect.value.toUpperCase();
		}
	};

	window.closeProfileModal = function(event) {
		if (event.target && event.target.id === 'profileModal') {
			window.toggleProfileModal(false);
		}
	};

	/**
	 * Save Profile Settings with CustomModal feedback
	 */
	window.saveProfileSettings = async function() {
		const rankSelect = document.getElementById('rankSelect');
		const chosenRank = window.modalRankDropdownInstance 
			? window.modalRankDropdownInstance.getValue() 
			: (rankSelect ? rankSelect.value : '');

		try {
			const res = await fetch('/api/user/config', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ displayRank: chosenRank })
			});
			if (res.ok) {
				if (currentUser) {
					currentUser.displayRank = chosenRank;
					currentUser.rank = (chosenRank || 'MEMBER').toUpperCase();
					currentUser.rankText = (chosenRank || 'MEMBER').toUpperCase();
					const sidebarRank = document.getElementById('sidebarUserRank');
					if (sidebarRank) sidebarRank.textContent = (chosenRank || 'MEMBER').toUpperCase();
				}
				if (window.CustomModal && typeof window.CustomModal.toast === 'function') {
					window.CustomModal.toast('Profile display rank updated!', { type: 'success' });
				}
			}
		} catch (e) {
			console.warn('[PageTemplate] Error updating display rank:', e);
		}
		window.toggleProfileModal(false);
	};

	// Self-init on DOMContentLoaded or immediate if already ready
	if (document.readyState === 'loading') {
		document.addEventListener('DOMContentLoaded', init);
	} else {
		init();
	}
})();
