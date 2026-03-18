import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useAuth } from '../src/context/AuthContext';

const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

interface QRData {
  type: string;
  id: string;
  username: string;
  public_key: string;
}

export default function ScanQRScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { token } = useAuth();
  
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);
  const [processing, setProcessing] = useState(false);

  const handleBarCodeScanned = async ({ data }: { data: string }) => {
    if (scanned || processing) return;
    
    setScanned(true);
    setProcessing(true);

    try {
      const qrData: QRData = JSON.parse(data);
      
      if (qrData.type !== 'ghostchat_contact') {
        Alert.alert('Erreur', 'QR code invalide', [
          { text: 'Réessayer', onPress: () => setScanned(false) }
        ]);
        setProcessing(false);
        return;
      }

      // Create conversation with scanned user
      const response = await fetch(`${API_URL}/api/conversations`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ participant_id: qrData.id }),
      });

      if (response.ok) {
        const conv = await response.json();
        Alert.alert(
          'Contact ajouté !',
          `@${qrData.username} a été ajouté à vos contacts.`,
          [
            {
              text: 'Envoyer un message',
              onPress: () => router.replace(`/chat/${conv.id}`),
            },
            {
              text: 'Plus tard',
              onPress: () => router.replace('/chat'),
            },
          ]
        );
      } else {
        Alert.alert('Erreur', 'Impossible d\'ajouter le contact', [
          { text: 'Réessayer', onPress: () => setScanned(false) }
        ]);
      }
    } catch (error) {
      console.error('QR scan error:', error);
      Alert.alert('Erreur', 'QR code invalide ou mal formé', [
        { text: 'Réessayer', onPress: () => setScanned(false) }
      ]);
    } finally {
      setProcessing(false);
    }
  };

  if (!permission) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <ActivityIndicator size="large" color="#6366f1" />
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => router.back()}
          >
            <Ionicons name="arrow-back" size={24} color="#fff" />
          </TouchableOpacity>
          <Text style={styles.title}>Scanner QR</Text>
          <View style={styles.placeholder} />
        </View>

        <View style={styles.permissionContainer}>
          <Ionicons name="camera-outline" size={64} color="#666" />
          <Text style={styles.permissionTitle}>Accès caméra requis</Text>
          <Text style={styles.permissionText}>
            Pour scanner les QR codes de vos contacts, veuillez autoriser l'accès à la caméra.
          </Text>
          <TouchableOpacity
            style={styles.permissionButton}
            onPress={requestPermission}
          >
            <Text style={styles.permissionButtonText}>Autoriser la caméra</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

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
        <Text style={styles.title}>Scanner QR</Text>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => router.push('/my-qr')}
        >
          <Ionicons name="qr-code" size={24} color="#6366f1" />
        </TouchableOpacity>
      </View>

      {/* Camera */}
      <View style={styles.cameraContainer}>
        <CameraView
          style={styles.camera}
          facing="back"
          barcodeScannerSettings={{
            barcodeTypes: ['qr'],
          }}
          onBarcodeScanned={scanned ? undefined : handleBarCodeScanned}
        >
          <View style={styles.overlay}>
            <View style={styles.scanArea}>
              <View style={[styles.corner, styles.topLeft]} />
              <View style={[styles.corner, styles.topRight]} />
              <View style={[styles.corner, styles.bottomLeft]} />
              <View style={[styles.corner, styles.bottomRight]} />
            </View>
          </View>
        </CameraView>

        {processing && (
          <View style={styles.processingOverlay}>
            <ActivityIndicator size="large" color="#6366f1" />
            <Text style={styles.processingText}>Ajout du contact...</Text>
          </View>
        )}
      </View>

      {/* Instructions */}
      <View style={styles.instructions}>
        <Ionicons name="scan-outline" size={24} color="#6366f1" />
        <Text style={styles.instructionsText}>
          Pointez la caméra vers le QR code de votre contact
        </Text>
      </View>

      {scanned && !processing && (
        <TouchableOpacity
          style={styles.rescanButton}
          onPress={() => setScanned(false)}
        >
          <Ionicons name="refresh" size={20} color="#fff" />
          <Text style={styles.rescanText}>Scanner à nouveau</Text>
        </TouchableOpacity>
      )}
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
  cameraContainer: {
    flex: 1,
    position: 'relative',
  },
  camera: {
    flex: 1,
  },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  scanArea: {
    width: 250,
    height: 250,
    backgroundColor: 'transparent',
    position: 'relative',
  },
  corner: {
    position: 'absolute',
    width: 30,
    height: 30,
    borderColor: '#6366f1',
  },
  topLeft: {
    top: 0,
    left: 0,
    borderTopWidth: 4,
    borderLeftWidth: 4,
    borderTopLeftRadius: 12,
  },
  topRight: {
    top: 0,
    right: 0,
    borderTopWidth: 4,
    borderRightWidth: 4,
    borderTopRightRadius: 12,
  },
  bottomLeft: {
    bottom: 0,
    left: 0,
    borderBottomWidth: 4,
    borderLeftWidth: 4,
    borderBottomLeftRadius: 12,
  },
  bottomRight: {
    bottom: 0,
    right: 0,
    borderBottomWidth: 4,
    borderRightWidth: 4,
    borderBottomRightRadius: 12,
  },
  processingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.8)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  processingText: {
    color: '#fff',
    fontSize: 16,
    marginTop: 16,
  },
  instructions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    gap: 12,
  },
  instructionsText: {
    color: '#888',
    fontSize: 14,
    textAlign: 'center',
    flex: 1,
  },
  rescanButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#6366f1',
    marginHorizontal: 24,
    marginBottom: 24,
    paddingVertical: 14,
    borderRadius: 12,
    gap: 8,
  },
  rescanText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  permissionContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  permissionTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#fff',
    marginTop: 16,
  },
  permissionText: {
    fontSize: 14,
    color: '#888',
    textAlign: 'center',
    marginTop: 8,
    marginBottom: 24,
  },
  permissionButton: {
    backgroundColor: '#6366f1',
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 12,
  },
  permissionButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
