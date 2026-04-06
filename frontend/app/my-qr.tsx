import React, { useMemo } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  Share, Alert, ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import QRCode from 'react-native-qrcode-svg';
import { useAuth } from '../src/context/AuthContext';

const C = {
  bg: '#080810', surface: '#0f0f1a', border: '#1e1e35',
  accent: '#7C3AED', accentDim: 'rgba(124,58,237,0.12)',
  text: '#E8E8F0', muted: '#555570',
};

export default function MyQRCodeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user, getKeyPair } = useAuth();

  // FIX: resolve public_key with proper fallback, only generate QR when ready
  const publicKey = user?.public_key || getKeyPair()?.publicKey || null;

  const qrData = useMemo(() => {
    if (!user?.id || !user?.username || !publicKey) return null;
    return JSON.stringify({
      type: 'ghostchat_contact',
      id: user.id,
      username: user.username,
      public_key: publicKey,
    });
  }, [user?.id, user?.username, publicKey]);

  const handleShare = async () => {
    try {
      await Share.share({
        message: `Ajoutez-moi sur GhostChat!\nMon identifiant: @${user?.username}\n\nScannez mon QR code dans l'application.`,
      });
    } catch {
      Alert.alert('Erreur', 'Impossible de partager');
    }
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={24} color={C.text} />
        </TouchableOpacity>
        <Text style={styles.title}>Mon QR Code</Text>
        <View style={{ width: 36 }} />
      </View>

      <View style={styles.content}>
        {/* QR Card */}
        <View style={styles.qrCard}>
          {/* Accent corner decorations */}
          <View style={[styles.corner, styles.tl]} />
          <View style={[styles.corner, styles.tr]} />
          <View style={[styles.corner, styles.bl]} />
          <View style={[styles.corner, styles.br]} />

          <View style={styles.qrBox}>
            {qrData ? (
              <QRCode
                value={qrData}
                size={200}
                backgroundColor="#fff"
                color="#080810"
              />
            ) : (
              <View style={styles.qrLoading}>
                <ActivityIndicator color={C.accent} />
                <Text style={styles.qrLoadingText}>Génération...</Text>
              </View>
            )}
          </View>

          <View style={styles.userRow}>
            <View style={styles.userAvatar}>
              <Text style={styles.userAvatarText}>
                {(user?.username || '?')[0].toUpperCase()}
              </Text>
            </View>
            <Text style={styles.username}>@{user?.username}</Text>
          </View>
        </View>

        <Text style={styles.instructions}>
          Faites scanner ce code pour être ajouté comme contact
        </Text>

        {/* Actions */}
        <View style={styles.actions}>
          <TouchableOpacity style={styles.btnPrimary} onPress={handleShare}>
            <Ionicons name="share-outline" size={20} color="#fff" />
            <Text style={styles.btnPrimaryText}>Partager</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.btnSecondary} onPress={() => router.push('/scan-qr')}>
            <Ionicons name="scan-outline" size={20} color={C.accent} />
            <Text style={styles.btnSecondaryText}>Scanner un QR</Text>
          </TouchableOpacity>
        </View>

        {/* Security badge */}
        <View style={styles.badge}>
          <Ionicons name="shield-checkmark-outline" size={14} color="#10B981" />
          <Text style={styles.badgeText}>Clé publique E2E incluse</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 14,
  },
  backBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 18, fontWeight: '700', color: C.text },
  content: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 },
  qrCard: {
    backgroundColor: C.surface, borderRadius: 24, padding: 28,
    alignItems: 'center', borderWidth: 1, borderColor: C.border,
    marginBottom: 24, width: '100%', position: 'relative',
  },
  corner: {
    position: 'absolute', width: 20, height: 20,
    borderColor: C.accent, borderWidth: 2,
  },
  tl: { top: 12, left: 12, borderBottomWidth: 0, borderRightWidth: 0, borderTopLeftRadius: 6 },
  tr: { top: 12, right: 12, borderBottomWidth: 0, borderLeftWidth: 0, borderTopRightRadius: 6 },
  bl: { bottom: 12, left: 12, borderTopWidth: 0, borderRightWidth: 0, borderBottomLeftRadius: 6 },
  br: { bottom: 12, right: 12, borderTopWidth: 0, borderLeftWidth: 0, borderBottomRightRadius: 6 },
  qrBox: {
    padding: 16, backgroundColor: '#fff', borderRadius: 16, marginBottom: 20,
  },
  qrLoading: {
    width: 200, height: 200, alignItems: 'center', justifyContent: 'center', gap: 12,
  },
  qrLoadingText: { fontSize: 13, color: C.muted },
  userRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  userAvatar: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: C.accentDim, alignItems: 'center', justifyContent: 'center',
  },
  userAvatarText: { fontSize: 16, fontWeight: '800', color: C.accent },
  username: { fontSize: 18, fontWeight: '700', color: C.text },
  instructions: {
    fontSize: 13, color: C.muted, textAlign: 'center',
    marginBottom: 28, lineHeight: 19,
  },
  actions: { flexDirection: 'row', gap: 12, marginBottom: 24 },
  btnPrimary: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: C.accent, paddingVertical: 13, paddingHorizontal: 22,
    borderRadius: 12,
    shadowColor: C.accent, shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4, shadowRadius: 8, elevation: 6,
  },
  btnPrimaryText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  btnSecondary: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: C.accentDim, paddingVertical: 13, paddingHorizontal: 22,
    borderRadius: 12, borderWidth: 1, borderColor: C.accent + '50',
  },
  btnSecondaryText: { color: C.accent, fontWeight: '700', fontSize: 14 },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  badgeText: { fontSize: 12, color: '#10B981' },
});
