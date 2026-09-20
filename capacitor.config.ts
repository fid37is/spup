import { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.spup.app',
  appName: "Spup",
  webDir: 'out',          // Next.js static export output
  
  server: {
    // During development, point to local Next.js server so the device/
    // simulator can reach it. Replace 192.168.1.x with your machine's
    // actual LAN IP (e.g. `ipconfig getifaddr en0` on macOS, `hostname -I`
    // on Linux, `ipconfig` on Windows) — this placeholder will not resolve.
    // Comment this whole block out for production builds.
    url: 'http://192.168.1.x:3000',
    cleartext: true,
  },
  plugins: {
    SplashScreen: {
      // Was a fixed 2000ms regardless of how fast the app was ready. Now a
      // 500ms safety cap; NativeSplashHider hides it earlier, as soon as the
      // web app has mounted.
      launchShowDuration: 500,
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
      style: 'dark',                  // Spup is dark-themed
      backgroundColor: '#0A0A0A',
    },
  },
  android: {
    allowMixedContent: true,
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
