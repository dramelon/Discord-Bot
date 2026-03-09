const fs = require('fs');
const path = require('path');

// Define the path to the data file
const dataDir = path.join(process.cwd(), 'data');
const dataPath = path.join(dataDir, 'levels.json');
const xpRequirePath = path.join(dataDir, 'level_xprequire.json');

// Ensure the data directory and file exist
if (!fs.existsSync(dataDir)) {
	fs.mkdirSync(dataDir);
}
if (!fs.existsSync(dataPath)) {
	fs.writeFileSync(dataPath, JSON.stringify({}), 'utf8');
}
if (!fs.existsSync(xpRequirePath)) {
	fs.writeFileSync(xpRequirePath, JSON.stringify({ "1": 5, "2": 7, "3": 10 }, null, 2), 'utf8');
}

module.exports = async (message) => {
	if (message.author.bot) return; // Ignore bots
	if (!message.guild) return; // Ignore DMs

	let data = {};
	try {
		const fileContent = fs.readFileSync(dataPath, 'utf8');
		if (fileContent.trim()) {
			data = JSON.parse(fileContent);
		}
	} catch (error) {
		console.error('Error reading levels.json:', error);
	}

	const userId = message.author.id;

	// Initialize user if not present
	if (!data[userId]) {
		data[userId] = { xp: 0, level: 0 };
	}

	// 1 Message = 1 XP
	data[userId].xp += 1;

	// Load XP Requirements
	let xpRequirements = {};
	try {
		xpRequirements = JSON.parse(fs.readFileSync(xpRequirePath, 'utf8'));
	} catch (error) {
		console.error('Error reading level_xprequire.json:', error);
	}

	// Calculate Level based on XP table
	let newLevel = 0;
	const levels = Object.keys(xpRequirements).map(Number).sort((a, b) => a - b);
	for (const level of levels) {
		if (data[userId].xp >= xpRequirements[level]) newLevel = level;
	}

	if (newLevel > data[userId].level) {
		data[userId].level = newLevel;
		await message.channel.send(`🎉 ${message.author}, you've leveled up to **Level ${newLevel}**!`);
	}

	// Save data
	fs.writeFileSync(dataPath, JSON.stringify(data, null, 2), 'utf8');
};