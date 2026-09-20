import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, FlatList, ActivityIndicator, Alert, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { GlassCard } from '../components/GlassCard';
import { getOrCreateUserId } from '../utils/user';
import { requestUserPermission, getDeviceToken } from '../utils/push';
import { getAlarms, createAlarm, deleteAlarm, getSymbols } from '../utils/api';
import { getMessaging, onMessage } from '@react-native-firebase/messaging';
import axios from 'axios';

const BINANCE_URL = 'https://api.binance.com/api/v3/ticker/price?symbols=';

export default function Home() {
  const [userId, setUserId] = useState<string | null>(null);
  const [deviceToken, setDeviceToken] = useState<string | null>(null);
  const [alarms, setAlarms] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [supportedSymbols, setSupportedSymbols] = useState<string[]>(['BTCUSDT', 'XAUTUSDT']);
  const [symbol, setSymbol] = useState('BTCUSDT');
  const [condition, setCondition] = useState('>=');
  const [price, setPrice] = useState('');
  
  const [livePrices, setLivePrices] = useState<Record<string, number>>({ BTCUSDT: 0, XAUTUSDT: 0 });

  useEffect(() => {
    async function init() {
      const uid = await getOrCreateUserId();
      setUserId(uid);
      
      const hasPermission = await requestUserPermission();
      if (hasPermission) {
        const token = await getDeviceToken();
        setDeviceToken(token);
      }
      
      await fetchAlarms(uid);
      
      let fetchedSymbols = ['BTCUSDT', 'XAUTUSDT'];
      try {
        fetchedSymbols = await getSymbols();
        setSupportedSymbols(fetchedSymbols);
        if (fetchedSymbols.length > 0) {
          setSymbol(fetchedSymbols[0]);
        }
      } catch (e) {
        console.log('Failed to fetch symbols from backend, using defaults');
      }

      setLoading(false);
      
      const msg = getMessaging();
      const unsubscribe = onMessage(msg, async remoteMessage => {
        Alert.alert(
          remoteMessage.notification?.title || 'Alert',
          remoteMessage.notification?.body || 'New message'
        );
      });
      return unsubscribe;
    }
    const unsubscribePush = init();
    
  useEffect(() => {
    fetchPrices();
    const priceInterval = setInterval(fetchPrices, 10000);
    return () => clearInterval(priceInterval);
  }, [supportedSymbols]);

  const fetchPrices = async () => {
    if (supportedSymbols.length === 0) return;
    try {
      const symbolsParam = encodeURIComponent(JSON.stringify(supportedSymbols));
      const res = await axios.get(`${BINANCE_URL}${symbolsParam}`);
      const newPrices: Record<string, number> = {};
      res.data.forEach((item: any) => {
        newPrices[item.symbol] = parseFloat(item.price);
      });
      setLivePrices(newPrices);
    } catch (e) {
      console.log('Error fetching prices');
    }
  };

  const fetchAlarms = async (uid: string) => {
    try {
      const data = await getAlarms(uid);
      setAlarms(data);
    } catch (e) {
      console.error('Failed to fetch alarms');
    }
  };

  const handleAddAlarm = async () => {
    if (!userId || !deviceToken || !price) {
      Alert.alert('Error', 'Missing fields or push token not available.');
      return;
    }
    
    try {
      const newAlarm = await createAlarm({
        userId,
        deviceToken,
        symbol,
        condition,
        price: parseFloat(price)
      });
      setAlarms([...alarms, newAlarm]);
      setPrice('');
    } catch (e) {
      Alert.alert('Error', 'Failed to save alarm (Ensure backend is running and URL is correct)');
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await deleteAlarm(id);
      setAlarms(alarms.filter(a => a.id !== id));
    } catch (e) {
      Alert.alert('Error', 'Failed to delete alarm');
    }
  };

  if (loading) {
    return <View style={styles.loadingContainer}><ActivityIndicator color="#00FF66" size="large" /></View>;
  }

  return (
    <SafeAreaView style={styles.container}>
      <GlassCard style={styles.headerCard}>
        <Text style={styles.headerTitle}>Live Market</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.pricesRow}>
          {supportedSymbols.map(sym => (
            <View key={sym} style={styles.priceCol}>
              <Text style={styles.symbolText}>{sym}</Text>
              <Text style={styles.priceText}>${livePrices[sym]?.toLocaleString() || '0'}</Text>
            </View>
          ))}
        </ScrollView>
      </GlassCard>

      <GlassCard style={styles.formCard}>
        <Text style={styles.sectionTitle}>Set New Alarm</Text>
        
        <View style={{ marginBottom: 15 }}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10 }}>
            {supportedSymbols.map(sym => (
              <TouchableOpacity 
                key={sym}
                style={[styles.toggleBtn, symbol === sym && styles.toggleActive]}
                onPress={() => setSymbol(sym)}
              >
                <Text style={styles.toggleText}>{sym}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        <View style={styles.row}>
          <TouchableOpacity 
            style={[styles.toggleBtn, condition === '>=' && styles.toggleActive]}
            onPress={() => setCondition('>=')}
          >
            <Text style={styles.toggleText}>≥</Text>
          </TouchableOpacity>
          <TouchableOpacity 
            style={[styles.toggleBtn, condition === '<=' && styles.toggleActive]}
            onPress={() => setCondition('<=')}
          >
            <Text style={styles.toggleText}>≤</Text>
          </TouchableOpacity>
        </View>

        <TextInput
          style={styles.input}
          placeholder="Target Price (e.g. 80000)"
          placeholderTextColor="rgba(255,255,255,0.5)"
          keyboardType="numeric"
          value={price}
          onChangeText={setPrice}
        />
        
        <TouchableOpacity style={styles.addBtn} onPress={handleAddAlarm}>
          <Text style={styles.addBtnText}>Create Alarm</Text>
        </TouchableOpacity>
      </GlassCard>

      <Text style={[styles.sectionTitle, { marginLeft: 20, marginTop: 10 }]}>Active Alarms</Text>
      <FlatList
        data={alarms}
        keyExtractor={item => item.id.toString()}
        contentContainerStyle={{ padding: 20 }}
        renderItem={({ item }) => (
          <GlassCard style={styles.alarmCard}>
            <View>
              <Text style={styles.alarmSymbol}>{item.symbol}</Text>
              <Text style={styles.alarmCondition}>{item.condition} ${item.price}</Text>
            </View>
            <TouchableOpacity style={styles.deleteBtn} onPress={() => handleDelete(item.id)}>
              <Text style={styles.deleteText}>Delete</Text>
            </TouchableOpacity>
          </GlassCard>
        )}
        ListEmptyComponent={<Text style={styles.emptyText}>No active alarms.</Text>}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0A0A0A' },
  loadingContainer: { flex: 1, backgroundColor: '#0A0A0A', justifyContent: 'center', alignItems: 'center' },
  headerCard: { margin: 20, marginTop: 40, backgroundColor: 'rgba(255,255,255,0.08)' },
  headerTitle: { color: 'rgba(255,255,255,0.7)', fontSize: 14, textTransform: 'uppercase', marginBottom: 10, letterSpacing: 2 },
  pricesRow: { flexDirection: 'row', gap: 20 },
  priceCol: { marginRight: 20 },
  symbolText: { color: '#fff', fontSize: 18, fontWeight: 'bold' },
  priceText: { color: '#00FF66', fontSize: 16, marginTop: 5 },
  formCard: { marginHorizontal: 20, marginBottom: 20 },
  sectionTitle: { color: '#fff', fontSize: 18, fontWeight: 'bold', marginBottom: 15 },
  row: { flexDirection: 'row', marginBottom: 15, gap: 10 },
  toggleBtn: { paddingHorizontal: 20, paddingVertical: 12, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.1)', alignItems: 'center' },
  toggleActive: { backgroundColor: '#208AEF' },
  toggleText: { color: '#fff', fontWeight: '600' },
  input: { backgroundColor: 'rgba(255,255,255,0.05)', color: '#fff', padding: 15, borderRadius: 10, fontSize: 16, marginBottom: 15, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
  addBtn: { backgroundColor: '#00FF66', padding: 15, borderRadius: 10, alignItems: 'center' },
  addBtnText: { color: '#000', fontWeight: 'bold', fontSize: 16 },
  alarmCard: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15, padding: 15 },
  alarmSymbol: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
  alarmCondition: { color: '#208AEF', fontSize: 14, marginTop: 5 },
  deleteBtn: { backgroundColor: 'rgba(255,0,0,0.2)', paddingHorizontal: 15, paddingVertical: 8, borderRadius: 8 },
  deleteText: { color: '#FF4444', fontWeight: 'bold' },
  emptyText: { color: 'rgba(255,255,255,0.5)', textAlign: 'center', marginTop: 20 }
});
