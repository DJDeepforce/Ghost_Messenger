import React, { useEffect, useState } from 'react';
import { View, StyleSheet, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '../src/context/AuthContext';

export default function Index() {
  const router = useRouter();
  const { isAuthenticated, isLoading, biometricsEnabled, verifyBiometrics } = useAuth();
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    checkAuth();
  }, [isLoading, isAuthenticated]);

  const checkAuth = async () => {
    if (isLoading) return;

    if (isAuthenticated) {
      // Verify biometrics if enabled
      if (biometricsEnabled) {
        const verified = await verifyBiometrics();
        if (!verified) {
          // Failed biometrics - show lock screen
          router.replace('/lock');
          return;
        }
      }
      router.replace('/chat');
    } else {
      router.replace('/auth');
    }
    setChecking(false);
  };

  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" color="#6366f1" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0a0a',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
