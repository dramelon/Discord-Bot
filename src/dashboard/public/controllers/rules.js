/**
 * ==========================================================================
 * Fluffingiously Dragooon - Rules Page Controller
 * Handles TOC scroll spy, deep link copying, and emoji popup interactions
 * ==========================================================================
 */

(function () {
	'use strict';

	document.addEventListener('DOMContentLoaded', () => {
		initScrollSpy();
		initCopyButtons();

		// Attach emoji popups to all custom emoji images/spans on the page
		if (typeof EmojiPopup !== 'undefined' && EmojiPopup.attach) {
			EmojiPopup.attach('.rules-page-container');
		}
	});

	/**
	 * Setup IntersectionObserver to highlight active TOC item in Rules
	 */
	function initScrollSpy() {
		const sections = document.querySelectorAll('.rule-card[id]');
		const tocLinks = document.querySelectorAll('.rules-toc-link');

		if (!sections.length || !tocLinks.length) return;

		const observerOptions = {
			root: null,
			rootMargin: '-80px 0px -60% 0px',
			threshold: 0
		};

		const observer = new IntersectionObserver((entries) => {
			entries.forEach((entry) => {
				if (entry.isIntersecting) {
					const id = entry.target.getAttribute('id');
					tocLinks.forEach((link) => {
						if (link.getAttribute('href') === `#${id}`) {
							link.classList.add('active');
						} else {
							link.classList.remove('active');
						}
					});
				}
			});
		}, observerOptions);

		sections.forEach((section) => observer.observe(section));
	}

	/**
	 * Setup copy buttons for each rule header
	 */
	function initCopyButtons() {
		const copyButtons = document.querySelectorAll('.btn-copy-section');
		copyButtons.forEach((btn) => {
			btn.addEventListener('click', async (e) => {
				e.preventDefault();
				const targetId = btn.getAttribute('data-target');
				const url = new URL(window.location.href);
				url.hash = targetId;

				try {
					await navigator.clipboard.writeText(url.toString());
					showRulesToast('Rule link copied to clipboard!');
				} catch (err) {
					const tempInput = document.createElement('input');
					tempInput.value = url.toString();
					document.body.appendChild(tempInput);
					tempInput.select();
					document.execCommand('copy');
					document.body.removeChild(tempInput);
					showRulesToast('Rule link copied to clipboard!');
				}
			});
		});
	}

	/**
	 * Show floating toast notification
	 */
	function showRulesToast(message) {
		let toast = document.getElementById('rulesToast');
		if (!toast) {
			toast = document.createElement('div');
			toast.id = 'rulesToast';
			toast.className = 'legal-toast';
			toast.innerHTML = `<span class="material-symbols-outlined">check_circle</span><span id="rulesToastMsg">${message}</span>`;
			document.body.appendChild(toast);
		} else {
			document.getElementById('rulesToastMsg').textContent = message;
		}

		toast.classList.add('show');
		clearTimeout(window._rulesToastTimer);
		window._rulesToastTimer = setTimeout(() => {
			toast.classList.remove('show');
		}, 3000);
	}
})();
