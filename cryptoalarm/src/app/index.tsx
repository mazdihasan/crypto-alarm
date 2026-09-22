import { useEffect, useState, useRef } from 'react';
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity,
  FlatList, ActivityIndicator, Alert, ScrollView,
  Modal, Animated, Dimensions, KeyboardAvoidingView,
  Platform, Pressable, Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { GlassCard } from '../components/GlassCard';
import { getOrCreateUserId } from '../utils/user';
import { requestUserPermission, getDeviceToken } from '../utils/push';
import { getAlarms, createAlarm, deleteAlarm, getSymbols, getNotice, registerDevice } from '../utils/api';
import { getMessaging, onMessage } from '@react-native-firebase/messaging';
import { useRouter } from 'expo-router';
import axios from 'axios';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');
const BINANCE_URL = 'https://api.binance.com/api/v3/ticker/price?symbols=';

// ─── HTML & Link Formatter for Sticky Notice ──────────────────────────────────
function renderFormattedNotice(raw: string | null) {
  if (!raw) return null;

  // Normalize markdown links [text](url) to HTML <a href="url">text</a> and <br> to newline
  const processed = raw
    .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2">$1</a>')
    .replace(/<br\s*\/?>/gi, '\n');

  // Tokenize by <a>, <b>, and <strong> tags
  const tagRegex = /(<a\s+(?:[^>]*?\s+)?href=["']([^"']*)["'][^>]*>(.*?)<\/a>)|(<b>(.*?)<\/b>)|(<strong>(.*?)<\/strong>)/gi;

  const nodes: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  const decodeEntities = (str: string) =>
    str
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&nbsp;/g, ' ');

  while ((match = tagRegex.exec(processed)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(decodeEntities(processed.substring(lastIndex, match.index)));
    }

    if (match[1]) {
      // <a> tag
      const href = match[2]?.trim();
      const linkText = decodeEntities(match[3] || href);
      nodes.push(
        <Text
          key={`link-${match.index}`}
          style={s.noticeLink}
          onPress={() => {
            if (href) {
              Linking.openURL(href).catch(() => {
                Alert.alert('Unable to open link', href);
              });
            }
          }}
        >
          {linkText}
        </Text>
      );
    } else if (match[4]) {
      // <b> tag
      nodes.push(
        <Text key={`b-${match.index}`} style={s.noticeBold}>
          {decodeEntities(match[5])}
        </Text>
      );
    } else if (match[6]) {
      // <strong> tag
      nodes.push(
        <Text key={`strong-${match.index}`} style={s.noticeBold}>
          {decodeEntities(match[7])}
        </Text>
      );
    }

    lastIndex = tagRegex.lastIndex;
  }

  if (lastIndex < processed.length) {
    nodes.push(decodeEntities(processed.substring(lastIndex)));
  }

  return nodes;
}

// ─── Dropdown Component ────────────────────────────────────────────────────────
function Dropdown({
  options, value, onChange, label,
}: { options: string[]; value: string; onChange: (v: string) => void; label: string }) {
  const [open, setOpen] = useState(false);
  return (
    <View style={{ zIndex: open ? 100 : 1, marginBottom: 14 }}>
      <Text style={dd.label}>{label}</Text>
      <TouchableOpacity style={dd.trigger} onPress={() => setOpen(!open)} activeOpacity={0.8}>
        <Text style={dd.triggerText}>{value}</Text>
        <Text style={dd.arrow}>{open ? '▲' : '▼'}</Text>
      </TouchableOpacity>
      {open && (
        <View style={dd.menu}>
          {options.map(opt => (
            <TouchableOpacity
              key={opt}
              style={[dd.menuItem, opt === value && dd.menuItemActive]}
              onPress={() => { onChange(opt); setOpen(false); }}
            >
              <Text style={[dd.menuItemText, opt === value && dd.menuItemTextActive]}>{opt}</Text>
              {opt === value && <Text style={dd.check}>✓</Text>}
            </TouchableOpacity>
          ))}
        </View>
      )}
    </View>
  );
}

// ─── Main Screen ───────────────────────────────────────────────────────────────
export default function Home() {
  const router = useRouter();
  const [userId, setUserId] = useState<string | null>(null);
  const [deviceToken, setDeviceToken] = useState<string | null>(null);
  const [alarms, setAlarms] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const [supportedSymbols, setSupportedSymbols] = useState<string[]>(['BTCUSDT', 'XAUTUSDT']);
  const [symbol, setSymbol] = useState('BTCUSDT');
  const [condition, setCondition] = useState('>=');
  const [price, setPrice] = useState('');
  const [livePrices, setLivePrices] = useState<Record<string, number>>({});

  // Server notice state
  const [notice, setNotice] = useState<string | null>(null);
  const [noticeVisible, setNoticeVisible] = useState(true);
  const lastNoticeRef = useRef<string | null>(null);

  // Bottom sheet
  const [sheetVisible, setSheetVisible] = useState(false);
  const slideAnim = useRef(new Animated.Value(SCREEN_HEIGHT)).current;

  const openSheet = () => {
    setSheetVisible(true);
    Animated.spring(slideAnim, { toValue: 0, useNativeDriver: true, bounciness: 4 }).start();
  };
  const closeSheet = () => {
    Animated.timing(slideAnim, { toValue: SCREEN_HEIGHT, useNativeDriver: true, duration: 250 }).start(
      () => setSheetVisible(false)
    );
  };

  useEffect(() => {
    async function init() {
      const uid = await getOrCreateUserId();
      setUserId(uid);
      const hasPermission = await requestUserPermission();
      if (hasPermission) {
        const token = await getDeviceToken();
        setDeviceToken(token);
        if (token) {
          // Register device token on server for broadcasts
          registerDevice(uid, token).catch(() => {});
        }
      }
      await fetchAlarms(uid);
      await fetchNotice();
      try {
        const fetchedSymbols = await getSymbols();
        setSupportedSymbols(fetchedSymbols);
        if (fetchedSymbols.length > 0) setSymbol(fetchedSymbols[0]);
      } catch { /* use defaults */ }
      setLoading(false);

      const msg = getMessaging();
      const unsubscribe = onMessage(msg, async remoteMessage => {
        if (remoteMessage.data?.type === 'alarm') {
          router.push({
            pathname: '/alarm',
            params: {
              symbol: String(remoteMessage.data?.symbol || ''),
              message: String(remoteMessage.data?.body || ''),
            },
          });
          return;
        }
        const title = String(remoteMessage.notification?.title || remoteMessage.data?.title || 'Alert');
        const body = String(remoteMessage.notification?.body || remoteMessage.data?.body || 'New message received.');
        Alert.alert(title, body);
      });
      return unsubscribe;
    }
    const p = init();
    return () => { p.then(unsub => unsub && unsub()); };
  }, []);

  useEffect(() => {
    fetchPrices();
    fetchNotice();
    const interval = setInterval(() => {
      fetchPrices();
      fetchNotice();
    }, 15000);
    return () => clearInterval(interval);
  }, [supportedSymbols]);

  const fetchPrices = async () => {
    if (!supportedSymbols.length) return;
    try {
      const symbolsParam = encodeURIComponent(JSON.stringify(supportedSymbols));
      const res = await axios.get(`${BINANCE_URL}${symbolsParam}`);
      const prices: Record<string, number> = {};
      res.data.forEach((item: any) => { prices[item.symbol] = parseFloat(item.price); });
      setLivePrices(prices);
    } catch { /* silent */ }
  };

  const fetchNotice = async () => {
    try {
      const res = await getNotice();
      const currentText = res?.text || null;
      if (currentText !== lastNoticeRef.current) {
        lastNoticeRef.current = currentText;
        setNotice(currentText);
        if (currentText) {
          setNoticeVisible(true);
        }
      }
    } catch { /* silent */ }
  };

  const fetchAlarms = async (uid: string) => {
    try {
      const data = await getAlarms(uid);
      setAlarms(data);
    } catch { /* silent */ }
  };

  const handleAddAlarm = async () => {
    if (!userId || !deviceToken || !price) {
      Alert.alert('Missing Fields', 'Please enter a target price.');
      return;
    }
    setSubmitting(true);
    try {
      const newAlarm = await createAlarm({ userId, deviceToken, symbol, condition, price: parseFloat(price) });
      setAlarms(prev => [newAlarm, ...prev]);
      setPrice('');
      closeSheet();
    } catch {
      Alert.alert('Error', 'Failed to save alarm. Is the backend running?');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: number) => {
    Alert.alert('Delete Alarm', 'Are you sure?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive', onPress: async () => {
          try {
            await deleteAlarm(id);
            setAlarms(prev => prev.filter(a => a.id !== id));
          } catch {
            Alert.alert('Error', 'Failed to delete alarm');
          }
        }
      }
    ]);
  };

  if (loading) {
    return (
      <View style={s.loadingContainer}>
        <ActivityIndicator color="#208AEF" size="large" />
        <Text style={s.loadingText}>Initializing...</Text>
      </View>
    );
  }

  const isNoticeActive = Boolean(notice && noticeVisible);

  return (
    <SafeAreaView style={s.container}>
      {/* ── Header ── */}
      <View style={s.header}>
        <Text style={s.appName}>CryptoAlarm</Text>
        <Text style={s.appSub}>Price alerts, in real time</Text>
      </View>

      {/* ── Live Prices ── */}
      <GlassCard style={s.pricesCard}>
        <Text style={s.cardLabel}>📈  Live Market</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.pricesRow}>
          {supportedSymbols.map(sym => (
            <View key={sym} style={s.priceCol}>
              <Text style={s.symText}>{sym.replace('USDT', '')}</Text>
              <Text style={s.symFull}>{sym}</Text>
              <Text style={s.priceText}>
                ${livePrices[sym] ? livePrices[sym].toLocaleString() : '—'}
              </Text>
            </View>
          ))}
        </ScrollView>
      </GlassCard>

      {/* ── Active Alarms List ── */}
      <View style={s.listHeader}>
        <Text style={s.listTitle}>Active Alarms</Text>
        <View style={s.badge}>
          <Text style={s.badgeText}>{alarms.length}</Text>
        </View>
      </View>

      <FlatList
        data={alarms}
        keyExtractor={item => item.id.toString()}
        contentContainerStyle={[
          s.listContent,
          isNoticeActive && s.listContentWithNotice,
        ]}
        showsVerticalScrollIndicator={false}
        renderItem={({ item }) => (
          <GlassCard style={s.alarmCard}>
            <View style={s.alarmLeft}>
              <View style={s.alarmBadge}>
                <Text style={s.alarmBadgeText}>{item.symbol.replace('USDT', '')}</Text>
              </View>
              <View>
                <Text style={s.alarmSymbol}>{item.symbol}</Text>
                <Text style={s.alarmCond}>
                  {item.condition === '>=' ? '≥' : '≤'} ${parseFloat(item.price).toLocaleString()}
                </Text>
              </View>
            </View>
            <TouchableOpacity style={s.deleteBtn} onPress={() => handleDelete(item.id)}>
              <Text style={s.deleteIcon}>🗑</Text>
            </TouchableOpacity>
          </GlassCard>
        )}
        ListEmptyComponent={
          <View style={s.emptyContainer}>
            <Text style={s.emptyIcon}>🔕</Text>
            <Text style={s.emptyText}>No alarms yet.</Text>
            <Text style={s.emptySubText}>Tap "Set Alarm" to get started.</Text>
          </View>
        }
      />

      {/* ── Floating Set Alarm Button ── */}
      <TouchableOpacity
        style={[s.fab, isNoticeActive && s.fabWithNotice]}
        onPress={openSheet}
        activeOpacity={0.85}
      >
        <Text style={s.fabIcon}>+</Text>
        <Text style={s.fabText}>Set Alarm</Text>
      </TouchableOpacity>

      {/* ── Sticky Notice Box on Bottom ── */}
      {isNoticeActive && (
        <View style={s.stickyNotice}>
          <View style={s.noticeLeft}>
            <View style={s.noticeBadge}>
              <Text style={s.noticeBadgeIcon}>📢</Text>
            </View>
            <View style={s.noticeContent}>
              <Text style={s.noticeHeader}>ANNOUNCEMENT</Text>
              <Text style={s.noticeBody} numberOfLines={4}>{renderFormattedNotice(notice)}</Text>
            </View>
          </View>
          <TouchableOpacity
            style={s.noticeCloseBtn}
            onPress={() => setNoticeVisible(false)}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            <Text style={s.noticeCloseText}>✕</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* ── Bottom Sheet Modal ── */}
      <Modal visible={sheetVisible} transparent animationType="none" onRequestClose={closeSheet}>
        <Pressable style={s.backdrop} onPress={closeSheet} />
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={s.kvContainer}>
          <Animated.View style={[s.sheet, { transform: [{ translateY: slideAnim }] }]}>
            {/* Handle */}
            <View style={s.sheetHandle} />
            <Text style={s.sheetTitle}>Set New Alarm</Text>

            {/* Symbol Dropdown */}
            <Dropdown
              label="Coin / Symbol"
              options={supportedSymbols}
              value={symbol}
              onChange={setSymbol}
            />

            {/* Condition Toggle */}
            <Text style={s.fieldLabel}>Trigger Condition</Text>
            <View style={s.condRow}>
              <TouchableOpacity
                style={[s.condBtn, condition === '>=' && s.condActive]}
                onPress={() => setCondition('>=')}
              >
                <Text style={[s.condText, condition === '>=' && s.condTextActive]}>≥  Price rises above</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.condBtn, condition === '<=' && s.condActive]}
                onPress={() => setCondition('<=')}
              >
                <Text style={[s.condText, condition === '<=' && s.condTextActive]}>≤  Price drops below</Text>
              </TouchableOpacity>
            </View>

            {/* Price Input */}
            <Text style={s.fieldLabel}>Target Price (USD)</Text>
            <TextInput
              style={s.input}
              placeholder={`e.g. ${livePrices[symbol] ? Math.round(livePrices[symbol]).toLocaleString() : '80000'}`}
              placeholderTextColor="rgba(255,255,255,0.3)"
              keyboardType="numeric"
              value={price}
              onChangeText={setPrice}
            />

            {/* Current Price Hint */}
            {livePrices[symbol] ? (
              <Text style={s.currentPrice}>
                Current {symbol}: ${livePrices[symbol].toLocaleString()}
              </Text>
            ) : null}

            {/* Submit */}
            <TouchableOpacity
              style={[s.submitBtn, submitting && s.submitBtnDisabled]}
              onPress={handleAddAlarm}
              disabled={submitting}
              activeOpacity={0.85}
            >
              {submitting
                ? <ActivityIndicator color="#000" />
                : <Text style={s.submitText}>🔔  Create Alarm</Text>
              }
            </TouchableOpacity>
          </Animated.View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

// ─── Dropdown Styles ────────────────────────────────────────────────────────────
const dd = StyleSheet.create({
  label: { color: 'rgba(255,255,255,0.6)', fontSize: 12, marginBottom: 6, letterSpacing: 0.5, textTransform: 'uppercase' },
  trigger: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.07)', borderRadius: 12,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)',
    paddingHorizontal: 16, paddingVertical: 14,
  },
  triggerText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  arrow: { color: 'rgba(255,255,255,0.5)', fontSize: 12 },
  menu: {
    position: 'absolute', top: 72, left: 0, right: 0,
    backgroundColor: '#1A1A2E', borderRadius: 12,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)',
    overflow: 'hidden', elevation: 20, zIndex: 200,
  },
  menuItem: { paddingHorizontal: 16, paddingVertical: 14, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  menuItemActive: { backgroundColor: 'rgba(32,138,239,0.2)' },
  menuItemText: { color: 'rgba(255,255,255,0.8)', fontSize: 15 },
  menuItemTextActive: { color: '#208AEF', fontWeight: '700' },
  check: { color: '#208AEF', fontWeight: 'bold' },
});

// ─── Main Styles ────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#080B14' },
  loadingContainer: { flex: 1, backgroundColor: '#080B14', justifyContent: 'center', alignItems: 'center', gap: 12 },
  loadingText: { color: 'rgba(255,255,255,0.5)', fontSize: 14 },

  // Header
  header: { paddingHorizontal: 24, paddingTop: 8, paddingBottom: 16 },
  appName: { color: '#fff', fontSize: 28, fontWeight: '800', letterSpacing: -0.5 },
  appSub: { color: 'rgba(255,255,255,0.4)', fontSize: 13, marginTop: 2 },

  // Prices
  pricesCard: { marginHorizontal: 16, marginBottom: 16 },
  cardLabel: { color: 'rgba(255,255,255,0.5)', fontSize: 12, letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 14 },
  pricesRow: { flexDirection: 'row', gap: 24, paddingRight: 8 },
  priceCol: { alignItems: 'flex-start' },
  symText: { color: '#fff', fontSize: 20, fontWeight: '800' },
  symFull: { color: 'rgba(255,255,255,0.3)', fontSize: 11, marginTop: 1 },
  priceText: { color: '#00E676', fontSize: 16, fontWeight: '700', marginTop: 4 },

  // List
  listHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 20, marginBottom: 10 },
  listTitle: { color: '#fff', fontSize: 18, fontWeight: '700' },
  badge: { backgroundColor: '#208AEF', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2 },
  badgeText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  listContent: { paddingHorizontal: 16, paddingBottom: 110 },
  listContentWithNotice: { paddingBottom: 180 },

  alarmCard: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, padding: 16 },
  alarmLeft: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  alarmBadge: { width: 44, height: 44, borderRadius: 12, backgroundColor: 'rgba(32,138,239,0.15)', justifyContent: 'center', alignItems: 'center' },
  alarmBadgeText: { color: '#208AEF', fontWeight: '800', fontSize: 12 },
  alarmSymbol: { color: '#fff', fontSize: 15, fontWeight: '700' },
  alarmCond: { color: '#208AEF', fontSize: 13, marginTop: 3 },
  deleteBtn: { width: 36, height: 36, borderRadius: 10, backgroundColor: 'rgba(255,68,68,0.12)', justifyContent: 'center', alignItems: 'center' },
  deleteIcon: { fontSize: 16 },

  emptyContainer: { alignItems: 'center', paddingTop: 60, gap: 8 },
  emptyIcon: { fontSize: 48 },
  emptyText: { color: 'rgba(255,255,255,0.6)', fontSize: 16, fontWeight: '600' },
  emptySubText: { color: 'rgba(255,255,255,0.3)', fontSize: 13 },

  // FAB
  fab: {
    position: 'absolute', bottom: 24, alignSelf: 'center',
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: '#208AEF', paddingHorizontal: 28, paddingVertical: 16,
    borderRadius: 30, elevation: 12, zIndex: 10,
    shadowColor: '#208AEF', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.5, shadowRadius: 16,
  },
  fabWithNotice: {
    bottom: 92,
  },
  fabIcon: { color: '#fff', fontSize: 22, fontWeight: '300', lineHeight: 24 },
  fabText: { color: '#fff', fontSize: 16, fontWeight: '700', letterSpacing: 0.3 },

  // Sticky Notice Box
  stickyNotice: {
    position: 'absolute',
    bottom: 12,
    left: 14,
    right: 14,
    backgroundColor: 'rgba(16, 22, 38, 0.96)',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(32, 138, 239, 0.35)',
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    elevation: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.5,
    shadowRadius: 12,
    zIndex: 20,
    gap: 10,
  },
  noticeLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  noticeBadge: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: 'rgba(32, 138, 239, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(32, 138, 239, 0.3)',
  },
  noticeBadgeIcon: {
    fontSize: 16,
  },
  noticeContent: {
    flex: 1,
  },
  noticeHeader: {
    color: '#208AEF',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.8,
    marginBottom: 2,
  },
  noticeBody: {
    color: '#E2E8F0',
    fontSize: 13,
    fontWeight: '500',
    lineHeight: 18,
  },
  noticeLink: {
    color: '#38BDF8',
    fontWeight: '700',
    textDecorationLine: 'underline',
  },
  noticeBold: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  noticeCloseBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  noticeCloseText: {
    color: 'rgba(255, 255, 255, 0.5)',
    fontSize: 12,
    fontWeight: '700',
  },

  // Bottom Sheet
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)' },
  kvContainer: { justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: '#0F1323',
    borderTopLeftRadius: 28, borderTopRightRadius: 28,
    padding: 24, paddingBottom: 40,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
  },
  sheetHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.2)', alignSelf: 'center', marginBottom: 20 },
  sheetTitle: { color: '#fff', fontSize: 22, fontWeight: '800', marginBottom: 24 },

  // Form fields
  fieldLabel: { color: 'rgba(255,255,255,0.6)', fontSize: 12, letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 8 },
  condRow: { flexDirection: 'column', gap: 8, marginBottom: 20 },
  condBtn: {
    paddingHorizontal: 16, paddingVertical: 14, borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
  },
  condActive: { backgroundColor: 'rgba(32,138,239,0.18)', borderColor: '#208AEF' },
  condText: { color: 'rgba(255,255,255,0.5)', fontSize: 14, fontWeight: '600' },
  condTextActive: { color: '#208AEF' },

  input: {
    backgroundColor: 'rgba(255,255,255,0.06)', color: '#fff',
    padding: 16, borderRadius: 12, fontSize: 18, fontWeight: '600',
    marginBottom: 8, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)',
  },
  currentPrice: { color: 'rgba(0,230,118,0.7)', fontSize: 12, marginBottom: 20, textAlign: 'right' },

  submitBtn: {
    backgroundColor: '#208AEF', padding: 18, borderRadius: 14,
    alignItems: 'center', marginTop: 4,
    shadowColor: '#208AEF', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.4, shadowRadius: 12,
  },
  submitBtnDisabled: { opacity: 0.6 },
  submitText: { color: '#fff', fontWeight: '800', fontSize: 16, letterSpacing: 0.3 },
});
