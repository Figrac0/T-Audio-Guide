import { Capacitor } from '@capacitor/core'

/** true only inside the Android (or iOS) APK, false in the browser */
export const isNative = Capacitor.isNativePlatform()
