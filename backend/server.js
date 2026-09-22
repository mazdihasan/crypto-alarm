const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const axios = require('axios');
const { initializeApp, cert } = require('firebase-admin/app');
const { getMessaging } = require('firebase-admin/messaging');
const { PrismaClient } = require('@prisma/client');
require('dotenv').config();

const SUPPORTED_SYMBOLS = process.env.SUPPORTED_SYMBOLS
  ? process.env.SUPPORTED_SYMBOLS.split(',')
  : ['BTCUSDT', 'XAUTUSDT', 'ETHUSDT', 'BNBUSDT'];

// ── Firebase Admin ────────────────────────────────────────────────────────────
let messaging;
try {
  const serviceAccount = require('./crypto-alarm-firebase-admin.json');
  const firebaseApp = initializeApp({
    credential: cert(serviceAccount),
  });
  messaging = getMessaging(firebaseApp);
  console.log('Firebase Admin initialized successfully.');
} catch (error) {
  console.error('Failed to initialize Firebase Admin. Make sure crypto-alarm-firebase-admin.json exists.', error);
}

// ── Prisma ────────────────────────────────────────────────────────────────────
const prisma = new PrismaClient();

// ── Express ───────────────────────────────────────────────────────────────────
const app = express();
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// =============================================================================
// PUBLIC & APP ROUTES
// =============================================================================

// ── 0. Supported Symbols ──────────────────────────────────────────────────────
app.get('/api/symbols', (req, res) => {
  res.json(SUPPORTED_SYMBOLS);
});

// ── 1. Register Device Token ──────────────────────────────────────────────────
app.post('/api/register', async (req, res) => {
  try {
    const { userId, deviceToken } = req.body;
    if (!userId || !deviceToken) {
      return res.status(400).json({ error: 'userId and deviceToken are required' });
    }

    await prisma.deviceToken.upsert({
      where: { token: deviceToken },
      update: { userId },
      create: { token: deviceToken, userId },
    });

    res.json({ message: 'Device token registered successfully' });
  } catch (error) {
    console.error('Error registering device token:', error);
    res.status(500).json({ error: 'Failed to register device token' });
  }
});

// ── 2. Create Alarm ───────────────────────────────────────────────────────────
app.post('/api/alarms', async (req, res) => {
  try {
    const { userId, deviceToken, symbol, condition, price } = req.body;

    if (!userId || !deviceToken || !symbol || !condition || !price) {
      return res.status(400).json({ error: 'Missing required alarm fields' });
    }

    // Also ensure the device token is recorded for broadcasts
    await prisma.deviceToken.upsert({
      where: { token: deviceToken },
      update: { userId },
      create: { token: deviceToken, userId },
    }).catch(err => console.error('Token registration error in createAlarm:', err.message));

    const alarm = await prisma.alarm.create({
      data: {
        userId,
        deviceToken,
        symbol,
        condition,
        price: parseFloat(price),
      },
    });

    console.log('Created new alarm:', alarm);
    res.status(201).json(alarm);
  } catch (error) {
    console.error('Error creating alarm:', error);
    res.status(500).json({ error: 'Failed to create alarm' });
  }
});

// ── 3. Get Active Alarms for User ─────────────────────────────────────────────
app.get('/api/alarms/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const alarms = await prisma.alarm.findMany({
      where: { userId, active: true },
      orderBy: { createdAt: 'desc' },
    });
    res.json(alarms);
  } catch (error) {
    console.error('Error fetching alarms:', error);
    res.status(500).json({ error: 'Failed to fetch alarms' });
  }
});

// ── 4. Delete Alarm ───────────────────────────────────────────────────────────
app.delete('/api/alarms/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await prisma.alarm.delete({
      where: { id: parseInt(id) },
    });
    console.log(`Deleted alarm with ID: ${id}`);
    res.json({ message: 'Alarm deleted successfully' });
  } catch (error) {
    console.error('Error deleting alarm:', error);
    res.status(500).json({ error: 'Failed to delete alarm' });
  }
});

// ── 5. Get Active Notice (Public) ─────────────────────────────────────────────
app.get('/api/notice', async (req, res) => {
  try {
    const notice = await prisma.notice.findFirst({
      where: { active: true },
      orderBy: { createdAt: 'desc' },
    });
    res.json({ text: notice ? notice.text : null });
  } catch (error) {
    console.error('Error fetching notice:', error);
    res.status(500).json({ error: 'Failed to fetch notice' });
  }
});

// =============================================================================
// ADMIN ROUTES (Protected by ADMIN_SECRET)
// =============================================================================

// Helper check for admin secret
function checkAdminAuth(req, res) {
  const authHeader = req.headers['authorization'];
  let bearerSecret = '';
  if (authHeader && authHeader.startsWith('Bearer ')) {
    bearerSecret = authHeader.substring(7).trim();
  }

  const secret = (
    req.body?.secret ||
    req.query?.secret ||
    req.headers['x-admin-secret'] ||
    bearerSecret ||
    ''
  ).toString().trim();

  const adminSecret = (process.env.ADMIN_SECRET || 'changeme').trim();

  if (!secret || secret !== adminSecret) {
    console.warn(`[Admin Auth Failed] ${req.method} ${req.originalUrl} | Received: "${secret ? '***' : '(empty)'}", Expected: "${adminSecret ? '***' : '(empty)'}"`);
    res.status(401).json({
      error: 'Unauthorized: invalid or missing admin secret',
      hint: 'Include "secret": "changeme_use_a_secure_password_here" in your JSON/form body, as a query param ?secret=..., or as Authorization: Bearer <secret>',
    });
    return false;
  }
  return true;
}

// ── 6. Set / Clear Notice (Admin) ─────────────────────────────────────────────
// POST /api/notice  { "text": "...", "secret": "..." }
app.post('/api/notice', async (req, res) => {
  try {
    if (!checkAdminAuth(req, res)) return;

    const text = req.body?.text !== undefined ? req.body.text : req.query?.text;

    // Deactivate existing notices
    await prisma.notice.updateMany({
      where: { active: true },
      data: { active: false },
    });

    if (text && String(text).trim()) {
      const notice = await prisma.notice.create({
        data: {
          text: String(text).trim(),
          active: true,
        },
      });
      console.log('New sticky notice set:', notice.text);
      return res.status(201).json(notice);
    }

    console.log('Sticky notice cleared.');
    res.json({ message: 'Notice cleared successfully' });
  } catch (error) {
    console.error('Error setting notice:', error);
    res.status(500).json({ error: 'Failed to set notice' });
  }
});

// ── 7. Broadcast Push Notification to ALL Devices (Admin) ─────────────────────
// POST /api/broadcast  { "title": "...", "body": "...", "playAlarm": true, "secret": "..." }
app.post('/api/broadcast', async (req, res) => {
  try {
    if (!checkAdminAuth(req, res)) return;

    const title = req.body?.title || req.query?.title;
    const body = req.body?.body || req.query?.body;

    // Check if alarm mode is requested
    const playAlarm = req.body?.playAlarm === true ||
      req.body?.isAlarm === true ||
      req.body?.playAlarm === 'true' ||
      req.query?.playAlarm === 'true' ||
      req.query?.isAlarm === 'true';

    const symbol = req.body?.symbol || req.query?.symbol || 'BROADCAST ALERT';

    if (!title || !body) {
      return res.status(400).json({ error: 'title and body are required' });
    }

    if (!messaging) {
      return res.status(500).json({ error: 'Firebase messaging not initialized on server' });
    }

    const deviceTokens = await prisma.deviceToken.findMany();
    if (!deviceTokens.length) {
      return res.json({ message: 'No registered devices found', sent: 0 });
    }

    const tokens = deviceTokens.map(d => d.token);
    console.log(`Broadcasting to ${tokens.length} devices (Alarm Mode: ${playAlarm ? 'ON 🚨' : 'OFF'})...`);

    const BATCH_SIZE = 500;
    let successCount = 0;
    let failureCount = 0;
    const deadTokens = [];

    for (let i = 0; i < tokens.length; i += BATCH_SIZE) {
      const batch = tokens.slice(i, i + BATCH_SIZE);

      // If playAlarm is true, send data-only high-priority payload to wake device and ring continuous alarm
      const messagePayload = playAlarm
        ? {
          tokens: batch,
          data: {
            type: 'alarm',
            title: String(title),
            body: String(body),
            symbol: String(symbol),
          },
          android: { priority: 'high' },
        }
        : {
          tokens: batch,
          notification: { title, body },
          data: {
            type: 'broadcast',
            title: String(title),
            body: String(body),
          },
          android: { priority: 'high' },
        };

      const response = await messaging.sendEachForMulticast(messagePayload);

      successCount += response.successCount;
      failureCount += response.failureCount;

      response.responses.forEach((r, idx) => {
        if (!r.success) {
          const code = r.error?.code;
          if (
            code === 'messaging/invalid-registration-token' ||
            code === 'messaging/registration-token-not-registered'
          ) {
            deadTokens.push(batch[idx]);
          }
        }
      });
    }

    // Remove invalid/unregistered tokens from DB
    if (deadTokens.length) {
      await prisma.deviceToken.deleteMany({
        where: { token: { in: deadTokens } },
      });
      console.log(`Pruned ${deadTokens.length} dead device tokens.`);
    }

    console.log(`Broadcast completed. Sent: ${successCount}, Failed: ${failureCount}, Alarm Mode: ${playAlarm}`);
    res.json({
      sent: successCount,
      failed: failureCount,
      totalDevices: tokens.length,
      prunedTokens: deadTokens.length,
      alarmTriggered: playAlarm,
    });
  } catch (error) {
    console.error('Error broadcasting notification:', error);
    res.status(500).json({ error: 'Failed to broadcast notification' });
  }
});

// ── 8. System & Admin Stats (Admin) ───────────────────────────────────────────
// POST /api/stats  { "secret": "..." }
app.post('/api/stats', async (req, res) => {
  try {
    if (!checkAdminAuth(req, res)) return;

    const [activeAlarms, totalDevices, activeNotice] = await Promise.all([
      prisma.alarm.count({ where: { active: true } }),
      prisma.deviceToken.count(),
      prisma.notice.findFirst({ where: { active: true }, orderBy: { createdAt: 'desc' } }),
    ]);

    res.json({
      activeAlarms,
      registeredDevices: totalDevices,
      activeNotice: activeNotice ? activeNotice.text : null,
      supportedSymbols: SUPPORTED_SYMBOLS,
    });
  } catch (error) {
    console.error('Error fetching admin stats:', error);
    res.status(500).json({ error: 'Failed to fetch admin stats' });
  }
});

// =============================================================================
// BACKGROUND WORKER (Runs every 30 seconds)
// =============================================================================

setInterval(async () => {
  //console.log('\n--- Checking Alarms (30s Tick) ---');
  try {
    // 1. Fetch current prices from Binance
    const symbolsParam = encodeURIComponent(JSON.stringify(SUPPORTED_SYMBOLS));
    const response = await axios.get(`https://api.binance.com/api/v3/ticker/price?symbols=${symbolsParam}`);

    const prices = {};
    response.data.forEach(item => {
      prices[item.symbol] = parseFloat(item.price);
    });
    //console.log('Current Prices ->', prices);

    // 2. Query ALL active alarms
    const activeAlarms = await prisma.alarm.findMany({
      where: { active: true },
    });
    //console.log(`Found ${activeAlarms.length} active alarms in database.`);

    // 3. Evaluate each alarm
    for (const alarm of activeAlarms) {
      const currentPrice = prices[alarm.symbol];
      if (!currentPrice) {
        console.log(`[Warning] No price data for symbol: ${alarm.symbol}`);
        continue;
      }

      let conditionMet = false;
      if (alarm.condition === '>=') {
        conditionMet = currentPrice >= alarm.price;
      } else if (alarm.condition === '<=') {
        conditionMet = currentPrice <= alarm.price;
      }

      //console.log(`Alarm #${alarm.id} (${alarm.symbol} ${alarm.condition} ${alarm.price}) | Current: ${currentPrice} | Met: ${conditionMet}`);

      if (conditionMet && messaging) {
        //console.log(`\n>>> ALARM TRIGGERED: #${alarm.id} <<<`);

        const message = {
          data: {
            type: 'alarm',
            title: 'Crypto Alarm Triggered! 🚨',
            body: `${alarm.symbol} reached target of $${alarm.price}. Current: $${currentPrice}`,
            symbol: alarm.symbol,
            price: alarm.price.toString(),
          },
          android: {
            priority: 'high',
          },
          token: alarm.deviceToken,
        };

        try {
          const fcmResponse = await messaging.send(message);
          //console.log(`FCM sent for Alarm #${alarm.id}:`, fcmResponse);

          await prisma.alarm.update({
            where: { id: alarm.id },
            data: { active: false },
          });
          //console.log(`Alarm #${alarm.id} deactivated.\n`);
        } catch (fcmError) {
          console.error(`FCM error for Alarm #${alarm.id}:`, fcmError.message);
        }
      }
    }
  } catch (error) {
    console.error('Error in background worker:', error.message);
  }
}, 30000);

// =============================================================================
// START SERVER
// =============================================================================
const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server is running on port ${PORT} at 0.0.0.0`);
});
