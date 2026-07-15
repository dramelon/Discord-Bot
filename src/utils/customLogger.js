const fs = require('fs');
const path = require('path');

const logDir = path.join(process.cwd(), 'data', 'logs');
const logFile = path.join(logDir, 'bot.log');

// Ensure directory exists
if (!fs.existsSync(logDir)) {
	fs.mkdirSync(logDir, { recursive: true });
}

/**
 * Returns formatted timestamp in UTC+7 timezone as hh:mm:ss:xxx (24h format)
 */
function getTimestamp() {
	const now = new Date();
	const utc7Time = new Date(now.getTime() + (7 * 60 * 60 * 1000));
	
	const hours = String(utc7Time.getUTCHours()).padStart(2, '0');
	const minutes = String(utc7Time.getUTCMinutes()).padStart(2, '0');
	const seconds = String(utc7Time.getUTCSeconds()).padStart(2, '0');
	const ms = String(utc7Time.getUTCMilliseconds()).padStart(3, '0');
	
	return `${hours}:${minutes}:${seconds}:${ms}`;
}

/**
 * Writes logs to console and bot.log
 */
function writeLog(level, message, ...args) {
	const timestamp = getTimestamp();
	let formattedMsg = message instanceof Error ? message.stack : (typeof message === 'object' ? JSON.stringify(message) : String(message));
	
	if (args.length > 0) {
		formattedMsg += ' ' + args.map(arg => {
			if (arg instanceof Error) return arg.stack;
			return typeof arg === 'object' ? JSON.stringify(arg) : String(arg);
		}).join(' ');
	}
	
	const logLine = `[${timestamp}] [${level}] ${formattedMsg}\n`;
	
	// Write to console
	if (level === 'ERROR') {
		process.stderr.write(logLine);
	} else {
		process.stdout.write(logLine);
	}
	
	// Append to file
	try {
		fs.appendFileSync(logFile, logLine, 'utf8');
	} catch (e) {
		process.stderr.write(`Failed to append log line: ${e.message}\n`);
	}
}

module.exports = {
	info: (msg, ...args) => writeLog('INFO', msg, ...args),
	warn: (msg, ...args) => writeLog('WARN', msg, ...args),
	error: (msg, ...args) => writeLog('ERROR', msg, ...args),
	debug: (msg, ...args) => writeLog('DEBUG', msg, ...args),
	getLogFilePath: () => logFile
};
