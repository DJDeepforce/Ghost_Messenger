import React, { useState, useRef } from 'react';
import {
  View, Text, TextInput, StyleSheet, TouchableOpacity,
  Alert, ActivityIndicator, KeyboardAvoidingView, Platform,
  ScrollView, Animated, Pressable,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuth, useRegisterWithError } from '../src/context/AuthContext';

// Design tokens
const C = {
  bg: '#080810',
  surface: '#0f0f1a',
  border: '#1e1e35',
  accent: '#7C3AED',
  accentDim: 'rgba(124,58,237,0.15)',
  accentGlow: 'rgba(124,58,237,0.35)',
  text: '#E8E8F0',
  muted: '#555570',
  danger: '#DC2626',
};

export default function AuthScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { login } = useAuth();
  const registerWithError = useRegisterWithError();

  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [username, setUsername] = useState('');
  const [pin, setPin] = useState('');
  const [duressPin, setDuressPin] = useState('');
  const [showPin, setShowPin] = useState(false);
  const [loading, setLoading] = useState(false);

  // Logo long press → panic
  const panicTimer = useRef<NodeJS.Timeout | null>(null);
  const panicAnim = useRef(new Animated.Value(1)).current;
  const panicScale = useRef(new Animated.Value(1)).current;
  const holdProgress = useRef(new Animated.Value(0)).current;

  // Fade-in animation
  const fadeAnim = useRef(new Animated.Value(0)).current;
  React.useEffect(() => {
    Animated.timing(fadeAnim, { toValue: 1, duration: 600, useNativeDriver: true }).start();
  }, []);

  const startPanic = () => {
    Animated.parallel([
      Animated.timing(panicScale, { toValue: 0.92, duration: 5000, useNativeDriver: true }),
      Animated.timing(holdProgress, { toValue: 1, duration: 5000, useNativeDriver: false }),
    ]).start();
    panicTimer.current = setTimeout(() => {
      triggerPanic();
    }, 5000);
  };

  const cancelPanic = () => {
    if (panicTimer.current) clearTimeout(panicTimer.current);
    Animated.parallel([
      Animated.spring(panicScale, { toValue: 1, useNativeDriver: true }),
      Animated.timing(holdProgress, { toValue: 0, duration: 200, useNativeDriver: false }),
    ]).start();
  };

  const triggerPanic = () => {
    Alert.alert(
      '🚨 RESET D\'URGENCE',
      'Toutes les données seront effacées immédiatement.',
      [
        { text: 'Annuler', style: 'cancel', onPress: cancelPanic },
        {
          text: 'EFFACER TOUT', style: 'destructive',
          onPress: async () => {
            const { panic } = useAuth();
            await panic();
            router.replace('/');
          },
        },
      ]
    );
  };

  const handleSubmit = async () => {
    if (!username.trim()) return Alert.alert('Erreur', 'Identifiant requis');
    if (pin.length < 4) return Alert.alert('Erreur', 'PIN minimum 4 chiffres');
    if (mode === 'register' && duressPin && duressPin === pin)
      return Alert.alert('Erreur', 'Le PIN de détresse doit être différent du PIN principal');

    setLoading(true);
    try {
      if (mode === 'login') {
        const success = await login(username.trim(), pin);
        if (success) router.replace('/chat');
        else Alert.alert('Erreur', 'Identifiants invalides');
      } else {
        const result = await registerWithError(username.trim(), pin, duressPin || undefined);
        if (result.success) router.replace('/chat');
        else Alert.alert('Erreur', result.error || 'Erreur inconnue');
      }
    } finally {
      setLoading(false);
    }
  };

  const holdBorderColor = holdProgress.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [C.border, C.accent, C.danger],
  });

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        contentContainerStyle={[styles.container, { paddingTop: insets.top + 32, paddingBottom: insets.bottom + 24 }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Animated.View style={{ opacity: fadeAnim, width: '100%', alignItems: 'center' }}>

          {/* Logo — hold 5s for panic */}
          <Pressable onPressIn={startPanic} onPressOut={cancelPanic}>
            <Animated.View style={[styles.logoWrap, { transform: [{ scale: panicScale }] }]}>
              <Animated.View style={[styles.logoBorder, { borderColor: holdBorderColor }]}>
                <View style={styles.logoInner}>
                  <Ionicons name="shield-checkmark" size={36} color={C.accent} />
                </View>
              </Animated.View>
              {/* Glow ring */}
              <View style={styles.logoGlow} />
            </Animated.View>
          </Pressable>

          <Text style={styles.title}>GhostChat</Text>
          <Text style={styles.subtitle}>Messagerie 100% privée</Text>

          {/* Mode toggle */}
          <View style={styles.toggle}>
            {(['login', 'register'] as const).map((m) => (
              <TouchableOpacity
                key={m}
                style={[styles.toggleBtn, mode === m && styles.toggleBtnActive]}
                onPress={() => setMode(m)}
              >
                <Text style={[styles.toggleText, mode === m && styles.toggleTextActive]}>
                  {m === 'login' ? 'Connexion' : 'Créer un compte'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Fields */}
          <View style={styles.fields}>
            <View style={styles.inputWrap}>
              <Ionicons name="person-outline" size={18} color={C.muted} style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                value={username}
                onChangeText={setUsername}
                placeholder="Nom d'utilisateur"
                placeholderTextColor={C.muted}
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>

            <View style={styles.inputWrap}>
              <Ionicons name="lock-closed-outline" size={18} color={C.muted} style={styles.inputIcon} />
              <TextInput
                style={[styles.input, { flex: 1 }]}
                value={pin}
                onChangeText={setPin}
                placeholder="PIN (min. 4 caractères)"
                placeholderTextColor={C.muted}
                secureTextEntry={!showPin}
                keyboardType="numeric"
                maxLength={12}
              />
              <TouchableOpacity onPress={() => setShowPin(!showPin)} style={styles.eyeBtn}>
                <Ionicons name={showPin ? 'eye-off-outline' : 'eye-outline'} size={18} color={C.muted} />
              </TouchableOpacity>
            </View>

            {mode === 'register' && (
              <View>
                <View style={styles.inputWrap}>
                  <Ionicons name="warning-outline" size={18} color={C.muted} style={styles.inputIcon} />
                  <TextInput
                    style={[styles.input, { flex: 1 }]}
                    value={duressPin}
                    onChangeText={setDuressPin}
                    placeholder="PIN de détresse (optionnel)"
                    placeholderTextColor={C.muted}
                    secureTextEntry
                    keyboardType="numeric"
                    maxLength={12}
                  />
                </View>
                <Text style={styles.hint}>
                  ⚠️ Ce PIN efface silencieusement toutes vos données
                </Text>
              </View>
            )}
          </View>

          {/* Submit */}
          <TouchableOpacity
            style={[styles.submitBtn, loading && { opacity: 0.6 }]}
            onPress={handleSubmit}
            disabled={loading}
            activeOpacity={0.85}
          >
            {loading
              ? <ActivityIndicator color="#fff" />
              : <Text style={styles.submitText}>
                  {mode === 'login' ? 'Se connecter' : 'Créer le compte'}
                </Text>
            }
          </TouchableOpacity>

          {/* Features strip */}
          <View style={styles.features}>
            {[
              { icon: 'eye-off-outline', label: 'Anonymat total' },
              { icon: 'lock-closed-outline', label: 'Chiffrement E2E' },
              { icon: 'timer-outline', label: 'Messages éphémères' },
            ].map((f) => (
              <View key={f.label} style={styles.featureItem}>
                <Ionicons name={f.icon as any} size={14} color={C.accent} />
                <Text style={styles.featureText}>{f.label}</Text>
              </View>
            ))}
          </View>

          <Text style={styles.panicHint}>Maintenez le logo 5 sec pour RESET d'urgence</Text>
        </Animated.View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1, backgroundColor: C.bg,
    alignItems: 'center', paddingHorizontal: 24,
  },
  logoWrap: { marginBottom: 24, alignItems: 'center', justifyContent: 'center' },
  logoBorder: {
    width: 88, height: 88, borderRadius: 44,
    borderWidth: 2, alignItems: 'center', justifyContent: 'center',
  },
  logoInner: {
    width: 76, height: 76, borderRadius: 38,
    backgroundColor: C.accentDim,
    alignItems: 'center', justifyContent: 'center',
  },
  logoGlow: {
    position: 'absolute', width: 100, height: 100, borderRadius: 50,
    backgroundColor: C.accentGlow, opacity: 0.25,
  },
  title: {
    fontSize: 34, fontWeight: '800', color: C.text,
    letterSpacing: -1, marginBottom: 6,
  },
  subtitle: { fontSize: 15, color: C.muted, marginBottom: 36 },
  toggle: {
    flexDirection: 'row', backgroundColor: C.surface,
    borderRadius: 14, padding: 4, width: '100%',
    marginBottom: 28, borderWidth: 1, borderColor: C.border,
  },
  toggleBtn: { flex: 1, paddingVertical: 11, borderRadius: 11, alignItems: 'center' },
  toggleBtnActive: { backgroundColor: C.accent },
  toggleText: { color: C.muted, fontWeight: '600', fontSize: 14 },
  toggleTextActive: { color: '#fff' },
  fields: { width: '100%', gap: 12, marginBottom: 24 },
  inputWrap: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: C.surface, borderRadius: 14,
    borderWidth: 1, borderColor: C.border,
    paddingHorizontal: 14,
  },
  inputIcon: { marginRight: 10 },
  input: {
    flex: 1, color: C.text, fontSize: 15,
    paddingVertical: 16,
  },
  eyeBtn: { padding: 6 },
  hint: {
    fontSize: 12, color: '#F59E0B', marginTop: 8,
    paddingHorizontal: 4, lineHeight: 17,
  },
  submitBtn: {
    width: '100%', backgroundColor: C.accent,
    borderRadius: 14, paddingVertical: 17,
    alignItems: 'center', marginBottom: 32,
    shadowColor: C.accent, shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4, shadowRadius: 16, elevation: 8,
  },
  submitText: { color: '#fff', fontSize: 17, fontWeight: '700', letterSpacing: 0.3 },
  features: {
    flexDirection: 'row', gap: 16, marginBottom: 24,
    flexWrap: 'wrap', justifyContent: 'center',
  },
  featureItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  featureText: { color: C.muted, fontSize: 12 },
  panicHint: { fontSize: 11, color: '#2a2a3a', textAlign: 'center' },
});
