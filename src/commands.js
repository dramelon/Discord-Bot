const help = require('./commands/help');
const ping = require('./commands/fun/ping');
const color = require('./commands/qol/colorrole');
const clipboard = require('./commands/fun/clipboard');
const stretch = require('./commands/fun/stretch');
const rank = require('./commands/fun/rank');
const leaderboard = require('./commands/fun/leaderboard');

// Add any other commands here
module.exports = [
	help,
	ping,
	color,
	clipboard,
	stretch,
	rank,
	leaderboard,
];