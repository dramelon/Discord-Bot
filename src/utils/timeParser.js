const ICT_OFFSET_MS = 7 * 60 * 60 * 1000;

/**
 * Returns a Date object adjusted to ICT (UTC+7) representation using UTC methods.
 */
function getICTDate(date = new Date()) {
	return new Date(date.getTime() + ICT_OFFSET_MS);
}

/**
 * Parses an absolute time string (e.g. 14:30, 2:30 PM) relative to a given date.
 * @param {string} timeStr - The time string to parse.
 * @param {Date} date - The base date object.
 * @returns {Date|null} The parsed Date object in standard UTC or null if invalid.
 */
function parseAbsoluteTime(timeStr, date) {
	const match = timeStr.trim().toLowerCase().match(/^(\d{1,2}):(\d{2})(?:\s*(am|pm))?$/);
	if (!match) return null;

	let hours = parseInt(match[1]);
	const minutes = parseInt(match[2]);
	const ampm = match[3];

	if (ampm) {
		if (ampm === 'pm' && hours < 12) hours += 12;
		if (ampm === 'am' && hours === 12) hours = 0;
	}

	const ictBase = getICTDate(new Date(date));
	const targetICT = new Date(Date.UTC(
		ictBase.getUTCFullYear(),
		ictBase.getUTCMonth(),
		ictBase.getUTCDate(),
		hours,
		minutes,
		0,
		0
	));

	return new Date(targetICT.getTime() - ICT_OFFSET_MS);
}

/**
 * Parses a date/time string into a timestamp.
 * Supports relative time (1h, 30m), tomorrow, absolute (14:30), discord timestamps, and custom dates.
 * @param {string} input - The raw date/time string.
 * @param {Date} now - Current time reference.
 * @returns {number|null} Timestamp in ms, or null if parsing fails.
 */
function parseDateTime(input, now = new Date()) {
	input = input.trim().toLowerCase();

	// 1. Check for Discord timestamp format: <t:178239823:F>
	const discordTimeMatch = input.match(/<t:(\d+)(?::\w)?>/);
	if (discordTimeMatch) {
		return parseInt(discordTimeMatch[1]) * 1000;
	}

	// 2. Relative times: "1h", "30m", "2h 30m", etc.
	const relativeRegex = /(\d+)\s*(s|sec|second|seconds|m|min|minute|minutes|h|hr|hour|hours|d|day|days|w|wk|week|weeks)/g;
	let totalMs = 0;
	let match;
	let hasRelative = false;

	while ((match = relativeRegex.exec(input)) !== null) {
		hasRelative = true;
		const val = parseInt(match[1]);
		const unit = match[2].toLowerCase();

		if (unit.startsWith('s')) totalMs += val * 1000;
		else if (unit.startsWith('m')) totalMs += val * 60 * 1000;
		else if (unit.startsWith('h')) totalMs += val * 60 * 60 * 1000;
		else if (unit.startsWith('d')) totalMs += val * 24 * 60 * 60 * 1000;
		else if (unit.startsWith('w')) totalMs += val * 7 * 24 * 60 * 60 * 1000;
	}

	if (hasRelative) {
		return now.getTime() + totalMs;
	}

	// 3. Tomorrow formats: "tomorrow", "tomorrow 14:30"
	if (input.startsWith('tomorrow')) {
		const ictBase = getICTDate(now);
		ictBase.setUTCDate(ictBase.getUTCDate() + 1);

		const timePart = input.replace('tomorrow', '').trim();
		if (timePart) {
			const baseDate = new Date(ictBase.getTime() - ICT_OFFSET_MS);
			const parsedTime = parseAbsoluteTime(timePart, baseDate);
			if (parsedTime) return parsedTime.getTime();
		}
		return ictBase.getTime() - ICT_OFFSET_MS;
	}

	// 4. Today formats: "today 14:30" or just "14:30"
	const todayPart = input.replace('today', '').trim();
	const parsedTime = parseAbsoluteTime(todayPart, now);
	if (parsedTime) {
		// If the parsed time has already passed today, set to tomorrow
		if (parsedTime.getTime() <= now.getTime()) {
			parsedTime.setDate(parsedTime.getDate() + 1);
		}
		return parsedTime.getTime();
	}

	// 5. Custom date/time formats like "YYYY-MM-DD HH:mm" or "YYYY/MM/DD HH:mm"
	const customMatch = input.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})\s+(\d{1,2}):(\d{2})$/);
	if (customMatch) {
		const year = parseInt(customMatch[1]);
		const month = parseInt(customMatch[2]) - 1;
		const day = parseInt(customMatch[3]);
		const hours = parseInt(customMatch[4]);
		const minutes = parseInt(customMatch[5]);

		const targetICT = new Date(Date.UTC(year, month, day, hours, minutes, 0, 0));
		return targetICT.getTime() - ICT_OFFSET_MS;
	}

	// 6. Try standard JS Date parsing (for custom inputs)
	const dateParsed = Date.parse(input);
	if (!isNaN(dateParsed)) {
		return dateParsed;
	}

	return null;
}

/**
 * Parses a repeat configuration from input string.
 * @param {string} input - The repeat frequency.
 * @returns {object|null} The repeat configuration or null if not repeating.
 */
function parseRepeat(input) {
	if (!input) return null;
	input = input.trim().toLowerCase();

	if (input === 'daily' || input === 'day' || input === 'every day') {
		return { type: 'daily', interval: 24 * 60 * 60 * 1000 };
	}
	if (input === 'weekly' || input === 'week' || input === 'every week') {
		return { type: 'weekly', interval: 7 * 24 * 60 * 60 * 1000 };
	}
	if (input === 'monthly' || input === 'month' || input === 'every month') {
		return { type: 'monthly' };
	}
	if (input === 'yearly' || input === 'year' || input === 'every year') {
		return { type: 'yearly' };
	}

	// Parse custom interval: "30m", "2h", "1d"
	const relativeRegex = /^(\d+)\s*(s|sec|second|seconds|m|min|minute|minutes|h|hr|hour|hours|d|day|days)$/;
	const match = input.match(relativeRegex);
	if (match) {
		const val = parseInt(match[1]);
		const unit = match[2];
		let ms = 0;
		if (unit.startsWith('s')) ms = val * 1000;
		else if (unit.startsWith('m')) ms = val * 60 * 1000;
		else if (unit.startsWith('h')) ms = val * 60 * 60 * 1000;
		else if (unit.startsWith('d')) ms = val * 24 * 60 * 60 * 1000;

		if (ms > 0) {
			return { type: 'custom', interval: ms, label: input };
		}
	}

	return null;
}

/**
 * Calculates the next trigger time.
 * @param {number} currentTime - The last trigger time in ms.
 * @param {object} repeatObj - The repeat configuration.
 * @returns {number|null} Next trigger time in ms, or null.
 */
function getNextTriggerTime(currentTime, repeatObj) {
	if (!repeatObj) return null;
	const date = new Date(currentTime);

	if (repeatObj.type === 'daily' || repeatObj.type === 'weekly' || repeatObj.type === 'custom') {
		return currentTime + repeatObj.interval;
	}
	if (repeatObj.type === 'monthly') {
		date.setMonth(date.getMonth() + 1);
		return date.getTime();
	}
	if (repeatObj.type === 'yearly') {
		date.setFullYear(date.getFullYear() + 1);
		return date.getTime();
	}
	return null;
}

module.exports = {
	parseDateTime,
	parseRepeat,
	getNextTriggerTime
};
