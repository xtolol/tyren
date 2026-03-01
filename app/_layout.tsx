import { BottomSheetModalProvider } from "@gorhom/bottom-sheet";
import { useRouter, useSegments, Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import { Linking } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { useAuthStore } from "@/src/stores/useAuthStore";
import { supabase } from "@/src/lib/supabase";

async function handleDeepLink(url: string) {
  // Supabase appends tokens as query params when redirecting to a custom scheme
  const parsed = new URL(url);
  const accessToken = parsed.searchParams.get('access_token');
  const refreshToken = parsed.searchParams.get('refresh_token');
  const code = parsed.searchParams.get('code');

  if (accessToken && refreshToken) {
    await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
  } else if (code) {
    await supabase.auth.exchangeCodeForSession(code);
  }
}

function AuthGuard() {
  const router = useRouter();
  const segments = useSegments();
  const { session, initialized, initialize } = useAuthStore();

  useEffect(() => {
    const unsubscribe = initialize();

    // Handle deep link that launched the app
    Linking.getInitialURL().then((url) => { if (url) handleDeepLink(url); });

    // Handle deep link while app is already open
    const sub = Linking.addEventListener('url', ({ url }) => handleDeepLink(url));

    return () => {
      unsubscribe();
      sub.remove();
    };
  }, []);

  useEffect(() => {
    if (!initialized) return;
    const onAuthScreen = (segments[0] as string) === 'auth';
    if (!session && !onAuthScreen) {
      router.replace('/auth' as never);
    } else if (session && onAuthScreen) {
      router.replace('/' as never);
    }
  }, [session, initialized, segments]);

  return null;
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <BottomSheetModalProvider>
        <StatusBar style="light" translucent backgroundColor="transparent" />
        <AuthGuard />
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: 'transparent' },
          }}
        />
      </BottomSheetModalProvider>
    </GestureHandlerRootView>
  );
}
