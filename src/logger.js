const fs = require('fs');
const path = require('path');

// Base directory for all logs
const logBaseDir = path.join(process.cwd(), 'data', 'logs');
const manifestPath = path.join(logBaseDir, 'logs.json');

// Ensure the base logs directory exists
if (!fs.existsSync(logBaseDir)) {
	fs.mkdirSync(logBaseDir, { recursive: true });
}

// Initialize manifest if it doesn't exist
if (!fs.existsSync(manifestPath)) {
	fs.writeFileSync(manifestPath, JSON.stringify([], null, 2));
}

let currentStream = null;
let currentLogPath = null;

const getLogStream = () => {
	const now = new Date();
	const year = now.getFullYear();
	const monthNum = String(now.getMonth() + 1).padStart(2, '0');
	const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
	const monthName = monthNames[now.getMonth()];
	const day = String(now.getDate()).padStart(2, '0');

	// Structure: data/logs/YYYY-MM/
	const folderName = `${year}-${monthNum}`;
	const folderPath = path.join(logBaseDir, folderName);

	// Filename: DDMonYYYY.jsonl (e.g., 13Mar2026.jsonl)
	const fileName = `${day}${monthName}${year}.jsonl`;
	const fullFilePath = path.join(folderPath, fileName);

	// Return existing stream if file hasn't changed (high performance)
	if (currentStream && currentLogPath === fullFilePath) {
		return currentStream;
	}

	// Rotate: Close old stream if exists
	if (currentStream) currentStream.end();

	// Ensure daily folder exists
	if (!fs.existsSync(folderPath)) fs.mkdirSync(folderPath, { recursive: true });

	// Update Manifest
	updateManifest(fullFilePath);

	// Open new stream
	currentLogPath = fullFilePath;
	currentStream = fs.createWriteStream(fullFilePath, { flags: 'a' });
	return currentStream;
};

const updateManifest = (filePath) => {
	try {
		const relativePath = path.relative(process.cwd(), filePath);
		let manifest = [];
		if (fs.existsSync(manifestPath)) {
			const content = fs.readFileSync(manifestPath, 'utf8');
			if (content.trim()) {
				const parsed = JSON.parse(content);
				if (Array.isArray(parsed)) manifest = parsed;
			}
		}
		if (!manifest.includes(relativePath)) {
			manifest.push(relativePath);
			fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
		}
	} catch (error) {
		console.error('Error updating log manifest:', error);
	}
};

const logCommand = (data) => {
	const stream = getLogStream();
	// Create the log entry with a timestamp
	const entry = {
		timestamp: new Date().toISOString(),
		...data,
	};
	// Write the entry as a single line of JSON followed by a newline
	stream.write(JSON.stringify(entry) + '\n');
};

module.exports = { logCommand };