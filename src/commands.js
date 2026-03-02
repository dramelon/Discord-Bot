const help = require('./commands/help');
const ping = require('./commands/fun/ping');
const color = require('./commands/qol/colorrole');

// Add any other commands here
module.exports = [
	help,
	ping,
	color,
];