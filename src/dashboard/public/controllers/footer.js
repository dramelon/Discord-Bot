/**
 * Footer Component Controller
 */
(function() {
	'use strict';
	const yearEl = document.getElementById('footerCurrentYear');
	if (yearEl) {
		yearEl.textContent = new Date().getFullYear().toString();
	}
})();
