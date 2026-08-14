const http = require('http');
const url = require('url');
const database = require('./models/database');
const viewController = require('./controllers/viewController');
const authController = require('./controllers/authController');
const expenseController = require('./controllers/expenseController');
const workbookController = require('./controllers/workbookController');
const tabController = require('./controllers/tabController');
const gridController = require('./controllers/gridController');
const referenceController = require('./controllers/referenceController');
const dashboardController = require('./controllers/dashboardController');
const userModel = require('./models/userModel');

/**
 * Helper to parse the request body as JSON or Form parameters.
 * Enforces a maximum payload size of 1MB to prevent DoS.
 * @param {import('http').IncomingMessage} req 
 * @param {import('http').ServerResponse} res 
 * @returns {Promise<any>}
 */
function getRequestBody(req, res) {
    return new Promise((resolve) => {
        let body = '';
        const MAX_BODY_SIZE = 10485760; // 10MB limit for database imports
        let bodySize = 0;

        req.on('data', chunk => {
            bodySize += chunk.length;
            if (bodySize > MAX_BODY_SIZE) {
                console.warn(`[Security] Payload too large from ${req.socket.remoteAddress || 'unknown'}`);
                req.destroy(); // Abort reading immediately
                if (res && !res.headersSent) {
                    res.writeHead(413, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: 'Payload Too Large (Max 1MB)' }));
                }
                resolve({});
                return;
            }
            body += chunk.toString();
        });
        req.on('end', () => {
            if (!body) {
                resolve({});
                return;
            }
            try {
                resolve(JSON.parse(body));
            } catch (err) {
                try {
                    const querystring = require('querystring');
                    resolve(querystring.parse(body));
                } catch (e) {
                    resolve({});
                }
            }
        });
        req.on('error', () => {
            resolve({});
        });
    });
}

/**
 * Helper to write standard CORS and Security headers
 * @param {import('http').ServerResponse} res 
 */
function setSecurityHeaders(res) {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    res.setHeader('Referrer-Policy', 'no-referrer-when-downgrade');
    res.setHeader('Content-Security-Policy', "default-src 'self' https://fonts.googleapis.com https://fonts.gstatic.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data:;");
}

/**
 * Main request router.
 * @param {import('http').IncomingMessage} req 
 * @param {import('http').ServerResponse} res 
 */
async function requestHandler(req, res) {
    setSecurityHeaders(res);

    const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const pathname = parsedUrl.pathname;
    const method = req.method;

    // Static Asset Routes
    if (method === 'GET' && pathname === '/styles/style.css') {
        return viewController.serveCSS(req, res);
    }
    if (method === 'GET' && pathname.startsWith('/views/js/')) {
        const filename = pathname.replace('/views/js/', '');
        if (['login.js', 'dashboard.js', 'excel.js', 'sidebar.js', 'dialog.js'].includes(filename)) {
            return viewController.serveJS(req, res, filename);
        }
    }

    // Page Routes
    if (method === 'GET' && (pathname === '/' || pathname === '/login')) {
        return viewController.serveLogin(req, res);
    }
    if (method === 'GET' && pathname === '/dashboard') {
        return viewController.serveDashboard(req, res);
    }
    if (method === 'GET' && pathname === '/excel') {
        return viewController.serveExcel(req, res);
    }

    // Parse Query Params
    const queryWorkbookId = parsedUrl.searchParams.get('workbookId');
    const queryTabId = parsedUrl.searchParams.get('tabId');
    const queryReferenceId = parsedUrl.searchParams.get('referenceId');
    const queryDashboardId = parsedUrl.searchParams.get('dashboardId');
    const queryTable = parsedUrl.searchParams.get('table');
    const queryFormat = parsedUrl.searchParams.get('format');
    const queryPkColumn = parsedUrl.searchParams.get('pkColumn');
    const queryPkValue = parsedUrl.searchParams.get('pkValue');

    // Parse Body for API write requests
    let body = {};
    if (['POST', 'PUT', 'DELETE'].includes(method)) {
        body = await getRequestBody(req, res);
    }

    // Merge search parameters into body for convenience
    if (parsedUrl.searchParams.get('id') && !body.id) {
        body.id = parsedUrl.searchParams.get('id');
    }

    // API Routes - Authentication
    if (method === 'POST' && pathname === '/api/login') {
        return authController.handleLogin(req, res, body);
    }
    if (method === 'POST' && pathname === '/api/logout') {
        return authController.handleLogout(req, res);
    }

    // API Routes - Workbooks
    if (method === 'GET' && pathname === '/api/workbooks') {
        return workbookController.handleGetWorkbooks(req, res);
    }
    if (method === 'POST' && pathname === '/api/workbooks') {
        return workbookController.handleCreateWorkbook(req, res, body);
    }
    if (method === 'PUT' && pathname === '/api/workbooks') {
        return workbookController.handleUpdateWorkbook(req, res, body);
    }
    if (method === 'DELETE' && pathname === '/api/workbooks') {
        return workbookController.handleDeleteWorkbook(req, res, body);
    }

    // API Routes - Tabs
    if (method === 'GET' && pathname === '/api/tabs') {
        return tabController.handleGetTabs(req, res, queryWorkbookId);
    }
    if (method === 'POST' && pathname === '/api/tabs') {
        return tabController.handleCreateTab(req, res, body);
    }
    if (method === 'PUT' && pathname === '/api/tabs') {
        return tabController.handleUpdateTab(req, res, body);
    }
    if (method === 'DELETE' && pathname === '/api/tabs') {
        return tabController.handleDeleteTab(req, res, body);
    }

    // API Routes - Dynamic Grid (Columns, Rows, Cells)
    if (method === 'GET' && pathname === '/api/grid') {
        return gridController.handleGetGridData(req, res, queryTabId);
    }
    if (method === 'POST' && pathname === '/api/grid/rows') {
        return gridController.handleAddRow(req, res, body);
    }
    if (method === 'DELETE' && pathname === '/api/grid/rows') {
        return gridController.handleDeleteRow(req, res, body);
    }
    if (method === 'PUT' && pathname === '/api/grid/cells') {
        return gridController.handleUpdateCell(req, res, body);
    }
    if (method === 'POST' && pathname === '/api/grid/columns') {
        return gridController.handleAddColumn(req, res, body);
    }
    if (method === 'POST' && pathname === '/api/grid/columns/save') {
        return gridController.handleSaveColumns(req, res, body);
    }
    if (method === 'PUT' && pathname === '/api/grid/columns') {
        return gridController.handleUpdateColumn(req, res, body);
    }
    if (method === 'PUT' && pathname === '/api/grid/columns/swap') {
        return gridController.handleSwapColumns(req, res, body);
    }
    if (method === 'DELETE' && pathname === '/api/grid/columns') {
        return gridController.handleDeleteColumn(req, res, body);
    }

    // API Routes - Summary / Stats (Dashboard)
    if (method === 'GET' && pathname === '/api/summary') {
        return expenseController.handleGetSummary(req, res, queryWorkbookId);
    }

    // API Routes - Reference Lookup Tables
    if (method === 'GET' && pathname === '/api/references') {
        return referenceController.handleGetReferences(req, res);
    }
    if (method === 'POST' && pathname === '/api/references') {
        return referenceController.handleCreateReference(req, res, body);
    }
    if (method === 'PUT' && pathname === '/api/references') {
        return referenceController.handleUpdateReference(req, res, body);
    }
    if (method === 'DELETE' && pathname === '/api/references') {
        return referenceController.handleDeleteReference(req, res, body);
    }
    if (method === 'GET' && pathname === '/api/references/items') {
        return referenceController.handleGetReferenceItems(req, res, queryReferenceId);
    }
    if (method === 'POST' && pathname === '/api/references/items') {
        return referenceController.handleCreateReferenceItem(req, res, body);
    }
    if (method === 'POST' && pathname === '/api/references/items/save') {
        return referenceController.handleSaveReferenceItems(req, res, body);
    }

    // API Routes - Customizable Dashboards
    if (method === 'GET' && pathname === '/api/dashboards') {
        return dashboardController.handleGetDashboards(req, res);
    }
    if (method === 'POST' && pathname === '/api/dashboards') {
        return dashboardController.handleCreateDashboard(req, res, body);
    }
    if (method === 'PUT' && pathname === '/api/dashboards') {
        return dashboardController.handleUpdateDashboard(req, res, body);
    }
    if (method === 'DELETE' && pathname === '/api/dashboards') {
        return dashboardController.handleDeleteDashboard(req, res, body);
    }

    // API Routes - Dashboard Cards
    if (method === 'GET' && pathname === '/api/dashboards/cards') {
        return dashboardController.handleGetDashboardCards(req, res, queryDashboardId);
    }
    if (method === 'POST' && pathname === '/api/dashboards/cards') {
        return dashboardController.handleCreateDashboardCard(req, res, body);
    }
    if (method === 'PUT' && pathname === '/api/dashboards/cards') {
        return dashboardController.handleUpdateDashboardCard(req, res, body);
    }
    if (method === 'DELETE' && pathname === '/api/dashboards/cards') {
        return dashboardController.handleDeleteDashboardCard(req, res, body);
    }
    if (method === 'POST' && pathname === '/api/dashboards/cards/duplicate') {
        return dashboardController.handleDuplicateDashboardCard(req, res, body);
    }
    if (method === 'PUT' && pathname === '/api/dashboards/cards/order') {
        return dashboardController.handleSaveCardsOrder(req, res, body);
    }

    // API Routes - Sheets Schema helper
    if (method === 'GET' && pathname === '/api/sheets-schema') {
        return dashboardController.handleGetSheetsSchema(req, res);
    }

    // Fallback: Not Found
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    return res.end('404 Not Found');
}

/**
 * Initializes resources and starts the server.
 */
function startExcelServer() {
    database.init();
    viewController.initViews();

    const adminUser = process.env.EXCEL_ADMIN_USER || 'admin';
    const adminPass = process.env.EXCEL_ADMIN_PASS || 'admin1234'; // Use fallback admin1234 or configured env
    const existingAdmin = userModel.getUserByUsername(adminUser);
    
    if (!existingAdmin) {
        console.log(`[Excel Startup] Admin account "${adminUser}" not found. Seeding admin user...`);
        const insertId = userModel.createUser(adminUser, adminPass);
        if (insertId) {
            console.log(`[Excel Startup] Admin user registered successfully with ID: ${insertId}`);
        } else {
            console.error('[Excel Startup] Failed to seed admin user on startup!');
        }
    } else {
        console.log('[Excel Startup] Admin user already exists in database.');
    }

    const port = process.env.EXCEL_PORT || 3003;
    const server = http.createServer(requestHandler);

    server.listen(port, '0.0.0.0', () => {
        console.log(`[Excel Server] Daily Expenses MVC web application running on port ${port}`);
    });

    server.on('error', (err) => {
        console.error('[Excel Server] Server error:', err);
    });

    setInterval(() => {
        const sessionModel = require('./models/sessionModel');
        sessionModel.cleanExpiredSessions();
    }, 24 * 60 * 60 * 1000);
}

module.exports = {
    startExcelServer
};
