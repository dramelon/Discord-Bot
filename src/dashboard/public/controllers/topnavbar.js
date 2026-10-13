/**
 * Top Navbar Component Controller
 */
(function() {
	'use strict';
	const topNavbar = document.getElementById('topNavbar');
	if (topNavbar) {
		window.addEventListener('scroll', () => {
			if (window.scrollY > 20) {
				topNavbar.classList.add('scrolled');
			} else {
				topNavbar.classList.remove('scrolled');
			}
		}, { passive: true });
	}
})();
