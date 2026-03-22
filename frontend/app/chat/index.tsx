import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
  Alert,
  TextInput,
  Modal,
  Animated,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../src/context/AuthContext';

const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL;
const LONG_PRESS_DURATION = 5000; // 5 seconds for panic

interface Conversation {
  id: string;
  participants: string[];
  last_activity: string;
  participant_name?: string;
}

interface User {
  id: string;
  username: string;
  public_key: string;
}

export default function ChatListScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user, token, logout, panic } = useAuth();
  
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [showNewChat, setShowNewChat] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<User[]>([]);
  const [searching, setSearching] = useState(false);
  const [showMenu, setShowMenu] = useState(false);

  // Long press for panic mode
  const pressProgress = useRef(new Animated.Value(0)).current;
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [isPressing, setIsPressing] = useState(false);

  const handlePressIn = () => {
    setIsPressing(true);
    pressProgress.setValue(0);
    
    Animated.timing(pressProgress, {
      toValue: 1,
      duration: LONG_PRESS_DURATION,
      useNativeDriver: false,
    }).start();

    longPressTimer.current = setTimeout(async () => {
      setIsPressing(false);
      pressProgress.setValue(0);
      
      Alert.alert(
        '🚨 RESET ACTIVÉ',
        'Toutes les données ont été supprimées.',
        [{ text: 'OK', onPress: () => router.replace('/auth') }]
      );
      
      await panic();
    }, LONG_PRESS_DURATION);
  };

  const handlePressOut = () => {
    setIsPressing(false);
    pressProgress.setValue(0);
    
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  };

  const progressWidth = pressProgress.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', '100%'],
  });

  useEffect(() => {
    loadConversations();
  }, []);

  const loadConversations = async () => {
    try {
      const response = await fetch(`${API_URL}/api/conversations`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (response.ok) {
        const data = await response.json();
        
        // Load participant names
        const conversationsWithNames = await Promise.all(
          data.map(async (conv: Conversation) => {
            try {
              const participantRes = await fetch(
                `${API_URL}/api/conversations/${conv.id}/participant`,
                { headers: { Authorization: `Bearer ${token}` } }
              );
              if (participantRes.ok) {
                const participant = await participantRes.json();
                return { ...conv, participant_name: participant.username };
              }
            } catch (e) {
              console.error('Error loading participant:', e);
            }
            return conv;
          })
        );
        
        setConversations(conversationsWithNames);
      }
    } catch (error) {
      console.error('Error loading conversations:', error);
    }
  };

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadConversations();
    setRefreshing(false);
  }, [token]);

  const searchUsers = async (query: string) => {
    if (query.length < 2) {
      setSearchResults([]);
      return;
    }

    setSearching(true);
    try {
      const response = await fetch(
        `${API_URL}/api/users/search?q=${encodeURIComponent(query)}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );

      if (response.ok) {
        const data = await response.json();
        setSearchResults(data);
      }
    } catch (error) {
      console.error('Search error:', error);
    } finally {
      setSearching(false);
    }
  };

  const startConversation = async (participantId: string) => {
    try {
      const response = await fetch(`${API_URL}/api/conversations`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ participant_id: participantId }),
      });

      if (response.ok) {
        const conv = await response.json();
        setShowNewChat(false);
        setSearchQuery('');
        setSearchResults([]);
        router.push(`/chat/${conv.id}`);
      }
    } catch (error) {
      console.error('Error creating conversation:', error);
      Alert.alert('Erreur', 'Impossible de créer la conversation');
    }
  };

  const handlePanic = () => {
    Alert.alert(
      'MODE PANIQUE',
      'Cette action va SUPPRIMER définitivement toutes vos données. Cette action est IRRÉVERSIBLE.',
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

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));

    if (days === 0) {
      return date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    } else if (days === 1) {
      return 'Hier';
    } else if (days < 7) {
      return date.toLocaleDateString('fr-FR', { weekday: 'short' });
    }
    return date.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' });
  };

  const renderConversation = ({ item }: { item: Conversation }) => (
    <TouchableOpacity
      style={styles.conversationItem}
      onPress={() => router.push(`/chat/${item.id}`)}
    >
      <View style={styles.avatar}>
        <Ionicons name="person" size={24} color="#6366f1" />
      </View>
      <View style={styles.conversationInfo}>
        <Text style={styles.conversationName}>
          {item.participant_name || 'Utilisateur'}
        </Text>
        <Text style={styles.conversationTime}>
          {formatDate(item.last_activity)}
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={20} color="#444" />
    </TouchableOpacity>
  );

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          onPressIn={handlePressIn}
          onPressOut={handlePressOut}
          activeOpacity={1}
        >
          <View style={styles.titleContainer}>
            <Text style={styles.title}>Messages</Text>
            <Text style={styles.username}>@{user?.username}</Text>
            {isPressing && (
              <View style={styles.progressContainer}>
                <Animated.View 
                  style={[styles.progressBar, { width: progressWidth }]} 
                />
              </View>
            )}
          </View>
        </TouchableOpacity>
        <View style={styles.headerButtons}>
          <TouchableOpacity
            style={styles.headerButton}
            onPress={() => router.push('/my-qr')}
          >
            <Ionicons name="qr-code" size={22} color="#6366f1" />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.headerButton}
            onPress={() => router.push('/scan-qr')}
          >
            <Ionicons name="scan" size={22} color="#6366f1" />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.headerButton}
            onPress={() => setShowMenu(true)}
          >
            <Ionicons name="ellipsis-vertical" size={24} color="#fff" />
          </TouchableOpacity>
        </View>
      </View>

      {/* Conversations List */}
      <FlatList
        data={conversations}
        keyExtractor={(item) => item.id}
        renderItem={renderConversation}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor="#6366f1"
          />
        }
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Ionicons name="chatbubbles-outline" size={64} color="#333" />
            <Text style={styles.emptyText}>Aucune conversation</Text>
            <Text style={styles.emptySubtext}>Scannez un QR code pour ajouter un contact</Text>
            
            <View style={styles.emptyActions}>
              <TouchableOpacity
                style={styles.emptyActionButton}
                onPress={() => router.push('/scan-qr')}
              >
                <Ionicons name="scan" size={22} color="#fff" />
                <Text style={styles.emptyActionText}>Scanner un QR</Text>
              </TouchableOpacity>
              
              <TouchableOpacity
                style={[styles.emptyActionButton, styles.emptyActionSecondary]}
                onPress={() => router.push('/my-qr')}
              >
                <Ionicons name="qr-code" size={22} color="#6366f1" />
                <Text style={[styles.emptyActionText, { color: '#6366f1' }]}>Mon QR Code</Text>
              </TouchableOpacity>
            </View>
          </View>
        }
      />

      {/* New Chat Modal */}
      <Modal visible={showNewChat} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { paddingTop: insets.top + 16 }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Nouvelle conversation</Text>
              <TouchableOpacity onPress={() => {
                setShowNewChat(false);
                setSearchQuery('');
                setSearchResults([]);
              }}>
                <Ionicons name="close" size={28} color="#fff" />
              </TouchableOpacity>
            </View>

            <View style={styles.searchContainer}>
              <Ionicons name="search" size={20} color="#666" />
              <TextInput
                style={styles.searchInput}
                placeholder="Rechercher un utilisateur"
                placeholderTextColor="#666"
                value={searchQuery}
                onChangeText={(text) => {
                  setSearchQuery(text);
                  searchUsers(text);
                }}
                autoFocus
              />
            </View>

            <FlatList
              data={searchResults}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.searchResult}
                  onPress={() => startConversation(item.id)}
                >
                  <View style={styles.avatar}>
                    <Ionicons name="person" size={20} color="#6366f1" />
                  </View>
                  <Text style={styles.searchResultName}>@{item.username}</Text>
                </TouchableOpacity>
              )}
              ListEmptyComponent={
                searchQuery.length >= 2 && !searching ? (
                  <Text style={styles.noResults}>Aucun utilisateur trouvé</Text>
                ) : null
              }
            />
          </View>
        </View>
      </Modal>

      {/* Menu Modal */}
      <Modal visible={showMenu} animationType="fade" transparent>
        <TouchableOpacity
          style={styles.menuOverlay}
          activeOpacity={1}
          onPress={() => setShowMenu(false)}
        >
          <View style={[styles.menuContent, { marginTop: insets.top + 60 }]}>
            <TouchableOpacity
              style={styles.menuItem}
              onPress={() => {
                setShowMenu(false);
                router.push('/settings');
              }}
            >
              <Ionicons name="settings-outline" size={22} color="#fff" />
              <Text style={styles.menuText}>Paramètres</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.menuItem}
              onPress={() => {
                setShowMenu(false);
                handleLogout();
              }}
            >
              <Ionicons name="log-out-outline" size={22} color="#fff" />
              <Text style={styles.menuText}>Déconnexion</Text>
            </TouchableOpacity>

            <View style={styles.menuDivider} />

            <TouchableOpacity
              style={[styles.menuItem, styles.menuItemDanger]}
              onPress={() => {
                setShowMenu(false);
                handlePanic();
              }}
            >
              <Ionicons name="warning" size={22} color="#ef4444" />
              <Text style={[styles.menuText, styles.menuTextDanger]}>MODE PANIQUE</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
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
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#1a1a1a',
  },
  titleContainer: {
    position: 'relative',
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#fff',
  },
  username: {
    fontSize: 14,
    color: '#666',
    marginTop: 2,
  },
  progressContainer: {
    position: 'absolute',
    bottom: -8,
    left: 0,
    right: 0,
    height: 3,
    backgroundColor: 'rgba(239, 68, 68, 0.3)',
    borderRadius: 2,
  },
  progressBar: {
    height: '100%',
    backgroundColor: '#ef4444',
    borderRadius: 2,
  },
  headerButtons: {
    flexDirection: 'row',
    gap: 8,
  },
  headerButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#1a1a1a',
    alignItems: 'center',
    justifyContent: 'center',
  },
  listContent: {
    flexGrow: 1,
  },
  conversationItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#1a1a1a',
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(99, 102, 241, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  conversationInfo: {
    flex: 1,
  },
  conversationName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  conversationTime: {
    fontSize: 12,
    color: '#666',
    marginTop: 4,
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 100,
  },
  emptyText: {
    fontSize: 18,
    color: '#666',
    marginTop: 16,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#444',
    marginTop: 4,
    marginBottom: 24,
  },
  emptyActions: {
    flexDirection: 'row',
    gap: 12,
  },
  emptyActionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#6366f1',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 12,
    gap: 8,
  },
  emptyActionSecondary: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: '#6366f1',
  },
  emptyActionText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.9)',
  },
  modalContent: {
    flex: 1,
    backgroundColor: '#0a0a0a',
    paddingHorizontal: 20,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  modalTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#fff',
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    paddingHorizontal: 16,
    marginBottom: 16,
  },
  searchInput: {
    flex: 1,
    height: 48,
    color: '#fff',
    fontSize: 16,
    marginLeft: 12,
  },
  searchResult: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 12,
    backgroundColor: '#1a1a1a',
    marginBottom: 8,
  },
  searchResultName: {
    fontSize: 16,
    color: '#fff',
  },
  noResults: {
    textAlign: 'center',
    color: '#666',
    marginTop: 20,
  },
  menuOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
  },
  menuContent: {
    backgroundColor: '#1a1a1a',
    marginHorizontal: 20,
    borderRadius: 16,
    padding: 8,
    position: 'absolute',
    right: 0,
    width: 220,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 8,
  },
  menuItemDanger: {
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
  },
  menuText: {
    fontSize: 16,
    color: '#fff',
    marginLeft: 12,
  },
  menuTextDanger: {
    color: '#ef4444',
  },
  menuDivider: {
    height: 1,
    backgroundColor: '#333',
    marginVertical: 8,
  },
});
