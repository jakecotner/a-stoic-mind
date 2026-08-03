import { Stack } from 'expo-router';

// The library is a stack inside its tab: works → parts → reader. Screens
// draw their own titles (the shared Screen scaffold), so native headers
// stay off; the iOS swipe-back gesture still works.
export default function LibraryLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
