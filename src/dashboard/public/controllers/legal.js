/**
 * ==========================================================================
 * Fluffingiously Dragooon - Legal & Policies Page Controller
 * Handles TOC scroll spy, section link copying, and interactive modals
 * ==========================================================================
 */

(function () {
	'use strict';

	document.addEventListener('DOMContentLoaded', () => {
		initScrollSpy();
		initCopyButtons();
		initDataDeletionModal();
	});

	/**
	 * Setup IntersectionObserver or scroll listener to highlight active TOC item
	 */
	function initScrollSpy() {
		const sections = document.querySelectorAll('.legal-section-card[id]');
		const tocLinks = document.querySelectorAll('.legal-toc-link');

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
	 * Setup copy buttons for each section header
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
					showLegalToast('Section link copied to clipboard!');
				} catch (err) {
					// Fallback
					const tempInput = document.createElement('input');
					tempInput.value = url.toString();
					document.body.appendChild(tempInput);
					tempInput.select();
					document.execCommand('copy');
					document.body.removeChild(tempInput);
					showLegalToast('Section link copied to clipboard!');
				}
			});
		});
	}

	/**
	 * Show floating toast notification
	 */
	function showLegalToast(message) {
		let toast = document.getElementById('legalToast');
		if (!toast) {
			toast = document.createElement('div');
			toast.id = 'legalToast';
			toast.className = 'legal-toast';
			toast.innerHTML = `<span class="material-symbols-outlined">check_circle</span><span id="legalToastMsg">${message}</span>`;
			document.body.appendChild(toast);
		} else {
			document.getElementById('legalToastMsg').textContent = message;
		}

		toast.classList.add('show');
		clearTimeout(window._legalToastTimer);
		window._legalToastTimer = setTimeout(() => {
			toast.classList.remove('show');
		}, 3000);
	}

	/**
	 * Interactive modal trigger for data deletion requests
	 */
	function initDataDeletionModal() {
		const btnTrigger = document.getElementById('btnRequestDataDeletion');
		if (!btnTrigger) return;

		btnTrigger.addEventListener('click', async (e) => {
			e.preventDefault();

			if (typeof CustomModal !== 'undefined' && CustomModal.show) {
				const isConfirmed = await CustomModal.confirm(
					'Would you like to generate a pre-formatted Data Deletion request template to send to the developer on Discord?',
					{
						title: 'Data Deletion Request',
						danger: false
					}
				);

				if (isConfirmed) {
					const userIdPrompt = await CustomModal.prompt(
						'Please enter your Discord User ID (or Guild ID if server data):',
						{
							title: 'Discord Identifier',
							inputType: 'text',
							placeholder: 'e.g. 123456789012345678'
						}
					);

					if (userIdPrompt && userIdPrompt.trim()) {
						const templateText = `**Data Deletion Request**\n**Discord ID:** \`${userIdPrompt.trim()}\`\n**Request:** Permanent removal of all stored profiles, economy stats, leveling progression, and guild configs.`;
						try {
							await navigator.clipboard.writeText(templateText);
							await CustomModal.alert(
								'Request template copied to your clipboard! Paste this message into a DM with _d6_ or in the #support channel of our Discord server.',
								{ title: 'Template Ready', type: 'success' }
							);
						} catch (err) {
							await CustomModal.alert(
								`Copy this request and send to _d6_:\n\n${templateText}`,
								{ title: 'Data Deletion Request', type: 'info' }
							);
						}
					}
				}
			} else {
				// Fallback if modal script not loaded
				alert('To request data deletion, please DM the developer _d6_ on Discord with your Discord User ID.');
			}
		});
	}

	// Expose globally if needed
	window.legalController = {
		showToast: showLegalToast
	};
})();
