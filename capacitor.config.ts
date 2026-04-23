import { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.spup.app',
  appName: "Spup",
  webDir: 'out',          // Next.js static export output
  
  server: {
    // During development, point to local Next.js server
    // Comment this out for production builds
    url: 'http://192.168.1.x:3000',  // Replace with your LAN IP
    cleartext: true,
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 2000,
      launchAutoHide: true,
      backgroundColor: '#0A0A0A',
      androidSplashResourceName: 'splash',
      androidScaleType: 'CENTER_CROP',
      showSpinner: false,
    },
    PushNotifications: {
      presentationOptions: ['badge', 'sound', 'alert'],
    },
    StatusBar: {
      style: 'dark',                  // Para is dark-themed
      backgroundColor: '#0A0A0A',
    },
  },
  android: {
    allowMixedContent: true,
    backgroundColor: '#0A0A0A',
    buildOptions: {
      keystorePath: 'android/app/para.keystore',
      keystoreAlias: 'para',
    },
  },
  ios: {
    backgroundColor: '#0A0A0A',
    contentInset: 'always',
    scrollEnabled: true,
  },
}

export default config
