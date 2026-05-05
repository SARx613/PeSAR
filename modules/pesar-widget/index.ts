import { ConfigPlugin } from '@expo/config-plugins';
import { withPeSARWidget } from './withWidget';

/**
 * Expo Config Plugin entry point.
 * Referenced in app.json: "./modules/pesar-widget/index"
 */
const withPeSARWidgetPlugin: ConfigPlugin = (config) => {
  return withPeSARWidget(config);
};

export default withPeSARWidgetPlugin;
