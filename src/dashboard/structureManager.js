const fs = require('fs');
const path = require('path');

const VALID_AUTH_LEVELS = new Set(['none', 'user', 'admin', 'owner', 'web_dev', 'guild_admin']);

class StructureManager {
	constructor(baseDirectory = __dirname) {
		this.baseDir = baseDirectory;
		this.structureFilePath = this.findStructureFile();
		this.structure = {};
		this.cachedSidebar = '';
		this.cachedTopnavbar = '';
		this.cachedFooter = '';
		this.cachedTemplate = '';
		this.cached404Html = '';
		this.compiledRoutes = [];
		this.whitelistedRoutes = new Set();
		this.scriptAllowlistPath = path.join(this.baseDir, 'config', 'script_allowlist.json');
		this.scriptAllowlist = {};
	}

	findStructureFile() {
		// const potentialPaths = [
		// 	path.join(this.baseDir, 'config', 'website_structure.json'),
		// 	path.join(this.baseDir, 'views', 'components', 'website_structure.json'),
		// 	path.join(this.baseDir, 'views', 'website_structure.json')
		// ];

		// for (const p of potentialPaths) {
		// 	if (fs.existsSync(p)) {
		// 		return p;
		// 	}
		// }

		return path.join(this.baseDir, 'config', 'website_structure.json');
	}

	loadComponents() {
		// 1. Sidebar Component
		const potentialSidebarPaths = [
			path.join(this.baseDir, 'public', 'components', 'sidebar.html'),
			path.join(this.baseDir, 'views', 'bot', 'sidebar.html'),
			path.join(this.baseDir, 'views', 'components', 'sidebar.html'),
			path.join(this.baseDir, 'views', 'sidebar.html')
		];

		for (const p of potentialSidebarPaths) {
			if (fs.existsSync(p)) {
				try {
					this.cachedSidebar = fs.readFileSync(p, 'utf8');
					break;
				} catch (e) {
					console.error('[Dashboard Structure] Error reading sidebar from:', p, e);
				}
			}
		}

		// 2. Top Navbar Component
		const potentialNavbarPaths = [
			path.join(this.baseDir, 'public', 'components', 'topnavbar.html'),
			path.join(this.baseDir, 'views', 'components', 'topnavbar.html')
		];

		for (const p of potentialNavbarPaths) {
			if (fs.existsSync(p)) {
				try {
					this.cachedTopnavbar = fs.readFileSync(p, 'utf8');
					break;
				} catch (e) {
					console.error('[Dashboard Structure] Error reading topnavbar from:', p, e);
				}
			}
		}

		// 3. Footer Component
		const potentialFooterPaths = [
			path.join(this.baseDir, 'public', 'components', 'footer.html'),
			path.join(this.baseDir, 'views', 'components', 'footer.html')
		];

		for (const p of potentialFooterPaths) {
			if (fs.existsSync(p)) {
				try {
					this.cachedFooter = fs.readFileSync(p, 'utf8');
					break;
				} catch (e) {
					console.error('[Dashboard Structure] Error reading footer from:', p, e);
				}
			}
		}

		// 4. Master Template Wrapper
		const potentialTemplatePaths = [
			path.join(this.baseDir, 'public', 'components', 'template.html'),
			path.join(this.baseDir, 'views', 'bot', 'template.html'),
			path.join(this.baseDir, 'views', 'template.html')
		];

		for (const p of potentialTemplatePaths) {
			if (fs.existsSync(p)) {
				try {
					this.cachedTemplate = fs.readFileSync(p, 'utf8');
					break;
				} catch (e) {
					console.error('[Dashboard Structure] Error reading master template from:', p, e);
				}
			}
		}

		// 5. 404 Error Page Template
		const potential404Paths = [
			path.join(this.baseDir, 'views', '404.html'),
			path.join(this.baseDir, 'public', '404.html'),
			path.join(this.baseDir, 'views', 'bot', '404.html'),
			path.join(this.baseDir, 'views', 'main', '404.html')
		];

		for (const p of potential404Paths) {
			if (fs.existsSync(p)) {
				try {
					this.cached404Html = fs.readFileSync(p, 'utf8');
					break;
				} catch (e) {
					console.error('[Dashboard Structure] Error reading 404 page template from:', p, e);
				}
			}
		}
	}

	resolveFilePath(relativeFilePath) {
		if (!relativeFilePath || typeof relativeFilePath !== 'string') return null;

		// 1. Direct path relative to dashboard root directory
		const candidateFromBase = path.resolve(this.baseDir, relativeFilePath);
		if (fs.existsSync(candidateFromBase)) {
			return candidateFromBase;
		}

		// 2. Direct path relative to workspace root
		const candidateFromRoot = path.resolve(this.baseDir, '..', '..', relativeFilePath);
		if (fs.existsSync(candidateFromRoot)) {
			return candidateFromRoot;
		}

		const candidateFromRootDashboard = path.resolve(this.baseDir, '..', '..', 'src', 'dashboard', relativeFilePath);
		if (fs.existsSync(candidateFromRootDashboard)) {
			return candidateFromRootDashboard;
		}

		// 3. Fallback checks across view and public directories
		const fallbacks = [
			path.join(this.baseDir, 'views', relativeFilePath),
			path.join(this.baseDir, 'views', 'bot', relativeFilePath),
			path.join(this.baseDir, 'views', 'main', relativeFilePath),
			path.join(this.baseDir, 'views', 'components', relativeFilePath),
			path.join(this.baseDir, 'public', relativeFilePath),
			path.join(this.baseDir, 'public', 'components', relativeFilePath)
		];

		for (const fb of fallbacks) {
			if (fs.existsSync(fb)) {
				return fb;
			}
		}

		return null;
	}

	renderComponentPlaceholders(htmlContent) {
		if (!htmlContent || typeof htmlContent !== 'string') return '';
		return htmlContent
			.replace(/<!--\s*INCLUDE_SIDEBAR\s*-->/g, this.cachedSidebar)
			.replace(/<!--\s*INCLUDE_TOPNAVBAR\s*-->/g, this.cachedTopnavbar)
			.replace(/<!--\s*INCLUDE_FOOTER\s*-->/g, this.cachedFooter);
	}

	/**
	 * Verify and load config/website_structure.json
	 */
	init() {
		console.log('\x1b[36m%s\x1b[0m', '--------------------------------------------------');
		console.log('\x1b[36m%s\x1b[0m', '[Dashboard Structure] Verifying config/website_structure.json...');
		
		if (!fs.existsSync(this.structureFilePath)) {
			throw new Error(`[Dashboard Structure] config/website_structure.json not found at ${this.structureFilePath}`);
		}

		let rawData;
		try {
			rawData = fs.readFileSync(this.structureFilePath, 'utf8');
			this.structure = JSON.parse(rawData);
		} catch (err) {
			throw new Error(`[Dashboard Structure] Failed to parse config/website_structure.json: ${err.message}`);
		}

		this.loadComponents();
		this.compiledRoutes = [];
		this.whitelistedRoutes = new Set();

		let validationErrors = 0;
		let totalRoutes = 0;

		for (const [domainKey, domainConfig] of Object.entries(this.structure)) {
			if (!domainConfig || typeof domainConfig !== 'object') {
				console.error(`\x1b[31m[Dashboard Structure] Invalid config object for domain: ${domainKey}\x1b[0m`);
				validationErrors++;
				continue;
			}

			const routes = domainConfig.routes || {};
			const errorPages = domainConfig.errorPages || {};

			// Cache 404 page if provided
			let cached404 = '<h1>404 Not Found</h1>';
			if (errorPages['404']) {
				const path404 = this.resolveFilePath(errorPages['404']);
				if (path404 && fs.existsSync(path404)) {
					cached404 = fs.readFileSync(path404, 'utf8');
					cached404 = this.renderComponentPlaceholders(cached404);
				}
			}

			console.log(`\x1b[34m[Domain: ${domainKey}]\x1b[0m`);

			for (const [routePattern, routeDef] of Object.entries(routes)) {
				totalRoutes++;
				let file = '';
				let auth = 'none';
				let components = null;

				if (typeof routeDef === 'string') {
					file = routeDef;
					auth = 'none';
				} else if (routeDef && typeof routeDef === 'object') {
					file = routeDef.html || routeDef.file;
					auth = routeDef.auth;
					components = routeDef.components || null;

					if (!auth || typeof auth !== 'string') {
						console.warn(`\x1b[33m[Dashboard Structure] Warning: Route "${routePattern}" in domain "${domainKey}" missing auth. Defaulting to "none".\x1b[0m`);
						auth = 'none';
					} else {
						auth = auth.toLowerCase().trim();
						if (!VALID_AUTH_LEVELS.has(auth)) {
							console.warn(`\x1b[33m[Dashboard Structure] Warning: Route "${routePattern}" has invalid auth "${auth}". Defaulting to "none". Valid levels: ${[...VALID_AUTH_LEVELS].join(', ')}\x1b[0m`);
							auth = 'none';
						}
					}
				} else {
					console.error(`\x1b[31m[Dashboard Structure] Error: Invalid route definition for "${routePattern}" on "${domainKey}"\x1b[0m`);
					validationErrors++;
					continue;
				}

				if (!file || typeof file !== 'string') {
					console.error(`\x1b[31m[Dashboard Structure] Error: Missing template "html" or "file" property for route "${routePattern}" on "${domainKey}"\x1b[0m`);
					validationErrors++;
					continue;
				}

				const resolvedPath = this.resolveFilePath(file);
				let rawHtml = '';

				if (resolvedPath && fs.existsSync(resolvedPath)) {
					try {
						rawHtml = fs.readFileSync(resolvedPath, 'utf8');
					} catch (err) {
						console.error(`\x1b[31m[Dashboard Structure] Error reading file ${resolvedPath}: ${err.message}\x1b[0m`);
						rawHtml = `<h1>Template Error for ${file}</h1>`;
					}
				} else {
					console.warn(`\x1b[33m[Dashboard Structure] Warning: File "${file}" for route "${routePattern}" not found on disk.\x1b[0m`);
					rawHtml = `<h1>404 - Template ${file} not found</h1>`;
				}

				let cachedHtml = '';
				const includes = (components && Array.isArray(components.include)) ? components.include : [];
				const templateInclude = includes.find(inc => inc.endsWith('template.html'));

				if (templateInclude && (!rawHtml.includes('<!DOCTYPE') && !rawHtml.includes('<html') || file.endsWith('template.html'))) {
					// Master template wrapping
					let templateContent = this.cachedTemplate;
					const resolvedTemplatePath = this.resolveFilePath(templateInclude);
					if (resolvedTemplatePath && fs.existsSync(resolvedTemplatePath)) {
						try {
							templateContent = fs.readFileSync(resolvedTemplatePath, 'utf8');
						} catch (e) {}
					}
					let assembled = templateContent.replace(/<!--\s*PAGE_CONTENT\s*-->/g, rawHtml);
					cachedHtml = this.renderComponentPlaceholders(assembled);
				} else {
					// Standalone page rendering with component placeholders
					cachedHtml = this.renderComponentPlaceholders(rawHtml);
				}

				// Build route matcher regex if parameterized
				let isParam = false;
				let regex = null;
				let paramNames = [];

				if (routePattern.includes(':')) {
					isParam = true;
					const patternWithRegex = routePattern.replace(/:([a-zA-Z0-9_]+)/g, (_, p1) => {
						paramNames.push(p1);
						return '([a-zA-Z0-9_-]+)';
					});
					regex = new RegExp(`^${patternWithRegex}$`);
				}

				this.compiledRoutes.push({
					domainKey,
					isBotDomain: domainKey.startsWith('bot.'),
					routePattern,
					isParam,
					regex,
					paramNames,
					file,
					auth,
					components,
					resolvedPath,
					cachedHtml,
					cached404
				});

				this.whitelistedRoutes.add(routePattern);
				if (!routePattern.includes(':')) {
					this.whitelistedRoutes.add(`${routePattern}.html`);
				}

				if (components) {
					if (Array.isArray(components.css)) {
						for (const cssFile of components.css) {
							const formatted = cssFile.startsWith('/') ? cssFile : `/${cssFile}`;
							this.whitelistedRoutes.add(formatted);
						}
					}
					if (Array.isArray(components.controller)) {
						for (const ctrlFile of components.controller) {
							const formatted = ctrlFile.startsWith('/') ? ctrlFile : `/${ctrlFile}`;
							this.whitelistedRoutes.add(formatted);
						}
					}
				}

				console.log(`  ✓ ${routePattern.padEnd(20)} -> [auth: ${auth.padEnd(11)}] ${file}`);
			}
		}

		// Load script allowlist from config/script_allowlist.json
		if (fs.existsSync(this.scriptAllowlistPath)) {
			try {
				const scriptRaw = fs.readFileSync(this.scriptAllowlistPath, 'utf8');
				this.scriptAllowlist = JSON.parse(scriptRaw);
				let scriptCount = 0;
				for (const [dKey, scripts] of Object.entries(this.scriptAllowlist)) {
					if (scripts && typeof scripts === 'object') {
						for (const scriptRoute of Object.keys(scripts)) {
							this.whitelistedRoutes.add(scriptRoute);
							scriptCount++;
						}
					}
				}
				console.log(`[Dashboard Structure] Loaded ${scriptCount} allowed script routes from config/script_allowlist.json`);
			} catch (err) {
				console.error(`\x1b[31m[Dashboard Structure] Error loading config/script_allowlist.json: ${err.message}\x1b[0m`);
			}
		}

		if (validationErrors > 0) {
			console.error(`\x1b[31m[Dashboard Structure] Verification completed with ${validationErrors} errors.\x1b[0m`);
		} else {
			console.log(`\x1b[32m[Dashboard Structure] Verification SUCCESS: ${totalRoutes} routes loaded across ${Object.keys(this.structure).length} domains.\x1b[0m`);
		}
		console.log('\x1b[36m%s\x1b[0m', '--------------------------------------------------');
	}

	resolveScriptPath(domainKey, reqUrl) {
		if (!domainKey || !this.scriptAllowlist[domainKey]) return null;
		const relativePath = this.scriptAllowlist[domainKey][reqUrl];
		if (!relativePath) return null;
		return this.resolveFilePath(relativePath);
	}

	getWhitelistedRoutes() {
		return this.whitelistedRoutes;
	}

	/**
	 * Resolves which website_structure domain key matches the incoming Host header.
	 * Returns 'furred.site', 'bot.furred.site', or null if host is unknown/separate.
	 * Subdomains like excel.furred.site or excel.localhost are separate applications
	 * and return null so they do not fall back to furred.site or bot.furred.site.
	 */
	resolveDomainKey(hostHeader) {
		if (!hostHeader || typeof hostHeader !== 'string') return null;
		const host = hostHeader.toLowerCase().split(':')[0].trim();

		// 1. Bot Domain: bot.furred.site, bot.localhost, bot.127.0.0.1
		if (host === 'bot.furred.site' || host === 'bot.localhost' || host === 'bot.127.0.0.1') {
			return 'bot.furred.site';
		}

		// 2. Main Domain: furred.site, www.furred.site, localhost, 127.0.0.1
		if (host === 'furred.site' || host === 'www.furred.site' || host === 'localhost' || host === '127.0.0.1') {
			return 'furred.site';
		}

		// 3. Separate or unhandled domains (e.g. excel.furred.site, excel.localhost)
		return null;
	}

	/**
	 * Renders the custom 404 error page with appropriate placeholders
	 */
	render404(req, res, details = {}) {
		if (res.headersSent) return false;
		const hostHeader = req.headers.host || 'localhost';
		const protocol = req.headers['x-forwarded-proto'] || (req.socket?.encrypted || hostHeader.includes('furred') ? 'https' : 'http');
		const origin = `${protocol}://${hostHeader}`;
		let reqPath = '/';
		try {
			const parsed = new URL(req.url, origin);
			reqPath = parsed.pathname;
		} catch (e) {
			reqPath = req.url || '/';
		}

		let html = this.cached404Html || '<!DOCTYPE html><html><head><title>404 Not Found</title></head><body><h1>404 Not Found</h1></body></html>';
		html = html
			.replace(/\{\{REQUESTED_PATH\}\}/g, reqPath)
			.replace(/\{\{CURRENT_HOST\}\}/g, hostHeader)
			.replace(/\{\{ORIGIN\}\}/g, origin);

		res.writeHead(404, {
			'Content-Type': 'text/html; charset=utf-8',
			'X-Content-Type-Options': 'nosniff',
			'X-Frame-Options': 'DENY'
		});
		res.end(html);
		return true;
	}

	/**
	 * Matches and handles page requests according to config/website_structure.json
	 */
	async handleRoute(req, res, { client, sessions, userHasGuildPermission, getAuthenticatedUser, getDashboardUrl, parseCookies, isLocalEnvironment }) {
		const hostHeader = req.headers.host || '';
		const currentDomainKey = this.resolveDomainKey(hostHeader);
		
		const parsedUrl = new URL(req.url, `http://${hostHeader || 'localhost'}`);
		const reqUrl = parsedUrl.pathname;

		// Skip API endpoints and static styles/scripts to let dedicated handlers process them
		if (reqUrl.startsWith('/api/') || 
		    reqUrl.startsWith('/script/') ||
		    reqUrl === '/dashboard.css' || 
		    reqUrl.toLowerCase() === '/style/style.css' || 
		    reqUrl === '/style.css' || 
		    reqUrl.startsWith('/styles/') || 
		    reqUrl.startsWith('/controllers/') || 
		    reqUrl.startsWith('/components/') || 
		    reqUrl.startsWith('/public/') || 
		    reqUrl.startsWith('/shares/') || 
		    reqUrl.startsWith('/.well-known/') || 
		    reqUrl === '/favicon.ico') {
			return false;
		}

		// If domain is not hosted by this application (e.g. excel.furred.site, excel.localhost), render 404
		if (!currentDomainKey) {
			return this.render404(req, res, { hostHeader, reason: 'unhandled_domain' });
		}

		// Normalize url: strip trailing slash (unless root) and optional .html
		let normalizedUrl = reqUrl;
		if (normalizedUrl.length > 1 && normalizedUrl.endsWith('/')) {
			normalizedUrl = normalizedUrl.slice(0, -1);
		}
		if (normalizedUrl.length > 5 && normalizedUrl.endsWith('.html')) {
			normalizedUrl = normalizedUrl.slice(0, -5);
		}

		// 1. Find matching route for the target domain
		let matchedRoute = null;
		let pathParams = {};

		for (const route of this.compiledRoutes) {
			if (route.domainKey !== currentDomainKey) {
				continue;
			}

			if (!route.isParam) {
				if (route.routePattern === reqUrl || route.routePattern === normalizedUrl) {
					matchedRoute = route;
					break;
				}
			} else if (route.regex) {
				const match = reqUrl.match(route.regex) || normalizedUrl.match(route.regex);
				if (match) {
					matchedRoute = route;
					route.paramNames.forEach((name, idx) => {
						pathParams[name] = match[idx + 1];
					});
					break;
				}
			}
		}

		// If not matched on current domain, render 404 directly (do not cross-domain redirect!)
		if (!matchedRoute) {
			return this.render404(req, res, { currentDomainKey, hostHeader });
		}

		// 2. Process Authentication Level
		const auth = matchedRoute.auth || 'none';

		if (auth === 'none') {
			// Public route - serve page directly (404 status if error route)
			const statusCode = (matchedRoute.routePattern === '/404' || matchedRoute.routePattern === '/404.html') ? 404 : 200;
			res.writeHead(statusCode, { 'Content-Type': 'text/html; charset=utf-8' });
			res.end(matchedRoute.cachedHtml);
			return true;
		}

		const user = await getAuthenticatedUser(req, res, client).catch(() => null);
		const isLocal = isLocalEnvironment ? isLocalEnvironment(req) : (process.env.STANDALONE === 'true' || process.env.IS_DEV === 'true');

		if (auth === 'user') {
			if (!user) {
				res.writeHead(302, { 'Location': `/api/auth/login?from=${encodeURIComponent(reqUrl)}` });
				res.end();
				return true;
			}
			res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
			res.end(matchedRoute.cachedHtml);
			return true;
		}

		if (auth === 'admin') {
			const hasAdmin = user && (user.isAdmin || user.isOwner || user.isWebDev || user.userId === 'mock_user_id');
			if (!hasAdmin) {
				res.writeHead(302, { 'Location': `/api/auth/login?from=${encodeURIComponent(reqUrl)}` });
				res.end();
				return true;
			}
			res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
			res.end(matchedRoute.cachedHtml);
			return true;
		}

		if (auth === 'owner') {
			const isOwnerUser = user && (user.isWebDev || user.isOwner || user.userId === '389264086753345548' || (isLocal && user.userId === 'mock_user_id'));
			if (!isOwnerUser) {
				res.writeHead(302, { 'Location': `/api/auth/login?from=${encodeURIComponent(reqUrl)}` });
				res.end();
				return true;
			}
			res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
			res.end(matchedRoute.cachedHtml);
			return true;
		}

		if (auth === 'web_dev') {
			// web_dev pages are strictly restricted to localhost development environment
			const isWebDevUser = isLocal && user && (user.isWebDev || user.userId === 'mock_user_id');
			if (!isWebDevUser) {
				res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
				res.end('Forbidden: Web Dev access is restricted to localhost development only.');
				return true;
			}
			res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
			res.end(matchedRoute.cachedHtml);
			return true;
		}

		if (auth === 'guild_admin') {
			if (!user) {
				res.writeHead(302, { 'Location': `/api/auth/login?from=${encodeURIComponent(reqUrl)}` });
				res.end();
				return true;
			}

			// In localhost / standalone mock mode, grant full access to guild configuration
			if (isLocal && (user.isWebDev || user.userId === 'mock_user_id' || user.isOwner)) {
				res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
				res.end(matchedRoute.cachedHtml);
				return true;
			}

			const serverId = pathParams.id;
			if (!serverId) {
				res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
				res.end('Bad Request: Missing guild ID');
				return true;
			}

			const cookies = parseCookies(req);
			const sessionId = cookies.session_id;
			const session = sessions ? sessions[sessionId] : null;
			const hasPermission = await userHasGuildPermission(session, serverId);

			if (!hasPermission) {
				res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
				res.end('Forbidden: You do not have Manage Server permissions for this guild.');
				return true;
			}

			res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
			res.end(matchedRoute.cachedHtml);
			return true;
		}

		// Fallback
		res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
		res.end(matchedRoute.cachedHtml);
		return true;
	}
}

module.exports = new StructureManager();
