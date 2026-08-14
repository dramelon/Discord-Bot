const { getDb } = require('./database');

/**
 * Returns the local YYYY-MM-DD date string for a given date, respecting timezone offset.
 * @param {Date} [d] 
 * @returns {string}
 */
function getLocalDateString(d = new Date()) {
    const offset = d.getTimezoneOffset();
    const localDate = new Date(d.getTime() - (offset * 60 * 1000));
    return localDate.toISOString().split('T')[0];
}

/**
 * Returns the Sunday and Saturday dates for the current week.
 * @returns {{start: string, end: string}}
 */
function getWeekRange() {
    const today = new Date();
    const day = today.getDay(); // 0 is Sunday, 1 is Monday...
    
    const sunday = new Date(today);
    sunday.setDate(today.getDate() - day);
    
    const saturday = new Date(sunday);
    saturday.setDate(sunday.getDate() + 6);
    
    return {
        start: getLocalDateString(sunday),
        end: getLocalDateString(saturday)
    };
}

/**
 * Retrieves virtual pivoted expense rows (representing date, category, and amount)
 * across a user's workbooks, optionally filtering by workbookId.
 * @param {number} userId 
 * @param {number} [workbookId] 
 * @returns {Array<object>}
 */
function getPivotedExpenses(userId, workbookId = null) {
    const db = getDb();
    
    let filter = '';
    const params = [userId];
    
    if (workbookId && !isNaN(Number(workbookId))) {
        filter = 'AND w.id = ?';
        params.push(Number(workbookId));
    }

    try {
        // Pivot query using conditional aggregation
        const stmt = db.prepare(`
            SELECT 
                r.id as row_id,
                MAX(CASE WHEN c.purpose = 'amount' THEN cell.value END) as amount,
                MAX(CASE WHEN c.purpose = 'date' THEN cell.value END) as date,
                MAX(CASE WHEN c.purpose = 'category' THEN cell.value END) as category
            FROM rows r
            JOIN tabs t ON r.tab_id = t.id
            JOIN workbooks w ON t.workbook_id = w.id
            JOIN columns c ON t.id = c.tab_id
            LEFT JOIN cells cell ON r.id = cell.row_id AND c.id = cell.column_id
            WHERE w.user_id = ? ${filter}
            GROUP BY r.id
        `);
        
        return stmt.all(...params);
    } catch (err) {
        console.error('[Expense Model] Error fetching pivoted expenses:', err);
        return [];
    }
}

/**
 * Calculates daily, weekly, and monthly summaries and category breakdowns.
 * Can filter by a specific workbook ID, or aggregate all workbooks for the user.
 * @param {number} userId 
 * @param {number} [workbookId] Optional workbook filter
 * @returns {object}
 */
function getSummaryStats(userId, workbookId = null) {
    const expenses = getPivotedExpenses(userId, workbookId);
    
    const todayStr = getLocalDateString();
    const { start: weekStart, end: weekEnd } = getWeekRange();
    const monthPrefix = todayStr.substring(0, 7); // "YYYY-MM"

    let dailyTotal = 0;
    let dailyCount = 0;
    let weeklyTotal = 0;
    let monthlyTotal = 0;
    const categoryMap = {};

    expenses.forEach(exp => {
        const amt = exp.amount ? parseFloat(exp.amount) : 0;
        if (isNaN(amt) || amt <= 0) return;

        const date = exp.date ? exp.date.trim() : '';
        const cat = exp.category ? exp.category.trim() : 'Uncategorized';

        // Daily Calculation
        if (date === todayStr) {
            dailyTotal += amt;
            dailyCount += 1;
        }

        // Weekly Calculation
        if (date >= weekStart && date <= weekEnd) {
            weeklyTotal += amt;
        }

        // Monthly Calculation
        if (date.startsWith(monthPrefix)) {
            monthlyTotal += amt;
        }

        // Category Breakdown
        if (!categoryMap[cat]) {
            categoryMap[cat] = 0;
        }
        categoryMap[cat] += amt;
    });

    // Format categories list
    const categories = Object.keys(categoryMap).map(catName => ({
        category: catName,
        total: Math.round(categoryMap[catName] * 100) / 100
    })).sort((a, b) => b.total - a.total);

    const grandTotal = categories.reduce((sum, item) => sum + item.total, 0);

    // Calculate percentages
    categories.forEach(item => {
        item.percentage = grandTotal > 0 ? Math.round((item.total / grandTotal) * 100) : 0;
    });

    return {
        daily: {
            total: Math.round(dailyTotal * 100) / 100,
            count: dailyCount
        },
        weekly: {
            total: Math.round(weeklyTotal * 100) / 100
        },
        monthly: {
            total: Math.round(monthlyTotal * 100) / 100
        },
        categories,
        grandTotal: Math.round(grandTotal * 100) / 100
    };
}

module.exports = {
    getSummaryStats,
    getLocalDateString
};
