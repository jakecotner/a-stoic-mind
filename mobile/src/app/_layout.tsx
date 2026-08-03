import { DarkTheme, DefaultTheme, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { useColorScheme } from 'react-native';

import { AnimatedSplashOverlay } from '@/components/animated-icon';
import AppTabs from '@/components/app-tabs';
import { SignInScreen } from '@/components/sign-in';
import { AuthProvider, useAuth } from '@/lib/auth-context';
import { loadPrefs } from '@/lib/prefs';

SplashScreen.preventAutoHideAsync();

function Gate() {
  const { user } = useAuth();
  // undefined = still restoring the stored session; the splash overlay covers it.
  if (user === undefined) return null;
  return user ? <AppTabs /> : <SignInScreen />;
}

export default function RootLayout() {
  const colorScheme = useColorScheme();
  // Listening prefs (voice, pace, continue mode) load once at launch so
  // reads at play time are synchronous.
  useEffect(() => {
    loadPrefs();
  }, []);
  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <AuthProvider>
        <AnimatedSplashOverlay />
        <Gate />
      </AuthProvider>
    </ThemeProvider>
  );
}
