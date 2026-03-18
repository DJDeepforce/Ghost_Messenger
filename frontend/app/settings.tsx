import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Switch,
  Alert,
  ScrollView,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../src/context/AuthContext';

export default function SettingsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user, biometricsEnabled, enableBiometrics, panic, logout } = useAuth();
  
  const [biometrics, setBiometrics] = useState(biometricsEnabled);

  const handleBiometricsToggle = async () => {
    if (!biometrics) {
      const success = await enableBiometrics();
      if (success) {
        setBiometrics(true);
        Alert.alert('Succès', 'Biométrie activée');
      } else {
        Alert.alert('Erreur', 'Impossible d\'activer la biométrie');
      }
    } else {
      setBiometrics(false);
    }
  };

  const handlePanic = () => {
    Alert.alert(
      'MODE PANIQUE',
      'ATTENTION: Cette action va SUPPRIMER définitivement:\n\n• Tous vos messages\n• Toutes vos conversations\n• Votre compte\n• Toutes les données locales\n\nCette action est IRRÉVERSIBLE.',
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'TOUT SUPPRIMER',
          style: 'destructive',
          onPress: async () => {
            await panic();
            router.replace('/auth');
          },
        },
      ]
    );
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

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => router.back()}
        >
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.title}>Paramètres</Text>
        <View style={styles.placeholder} />
      </View>

      <ScrollView style={styles.content}>
        {/* Profile Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Profil</Text>
          <View style={styles.profileCard}>
            <View style={styles.avatar}>
              <Ionicons name="person" size={32} color="#6366f1" />
            </View>
            <View style={styles.profileInfo}>
              <Text style={styles.username}>@{user?.username}</Text>
              <Text style={styles.userId}>ID: {user?.id?.slice(0, 8)}...</Text>
            </View>
          </View>
        </View>

        {/* Security Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Sécurité</Text>
          
          <View style={styles.settingItem}>
            <View style={styles.settingInfo}>
              <Ionicons name="finger-print" size={22} color="#6366f1" />
              <View style={styles.settingText}>
                <Text style={styles.settingLabel}>Biométrie</Text>
                <Text style={styles.settingDescription}>
                  Utiliser Face ID / Touch ID
                </Text>
              </View>
            </View>
            <Switch
              value={biometrics}
              onValueChange={handleBiometricsToggle}
              trackColor={{ false: '#333', true: '#6366f1' }}
              thumbColor="#fff"
            />
          </View>

          <View style={styles.settingItem}>
            <View style={styles.settingInfo}>
              <Ionicons name="lock-closed" size={22} color="#22c55e" />
              <View style={styles.settingText}>
                <Text style={styles.settingLabel}>Chiffrement E2E</Text>
                <Text style={styles.settingDescription}>
                  Activé par défaut
                </Text>
              </View>
            </View>
            <Ionicons name="checkmark-circle" size={24} color="#22c55e" />
          </View>

          <View style={styles.settingItem}>
            <View style={styles.settingInfo}>
              <Ionicons name="timer" size={22} color="#f59e0b" />
              <View style={styles.settingText}>
                <Text style={styles.settingLabel}>Messages éphémères</Text>
                <Text style={styles.settingDescription}>
                  Suppression immédiate après lecture
                </Text>
              </View>
            </View>
            <Ionicons name="checkmark-circle" size={24} color="#22c55e" />
          </View>
        </View>

        {/* Privacy Info */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Confidentialité</Text>
          <View style={styles.infoCard}>
            <Ionicons name="shield-checkmark" size={24} color="#6366f1" />
            <Text style={styles.infoText}>
              Vos messages sont chiffrés de bout en bout avec le protocole NaCl. 
              Aucune donnée n'est stockée sur nos serveurs après lecture. 
              Aucun email ou numéro de téléphone n'est requis.
            </Text>
          </View>
        </View>

        {/* Actions */}
        <View style={styles.section}>
          <TouchableOpacity
            style={styles.actionButton}
            onPress={handleLogout}
          >
            <Ionicons name="log-out-outline" size={22} color="#fff" />
            <Text style={styles.actionButtonText}>Déconnexion</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.actionButton, styles.panicButton]}
            onPress={handlePanic}
          >
            <Ionicons name="warning" size={22} color="#fff" />
            <Text style={styles.actionButtonText}>MODE PANIQUE</Text>
          </TouchableOpacity>
          <Text style={styles.panicWarning}>
            Supprime définitivement toutes vos données
          </Text>
        </View>

        <View style={{ height: insets.bottom + 20 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0a0a',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#1a1a1a',
  },
  backButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    color: '#fff',
  },
  placeholder: {
    width: 44,
  },
  content: {
    flex: 1,
  },
  section: {
    paddingHorizontal: 20,
    paddingTop: 24,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#666',
    textTransform: 'uppercase',
    marginBottom: 12,
  },
  profileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1a1a1a',
    borderRadius: 16,
    padding: 16,
  },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(99, 102, 241, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 16,
  },
  profileInfo: {
    flex: 1,
  },
  username: {
    fontSize: 18,
    fontWeight: '600',
    color: '#fff',
  },
  userId: {
    fontSize: 12,
    color: '#666',
    marginTop: 4,
  },
  settingItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    padding: 16,
    marginBottom: 8,
  },
  settingInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  settingText: {
    marginLeft: 12,
    flex: 1,
  },
  settingLabel: {
    fontSize: 16,
    color: '#fff',
  },
  settingDescription: {
    fontSize: 12,
    color: '#666',
    marginTop: 2,
  },
  infoCard: {
    flexDirection: 'row',
    backgroundColor: 'rgba(99, 102, 241, 0.1)',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(99, 102, 241, 0.2)',
  },
  infoText: {
    flex: 1,
    fontSize: 13,
    color: '#888',
    lineHeight: 20,
    marginLeft: 12,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  actionButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
    marginLeft: 8,
  },
  panicButton: {
    backgroundColor: '#ef4444',
  },
  panicWarning: {
    textAlign: 'center',
    fontSize: 12,
    color: '#666',
  },
});
