import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Animated,
  Dimensions,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../src/context/AuthContext';

const { width } = Dimensions.get('window');

// Secret: Tap the temperature 5 times quickly to access real app
const SECRET_TAP_COUNT = 5;
const SECRET_TAP_TIMEOUT = 3000; // 3 seconds to complete the taps

// Fake weather data
const FAKE_WEATHER = {
  city: 'Paris',
  region: 'Île-de-France',
  temp: 18,
  condition: 'Partiellement nuageux',
  humidity: 65,
  wind: 12,
  feelsLike: 16,
  forecast: [
    { day: 'Lun', temp: 19, icon: 'partly-sunny' },
    { day: 'Mar', temp: 21, icon: 'sunny' },
    { day: 'Mer', temp: 17, icon: 'rainy' },
    { day: 'Jeu', temp: 15, icon: 'thunderstorm' },
    { day: 'Ven', temp: 18, icon: 'cloudy' },
    { day: 'Sam', temp: 22, icon: 'sunny' },
    { day: 'Dim', temp: 20, icon: 'partly-sunny' },
  ],
};

export default function WeatherDecoyScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { isAuthenticated, isLoading } = useAuth();
  
  const [tapCount, setTapCount] = useState(0);
  const [lastTapTime, setLastTapTime] = useState(0);
  const [currentTime, setCurrentTime] = useState(new Date());
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    // Update time every minute
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 60000);

    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    // Reset tap count after timeout
    if (tapCount > 0) {
      const timeout = setTimeout(() => {
        setTapCount(0);
      }, SECRET_TAP_TIMEOUT);
      return () => clearTimeout(timeout);
    }
  }, [tapCount, lastTapTime]);

  const handleSecretTap = () => {
    const now = Date.now();
    
    if (now - lastTapTime > SECRET_TAP_TIMEOUT) {
      // Reset if too much time passed
      setTapCount(1);
    } else {
      setTapCount(prev => prev + 1);
    }
    
    setLastTapTime(now);

    // Pulse animation feedback
    Animated.sequence([
      Animated.timing(pulseAnim, {
        toValue: 1.1,
        duration: 100,
        useNativeDriver: true,
      }),
      Animated.timing(pulseAnim, {
        toValue: 1,
        duration: 100,
        useNativeDriver: true,
      }),
    ]).start();

    // Check if secret unlocked
    if (tapCount + 1 >= SECRET_TAP_COUNT) {
      setTapCount(0);
      // Navigate to real app
      if (isAuthenticated) {
        router.replace('/chat');
      } else {
        router.replace('/auth');
      }
    }
  };

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  };

  const formatDate = (date: Date) => {
    return date.toLocaleDateString('fr-FR', { 
      weekday: 'long', 
      day: 'numeric', 
      month: 'long' 
    });
  };

  const getWeatherIcon = (condition: string) => {
    switch (condition) {
      case 'sunny': return 'sunny';
      case 'partly-sunny': return 'partly-sunny';
      case 'cloudy': return 'cloudy';
      case 'rainy': return 'rainy';
      case 'thunderstorm': return 'thunderstorm';
      default: return 'cloudy';
    }
  };

  if (isLoading) {
    return (
      <View style={[styles.container, styles.loadingContainer]}>
        <Ionicons name="cloud" size={48} color="#fff" />
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <ScrollView 
        style={styles.scrollView}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.locationContainer}>
            <Ionicons name="location" size={18} color="#fff" />
            <Text style={styles.location}>{FAKE_WEATHER.city}</Text>
          </View>
          <Text style={styles.region}>{FAKE_WEATHER.region}</Text>
          <Text style={styles.date}>{formatDate(currentTime)}</Text>
        </View>

        {/* Main Weather - SECRET TAP AREA */}
        <TouchableOpacity 
          style={styles.mainWeather}
          onPress={handleSecretTap}
          activeOpacity={0.9}
        >
          <Animated.View style={{ transform: [{ scale: pulseAnim }] }}>
            <Ionicons name="partly-sunny" size={100} color="#FFD700" />
          </Animated.View>
          <Text style={styles.temperature}>{FAKE_WEATHER.temp}°</Text>
          <Text style={styles.condition}>{FAKE_WEATHER.condition}</Text>
          <Text style={styles.feelsLike}>Ressenti {FAKE_WEATHER.feelsLike}°</Text>
        </TouchableOpacity>

        {/* Weather Details */}
        <View style={styles.detailsContainer}>
          <View style={styles.detailItem}>
            <Ionicons name="water" size={24} color="#64B5F6" />
            <Text style={styles.detailValue}>{FAKE_WEATHER.humidity}%</Text>
            <Text style={styles.detailLabel}>Humidité</Text>
          </View>
          <View style={styles.detailDivider} />
          <View style={styles.detailItem}>
            <Ionicons name="speedometer" size={24} color="#81C784" />
            <Text style={styles.detailValue}>{FAKE_WEATHER.wind} km/h</Text>
            <Text style={styles.detailLabel}>Vent</Text>
          </View>
          <View style={styles.detailDivider} />
          <View style={styles.detailItem}>
            <Ionicons name="time" size={24} color="#FFB74D" />
            <Text style={styles.detailValue}>{formatTime(currentTime)}</Text>
            <Text style={styles.detailLabel}>Heure</Text>
          </View>
        </View>

        {/* 7-Day Forecast */}
        <View style={styles.forecastContainer}>
          <Text style={styles.forecastTitle}>Prévisions 7 jours</Text>
          <View style={styles.forecastList}>
            {FAKE_WEATHER.forecast.map((day, index) => (
              <View key={index} style={styles.forecastItem}>
                <Text style={styles.forecastDay}>{day.day}</Text>
                <Ionicons 
                  name={getWeatherIcon(day.icon) as any} 
                  size={28} 
                  color={day.icon === 'sunny' ? '#FFD700' : '#B0BEC5'} 
                />
                <Text style={styles.forecastTemp}>{day.temp}°</Text>
              </View>
            ))}
          </View>
        </View>

        {/* Subtle hint - only visible if you know to look */}
        <Text style={styles.hiddenHint}>
          Dernière mise à jour: {formatTime(currentTime)}
        </Text>

        <View style={{ height: insets.bottom + 40 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1e88e5',
  },
  loadingContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrollView: {
    flex: 1,
  },
  header: {
    alignItems: 'center',
    paddingTop: 20,
    paddingBottom: 10,
  },
  locationContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  location: {
    fontSize: 24,
    fontWeight: '600',
    color: '#fff',
    marginLeft: 6,
  },
  region: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.8)',
    marginTop: 4,
  },
  date: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.7)',
    marginTop: 8,
    textTransform: 'capitalize',
  },
  mainWeather: {
    alignItems: 'center',
    paddingVertical: 30,
  },
  temperature: {
    fontSize: 72,
    fontWeight: '200',
    color: '#fff',
    marginTop: 10,
  },
  condition: {
    fontSize: 20,
    color: '#fff',
    marginTop: 8,
  },
  feelsLike: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.7)',
    marginTop: 4,
  },
  detailsContainer: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255,255,255,0.15)',
    marginHorizontal: 20,
    borderRadius: 16,
    padding: 20,
    justifyContent: 'space-around',
  },
  detailItem: {
    alignItems: 'center',
    flex: 1,
  },
  detailDivider: {
    width: 1,
    backgroundColor: 'rgba(255,255,255,0.3)',
  },
  detailValue: {
    fontSize: 18,
    fontWeight: '600',
    color: '#fff',
    marginTop: 8,
  },
  detailLabel: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.7)',
    marginTop: 4,
  },
  forecastContainer: {
    marginTop: 30,
    paddingHorizontal: 20,
  },
  forecastTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 16,
  },
  forecastList: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: 16,
    padding: 16,
  },
  forecastItem: {
    alignItems: 'center',
    flex: 1,
  },
  forecastDay: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.8)',
    marginBottom: 8,
  },
  forecastTemp: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
    marginTop: 8,
  },
  hiddenHint: {
    textAlign: 'center',
    fontSize: 11,
    color: 'rgba(255,255,255,0.4)',
    marginTop: 30,
  },
});
