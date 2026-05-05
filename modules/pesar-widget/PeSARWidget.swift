import WidgetKit
import SwiftUI
import Charts

// MARK: - Shared data model (read from App Group UserDefaults)

struct RateEntry: TimelineEntry {
    let date: Date
    let rate: Double?
    let history: [Double]
    let lastUpdated: String
}

struct RateData: Codable {
    let rate: Double
    let timestamp: String
}

// MARK: - Data Provider

struct PeSARWidgetProvider: TimelineProvider {
    static let appGroupID = "group.com.yourname.pesar"

    func placeholder(in context: Context) -> RateEntry {
        RateEntry(date: Date(), rate: 1242.50, history: [1230, 1235, 1238, 1240, 1242], lastUpdated: "—")
    }

    func getSnapshot(in context: Context, completion: @escaping (RateEntry) -> Void) {
        completion(loadEntry())
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<RateEntry>) -> Void) {
        let entry = loadEntry()
        // Refresh every 15 minutes
        let nextUpdate = Calendar.current.date(byAdding: .minute, value: 15, to: Date()) ?? Date()
        let timeline = Timeline(entries: [entry], policy: .after(nextUpdate))
        completion(timeline)
    }

    private func loadEntry() -> RateEntry {
        let defaults = UserDefaults(suiteName: PeSARWidgetProvider.appGroupID)

        let rate = defaults?.double(forKey: "currentRate")
        let lastUpdated = defaults?.string(forKey: "lastUpdated") ?? "—"
        let historyJSON = defaults?.string(forKey: "rateHistory") ?? "[]"

        var history: [Double] = []
        if let data = historyJSON.data(using: .utf8),
           let points = try? JSONDecoder().decode([RateData].self, from: data) {
            history = points.suffix(12).map { $0.rate }
        }

        return RateEntry(
            date: Date(),
            rate: (rate == 0 || rate == nil) ? nil : rate,
            history: history,
            lastUpdated: lastUpdated
        )
    }
}

// MARK: - Small Widget View

struct PeSARWidgetSmallView: View {
    var entry: RateEntry
    @Environment(\.colorScheme) var colorScheme

    var accentColor: Color {
        colorScheme == .dark ? Color(red: 0.039, green: 0.518, blue: 1.0) : Color(red: 0, green: 0.478, blue: 1.0)
    }

    var formattedRate: String {
        guard let rate = entry.rate else { return "—" }
        return String(format: "%.0f", rate)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            // Header
            HStack {
                Text("EUR → ARS")
                    .font(.system(size: 10, weight: .semibold))
                    .foregroundColor(.secondary)
                Spacer()
                Text("WU")
                    .font(.system(size: 9, weight: .bold))
                    .foregroundColor(accentColor)
                    .padding(.horizontal, 5)
                    .padding(.vertical, 2)
                    .background(accentColor.opacity(0.15))
                    .clipShape(Capsule())
            }

            Spacer()

            // Rate
            Text(formattedRate)
                .font(.system(size: 36, weight: .bold, design: .rounded))
                .foregroundColor(.primary)
                .minimumScaleFactor(0.7)
                .lineLimit(1)

            Text("ARS")
                .font(.system(size: 13, weight: .semibold))
                .foregroundColor(accentColor)

            Spacer()

            // Mini sparkline (iOS 16+)
            if #available(iOS 16.0, *), entry.history.count >= 3 {
                MiniSparkline(values: entry.history, accentColor: accentColor)
                    .frame(height: 28)
            }

            Text(entry.lastUpdated)
                .font(.system(size: 9))
                .foregroundColor(.secondary)
                .lineLimit(1)
        }
        .padding(12)
    }
}

// MARK: - Medium Widget View

struct PeSARWidgetMediumView: View {
    var entry: RateEntry
    @Environment(\.colorScheme) var colorScheme

    var accentColor: Color {
        colorScheme == .dark ? Color(red: 0.039, green: 0.518, blue: 1.0) : Color(red: 0, green: 0.478, blue: 1.0)
    }

    var formattedRate: String {
        guard let rate = entry.rate else { return "—" }
        let formatter = NumberFormatter()
        formatter.numberStyle = .decimal
        formatter.minimumFractionDigits = 2
        formatter.maximumFractionDigits = 2
        formatter.groupingSeparator = " "
        return formatter.string(from: NSNumber(value: rate)) ?? String(format: "%.2f", rate)
    }

    var trendInfo: (symbol: String, color: Color) {
        guard entry.history.count >= 2 else { return ("→", .secondary) }
        let diff = entry.history.last! - entry.history.first!
        if diff > 0 { return ("▲", Color.green) }
        if diff < 0 { return ("▼", Color.red) }
        return ("→", .secondary)
    }

    var body: some View {
        HStack(spacing: 16) {
            // Left: rate info
            VStack(alignment: .leading, spacing: 6) {
                Label {
                    Text("Western Union")
                        .font(.system(size: 11, weight: .semibold))
                        .foregroundColor(.secondary)
                } icon: {
                    Image(systemName: "arrow.left.arrow.right")
                        .font(.system(size: 9))
                        .foregroundColor(accentColor)
                }

                Spacer()

                Text("1 EUR =")
                    .font(.system(size: 13, weight: .regular))
                    .foregroundColor(.secondary)

                HStack(alignment: .firstTextBaseline, spacing: 4) {
                    Text(formattedRate)
                        .font(.system(size: 30, weight: .bold, design: .rounded))
                        .foregroundColor(.primary)
                        .minimumScaleFactor(0.6)
                        .lineLimit(1)
                    Text("ARS")
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundColor(accentColor)
                }

                HStack(spacing: 4) {
                    Text(trendInfo.symbol)
                        .font(.system(size: 12, weight: .bold))
                        .foregroundColor(trendInfo.color)
                    Text(entry.lastUpdated)
                        .font(.system(size: 10))
                        .foregroundColor(.secondary)
                }
            }

            Spacer()

            // Right: sparkline chart
            if #available(iOS 16.0, *), entry.history.count >= 3 {
                MiniSparkline(values: entry.history, accentColor: accentColor)
                    .frame(width: 100, height: 60)
            }
        }
        .padding(16)
    }
}

// MARK: - Sparkline (iOS 16+ Swift Charts)

@available(iOS 16.0, *)
struct MiniSparkline: View {
    let values: [Double]
    let accentColor: Color

    var chartData: [(index: Int, value: Double)] {
        values.enumerated().map { (index: $0.offset, value: $0.element) }
    }

    var body: some View {
        Chart(chartData, id: \.index) { point in
            LineMark(
                x: .value("Time", point.index),
                y: .value("Rate", point.value)
            )
            .interpolationMethod(.catmullRom)
            .foregroundStyle(accentColor)

            AreaMark(
                x: .value("Time", point.index),
                y: .value("Rate", point.value)
            )
            .interpolationMethod(.catmullRom)
            .foregroundStyle(
                LinearGradient(
                    colors: [accentColor.opacity(0.3), accentColor.opacity(0)],
                    startPoint: .top,
                    endPoint: .bottom
                )
            )
        }
        .chartXAxis(.hidden)
        .chartYAxis(.hidden)
        .chartYScale(domain: .automatic(includesZero: false))
    }
}

// MARK: - Widget Configuration

struct PeSARWidget: Widget {
    let kind: String = "PeSARWidget"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: PeSARWidgetProvider()) { entry in
            PeSARWidgetEntryView(entry: entry)
                .containerBackground(.fill.tertiary, for: .widget)
        }
        .configurationDisplayName("PeSAR")
        .description("Taux EUR → ARS Western Union en temps réel.")
        .supportedFamilies([.systemSmall, .systemMedium])
    }
}

// MARK: - Entry View Router

struct PeSARWidgetEntryView: View {
    var entry: RateEntry
    @Environment(\.widgetFamily) var family

    var body: some View {
        switch family {
        case .systemMedium:
            PeSARWidgetMediumView(entry: entry)
        default:
            PeSARWidgetSmallView(entry: entry)
        }
    }
}

// MARK: - Bundle

@main
struct PeSARWidgetBundle: WidgetBundle {
    var body: some Widget {
        PeSARWidget()
    }
}
