const authController = require('./authController');
const dashboardModel = require('../models/dashboardModel');
const workbookModel = require('../models/workbookModel');
const tabModel = require('../models/tabModel');
const gridModel = require('../models/gridModel');

/**
 * Helper to write JSON responses cleanly.
 */
function sendJSON(res, status, obj) {
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(obj));
}

/**
 * GET /api/dashboards
 */
function handleGetDashboards(req, res) {
    const userId = authController.authenticate(req);
    if (!userId) return sendJSON(res, 401, { error: 'Unauthorized' });

    const list = dashboardModel.getDashboards(userId);
    return sendJSON(res, 200, list);
}

/**
 * POST /api/dashboards
 */
function handleCreateDashboard(req, res, body) {
    const userId = authController.authenticate(req);
    if (!userId) return sendJSON(res, 401, { error: 'Unauthorized' });

    const { name } = body || {};
    if (!name || name.trim() === '') {
        return sendJSON(res, 400, { error: 'Dashboard name is required' });
    }

    const dbd = dashboardModel.createDashboard(userId, name);
    if (dbd) {
        return sendJSON(res, 201, { success: true, id: dbd.id, name: dbd.name });
    } else {
        return sendJSON(res, 500, { error: 'Failed to create dashboard' });
    }
}

/**
 * PUT /api/dashboards
 */
function handleUpdateDashboard(req, res, body) {
    const userId = authController.authenticate(req);
    if (!userId) return sendJSON(res, 401, { error: 'Unauthorized' });

    const { id, name } = body || {};
    if (!id || !name || name.trim() === '') {
        return sendJSON(res, 400, { error: 'Dashboard ID and name are required' });
    }

    const success = dashboardModel.updateDashboard(userId, Number(id), name);
    if (success) {
        return sendJSON(res, 200, { success: true });
    } else {
        return sendJSON(res, 500, { error: 'Failed to update dashboard' });
    }
}

/**
 * DELETE /api/dashboards
 */
function handleDeleteDashboard(req, res, body) {
    const userId = authController.authenticate(req);
    if (!userId) return sendJSON(res, 401, { error: 'Unauthorized' });

    const { id } = body || {};
    if (!id) return sendJSON(res, 400, { error: 'Dashboard ID is required' });

    const success = dashboardModel.deleteDashboard(userId, Number(id));
    if (success) {
        return sendJSON(res, 200, { success: true });
    } else {
        return sendJSON(res, 500, { error: 'Failed to delete dashboard' });
    }
}

/**
 * GET /api/dashboards/cards?dashboardId=X
 */
function handleGetDashboardCards(req, res, queryDashboardId) {
    const userId = authController.authenticate(req);
    if (!userId) return sendJSON(res, 401, { error: 'Unauthorized' });

    if (!queryDashboardId || isNaN(Number(queryDashboardId))) {
        return sendJSON(res, 400, { error: 'Dashboard ID query parameter is required' });
    }

    const cards = dashboardModel.getDashboardCards(userId, Number(queryDashboardId));
    
    // For each card, compute summarized key-value datasets dynamically
    const enrichedCards = cards.map(card => {
        const dataset = dashboardModel.getCardSummarizedData(userId, card.id);
        return {
            ...card,
            dataset
        };
    });

    return sendJSON(res, 200, enrichedCards);
}

/**
 * POST /api/dashboards/cards
 */
function handleCreateDashboardCard(req, res, body) {
    const userId = authController.authenticate(req);
    if (!userId) return sendJSON(res, 401, { error: 'Unauthorized' });

    const { dashboardId, title, tabId, groupColumnId, sumColumnId } = body || {};
    if (!dashboardId || !title || !tabId || !groupColumnId) {
        return sendJSON(res, 400, { error: 'dashboardId, title, tabId, and groupColumnId are required' });
    }

    const card = dashboardModel.createDashboardCard(
        userId, 
        Number(dashboardId), 
        title, 
        Number(tabId), 
        String(groupColumnId), 
        sumColumnId ? String(sumColumnId) : null
    );

    if (card) {
        return sendJSON(res, 201, { success: true, card });
    } else {
        return sendJSON(res, 500, { error: 'Failed to create dashboard card' });
    }
}

/**
 * PUT /api/dashboards/cards
 */
function handleUpdateDashboardCard(req, res, body) {
    const userId = authController.authenticate(req);
    if (!userId) return sendJSON(res, 401, { error: 'Unauthorized' });

    const { id, title, tabId, groupColumnId, sumColumnId } = body || {};
    if (!id || !title || !tabId || !groupColumnId) {
        return sendJSON(res, 400, { error: 'id, title, tabId, and groupColumnId are required' });
    }

    const success = dashboardModel.updateDashboardCard(
        userId, 
        Number(id), 
        title, 
        Number(tabId), 
        String(groupColumnId), 
        sumColumnId ? String(sumColumnId) : null
    );

    if (success) {
        return sendJSON(res, 200, { success: true });
    } else {
        return sendJSON(res, 500, { error: 'Failed to update dashboard card' });
    }
}

/**
 * DELETE /api/dashboards/cards
 */
function handleDeleteDashboardCard(req, res, body) {
    const userId = authController.authenticate(req);
    if (!userId) return sendJSON(res, 401, { error: 'Unauthorized' });

    const { id } = body || {};
    if (!id) return sendJSON(res, 400, { error: 'Card ID is required' });

    const success = dashboardModel.deleteDashboardCard(userId, Number(id));
    if (success) {
        return sendJSON(res, 200, { success: true });
    } else {
        return sendJSON(res, 500, { error: 'Failed to delete dashboard card' });
    }
}

/**
 * GET /api/sheets-schema
 */
function handleGetSheetsSchema(req, res) {
    const userId = authController.authenticate(req);
    if (!userId) return sendJSON(res, 401, { error: 'Unauthorized' });

    try {
        const workbooks = workbookModel.getWorkbooksByUserId(userId);
        const schema = [];

        for (const wb of workbooks) {
            const tabs = tabModel.getTabsByWorkbookId(userId, wb.id);
            const tabsWithCols = [];

            for (const tab of tabs) {
                const columns = gridModel.getColumnsByTabId(userId, tab.id);
                tabsWithCols.push({
                    id: tab.id,
                    name: tab.name,
                    columns: columns.map(c => ({
                        id: c.id,
                        name: c.name,
                        purpose: c.purpose
                    }))
                });
            }

            schema.push({
                id: wb.id,
                name: wb.name,
                tabs: tabsWithCols
            });
        }

        return sendJSON(res, 200, schema);
    } catch (err) {
        console.error('[Dashboard Controller] Error fetching sheets-schema:', err);
        return sendJSON(res, 500, { error: 'Failed to compile sheets schema' });
    }
}

/**
 * POST /api/dashboards/cards/duplicate
 */
function handleDuplicateDashboardCard(req, res, body) {
    const userId = authController.authenticate(req);
    if (!userId) return sendJSON(res, 401, { error: 'Unauthorized' });

    const { id } = body || {};
    if (!id) return sendJSON(res, 400, { error: 'Card ID to duplicate is required' });

    const newCard = dashboardModel.duplicateDashboardCard(userId, Number(id));
    if (newCard) {
        return sendJSON(res, 201, { success: true, card: newCard });
    } else {
        return sendJSON(res, 500, { error: 'Failed to duplicate dashboard card' });
    }
}

/**
 * PUT /api/dashboards/cards/order
 */
function handleSaveCardsOrder(req, res, body) {
    const userId = authController.authenticate(req);
    if (!userId) return sendJSON(res, 401, { error: 'Unauthorized' });

    const { cardIds } = body || {};
    if (!cardIds || !Array.isArray(cardIds)) {
        return sendJSON(res, 400, { error: 'cardIds array is required' });
    }

    const success = dashboardModel.updateCardPositions(userId, cardIds.map(Number));
    if (success) {
        return sendJSON(res, 200, { success: true });
    } else {
        return sendJSON(res, 500, { error: 'Failed to update cards order' });
    }
}

module.exports = {
    handleGetDashboards,
    handleCreateDashboard,
    handleUpdateDashboard,
    handleDeleteDashboard,
    handleGetDashboardCards,
    handleCreateDashboardCard,
    handleUpdateDashboardCard,
    handleDeleteDashboardCard,
    handleGetSheetsSchema,
    handleDuplicateDashboardCard,
    handleSaveCardsOrder
};
