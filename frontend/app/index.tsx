import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  FlatList, ActivityIndicator, Alert, Animated,
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../src/context/AuthContext';

const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL || 'https://ghost-messenger.onrender.com';

const C = {
  bg: '#080810',
  surface: '#0f0f1a',
  border: '#1e1e35',
  accent: '#7C3AED',
  accentDim: 'rgba(124,58,237,0.12)',
  text: '#E8E8F0',
  muted: '#555570',
  danger: '#DC2626',
};

interface Conversation {
  id: string;
  participants: string[];
  created_at: string;
  last_activity: string;
  otherUsername?: string;
}

export default function ChatListScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user, token, logout, panic } = useAuth();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const fadeAnim = React.useRef(new Animated.Value(0)).current;

  const loadConversations = useCallback(async () => {
    if (!token) return;
    try {
      const res = await fetch(`${API_URL}/api/conversations`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error();
      const data: Conversation[] = await res.json();

      const enriched = await Promise.all(
        data.map(async (conv) => {
          try {
            const pRes = await fetch(`${API_URL}/api/conversations/${conv.id}/participant`, {
              headers: { Authorization: `Bearer ${token}` },
            });
            if (pRes.ok) {
              const p = await pRes.json();
              return { ...conv, otherUsername: p.username };
            }
          } catch {}
          return conv;
        })
      );
      setConversations(enriched);
      Animated.timing(fadeAnim, { toValue: 1, duration: 400, useNativeDriver: true }).start();
    } catch {
      Alert.alert('Erreur', 'Impossible de charger les conversations');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useFocusEffect(useCallback(() => {
    fadeAnim.setValue(0);
    loadConversations();
  }, [loadConversations]));

  const handleMenu = () => {
    Alert.alert('Menu', undefined, [
      { text: '⚙️  Paramètres', onPress: () => router.push('/settings') },
      { text: '🚨  Mode Panique', style: 'destructive', onPress: confirmPanic },
      { text: '🚪  Se déconnecter', onPress: confirmLogout },
      { text: 'Annuler', style: 'cancel' },
    ]);
  };

  const confirmPanic = () => {
    Alert.alert('🚨 Mode Panique', 'Efface TOUT — compte, messages, clés. Irréversible.', [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'EFFACER TOUT', style: 'destructive',
        onPress: async () => { await panic(); router.replace('/'); },
      },
    ]);
  };

  const confirmLogout = () => {
    Alert.alert('Se déconnecter ?', undefined, [
      { text: 'Annuler', style: 'cancel' },
      { text: 'Déconnecter', onPress: async () => { await logout(); router.replace('/'); } },
    ]);
  };

  const formatTime = (dateStr: string) => {
    const d = new Date(dateStr);
    const now = new Date();
    const diff = now.getTime() - d.getTime();
    if (diff < 60000) return 'maintenant';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m`;
    if (diff < 86400000) return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
    return `${d.getDate()}/${d.getMonth()+1}`;
  };

  const avatarColor = (name: string) => {
    const colors = ['#7C3AED','#2563EB','#059669','#D97706','#DC2626','#7C3AED'];
    return colors[name.charCodeAt(0) % colors.length];
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Messages</Text>
          <Text style={styles.username}>@{user?.username}</Text>
        </View>
        <View style={styles.headerRight}>
          <TouchableOpacity style={styles.iconBtn} onPress={() => router.push('/my-qr')}>
            <Ionicons name="qr-code-outline" size={20} color={C.accent} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.iconBtn} onPress={() => router.push('/scan-qr')}>
            <Ionicons name="scan-outline" size={20} color={C.accent} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.iconBtn} onPress={handleMenu}>
            <Ionicons name="ellipsis-vertical" size={20} color={C.muted} />
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.divider} />

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={C.accent} />
        </View>
      ) : conversations.length === 0 ? (
        <Animated.View style={[styles.empty, { opacity: fadeAnim }]}>
          <View style={styles.emptyIcon}>
            <Ionicons name="chatbubbles-outline" size={40} color={C.muted} />
          </View>
          <Text style={styles.emptyTitle}>Aucune conversation</Text>
          <Text style={styles.emptyText}>Scannez le QR d'un contact pour commencer</Text>
          <View style={styles.emptyBtns}>
            <TouchableOpacity style={styles.emptyBtnPrimary} onPress={() => router.push('/scan-qr')}>
              <Ionicons name="scan-outline" size={18} color="#fff" />
              <Text style={styles.emptyBtnPrimaryText}>Scanner un QR</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.emptyBtnSecondary} onPress={() => router.push('/my-qr')}>
              <Ionicons name="qr-code-outline" size={18} color={C.accent} />
              <Text style={styles.emptyBtnSecondaryText}>Mon QR Code</Text>
            </TouchableOpacity>
          </View>
        </Animated.View>
      ) : (
        <Animated.FlatList
          style={{ opacity: fadeAnim }}
          data={conversations}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => {
            const name = item.otherUsername || '?';
            const color = avatarColor(name);
            return (
              <TouchableOpacity
                style={styles.convRow}
                onPress={() => router.push(`/chat/${item.id}`)}
                activeOpacity={0.7}
              >
                <View style={[styles.avatar, { backgroundColor: color + '22' }]}>
                  <Text style={[styles.avatarText, { color }]}>
                    {name[0].toUpperCase()}
                  </Text>
                </View>
                <View style={styles.convInfo}>
                  <Text style={styles.convName}>@{name}</Text>
                  <Text style={styles.convSub}>Chiffré E2E</Text>
                </View>
                <Text style={styles.convTime}>{formatTime(item.last_activity)}</Text>
              </TouchableOpacity>
            );
          }}
          ItemSeparatorComponent={() => <View style={styles.sep} />}
          onRefresh={loadConversations}
          refreshing={loading}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingVertical: 16,
  },
  title: { fontSize: 28, fontWeight: '800', color: C.text, letterSpacing: -0.8 },
  username: { fontSize: 13, color: C.muted, marginTop: 2 },
  headerRight: { flexDirection: 'row', gap: 8 },
  iconBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: C.surface, borderWidth: 1, borderColor: C.border,
    alignItems: 'center', justifyContent: 'center',
  },
  divider: { height: 1, backgroundColor: C.border, marginHorizontal: 20 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40 },
  emptyIcon: {
    width: 80, height: 80, borderRadius: 40,
    backgroundColor: C.surface, borderWidth: 1, borderColor: C.border,
    alignItems: 'center', justifyContent: 'center', marginBottom: 20,
  },
  emptyTitle: { fontSize: 20, fontWeight: '700', color: C.text, marginBottom: 8 },
  emptyText: { fontSize: 14, color: C.muted, textAlign: 'center', marginBottom: 32, lineHeight: 20 },
  emptyBtns: { flexDirection: 'row', gap: 12 },
  emptyBtnPrimary: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: C.accent, paddingVertical: 13, paddingHorizontal: 20,
    borderRadius: 12,
    shadowColor: C.accent, shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4, shadowRadius: 8, elevation: 6,
  },
  emptyBtnPrimaryText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  emptyBtnSecondary: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: C.accentDim, paddingVertical: 13, paddingHorizontal: 20,
    borderRadius: 12, borderWidth: 1, borderColor: C.accent + '50',
  },
  emptyBtnSecondaryText: { color: C.accent, fontWeight: '700', fontSize: 14 },
  convRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 20, paddingVertical: 14,
  },
  avatar: {
    width: 48, height: 48, borderRadius: 24,
    alignItems: 'center', justifyContent: 'center', marginRight: 14,
  },
  avatarText: { fontSize: 20, fontWeight: '800' },
  convInfo: { flex: 1 },
  convName: { fontSize: 16, fontWeight: '600', color: C.text },
  convSub: { fontSize: 12, color: C.muted, marginTop: 3 },
  convTime: { fontSize: 12, color: C.muted },
  sep: { height: 1, backgroundColor: C.border, marginLeft: 82 },
});
