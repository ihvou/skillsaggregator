const { withDangerousMod } = require("expo/config-plugins");
const fs = require("fs");
const path = require("path");

const MARKER = "# subskills: resource bundle signing";

/**
 * Stop CocoaPods resource bundles from being code-signed.
 *
 * Since Xcode 14 resource bundles are signed by default, and each one then needs
 * a development team. The Pods project generated here declares DEVELOPMENT_TEAM
 * on nothing at all (zero occurrences in Pods.xcodeproj), so on EAS — which
 * builds with automatic signing — every iOS build failed with:
 *
 *   XCODE_RESOURCE_BUNDLE_CODE_SIGNING_ERROR
 *   "resource bundles are signed by default, which requires setting the
 *    development team for each resource bundle target"
 *
 * Expo's advice for that error is "downgrade Xcode or upgrade to SDK 46+", but
 * this project is already on SDK 54, so neither applies — the bundles simply
 * need signing turned off. They carry no executable code (privacy manifests,
 * assets), so there is nothing to sign and nothing lost by skipping it.
 *
 * Applied to the Podfile rather than the generated Pods project because
 * `pod install` regenerates the latter on every build.
 */
const HOOK = `
    ${MARKER}
    installer.pods_project.targets.each do |target|
      target.build_configurations.each do |config|
        config.build_settings['CODE_SIGNING_ALLOWED'] = 'NO'
        config.build_settings['CODE_SIGNING_REQUIRED'] = 'NO'
        config.build_settings['EXPANDED_CODE_SIGN_IDENTITY'] = ''
      end
    end
`;

module.exports = function withResourceBundleSigning(config) {
  return withDangerousMod(config, [
    "ios",
    async (cfg) => {
      const podfile = path.join(cfg.modRequest.platformProjectRoot, "Podfile");
      let contents = fs.readFileSync(podfile, "utf8");

      if (contents.includes(MARKER)) return cfg;

      // Append inside the existing post_install block, after Expo's own
      // react_native_post_install call, so nothing it does is overwritten.
      // Matched by regex rather than an exact string: the template's exact
      // arguments and indentation change between SDK releases, and an
      // exact-match anchor silently rots.
      const anchorRe = /react_native_post_install\([\s\S]*?\n\s*\)\n/;
      const m = contents.match(anchorRe);
      if (!m) {
        throw new Error(
          "withResourceBundleSigning: could not find react_native_post_install in the Podfile. " +
            "The Expo template changed — re-check the anchor before assuming this plugin still applies.",
        );
      }
      contents = contents.replace(anchorRe, m[0] + HOOK);
      fs.writeFileSync(podfile, contents);
      return cfg;
    },
  ]);
};
