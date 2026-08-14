const fs = require('fs');
const path = require('path');
const authController = require('./authController');

const VIEWS_DIR = path.join(__dirname, '../views');
const STYLES_DIR = path.join(__dirname, '../styles');

const cache = {};

/**
 * Caches all views in memory on startup.
 */
function initViews() {
    try {
        cache['login.html'] = fs.readFileSync(path.join(VIEWS_DIR, 'login.html'), 'utf8');
        cache['dashboard.html'] = fs.readFileSync(path.join(VIEWS_DIR, 'dashboard.html'), 'utf8');
        cache['excel.html'] = fs.readFileSync(path.join(VIEWS_DIR, 'excel.html'), 'utf8');
        
        cache['style.css'] = fs.readFileSync(path.join(STYLES_DIR, 'style.css'), 'utf8');
        
        cache['login.js'] = fs.readFileSync(path.join(VIEWS_DIR, 'js', 'login.js'), 'utf8');
        cache['dashboard.js'] = fs.readFileSync(path.join(VIEWS_DIR, 'js', 'dashboard.js'), 'utf8');
        cache['excel.js'] = fs.readFileSync(path.join(VIEWS_DIR, 'js', 'excel.js'), 'utf8');
        cache['sidebar.js'] = fs.readFileSync(path.join(VIEWS_DIR, 'js', 'sidebar.js'), 'utf8');
        cache['dialog.js'] = fs.readFileSync(path.join(VIEWS_DIR, 'js', 'dialog.js'), 'utf8');
        
        console.log('[View Controller] Successfully cached all HTML/CSS/JS views.');
    } catch (err) {
        console.error('[View Controller] Error caching files on init:', err);
    }
}

/**
 * Gets a file content, either from cache or directly from disk (as a fallback).
 * @param {string} key 
 * @param {string} diskPath 
 * @returns {string} File content
 */
function getAsset(key, diskPath) {
    // If in dev mode, we can read from disk directly so changes are live, 
    // but in normal/prod mode we use cache.
    const isDev = process.env.NODE_ENV === 'development' || process.env.IS_DEV === 'true';
    if (!isDev && cache[key]) {
        return cache[key];
    }
    
    try {
        const content = fs.readFileSync(diskPath, 'utf8');
        if (!isDev) cache[key] = content; // cache it for next time
        return content;
    } catch (err) {
        console.error(`[View Controller] Error reading asset ${key}:`, err);
        return '';
    }
}

/**
 * Serves the Login page.
 */
function serveLogin(req, res) {
    const userId = authController.authenticate(req);
    if (userId) {
        // If already logged in, redirect to dashboard
        res.writeHead(302, { Location: '/dashboard' });
        return res.end();
    }
    
    const content = getAsset('login.html', path.join(VIEWS_DIR, 'login.html'));
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    return res.end(content);
}

/**
 * Serves the Dashboard page.
 */
function serveDashboard(req, res) {
    const userId = authController.authenticate(req);
    if (!userId) {
        // Redirect to login if not authenticated
        res.writeHead(302, { Location: '/login' });
        return res.end();
    }

    const content = getAsset('dashboard.html', path.join(VIEWS_DIR, 'dashboard.html'));
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    return res.end(content);
}

/**
 * Serves the Excel grid page.
 */
function serveExcel(req, res) {
    const userId = authController.authenticate(req);
    if (!userId) {
        // Redirect to login if not authenticated
        res.writeHead(302, { Location: '/login' });
        return res.end();
    }

    const content = getAsset('excel.html', path.join(VIEWS_DIR, 'excel.html'));
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    return res.end(content);
}

/**
 * Serves the global CSS file.
 */
function serveCSS(req, res) {
    const content = getAsset('style.css', path.join(STYLES_DIR, 'style.css'));
    res.writeHead(200, { 'Content-Type': 'text/css; charset=utf-8' });
    return res.end(content);
}

/**
 * Serves client-side JavaScript files.
 */
function serveJS(req, res, filename) {
    const diskPath = path.join(VIEWS_DIR, 'js', filename);
    const content = getAsset(filename, diskPath);
    res.writeHead(200, { 'Content-Type': 'application/javascript; charset=utf-8' });
    return res.end(content);
}

module.exports = {
    initViews,
    serveLogin,
    serveDashboard,
    serveExcel,
    serveCSS,
    serveJS
};
