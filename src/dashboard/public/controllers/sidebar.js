/**
 * Sidebar Component Controller
 */
(function() {
	'use strict';
	const toggleBtn = document.getElementById('sidebarToggleBtn');
	if (toggleBtn) {
		toggleBtn.addEventListener('click', (e) => {
			e.preventDefault();
			if (window.innerWidth <= 768) {
				document.body.classList.toggle('mobile-sidebar-open');
			} else {
				document.body.classList.toggle('sidebar-collapsed');
			}
		});
	}
})();
