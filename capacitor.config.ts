import { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.spup.app',
  appName: 'Spup',

  // Placeholder folder (the app loads your live site via server.url below).
  // Must exist, or `npx cap sync` fails.
  webDir: 'mobile-www',

  server: {
    url: 'https://spup.live',
    // Links to these domains stay inside the app; everything else
    // opens outside it.
    allowNavigation: ['spup.live', '*.spup.live'],
  },

  plugins: {
    SplashScreen: {
      // Safety cap. The splash is normally hidden earlier, the moment the
      // page paints its first content (inline script in app/layout.tsx),
      // with NativeSplashHider as the after-hydration fallback. This only
      // matters on a very slow connection, and it used to be 3000ms - which
      // is exactly how long the splash sat there on slow internet.
      // 500ms was too short for a remote site (flash before the page
      // appeared); 1500ms is the middle ground. Needs `npx cap sync` and a
      // new app build to take effect.
      launchShowDuration: 1500,
      launchAutoHide: true,
      launchFadeOutDuration: 200,
      backgroundColor: '#0A0A0A',
      androidSplashResourceName: 'splash',
      androidScaleType: 'CENTER_CROP',
      showSpinner: false,
    },
    PushNotifications: {
      presentationOptions: ['badge', 'sound', 'alert'],
    },
    StatusBar: {
      style: 'DARK', // light icons/text, for your dark theme
      backgroundColor: '#0A0A0A',
    },
  },

  android: {
    backgroundColor: '#0A0A0A',
    buildOptions: {
      keystorePath: 'android/app/spup.keystore',
      keystoreAlias: 'spup',
    },
  },

  ios: {
    backgroundColor: '#0A0A0A',
    contentInset: 'always',
    scrollEnabled: true,
  },
}

export default config