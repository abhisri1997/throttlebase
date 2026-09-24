// app.config.ts
import type { ExpoConfig } from 'expo/config';

// Strict only where a missing value would ship a broken binary (EAS build servers, CI).
// Locally (and for EAS CLI commands like env:set / project:info) it warns instead of throwing.
const isStrict = process.env.EAS_BUILD === 'true' || process.env.CI === 'true';

const required = (name: string, localPlaceholder = ''): string => {
    const v = process.env[name];
    if (v) return v;
    if (isStrict) {
        throw new Error(`Missing env var ${name}: set it in the EAS environment for this build profile`);
    }
    console.warn(`[app.config] ${name} is not set; using placeholder (OK for local CLI commands, not for builds)`);
    return localPlaceholder;
};

const config: ExpoConfig = {
    name: 'ThrottleBase',
    slug: 'throttlebase',
    version: '1.0.0',
    scheme: 'throttlebase',
    orientation: 'portrait',
    icon: './assets/icon.png',
    userInterfaceStyle: 'dark',
    extra: {
        // Not a secret; must be static so EAS CLI can resolve the project before any env vars exist.
        eas: { projectId: 'ee15bbec-df80-4454-ad03-2f87e3bff889' },
    },
    splash: {
        image: './assets/splash-icon.png',
        resizeMode: 'contain',
        backgroundColor: '#0B1220',
    },
    ios: {
        supportsTablet: true,
        bundleIdentifier: 'in.throttlebase.rider',
        config: {
            googleMapsApiKey: required('GOOGLE_MAPS_IOS_API_KEY'),
        },
        infoPlist: {
            UIBackgroundModes: ['location', 'fetch'],
        },
    },
    android: {
        package: 'in.throttlebase.rider',
        config: {
            googleMaps: { apiKey: required('GOOGLE_MAPS_ANDROID_API_KEY') },
        },
        adaptiveIcon: {
            backgroundColor: '#E6F4FE',
            foregroundImage: './assets/android-icon-foreground.png',
            backgroundImage: './assets/android-icon-background.png',
            monochromeImage: './assets/android-icon-monochrome.png',
        },
        predictiveBackGestureEnabled: false,
        permissions: [
            'android.permission.RECORD_AUDIO',
            'android.permission.MODIFY_AUDIO_SETTINGS',
            'android.permission.ACCESS_COARSE_LOCATION',
            'android.permission.ACCESS_FINE_LOCATION',
            'android.permission.ACCESS_BACKGROUND_LOCATION',
            'android.permission.FOREGROUND_SERVICE',
            'android.permission.FOREGROUND_SERVICE_LOCATION',
        ],
    },
    web: {
        bundler: 'metro',
        favicon: './assets/favicon.png',
    },
    plugins: [
        'expo-router',
        'expo-audio',
        './plugins/with-android-jdk17',
        './plugins/with-ios-deployment-target',
        './plugins/with-no-apple-signin',
        'react-native-map-link',
        '@react-native-community/datetimepicker',
        [
            'expo-location',
            {
                locationAlwaysAndWhenInUsePermission:
                    'ThrottleBase needs your location to share your position with your ride group, even when the app is in the background.',
                locationAlwaysPermission:
                    'ThrottleBase needs background location to keep sharing your position during an active group ride.',
                locationWhenInUsePermission: 'ThrottleBase needs your location to show you on the ride map.',
                isAndroidBackgroundLocationEnabled: true,
                isAndroidForegroundServiceEnabled: true,
                isIosBackgroundLocationEnabled: true,
            },
        ],
        'expo-task-manager',
        // --- auth ---
        // 'expo-apple-authentication' and ios.usesAppleSignIn are enabled
        // together once the Apple Developer membership exists and the
        // "Sign In with Apple" capability is added to in.throttlebase.rider.
        // The entitlement fails the iOS build without that capability, so
        // both stay off until then. The app code already handles Apple being
        // unavailable; see services/platformCapabilities.ts.
        'expo-secure-store',
        [
            '@react-native-google-signin/google-signin',
            { iosUrlScheme: required('GOOGLE_IOS_URL_SCHEME', 'com.googleusercontent.apps.placeholder') },
        ],
    ],
};

export default config;