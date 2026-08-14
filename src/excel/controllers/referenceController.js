const referenceModel = require('../models/referenceModel');
const authController = require('./authController');

/**
 * Handles GET /api/references.
 */
function handleGetReferences(req, res) {
    const userId = authController.authenticate(req);
    if (!userId) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: 'Unauthorized' }));
    }

    const refs = referenceModel.getReferences(userId);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify(refs));
}

/**
 * Handles POST /api/references.
 * Expects { name }
 */
function handleCreateReference(req, res, body) {
    const userId = authController.authenticate(req);
    if (!userId) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: 'Unauthorized' }));
    }

    const { name } = body || {};
    if (!name || typeof name !== 'string' || name.trim() === '') {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: 'Reference list name is required' }));
    }

    const ref = referenceModel.createReference(userId, name);
    if (ref) {
        res.writeHead(201, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ success: true, reference: ref }));
    } else {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: 'Failed to create reference table' }));
    }
}

/**
 * Handles PUT /api/references.
 * Expects { id, name }
 */
function handleUpdateReference(req, res, body) {
    const userId = authController.authenticate(req);
    if (!userId) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: 'Unauthorized' }));
    }

    const { id, name } = body || {};
    if (!id || isNaN(Number(id)) || !name || typeof name !== 'string' || name.trim() === '') {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: 'Reference ID and name are required' }));
    }

    const updated = referenceModel.updateReference(userId, Number(id), name);
    if (updated) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ success: true }));
    } else {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: 'Reference table not found or unauthorized' }));
    }
}

/**
 * Handles DELETE /api/references.
 * Expects { id }
 */
function handleDeleteReference(req, res, body) {
    const userId = authController.authenticate(req);
    if (!userId) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: 'Unauthorized' }));
    }

    const { id } = body || {};
    if (!id || isNaN(Number(id))) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: 'Reference ID is required' }));
    }

    const deleted = referenceModel.deleteReference(userId, Number(id));
    if (deleted) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ success: true }));
    } else {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: 'Reference table not found or unauthorized' }));
    }
}

/**
 * Handles GET /api/references/items.
 * Expects referenceId in query
 */
function handleGetReferenceItems(req, res, referenceId) {
    const userId = authController.authenticate(req);
    if (!userId) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: 'Unauthorized' }));
    }

    if (!referenceId || isNaN(Number(referenceId))) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: 'Reference ID query parameter is required' }));
    }

    const items = referenceModel.getReferenceItems(userId, Number(referenceId));
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify(items));
}

/**
 * Handles POST /api/references/items/save.
 * Expects { referenceId, items: [{ key, value }] }
 */
function handleSaveReferenceItems(req, res, body) {
    const userId = authController.authenticate(req);
    if (!userId) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: 'Unauthorized' }));
    }

    const { referenceId, items } = body || {};
    if (!referenceId || isNaN(Number(referenceId)) || !Array.isArray(items)) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: 'Reference ID and items array are required' }));
    }

    const saved = referenceModel.saveReferenceItems(userId, Number(referenceId), items);
    if (saved) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ success: true }));
    } else {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: 'Failed to save reference items' }));
    }
}

/**
 * Handles POST /api/references/items.
 * Expects { referenceId }
 */
function handleCreateReferenceItem(req, res, body) {
    const userId = authController.authenticate(req);
    if (!userId) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: 'Unauthorized' }));
    }

    const { referenceId } = body || {};
    if (!referenceId || isNaN(Number(referenceId))) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: 'Reference ID is required' }));
    }

    const item = referenceModel.createReferenceItem(userId, Number(referenceId));
    if (item) {
        res.writeHead(201, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ success: true, item }));
    } else {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: 'Failed to create reference item' }));
    }
}

module.exports = {
    handleGetReferences,
    handleCreateReference,
    handleUpdateReference,
    handleDeleteReference,
    handleGetReferenceItems,
    handleSaveReferenceItems,
    handleCreateReferenceItem
};
