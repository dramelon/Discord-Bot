/**
 * ==========================================================================
 * Fluffingiously Dragooon - Reusable Emoji Preview Popup Module
 * Centralized Emoji Registry, Auto-Hydration, and Discord-Style Popup
 * ==========================================================================
 */

(function (root, factory) {
	if (typeof define === 'function' && define.amd) {
		define([], factory);
	} else if (typeof module === 'object' && module.exports) {
		module.exports = factory();
	} else {
		root.EmojiPopup = factory();
	}
}(typeof self !== 'undefined' ? self : this, function () {
	'use strict';

	// ==========================================================================
	// 1. Centralized Emoji Database (Single Source of Truth)
	// ==========================================================================
	const emojiRegistry = {
		':Gold_block:': 'https://cdn.discordapp.com/emojis/1394176226339459213.webp',
		':triangular_ruler:': 'https://cdn.discordapp.com/emojis/1549735602835165234.webp',
		':feral:': 'https://cdn.discordapp.com/emojis/1089412510513369107.webp',
		':neko_snack:': 'https://cdn.discordapp.com/emojis/1237924418731245569.webp',
		':straight_ruler:': 'https://cdn.discordapp.com/emojis/1549736959830925443.webp',
		':GetStickBugged:': 'https://cdn.discordapp.com/emojis/740801908540833802.webp?animated=true',
		':ryu_plead:': 'https://cdn.discordapp.com/emojis/1410675074645889025.webp',
		':ryupout:': 'https://cdn.discordapp.com/emojis/969424717989695488.webp',
		':of_shock:': 'https://cdn.discordapp.com/emojis/1463329886440521760.webp',
		':bleee:': 'https://cdn.discordapp.com/emojis/1491785676830543983.webp',
		':aaaaaagh:': 'https://cdn.discordapp.com/emojis/1515324139534028941.webp?animated=true',
		':textbubble:': 'https://cdn.discordapp.com/emojis/724542660169433128.webp',
		':Bed:': 'https://cdn.discordapp.com/emojis/811153052983492658.webp',
		':samuREE:': 'https://cdn.discordapp.com/emojis/857062803495845888.webp',
		':strideban:': 'https://cdn.discordapp.com/emojis/1090524088260370462.webp',
		':Z_CatSniff2:': 'https://cdn.discordapp.com/emojis/1087163916796297267.webp?animated=true',
		':FrostyPeek:': 'https://cdn.discordapp.com/emojis/1500524432395997244.webp',
		':text_frosty:': 'https://cdn.discordapp.com/emojis/1392385093598969906.webp?animated=true',
		':FrostyHai:': 'https://cdn.discordapp.com/emojis/1504119118742163618.webp',
		':6203peachmilk:': 'https://cdn.discordapp.com/emojis/1016731900745887835.webp',
		':ProtoKyroBongo:': 'https://cdn.discordapp.com/emojis/922593715418202172.webp',
		':of_nervous:': 'https://cdn.discordapp.com/emojis/1463330144595738696.webp',
		':ProtoKyroPing:': 'https://cdn.discordapp.com/emojis/941508971393601547.webp?animated=true',
		':YAY:': 'https://cdn.discordapp.com/emojis/1303678255848493096.webp',
		':melon_hat_sparkle:': 'https://cdn.discordapp.com/emojis/1504670609626497174.webp',
		':PET_Llama:': 'https://cdn.discordapp.com/emojis/1528889843680022668.webp',
		':Frosty:': 'https://cdn.discordapp.com/emojis/1126521938181885952.webp',
		':FrostyDed:': 'https://cdn.discordapp.com/emojis/1500524348413313044.webp',
		':3796moyaitherock:': 'https://cdn.discordapp.com/emojis/1064165246333366423.webp',
		':Paper:': 'https://cdn.discordapp.com/emojis/1484234598824022076.webp',
		':scissors:': 'https://cdn.discordapp.com/emojis/1549735870385627306.webp',
		':PLEASEPLEASEPLEASEPLEASEPLEASE:': 'https://cdn.discordapp.com/emojis/1289805982779703347.webp'
	};

	let popupEl = null;
	let currentAnchor = null;

	/**
	 * Helper to normalize emoji names with surrounding colons
	 * e.g. "Gold_block" -> ":Gold_block:"
	 */
	function normalizeName(name) {
		if (!name || typeof name !== 'string') return '';
		const trimmed = name.trim();
		if (trimmed.startsWith(':') && trimmed.endsWith(':')) {
			return trimmed;
		}
		return `:${trimmed.replace(/^:+|:+$/g, '')}:`;
	}

	/**
	 * Retrieve emoji image URL from the registry
	 */
	function getUrl(name) {
		if (!name) return '';
		const normalized = normalizeName(name);
		return emojiRegistry[normalized] || emojiRegistry[name] || '';
	}

	/**
	 * Create or get the shared popup DOM container
	 */
	function getOrCreatePopup() {
		if (popupEl) return popupEl;

		popupEl = document.createElement('div');
		popupEl.id = 'emojiPreviewPopup';
		popupEl.className = 'emoji-preview-popup';
		popupEl.setAttribute('role', 'tooltip');
		popupEl.innerHTML = `
			<div class="emoji-popup-body">
				<div class="emoji-popup-preview-box">
					<img class="emoji-popup-img" src="" alt="Emoji Preview" loading="lazy">
				</div>
				<div class="emoji-popup-meta">
					<span class="emoji-popup-name">:emoji:</span>
					<span class="emoji-popup-hint">Custom Server Emoji</span>
				</div>
			</div>
			<div class="emoji-popup-arrow"></div>
		`;
		document.body.appendChild(popupEl);

		// Prevent click inside popup from bubbling to document and closing it immediately
		popupEl.addEventListener('click', (e) => {
			e.stopPropagation();
		});

		// Global document listener to close popup when clicking anywhere outside
		document.addEventListener('click', (e) => {
			if (currentAnchor && !currentAnchor.contains(e.target) && !popupEl.contains(e.target)) {
				hide();
			}
		});

		// Close on Escape key
		document.addEventListener('keydown', (e) => {
			if (e.key === 'Escape') {
				hide();
			}
		});

		// Reposition on scroll or resize
		window.addEventListener('resize', () => {
			if (currentAnchor && isVisible()) {
				positionPopup(currentAnchor);
			}
		}, { passive: true });

		window.addEventListener('scroll', () => {
			if (currentAnchor && isVisible()) {
				positionPopup(currentAnchor);
			}
		}, { passive: true });

		return popupEl;
	}

	function isVisible() {
		return popupEl && popupEl.classList.contains('active');
	}

	/**
	 * Position the popup relative to the anchor element
	 */
	function positionPopup(anchorEl) {
		if (!popupEl || !anchorEl) return;

		const rect = anchorEl.getBoundingClientRect();
		const popupWidth = popupEl.offsetWidth || 220;
		const popupHeight = popupEl.offsetHeight || 72;
		const margin = 10;

		// Center horizontally above or below anchor
		let left = rect.left + (rect.width / 2) - (popupWidth / 2);
		let top = rect.top - popupHeight - margin;
		let placement = 'top';

		// If too close to top of viewport, flip to bottom
		if (top < 10) {
			top = rect.bottom + margin;
			placement = 'bottom';
		}

		// Boundary clamp horizontally
		if (left < 10) {
			left = 10;
		} else if (left + popupWidth > window.innerWidth - 10) {
			left = window.innerWidth - popupWidth - 10;
		}

		popupEl.style.left = `${Math.round(left)}px`;
		popupEl.style.top = `${Math.round(top)}px`;
		popupEl.setAttribute('data-placement', placement);

		// Align arrow to anchor center
		const arrow = popupEl.querySelector('.emoji-popup-arrow');
		if (arrow) {
			const arrowOffset = (rect.left + rect.width / 2) - left;
			arrow.style.left = `${Math.max(12, Math.min(popupWidth - 12, arrowOffset))}px`;
		}
	}

	/**
	 * Show popup for an emoji
	 * @param {HTMLElement} anchorEl 
	 * @param {Object} [options] { name, url }
	 */
	function show(anchorEl, options = {}) {
		if (!anchorEl) return;

		const popup = getOrCreatePopup();
		const rawName = options.name || anchorEl.getAttribute('data-name') || anchorEl.getAttribute('data-emoji') || anchorEl.getAttribute('alt') || ':emoji:';
		const normalized = normalizeName(rawName);
		const url = options.url || anchorEl.getAttribute('data-url') || anchorEl.getAttribute('src') || getUrl(normalized) || '';

		const imgEl = popup.querySelector('.emoji-popup-img');
		const nameEl = popup.querySelector('.emoji-popup-name');
		const hintEl = popup.querySelector('.emoji-popup-hint');

		if (imgEl) {
			imgEl.src = url;
			imgEl.alt = normalized;
		}
		if (nameEl) {
			nameEl.textContent = normalized;
		}
		if (hintEl) {
			hintEl.textContent = normalized.startsWith(':') && normalized.endsWith(':') ? 'Server Emoji' : 'Standard Emoji';
		}

		currentAnchor = anchorEl;
		popup.classList.add('active');
		positionPopup(anchorEl);
	}

	/**
	 * Hide the active popup
	 */
	function hide() {
		if (popupEl) {
			popupEl.classList.remove('active');
		}
		currentAnchor = null;
	}

	/**
	 * Register custom emojis or extend registry
	 * @param {Object|String} nameOrMap - Map of { ':name:': 'url' } or single name string
	 * @param {String} [url] - URL if registering single emoji
	 * @example
	 * // Single registration
	 * EmojiPopup.register(':my_new_emoji:', 'https://abc/pathToEmoji.png');
	 *
	 * @example
	 * // Batch registration
	 * EmojiPopup.register({
	 *   ':smile:': 'https://abc/pathToSmile.png',
	 *   ':heart:': 'https://abc/pathToHeart.png'
	 * });
	 */
	function register(nameOrMap, url) {
		if (typeof nameOrMap === 'object') {
			for (const [k, v] of Object.entries(nameOrMap)) {
				emojiRegistry[normalizeName(k)] = v;
			}
		} else if (typeof nameOrMap === 'string' && url) {
			emojiRegistry[normalizeName(nameOrMap)] = url;
		}
	}

	/**
	 * Automatically hydrate emojis in the container:
	 * Resolves URL from the central registry and sets .src if not provided!
	 * Binds click handler to toggle or swap preview popup.
	 * 
	 * @param {String|HTMLElement} [containerOrSelector]
	 */
	function hydrate(containerOrSelector) {
		const rootEl = typeof containerOrSelector === 'string' 
			? document.querySelector(containerOrSelector) || document.body 
			: (containerOrSelector || document.body);

		if (!rootEl) return;

		const emojiElements = rootEl.querySelectorAll('.custom-emoji, [data-name], [data-emoji]');
		emojiElements.forEach((el) => {
			const rawName = el.getAttribute('data-name') || el.getAttribute('data-emoji') || el.getAttribute('alt') || '';
			if (!rawName) return;

			const normalizedName = normalizeName(rawName);
			const resolvedUrl = getUrl(normalizedName);

			// Automatically populate src for <img> elements if not already set or empty
			if (el.tagName === 'IMG') {
				const currentSrc = el.getAttribute('src');
				if ((!currentSrc || currentSrc === '#' || currentSrc === '') && resolvedUrl) {
					el.src = resolvedUrl;
				}
				if (!el.getAttribute('alt')) {
					el.alt = normalizedName;
				}
				el.setAttribute('draggable', 'false');
				el.setAttribute('loading', 'lazy');
			} else if (resolvedUrl && !el.style.backgroundImage && !el.querySelector('img')) {
				el.style.backgroundImage = `url("${resolvedUrl}")`;
			}

			// Keep consistent data-name
			if (!el.getAttribute('data-name')) {
				el.setAttribute('data-name', normalizedName);
			}

			// Bind click popup interaction
			if (!el._hasEmojiPopupAttached) {
				el._hasEmojiPopupAttached = true;
				el.style.cursor = 'pointer';

				el.addEventListener('click', (e) => {
					e.stopPropagation();
					if (currentAnchor === el && isVisible()) {
						hide();
					} else {
						show(el);
					}
				});
			}
		});
	}

	/**
	 * Alias for hydrate for backward compatibility
	 */
	function attach(containerOrSelector) {
		hydrate(containerOrSelector);
	}

	// Auto-hydrate on load and listen for dynamic DOM additions
	if (typeof document !== 'undefined') {
		const onInit = () => {
			getOrCreatePopup();
			hydrate(document.body);

			// Observe dynamically added content
			if (typeof MutationObserver !== 'undefined' && document.body) {
				const observer = new MutationObserver((mutations) => {
					for (const mutation of mutations) {
						for (const node of mutation.addedNodes) {
							if (node.nodeType === 1) { // ELEMENT_NODE
								if (node.matches && node.matches('.custom-emoji, [data-name], [data-emoji]')) {
									hydrate(node.parentElement || node);
								} else if (node.querySelectorAll && node.querySelector('.custom-emoji, [data-name], [data-emoji]')) {
									hydrate(node);
								}
							}
						}
					}
				});
				observer.observe(document.body, { childList: true, subtree: true });
			}
		};

		if (document.readyState === 'loading') {
			document.addEventListener('DOMContentLoaded', onInit);
		} else {
			onInit();
		}
	}

	return {
		show,
		hide,
		register,
		hydrate,
		attach,
		normalizeName,
		getRegistry: () => ({ ...emojiRegistry }),
		getUrl
	};
}));
