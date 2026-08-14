const help = require('./commands/help');
const ping = require('./commands/fun/ping');
const color = require('./commands/qol/colorrole');
const clipboard = require('./commands/fun/clipboard');
const stretch = require('./commands/fun/stretch');
const rank = require('./commands/fun/rank');
const leaderboard = require('./commands/fun/leaderboard');
const status = require('./commands/qol/status');
const minecraft = require('./commands/minecraftGame/minecraftCommandHandler');
const mineadmin = require('./commands/minecraftGame/mineadminCommandHandler');
const verification = require('./commands/admin/verification');
const commandManager = require('./commands/admin/commandManager');
const sticker = require('./commands/qol/sticker');
const s = require('./commands/qol/s');
const clearmessage = require('./commands/admin/clearmessage');
const petpet = require('./commands/fun/petpet');
const vc = require('./commands/qol/vc');
const reminder = require('./commands/qol/reminder');
const config = require('./commands/admin/config');
const setup = require('./commands/admin/setup');
const customWidget = require('./commands/qol/customWidget.js');
const steal = require('./commands/qol/steal');
const upload = require('./commands/qol/upload');

const contextMenuClipboard = require('./contextMenu/clipboard');
const contextMenuPetpet = require('./contextMenu/petpet');
const contextMenuStretch = require('./contextMenu/stretch');
const contextMenuUserProfile = require('./contextMenu/userProfile');
const contextMenuStealEmoji = require('./contextMenu/stealEmoji');
const contextMenuStealSticker = require('./contextMenu/stealSticker');

// Add any other commands here
module.exports = [
	help,
	ping,
	color,
	clipboard,
	stretch,
	rank,
	leaderboard,
	status,
	minecraft,
	mineadmin,
	verification,
	commandManager,
	sticker,
	s,
	clearmessage,
	petpet,
	vc,
	reminder,
	config,
	setup,
	customWidget,
	steal,
	upload,
	
	contextMenuClipboard,
	contextMenuPetpet,
	contextMenuStretch,
	contextMenuUserProfile,
	contextMenuStealEmoji,
	contextMenuStealSticker,
];