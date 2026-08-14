const tabModel = require('../models/tabModel');
const authController = require('./authController');

/**
 * Handles GET /api/tabs.
 * Expects workbookId query parameter
 */
function handleGetTabs(req, res, workbookId) {
    const userId = authController.authenticate(req);
    if (!userId) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: 'Unauthorized' }));
    }

    if (!workbookId || isNaN(Number(workbookId))) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: 'Workbook ID query parameter is required' }));
    }

    const tabs = tabModel.getTabsByWorkbookId(userId, Number(workbookId));
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify(tabs));
}

/**
 * Handles POST /api/tabs.
 * Expects { workbookId, name }
 */
function handleCreateTab(req, res, body) {
    const userId = authController.authenticate(req);
    if (!userId) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: 'Unauthorized' }));
    }

    const { workbookId, name } = body || {};
    if (!workbookId || isNaN(Number(workbookId)) || !name || typeof name !== 'string' || name.trim() === '') {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: 'Workbook ID and tab name are required' }));
    }

    const insertId = tabModel.createTab(userId, Number(workbookId), name);
    if (insertId) {
        res.writeHead(201, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({
            success: true,
            id: insertId,
            name: name.trim(),
            message: 'Tab created successfully'
        }));
    } else {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: 'Failed to create tab' }));
    }
}

/**
 * Handles PUT /api/tabs.
 * Expects { id, name }
 */
function handleUpdateTab(req, res, body) {
    const userId = authController.authenticate(req);
    if (!userId) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: 'Unauthorized' }));
    }

    const { id, name } = body || {};
    if (!id || isNaN(Number(id)) || !name || typeof name !== 'string' || name.trim() === '') {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: 'Tab ID and new name are required' }));
    }

    const updated = tabModel.updateTab(userId, Number(id), name);
    if (updated) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ success: true, message: 'Tab renamed successfully' }));
    } else {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: 'Tab not found or unauthorized' }));
    }
}

/**
 * Handles DELETE /api/tabs.
 * Expects { id }
 */
function handleDeleteTab(req, res, body) {
    const userId = authController.authenticate(req);
    if (!userId) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: 'Unauthorized' }));
    }

    const { id } = body || {};
    if (!id || isNaN(Number(id))) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: 'Tab ID is required' }));
    }

    const deleted = tabModel.deleteTab(userId, Number(id));
    if (deleted) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ success: true, message: 'Tab deleted successfully' }));
    } else {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: 'Tab not found or unauthorized' }));
    }
}

module.exports = {
    handleGetTabs,
    handleCreateTab,
    handleUpdateTab,
    handleDeleteTab
};
