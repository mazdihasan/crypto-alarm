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
  : ['BTCUSDT', 'XAUTUSDT'];

// ── Firebase Admin ────────────────────────────────────────────────────────────
let messaging;
try {
  const serviceAccount = require('./crypto-alarm-firebase-admin.json');
  const firebaseApp = initializeApp({ credential: cert(serviceAccount) });
  messaging = getMessaging(firebaseApp);
  console.log('Firebase Admin initialized successfully.');
} catch (error) {
  console.error('Failed to initialize Firebase Admin.', error);
}

// ── Prisma ────────────────────────────────────────────────────────────────────
const prisma = new PrismaClient();

// ── Express ───────────────────────────────────────────────────────────────────
const app = express();
app.use(cors());
app.use(bodyParser.json());

// =============================================================================
// REST API ROUTES
// =============================================================================

// ── 0. Supported Symbols ──────────────────────────────────────────────────────
app.get('/api/symbols', (req, res) => {
  res.json(SUPPORTED_SYMBOLS);
});

// ── 1. Register device token (for broadcast) ──────────────────────────────────
app.post('/api/register', async (req, res) => {
  try {
    const { userId, deviceToken } = req.body;
    if (!userId || !deviceToken) return res.status(400).json({ error: 'userId and deviceToken required' });

    await prisma.deviceToken.upsert({
      where: { token: deviceToken },
      update: { userId },
      create: { token: deviceToken, userId },
    });

    res.json({ message: 'Device token registered' });
  } catch (error) {
    console.error('Error registering device token:', error);
    res.status(500).json({ error: 'Failed to register device token' });
  }
});

// ── 2. Create alarm ───────────────────────────────────────────────────────────
app.post('/api/alarms', async (req, res) => {
  try {
    const { userId, deviceToken, symbol, condition, price } = req.body;

    // Also register the token for broadcasts
    await prisma.deviceToken.upsert({
      where: { token: deviceToken },
      update: { userId },
      create: { token: deviceToken, userId },
    });

    const alarm = await prisma.alarm.create({
      data: { userId, deviceToken, symbol, condition, price: parseFloat(price) }
    });

    console.log('Created new alarm:', alarm);
    res.status(201).json(alarm);
  } catch (error) {
    console.error('Error creating alarm:', error);
    res.status(500).json({ error: 'Failed to create alarm' });
  }
});

// ── 3. Get alarms for user ────────────────────────────────────────────────────
app.get('/api/alarms/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const alarms = await prisma.alarm.findMany({ where: { userId, active: true } });
    res.json(alarms);
  } catch (error) {
    console.error('Error fetching alarms:', error);
    res.status(500).json({ error: 'Failed to fetch alarms' });
  }
});

// ── 4. Delete alarm ───────────────────────────────────────────────────────────
app.delete('/api/alarms/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await prisma.alarm.delete({ where: { id: parseInt(id) } });
    console.log(`Deleted alarm with ID: ${id}`);
    res.json({ message: 'Alarm deleted successfully' });
  } catch (error) {
    console.error('Error deleting alarm:', error);
    res.status(500).json({ error: 'Failed to delete alarm' });
  }
});

// ── 5. Get active notice ──────────────────────────────────────────────────────
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

// ── 6. Set notice (admin) ─────────────────────────────────────────────────────
// POST /api/notice  { "text": "Server maintenance at midnight.", "secret": "ADMIN_SECRET" }
app.post('/api/notice', async (req, res) => {
  try {
    const { text, secret } = req.body;
    const adminSecret = process.env.ADMIN_SECRET || 'changeme';

    if (secret !== adminSecret) return res.status(401).json({ error: 'Unauthorized' });

    // Deactivate all previous notices
    await prisma.notice.updateMany({ where: { active: true }, data: { active: false } });

    if (text && text.trim()) {
      const notice = await prisma.notice.create({ data: { text: text.trim(), active: true } });
      console.log('New notice set:', notice.text);
      return res.status(201).json(notice);
    }

    // Empty text = clear notice
    res.json({ message: 'Notice cleared' });
  } catch (error) {
    console.error('Error setting notice:', error);
    res.status(500).json({ error: 'Failed to set notice' });
  }
});

// ── 7. Broadcast push to ALL devices ─────────────────────────────────────────
// POST /api/broadcast  { "title": "...", "body": "...", "secret": "ADMIN_SECRET" }
app.post('/api/broadcast', async (req, res) => {
  try {
    const { title, body, secret } = req.body;
    const adminSecret = process.env.ADMIN_SECRET || 'changeme';

    if (secret !== adminSecret) return res.status(401).json({ error: 'Unauthorized' });
    if (!title || !body) return res.status(400).json({ error: 'title and body are required' });

    // Fetch all unique device tokens
    const deviceTokens = await prisma.deviceToken.findMany();
    if (!deviceTokens.length) return res.json({ message: 'No registered devices', sent: 0 });

    const tokens = deviceTokens.map(d => d.token);
    console.log(`Broadcasting to ${tokens.length} devices...`);

    // FCM multicast (max 500 per batch)
    const BATCH = 500;
    let successCount = 0;
    let failureCount = 0;
    const deadTokens = [];

    for (let i = 0; i < tokens.length; i += BATCH) {
      const batch = tokens.slice(i, i + BATCH);
      const response = await messaging.sendEachForMulticast({
        tokens: batch,
        notification: { title, body },
        data: {
          title: String(title),
          body: String(body),
          type: 'broadcast',
        },
        android: { priority: 'high' },
      });

      successCount += response.successCount;
      failureCount += response.failureCount;

      // Collect invalid tokens to clean up
      response.responses.forEach((r, idx) => {
        if (!r.success) {
          const code = r.error?.code;
          if (code === 'messaging/invalid-registration-token' ||
              code === 'messaging/registration-token-not-registered') {
            deadTokens.push(batch[idx]);
          }
        }
      });
    }

    // Clean up dead tokens
    if (deadTokens.length) {
      await prisma.deviceToken.deleteMany({ where: { token: { in: deadTokens } } });
      console.log(`Removed ${deadTokens.length} dead tokens.`);
    }

    console.log(`Broadcast complete. Success: ${successCount}, Failed: ${failureCount}`);
    res.json({ sent: successCount, failed: failureCount, totalDevices: tokens.length });
  } catch (error) {
    console.error('Error broadcasting notification:', error);
    res.status(500).json({ error: 'Failed to broadcast notification' });
  }
});

// =============================================================================
// BACKGROUND WORKER — Checks alarms every 30 seconds
// =============================================================================

setInterval(async () => {
  console.log('\n--- Checking Alarms (30s Tick) ---');
  try {
    const symbolsParam = encodeURIComponent(JSON.stringify(SUPPORTED_SYMBOLS));
    const response = await axios.get(`https://api.binance.com/api/v3/ticker/price?symbols=${symbolsParam}`);

    const prices = {};
    response.data.forEach(item => { prices[item.symbol] = parseFloat(item.price); });
    console.log('Current Prices ->', prices);

    const activeAlarms = await prisma.alarm.findMany({ where: { active: true } });
    console.log(`Found ${activeAlarms.length} active alarms in the database.`);

    for (const alarm of activeAlarms) {
      const currentPrice = prices[alarm.symbol];
      if (!currentPrice) {
        console.log(`[Warning] No price data for symbol: ${alarm.symbol}`);
        continue;
      }

      let conditionMet = false;
      if (alarm.condition === '>=') conditionMet = currentPrice >= alarm.price;
      else if (alarm.condition === '<=') conditionMet = currentPrice <= alarm.price;

      console.log(`Alarm #${alarm.id} (${alarm.symbol} ${alarm.condition} ${alarm.price}) | Current: ${currentPrice} | Met: ${conditionMet}`);

      if (conditionMet) {
        console.log(`\n>>> ALARM TRIGGERED: #${alarm.id} <<<`);
        const message = {
          data: {
            type: 'alarm',
            title: 'Crypto Alarm Triggered! 🚨',
            body: `${alarm.symbol} has reached your target of $${alarm.price}. Current: $${currentPrice}`,
            symbol: alarm.symbol,
            price: alarm.price.toString()
          },
          token: alarm.deviceToken
        };

        try {
          const fcmResponse = await messaging.send(message);
          console.log(`FCM sent for Alarm #${alarm.id}:`, fcmResponse);
          await prisma.alarm.update({ where: { id: alarm.id }, data: { active: false } });
          console.log(`Alarm #${alarm.id} deactivated.\n`);
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
  console.log(`Server running on port ${PORT}`);
});
