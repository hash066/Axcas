// Metro has to see the whole workspace: this app imports the shared Zod schemas from
// packages/domain rather than restating the merchant contract, and npm hoists most
// dependencies to the repository root.
const path = require("node:path");

const { getDefaultConfig } = require("expo/metro-config");

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, "../..");

const config = getDefaultConfig(projectRoot);

config.watchFolders = [workspaceRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, "node_modules"),
  path.resolve(workspaceRoot, "node_modules"),
];
// Hierarchical lookup stays ON. npm nests conflicting versions inside a package's own
// node_modules — `expo` keeps expo-modules-core there — and disabling the walk-up makes those
// unresolvable. That setting belongs to pnpm/yarn-pnp layouts, not this one.

module.exports = config;
