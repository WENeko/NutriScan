import WidgetKit
import SwiftUI

// MARK: - Données partagées (App Group)
// Le web écrit via Capacitor Preferences (group: "NutriScanWidget"),
// ce qui correspond à UserDefaults(suiteName: "group.com.nutriscan.app").

struct DailySummary: Codable {
    var calories_consumed: Int = 0
    var calories_target: Int = 0
    var protein_consumed: Int = 0
    var protein_target: Int = 0
    var carbs_consumed: Int = 0
    var carbs_target: Int = 0
    var fat_consumed: Int = 0
    var fat_target: Int = 0
}

struct FavoriteMeal: Codable, Identifiable {
    let id: String
    let name: String
    let calories: Int
    let icon: String
}

struct WidgetPayload: Codable {
    var daily_summary: DailySummary
    var favorite_meals: [FavoriteMeal]
}

enum WidgetStore {
    static let suite = "group.com.nutriscan.app"
    static let key = "widget_data"

    static func load() -> WidgetPayload {
        guard let defaults = UserDefaults(suiteName: suite),
              let raw = defaults.string(forKey: key),
              let data = raw.data(using: .utf8),
              let payload = try? JSONDecoder().decode(WidgetPayload.self, from: data)
        else { return WidgetPayload(daily_summary: DailySummary(), favorite_meals: []) }
        return payload
    }
}

struct NutriEntry: TimelineEntry {
    let date: Date
    let payload: WidgetPayload
}

struct NutriProvider: TimelineProvider {
    func placeholder(in context: Context) -> NutriEntry {
        NutriEntry(date: Date(), payload: WidgetStore.load())
    }
    func getSnapshot(in context: Context, completion: @escaping (NutriEntry) -> Void) {
        completion(NutriEntry(date: Date(), payload: WidgetStore.load()))
    }
    func getTimeline(in context: Context, completion: @escaping (Timeline<NutriEntry>) -> Void) {
        let entry = NutriEntry(date: Date(), payload: WidgetStore.load())
        completion(Timeline(entries: [entry], policy: .after(Date().addingTimeInterval(1800))))
    }
}

// MARK: - A. Caméra / Bibliothèque

struct ScanWidgetView: View {
    var body: some View {
        VStack(spacing: 8) {
            Text("NutriScan").font(.caption).bold().foregroundColor(.green)
            HStack(spacing: 8) {
                Link(destination: URL(string: "nutriscan://scan?source=camera")!) {
                    VStack { Text("📷"); Text("Caméra").font(.caption2) }
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                        .background(Color.green.opacity(0.15)).cornerRadius(14)
                }
                Link(destination: URL(string: "nutriscan://scan?source=gallery")!) {
                    VStack { Text("🖼️"); Text("Galerie").font(.caption2) }
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                        .background(Color.green.opacity(0.15)).cornerRadius(14)
                }
            }
        }.padding(12)
    }
}

struct ScanWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "NutriScanScanWidget", provider: NutriProvider()) { _ in
            ScanWidgetView()
        }
        .configurationDisplayName("Caméra / Bibliothèque")
        .description("Scannez un repas en un tap.")
        .supportedFamilies([.systemSmall, .systemMedium])
    }
}

// MARK: - B. Favoris rapides (2x2)

struct FavoritesWidgetView: View {
    let payload: WidgetPayload
    var body: some View {
        let favs = Array(payload.favorite_meals.prefix(4))
        VStack(alignment: .leading, spacing: 6) {
            Text("Favoris rapides").font(.caption).bold().foregroundColor(.green)
            LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 6) {
                ForEach(favs) { fav in
                    Link(destination: URL(string: "nutriscan://quicklog?meal_id=\(fav.id)")!) {
                        VStack(spacing: 2) {
                            Text("\(fav.icon) \(fav.name)").font(.caption2).lineLimit(2)
                            Text("\(fav.calories) kcal").font(.system(size: 9)).foregroundColor(.secondary)
                        }
                        .frame(maxWidth: .infinity, minHeight: 46)
                        .background(Color.green.opacity(0.15)).cornerRadius(12)
                    }
                }
            }
        }.padding(12)
    }
}

struct FavoritesWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "NutriScanFavoritesWidget", provider: NutriProvider()) { entry in
            FavoritesWidgetView(payload: entry.payload)
        }
        .configurationDisplayName("Favoris rapides")
        .description("Enregistrez un repas favori en 1 tap.")
        .supportedFamilies([.systemMedium])
    }
}

// MARK: - C. Aperçu macros du jour

struct MacrosWidgetView: View {
    let s: DailySummary
    private func ratio(_ v: Int, _ t: Int) -> Double { t <= 0 ? 0 : min(1, Double(v) / Double(t)) }

    var body: some View {
        Link(destination: URL(string: "nutriscan://dashboard")!) {
            VStack(alignment: .leading, spacing: 6) {
                Text("\(s.calories_consumed) / \(s.calories_target) kcal").font(.headline)
                ProgressView(value: ratio(s.calories_consumed, s.calories_target)).tint(.green)
                Text("P \(s.protein_consumed)/\(s.protein_target)g").font(.system(size: 10))
                ProgressView(value: ratio(s.protein_consumed, s.protein_target))
                Text("G \(s.carbs_consumed)/\(s.carbs_target)g").font(.system(size: 10))
                ProgressView(value: ratio(s.carbs_consumed, s.carbs_target))
                Text("L \(s.fat_consumed)/\(s.fat_target)g").font(.system(size: 10))
                ProgressView(value: ratio(s.fat_consumed, s.fat_target))
            }.padding(12)
        }
    }
}

struct MacrosWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "NutriScanMacrosWidget", provider: NutriProvider()) { entry in
            MacrosWidgetView(s: entry.payload.daily_summary)
        }
        .configurationDisplayName("Macros du jour")
        .description("Calories et macros restants.")
        .supportedFamilies([.systemSmall, .systemMedium])
    }
}

@main
struct NutriScanWidgetBundle: WidgetBundle {
    var body: some Widget {
        ScanWidget()
        FavoritesWidget()
        MacrosWidget()
    }
}
