import Foundation

/**
 * SharedDefaults — Native module that exposes a bridge method
 * for React Native to write data into the shared App Group
 * UserDefaults container, making it readable by the Widget Extension.
 *
 * This file goes in ios/<AppName>/SharedDefaults.swift after prebuild.
 */
@objc(SharedDefaults)
class SharedDefaults: NSObject {
    private static let appGroupID = "group.com.yourname.pesar"

    @objc
    func setString(_ key: String, value: String) {
        let defaults = UserDefaults(suiteName: SharedDefaults.appGroupID)
        defaults?.set(value, forKey: key)
        defaults?.synchronize()
    }

    @objc
    func setDouble(_ key: String, value: Double) {
        let defaults = UserDefaults(suiteName: SharedDefaults.appGroupID)
        defaults?.set(value, forKey: key)
        defaults?.synchronize()
    }

    // Called after every rate update so the widget reads fresh data
    @objc
    func refreshWidget() {
        // Reload all widget timelines
        if #available(iOS 14.0, *) {
            // WidgetCenter.shared.reloadAllTimelines()
            // Uncomment the above line and import WidgetKit at the top of this file
            // once the widget target is set up via expo prebuild.
        }
    }

    @objc
    static func requiresMainQueueSetup() -> Bool {
        return false
    }
}
