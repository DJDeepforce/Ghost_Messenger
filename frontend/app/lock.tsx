import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../src/context/AuthContext';

export default function LockScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { verifyBiometrics, logout, panic } = useAuth();

  const handleUnlock = async () => {
    const verified = await verifyBiometrics();
    if (verified) {
      router.replace('/chat');
    } else {
      Alert.alert('Erreur', 'Vérification échouée');
    }
  };

  const handleLogout = () => {
    Alert.alert(
      'Déconnexion',
      'Voulez-vous vous déconnecter ?',
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Déconnexion',
          onPress: async () => {
            await logout();
            router.replace('/auth');
          },
        },
      ]
    );
  };

  const handlePanic = () => {
    Alert.alert(
      'MODE PANIQUE',
      'SUPPRIMER TOUTES LES DONNÉES ?',
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'SUPPRIMER',
          style: 'destructive',
          onPress: async () => {
            await panic();
            router.replace('/auth');
          },
        },
      ]
    );
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.content}>
        <View style={styles.iconContainer}>
          <Ionicons name="lock-closed" size={64} color="#6366f1" />
        </View>
        
        <Text style={styles.title}>GhostChat</Text>
        <Text style={styles.subtitle}>Vérification requise</Text>

        <TouchableOpacity
          style={styles.unlockButton}
          onPress={handleUnlock}
        >
          <Ionicons name="finger-print" size={24} color="#fff" />
          <Text style={styles.unlockText}>Déverrouiller</Text>
        </TouchableOpacity>

        <View style={styles.actions}>
          <TouchableOpacity
            style={styles.actionButton}
            onPress={handleLogout}
          >
            <Text style={styles.actionText}>Déconnexion</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.actionButton, styles.panicAction]}
            onPress={handlePanic}
          >
            <Ionicons name="warning" size={16} color="#ef4444" />
            <Text style={[styles.actionText, styles.panicText]}>Panique</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0a0a',
  },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  iconContainer: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: 'rgba(99, 102, 241, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
    marginBottom: 40,
  },
  unlockButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#6366f1',
    paddingVertical: 16,
    paddingHorizontal: 32,
    borderRadius: 12,
  },
  unlockText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
    marginLeft: 12,
  },
  actions: {
    flexDirection: 'row',
    marginTop: 40,
    gap: 24,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
  },
  panicAction: {
    gap: 4,
  },
  actionText: {
    color: '#666',
    fontSize: 14,
  },
  panicText: {
    color: '#ef4444',
  },
});
