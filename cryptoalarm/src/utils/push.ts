import { Platform, PermissionsAndroid } from 'react-native';
import {
  getMessaging,
  getToken,
  requestPermission,
  AuthorizationStatus,
  registerDeviceForRemoteMessages
} from '@react-native-firebase/messaging';
import notifee, { AndroidImportance, AndroidCategory, AndroidVisibility } from '@notifee/react-native';

export const ALARM_CHANNEL_ID = 'crypto_alarm_channel_v3';

export async function createAlarmChannel() {
  return await notifee.createChannel({
    id: ALARM_CHANNEL_ID,
    name: 'Crypto Alarm',
    importance: AndroidImportance.HIGH,
    sound: 'alarm',
    vibration: true,
    vibrationPattern: [300, 500],
    bypassDnd: true,
    visibility: AndroidVisibility.PUBLIC,
  });
}

// Background handler for data-only messages to trigger full-screen intent
export async function triggerAlarmNotification(message: any) {
  const channelId = await createAlarmChannel();

  await notifee.displayNotification({
    title: message.data?.title || 'Crypto Alarm',
    body: message.data?.body || 'Your target price has been reached!',
    data: message.data,
    android: {
      channelId,
      category: AndroidCategory.ALARM,
      importance: AndroidImportance.HIGH,
      sound: 'alarm',
      loopSound: true,
      autoCancel: false,
      ongoing: true,
      visibility: AndroidVisibility.PUBLIC,
      fullScreenAction: {
        id: 'default',
      },
      pressAction: {
        id: 'default',
      },
    },
  });
}

export async function requestUserPermission() {
  try {
    if (Platform.OS === 'android') {
      if (Platform.Version >= 33) {
        const granted = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS
        );
        if (granted !== PermissionsAndroid.RESULTS.GRANTED) {
          return false;
        }
      }

      // Request Notifee permissions for alarms
      await notifee.requestPermission();

      // Pre-create alarm channel so Android OS registers alarm sound ahead of time
      await createAlarmChannel();

      return true;
    } else {
      const msg = getMessaging();
      const authStatus = await requestPermission(msg);
      const enabled =
        authStatus === AuthorizationStatus.AUTHORIZED ||
        authStatus === AuthorizationStatus.PROVISIONAL;

      if (enabled) {
        console.log('Push Authorization status:', authStatus);
      }
      return enabled;
    }
  } catch (e) {
    console.log('Error requesting permission', e);
    return false;
  }
}

export async function getDeviceToken(): Promise<string | null> {
  try {
    const msg = getMessaging();

    // Register the device with FCM (iOS only)
    if (Platform.OS === 'ios') {
      await registerDeviceForRemoteMessages(msg);
    }

    const token = await getToken(msg);
    return token;
  } catch (error) {
    console.error('Error getting FCM token:', error);
    return null;
  }
}
