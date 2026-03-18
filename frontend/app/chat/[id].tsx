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
  Image,
  ActivityIndicator,
  Modal,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useAuth } from '../../src/context/AuthContext';
import { encryptMessage, decryptMessage, EncryptedMessage } from '../../src/utils/encryption';

const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

interface Message {
  id: string;
  conversation_id: string;
  sender_id: string;
  encrypted_content: string;
  content_type: string;
  timestamp: string;
  is_read: boolean;
  decrypted?: string;
}

interface Participant {
  id: string;
  username: string;
  public_key: string;
}

export default function ChatScreen() {
  const { id: conversationId } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user, token, getKeyPair } = useAuth();
  const flatListRef = useRef<FlatList>(null);

  const [messages, setMessages] = useState<Message[]>([]);
  const [participant, setParticipant] = useState<Participant | null>(null);
  const [inputText, setInputText] = useState('');
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [viewingImage, setViewingImage] = useState<string | null>(null);

  useEffect(() => {
    loadParticipant();
    loadMessages();
    
    // Poll for new messages every 3 seconds
    const interval = setInterval(loadMessages, 3000);
    return () => clearInterval(interval);
  }, [conversationId]);

  const loadParticipant = async () => {
    try {
      const response = await fetch(
        `${API_URL}/api/conversations/${conversationId}/participant`,
        { headers: { Authorization: `Bearer ${token}` } }
      );

      if (response.ok) {
        const data = await response.json();
        setParticipant(data);
      }
    } catch (error) {
      console.error('Error loading participant:', error);
    }
  };

  const loadMessages = async () => {
    try {
      const response = await fetch(
        `${API_URL}/api/messages/${conversationId}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );

      if (response.ok) {
        const data = await response.json();
        
        // Decrypt messages
        const keyPair = getKeyPair();
        if (keyPair && participant) {
          const decryptedMessages = data.map((msg: Message) => {
            try {
              const encrypted: EncryptedMessage = JSON.parse(msg.encrypted_content);
              const senderKey = msg.sender_id === user?.id ? keyPair.publicKey : participant.public_key;
              const decrypted = decryptMessage(encrypted, senderKey, keyPair.secretKey);
              return { ...msg, decrypted: decrypted || '[Message illisible]' };
            } catch (e) {
              return { ...msg, decrypted: '[Message illisible]' };
            }
          });
          setMessages(decryptedMessages);
        } else {
          setMessages(data);
        }
      }
    } catch (error) {
      console.error('Error loading messages:', error);
    } finally {
      setLoading(false);
    }
  };

  const sendMessage = async (content: string, type: string = 'text') => {
    if (!content.trim() || !participant) return;

    setSending(true);
    try {
      const keyPair = getKeyPair();
      if (!keyPair) {
        Alert.alert('Erreur', 'Clés de chiffrement non disponibles');
        return;
      }

      // Encrypt the message
      const encrypted = encryptMessage(content, participant.public_key, keyPair.secretKey);

      const response = await fetch(`${API_URL}/api/messages`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          conversation_id: conversationId,
          encrypted_content: JSON.stringify(encrypted),
          content_type: type,
          recipient_id: participant.id,
        }),
      });

      if (response.ok) {
        setInputText('');
        await loadMessages();
        flatListRef.current?.scrollToEnd();
      } else {
        Alert.alert('Erreur', 'Impossible d\'envoyer le message');
      }
    } catch (error) {
      console.error('Send error:', error);
      Alert.alert('Erreur', 'Impossible d\'envoyer le message');
    } finally {
      setSending(false);
    }
  };

  const pickImage = async () => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission refusée', 'Accès à la galerie requis');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        base64: true,
        quality: 0.5,
      });

      if (!result.canceled && result.assets[0].base64) {
        const base64Image = `data:image/jpeg;base64,${result.assets[0].base64}`;
        await sendMessage(base64Image, 'image');
      }
    } catch (error) {
      console.error('Image pick error:', error);
      Alert.alert('Erreur', 'Impossible de sélectionner l\'image');
    }
  };

  const markAsRead = async (messageId: string) => {
    try {
      await fetch(`${API_URL}/api/messages/${messageId}/read`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      // Message will be deleted on server after reading
      await loadMessages();
    } catch (error) {
      console.error('Mark read error:', error);
    }
  };

  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  };

  const renderMessage = ({ item }: { item: Message }) => {
    const isOwn = item.sender_id === user?.id;
    const isImage = item.content_type === 'image';

    return (
      <TouchableOpacity
        style={[styles.messageContainer, isOwn && styles.messageContainerOwn]}
        onLongPress={() => {
          if (!isOwn && !item.is_read) {
            Alert.alert(
              'Message éphémère',
              'Ce message sera supprimé après lecture.',
              [
                { text: 'Annuler', style: 'cancel' },
                { text: 'Marquer comme lu', onPress: () => markAsRead(item.id) },
              ]
            );
          }
        }}
        activeOpacity={0.8}
      >
        <View style={[styles.messageBubble, isOwn ? styles.bubbleOwn : styles.bubbleOther]}>
          {isImage ? (
            <TouchableOpacity onPress={() => setViewingImage(item.decrypted || null)}>
              <Image
                source={{ uri: item.decrypted }}
                style={styles.messageImage}
                resizeMode="cover"
              />
              <View style={styles.imageOverlay}>
                <Ionicons name="eye" size={16} color="#fff" />
                <Text style={styles.imageOverlayText}>Appuyer pour voir</Text>
              </View>
            </TouchableOpacity>
          ) : (
            <Text style={[styles.messageText, isOwn && styles.messageTextOwn]}>
              {item.decrypted || '[Chiffré]'}
            </Text>
          )}
          <View style={styles.messageFooter}>
            <Text style={[styles.messageTime, isOwn && styles.messageTimeOwn]}>
              {formatTime(item.timestamp)}
            </Text>
            {isOwn && (
              <Ionicons
                name={item.is_read ? 'checkmark-done' : 'checkmark'}
                size={14}
                color={item.is_read ? '#6366f1' : '#666'}
                style={styles.readIcon}
              />
            )}
          </View>
        </View>
        {!isOwn && !item.is_read && (
          <View style={styles.ephemeralBadge}>
            <Ionicons name="timer" size={10} color="#f59e0b" />
          </View>
        )}
      </TouchableOpacity>
    );
  };

  return (
    <KeyboardAvoidingView
      style={[styles.container, { paddingTop: insets.top }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
    >
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => router.back()}
        >
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <View style={styles.headerInfo}>
          <View style={styles.headerAvatar}>
            <Ionicons name="person" size={20} color="#6366f1" />
          </View>
          <View>
            <Text style={styles.headerName}>
              @{participant?.username || 'Chargement...'}
            </Text>
            <View style={styles.secureIndicator}>
              <Ionicons name="lock-closed" size={10} color="#22c55e" />
              <Text style={styles.secureText}>Chiffré E2E</Text>
            </View>
          </View>
        </View>
      </View>

      {/* Messages */}
      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#6366f1" />
        </View>
      ) : (
        <FlatList
          ref={flatListRef}
          data={messages}
          keyExtractor={(item) => item.id}
          renderItem={renderMessage}
          contentContainerStyle={styles.messagesList}
          onContentSizeChange={() => flatListRef.current?.scrollToEnd()}
          ListEmptyComponent={
            <View style={styles.emptyMessages}>
              <Ionicons name="chatbubble-outline" size={48} color="#333" />
              <Text style={styles.emptyText}>Aucun message</Text>
              <Text style={styles.emptySubtext}>Les messages sont chiffrés de bout en bout</Text>
            </View>
          }
        />
      )}

      {/* Input */}
      <View style={[styles.inputContainer, { paddingBottom: insets.bottom + 8 }]}>
        <TouchableOpacity style={styles.attachButton} onPress={pickImage}>
          <Ionicons name="image" size={24} color="#6366f1" />
        </TouchableOpacity>
        <View style={styles.inputWrapper}>
          <TextInput
            style={styles.input}
            placeholder="Message..."
            placeholderTextColor="#666"
            value={inputText}
            onChangeText={setInputText}
            multiline
            maxLength={5000}
          />
        </View>
        <TouchableOpacity
          style={[styles.sendButton, (!inputText.trim() || sending) && styles.sendButtonDisabled]}
          onPress={() => sendMessage(inputText)}
          disabled={!inputText.trim() || sending}
        >
          {sending ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Ionicons name="send" size={20} color="#fff" />
          )}
        </TouchableOpacity>
      </View>

      {/* Image Viewer Modal */}
      <Modal visible={!!viewingImage} animationType="fade" transparent>
        <View style={styles.imageViewerOverlay}>
          <TouchableOpacity
            style={styles.closeImageButton}
            onPress={() => setViewingImage(null)}
          >
            <Ionicons name="close" size={32} color="#fff" />
          </TouchableOpacity>
          {viewingImage && (
            <Image
              source={{ uri: viewingImage }}
              style={styles.fullImage}
              resizeMode="contain"
            />
          )}
          <Text style={styles.imageWarning}>
            Cette image sera supprimée après fermeture
          </Text>
        </View>
      </Modal>
    </KeyboardAvoidingView>
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
  headerInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  headerAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(99, 102, 241, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  headerName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  secureIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
  },
  secureText: {
    fontSize: 11,
    color: '#22c55e',
    marginLeft: 4,
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  messagesList: {
    padding: 16,
    flexGrow: 1,
  },
  messageContainer: {
    marginBottom: 8,
    flexDirection: 'row',
    alignItems: 'flex-end',
  },
  messageContainerOwn: {
    justifyContent: 'flex-end',
  },
  messageBubble: {
    maxWidth: '75%',
    borderRadius: 16,
    padding: 12,
  },
  bubbleOwn: {
    backgroundColor: '#6366f1',
    borderBottomRightRadius: 4,
  },
  bubbleOther: {
    backgroundColor: '#1a1a1a',
    borderBottomLeftRadius: 4,
  },
  messageText: {
    fontSize: 15,
    color: '#fff',
    lineHeight: 20,
  },
  messageTextOwn: {
    color: '#fff',
  },
  messageImage: {
    width: 200,
    height: 200,
    borderRadius: 12,
  },
  imageOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(0,0,0,0.6)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 8,
    borderBottomLeftRadius: 12,
    borderBottomRightRadius: 12,
  },
  imageOverlayText: {
    color: '#fff',
    fontSize: 12,
    marginLeft: 4,
  },
  messageFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
  messageTime: {
    fontSize: 11,
    color: '#888',
  },
  messageTimeOwn: {
    color: 'rgba(255,255,255,0.7)',
  },
  readIcon: {
    marginLeft: 4,
  },
  ephemeralBadge: {
    marginLeft: 4,
    marginBottom: 4,
  },
  emptyMessages: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 100,
  },
  emptyText: {
    fontSize: 16,
    color: '#666',
    marginTop: 12,
  },
  emptySubtext: {
    fontSize: 12,
    color: '#444',
    marginTop: 4,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#1a1a1a',
  },
  attachButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  inputWrapper: {
    flex: 1,
    backgroundColor: '#1a1a1a',
    borderRadius: 20,
    paddingHorizontal: 16,
    marginHorizontal: 8,
    maxHeight: 120,
  },
  input: {
    color: '#fff',
    fontSize: 16,
    paddingVertical: 10,
    maxHeight: 100,
  },
  sendButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#6366f1',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendButtonDisabled: {
    opacity: 0.5,
  },
  imageViewerOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.95)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeImageButton: {
    position: 'absolute',
    top: 60,
    right: 20,
    zIndex: 10,
  },
  fullImage: {
    width: '90%',
    height: '70%',
  },
  imageWarning: {
    color: '#f59e0b',
    fontSize: 12,
    marginTop: 20,
  },
});
