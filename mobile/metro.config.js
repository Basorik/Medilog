// The shared engine lives outside this project (../packages/engine) and is
// linked in as a file: dependency, so Metro must watch that folder too.
const path = require("path");
const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);
config.watchFolders = [...(config.watchFolders ?? []), path.resolve(__dirname, "../packages/engine")];

module.exports = config;
