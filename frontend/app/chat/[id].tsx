/**
 * ChatScreen — real-time ephemeral encrypted messaging.
 *
 * Architecture:
 *  - WebSocket at /ws/{conversationId}?token=... for real-time delivery.
 *  - E2E encryption via TweetNaCl box (src/utils/encryption.ts).
 *    Plaintext never leaves the device; the server relays the encrypted
 *    blob exactly as received.
 *  - Messages are stored in component state only. Navigating away
 *    (closing the WebSocket) destroys the local message list — no history.
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../src/context/AuthContext';
import { encryptMessage, decryptMessage, EncryptedMessage } from '../../src/utils/encryption';

// ── Design tokens (matching existing app theme) ──────────────────────────────
const C = {
  bg: '#080810',
  surface: '#0f0f1a',
  border: '#1e1e35',
  accent: '#7C3AED',
  accentDim: 'rgba(124,58,237,0.12)',
  text: '#E8E8F0',
  muted: '#555570',
  own: '#7C3AED',
  other: '#151525',
  green: '#22c55e',
};

const BACKEND_URL =
  process.env.EXPO_PUBLIC_BACKEND_URL || 'https://ghost-messenger.onrender.com';
const API_URL = BACKEND_URL;
// Derive WebSocket URL from HTTP URL
const WS_BASE = BACKEND_URL.replace(/^https:\/\//, 'wss://').replace(/^http:\/\//, 'ws://');

// ── Types ─────────────────────────────────────────────────────────────────────

interface Participant {
  id: string;
  username: string;
  public_key: string;
}

interface ChatMessage {
  id: string;
  sender_id: string;
  plaintext: string;
  timestamp: string;
  isOwn: boolean;
}

// ── Wire-format sent over WebSocket ──────────────────────────────────────────
interface WireMessage {
  id: string;
  sender_id?: string;          // server stamps this from the verified session
  sender_public_key: string;   // needed by recipient for NaCl box.open()
  encrypted: EncryptedMessage; // { nonce, ciphertext } — server never opens this
  timestamp?: string;
  server_ts?: string;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function ChatScreen() {
  const { id: conversationId } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user, token, getKeyPair } = useAuth();
  const flatListRef = useRef<FlatList>(null);

  // WebSocket ref — kept outside state so closure captures are stable
  const wsRef = useRef<WebSocket | null>(null);
  // Keep a ref to participant so the WS onmessage handler always has latest value
  const participantRef = useRef<Participant | null>(null);

  const [participant, setParticipant] = useState<Participant | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [loading, setLoading] = useState(true);
  const [connected, setConnected] = useState(false);
  const [sending, setSending] = useState(false);

  // ── Lifecycle ──────────────────────────────────────────────────────────────

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const p = await loadParticipant();
      if (cancelled || !p) return;
      setLoading(false);
      openWebSocket(p);
    })();

    return () => {
      cancelled = true;
      // Close the WebSocket — this destroys the session and wipes the room
      // on the server when the last client leaves.
      wsRef.current?.close(1000, 'navigate-away');
      wsRef.current = null;
      // Wipe local message history — ephemeral by design
      setMessages([]);
    };
  }, [conversationId]);

  // ── Participant ────────────────────────────────────────────────────────────

  const loadParticipant = async (): Promise<Participant | null> => {
    try {
      const res = await fetch(`${API_URL}/api/conversations/${conversationId}/participant`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return null;
      const data: Participant = await res.json();
      setParticipant(data);
      participantRef.current = data;
      return data;
    } catch (e) {
      console.error('loadParticipant:', e);
      return null;
    }
  };

  // ── WebSocket ──────────────────────────────────────────────────────────────

  const openWebSocket = useCallback(
    (p: Participant) => {
      if (wsRef.current) {
        wsRef.current.close();
      }

      const url = `${WS_BASE}/ws/${conversationId}?token=${encodeURIComponent(token ?? '')}`;
      const ws = new WebSocket(url);

      ws.onopen = () => setConnected(true);

      ws.onmessage = (event: WebSocketMessageEvent) => {
        try {
          const wire: WireMessage = JSON.parse(event.data);
          const keyPair = getKeyPair();
          const currentParticipant = participantRef.current;

          if (!keyPair || !currentParticipant) return;

          // ── PHASE 3: decrypt with NaCl box ──────────────────────────────
          // The sender encrypted with: recipientPublicKey = my public key
          //                            senderSecretKey   = their secret key
          // We decrypt with:           senderPublicKey   = their public key
          //                            recipientSecretKey = my secret key
          const senderPublicKey =
            wire.sender_public_key || currentParticipant.public_key;

          const plaintext = decryptMessage(
            wire.encrypted,
            senderPublicKey,
            keyPair.secretKey,
          );

          if (!plaintext) return; // wrong key or tampered — discard silently

          const msg: ChatMessage = {
            id: wire.id,
            sender_id: wire.sender_id ?? '',
            plaintext,
            timestamp: wire.server_ts ?? wire.timestamp ?? new Date().toISOString(),
            isOwn: wire.sender_id === user?.id,
          };

          setMessages((prev) => [...prev, msg]);
          setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 80);
        } catch (err) {
          console.error('ws.onmessage:', err);
        }
      };

      ws.onclose = () => setConnected(false);

      ws.onerror = (e) => {
        console.error('WebSocket error:', e);
        setConnected(false);
      };

      wsRef.current = ws;
    },
    [conversationId, token, user?.id, getKeyPair],
  );

  // ── Send ───────────────────────────────────────────────────────────────────

  const sendMessage = useCallback(async () => {
    const content = inputText.trim();
    if (!content || !participant || sending) return;

    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      Alert.alert('Déconnecté', 'La connexion est perdue. Revenez et réessayez.');
      return;
    }

    setSending(true);
    try {
      const keyPair = getKeyPair();
      if (!keyPair) {
        Alert.alert('Erreur', 'Clés de chiffrement non disponibles');
        return;
      }

      // ── PHASE 3: encrypt before sending ──────────────────────────────────
      // Encrypt with: recipientPublicKey = participant's public key
      //               senderSecretKey   = my secret key
      // Server receives only the ciphertext — plaintext stays on device.
      const encrypted = encryptMessage(content, participant.public_key, keyPair.secretKey);

      const msgId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const wire: WireMessage = {
        id: msgId,
        sender_public_key: keyPair.publicKey,
        encrypted,
        timestamp: new Date().toISOString(),
      };

      ws.send(JSON.stringify(wire));

      // Add own message to local state immediately — server does NOT echo back
      const ownMsg: ChatMessage = {
        id: msgId,
        sender_id: user?.id ?? '',
        plaintext: content,
        timestamp: wire.timestamp!,
        isOwn: true,
      };
      setMessages((prev) => [...prev, ownMsg]);
      setInputText('');
      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 80);
    } catch (err) {
      Alert.alert('Erreur', "Impossible d'envoyer le message");
    } finally {
      setSending(false);
    }
  }, [inputText, participant, sending, getKeyPair, user?.id]);

  // ── Helpers ────────────────────────────────────────────────────────────────

  const formatTime = (ts: string) => {
    const d = new Date(ts);
    return d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  const renderMessage = ({ item }: { item: ChatMessage }) => (
    <View style={[styles.msgRow, item.isOwn && styles.msgRowOwn]}>
      <View style={[styles.bubble, item.isOwn ? styles.bubbleOwn : styles.bubbleOther]}>
        <Text style={styles.msgText}>{item.plaintext}</Text>
        <Text style={[styles.msgTime, item.isOwn && styles.msgTimeOwn]}>
          {formatTime(item.timestamp)}
        </Text>
      </View>
    </View>
  );

  if (loading) {
    return (
      <View style={[styles.container, styles.center]}>
        <ActivityIndicator color={C.accent} size="large" />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={[styles.container, { paddingTop: insets.top }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {/* ── Header ── */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => {
            wsRef.current?.close(1000, 'navigate-away');
            router.back();
          }}
        >
          <Ionicons name="arrow-back" size={24} color={C.text} />
        </TouchableOpacity>

        <View style={styles.headerInfo}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>
              {(participant?.username?.[0] ?? '?').toUpperCase()}
            </Text>
          </View>
          <View>
            <Text style={styles.headerName}>@{participant?.username ?? '…'}</Text>
            <View style={styles.statusRow}>
              <View style={[styles.statusDot, { backgroundColor: connected ? C.green : C.muted }]} />
              <Ionicons name="lock-closed" size={10} color={C.green} style={{ marginLeft: 6 }} />
              <Text style={styles.statusText}>
                {connected ? ' Chiffré E2E · En ligne' : ' Reconnexion…'}
              </Text>
            </View>
          </View>
        </View>
      </View>

      {/* ── Messages ── */}
      <FlatList
        ref={flatListRef}
        data={messages}
        keyExtractor={(item) => item.id}
        renderItem={renderMessage}
        contentContainerStyle={styles.msgList}
        ListEmptyComponent={
          <View style={styles.emptyWrap}>
            <View style={styles.emptyIconWrap}>
              <Ionicons name="lock-closed-outline" size={32} color={C.muted} />
            </View>
            <Text style={styles.emptyTitle}>Chiffré de bout en bout</Text>
            <Text style={styles.emptyBody}>
              Les messages ne sont pas sauvegardés.{'\n'}Ils disparaissent dès que vous partez.
            </Text>
          </View>
        }
      />

      {/* ── Input ── */}
      <View style={[styles.inputRow, { paddingBottom: insets.bottom + 8 }]}>
        <View style={styles.inputWrap}>
          <TextInput
            style={styles.input}
            placeholder="Message…"
            placeholderTextColor={C.muted}
            value={inputText}
            onChangeText={setInputText}
            onSubmitEditing={sendMessage}
            multiline
            maxLength={5000}
            returnKeyType="send"
          />
        </View>
        <TouchableOpacity
          style={[
            styles.sendBtn,
            (!inputText.trim() || sending || !connected) && styles.sendBtnDisabled,
          ]}
          onPress={sendMessage}
          disabled={!inputText.trim() || sending || !connected}
          activeOpacity={0.7}
        >
          {sending ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Ionicons name="send" size={18} color="#fff" />
          )}
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  center: { alignItems: 'center', justifyContent: 'center' },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
    backgroundColor: C.surface,
  },
  backBtn: {
    width: 44, height: 44,
    alignItems: 'center', justifyContent: 'center',
  },
  headerInfo: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  avatar: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: C.accentDim,
    borderWidth: 1, borderColor: C.accent + '50',
    alignItems: 'center', justifyContent: 'center',
    marginRight: 12,
  },
  avatarText: { color: C.accent, fontSize: 16, fontWeight: '700' },
  headerName: { fontSize: 15, fontWeight: '600', color: C.text },
  statusRow: { flexDirection: 'row', alignItems: 'center', marginTop: 2 },
  statusDot: { width: 7, height: 7, borderRadius: 4 },
  statusText: { fontSize: 11, color: C.green, marginLeft: 2 },

  // Messages
  msgList: { padding: 16, flexGrow: 1 },
  msgRow: {
    marginBottom: 8,
    flexDirection: 'row',
    alignItems: 'flex-end',
  },
  msgRowOwn: { justifyContent: 'flex-end' },
  bubble: {
    maxWidth: '78%',
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  bubbleOwn: {
    backgroundColor: C.own,
    borderBottomRightRadius: 4,
  },
  bubbleOther: {
    backgroundColor: C.other,
    borderWidth: 1,
    borderColor: C.border,
    borderBottomLeftRadius: 4,
  },
  msgText: { fontSize: 15, color: C.text, lineHeight: 21 },
  msgTime: { fontSize: 11, color: 'rgba(255,255,255,0.5)', marginTop: 4, textAlign: 'right' },
  msgTimeOwn: { color: 'rgba(255,255,255,0.6)' },

  // Empty state
  emptyWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 80 },
  emptyIconWrap: {
    width: 72, height: 72, borderRadius: 36,
    backgroundColor: C.surface,
    borderWidth: 1, borderColor: C.border,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 16,
  },
  emptyTitle: { fontSize: 16, fontWeight: '600', color: C.text, marginBottom: 8 },
  emptyBody: { fontSize: 13, color: C.muted, textAlign: 'center', lineHeight: 20 },

  // Input
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: C.border,
    backgroundColor: C.surface,
  },
  inputWrap: {
    flex: 1,
    backgroundColor: C.bg,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: C.border,
    paddingHorizontal: 16,
    marginRight: 8,
    maxHeight: 120,
  },
  input: {
    color: C.text,
    fontSize: 15,
    paddingVertical: 10,
    maxHeight: 100,
  },
  sendBtn: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: C.accent,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: C.accent,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.5,
    shadowRadius: 6,
    elevation: 4,
  },
  sendBtnDisabled: { opacity: 0.35 },
});
