const dotenv = require('dotenv');
dotenv.config();

/**
 * Checks if a user or member is an admin based on environment variables.
 * @param {import('discord.js').User | import('discord.js').GuildMember} userOrMember 
 * @returns {boolean}
 */
function isAdmin(userOrMember) {
    const userId = userOrMember.id;
    const botDevs = (process.env.BOT_DEV || '').split(',').map(id => id.trim());
    const adminRoles = (process.env.BOT_ADMIN_ROLES || '').split(',').map(id => id.trim());

    // Check if User ID is in BOT_DEV
    if (botDevs.includes(userId)) return true;

    // If it's a member, check their roles
    if (userOrMember.roles && userOrMember.roles.cache) {
        return adminRoles.some(roleId => userOrMember.roles.cache.has(roleId));
    }

    return false;
}

module.exports = { isAdmin };
