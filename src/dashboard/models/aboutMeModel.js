/**
 * Model representing the Owner's Discord profile and presence state.
 * Interfaces with Discord's REST API and Lanyard API.
 */
class AboutMeModel {
	constructor(userId) {
		this.userId = userId || '389264086753345548';
	}

	/**
	 * Fetches the raw profile data of the user from Discord client.
	 * @param {import('discord.js').Client} client 
	 * @returns {Promise<object|null>}
	 */
	async fetchDiscordProfile(client) {
		if (!client || !client.isReady()) {
			return null;
		}
		try {
			const user = await client.users.fetch(this.userId);
			return {
				id: user.id,
				username: user.username,
				globalName: user.globalName,
				avatarUrl: user.displayAvatarURL({ dynamic: true, size: 256 }),
				bannerUrl: user.bannerURL({ size: 512 }) || null,
				accentColor: user.accentColor || null
			};
		} catch (err) {
			console.error(`[AboutMeModel] Error fetching user profile ${this.userId}:`, err);
			return null;
		}
	}

	/**
	 * Fetches presence and live activity details from the public Lanyard API.
	 * @returns {Promise<object|null>}
	 */
	async fetchLanyardPresence() {
		try {
			const response = await fetch(`https://api.lanyard.rest/v1/users/${this.userId}`);
			if (!response.ok) {
				throw new Error(`HTTP ${response.status}`);
			}
			const body = await response.json();
			if (body.success) {
				return body.data;
			}
			return null;
		} catch (err) {
			console.warn(`[AboutMeModel] Lanyard API fetch failed (falling back):`, err.message);
			return null;
		}
	}

	/**
	 * Resolves presence from the bot's internal client cache.
	 * @param {import('discord.js').Client} client 
	 * @returns {object|null}
	 */
	getClientCachePresence(client) {
		if (!client || !client.isReady()) {
			return null;
		}

		// Loop through client's guilds to check for cached member presence
		for (const [_, guild] of client.guilds.cache) {
			const member = guild.members.cache.get(this.userId);
			if (member && member.presence) {
				return member.presence;
			}
		}
		return null;
	}

	/**
	 * Combines all sources to get a comprehensive raw status of the owner.
	 * @param {import('discord.js').Client} client 
	 * @returns {Promise<object>}
	 */
	async getRawData(client) {
		const discordProfile = await this.fetchDiscordProfile(client);
		const clientCachePresence = this.getClientCachePresence(client);

		return {
			discordProfile,
			lanyardData: null,
			clientCachePresence
		};
	}
}

module.exports = new AboutMeModel('389264086753345548');
