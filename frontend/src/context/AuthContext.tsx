import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import * as SecureStore from 'expo-secure-store';
import * as LocalAuthentication from 'expo-local-authentication';
import nacl from 'tweetnacl';
import naclUtil from 'tweetnacl-util';
import { Platform } from 'react-native';
import Constants from 'expo-constants';

// Get API URL from environment or app.json extra
const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL || 
  Constants.expoConfig?.extra?.backendUrl || 
  'https://ghost-messenger.onrender.com';

interface User {
  id: string;
  username: string;
  public_key: string;
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  biometricsEnabled: boolean;
  login: (username: string, pin: string) => Promise<boolean>;
  register: (username: string, pin: string, duressPin?: string) => Promise<boolean>;
  logout: () => Promise<void>;
  panic: () => Promise<void>;
  verifyBiometrics: () => Promise<boolean>;
  enableBiometrics: () => Promise<boolean>;
  getKeyPair: () => { publicKey: string; secretKey: string } | null;
  hashPin: (pin: string) => string;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [biometricsEnabled, setBiometricsEnabled] = useState(false);
  const [keyPair, setKeyPair] = useState<{ publicKey: string; secretKey: string } | null>(null);

  useEffect(() => {
    loadStoredAuth();
  }, []);

  const hashPin = (pin: string): string => {
    // Simple hash using nacl
    const pinBytes = naclUtil.decodeUTF8(pin);
    const hash = nacl.hash(pinBytes);
    return naclUtil.encodeBase64(hash);
  };

  const generateKeyPair = async (): Promise<{ publicKey: string; secretKey: string }> => {
    const keyPairRaw = nacl.box.keyPair();
    const keys = {
      publicKey: naclUtil.encodeBase64(keyPairRaw.publicKey),
      secretKey: naclUtil.encodeBase64(keyPairRaw.secretKey),
    };
    
    // Store secret key securely
    if (Platform.OS !== 'web') {
      await SecureStore.setItemAsync('secret_key', keys.secretKey);
    }
    
    setKeyPair(keys);
    return keys;
  };

  const loadStoredAuth = async () => {
    try {
      let storedToken: string | null = null;
      let storedUser: string | null = null;
      let storedSecretKey: string | null = null;
      let storedBiometrics: string | null = null;

      if (Platform.OS !== 'web') {
        storedToken = await SecureStore.getItemAsync('auth_token');
        storedUser = await SecureStore.getItemAsync('user_data');
        storedSecretKey = await SecureStore.getItemAsync('secret_key');
        storedBiometrics = await SecureStore.getItemAsync('biometrics_enabled');
      }

      if (storedToken && storedUser) {
        setToken(storedToken);
        setUser(JSON.parse(storedUser));
        
        if (storedSecretKey) {
          const userData = JSON.parse(storedUser);
          setKeyPair({
            publicKey: userData.public_key,
            secretKey: storedSecretKey,
          });
        }
      }

      setBiometricsEnabled(storedBiometrics === 'true');
    } catch (error) {
      console.error('Error loading auth:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const login = async (username: string, pin: string): Promise<boolean> => {
    try {
      const pinHash = hashPin(pin);
      const response = await fetch(`${API_URL}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, pin_hash: pinHash }),
      });

      if (!response.ok) {
        return false;
      }

      const data = await response.json();
      
      // Load stored secret key
      let storedSecretKey: string | null = null;
      if (Platform.OS !== 'web') {
        storedSecretKey = await SecureStore.getItemAsync('secret_key');
      }

      const userData: User = {
        id: data.user_id,
        username: data.username,
        public_key: data.public_key,
      };

      setToken(data.token);
      setUser(userData);

      if (storedSecretKey) {
        setKeyPair({
          publicKey: data.public_key,
          secretKey: storedSecretKey,
        });
      }

      if (Platform.OS !== 'web') {
        await SecureStore.setItemAsync('auth_token', data.token);
        await SecureStore.setItemAsync('user_data', JSON.stringify(userData));
      }

      return true;
    } catch (error) {
      console.error('Login error:', error);
      return false;
    }
  };

  const register = async (username: string, pin: string, duressPin?: string): Promise<boolean> => {
    try {
      const pinHash = hashPin(pin);
      const duressPinHash = duressPin ? hashPin(duressPin) : null;
      const keys = await generateKeyPair();

      const response = await fetch(`${API_URL}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username,
          pin_hash: pinHash,
          public_key: keys.publicKey,
          duress_pin_hash: duressPinHash,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || 'Registration failed');
      }

      // Auto login after registration
      return await login(username, pin);
    } catch (error) {
      console.error('Register error:', error);
      return false;
    }
  };

  const logout = async () => {
    try {
      if (token) {
        await fetch(`${API_URL}/api/auth/logout`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
        });
      }
    } catch (error) {
      console.error('Logout error:', error);
    } finally {
      setUser(null);
      setToken(null);
      setKeyPair(null);

      if (Platform.OS !== 'web') {
        await SecureStore.deleteItemAsync('auth_token');
        await SecureStore.deleteItemAsync('user_data');
        // Keep secret_key for re-login
      }
    }
  };

  const panic = async () => {
    try {
      if (token) {
        await fetch(`${API_URL}/api/panic`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ confirm: true }),
        });
      }
    } catch (error) {
      console.error('Panic error:', error);
    } finally {
      // Wipe everything locally
      setUser(null);
      setToken(null);
      setKeyPair(null);
      setBiometricsEnabled(false);

      if (Platform.OS !== 'web') {
        await SecureStore.deleteItemAsync('auth_token');
        await SecureStore.deleteItemAsync('user_data');
        await SecureStore.deleteItemAsync('secret_key');
        await SecureStore.deleteItemAsync('biometrics_enabled');
      }
    }
  };

  const verifyBiometrics = async (): Promise<boolean> => {
    try {
      if (Platform.OS === 'web') return true;
      
      const hasHardware = await LocalAuthentication.hasHardwareAsync();
      if (!hasHardware) return true; // Skip if no biometrics

      const isEnrolled = await LocalAuthentication.isEnrolledAsync();
      if (!isEnrolled) return true; // Skip if not enrolled

      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: 'Vérifiez votre identité',
        fallbackLabel: 'Utiliser le PIN',
        disableDeviceFallback: false,
      });

      return result.success;
    } catch (error) {
      console.error('Biometrics error:', error);
      return false;
    }
  };

  const enableBiometrics = async (): Promise<boolean> => {
    try {
      if (Platform.OS === 'web') return false;
      
      const hasHardware = await LocalAuthentication.hasHardwareAsync();
      if (!hasHardware) return false;

      const isEnrolled = await LocalAuthentication.isEnrolledAsync();
      if (!isEnrolled) return false;

      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: 'Activer la biométrie',
      });

      if (result.success) {
        await SecureStore.setItemAsync('biometrics_enabled', 'true');
        setBiometricsEnabled(true);
        return true;
      }

      return false;
    } catch (error) {
      console.error('Enable biometrics error:', error);
      return false;
    }
  };

  const getKeyPair = () => keyPair;

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        isLoading,
        isAuthenticated: !!user && !!token,
        biometricsEnabled,
        login,
        register,
        logout,
        panic,
        verifyBiometrics,
        enableBiometrics,
        getKeyPair,
        hashPin,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
}

export function useRegisterWithError() {
  const { login } = useAuth();
  
  const registerWithError = async (
    username: string, 
    pin: string, 
    duressPin?: string
  ): Promise<{ success: boolean; error?: string }> => {
    try {
      // Use the same fallback chain as the main AuthProvider
      const REGISTER_API_URL = process.env.EXPO_PUBLIC_BACKEND_URL || 
        Constants.expoConfig?.extra?.backendUrl || 
        'https://ghost-messenger.onrender.com';
      
      // Hash PIN
      const pinBytes = naclUtil.decodeUTF8(pin);
      const hash = nacl.hash(pinBytes);
      const pinHash = naclUtil.encodeBase64(hash);
      
      // Generate key pair
      const keyPairRaw = nacl.box.keyPair();
      const publicKey = naclUtil.encodeBase64(keyPairRaw.publicKey);
      const secretKey = naclUtil.encodeBase64(keyPairRaw.secretKey);
      
      // Store secret key
      if (Platform.OS !== 'web') {
        await SecureStore.setItemAsync('secret_key', secretKey);
      }
      
      // Duress PIN hash
      let duressPinHash = null;
      if (duressPin) {
        const duressBytes = naclUtil.decodeUTF8(duressPin);
        const duressHash = nacl.hash(duressBytes);
        duressPinHash = naclUtil.encodeBase64(duressHash);
      }

      const response = await fetch(`${REGISTER_API_URL}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username,
          pin_hash: pinHash,
          public_key: publicKey,
          duress_pin_hash: duressPinHash,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        if (response.status === 400 && errorData.detail === 'Username taken') {
          return { success: false, error: 'Ce nom d\'utilisateur est déjà pris' };
        }
        return { success: false, error: errorData.detail || 'Erreur lors de l\'inscription' };
      }

      // Auto login after registration
      const loginSuccess = await login(username, pin);
      if (!loginSuccess) {
        return { success: false, error: 'Compte créé mais échec de connexion' };
      }
      
      return { success: true };
    } catch (error: any) {
      console.error('Register error:', error);
      if (error.message?.includes('Network') || error.message?.includes('fetch')) {
        return { success: false, error: 'Impossible de contacter le serveur. Vérifiez votre connexion.' };
      }
      return { success: false, error: 'Erreur inattendue. Réessayez.' };
    }
  };
  
  return registerWithError;
}
