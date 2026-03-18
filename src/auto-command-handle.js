require('dotenv').config();
const { deployOne, deleteOne, redeployOne } = require('./utils/commandDeployer');
const commandsList = require('./commands');

const args = process.argv.slice(2);
if (args.length < 2) {
    console.log('Usage: node src/auto-command-handle.js <action> <commandName>');
    console.log('Actions: deploy, cleanup, redeploy');
    process.exit(1);
}

const [action, commandName] = args;

(async () => {
    let result;
    console.log(`🚀 Starting ${action} for command: ${commandName}`);

    switch (action.toLowerCase()) {
        case 'deploy':
            result = await deployOne(commandName, commandsList);
            break;
        case 'cleanup':
            result = await deleteOne(commandName);
            break;
        case 'redeploy':
            result = await redeployOne(commandName, commandsList);
            break;
        default:
            console.error('❌ Error: Invalid action. Use "deploy", "cleanup", or "redeploy".');
            process.exit(1);
    }

    if (result.success) {
        console.log(`✅ Success! Action "${action}" completed in ${result.duration}ms.`);
    } else {
        console.error(`❌ Error during ${action}: ${result.error}`);
        console.error(`⏱️ Time elapsed: ${result.duration}ms`);
        process.exit(1);
    }
})();
