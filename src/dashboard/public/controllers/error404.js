/**
 * 404 Error Page Controller
 * Automatically identifies current host/origin and points user back to the origin root.
 */
document.addEventListener('DOMContentLoaded', () => {
	const currentOrigin = window.location.origin;
	const currentHost = window.location.host;
	const currentPath = window.location.pathname;

	// 1. Update visual labels
	const pathDisplay = document.getElementById('pathDisplay');
	if (pathDisplay && pathDisplay.textContent.includes('{{')) {
		pathDisplay.textContent = currentPath;
	}

	const domainDisplay = document.getElementById('domainDisplay');
	if (domainDisplay && domainDisplay.textContent.includes('{{')) {
		domainDisplay.textContent = currentHost;
	}

	const originDisplay = document.getElementById('originDisplay');
	if (originDisplay && originDisplay.textContent.includes('{{')) {
		originDisplay.textContent = currentOrigin;
	}

	// 2. Set return button to stay strictly within the current origin
	const returnOriginBtn = document.getElementById('returnOriginBtn');
	const returnOriginBtnText = document.getElementById('returnOriginBtnText');
	if (returnOriginBtn) {
		returnOriginBtn.href = currentOrigin + '/';
	}
	if (returnOriginBtnText) {
		returnOriginBtnText.textContent = `Return to ${currentHost}`;
	}

	// 3. Handle specific unhosted / separate subdomains like excel.furred.site
	const hostLower = currentHost.toLowerCase();
	const subdomainNotice = document.getElementById('subdomainNotice');
	const subdomainNoticeDetail = document.getElementById('subdomainNoticeDetail');

	if (hostLower.includes('excel')) {
		if (subdomainNotice && subdomainNoticeDetail) {
			subdomainNoticeDetail.textContent = 'excel.furred.site is a separate Excel Dashboard service that is not hosted on this bot or portfolio server instance and is not yet released.';
			subdomainNotice.style.display = 'flex';
		}
	}

	// 4. Hook up Go Back button
	const goBackBtn = document.getElementById('goBackBtn');
	if (goBackBtn) {
		goBackBtn.addEventListener('click', () => {
			if (window.history.length > 1) {
				window.history.back();
			} else {
				window.location.href = currentOrigin + '/';
			}
		});
	}
});
