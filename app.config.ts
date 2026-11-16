// Extends app.json. Set BEACON_PERSONAL_BUILD=1 to build with a free Apple
// "Personal Team": the real bundle ID belongs to the distribution team, and
// a bundle ID can only be registered to one team, so personal builds use a
// separate ".dev" ID (installable side by side with the TestFlight app).
import type { ConfigContext, ExpoConfig } from 'expo/config';

export default ({ config }: ConfigContext): ExpoConfig => {
  const personal = process.env.BEACON_PERSONAL_BUILD === '1';
  return {
    ...config,
    name: config.name ?? 'Beacon',
    slug: config.slug ?? 'Beacon',
    ios: {
      ...config.ios,
      ...(personal && { bundleIdentifier: `${config.ios?.bundleIdentifier ?? 'com.geoffreygx.beacon'}.dev` }),
    },
  };
};
