import AsyncStorage from '@react-native-async-storage/async-storage';
import uuid from 'react-native-uuid';

const USER_ID_KEY = 'cryptoalarm_user_id';

export const getOrCreateUserId = async (): Promise<string> => {
  try {
    let userId = await AsyncStorage.getItem(USER_ID_KEY);
    if (!userId) {
      userId = uuid.v4() as string;
      await AsyncStorage.setItem(USER_ID_KEY, userId);
    }
    return userId;
  } catch (e) {
    console.error('Failed to get or create user ID', e);
    // Fallback if async storage fails
    return uuid.v4() as string;
  }
};
