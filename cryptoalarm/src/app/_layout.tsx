import { useEffect } from 'react';
import { Stack, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import notifee, { EventType, AndroidImportance } from '@notifee/react-native';
import { getMessaging, setBackgroundMessageHandler } from '@react-native-firebase/messaging';
import { triggerAlarmNotification } from '../utils/push';

// Register background handler for data payloads
const msg = getMessaging();
setBackgroundMessageHandler(msg, async message => {
  if (message.data?.type === 'broadcast') {
    const channelId = await notifee.createChannel({
      id: 'crypto_notice_channel',
      name: 'Crypto Announcements',
      importance: AndroidImportance.HIGH,
    });
    await notifee.displayNotification({
      title: String(message.data?.title || 'Announcement'),
      body: String(message.data?.body || ''),
      data: message.data,
      android: {
        channelId,
        importance: AndroidImportance.HIGH,
        pressAction: { id: 'default' },
      },
    });
    return;
  }
  await triggerAlarmNotification(message);
});

export default function Layout() {
  const router = useRouter();

  useEffect(() => {
    // Check if app was opened by a full-screen intent or notification tap
    async function checkInitialNotification() {
      const initialNotification = await notifee.getInitialNotification();
      if (initialNotification) {
        if (initialNotification.notification.data?.symbol && initialNotification.notification.data?.type !== 'broadcast') {
          setTimeout(() => {
            router.push({ pathname: '/alarm', params: { symbol: initialNotification.notification.data?.symbol as string } });
          }, 100);
        }
      }
    }
    checkInitialNotification();

    // Listen to foreground events (e.g. user tapped the notification while app was in foreground/background)
    const unsubscribe = notifee.onForegroundEvent(({ type, detail }) => {
      if (type === EventType.PRESS) {
        if (detail.notification?.data?.symbol && detail.notification?.data?.type !== 'broadcast') {
          router.push({ pathname: '/alarm', params: { symbol: detail.notification?.data?.symbol as string } });
        }
      }
    });

    return unsubscribe;
  }, []);

  return (
    <>
      <StatusBar style="light" />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: '#0A0A0A' } }} />
    </>
  );
}
