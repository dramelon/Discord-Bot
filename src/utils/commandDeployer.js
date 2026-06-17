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
 * Helper to find a command in the commands list by data name or module file path.
 * @param {string} commandName
 * @param {Array|Collection} commandsList
 */
function findCommand(commandName, commandsList) {
    const list = commandsList.find ? [...commandsList] : [...commandsList.values()];

    // 1. Direct match by exact data.name
    let matched = list.find(c => c.data && c.data.name === commandName);
    if (matched) return matched;

    // 2. Case-insensitive / normalized match by data.name
    const normalizedQuery = commandName.toLowerCase().replace(/[^a-z0-9]/g, '');
    matched = list.find(c => {
        if (!c.data || !c.data.name) return false;
        const normName = c.data.name.toLowerCase().replace(/[^a-z0-9]/g, '');
        return normName === normalizedQuery;
    });
    if (matched) return matched;

    // 3. Fallback: match by require cache file path
    matched = list.find(c => {
        for (const [filePath, cachedModule] of Object.entries(require.cache)) {
            if (cachedModule && (cachedModule.exports === c || cachedModule.exports?.default === c)) {
                const normPath = filePath.toLowerCase().replace(/[^a-z0-9]/g, '');
                if (normPath.includes(normalizedQuery)) {
                    return true;
                }
            }
        }
        return false;
    });

    return matched;
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

        const command = findCommand(commandName, commandsList);
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
 * @param {Array|Collection} [commandsList] - Optional local commands list to resolve name mapping
 * @returns {Promise<{success: boolean, duration: number, error?: string}>}
 */
async function deleteOne(commandName, commandsList) {
    const start = Date.now();
    try {
        let targetName = commandName;
        if (commandsList) {
            const localCmd = findCommand(commandName, commandsList);
            if (localCmd && localCmd.data && localCmd.data.name) {
                targetName = localCmd.data.name;
            }
        }

        const currentCommands = await fetchCurrentCommands();
        const command = currentCommands.find(c => 
            c.name === targetName || 
            c.name.toLowerCase() === targetName.toLowerCase() ||
            c.name.toLowerCase().replace(/[^a-z0-9]/g, '') === targetName.toLowerCase().replace(/[^a-z0-9]/g, '')
        );

        if (!command) throw new Error(`Command "${commandName}" (resolved as "${targetName}") not found on Discord`);

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
    let targetName = commandName;
    if (commandsList) {
        const localCmd = findCommand(commandName, commandsList);
        if (localCmd && localCmd.data && localCmd.data.name) {
            targetName = localCmd.data.name;
        }
    }

    const existing = currentCommands.find(c => 
        c.name === targetName || 
        c.name.toLowerCase() === targetName.toLowerCase() ||
        c.name.toLowerCase().replace(/[^a-z0-9]/g, '') === targetName.toLowerCase().replace(/[^a-z0-9]/g, '')
    );

    if (existing) {
        const delRes = await deleteOne(commandName, commandsList);
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
