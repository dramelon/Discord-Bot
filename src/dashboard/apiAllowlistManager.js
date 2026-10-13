const fs = require('fs');
const path = require('path');
const os = require('os');

class ApiAllowlistManager {
	constructor(baseDirectory = __dirname) {
		this.baseDir = baseDirectory;
		this.internalConfigPath = path.join(this.baseDir, 'config', 'internal_api_allowlist.json');
		this.externalConfigPath = path.join(this.baseDir, 'config', 'external_api_allowlist.json');
		
		this.internalAllowlist = {};
		this.externalAllowlist = {};
		
		this.compiledInternalRules = [];
		this.compiledExternalRules = [];
		
		this.isLocalHost = false;
		try {
			this.isLocalHost = process.platform === 'darwin' || os.userInfo().username === 'newdramelon' || process.cwd().includes('newdramelon');
		} catch (e) {
			this.isLocalHost = process.platform === 'darwin' || process.cwd().includes('newdramelon');
		}
	}

	init() {
		this.loadInternalAllowlist();
		this.loadExternalAllowlist();
		console.log(`[API Allowlist] Initialized with ${this.compiledInternalRules.length} internal and ${this.compiledExternalRules.length} external API rules.`);
	}

	loadInternalAllowlist() {
		try {
			if (fs.existsSync(this.internalConfigPath)) {
				const raw = fs.readFileSync(this.internalConfigPath, 'utf8');
				this.internalAllowlist = JSON.parse(raw);
				this.compiledInternalRules = this._compileRules(this.internalAllowlist);
			} else {
				console.warn(`[API Allowlist] Internal allowlist file not found at ${this.internalConfigPath}`);
				this.internalAllowlist = {};
				this.compiledInternalRules = [];
			}
		} catch (err) {
			console.error(`[API Allowlist] Error loading internal API allowlist:`, err);
		}
	}

	loadExternalAllowlist() {
		try {
			if (fs.existsSync(this.externalConfigPath)) {
				const raw = fs.readFileSync(this.externalConfigPath, 'utf8');
				this.externalAllowlist = JSON.parse(raw);
				this.compiledExternalRules = this._compileRules(this.externalAllowlist);
			} else {
				console.warn(`[API Allowlist] External allowlist file not found at ${this.externalConfigPath}`);
				this.externalAllowlist = {};
				this.compiledExternalRules = [];
			}
		} catch (err) {
			console.error(`[API Allowlist] Error loading external API allowlist:`, err);
		}
	}

	/**
	 * Compile allowlist dictionary into regex patterns and uppercase methods
	 */
	_compileRules(dict) {
		const rules = [];
		for (const [pattern, methods] of Object.entries(dict)) {
			if (!Array.isArray(methods)) continue;
			const upperMethods = new Set(methods.map(m => String(m).toUpperCase()));

			let regex = null;
			let isExact = true;

			if (pattern.includes('*') || pattern.includes(':')) {
				isExact = false;
				// Escape special regex characters except * and :
				let regStr = pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
				// Replace named params like :id
				regStr = regStr.replace(/:([a-zA-Z0-9_]+)/g, '[^/?#]+');
				// Replace wildcards *
				regStr = regStr.replace(/\*/g, '.*?');
				regex = new RegExp(`^${regStr}$`);
			}

			rules.push({
				pattern,
				isExact,
				regex,
				methods: upperMethods
			});
		}
		return rules;
	}

	/**
	 * Checks if the system is running in debug mode or on localhost
	 */
	isLocalOrDebug(req = null) {
		if (process.env.DEBUG === 'true' || 
		    process.env.STANDALONE === 'true' || 
		    process.env.IS_DEV === 'true' || 
		    process.env.NODE_ENV === 'development') {
			return true;
		}

		if (req) {
			const host = (req.headers && req.headers.host) ? String(req.headers.host).toLowerCase() : '';
			if (host.includes('localhost') || host.includes('127.0.0.1') || host.startsWith('bot.localhost')) {
				return true;
			}
		}

		return this.isLocalHost;
	}

	/**
	 * Match a target URL/path against compiled rules
	 */
	_matchRule(rules, targetString, method) {
		const upperMethod = (method || 'GET').toUpperCase();

		// Check exact matches first
		for (const rule of rules) {
			if (rule.isExact && rule.pattern === targetString) {
				if (rule.methods.has(upperMethod) || rule.methods.has('*') || rule.methods.has('ALL')) {
					return { matched: true, allowed: true, pattern: rule.pattern };
				}
				return { 
					matched: true, 
					allowed: false, 
					pattern: rule.pattern, 
					reason: `Method ${upperMethod} not allowed. Allowed: [${Array.from(rule.methods).join(', ')}]` 
				};
			}
		}

		// Check regex patterns
		for (const rule of rules) {
			if (!rule.isExact && rule.regex && rule.regex.test(targetString)) {
				if (rule.methods.has(upperMethod) || rule.methods.has('*') || rule.methods.has('ALL')) {
					return { matched: true, allowed: true, pattern: rule.pattern };
				}
				return { 
					matched: true, 
					allowed: false, 
					pattern: rule.pattern, 
					reason: `Method ${upperMethod} not allowed. Allowed: [${Array.from(rule.methods).join(', ')}]` 
				};
			}
		}

		return { matched: false, allowed: false, reason: `Path "${targetString}" is not in allowlist` };
	}

	/**
	 * Check and validate incoming Internal API call
	 * @param {string} method - HTTP method (GET, POST, etc.)
	 * @param {string} fullUrl - URL or path of the request
	 * @param {object} req - Raw HTTP request object (optional)
	 * @param {string} clientIp - Client IP address (optional)
	 * @returns {{ allowed: boolean, reason?: string, pattern?: string }}
	 */
	checkInternalApi(method, fullUrl, req = null, clientIp = 'unknown') {
		const upperMethod = (method || 'GET').toUpperCase();
		let pathname = fullUrl;
		try {
			if (fullUrl.startsWith('http://') || fullUrl.startsWith('https://')) {
				const parsed = new URL(fullUrl);
				pathname = parsed.pathname;
			} else {
				const parsed = new URL(fullUrl, 'http://localhost');
				pathname = parsed.pathname;
			}
		} catch (e) {
			pathname = fullUrl.split('?')[0];
		}

		const result = this._matchRule(this.compiledInternalRules, pathname, upperMethod);

		// If not allowed, warn to console
		if (!result.allowed) {
			console.warn('\x1b[33m%s\x1b[0m', `[Internal API Security] WARNING: Unallowed internal API call: ${upperMethod} ${pathname} from IP ${clientIp} (Reason: ${result.reason})`);
		}

		// If running in debug mode / on localhost, print out the API call
		if (this.isLocalOrDebug(req)) {
			const statusColor = result.allowed ? '\x1b[32m[ALLOWED]\x1b[0m' : '\x1b[31m[UNALLOWED]\x1b[0m';
			console.log(`\x1b[36m[API Debug - Internal]\x1b[0m ${upperMethod.padEnd(6)} ${pathname.padEnd(30)} ${statusColor} (IP: ${clientIp})`);
		}

		return result;
	}

	/**
	 * Check and validate outgoing External API call
	 * @param {string} method - HTTP method (GET, POST, etc.)
	 * @param {string|URL} url - Full target URL or path
	 * @returns {{ allowed: boolean, reason?: string, pattern?: string }}
	 */
	checkExternalApi(method, url) {
		const upperMethod = (method || 'GET').toUpperCase();
		const urlString = String(url);

		let fullUrlWithoutQuery = urlString;
		let pathname = urlString;

		try {
			const parsed = new URL(urlString);
			fullUrlWithoutQuery = `${parsed.protocol}//${parsed.host}${parsed.pathname}`;
			pathname = parsed.pathname;
		} catch (e) {
			pathname = urlString.split('?')[0];
			fullUrlWithoutQuery = pathname;
		}

		// Try matching full URL without query, then pathname
		let result = this._matchRule(this.compiledExternalRules, fullUrlWithoutQuery, upperMethod);
		if (!result.matched && pathname !== fullUrlWithoutQuery) {
			result = this._matchRule(this.compiledExternalRules, pathname, upperMethod);
		}

		// If not allowed, warn to console
		if (!result.allowed) {
			console.warn('\x1b[33m%s\x1b[0m', `[External API Security] WARNING: Unallowed external API call: ${upperMethod} ${urlString} (Reason: ${result.reason})`);
		}

		// If running in debug mode / on localhost, print out the API call
		if (this.isLocalOrDebug()) {
			const statusColor = result.allowed ? '\x1b[32m[ALLOWED]\x1b[0m' : '\x1b[31m[UNALLOWED]\x1b[0m';
			console.log(`\x1b[35m[API Debug - External]\x1b[0m ${upperMethod.padEnd(6)} ${urlString.padEnd(50)} ${statusColor}`);
		}

		return result;
	}

	/**
	 * Log incoming Web Page route requests in debug/localhost mode
	 */
	logWebRequest(method, fullUrl, req = null, clientIp = 'unknown') {
		if (this.isLocalOrDebug(req)) {
			const upperMethod = (method || 'GET').toUpperCase();
			const pathname = fullUrl.split('?')[0];
			console.log(`\x1b[34m[Web Debug - Route]\x1b[0m    ${upperMethod.padEnd(6)} ${pathname.padEnd(35)} (IP: ${clientIp})`);
		}
	}

	/**
	 * Log incoming Static Asset requests (CSS, JS, images, fonts, manifests) in debug/localhost mode
	 */
	logAssetRequest(method, fullUrl, req = null, clientIp = 'unknown') {
		if (this.isLocalOrDebug(req)) {
			const upperMethod = (method || 'GET').toUpperCase();
			const pathname = fullUrl.split('?')[0];
			console.log(`\x1b[32m[Asset Debug - Static]\x1b[0m ${upperMethod.padEnd(6)} ${pathname.padEnd(35)} (IP: ${clientIp})`);
		}
	}

	/**
	 * Log invalid HTTP requests (404, 429, 405, 403, 500, etc.) in debug/localhost mode
	 */
	logInvalidRequest(statusCode, method, fullUrl, reason = null, clientIp = 'unknown') {
		if (this.isLocalOrDebug()) {
			const upperMethod = (method || 'GET').toUpperCase();
			const statusNum = parseInt(statusCode, 10) || 400;
			const statusNames = {
				400: 'Bad Request',
				401: 'Unauthorized',
				403: 'Forbidden',
				404: 'Not Found',
				405: 'Method Not Allowed',
				429: 'Too Many Requests',
				500: 'Internal Server Error',
				502: 'Bad Gateway',
				503: 'Service Unavailable'
			};
			const statusText = statusNames[statusNum] || 'Error';
			const reasonStr = reason ? ` [${reason}]` : '';

			console.warn(`\x1b[31m[Invalid Debug - ${statusNum} ${statusText}]\x1b[0m ${upperMethod.padEnd(6)} ${fullUrl.padEnd(35)}${reasonStr} (IP: ${clientIp})`);
		}
	}
}

const apiAllowlistManager = new ApiAllowlistManager();

module.exports = apiAllowlistManager;
