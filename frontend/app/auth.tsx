import React, { useState, useRef } from 'react';
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
  Animated,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../src/context/AuthContext';

const LONG_PRESS_DURATION = 5000; // 5 seconds for panic

export default function AuthScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { login, register, panic } = useAuth();
  
  const [isLogin, setIsLogin] = useState(true);
  const [username, setUsername] = useState('');
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [duressPin, setDuressPin] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPin, setShowPin] = useState(false);
  const [showDuressField, setShowDuressField] = useState(false);
  
  // Long press animation
  const pressProgress = useRef(new Animated.Value(0)).current;
  const longPressTimer = useRef<NodeJS.Timeout | null>(null);
  const [isPressing, setIsPressing] = useState(false);

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

    if (!isLogin && duressPin && duressPin === pin) {
      Alert.alert('Erreur', 'Le PIN de détresse doit être différent du PIN principal');
      return;
    }

    setLoading(true);
    
    try {
      let success: boolean;
      
      if (isLogin) {
        success = await login(username.trim(), pin);
      } else {
        success = await register(username.trim(), pin, duressPin || undefined);
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

  // Long press handlers for panic mode
  const handlePressIn = () => {
    setIsPressing(true);
    pressProgress.setValue(0);
    
    Animated.timing(pressProgress, {
      toValue: 1,
      duration: LONG_PRESS_DURATION,
      useNativeDriver: false,
    }).start();

    longPressTimer.current = setTimeout(async () => {
      // Trigger panic mode
      setIsPressing(false);
      pressProgress.setValue(0);
      
      Alert.alert(
        '🚨 RESET ACTIVÉ',
        'Toutes les données ont été supprimées.',
        [{ text: 'OK' }]
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
    
    Animated.timing(pressProgress, {
      toValue: 0,
      duration: 200,
      useNativeDriver: false,
    }).stop();
  };

  const progressWidth = pressProgress.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', '100%'],
  });

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
          {/* Long press on icon for panic mode */}
          <TouchableOpacity
            style={styles.iconContainer}
            onPressIn={handlePressIn}
            onPressOut={handlePressOut}
            activeOpacity={1}
          >
            <Ionicons name="shield-checkmark" size={48} color="#6366f1" />
            {isPressing && (
              <View style={styles.progressContainer}>
                <Animated.View 
                  style={[styles.progressBar, { width: progressWidth }]} 
                />
              </View>
            )}
          </TouchableOpacity>
          <Text style={styles.title}>GhostChat</Text>
          <Text style={styles.subtitle}>Messagerie 100% privée</Text>
          {isPressing && (
            <Text style={styles.holdText}>Maintenez pour RESET...</Text>
          )}
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
            <>
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

              {/* Duress PIN Section */}
              <TouchableOpacity
                style={styles.duressToggle}
                onPress={() => setShowDuressField(!showDuressField)}
              >
                <Ionicons 
                  name={showDuressField ? "chevron-down" : "chevron-forward"} 
                  size={18} 
                  color="#ef4444" 
                />
                <Text style={styles.duressToggleText}>
                  PIN de détresse (optionnel)
                </Text>
                <Ionicons name="warning" size={16} color="#ef4444" />
              </TouchableOpacity>

              {showDuressField && (
                <View style={styles.duressSection}>
                  <Text style={styles.duressInfo}>
                    Ce PIN supprimera TOUTES vos données si utilisé pour se connecter
                  </Text>
                  <View style={[styles.inputContainer, styles.duressInput]}>
                    <Ionicons name="alert-circle-outline" size={20} color="#ef4444" style={styles.inputIcon} />
                    <TextInput
                      style={styles.input}
                      placeholder="PIN de détresse"
                      placeholderTextColor="#666"
                      value={duressPin}
                      onChangeText={setDuressPin}
                      secureTextEntry={!showPin}
                      keyboardType="numeric"
                    />
                  </View>
                </View>
              )}
            </>
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
              setDuressPin('');
              setShowDuressField(false);
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

        <Text style={styles.longPressHint}>
          Maintenez le logo 5 sec pour RESET d'urgence
        </Text>
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
    overflow: 'hidden',
  },
  progressContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 4,
    backgroundColor: 'rgba(239, 68, 68, 0.3)',
  },
  progressBar: {
    height: '100%',
    backgroundColor: '#ef4444',
  },
  holdText: {
    color: '#ef4444',
    fontSize: 12,
    marginTop: 8,
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
  duressToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    marginBottom: 8,
  },
  duressToggleText: {
    color: '#ef4444',
    fontSize: 14,
    marginHorizontal: 8,
  },
  duressSection: {
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    borderRadius: 12,
    padding: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.3)',
  },
  duressInfo: {
    color: '#ef4444',
    fontSize: 12,
    marginBottom: 12,
    textAlign: 'center',
  },
  duressInput: {
    marginBottom: 0,
    borderColor: 'rgba(239, 68, 68, 0.5)',
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
  longPressHint: {
    textAlign: 'center',
    color: '#444',
    fontSize: 11,
    marginTop: 20,
  },
});
