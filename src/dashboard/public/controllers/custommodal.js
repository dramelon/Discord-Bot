/**
 * CustomModal - Universal Dynamic Interactive Modal Module
 * Fluffingiously Dragooon Dashboard Design System
 * 
 * Supports:
 * - Alerts & Notices (Info, Success, Warning, Error)
 * - Multi-action Confirmations & Dialogs
 * - Dynamic Input Prompts:
 *   - Text: Standard text / textarea
 *   - Password: Show latest char temporarily before turning into a dot, with eye toggle
 *   - Number: Strict numeric input with step/min/max
 *   - Dropdown: Custom single-select and multi-select with tag chips
 * - Full Keyboard Support (Enter to submit, Escape to cancel)
 * - Screen-blocking Focus Trap & Blur Backdrop
 * - Async / Promise-based API returning user interaction result
 */

(function (root, factory) {
	if (typeof define === 'function' && define.amd) {
		define([], factory);
	} else if (typeof module === 'object' && module.exports) {
		module.exports = factory();
	} else {
		root.CustomModal = factory();
	}
}(typeof self !== 'undefined' ? self : this, function () {
	'use strict';

	let activeModalPromise = null;
	let currentResolver = null;
	let currentRejecter = null;
	let keydownHandler = null;

	/**
	 * Helper to create DOM element with attributes & classes
	 */
	function createElement(tag, className = '', attributes = {}) {
		const el = document.createElement(tag);
		if (className) el.className = className;
		for (const [key, value] of Object.entries(attributes)) {
			if (key === 'innerHTML') {
				el.innerHTML = value;
			} else if (key === 'textContent') {
				el.textContent = value;
			} else {
				el.setAttribute(key, value);
			}
		}
		return el;
	}

	/**
	 * Escape HTML to prevent XSS in text inputs
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
	 * Get icon name based on modal type
	 */
	function getIconForType(type) {
		switch (type) {
			case 'success': return 'check_circle';
			case 'warning': return 'warning';
			case 'error':
			case 'danger': return 'error';
			case 'prompt':
			case 'input': return 'edit_note';
			case 'question': return 'help';
			case 'lock':
			case 'password': return 'lock';
			case 'info':
			default: return 'info';
		}
	}

	/**
	 * Main CustomModal Object
	 */
	const CustomModal = {
		/**
		 * Core Modal Invoker
		 * @param {Object} options Configuration options
		 * @returns {Promise<any>}
		 */
		show(options = {}) {
			// If a modal is already open, dismiss previous with null
			if (currentResolver) {
				CustomModal.close(null);
			}

			return new Promise((resolve, reject) => {
				currentResolver = resolve;
				currentRejecter = reject;

				const config = {
					title: options.title || 'Notification',
					message: options.message || '',
					html: options.html || null,
					type: options.type || 'info', // 'info' | 'success' | 'warning' | 'error' | 'prompt'
					icon: options.icon || getIconForType(options.type),
					showCloseBtn: options.showCloseBtn !== false,
					closeOnBackdrop: options.closeOnBackdrop !== false,
					closeOnEscape: options.closeOnEscape !== false,
					inputType: options.inputType || null, // 'text' | 'password' | 'number' | 'textarea' | 'dropdown'
					placeholder: options.placeholder || '',
					defaultValue: options.defaultValue !== undefined ? options.defaultValue : '',
					options: options.options || [], // for dropdown [{ label: '...', value: '...' }]
					isMulti: options.isMulti === true, // for dropdown
					buttons: options.buttons || null, // [{ text, value, type: 'primary'|'secondary'|'danger' }]
					confirmText: options.confirmText || 'OK',
					cancelText: options.cancelText || 'Cancel',
					showCancel: options.showCancel === true || (options.inputType && options.showCancel !== false),
					validate: typeof options.validate === 'function' ? options.validate : null,
					width: options.width || null,
					customClass: options.customClass || ''
				};

				CustomModal._render(config);
			});
		},

		/**
		 * Quick Helper: Simple Alert
		 */
		alert(message, options = {}) {
			return CustomModal.show({
				title: options.title || 'Notice',
				message: message,
				type: options.type || 'info',
				icon: options.icon,
				confirmText: options.buttonText || options.confirmText || 'OK',
				showCancel: false,
				...options
			});
		},

		/**
		 * Quick Helper: Confirmation Dialog
		 */
		confirm(message, options = {}) {
			return CustomModal.show({
				title: options.title || 'Confirm Action',
				message: message,
				type: options.type || (options.danger ? 'error' : 'warning'),
				icon: options.icon || (options.danger ? 'warning' : 'help'),
				confirmText: options.confirmText || 'Confirm',
				cancelText: options.cancelText || 'Cancel',
				showCancel: true,
				buttons: options.buttons || [
					{ text: options.cancelText || 'Cancel', value: false, type: 'secondary' },
					{ text: options.confirmText || 'Confirm', value: true, type: options.danger ? 'danger' : 'primary' }
				],
				...options
			});
		},

		/**
		 * Quick Helper: Input Prompt
		 */
		prompt(message, options = {}) {
			return CustomModal.show({
				title: options.title || 'Input Required',
				message: message,
				type: options.type || 'prompt',
				inputType: options.inputType || 'text',
				placeholder: options.placeholder || 'Enter value...',
				defaultValue: options.defaultValue || '',
				showCancel: options.showCancel !== false,
				confirmText: options.confirmText || 'Submit',
				...options
			});
		},

		/**
		 * Standalone Component: Interactive Dropdown Builder
		 * Can mount directly into any DOM element / page container outside of modals.
		 * 
		 * @param {HTMLElement|string} target Container element or query selector
		 * @param {Object} [config={}] Dropdown options
		 * @param {Array} [config.options=[]] Array of { label, value } or strings
		 * @param {any} [config.defaultValue] Initial selected value(s)
		 * @param {string} [config.placeholder='Select an option...'] Placeholder text
		 * @param {boolean} [config.isMulti=false] Enable multi-select with chips
		 * @param {boolean} [config.showSearch] Show filter box (default: true if options >= 5)
		 * @param {Function} [config.onChange] Callback invoked on change: (value, option) => {}
		 * @param {string} [config.hiddenInputId] Optional hidden input ID to keep in sync
		 * @returns {Object} Dropdown controller: { getValue(), setValue(val), setOptions(opts, val), close(), destroy() }
		 * 
		 * @example
		 * const rankDropdown = CustomModal.createDropdown('#modalRankDropdown', {
		 *   options: [{ label: 'Member', value: 'member' }, { label: 'Admin', value: 'admin' }],
		 *   defaultValue: 'member',
		 *   hiddenInputId: 'rankSelect',
		 *   onChange: (val) => console.log('Selected rank:', val)
		 * });
		 */
		createDropdown(target, config = {}) {
			const containerEl = typeof target === 'string' ? document.querySelector(target) : target;
			if (!containerEl) {
				console.warn('[CustomModal] createDropdown target not found:', target);
				return null;
			}

			let selectedValues = [];
			if (Array.isArray(config.defaultValue)) {
				selectedValues = [...config.defaultValue];
			} else if (config.defaultValue !== undefined && config.defaultValue !== null && config.defaultValue !== '') {
				selectedValues = [config.defaultValue];
			}

			let optionsList = (config.options || []).map(opt => {
				if (typeof opt === 'string' || typeof opt === 'number') {
					return { label: String(opt), value: opt };
				}
				return opt;
			});

			containerEl.innerHTML = '';
			const dropdownContainer = createElement('div', 'custom-dropdown-container');
			const triggerBtn = createElement('div', 'custom-dropdown-trigger', { tabindex: '0' });
			const triggerLabel = createElement('div', 'custom-dropdown-selected-display');
			const chevron = createElement('span', 'material-symbols-outlined custom-dropdown-chevron', { textContent: 'expand_more' });

			triggerBtn.appendChild(triggerLabel);
			triggerBtn.appendChild(chevron);
			dropdownContainer.appendChild(triggerBtn);

			const menuPanel = createElement('div', 'custom-dropdown-menu');

			// Search filter
			const shouldShowSearch = config.showSearch !== undefined ? config.showSearch : optionsList.length >= 5;
			let searchBox = null;
			if (shouldShowSearch) {
				searchBox = createElement('div', 'custom-dropdown-search');
				const searchInput = createElement('input', 'custom-dropdown-search-input', {
					type: 'text',
					placeholder: 'Search options...'
				});
				searchBox.innerHTML = '<span class="material-symbols-outlined search-icon">search</span>';
				searchBox.appendChild(searchInput);
				menuPanel.appendChild(searchBox);

				searchInput.addEventListener('input', () => {
					const q = searchInput.value.toLowerCase().trim();
					const items = menuPanel.querySelectorAll('.custom-dropdown-item');
					items.forEach(item => {
						const text = item.textContent.toLowerCase();
						item.style.display = text.includes(q) ? 'flex' : 'none';
					});
				});
			}

			const optionsContainer = createElement('div', 'custom-dropdown-options-list');

			function syncHiddenInput(emitChange = false) {
				if (config.hiddenInputId) {
					const hiddenInput = document.getElementById(config.hiddenInputId);
					if (hiddenInput) {
						const newVal = config.isMulti ? JSON.stringify(selectedValues) : (selectedValues[0] !== undefined ? selectedValues[0] : '');
						if (hiddenInput.value !== newVal) {
							hiddenInput.value = newVal;
						}
						if (emitChange) {
							hiddenInput.dispatchEvent(new Event('change', { bubbles: true }));
						}
					}
				}
			}

			function updateDisplay(emitChange = false) {
				triggerLabel.innerHTML = '';
				if (selectedValues.length === 0 || (selectedValues.length === 1 && selectedValues[0] === '')) {
					triggerLabel.innerHTML = `<span class="custom-dropdown-placeholder">${escapeHtml(config.placeholder || 'Select an option...')}</span>`;
					syncHiddenInput(emitChange);
					return;
				}

				if (!config.isMulti) {
					const found = optionsList.find(o => String(o.value) === String(selectedValues[0]));
					triggerLabel.textContent = found ? found.label : selectedValues[0];
				} else {
					selectedValues.forEach(val => {
						const found = optionsList.find(o => String(o.value) === String(val));
						const chip = createElement('span', 'custom-dropdown-chip');
						chip.textContent = found ? found.label : val;

						const removeBtn = createElement('span', 'material-symbols-outlined chip-remove', { textContent: 'close' });
						removeBtn.addEventListener('click', (e) => {
							e.stopPropagation();
							selectedValues = selectedValues.filter(v => v !== val);
							updateDisplay(true);
							renderOptions();
							if (typeof config.onChange === 'function') {
								config.onChange(selectedValues, optionsList.filter(o => selectedValues.includes(o.value)));
							}
						});
						chip.appendChild(removeBtn);
						triggerLabel.appendChild(chip);
					});
				}
				syncHiddenInput(emitChange);
			}

			function renderOptions() {
				optionsContainer.innerHTML = '';
				if (optionsList.length === 0) {
					const emptyOpt = createElement('div', 'custom-dropdown-item', { textContent: 'No options available' });
					emptyOpt.style.opacity = '0.6';
					emptyOpt.style.cursor = 'default';
					optionsContainer.appendChild(emptyOpt);
					return;
				}

				optionsList.forEach(opt => {
					const isSelected = selectedValues.some(v => String(v) === String(opt.value));
					const optEl = createElement('div', `custom-dropdown-item ${isSelected ? 'selected' : ''}`);

					if (config.isMulti) {
						const checkbox = createElement('span', 'material-symbols-outlined item-checkbox', {
							textContent: isSelected ? 'check_box' : 'check_box_outline_blank'
						});
						optEl.appendChild(checkbox);
					}

					const textEl = createElement('span', 'item-label', { textContent: opt.label });
					optEl.appendChild(textEl);

					if (!config.isMulti && isSelected) {
						const checkIcon = createElement('span', 'material-symbols-outlined item-check', { textContent: 'check' });
						optEl.appendChild(checkIcon);
					}

					optEl.addEventListener('click', (e) => {
						e.stopPropagation();
						if (!config.isMulti) {
							selectedValues = [opt.value];
							dropdownContainer.classList.remove('open');
						} else {
							if (isSelected) {
								selectedValues = selectedValues.filter(v => String(v) !== String(opt.value));
							} else {
								selectedValues.push(opt.value);
							}
						}
						updateDisplay(true);
						renderOptions();
						if (typeof config.onChange === 'function') {
							config.onChange(config.isMulti ? selectedValues : selectedValues[0], opt);
						}
					});

					optionsContainer.appendChild(optEl);
				});
			}

			menuPanel.appendChild(optionsContainer);
			dropdownContainer.appendChild(menuPanel);
			containerEl.appendChild(dropdownContainer);

			triggerBtn.addEventListener('click', (e) => {
				e.stopPropagation();
				const isOpen = dropdownContainer.classList.contains('open');
				if (!isOpen) {
					const rect = triggerBtn.getBoundingClientRect();
					const spaceBelow = window.innerHeight - rect.bottom;
					const spaceAbove = rect.top;
					if (spaceBelow < 240 && spaceAbove > spaceBelow) {
						dropdownContainer.classList.add('open-up');
					} else {
						dropdownContainer.classList.remove('open-up');
					}
					dropdownContainer.classList.add('open');

					const searchInput = menuPanel.querySelector('.custom-dropdown-search-input');
					if (searchInput) {
						setTimeout(() => searchInput.focus(), 50);
					}
				} else {
					dropdownContainer.classList.remove('open');
				}
			});

			const outsideClickHandler = (e) => {
				if (!dropdownContainer.contains(e.target)) {
					dropdownContainer.classList.remove('open');
				}
			};
			document.addEventListener('click', outsideClickHandler);

			updateDisplay(false);
			renderOptions();

			return {
				container: dropdownContainer,
				trigger: triggerBtn,
				getValue: () => config.isMulti ? [...selectedValues] : (selectedValues[0] !== undefined ? selectedValues[0] : null),
				setValue: (val) => {
					if (Array.isArray(val)) {
						selectedValues = [...val];
					} else if (val !== undefined && val !== null && val !== '') {
						selectedValues = [val];
					} else {
						selectedValues = [];
					}
					updateDisplay(true);
					renderOptions();
				},
				setOptions: (newOpts, newDefaultVal) => {
					optionsList = (newOpts || []).map(opt => (typeof opt === 'string' || typeof opt === 'number' ? { label: String(opt), value: opt } : opt));
					if (newDefaultVal !== undefined) {
						selectedValues = Array.isArray(newDefaultVal) ? [...newDefaultVal] : (newDefaultVal !== null && newDefaultVal !== '' ? [newDefaultVal] : []);
					}
					updateDisplay();
					renderOptions();
				},
				close: () => dropdownContainer.classList.remove('open'),
				destroy: () => {
					document.removeEventListener('click', outsideClickHandler);
					containerEl.innerHTML = '';
				}
			};
		},

		/**
		 * Standalone Component: Dynamic Masked Password Input
		 * 
		 * @param {HTMLElement|string} target Target element or query selector
		 * @param {Object} [config={}] Options
		 * @returns {Object} Controller: { getValue(), setValue(val), focus() }
		 */
		createPasswordInput(target, config = {}) {
			const containerEl = typeof target === 'string' ? document.querySelector(target) : target;
			if (!containerEl) return null;

			let isRevealed = false;
			let realPassword = config.defaultValue || '';
			let maskTimer = null;

			containerEl.innerHTML = '';
			const pwContainer = createElement('div', 'custom-modal-password-container');
			const pwInput = createElement('input', 'custom-modal-input custom-modal-password-input', {
				type: 'text',
				placeholder: config.placeholder || 'Enter password...',
				autocomplete: 'off',
				autocapitalize: 'off',
				spellcheck: 'false'
			});

			const eyeToggle = createElement('button', 'custom-modal-password-toggle', {
				type: 'button',
				title: 'Toggle password visibility',
				innerHTML: '<span class="material-symbols-outlined">visibility</span>'
			});

			function renderMasked(showLastChar = false) {
				if (isRevealed) {
					pwInput.value = realPassword;
					return;
				}
				if (realPassword.length === 0) {
					pwInput.value = '';
					return;
				}
				if (showLastChar && realPassword.length > 0) {
					const dots = '•'.repeat(realPassword.length - 1);
					pwInput.value = dots + realPassword[realPassword.length - 1];
				} else {
					pwInput.value = '•'.repeat(realPassword.length);
				}
			}

			pwInput.addEventListener('beforeinput', (e) => {
				if (isRevealed) return;
				const inputType = e.inputType;
				if (inputType === 'insertText' && e.data) {
					e.preventDefault();
					realPassword += e.data;
					renderMasked(true);
					clearTimeout(maskTimer);
					maskTimer = setTimeout(() => renderMasked(false), 900);
					if (typeof config.onChange === 'function') config.onChange(realPassword);
				} else if (inputType === 'deleteContentBackward') {
					e.preventDefault();
					realPassword = realPassword.slice(0, -1);
					renderMasked(false);
					clearTimeout(maskTimer);
					if (typeof config.onChange === 'function') config.onChange(realPassword);
				}
			});

			pwInput.addEventListener('input', () => {
				if (isRevealed) {
					realPassword = pwInput.value;
					if (typeof config.onChange === 'function') config.onChange(realPassword);
				}
			});

			eyeToggle.addEventListener('click', () => {
				isRevealed = !isRevealed;
				clearTimeout(maskTimer);
				eyeToggle.innerHTML = `<span class="material-symbols-outlined">${isRevealed ? 'visibility_off' : 'visibility'}</span>`;
				renderMasked(false);
			});

			renderMasked(false);
			pwContainer.appendChild(pwInput);
			pwContainer.appendChild(eyeToggle);
			containerEl.appendChild(pwContainer);

			return {
				getValue: () => realPassword,
				setValue: (val) => {
					realPassword = String(val || '');
					renderMasked(false);
				},
				focus: () => pwInput.focus()
			};
		},

		/**
		 * Standalone Component: Lightweight Toast Notification
		 * 
		 * @param {string} message Toast message
		 * @param {Object} [options={}] Options: { type: 'info'|'success'|'warning'|'error', duration: 3000 }
		 */
		toast(message, options = {}) {
			let toastContainer = document.getElementById('customToastContainer');
			if (!toastContainer) {
				toastContainer = createElement('div', 'custom-toast-container', { id: 'customToastContainer' });
				document.body.appendChild(toastContainer);
			}

			const type = options.type || 'info';
			const duration = options.duration || 3000;
			const toastEl = createElement('div', `custom-toast ${type}`);

			let iconName = 'info';
			if (type === 'success') iconName = 'check_circle';
			else if (type === 'warning') iconName = 'warning';
			else if (type === 'error') iconName = 'error';

			toastEl.innerHTML = `
				<span class="material-symbols-outlined" style="font-size: 20px;">${iconName}</span>
				<span>${escapeHtml(message)}</span>
			`;

			toastContainer.appendChild(toastEl);
			requestAnimationFrame(() => toastEl.classList.add('active'));

			setTimeout(() => {
				toastEl.classList.remove('active');
				setTimeout(() => {
					if (toastEl.parentNode) toastEl.parentNode.removeChild(toastEl);
				}, 250);
			}, duration);
		},

		/**
		 * Close and resolve the active modal
		 */
		close(result = null) {
			const backdrop = document.getElementById('customModalBackdrop');
			if (backdrop) {
				backdrop.classList.remove('active');
				if (keydownHandler) {
					document.removeEventListener('keydown', keydownHandler);
					keydownHandler = null;
				}
				setTimeout(() => {
					if (backdrop.parentNode) {
						backdrop.parentNode.removeChild(backdrop);
					}
				}, 220);
			}

			if (currentResolver) {
				const resolver = currentResolver;
				currentResolver = null;
				currentRejecter = null;
				resolver(result);
			}
		},

		/**
		 * Internal Render Engine
		 */
		_render(config) {
			// Remove any leftover modal backdrop
			const existing = document.getElementById('customModalBackdrop');
			if (existing && existing.parentNode) {
				existing.parentNode.removeChild(existing);
			}

			// Backdrop Overlay
			const backdrop = createElement('div', 'custom-modal-backdrop', { id: 'customModalBackdrop' });
			if (config.closeOnBackdrop) {
				backdrop.addEventListener('click', (e) => {
					if (e.target === backdrop) {
						CustomModal.close(null);
					}
				});
			}

			// Modal Container
			const container = createElement('div', `custom-modal-container type-${config.type} ${config.customClass}`);
			if (config.width) container.style.maxWidth = config.width;
			container.addEventListener('click', (e) => e.stopPropagation());

			// Header
			const header = createElement('div', 'custom-modal-header');
			
			const headerLeft = createElement('div', 'custom-modal-header-left');
			if (config.icon) {
				const iconBadge = createElement('div', `custom-modal-icon-badge ${config.type}`);
				iconBadge.innerHTML = `<span class="material-symbols-outlined">${escapeHtml(config.icon)}</span>`;
				headerLeft.appendChild(iconBadge);
			}
			const titleEl = createElement('h3', 'custom-modal-title', { textContent: config.title });
			headerLeft.appendChild(titleEl);
			header.appendChild(headerLeft);

			if (config.showCloseBtn) {
				const closeBtn = createElement('button', 'custom-modal-close-btn', {
					'aria-label': 'Close modal',
					innerHTML: '<span class="material-symbols-outlined">close</span>'
				});
				closeBtn.addEventListener('click', () => CustomModal.close(null));
				header.appendChild(closeBtn);
			}
			container.appendChild(header);

			// Body
			const body = createElement('div', 'custom-modal-body');
			if (config.message) {
				const messageEl = createElement('div', 'custom-modal-message');
				messageEl.innerHTML = config.message;
				body.appendChild(messageEl);
			}
			if (config.html) {
				const htmlEl = createElement('div', 'custom-modal-html');
				if (typeof config.html === 'string') {
					htmlEl.innerHTML = config.html;
				} else if (config.html instanceof HTMLElement) {
					htmlEl.appendChild(config.html);
				}
				body.appendChild(htmlEl);
			}

			// Input Element Handler & State
			let inputGetter = () => null;
			let focusTarget = null;
			const errorEl = createElement('div', 'custom-modal-error-msg');
			errorEl.style.display = 'none';

			if (config.inputType) {
				const inputWrapper = createElement('div', 'custom-modal-input-wrapper');

				// 1. Password with character reveal timer
				if (config.inputType === 'password') {
					let realPassword = String(config.defaultValue || '');
					let maskTimer = null;
					let isRevealed = false;

					const pwContainer = createElement('div', 'custom-modal-password-container');
					const pwInput = createElement('input', 'custom-modal-input password-input', {
						type: 'text',
						placeholder: config.placeholder || 'Enter password...',
						autocomplete: 'off',
						spellcheck: 'false'
					});

					const eyeToggle = createElement('button', 'custom-modal-password-toggle', {
						type: 'button',
						'aria-label': 'Toggle password visibility',
						innerHTML: '<span class="material-symbols-outlined">visibility</span>'
					});

					function renderMasked(showLastChar = false) {
						if (isRevealed) {
							pwInput.value = realPassword;
							return;
						}
						if (realPassword.length === 0) {
							pwInput.value = '';
							return;
						}
						if (showLastChar && realPassword.length > 0) {
							const dots = '•'.repeat(realPassword.length - 1);
							pwInput.value = dots + realPassword[realPassword.length - 1];
						} else {
							pwInput.value = '•'.repeat(realPassword.length);
						}
					}

					pwInput.addEventListener('beforeinput', (e) => {
						if (isRevealed) return;
						const inputType = e.inputType;
						if (inputType === 'insertText' && e.data) {
							e.preventDefault();
							realPassword += e.data;
							renderMasked(true);
							clearTimeout(maskTimer);
							maskTimer = setTimeout(() => renderMasked(false), 900);
						} else if (inputType === 'deleteContentBackward') {
							e.preventDefault();
							realPassword = realPassword.slice(0, -1);
							renderMasked(false);
							clearTimeout(maskTimer);
						}
					});

					// Handle direct paste/input fallback
					pwInput.addEventListener('input', (e) => {
						if (isRevealed) {
							realPassword = pwInput.value;
						}
					});

					eyeToggle.addEventListener('click', () => {
						isRevealed = !isRevealed;
						clearTimeout(maskTimer);
						eyeToggle.innerHTML = `<span class="material-symbols-outlined">${isRevealed ? 'visibility_off' : 'visibility'}</span>`;
						renderMasked(false);
					});

					renderMasked(false);
					pwContainer.appendChild(pwInput);
					pwContainer.appendChild(eyeToggle);
					inputWrapper.appendChild(pwContainer);

					inputGetter = () => realPassword;
					focusTarget = pwInput;
				}
				// 2. Number Input
				else if (config.inputType === 'number') {
					const numInput = createElement('input', 'custom-modal-input', {
						type: 'number',
						placeholder: config.placeholder || '0',
						value: config.defaultValue !== undefined ? config.defaultValue : ''
					});
					if (config.min !== undefined) numInput.min = config.min;
					if (config.max !== undefined) numInput.max = config.max;
					if (config.step !== undefined) numInput.step = config.step;

					inputWrapper.appendChild(numInput);
					inputGetter = () => (numInput.value === '' ? null : Number(numInput.value));
					focusTarget = numInput;
				}
				// 3. Textarea
				else if (config.inputType === 'textarea') {
					const textarea = createElement('textarea', 'custom-modal-input custom-modal-textarea', {
						placeholder: config.placeholder || 'Type here...',
						rows: config.rows || '4',
						textContent: config.defaultValue || ''
					});
					inputWrapper.appendChild(textarea);
					inputGetter = () => textarea.value;
					focusTarget = textarea;
				}
				// 4. Custom Dropdown / Select (Single or Multi-select with chips)
				else if (config.inputType === 'dropdown' || config.inputType === 'select') {
					const dropdown = CustomModal.createDropdown(inputWrapper, config);
					inputGetter = () => dropdown ? dropdown.getValue() : null;
					focusTarget = dropdown ? dropdown.trigger : null;
				}
				// 5. Standard Text Input
				else {
					const textInput = createElement('input', 'custom-modal-input', {
						type: 'text',
						placeholder: config.placeholder || 'Enter text...',
						value: config.defaultValue || ''
					});
					inputWrapper.appendChild(textInput);
					inputGetter = () => textInput.value;
					focusTarget = textInput;
				}

				inputWrapper.appendChild(errorEl);
				body.appendChild(inputWrapper);
			}

			container.appendChild(body);

			// Footer with Action Buttons
			const footer = createElement('div', 'custom-modal-footer');

			async function handleAction(val) {
				errorEl.style.display = 'none';
				let finalVal = val;

				if (config.inputType && val === true) {
					finalVal = inputGetter();
				}

				// Validation logic
				if (config.validate && (val === true || (config.buttons && val !== false && val !== 'cancel'))) {
					try {
						const validationResult = await config.validate(finalVal);
						if (validationResult !== true) {
							errorEl.textContent = typeof validationResult === 'string' ? validationResult : 'Invalid input value.';
							errorEl.style.display = 'block';
							return;
						}
					} catch (err) {
						errorEl.textContent = err.message || 'Validation error.';
						errorEl.style.display = 'block';
						return;
					}
				}

				CustomModal.close(finalVal);
			}

			if (config.buttons && Array.isArray(config.buttons)) {
				config.buttons.forEach((btn, idx) => {
					const buttonEl = createElement('button', `custom-modal-btn btn-${btn.type || 'secondary'}`, {
						textContent: btn.text,
						type: 'button'
					});
					buttonEl.addEventListener('click', () => handleAction(btn.value !== undefined ? btn.value : btn.text));
					footer.appendChild(buttonEl);
					if (idx === config.buttons.length - 1 && !focusTarget) {
						focusTarget = buttonEl;
					}
				});
			} else {
				if (config.showCancel) {
					const cancelBtn = createElement('button', 'custom-modal-btn btn-secondary', {
						textContent: config.cancelText,
						type: 'button'
					});
					cancelBtn.addEventListener('click', () => CustomModal.close(false));
					footer.appendChild(cancelBtn);
				}

				const confirmBtn = createElement('button', `custom-modal-btn btn-${config.type === 'error' ? 'danger' : 'primary'}`, {
					textContent: config.confirmText,
					type: 'button'
				});
				confirmBtn.addEventListener('click', () => handleAction(true));
				footer.appendChild(confirmBtn);

				if (!focusTarget) {
					focusTarget = confirmBtn;
				}
			}

			container.appendChild(footer);
			backdrop.appendChild(container);
			document.body.appendChild(backdrop);

			// Trigger animated entrance
			requestAnimationFrame(() => {
				backdrop.classList.add('active');
				if (focusTarget && typeof focusTarget.focus === 'function') {
					setTimeout(() => focusTarget.focus(), 50);
				}
			});

			// Setup keyboard accessibility (Enter / Escape)
			keydownHandler = (e) => {
				if (e.key === 'Escape' && config.closeOnEscape) {
					e.preventDefault();
					CustomModal.close(null);
				} else if (e.key === 'Enter' && config.inputType !== 'textarea') {
					// If inside search input of dropdown, don't submit modal
					if (e.target.classList.contains('custom-dropdown-search-input')) return;
					e.preventDefault();
					handleAction(true);
				}
			};
			document.addEventListener('keydown', keydownHandler);
		}
	};

	return CustomModal;
}));
