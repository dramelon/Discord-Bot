const botDatabase = require('../models/botDatabase');

function handleGetTables(req, res, session) {
    if (!session || !session.isAdmin) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Unauthorized' }));
        return;
    }
    try {
        const tables = botDatabase.getTables();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ tables }));
    } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
    }
}

function handleGetData(req, res, session, table) {
    if (!session || !session.isAdmin) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Unauthorized' }));
        return;
    }
    try {
        if (!table) throw new Error('Table name required');
        const schema = botDatabase.getTableSchema(table);
        const data = botDatabase.getTableData(table);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ schema, data }));
    } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
    }
}

function handleUpdateData(req, res, session, body) {
    if (!session || !session.isAdmin) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Unauthorized' }));
        return;
    }
    try {
        const { table, pkColumn, pkValue, newValues, expectedOldValues, force } = body;
        botDatabase.updateRow(table, pkColumn, pkValue, newValues, expectedOldValues, force);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true }));
    } catch (err) {
        if (err.code === 'CONFLICT') {
            res.writeHead(409, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: err.message, conflicts: err.conflicts, currentRow: err.currentRow }));
        } else {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: err.message }));
        }
    }
}

function handleDeleteData(req, res, session, body) {
    if (!session || !session.isAdmin) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Unauthorized' }));
        return;
    }
    try {
        const { table, pkColumn, pkValue } = body;
        botDatabase.deleteRow(table, pkColumn, pkValue);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true }));
    } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
    }
}

function jsonToCsv(data) {
    if (!data || data.length === 0) return '';
    const headers = Object.keys(data[0]);
    const csvRows = [];
    csvRows.push(headers.join(','));
    for (const row of data) {
        const values = headers.map(header => {
            const val = row[header];
            if (val === null || val === undefined) return '';
            const strVal = String(val);
            if (strVal.includes(',') || strVal.includes('"') || strVal.includes('\n')) {
                return `"${strVal.replace(/"/g, '""')}"`;
            }
            return strVal;
        });
        csvRows.push(values.join(','));
    }
    return csvRows.join('\n');
}

function csvToJson(csv) {
    const lines = csv.split('\n').map(l => l.trim()).filter(l => l);
    if (lines.length < 2) return [];
    
    // Simplistic CSV parser (might fail on very complex quoted strings with newlines, but suffices for basic data)
    function splitCSVLine(line) {
        const result = [];
        let cur = '';
        let inQuote = false;
        for (let i = 0; i < line.length; i++) {
            const char = line[i];
            if (char === '"' && line[i+1] === '"') {
                cur += '"';
                i++; // skip next quote
            } else if (char === '"') {
                inQuote = !inQuote;
            } else if (char === ',' && !inQuote) {
                result.push(cur);
                cur = '';
            } else {
                cur += char;
            }
        }
        result.push(cur);
        return result;
    }

    const headers = splitCSVLine(lines[0]);
    const data = [];
    for (let i = 1; i < lines.length; i++) {
        const values = splitCSVLine(lines[i]);
        const row = {};
        for (let j = 0; j < headers.length; j++) {
            row[headers[j]] = values[j] !== undefined ? values[j] : null;
        }
        data.push(row);
    }
    return data;
}

function handleExport(req, res, session, table, format, pkColumn, pkValue) {
    if (!session || !session.isAdmin) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Unauthorized' }));
        return;
    }
    try {
        if (!table) throw new Error('Table name required');
        
        let data;
        if (pkColumn && pkValue !== undefined) {
            data = [botDatabase.getRow(table, pkColumn, pkValue)];
            if (!data[0]) throw new Error('Row not found');
        } else {
            data = botDatabase.getTableData(table);
        }

        if (format === 'csv') {
            const csv = jsonToCsv(data);
            res.writeHead(200, {
                'Content-Type': 'text/csv',
                'Content-Disposition': `attachment; filename="${table}_export.csv"`
            });
            res.end(csv);
        } else {
            res.writeHead(200, {
                'Content-Type': 'application/json',
                'Content-Disposition': `attachment; filename="${table}_export.json"`
            });
            res.end(JSON.stringify(data, null, 2));
        }
    } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
    }
}

function handleImport(req, res, session, body) {
    if (!session || !session.isAdmin) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Unauthorized' }));
        return;
    }
    try {
        const { table, pkColumn, format, data } = body;
        if (!table || !pkColumn || !data) throw new Error('Missing required fields');
        
        let parsedData = [];
        if (format === 'csv') {
            parsedData = csvToJson(data);
        } else if (format === 'json') {
            parsedData = typeof data === 'string' ? JSON.parse(data) : data;
            if (!Array.isArray(parsedData)) parsedData = [parsedData]; // single row
        } else {
            throw new Error('Unsupported format');
        }

        let successCount = 0;
        let errorCount = 0;
        for (const row of parsedData) {
            try {
                if (row[pkColumn] === undefined || row[pkColumn] === null) {
                    errorCount++;
                    continue;
                }
                botDatabase.partialImportRow(table, pkColumn, row[pkColumn], row);
                successCount++;
            } catch (e) {
                console.error(`Error importing row: ${e.message}`);
                errorCount++;
            }
        }

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, successCount, errorCount }));
    } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
    }
}

module.exports = {
    handleGetTables,
    handleGetData,
    handleUpdateData,
    handleDeleteData,
    handleExport,
    handleImport
};
