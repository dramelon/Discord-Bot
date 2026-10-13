/**
 * Modal Testing Page Controller (Public Copy)
 * Demonstrates and verifies CustomModal methods & returned Promise values.
 */

(function () {
	'use strict';

	function logResult(type, payload) {
		const display = document.getElementById('modalResultDisplay');
		if (!display) return;
		const timestamp = new Date().toLocaleTimeString();
		const formatted = typeof payload === 'object' ? JSON.stringify(payload, null, 2) : String(payload);
		display.textContent = `[${timestamp}] [${type}] Returned Value:\n${formatted}\n\n` + (display.textContent.startsWith('//') ? '' : display.textContent);
	}

	function init() {
		// Clear console logs button
		const btnClear = document.getElementById('btnClearLogs');
		if (btnClear) {
			btnClear.addEventListener('click', () => {
				const display = document.getElementById('modalResultDisplay');
				if (display) display.textContent = '// Console output cleared.';
			});
		}

		// 1. Alert Triggers
		const btnAlertInfo = document.getElementById('btnAlertInfo');
		if (btnAlertInfo) {
			btnAlertInfo.addEventListener('click', async () => {
				const res = await CustomModal.alert('This is a clean informational alert dialog informing the user about general system updates.', {
					title: 'System Information',
					type: 'info'
				});
				logResult('CustomModal.alert(info)', res);
			});
		}

		const btnAlertSuccess = document.getElementById('btnAlertSuccess');
		if (btnAlertSuccess) {
			btnAlertSuccess.addEventListener('click', async () => {
				const res = await CustomModal.alert('Configuration changes have been saved and applied to the bot cluster.', {
					title: 'Operation Succeeded',
					type: 'success',
					buttonText: 'Awesome!'
				});
				logResult('CustomModal.alert(success)', res);
			});
		}

		const btnAlertWarning = document.getElementById('btnAlertWarning');
		if (btnAlertWarning) {
			btnAlertWarning.addEventListener('click', async () => {
				const res = await CustomModal.alert('API rate limit reached for secondary endpoint. Some requests might be throttled.', {
					title: 'Rate Limit Warning',
					type: 'warning',
					buttonText: 'Understood'
				});
				logResult('CustomModal.alert(warning)', res);
			});
		}

		const btnAlertError = document.getElementById('btnAlertError');
		if (btnAlertError) {
			btnAlertError.addEventListener('click', async () => {
				const res = await CustomModal.alert('Failed to connect to backend Discord Gateway shard #3. Please check firewall rules.', {
					title: 'Connection Error',
					type: 'error',
					buttonText: 'Dismiss'
				});
				logResult('CustomModal.alert(error)', res);
			});
		}

		// 2. Confirmation Dialogs
		const btnConfirmStandard = document.getElementById('btnConfirmStandard');
		if (btnConfirmStandard) {
			btnConfirmStandard.addEventListener('click', async () => {
				const confirmed = await CustomModal.confirm('Would you like to sync the server permissions with the discord bot cache now?', {
					title: 'Synchronize Cache?',
					confirmText: 'Yes, Sync Now',
					cancelText: 'Not Now'
				});
				logResult('CustomModal.confirm', confirmed);
			});
		}

		const btnConfirmDanger = document.getElementById('btnConfirmDanger');
		if (btnConfirmDanger) {
			btnConfirmDanger.addEventListener('click', async () => {
				const confirmed = await CustomModal.confirm('Are you sure you want to purge all active session tokens? All logged-in users will need to reconnect.', {
					title: 'Purge Active Sessions?',
					danger: true,
					confirmText: 'Purge Everything',
					cancelText: 'Cancel'
				});
				logResult('CustomModal.confirm(danger)', confirmed);
			});
		}

		const btnConfirmMultiChoice = document.getElementById('btnConfirmMultiChoice');
		if (btnConfirmMultiChoice) {
			btnConfirmMultiChoice.addEventListener('click', async () => {
				const action = await CustomModal.show({
					title: 'Choose Deployment Target',
					message: 'Select the environment where you would like to deploy the latest bot configuration build.',
					type: 'info',
					buttons: [
						{ text: 'Cancel', value: 'cancel', type: 'secondary' },
						{ text: 'Deploy to Staging', value: 'staging', type: 'warning' },
						{ text: 'Deploy to Production', value: 'production', type: 'primary' }
					]
				});
				logResult('CustomModal.show(Multi-buttons)', action);
			});
		}

		// 3. Text & Number Prompts
		const btnPromptText = document.getElementById('btnPromptText');
		if (btnPromptText) {
			btnPromptText.addEventListener('click', async () => {
				const val = await CustomModal.prompt('Please enter the custom bot activity status message:', {
					title: 'Update Bot Activity',
					placeholder: 'e.g. Playing with Dragons',
					defaultValue: 'Fluffingiously Dragooon v2.0',
					validate: (text) => {
						if (!text || text.trim().length < 3) {
							return 'Activity text must be at least 3 characters long.';
						}
						return true;
					}
				});
				logResult('CustomModal.prompt(text)', val);
			});
		}

		const btnPromptNumber = document.getElementById('btnPromptNumber');
		if (btnPromptNumber) {
			btnPromptNumber.addEventListener('click', async () => {
				const num = await CustomModal.prompt('Set the maximum concurrent audio stream buffer limit (1 - 100):', {
					title: 'Audio Buffer Configuration',
					inputType: 'number',
					defaultValue: 25,
					min: 1,
					max: 100,
					step: 1,
					validate: (val) => {
						if (val === null || isNaN(val)) return 'Please enter a valid number.';
						if (val < 1 || val > 100) return 'Number must be between 1 and 100.';
						return true;
					}
				});
				logResult('CustomModal.prompt(number)', num);
			});
		}

		const btnPromptTextarea = document.getElementById('btnPromptTextarea');
		if (btnPromptTextarea) {
			btnPromptTextarea.addEventListener('click', async () => {
				const note = await CustomModal.prompt('Enter notes or markdown announcement to dispatch to server logs:', {
					title: 'Guild Announcement Note',
					inputType: 'textarea',
					placeholder: 'Enter detailed announcement notes here...',
					confirmText: 'Post Note'
				});
				logResult('CustomModal.prompt(textarea)', note);
			});
		}

		// 4. Dynamic Password & Dropdowns
		const btnPromptPassword = document.getElementById('btnPromptPassword');
		if (btnPromptPassword) {
			btnPromptPassword.addEventListener('click', async () => {
				const secretKey = await CustomModal.prompt('Please enter the administrative master token to authorize this operation.\n(Notice: Characters are temporarily visible as you type before converting to dots)', {
					title: 'Admin Master Key Authorization',
					inputType: 'password',
					icon: 'lock',
					placeholder: 'Enter master secret...',
					validate: (pw) => {
						if (!pw || pw.length < 6) return 'Master key must be at least 6 characters.';
						return true;
					}
				});
				logResult('CustomModal.prompt(password)', secretKey);
			});
		}

		const btnPromptSingleSelect = document.getElementById('btnPromptSingleSelect');
		if (btnPromptSingleSelect) {
			btnPromptSingleSelect.addEventListener('click', async () => {
				const choice = await CustomModal.prompt('Select the primary server log level severity to filter:', {
					title: 'Filter Log Level',
					inputType: 'dropdown',
					placeholder: 'Choose severity level...',
					options: [
						{ label: 'DEBUG - Verbose diagnostic information', value: 'debug' },
						{ label: 'INFO - Standard operational events', value: 'info' },
						{ label: 'WARN - Potential warning issues', value: 'warn' },
						{ label: 'ERROR - Unhandled exceptions & errors', value: 'error' },
						{ label: 'CRITICAL - System crash / critical failures', value: 'critical' }
					],
					defaultValue: 'info'
				});
				logResult('CustomModal.prompt(single-dropdown)', choice);
			});
		}

		const btnPromptMultiSelect = document.getElementById('btnPromptMultiSelect');
		if (btnPromptMultiSelect) {
			btnPromptMultiSelect.addEventListener('click', async () => {
				const selectedFeatures = await CustomModal.prompt('Select all bot feature modules you wish to enable for this guild:', {
					title: 'Feature Modules Selector',
					inputType: 'dropdown',
					isMulti: true,
					placeholder: 'Select one or more modules...',
					options: [
						{ label: '🐉 Dragon AI Assistant', value: 'dragon_ai' },
						{ label: '🛡️ Auto-Moderation & Anti-Spam', value: 'auto_mod' },
						{ label: '🎵 Hi-Fi Voice Stream Engine', value: 'voice_engine' },
						{ label: '📊 Guild Telemetry & Analytics', value: 'analytics' },
						{ label: '🎮 Fun & Minigames System', value: 'minigames' },
						{ label: '🎫 Custom Ticket Support System', value: 'tickets' },
						{ label: '📜 Audit Log Streaming', value: 'audit_logs' }
					],
					defaultValue: ['dragon_ai', 'voice_engine'],
					validate: (items) => {
						if (!items || items.length === 0) return 'Please select at least 1 feature module.';
						return true;
					}
				});
				logResult('CustomModal.prompt(multi-dropdown-chips)', selectedFeatures);
			});
		}
	}

	if (document.readyState === 'loading') {
		document.addEventListener('DOMContentLoaded', init);
	} else {
		init();
	}
})();
