// Compiled-equivalent of withWidget.ts — plain JS for use by Expo config plugin system.
const { withXcodeProject, withEntitlementsPlist } = require('expo/config-plugins');
const fs = require('fs');
const path = require('path');

const WIDGET_TARGET_NAME = 'PeSARWidget';
const APP_GROUP_ID = 'group.com.yourname.pesar';
const SWIFT_SOURCE = path.join(__dirname, 'PeSARWidget.swift');

function addWidgetExtensionTarget(xcodeProject) {
  const existingTargets = xcodeProject.pbxNativeTargetSection();
  const alreadyExists = Object.values(existingTargets).some(
    (t) => typeof t === 'object' && t !== null && t.name === `"${WIDGET_TARGET_NAME}"`,
  );
  if (alreadyExists) {
    console.log(`[PeSARWidget] Target "${WIDGET_TARGET_NAME}" already exists, skipping.`);
  }
}

const withPeSARWidget = (config) => {
  config = withEntitlementsPlist(config, (cfg) => {
    const entitlements = cfg.modResults;
    const key = 'com.apple.security.application-groups';
    const existing = entitlements[key];
    if (!existing) {
      entitlements[key] = [APP_GROUP_ID];
    } else if (Array.isArray(existing) && !existing.includes(APP_GROUP_ID)) {
      existing.push(APP_GROUP_ID);
    }
    return cfg;
  });

  config = withXcodeProject(config, (cfg) => {
    const iosDir = cfg.modRequest.platformProjectRoot;
    const widgetDir = path.join(iosDir, WIDGET_TARGET_NAME);

    if (!fs.existsSync(widgetDir)) {
      fs.mkdirSync(widgetDir, { recursive: true });
    }

    const dest = path.join(widgetDir, 'PeSARWidget.swift');
    if (!fs.existsSync(dest)) {
      fs.copyFileSync(SWIFT_SOURCE, dest);
      console.log(`[PeSARWidget] Copied PeSARWidget.swift → ${dest}`);
    }

    const plistPath = path.join(widgetDir, 'Info.plist');
    if (!fs.existsSync(plistPath)) {
      fs.writeFileSync(plistPath, getWidgetInfoPlist(cfg.ios?.bundleIdentifier ?? 'com.yourname.pesar'));
      console.log(`[PeSARWidget] Created widget Info.plist`);
    }

    addWidgetExtensionTarget(cfg.modResults);
    return cfg;
  });

  return config;
};

function getWidgetInfoPlist(mainBundleId) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleDevelopmentRegion</key>
  <string>$(DEVELOPMENT_LANGUAGE)</string>
  <key>CFBundleDisplayName</key>
  <string>PeSAR</string>
  <key>CFBundleExecutable</key>
  <string>$(EXECUTABLE_NAME)</string>
  <key>CFBundleIdentifier</key>
  <string>${mainBundleId}.widget</string>
  <key>CFBundleInfoDictionaryVersion</key>
  <string>6.0</string>
  <key>CFBundleName</key>
  <string>$(PRODUCT_NAME)</string>
  <key>CFBundlePackageType</key>
  <string>$(PRODUCT_BUNDLE_PACKAGE_TYPE)</string>
  <key>CFBundleShortVersionString</key>
  <string>1.0</string>
  <key>CFBundleVersion</key>
  <string>1</string>
  <key>NSExtension</key>
  <dict>
    <key>NSExtensionPointIdentifier</key>
    <string>com.apple.widgetkit-extension</string>
  </dict>
</dict>
</plist>`;
}

module.exports = withPeSARWidget;
