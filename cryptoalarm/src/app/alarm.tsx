import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Dimensions } from 'react-native';
import { Audio } from 'expo-av';
import { useLocalSearchParams, useRouter } from 'expo-router';
import notifee from '@notifee/react-native';
import Animated, { withRepeat, withTiming, useSharedValue, useAnimatedStyle } from 'react-native-reanimated';

const { width } = Dimensions.get('window');

export default function AlarmScreen() {
  const router = useRouter();
  const { symbol } = useLocalSearchParams();
  const [sound, setSound] = useState<Audio.Sound | null>(null);
  const pulseAnim = useSharedValue(1);

  useEffect(() => {
    // Start pulsing animation
    pulseAnim.value = withRepeat(withTiming(1.2, { duration: 500 }), -1, true);

    async function playAlarm() {
      try {
        await Audio.setAudioModeAsync({
          allowsRecordingIOS: false,
          playsInSilentModeIOS: true,
          shouldDuckAndroid: true,
          playThroughEarpieceAndroid: false,
          staysActiveInBackground: true,
        });

        // Load the alarm sound
        const { sound: newSound } = await Audio.Sound.createAsync(
          require('../../assets/alarm.mp3'),
          { shouldPlay: true, isLooping: true, volume: 1.0 }
        );
        setSound(newSound);
        await newSound.playAsync();
      } catch (error) {
        console.error('Error playing alarm sound:', error);
      }
    }

    playAlarm();

    return () => {
      if (sound) {
        sound.unloadAsync();
      }
    };
  }, []);

  const handleStop = async () => {
    if (sound) {
      await sound.stopAsync();
      await sound.unloadAsync();
    }
    // Cancel any active notifications
    await notifee.cancelAllNotifications();
    router.replace('/');
  };

  const animatedStyle = useAnimatedStyle(() => {
    return {
      transform: [{ scale: pulseAnim.value }],
    };
  });

  return (
    <View style={styles.container}>
      <Text style={styles.title}>ALARM TRIGGERED!</Text>
      <Text style={styles.subtitle}>{symbol ? `${symbol} reached target!` : 'Target price reached!'}</Text>
      
      <Animated.View style={[styles.circle, animatedStyle]}>
        <Text style={styles.icon}>🚨</Text>
      </Animated.View>

      <TouchableOpacity style={styles.stopButton} onPress={handleStop}>
        <Text style={styles.stopText}>STOP ALARM</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ff1c1c',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 32,
    fontWeight: '900',
    color: '#ffffff',
    marginBottom: 10,
    letterSpacing: 2,
  },
  subtitle: {
    fontSize: 20,
    color: '#ffffff',
    opacity: 0.9,
    marginBottom: 60,
  },
  circle: {
    width: width * 0.6,
    height: width * 0.6,
    borderRadius: width * 0.3,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 80,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
    elevation: 10,
  },
  icon: {
    fontSize: 80,
  },
  stopButton: {
    backgroundColor: '#000000',
    paddingVertical: 20,
    paddingHorizontal: 40,
    borderRadius: 30,
    width: '80%',
    alignItems: 'center',
  },
  stopText: {
    color: '#ffffff',
    fontSize: 20,
    fontWeight: 'bold',
    letterSpacing: 1,
  },
});
