const { REST, Routes } = require('discord.js');

const rest = new REST().setToken(process.env.DISCORD_TOKEN);

/**
 * Fetches all application commands from Discord.
 * @returns {Promise<Array>} List of commands.
 */
async function fetchCurrentCommands() {
    if (!process.env.CLIENT_ID) throw new Error('CLIENT_ID is missing in .env');
    return await rest.get(Routes.applicationCommands(process.env.CLIENT_ID));
}

/**
 * Deploys a single command by name.
 * @param {string} commandName 
 * @param {Array|Collection} commandsList - The list/collection of local commands
 * @returns {Promise<{success: boolean, duration: number, error?: string}>}
 */
async function deployOne(commandName, commandsList) {
    const start = Date.now();
    try {
        if (!commandsList) throw new Error('commandsList is required for deployment');

        // Handle both Array and Discord.js Collection
        const command = commandsList.find ? 
            commandsList.find(c => c.data && c.data.name === commandName) :
            commandsList.get(commandName);

        if (!command) throw new Error(`Command "${commandName}" not found locally`);

        await rest.post(
            Routes.applicationCommands(process.env.CLIENT_ID),
            { body: command.data.toJSON() }
        );

        return { success: true, duration: Date.now() - start };
    } catch (error) {
        return { success: false, duration: Date.now() - start, error: error.message };
    }
}

/**
 * Deletes a single command by name.
 * @param {string} commandName 
 * @returns {Promise<{success: boolean, duration: number, error?: string}>}
 */
async function deleteOne(commandName) {
    const start = Date.now();
    try {
        const currentCommands = await fetchCurrentCommands();
        const command = currentCommands.find(c => c.name === commandName);
        if (!command) throw new Error(`Command "${commandName}" not found on Discord`);

        await rest.delete(Routes.applicationCommand(process.env.CLIENT_ID, command.id));

        return { success: true, duration: Date.now() - start };
    } catch (error) {
        return { success: false, duration: Date.now() - start, error: error.message };
    }
}

/**
 * Redeploys a single command by name (cleanup + deploy).
 * @param {string} commandName 
 * @param {Array|Collection} commandsList - The list/collection of local commands
 * @returns {Promise<{success: boolean, duration: number, error?: string}>}
 */
async function redeployOne(commandName, commandsList) {
    const start = Date.now();
    
    // 1. Cleanup (if it exists)
    const currentCommands = await fetchCurrentCommands();
    const existing = currentCommands.find(c => c.name === commandName);
    if (existing) {
        const delRes = await deleteOne(commandName);
        if (!delRes.success) return { ...delRes, duration: Date.now() - start };
    }

    // 2. Deploy
    const depRes = await deployOne(commandName, commandsList);
    return { ...depRes, duration: Date.now() - start };
}

module.exports = {
    fetchCurrentCommands,
    deployOne,
    deleteOne,
    redeployOne
};
