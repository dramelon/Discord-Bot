const workbookModel = require('../models/workbookModel');
const authController = require('./authController');

/**
 * Handles GET /api/workbooks.
 */
function handleGetWorkbooks(req, res) {
    const userId = authController.authenticate(req);
    if (!userId) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: 'Unauthorized' }));
    }

    const workbooks = workbookModel.getWorkbooksByUserId(userId);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify(workbooks));
}

/**
 * Handles POST /api/workbooks.
 */
function handleCreateWorkbook(req, res, body) {
    const userId = authController.authenticate(req);
    if (!userId) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: 'Unauthorized' }));
    }

    const { name } = body || {};
    if (!name || typeof name !== 'string' || name.trim() === '') {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: 'Workbook name is required' }));
    }

    const insertId = workbookModel.createWorkbook(userId, name);
    if (insertId) {
        res.writeHead(201, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({
            success: true,
            id: insertId,
            name: name.trim(),
            message: 'Workbook created successfully'
        }));
    } else {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: 'Failed to create workbook' }));
    }
}

/**
 * Handles PUT /api/workbooks.
 */
function handleUpdateWorkbook(req, res, body) {
    const userId = authController.authenticate(req);
    if (!userId) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: 'Unauthorized' }));
    }

    const { id, name } = body || {};
    if (!id || isNaN(Number(id)) || !name || typeof name !== 'string' || name.trim() === '') {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: 'Workbook ID and new name are required' }));
    }

    const updated = workbookModel.updateWorkbook(userId, Number(id), name);
    if (updated) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ success: true, message: 'Workbook renamed successfully' }));
    } else {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: 'Workbook not found or unauthorized' }));
    }
}

/**
 * Handles DELETE /api/workbooks.
 */
function handleDeleteWorkbook(req, res, body) {
    const userId = authController.authenticate(req);
    if (!userId) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: 'Unauthorized' }));
    }

    const { id } = body || {};
    if (!id || isNaN(Number(id))) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: 'Workbook ID is required' }));
    }

    const deleted = workbookModel.deleteWorkbook(userId, Number(id));
    if (deleted) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ success: true, message: 'Workbook deleted successfully' }));
    } else {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: 'Workbook not found or unauthorized' }));
    }
}

module.exports = {
    handleGetWorkbooks,
    handleCreateWorkbook,
    handleUpdateWorkbook,
    handleDeleteWorkbook
};
