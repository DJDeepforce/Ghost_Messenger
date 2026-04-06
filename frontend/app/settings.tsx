import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  TextInput, Alert, ActivityIndicator, Switch,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../src/context/AuthContext';
import * as SecureStore from 'expo-secure-store';

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
  dangerDim: 'rgba(220,38,38,0.1)',
  success: '#10B981',
};

export default function SettingsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user, token, logout, panic, hashPin, enableBiometrics, biometricsEnabled } = useAuth();

  // Change PIN state
  const [showChangePIN, setShowChangePIN] = useState(false);
  const [currentPin, setCurrentPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [changingPIN, setChangingPIN] = useState(false);

  // Change Duress PIN state
  const [showChangeDuress, setShowChangeDuress] = useState(false);
  const [currentPinForDuress, setCurrentPinForDuress] = useState('');
  const [newDuressPin, setNewDuressPin] = useState('');
  const [changingDuress, setChangingDuress] = useState(false);

  const handleChangePIN = async () => {
    if (!currentPin || newPin.length < 4) {
      return Alert.alert('Erreur', 'PIN actuel requis et nouveau PIN minimum 4 chiffres');
    }
    if (newPin !== confirmPin) {
      return Alert.alert('Erreur', 'Les nouveaux PINs ne correspondent pas');
    }
    if (newPin === currentPin) {
      return Alert.alert('Erreur', 'Le nouveau PIN doit être différent');
    }

    setChangingPIN(true);
    try {
      const currentHash = hashPin(currentPin);
      const newHash = hashPin(newPin);

      // Verify current PIN by attempting login logic
      const res = await fetch(`${API_URL}/api/auth/change-pin`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ current_pin_hash: currentHash, new_pin_hash: newHash }),
      });

      if (res.ok) {
        Alert.alert('✅ Succès', 'PIN modifié avec succès');
        setCurrentPin(''); setNewPin(''); setConfirmPin('');
        setShowChangePIN(false);
      } else {
        const err = await res.json();
        Alert.alert('Erreur', err.detail || 'PIN actuel incorrect');
      }
    } catch {
      Alert.alert('Erreur', 'Impossible de contacter le serveur');
    } finally {
      setChangingPIN(false);
    }
  };

  const handleChangeDuressPin = async () => {
    if (!currentPinForDuress || newDuressPin.length < 4) {
      return Alert.alert('Erreur', 'PIN principal requis et PIN de détresse minimum 4 chiffres');
    }

    setChangingDuress(true);
    try {
      const currentHash = hashPin(currentPinForDuress);
      const duressHash = hashPin(newDuressPin);

      const res = await fetch(`${API_URL}/api/auth/change-duress-pin`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ current_pin_hash: currentHash, duress_pin_hash: duressHash }),
      });

      if (res.ok) {
        Alert.alert('✅ Succès', 'PIN de détresse modifié');
        setCurrentPinForDuress(''); setNewDuressPin('');
        setShowChangeDuress(false);
      } else {
        const err = await res.json();
        Alert.alert('Erreur', err.detail || 'PIN incorrect');
      }
    } catch {
      Alert.alert('Erreur', 'Impossible de contacter le serveur');
    } finally {
      setChangingDuress(false);
    }
  };

  const handleEnableBiometrics = async () => {
    const success = await enableBiometrics();
    if (success) Alert.alert('✅ Activé', 'Biométrie activée');
    else Alert.alert('Erreur', 'Biométrie non disponible ou annulée');
  };

  const handlePanic = () => {
    Alert.alert(
      '🚨 Mode Panique',
      'Efface TOUTES les données : compte, messages, clés. Cette action est IRRÉVERSIBLE.',
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'EFFACER TOUT', style: 'destructive',
          onPress: async () => { await panic(); router.replace('/'); },
        },
      ]
    );
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={24} color={C.text} />
        </TouchableOpacity>
        <Text style={styles.title}>Paramètres</Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>

        {/* Account info */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>COMPTE</Text>
          <View style={styles.card}>
            <View style={styles.profileRow}>
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>{(user?.username || '?')[0].toUpperCase()}</Text>
              </View>
              <View>
                <Text style={styles.profileName}>@{user?.username}</Text>
                <Text style={styles.profileSub}>Identifiant anonyme</Text>
              </View>
            </View>
          </View>
        </View>

        {/* Security */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>SÉCURITÉ</Text>
          <View style={styles.card}>

            {/* Change PIN */}
            <TouchableOpacity
              style={styles.row}
              onPress={() => setShowChangePIN(!showChangePIN)}
            >
              <View style={styles.rowLeft}>
                <View style={[styles.rowIcon, { backgroundColor: C.accentDim }]}>
                  <Ionicons name="key-outline" size={18} color={C.accent} />
                </View>
                <Text style={styles.rowLabel}>Modifier le PIN</Text>
              </View>
              <Ionicons name={showChangePIN ? 'chevron-up' : 'chevron-down'} size={16} color={C.muted} />
            </TouchableOpacity>

            {showChangePIN && (
              <View style={styles.subForm}>
                <TextInput style={styles.subInput} value={currentPin} onChangeText={setCurrentPin}
                  placeholder="PIN actuel" placeholderTextColor={C.muted}
                  secureTextEntry keyboardType="numeric" maxLength={12} />
                <TextInput style={styles.subInput} value={newPin} onChangeText={setNewPin}
                  placeholder="Nouveau PIN (min. 4 chiffres)" placeholderTextColor={C.muted}
                  secureTextEntry keyboardType="numeric" maxLength={12} />
                <TextInput style={styles.subInput} value={confirmPin} onChangeText={setConfirmPin}
                  placeholder="Confirmer le nouveau PIN" placeholderTextColor={C.muted}
                  secureTextEntry keyboardType="numeric" maxLength={12} />
                <TouchableOpacity
                  style={[styles.subBtn, changingPIN && { opacity: 0.6 }]}
                  onPress={handleChangePIN} disabled={changingPIN}
                >
                  {changingPIN ? <ActivityIndicator size="small" color="#fff" /> :
                    <Text style={styles.subBtnText}>Confirmer le changement</Text>}
                </TouchableOpacity>
              </View>
            )}

            <View style={styles.rowDivider} />

            {/* Change Duress PIN */}
            <TouchableOpacity
              style={styles.row}
              onPress={() => setShowChangeDuress(!showChangeDuress)}
            >
              <View style={styles.rowLeft}>
                <View style={[styles.rowIcon, { backgroundColor: 'rgba(245,158,11,0.1)' }]}>
                  <Ionicons name="warning-outline" size={18} color="#F59E0B" />
                </View>
                <View>
                  <Text style={styles.rowLabel}>PIN de détresse</Text>
                  <Text style={styles.rowSub}>Efface tout silencieusement</Text>
                </View>
              </View>
              <Ionicons name={showChangeDuress ? 'chevron-up' : 'chevron-down'} size={16} color={C.muted} />
            </TouchableOpacity>

            {showChangeDuress && (
              <View style={styles.subForm}>
                <Text style={styles.subHint}>
                  ⚠️ Entrer ce PIN lors du login effacera silencieusement toutes vos données
                </Text>
                <TextInput style={styles.subInput} value={currentPinForDuress} onChangeText={setCurrentPinForDuress}
                  placeholder="Votre PIN principal" placeholderTextColor={C.muted}
                  secureTextEntry keyboardType="numeric" maxLength={12} />
                <TextInput style={styles.subInput} value={newDuressPin} onChangeText={setNewDuressPin}
                  placeholder="Nouveau PIN de détresse" placeholderTextColor={C.muted}
                  secureTextEntry keyboardType="numeric" maxLength={12} />
                <TouchableOpacity
                  style={[styles.subBtn, { backgroundColor: '#D97706' }, changingDuress && { opacity: 0.6 }]}
                  onPress={handleChangeDuressPin} disabled={changingDuress}
                >
                  {changingDuress ? <ActivityIndicator size="small" color="#fff" /> :
                    <Text style={styles.subBtnText}>Définir le PIN de détresse</Text>}
                </TouchableOpacity>
              </View>
            )}

            <View style={styles.rowDivider} />

            {/* Biometrics */}
            <View style={styles.row}>
              <View style={styles.rowLeft}>
                <View style={[styles.rowIcon, { backgroundColor: 'rgba(16,185,129,0.1)' }]}>
                  <Ionicons name="finger-print-outline" size={18} color={C.success} />
                </View>
                <View>
                  <Text style={styles.rowLabel}>Biométrie</Text>
                  <Text style={styles.rowSub}>Face ID / Empreinte</Text>
                </View>
              </View>
              <Switch
                value={biometricsEnabled}
                onValueChange={handleEnableBiometrics}
                trackColor={{ false: C.border, true: C.accent }}
                thumbColor="#fff"
              />
            </View>
          </View>
        </View>

        {/* Danger zone */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>ZONE DE DANGER</Text>
          <View style={[styles.card, { borderColor: C.danger + '40' }]}>
            <TouchableOpacity style={styles.row} onPress={handlePanic}>
              <View style={styles.rowLeft}>
                <View style={[styles.rowIcon, { backgroundColor: C.dangerDim }]}>
                  <Ionicons name="nuclear-outline" size={18} color={C.danger} />
                </View>
                <View>
                  <Text style={[styles.rowLabel, { color: C.danger }]}>Mode Panique</Text>
                  <Text style={styles.rowSub}>Efface tout immédiatement</Text>
                </View>
              </View>
              <Ionicons name="chevron-forward" size={16} color={C.danger} />
            </TouchableOpacity>
          </View>
        </View>

        {/* Logout */}
        <TouchableOpacity
          style={styles.logoutBtn}
          onPress={() => Alert.alert('Se déconnecter ?', undefined, [
            { text: 'Annuler', style: 'cancel' },
            { text: 'Déconnecter', onPress: async () => { await logout(); router.replace('/'); } },
          ])}
        >
          <Ionicons name="log-out-outline" size={18} color={C.muted} />
          <Text style={styles.logoutText}>Se déconnecter</Text>
        </TouchableOpacity>

        <Text style={styles.version}>GhostChat · E2E · Éphémère · Privé</Text>
      </ScrollView>
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
  scroll: { paddingHorizontal: 20, paddingBottom: 40 },
  section: { marginBottom: 24 },
  sectionTitle: { fontSize: 11, fontWeight: '700', color: C.muted, letterSpacing: 1.5, marginBottom: 10 },
  card: {
    backgroundColor: C.surface, borderRadius: 16,
    borderWidth: 1, borderColor: C.border, overflow: 'hidden',
  },
  profileRow: { flexDirection: 'row', alignItems: 'center', padding: 16, gap: 14 },
  avatar: {
    width: 50, height: 50, borderRadius: 25,
    backgroundColor: C.accentDim, alignItems: 'center', justifyContent: 'center',
  },
  avatarText: { fontSize: 22, fontWeight: '800', color: C.accent },
  profileName: { fontSize: 17, fontWeight: '700', color: C.text },
  profileSub: { fontSize: 12, color: C.muted, marginTop: 2 },
  row: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    padding: 16,
  },
  rowLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  rowIcon: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  rowLabel: { fontSize: 15, fontWeight: '600', color: C.text },
  rowSub: { fontSize: 12, color: C.muted, marginTop: 1 },
  rowDivider: { height: 1, backgroundColor: C.border, marginHorizontal: 16 },
  subForm: { paddingHorizontal: 16, paddingBottom: 16, gap: 10 },
  subInput: {
    backgroundColor: C.bg, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12,
    color: C.text, fontSize: 14, borderWidth: 1, borderColor: C.border,
  },
  subHint: { fontSize: 12, color: '#F59E0B', lineHeight: 18 },
  subBtn: {
    backgroundColor: C.accent, borderRadius: 10,
    paddingVertical: 12, alignItems: 'center',
  },
  subBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  logoutBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, paddingVertical: 16, marginBottom: 16,
  },
  logoutText: { color: C.muted, fontSize: 15, fontWeight: '600' },
  version: { textAlign: 'center', fontSize: 11, color: '#1e1e35' },
});
