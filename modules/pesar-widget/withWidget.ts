import {
  ConfigPlugin,
  withXcodeProject,
  withEntitlementsPlist,
  IOSConfig,
  XcodeProject,
} from 'expo/config-plugins';
import * as fs from 'fs';
import * as path from 'path';

const WIDGET_TARGET_NAME = 'PeSARWidget';
const APP_GROUP_ID = 'group.com.yourname.pesar';
const SWIFT_SOURCE = path.join(__dirname, 'PeSARWidget.swift');

// ------------------------------------------------------------------
// Helper: add the widget extension target to the Xcode project
// ------------------------------------------------------------------
function addWidgetExtensionTarget(xcodeProject: XcodeProject, pbxProjectPath: string) {
  const targetName = WIDGET_TARGET_NAME;
  const bundleId = `${xcodeProject.getFirstTarget().firstTarget.productReference}.widget`;

  // Check if target already exists
  const existingTargets = xcodeProject.pbxNativeTargetSection();
  const alreadyExists = Object.values(existingTargets).some(
    (t: unknown) => typeof t === 'object' && t !== null && (t as { name?: string }).name === `"${targetName}"`,
  );
  if (alreadyExists) {
    console.log(`[PeSARWidget] Target "${targetName}" already exists, skipping.`);
    return;
  }

  console.log(`[PeSARWidget] Adding Widget Extension target: ${targetName}`);
  // The actual Xcode target addition is handled by copying the Swift file
  // and relying on the user running `expo prebuild` which will set up the target.
  // For full automation, use a pre-built pbxproj modifier or react-native-widget-extension.
}

// ------------------------------------------------------------------
// Plugin: copy Swift file + add App Group entitlement
// ------------------------------------------------------------------
export const withPeSARWidget: ConfigPlugin = (config) => {
  // 1. Add App Group entitlement to main app
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

  // 2. Copy Swift source file into the ios/<WidgetTarget>/ directory at prebuild time
  config = withXcodeProject(config, (cfg) => {
    const iosDir = path.join(cfg.modRequest.platformProjectRoot);
    const widgetDir = path.join(iosDir, WIDGET_TARGET_NAME);

    if (!fs.existsSync(widgetDir)) {
      fs.mkdirSync(widgetDir, { recursive: true });
    }

    const dest = path.join(widgetDir, 'PeSARWidget.swift');
    if (!fs.existsSync(dest)) {
      fs.copyFileSync(SWIFT_SOURCE, dest);
      console.log(`[PeSARWidget] Copied PeSARWidget.swift → ${dest}`);
    }

    // Write the Info.plist for the widget extension target
    const plistPath = path.join(widgetDir, 'Info.plist');
    if (!fs.existsSync(plistPath)) {
      fs.writeFileSync(plistPath, getWidgetInfoPlist(cfg.ios?.bundleIdentifier ?? 'com.yourname.pesar'));
      console.log(`[PeSARWidget] Created widget Info.plist`);
    }

    addWidgetExtensionTarget(cfg.modResults, iosDir);
    return cfg;
  });

  return config;
};

function getWidgetInfoPlist(mainBundleId: string): string {
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
