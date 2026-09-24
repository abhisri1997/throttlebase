const { withEntitlementsPlist } = require('expo/config-plugins');

const ENTITLEMENT = 'com.apple.developer.applesignin';

/**
 * Strips the Sign In with Apple entitlement.
 *
 * `expo-apple-authentication` ships an `app.plugin.js`, and Expo applies it
 * for any installed package, so leaving it out of the `plugins` array does
 * NOT disable it -- the entitlement is still written into the generated
 * ThrottleBase.entitlements. That entitlement can only be provisioned by a
 * paid Apple Developer account with the "Sign In with Apple" capability
 * enabled on the App ID, so with a free personal team every signed build
 * fails with "No profiles for 'in.throttlebase.rider' were found".
 *
 * The package stays installed and the native module still builds; only the
 * entitlement is removed. The app never calls Apple sign-in anyway -- see
 * services/platformCapabilities.ts, which gates it.
 *
 * Delete this plugin once the Apple Developer membership exists and the
 * capability is enabled for in.throttlebase.rider.
 */
module.exports = function withNoAppleSignIn(config) {
  return withEntitlementsPlist(config, (config) => {
    delete config.modResults[ENTITLEMENT];
    return config;
  });
};
