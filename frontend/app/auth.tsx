import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  Alert,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../src/context/AuthContext';

export default function AuthScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { login, register } = useAuth();
  
  const [isLogin, setIsLogin] = useState(true);
  const [username, setUsername] = useState('');
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPin, setShowPin] = useState(false);

  const handleAuth = async () => {
    if (!username.trim()) {
      Alert.alert('Erreur', 'Entrez un nom d\'utilisateur');
      return;
    }

    if (pin.length < 4) {
      Alert.alert('Erreur', 'Le PIN doit contenir au moins 4 caractères');
      return;
    }

    if (!isLogin && pin !== confirmPin) {
      Alert.alert('Erreur', 'Les PINs ne correspondent pas');
      return;
    }

    setLoading(true);
    
    try {
      let success: boolean;
      
      if (isLogin) {
        success = await login(username.trim(), pin);
      } else {
        success = await register(username.trim(), pin);
      }

      if (success) {
        router.replace('/chat');
      } else {
        Alert.alert(
          'Erreur',
          isLogin ? 'Identifiants incorrects' : 'Nom d\'utilisateur déjà pris'
        );
      }
    } catch (error) {
      Alert.alert('Erreur', 'Une erreur est survenue');
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={[styles.container, { paddingTop: insets.top }]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.header}>
          <View style={styles.iconContainer}>
            <Ionicons name="shield-checkmark" size={48} color="#6366f1" />
          </View>
          <Text style={styles.title}>GhostChat</Text>
          <Text style={styles.subtitle}>Messagerie 100% privée</Text>
        </View>

        <View style={styles.form}>
          <View style={styles.inputContainer}>
            <Ionicons name="person-outline" size={20} color="#666" style={styles.inputIcon} />
            <TextInput
              style={styles.input}
              placeholder="Nom d'utilisateur"
              placeholderTextColor="#666"
              value={username}
              onChangeText={setUsername}
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>

          <View style={styles.inputContainer}>
            <Ionicons name="lock-closed-outline" size={20} color="#666" style={styles.inputIcon} />
            <TextInput
              style={styles.input}
              placeholder="PIN (min. 4 caractères)"
              placeholderTextColor="#666"
              value={pin}
              onChangeText={setPin}
              secureTextEntry={!showPin}
              keyboardType="numeric"
            />
            <TouchableOpacity onPress={() => setShowPin(!showPin)}>
              <Ionicons
                name={showPin ? 'eye-off-outline' : 'eye-outline'}
                size={20}
                color="#666"
              />
            </TouchableOpacity>
          </View>

          {!isLogin && (
            <View style={styles.inputContainer}>
              <Ionicons name="lock-closed-outline" size={20} color="#666" style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                placeholder="Confirmer le PIN"
                placeholderTextColor="#666"
                value={confirmPin}
                onChangeText={setConfirmPin}
                secureTextEntry={!showPin}
                keyboardType="numeric"
              />
            </View>
          )}

          <TouchableOpacity
            style={[styles.button, loading && styles.buttonDisabled]}
            onPress={handleAuth}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.buttonText}>
                {isLogin ? 'Se connecter' : 'Créer un compte'}
              </Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.switchButton}
            onPress={() => {
              setIsLogin(!isLogin);
              setConfirmPin('');
            }}
          >
            <Text style={styles.switchText}>
              {isLogin ? 'Pas de compte ? Créer un compte' : 'Déjà un compte ? Se connecter'}
            </Text>
          </TouchableOpacity>
        </View>

        <View style={styles.features}>
          <View style={styles.featureItem}>
            <Ionicons name="eye-off" size={16} color="#6366f1" />
            <Text style={styles.featureText}>Anonymat total</Text>
          </View>
          <View style={styles.featureItem}>
            <Ionicons name="lock-closed" size={16} color="#6366f1" />
            <Text style={styles.featureText}>Chiffrement E2E</Text>
          </View>
          <View style={styles.featureItem}>
            <Ionicons name="timer" size={16} color="#6366f1" />
            <Text style={styles.featureText}>Messages éphémères</Text>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0a0a',
  },
  scrollContent: {
    flexGrow: 1,
    padding: 24,
    justifyContent: 'center',
  },
  header: {
    alignItems: 'center',
    marginBottom: 40,
  },
  iconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(99, 102, 241, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
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
  },
  form: {
    marginBottom: 32,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    paddingHorizontal: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#333',
  },
  inputIcon: {
    marginRight: 12,
  },
  input: {
    flex: 1,
    height: 52,
    color: '#fff',
    fontSize: 16,
  },
  button: {
    backgroundColor: '#6366f1',
    borderRadius: 12,
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  switchButton: {
    alignItems: 'center',
    marginTop: 20,
  },
  switchText: {
    color: '#6366f1',
    fontSize: 14,
  },
  features: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    flexWrap: 'wrap',
  },
  featureItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 4,
  },
  featureText: {
    color: '#888',
    fontSize: 12,
    marginLeft: 6,
  },
});
