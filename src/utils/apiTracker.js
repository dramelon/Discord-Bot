/**
 * Centralized API Usage and Rate Limit Tracker
 * Intercepts and logs all external HTTP fetches and Discord bot REST client API requests.
 */

const { logApiRequest } = require('../logger');

function sanitizeHeaders(headers) {
	if (!headers) return {};
	const sanitized = {};
	const sensitiveHeaders = ['cookie', 'authorization', 'x-session-id', 'x-api-key', 'session', 'token'];
	for (const [key, val] of Object.entries(headers)) {
		if (sensitiveHeaders.includes(key.toLowerCase())) {
			sanitized[key] = '[REDACTED]';
		} else {
			sanitized[key] = val;
		}
	}
	return sanitized;
}

function getHeadersObject(headers) {
	if (!headers) return {};
	if (typeof headers.forEach === 'function') {
		const obj = {};
		headers.forEach((val, key) => {
			obj[key] = val;
		});
		return obj;
	}
	if (typeof headers === 'object') {
		return { ...headers };
	}
	return {};
}

const metrics = {
	totalRequests: 0,
	discordClientRequests: 0,
	externalRequests: 0,
	dashboardOAuthRequests: 0,
	incomingWebRequests: 0,
	rateLimitsEncountered: 0
};

// Rolling log of the last 20 API requests
const recentRequests = [];

// Timestamps of all requests made in the last 60 seconds
let requestTimestamps = [];

// Temporary queue to map Discord REST requests to their responses
const pendingDiscordRequests = [];

// Rolling 30-tick (90s) history of request rates
const rpmHistoryBackend = Array(30).fill(0);
setInterval(() => {
	rpmHistoryBackend.push(getRequestsLastMinute());
	if (rpmHistoryBackend.length > 30) {
		rpmHistoryBackend.shift();
	}
}, 3000);

/**
 * Prune timestamps older than 60 seconds and return the current count
 */
function getRequestsLastMinute() {
	const now = Date.now();
	requestTimestamps = requestTimestamps.filter(t => now - t < 60000);
	return requestTimestamps.length;
}

/**
 * Record a request timestamp for the sliding 60-second window
 */
function recordTimestamp() {
	requestTimestamps.push(Date.now());
}

const apiTracker = {
	/**
	 * Initialize Discord Client listeners to track internal Discord.js REST API usage
	 * @param {import('discord.js').Client} client 
	 */
	initDiscordClient(client) {
		if (!client || !client.rest) {
			console.warn('[API Tracker] Client REST manager not available for hooks.');
			return;
		}

		console.log('[API Tracker] Hooked into Discord.js REST manager.');

		// Intercept request start
		client.rest.on('request', (requestData) => {
			const reqId = Math.random().toString(36).substring(2, 9);
			const method = (requestData.method || 'GET').toUpperCase();
			const path = requestData.path || '/';

			const item = {
				id: reqId,
				type: 'discord',
				method: method,
				path: path,
				statusCode: 'Pending',
				duration: 0,
				startTime: Date.now(),
				timestamp: new Date().toISOString()
			};

			recentRequests.unshift(item);
			if (recentRequests.length > 500) {
				recentRequests.pop();
			}

			// Add to pending matching queue
			pendingDiscordRequests.push(item);
		});

		// Intercept request response
		client.rest.on('response', (requestData, response) => {
			const now = Date.now();
			const method = (requestData.method || 'GET').toUpperCase();
			const path = requestData.path || '/';

			// Match oldest pending item with same method and path (FIFO)
			const index = pendingDiscordRequests.findIndex(r => r.method === method && r.path === path);
			let pendingItem = null;
			if (index !== -1) {
				pendingItem = pendingDiscordRequests.splice(index, 1)[0];
			}

			const statusCode = response.status || response.statusCode || 200;

			if (pendingItem) {
				const recentItem = recentRequests.find(r => r.id === pendingItem.id);
				if (recentItem) {
					recentItem.statusCode = statusCode;
					recentItem.duration = now - pendingItem.startTime;

					// Log completed Discord client request to file
					logApiRequest({
						type: 'discord',
						method: recentItem.method,
						path: recentItem.path,
						statusCode: recentItem.statusCode,
						duration: recentItem.duration
					});
				}
			}

			metrics.totalRequests++;
			metrics.discordClientRequests++;

			if (statusCode === 429) {
				metrics.rateLimitsEncountered++;
			}

			recordTimestamp();
		});

		// Intercept explicit rate limit alerts
		client.rest.on('rateLimit', (rateLimitData) => {
			console.warn('[API Tracker] Discord REST Rate Limit Encountered:', rateLimitData);
			metrics.rateLimitsEncountered++;
			
			// Log rate limit events to the recent list as special items
			const rateLimitItem = {
				id: Math.random().toString(36).substring(2, 9),
				type: 'ratelimit',
				method: (rateLimitData.method || 'ANY').toUpperCase(),
				path: `RATE LIMIT: Limit ${rateLimitData.limit} (Reset: ${rateLimitData.timeToReset}ms, Global: ${rateLimitData.global})`,
				statusCode: 429,
				duration: rateLimitData.timeToReset,
				timestamp: new Date().toISOString()
			};
			recentRequests.unshift(rateLimitItem);
			if (recentRequests.length > 500) {
				recentRequests.pop();
			}

			// Log rate limit to file
			logApiRequest({
				type: 'ratelimit',
				method: rateLimitItem.method,
				path: rateLimitItem.path,
				statusCode: rateLimitItem.statusCode,
				duration: rateLimitItem.duration
			});
		});

		// Intercept invalid request warning events
		client.rest.on('invalidRequestWarning', (warningData) => {
			console.warn('[API Tracker] Invalid request warning received:', warningData);
			metrics.rateLimitsEncountered++;
		});
	},

	/**
	 * Tracked wrapper around global fetch
	 * @param {string|URL} url 
	 * @param {RequestInit} options 
	 */
	async fetch(url, options = {}) {
		const start = Date.now();
		const method = (options.method || 'GET').toUpperCase();
		
		let urlString = String(url);
		let path = urlString;
		let isDashboard = false;

		try {
			const parsed = new URL(urlString);
			path = parsed.hostname + parsed.pathname + parsed.search;
			if (parsed.hostname === 'discord.com') {
				isDashboard = true;
			}
		} catch (e) {
			// fallback if relative URL
		}

		const reqId = Math.random().toString(36).substring(2, 9);
		const type = isDashboard ? 'dashboard' : 'external';
		const reqHeaders = sanitizeHeaders(getHeadersObject(options.headers));

		const item = {
			id: reqId,
			type: type,
			method: method,
			path: path,
			statusCode: 'Pending',
			duration: 0,
			startTime: start,
			timestamp: new Date().toISOString(),
			reqHeaders: reqHeaders
		};

		recentRequests.unshift(item);
		if (recentRequests.length > 500) {
			recentRequests.pop();
		}

		try {
			const response = await global.fetch(url, options);
			const duration = Date.now() - start;

			const resHeaders = {};
			if (response.headers && typeof response.headers.forEach === 'function') {
				response.headers.forEach((val, key) => {
					resHeaders[key] = val;
				});
			}
			const sanitizedResHeaders = sanitizeHeaders(resHeaders);

			item.statusCode = response.status;
			item.duration = duration;
			item.resHeaders = sanitizedResHeaders;

			metrics.totalRequests++;
			if (isDashboard) {
				metrics.dashboardOAuthRequests++;
			} else {
				metrics.externalRequests++;
			}

			if (response.status === 429) {
				metrics.rateLimitsEncountered++;
			}

			recordTimestamp();

			// Log fetch success to file
			logApiRequest({
				type: item.type,
				method: item.method,
				path: item.path,
				statusCode: item.statusCode,
				duration: item.duration,
				reqHeaders: item.reqHeaders,
				resHeaders: item.resHeaders
			});

			return response;
		} catch (error) {
			const duration = Date.now() - start;
			item.statusCode = 'Failed';
			item.duration = duration;

			metrics.totalRequests++;
			if (isDashboard) {
				metrics.dashboardOAuthRequests++;
			} else {
				metrics.externalRequests++;
			}

			recordTimestamp();

			// Log fetch failure to file
			logApiRequest({
				type: item.type,
				method: item.method,
				path: item.path,
				statusCode: item.statusCode,
				duration: item.duration,
				error: error.message,
				reqHeaders: item.reqHeaders
			});

			throw error;
		}
	},

	/**
	 * Record an incoming server HTTP request/response
	 */
	recordIncomingRequest({ method, path, statusCode, duration, ip, reqHeaders, resHeaders }) {
		const reqId = Math.random().toString(36).substring(2, 9);
		const item = {
			id: reqId,
			type: 'incoming',
			method: method.toUpperCase(),
			path: `WEB: ${path}`,
			statusCode: statusCode,
			duration: duration,
			ip: ip || 'unknown',
			timestamp: new Date().toISOString(),
			reqHeaders: sanitizeHeaders(reqHeaders),
			resHeaders: sanitizeHeaders(resHeaders)
		};

		recentRequests.unshift(item);
		if (recentRequests.length > 500) {
			recentRequests.pop();
		}

		metrics.totalRequests++;
		metrics.incomingWebRequests++;

		if (statusCode === 429) {
			metrics.rateLimitsEncountered++;
		}

		recordTimestamp();

		// Log incoming request to file
		logApiRequest({
			type: item.type,
			method: item.method,
			path: item.path,
			statusCode: item.statusCode,
			duration: item.duration,
			ip: item.ip,
			reqHeaders: item.reqHeaders,
			resHeaders: item.resHeaders
		});
	},

	/**
	 * Retrieve current API tracking statistics
	 */
	getStats(since = null) {
		let filteredRequests = recentRequests;

		if (since === null || since === 0 || isNaN(since)) {
			// New client or reload: get up to 50 latest requests
			filteredRequests = recentRequests.slice(0, 50);
		} else {
			// Returning client: send new requests since the last seen timestamp
			filteredRequests = recentRequests.filter(r => new Date(r.timestamp).getTime() > since);
		}

		return {
			metrics: { ...metrics },
			requestsLastMinute: getRequestsLastMinute(),
			recentRequests: filteredRequests,
			rpmHistory: [...rpmHistoryBackend]
		};
	}
};

module.exports = apiTracker;
