const expenseModel = require('../models/expenseModel');
const authController = require('./authController');

/**
 * Validates expense input.
 * @param {object} data 
 * @returns {string|null} Error message, or null if valid.
 */
function validateExpenseInput(data) {
    const { amount, category, date } = data || {};

    if (amount === undefined || amount === null || isNaN(Number(amount)) || Number(amount) < 0) {
        return 'Amount must be a valid non-negative number';
    }

    if (!category || typeof category !== 'string' || category.trim() === '') {
        return 'Category is required and must be a valid string';
    }

    // Basic YYYY-MM-DD regex validation
    if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        return 'Date must be in YYYY-MM-DD format';
    }

    return null;
}

/**
 * Handles GET /api/expenses.
 * Expects tabId as a parameter (e.g. GET /api/expenses?tabId=X)
 */
function handleGetExpenses(req, res, tabId) {
    const userId = authController.authenticate(req);
    if (!userId) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: 'Unauthorized' }));
    }

    if (!tabId || isNaN(Number(tabId))) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: 'Tab ID query parameter is required' }));
    }

    const expenses = expenseModel.getExpensesByTabId(userId, Number(tabId));
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify(expenses));
}

/**
 * Handles POST /api/expenses.
 * Expects { tabId, amount, category, description, date }
 */
function handleAddExpense(req, res, body) {
    const userId = authController.authenticate(req);
    if (!userId) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: 'Unauthorized' }));
    }

    const { tabId } = body || {};
    if (!tabId || isNaN(Number(tabId))) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: 'Tab ID is required' }));
    }

    const validationError = validateExpenseInput(body);
    if (validationError) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: validationError }));
    }

    const { amount, category, description, date } = body;
    const cleanDate = date || expenseModel.getLocalDateString();

    const insertId = expenseModel.addExpense(userId, Number(tabId), {
        amount: Number(amount),
        category,
        description: description || '',
        date: cleanDate
    });

    if (insertId) {
        res.writeHead(201, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({
            success: true,
            id: insertId,
            message: 'Expense added successfully'
        }));
    } else {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: 'Failed to save expense to database' }));
    }
}

/**
 * Handles PUT /api/expenses.
 * Expects { id, amount, category, description, date }
 */
function handleUpdateExpense(req, res, body) {
    const userId = authController.authenticate(req);
    if (!userId) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: 'Unauthorized' }));
    }

    const { id } = body || {};
    if (!id || isNaN(Number(id))) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: 'Expense ID is required and must be a number' }));
    }

    const validationError = validateExpenseInput(body);
    if (validationError) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: validationError }));
    }

    const { amount, category, description, date } = body;

    const updated = expenseModel.updateExpense(userId, Number(id), {
        amount: Number(amount),
        category,
        description: description || '',
        date
    });

    if (updated) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ success: true, message: 'Expense updated successfully' }));
    } else {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: 'Expense not found or unauthorized' }));
    }
}

/**
 * Handles DELETE /api/expenses.
 * Expects { id } in body or query
 */
function handleDeleteExpense(req, res, body) {
    const userId = authController.authenticate(req);
    if (!userId) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: 'Unauthorized' }));
    }

    const { id } = body || {};
    if (!id || isNaN(Number(id))) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: 'Expense ID is required and must be a number' }));
    }

    const deleted = expenseModel.deleteExpense(userId, Number(id));
    if (deleted) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ success: true, message: 'Expense deleted successfully' }));
    } else {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: 'Expense not found or unauthorized' }));
    }
}

/**
 * Handles GET /api/summary.
 * Expects workbookId as an optional query parameter
 */
function handleGetSummary(req, res, workbookId) {
    const userId = authController.authenticate(req);
    if (!userId) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: 'Unauthorized' }));
    }

    const filterWorkbookId = workbookId && !isNaN(Number(workbookId)) ? Number(workbookId) : null;
    const summary = expenseModel.getSummaryStats(userId, filterWorkbookId);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify(summary));
}

module.exports = {
    handleGetExpenses,
    handleAddExpense,
    handleUpdateExpense,
    handleDeleteExpense,
    handleGetSummary
};
