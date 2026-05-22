import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.tguide.app',
  appName: 'T-Guide',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
  },
  android: {
    backgroundColor: '#e8edf4',
  },
  plugins: {
    StatusBar: {
      overlaysWebView: true,
      style: 'DARK',
      backgroundColor: '#00000000',
    },
    SplashScreen: {
      launchShowDuration: 800,
      backgroundColor: '#e8edf4',
      showSpinner: false,
      androidSplashResourceName: 'splash',
    },
    Geolocation: {
      // Request precise location on Android 12+
      requestPermissions: true,
    },
  },
}

export default config
