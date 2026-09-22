import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Dimensions, Vibration } from 'react-native';
import Sound from 'react-native-sound';

import { useLocalSearchParams, useRouter } from 'expo-router';
import notifee from '@notifee/react-native';
import Animated, { withRepeat, withTiming, useSharedValue, useAnimatedStyle } from 'react-native-reanimated';

const { width } = Dimensions.get('window');

export default function AlarmScreen() {
  const router = useRouter();
  const { symbol } = useLocalSearchParams();
  const [sound, setSound] = useState<Sound | null>(null);
  const pulseAnim = useSharedValue(1);

  useEffect(() => {
    // Start pulsing animation
    pulseAnim.value = withRepeat(withTiming(1.2, { duration: 500 }), -1, true);

    // Vibrate phone continuously like an alarm clock: vibrate 800ms, pause 400ms
    Vibration.vibrate([800, 400], true);

    Sound.setCategory('Playback', true); // true = mixWithOthers off, plays over silent mode
    // On Android, files in res/raw/ use null as the base path (not Sound.MAIN_BUNDLE)
    const alarmSound = new Sound('alarm.mp3', null as any, (error) => {
      if (error) {
        console.error('Error loading alarm sound:', error);
        return;
      }
      alarmSound.setNumberOfLoops(-1); // loop indefinitely like a real clock alarm
      alarmSound.setVolume(1.0);
      alarmSound.play((success) => {
        if (!success) console.error('Alarm sound playback failed');
      });
      setSound(alarmSound);
    });

    return () => {
      Vibration.cancel();
      alarmSound.stop();
      alarmSound.release();
    };
  }, []);

  const handleStop = async () => {
    Vibration.cancel();
    if (sound) {
      sound.stop();
      sound.release();
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
