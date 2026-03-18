import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Share,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import QRCode from 'react-native-qrcode-svg';
import { useAuth } from '../src/context/AuthContext';

export default function MyQRCodeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user, getKeyPair } = useAuth();

  // Generate QR data containing user info for contact addition
  const qrData = JSON.stringify({
    type: 'ghostchat_contact',
    id: user?.id,
    username: user?.username,
    public_key: user?.public_key || getKeyPair()?.publicKey,
  });

  const handleShare = async () => {
    try {
      await Share.share({
        message: `Ajoutez-moi sur GhostChat!\n\nMon identifiant: @${user?.username}\n\nScannez mon QR code dans l'application.`,
      });
    } catch (error) {
      Alert.alert('Erreur', 'Impossible de partager');
    }
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
        <Text style={styles.title}>Mon QR Code</Text>
        <View style={styles.placeholder} />
      </View>

      <View style={styles.content}>
        <View style={styles.qrContainer}>
          <View style={styles.qrWrapper}>
            <QRCode
              value={qrData}
              size={220}
              backgroundColor="#fff"
              color="#000"
              logo={undefined}
            />
          </View>
          
          <View style={styles.userInfo}>
            <View style={styles.avatarContainer}>
              <Ionicons name="person" size={28} color="#6366f1" />
            </View>
            <Text style={styles.username}>@{user?.username}</Text>
          </View>
        </View>

        <Text style={styles.instructions}>
          Faites scanner ce QR code pour être ajouté comme contact
        </Text>

        <View style={styles.actions}>
          <TouchableOpacity
            style={styles.actionButton}
            onPress={handleShare}
          >
            <Ionicons name="share-outline" size={22} color="#fff" />
            <Text style={styles.actionText}>Partager</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.actionButton, styles.scanButton]}
            onPress={() => router.push('/scan-qr')}
          >
            <Ionicons name="scan" size={22} color="#fff" />
            <Text style={styles.actionText}>Scanner un QR</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.securityNote}>
          <Ionicons name="shield-checkmark" size={18} color="#22c55e" />
          <Text style={styles.securityText}>
            Votre clé publique est incluse pour le chiffrement E2E
          </Text>
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
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  qrContainer: {
    backgroundColor: '#1a1a1a',
    borderRadius: 24,
    padding: 24,
    alignItems: 'center',
    marginBottom: 24,
  },
  qrWrapper: {
    padding: 16,
    backgroundColor: '#fff',
    borderRadius: 16,
    marginBottom: 20,
  },
  userInfo: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatarContainer: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(99, 102, 241, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  username: {
    fontSize: 20,
    fontWeight: '600',
    color: '#fff',
  },
  instructions: {
    fontSize: 14,
    color: '#888',
    textAlign: 'center',
    marginBottom: 32,
  },
  actions: {
    flexDirection: 'row',
    gap: 12,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#6366f1',
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 12,
    gap: 8,
  },
  scanButton: {
    backgroundColor: '#1a1a1a',
    borderWidth: 1,
    borderColor: '#333',
  },
  actionText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  securityNote: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 40,
    gap: 8,
  },
  securityText: {
    fontSize: 12,
    color: '#666',
  },
});
