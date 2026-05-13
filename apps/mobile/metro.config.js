const path = require("path");
const { getDefaultConfig } = require("expo/metro-config");

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, "../..");

const config = getDefaultConfig(projectRoot);

config.watchFolders = [workspaceRoot];

config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, "node_modules"),
  path.resolve(workspaceRoot, "node_modules"),
];

// Force every `react` / `react-native` import in the bundle to resolve to the
// SAME on-disk path so we never end up with two React instances in memory.
// Without this, expo-router and other packages with nested node_modules can
// each see their own React copy, which trips "Invalid hook call / useMemo of
// null" at runtime in React 19.
//
// Hierarchical lookup stays on so that peer deps like @react-navigation/native
// (nested inside expo-router) still resolve correctly.
const reactCanonical = path.resolve(projectRoot, "node_modules/react");
const reactNativeCanonical = path.resolve(workspaceRoot, "node_modules/react-native");
const singletonModules = new Map([
  ["react", reactCanonical],
  ["react-native", reactNativeCanonical],
]);

const previousResolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  for (const [pkg, dir] of singletonModules) {
    if (moduleName === pkg) {
      return { type: "sourceFile", filePath: path.resolve(dir, "index.js") };
    }
    if (moduleName.startsWith(`${pkg}/`)) {
      const sub = moduleName.slice(pkg.length + 1);
      const candidates = [
        path.resolve(dir, sub),
        path.resolve(dir, `${sub}.js`),
        path.resolve(dir, sub, "index.js"),
      ];
      for (const candidate of candidates) {
        try {
          require("fs").accessSync(candidate);
          return { type: "sourceFile", filePath: candidate };
        } catch {
          /* try next candidate */
        }
      }
    }
  }
  if (previousResolveRequest) return previousResolveRequest(context, moduleName, platform);
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
