#!/usr/bin/env node
/**
 * probe — NOT a real tool. Test fixture for the config/defaults wiring:
 * prints the argv that survives globals(), so tests can assert that
 * config defaults were injected ahead of user flags.
 */
const { globals } = require("../../lib/args");
process.stdout.write(JSON.stringify(globals(process.argv.slice(2), __filename)) + "\n");
