const gridModel = require('../models/gridModel');
const authController = require('./authController');

/**
 * Handles GET /api/grid.
 * Expects tabId as query parameter
 */
function handleGetGridData(req, res, tabId) {
    const userId = authController.authenticate(req);
    if (!userId) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: 'Unauthorized' }));
    }

    if (!tabId || isNaN(Number(tabId))) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: 'Tab ID query parameter is required' }));
    }

    const gridData = gridModel.getGridData(userId, Number(tabId));
    if (gridData) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify(gridData));
    } else {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: 'Tab not found or unauthorized' }));
    }
}

/**
 * Handles POST /api/grid/rows.
 * Expects { tabId }
 */
function handleAddRow(req, res, body) {
    const userId = authController.authenticate(req);
    if (!userId) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: 'Unauthorized' }));
    }

    const { tabId } = body || {};
    if (!tabId || isNaN(Number(tabId))) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: 'Tab ID is required to add a row' }));
    }

    const insertId = gridModel.addRow(userId, Number(tabId));
    if (insertId) {
        res.writeHead(201, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ success: true, id: insertId }));
    } else {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: 'Failed to create row' }));
    }
}

/**
 * Handles DELETE /api/grid/rows.
 * Expects { id }
 */
function handleDeleteRow(req, res, body) {
    const userId = authController.authenticate(req);
    if (!userId) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: 'Unauthorized' }));
    }

    const { id } = body || {};
    if (!id || isNaN(Number(id))) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: 'Row ID is required' }));
    }

    const deleted = gridModel.deleteRow(userId, Number(id));
    if (deleted) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ success: true }));
    } else {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: 'Row not found or unauthorized' }));
    }
}

/**
 * Handles PUT /api/grid/cells.
 * Expects { rowId, columnId, value }
 */
function handleUpdateCell(req, res, body) {
    const userId = authController.authenticate(req);
    if (!userId) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: 'Unauthorized' }));
    }

    const { rowId, columnId, value } = body || {};
    if (!rowId || isNaN(Number(rowId)) || !columnId || isNaN(Number(columnId))) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: 'Row ID and Column ID are required' }));
    }

    const updated = gridModel.updateCell(userId, Number(rowId), Number(columnId), value);
    if (updated) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ success: true }));
    } else {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: 'Cell not found or unauthorized' }));
    }
}

/**
 * Handles POST /api/grid/columns.
 * Expects { tabId, name }
 */
function handleAddColumn(req, res, body) {
    const userId = authController.authenticate(req);
    if (!userId) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: 'Unauthorized' }));
    }

    const { tabId, name } = body || {};
    if (!tabId || isNaN(Number(tabId)) || !name || typeof name !== 'string' || name.trim() === '') {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: 'Tab ID and column name are required' }));
    }

    const col = gridModel.addColumn(userId, Number(tabId), name);
    if (col) {
        res.writeHead(201, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ success: true, column: col }));
    } else {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: 'Failed to add column' }));
    }
}

/**
 * Handles PUT /api/grid/columns.
 * Expects { id, name }
 */
function handleUpdateColumn(req, res, body) {
    const userId = authController.authenticate(req);
    if (!userId) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: 'Unauthorized' }));
    }

    const { id, name } = body || {};
    if (!id || isNaN(Number(id)) || !name || typeof name !== 'string' || name.trim() === '') {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: 'Column ID and name are required' }));
    }

    const updated = gridModel.updateColumn(userId, Number(id), name);
    if (updated) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ success: true }));
    } else {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: 'Column not found or unauthorized' }));
    }
}

/**
 * Handles PUT /api/grid/columns/swap.
 * Expects { id1, id2 }
 */
function handleSwapColumns(req, res, body) {
    const userId = authController.authenticate(req);
    if (!userId) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: 'Unauthorized' }));
    }

    const { id1, id2 } = body || {};
    if (!id1 || isNaN(Number(id1)) || !id2 || isNaN(Number(id2))) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: 'Both column IDs (id1, id2) are required to swap' }));
    }

    const swapped = gridModel.swapColumns(userId, Number(id1), Number(id2));
    if (swapped) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ success: true }));
    } else {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: 'Columns not found or unauthorized' }));
    }
}

/**
 * Handles DELETE /api/grid/columns.
 * Expects { id }
 */
function handleDeleteColumn(req, res, body) {
    const userId = authController.authenticate(req);
    if (!userId) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: 'Unauthorized' }));
    }

    const { id } = body || {};
    if (!id || isNaN(Number(id))) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: 'Column ID is required' }));
    }

    const deleted = gridModel.deleteColumn(userId, Number(id));
    if (deleted) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ success: true }));
    } else {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: 'Column not found or unauthorized' }));
    }
}

/**
 * Handles POST /api/grid/columns/save.
 * Expects { tabId, columns }
 */
function handleSaveColumns(req, res, body) {
    const userId = authController.authenticate(req);
    if (!userId) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: 'Unauthorized' }));
    }

    const { tabId, columns } = body || {};
    if (!tabId || isNaN(Number(tabId)) || !Array.isArray(columns)) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: 'Tab ID and columns array are required' }));
    }

    const saved = gridModel.saveColumns(userId, Number(tabId), columns);
    if (saved) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ success: true }));
    } else {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: 'Failed to save columns layout' }));
    }
}

module.exports = {
    handleGetGridData,
    handleAddRow,
    handleDeleteRow,
    handleUpdateCell,
    handleAddColumn,
    handleUpdateColumn,
    handleSwapColumns,
    handleDeleteColumn,
    handleSaveColumns
};
