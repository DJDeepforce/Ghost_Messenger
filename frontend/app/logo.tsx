import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Image,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

export default function LogoScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [logo, setLogo] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchLogo();
  }, []);

  const fetchLogo = async () => {
    try {
      const response = await fetch(`${API_URL}/api/logo`);
      if (response.ok) {
        const data = await response.json();
        setLogo(data.logo);
      }
    } catch (error) {
      console.error('Error fetching logo:', error);
    } finally {
      setLoading(false);
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
        <Text style={styles.title}>Logo GhostChat</Text>
        <View style={styles.placeholder} />
      </View>

      <ScrollView 
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#6366f1" />
            <Text style={styles.loadingText}>Chargement du logo...</Text>
          </View>
        ) : logo ? (
          <>
            <View style={styles.logoContainer}>
              <Image
                source={{ uri: logo }}
                style={styles.logoImage}
                resizeMode="contain"
              />
            </View>
            
            <Text style={styles.description}>
              Logo généré par IA pour GhostChat
            </Text>
            
            <View style={styles.features}>
              <View style={styles.featureItem}>
                <Ionicons name="color-palette" size={20} color="#6366f1" />
                <Text style={styles.featureText}>Couleurs: Indigo & Violet</Text>
              </View>
              <View style={styles.featureItem}>
                <Ionicons name="shield" size={20} color="#6366f1" />
                <Text style={styles.featureText}>Thème: Sécurité & Confidentialité</Text>
              </View>
              <View style={styles.featureItem}>
                <Ionicons name="sparkles" size={20} color="#6366f1" />
                <Text style={styles.featureText}>Style: Moderne & Minimaliste</Text>
              </View>
            </View>
          </>
        ) : (
          <View style={styles.errorContainer}>
            <Ionicons name="alert-circle" size={48} color="#ef4444" />
            <Text style={styles.errorText}>Logo non disponible</Text>
          </View>
        )}

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
    flexGrow: 1,
    alignItems: 'center',
    padding: 24,
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 100,
  },
  loadingText: {
    color: '#888',
    marginTop: 16,
  },
  logoContainer: {
    backgroundColor: '#1a1a1a',
    borderRadius: 24,
    padding: 20,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: '#333',
  },
  logoImage: {
    width: 280,
    height: 280,
    borderRadius: 16,
  },
  description: {
    fontSize: 18,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 24,
    textAlign: 'center',
  },
  features: {
    width: '100%',
    gap: 12,
  },
  featureItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1a1a1a',
    padding: 16,
    borderRadius: 12,
    gap: 12,
  },
  featureText: {
    color: '#ccc',
    fontSize: 14,
  },
  errorContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 100,
  },
  errorText: {
    color: '#ef4444',
    marginTop: 16,
  },
});
