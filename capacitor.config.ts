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
      // Safety cap. NativeSplashHider hides the splash earlier, as soon
      // as the page has loaded, so this only matters on a very slow
      // connection. 500ms was too short for a remote site and would
      // cause a white flash before the page appeared.
      launchShowDuration: 3000,
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