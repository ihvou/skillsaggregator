const { AndroidConfig, withAndroidManifest, withMainActivity, withDangerousMod, withXcodeProject } = require("@expo/config-plugins");
const fs = require("node:fs");
const path = require("node:path");

const PLUGIN_NAME = "withSubskillsShareTargets";
const SHARE_EXTENSION_NAME = "SubskillsShareExtension";
const SUPPORTED_HOSTS = [
  "youtube.com",
  "www.youtube.com",
  "m.youtube.com",
  "youtu.be",
  "tiktok.com",
  "www.tiktok.com",
  "vm.tiktok.com",
  "instagram.com",
  "www.instagram.com",
];

function hasAction(filter, actionName) {
  return (filter.action ?? []).some((action) => action.$?.["android:name"] === actionName);
}

function hasData(filter, expected) {
  return (filter.data ?? []).some((data) =>
    Object.entries(expected).every(([key, value]) => data.$?.[key] === value),
  );
}

function ensureIntentFilter(activity, filter) {
  activity["intent-filter"] = activity["intent-filter"] ?? [];
  const actionName = filter.action?.[0]?.$?.["android:name"];
  const expectedData = filter.data?.[0]?.$ ?? {};
  const exists = activity["intent-filter"].some((existing) =>
    actionName && hasAction(existing, actionName) && hasData(existing, expectedData),
  );
  if (!exists) activity["intent-filter"].push(filter);
}

function withAndroidShareManifest(config) {
  return withAndroidManifest(config, (modConfig) => {
    const mainActivity = AndroidConfig.Manifest.getMainActivityOrThrow(modConfig.modResults);
    ensureIntentFilter(mainActivity, {
      action: [{ $: { "android:name": "android.intent.action.SEND" } }],
      category: [{ $: { "android:name": "android.intent.category.DEFAULT" } }],
      data: [{ $: { "android:mimeType": "text/plain" } }],
    });
    for (const scheme of ["https", "http"]) {
      for (const host of SUPPORTED_HOSTS) {
        ensureIntentFilter(mainActivity, {
          action: [{ $: { "android:name": "android.intent.action.VIEW" } }],
          category: [
            { $: { "android:name": "android.intent.category.DEFAULT" } },
            { $: { "android:name": "android.intent.category.BROWSABLE" } },
          ],
          data: [{ $: { "android:scheme": scheme, "android:host": host } }],
        });
      }
    }
    return modConfig;
  });
}

function addKotlinImport(contents, importName) {
  if (contents.includes(`import ${importName}`)) return contents;
  const packageMatch = contents.match(/^package .+\n/m);
  if (!packageMatch) return `import ${importName}\n${contents}`;
  return contents.replace(packageMatch[0], `${packageMatch[0]}\nimport ${importName}\n`);
}

function withAndroidShareIntentNormalizer(config) {
  return withMainActivity(config, (modConfig) => {
    if (modConfig.modResults.language !== "kt") return modConfig;
    let contents = modConfig.modResults.contents;
    if (contents.includes("subskills.original_url")) return modConfig;

    contents = addKotlinImport(contents, "android.content.Intent");
    contents = addKotlinImport(contents, "android.net.Uri");
    const insertion = `
  override fun getIntent(): Intent {
    return normalizeSubskillsShareIntent(super.getIntent())
  }

  override fun onNewIntent(intent: Intent) {
    val normalized = normalizeSubskillsShareIntent(intent)
    super.onNewIntent(normalized)
    setIntent(normalized)
  }

  private fun normalizeSubskillsShareIntent(input: Intent): Intent {
    if (input.data?.scheme == "subskills") return input
    val candidate = when (input.action) {
      Intent.ACTION_SEND -> input.getStringExtra(Intent.EXTRA_TEXT)
      Intent.ACTION_VIEW -> input.dataString
      else -> null
    } ?: return input
    val sharedUrl = extractSubskillsShareUrl(candidate) ?: return input
    if (!isSupportedSubskillsShareUrl(sharedUrl)) return input
    return Intent(input).apply {
      action = Intent.ACTION_VIEW
      data = Uri.parse("subskills://suggest?url=" + Uri.encode(sharedUrl))
      putExtra("subskills.original_url", sharedUrl)
    }
  }

  private fun extractSubskillsShareUrl(value: String): String? {
    val match = Regex("https?://[^\\\\s<>\\\"']+").find(value) ?: return null
    return match.value.trimEnd('.', ',', ';', ')', ']', '}')
  }

  private fun isSupportedSubskillsShareUrl(value: String): Boolean {
    val host = Uri.parse(value).host?.removePrefix("www.")?.lowercase() ?: return false
    return host == "youtu.be" ||
      host == "youtube.com" ||
      host.endsWith(".youtube.com") ||
      host == "tiktok.com" ||
      host.endsWith(".tiktok.com") ||
      host == "instagram.com" ||
      host.endsWith(".instagram.com")
  }
`;
    contents = contents.replace(
      /\n  \/\*\*\n   \* Returns the name of the main component registered from JavaScript\./,
      `${insertion}\n  /**\n   * Returns the name of the main component registered from JavaScript.`,
    );
    modConfig.modResults.contents = contents;
    return modConfig;
  });
}

function writeShareExtensionFiles(iosProjectRoot, bundleIdentifier) {
  const extensionRoot = path.join(iosProjectRoot, SHARE_EXTENSION_NAME);
  fs.mkdirSync(extensionRoot, { recursive: true });
  fs.writeFileSync(
    path.join(extensionRoot, `${SHARE_EXTENSION_NAME}-Info.plist`),
    `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleDevelopmentRegion</key>
  <string>$(DEVELOPMENT_LANGUAGE)</string>
  <key>CFBundleDisplayName</key>
  <string>Subskills</string>
  <key>CFBundleExecutable</key>
  <string>$(EXECUTABLE_NAME)</string>
  <key>CFBundleIdentifier</key>
  <string>${bundleIdentifier}.share</string>
  <key>CFBundleInfoDictionaryVersion</key>
  <string>6.0</string>
  <key>CFBundleName</key>
  <string>$(PRODUCT_NAME)</string>
  <key>CFBundlePackageType</key>
  <string>$(PRODUCT_BUNDLE_PACKAGE_TYPE)</string>
  <key>CFBundleShortVersionString</key>
  <string>$(MARKETING_VERSION)</string>
  <key>CFBundleVersion</key>
  <string>$(CURRENT_PROJECT_VERSION)</string>
  <key>NSExtension</key>
  <dict>
    <key>NSExtensionAttributes</key>
    <dict>
      <key>NSExtensionActivationRule</key>
      <dict>
        <key>NSExtensionActivationSupportsText</key>
        <true/>
        <key>NSExtensionActivationSupportsWebURLWithMaxCount</key>
        <integer>1</integer>
      </dict>
    </dict>
    <key>NSExtensionPointIdentifier</key>
    <string>com.apple.share-services</string>
    <key>NSExtensionPrincipalClass</key>
    <string>$(PRODUCT_MODULE_NAME).ShareViewController</string>
  </dict>
</dict>
</plist>
`,
  );
  fs.writeFileSync(
    path.join(extensionRoot, "ShareViewController.swift"),
    `import UIKit
import UniformTypeIdentifiers

final class ShareViewController: UIViewController {
  override func viewDidLoad() {
    super.viewDidLoad()
    view.backgroundColor = .systemBackground
    resolveSharedURL { [weak self] url in
      guard let self else { return }
      guard let url else {
        self.extensionContext?.completeRequest(returningItems: nil)
        return
      }
      var components = URLComponents()
      components.scheme = "subskills"
      components.host = "suggest"
      components.queryItems = [URLQueryItem(name: "url", value: url.absoluteString)]
      guard let deepLink = components.url else {
        self.extensionContext?.completeRequest(returningItems: nil)
        return
      }
      self.extensionContext?.open(deepLink) { _ in
        self.extensionContext?.completeRequest(returningItems: nil)
      }
    }
  }

  private func resolveSharedURL(completion: @escaping (URL?) -> Void) {
    let providers = extensionContext?.inputItems
      .compactMap { $0 as? NSExtensionItem }
      .flatMap { $0.attachments ?? [] } ?? []

    if let provider = providers.first(where: { $0.hasItemConformingToTypeIdentifier(UTType.url.identifier) }) {
      provider.loadItem(forTypeIdentifier: UTType.url.identifier, options: nil) { item, _ in
        DispatchQueue.main.async {
          completion((item as? URL) ?? URL(string: item as? String ?? ""))
        }
      }
      return
    }

    if let provider = providers.first(where: { $0.hasItemConformingToTypeIdentifier(UTType.plainText.identifier) }) {
      provider.loadItem(forTypeIdentifier: UTType.plainText.identifier, options: nil) { item, _ in
        let text = item as? String
        let url = text.flatMap(Self.firstURL(in:))
        DispatchQueue.main.async { completion(url) }
      }
      return
    }

    completion(nil)
  }

  private static func firstURL(in text: String) -> URL? {
    guard let detector = try? NSDataDetector(types: NSTextCheckingResult.CheckingType.link.rawValue) else {
      return nil
    }
    let range = NSRange(text.startIndex..<text.endIndex, in: text)
    return detector
      .matches(in: text, options: [], range: range)
      .compactMap(\\.url)
      .first(where: isSupportedURL)
  }

  private static func isSupportedURL(_ url: URL) -> Bool {
    guard let host = url.host?.lowercased().replacingOccurrences(of: "^www\\\\.", with: "", options: .regularExpression) else {
      return false
    }
    return host == "youtu.be" ||
      host == "youtube.com" ||
      host.hasSuffix(".youtube.com") ||
      host == "tiktok.com" ||
      host.hasSuffix(".tiktok.com") ||
      host == "instagram.com" ||
      host.hasSuffix(".instagram.com")
  }
}
`,
  );
}

function nativeTargetByName(project, name) {
  const section = project.pbxNativeTargetSection();
  return Object.entries(section).find(([, target]) => target?.name === `"${name}"`)?.[0] ?? null;
}

function withIosShareExtensionFiles(config) {
  return withDangerousMod(config, [
    "ios",
    (modConfig) => {
      const bundleIdentifier = modConfig.ios?.bundleIdentifier ?? "xyz.subskills.app";
      writeShareExtensionFiles(modConfig.modRequest.platformProjectRoot, bundleIdentifier);
      return modConfig;
    },
  ]);
}

function withIosShareExtensionTarget(config) {
  return withXcodeProject(config, (modConfig) => {
    const project = modConfig.modResults;
    const bundleIdentifier = modConfig.ios?.bundleIdentifier ?? "xyz.subskills.app";
    const marketingVersion = modConfig.version ?? "1.0";
    if (nativeTargetByName(project, SHARE_EXTENSION_NAME)) return modConfig;

    const target = project.addTarget(
      SHARE_EXTENSION_NAME,
      "app_extension",
      SHARE_EXTENSION_NAME,
      `${bundleIdentifier}.share`,
    );
    project.addBuildPhase(
      [`${SHARE_EXTENSION_NAME}/ShareViewController.swift`],
      "PBXSourcesBuildPhase",
      "Sources",
      target.uuid,
    );

    const configs = project.pbxXCBuildConfigurationSection();
    for (const [key, buildConfig] of Object.entries(configs)) {
      if (!buildConfig || key.endsWith("_comment") || buildConfig.isa !== "XCBuildConfiguration") continue;
      const settings = buildConfig.buildSettings ?? {};
      if (settings.PRODUCT_BUNDLE_IDENTIFIER !== `"${bundleIdentifier}.share"`) continue;
      settings.DEVELOPMENT_TEAM = settings.DEVELOPMENT_TEAM ?? "$(DEVELOPMENT_TEAM)";
      settings.IPHONEOS_DEPLOYMENT_TARGET = settings.IPHONEOS_DEPLOYMENT_TARGET ?? "15.1";
      settings.SWIFT_VERSION = settings.SWIFT_VERSION ?? "5.0";
      settings.APPLICATION_EXTENSION_API_ONLY = "YES";
      settings.MARKETING_VERSION = settings.MARKETING_VERSION ?? marketingVersion;
      settings.CURRENT_PROJECT_VERSION = settings.CURRENT_PROJECT_VERSION ?? "1";
    }

    return modConfig;
  });
}

function withSubskillsShareTargets(config) {
  config = withAndroidShareManifest(config);
  config = withAndroidShareIntentNormalizer(config);
  config = withIosShareExtensionFiles(config);
  config = withIosShareExtensionTarget(config);
  return config;
}

module.exports = withSubskillsShareTargets;
module.exports.default = withSubskillsShareTargets;
module.exports.PLUGIN_NAME = PLUGIN_NAME;
