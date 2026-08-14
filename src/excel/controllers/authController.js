const userModel = require('../models/userModel');
const sessionModel = require('../models/sessionModel');

/**
 * Parses the Cookie header from a request.
 * @param {string} cookieHeader 
 * @returns {Object} Key-value pairs of cookies.
 */
function parseCookies(cookieHeader) {
    const list = {};
    if (!cookieHeader) return list;
    cookieHeader.split(';').forEach(cookie => {
        const parts = cookie.split('=');
        if (parts.length >= 2) {
            const key = parts.shift().trim();
            const value = parts.join('=').trim();
            list[key] = decodeURIComponent(value);
        }
    });
    return list;
}

/**
 * Authenticates a request using the session cookie.
 * @param {import('http').IncomingMessage} req 
 * @returns {number|null} The authenticated user's ID, or null.
 */
function authenticate(req) {
    const cookies = parseCookies(req.headers.cookie);
    const sessionToken = cookies['EXCEL_SESSION'];
    if (!sessionToken) return null;

    const session = sessionModel.getSession(sessionToken);
    return session ? session.user_id : null;
}

// Rate limiting for login attempts
const failedAttempts = new Map();
const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_DURATION_MS = 15 * 60 * 1000; // 15 minutes

function getClientIp(req) {
    return req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';
}

function recordFailedAttempt(ip) {
    const now = Date.now();
    let info = failedAttempts.get(ip) || { count: 0, lockedUntil: 0 };
    info.count++;
    if (info.count >= MAX_FAILED_ATTEMPTS) {
        info.lockedUntil = now + LOCKOUT_DURATION_MS;
        console.warn(`[Security] IP ${ip} temporarily locked out due to excessive failed login attempts.`);
    }
    failedAttempts.set(ip, info);
}

/**
 * Handles POST /api/login requests.
 * Expects JSON payload { username, password }
 * @param {import('http').IncomingMessage} req 
 * @param {import('http').ServerResponse} res 
 * @param {object} body Parsed request body JSON
 */
function handleLogin(req, res, body) {
    const ip = getClientIp(req);
    const now = Date.now();
    const attemptInfo = failedAttempts.get(ip);

    if (attemptInfo && attemptInfo.count >= MAX_FAILED_ATTEMPTS) {
        if (now < attemptInfo.lockedUntil) {
            res.writeHead(429, { 'Content-Type': 'application/json', 'Retry-After': Math.ceil((attemptInfo.lockedUntil - now) / 1000) });
            return res.end(JSON.stringify({ error: 'Too many failed login attempts. Please try again later.' }));
        } else {
            // Lockout expired, reset
            failedAttempts.delete(ip);
        }
    }

    const { username, password } = body || {};

    if (!username || !password) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: 'Username and password are required' }));
    }

    const user = userModel.getUserByUsername(username);
    if (!user) {
        recordFailedAttempt(ip);
        res.writeHead(401, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: 'Invalid username or password' }));
    }

    const isValid = userModel.verifyPassword(password, user.salt, user.password_hash);
    if (!isValid) {
        recordFailedAttempt(ip);
        res.writeHead(401, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: 'Invalid username or password' }));
    }

    // Success - clear failed attempts for this IP
    failedAttempts.delete(ip);

    try {
        const token = sessionModel.createSession(user.id);
        
        // Secure cookie settings: HttpOnly, SameSite=Strict, Max-Age = 7 days
        const secureFlag = process.env.NODE_ENV === 'production' ? '; Secure' : '';
        res.writeHead(200, {
            'Content-Type': 'application/json',
            'Set-Cookie': `EXCEL_SESSION=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=604800${secureFlag}`
        });
        return res.end(JSON.stringify({ success: true, message: 'Logged in successfully' }));
    } catch (err) {
        console.error('[Auth Controller] Error during login session creation:', err);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: 'Internal Server Error' }));
    }
}

/**
 * Handles POST /api/logout requests.
 * @param {import('http').IncomingMessage} req 
 * @param {import('http').ServerResponse} res 
 */
function handleLogout(req, res) {
    const cookies = parseCookies(req.headers.cookie);
    const sessionToken = cookies['EXCEL_SESSION'];
    
    if (sessionToken) {
        sessionModel.deleteSession(sessionToken);
    }

    // Overwrite the cookie to expire it immediately
    const secureFlag = process.env.NODE_ENV === 'production' ? '; Secure' : '';
    res.writeHead(200, {
        'Content-Type': 'application/json',
        'Set-Cookie': `EXCEL_SESSION=; Path=/; HttpOnly; SameSite=Strict; Expires=Thu, 01 Jan 1970 00:00:00 GMT${secureFlag}`
    });
    return res.end(JSON.stringify({ success: true, message: 'Logged out successfully' }));
}

module.exports = {
    authenticate,
    handleLogin,
    handleLogout
};
