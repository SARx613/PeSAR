import { NativeModules, Platform } from 'react-native';
import { RatePoint } from '../store/useRateStore';

const { SharedDefaults } = NativeModules;

/**
 * Write the latest rate and history to the shared App Group UserDefaults
 * so the iOS Widget Extension can read it.
 *
 * No-ops on Android (widgets are handled differently there).
 */
export function writeRateToWidget(rate: number, history: RatePoint[], lastUpdated: string): void {
  if (Platform.OS !== 'ios' || !SharedDefaults) return;

  try {
    SharedDefaults.setDouble('currentRate', rate);
    SharedDefaults.setString('lastUpdated', formatTimeForWidget(lastUpdated));

    // Keep last 12 points for the sparkline (3h at 15-min intervals)
    const recent = history.slice(-12);
    SharedDefaults.setString(
      'rateHistory',
      JSON.stringify(recent.map((p) => ({ rate: p.rate, timestamp: p.timestamp }))),
    );

    // Ask WidgetKit to reload the timeline
    SharedDefaults.refreshWidget();
  } catch (err) {
    console.warn('[SharedDefaults] Failed to write widget data:', err);
  }
}

function formatTimeForWidget(iso: string): string {
  try {
    const date = new Date(iso);
    return date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '—';
  }
}
