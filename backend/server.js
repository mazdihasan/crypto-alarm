const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const axios = require('axios');
const { initializeApp, cert } = require('firebase-admin/app');
const { getMessaging } = require('firebase-admin/messaging');
const { PrismaClient } = require('@prisma/client');
require('dotenv').config();

const SUPPORTED_SYMBOLS = process.env.SUPPORTED_SYMBOLS ? process.env.SUPPORTED_SYMBOLS.split(',') : ['BTCUSDT', 'XAUTUSDT'];

// Initialize Firebase Admin
let messaging;
try {
  const serviceAccount = require('./crypto-alarm-firebase-admin.json');
  const firebaseApp = initializeApp({
    credential: cert(serviceAccount)
  });
  messaging = getMessaging(firebaseApp);
  console.log("Firebase Admin initialized successfully.");
} catch (error) {
  console.error("Failed to initialize Firebase Admin. Make sure crypto-alarm-firebase-admin.json exists.", error);
}

// Initialize Prisma
const prisma = new PrismaClient();

// Initialize Express
const app = express();
app.use(cors());
app.use(bodyParser.json());

// ==========================================
// REST API ROUTES
// ==========================================

// 0. Get supported symbols
app.get('/api/symbols', (req, res) => {
  res.json(SUPPORTED_SYMBOLS);
});

// 1. Create a new alarm
app.post('/api/alarms', async (req, res) => {
  try {
    const { userId, deviceToken, symbol, condition, price } = req.body;

    const alarm = await prisma.alarm.create({
      data: {
        userId,
        deviceToken,
        symbol,
        condition,
        price: parseFloat(price)
      }
    });

    console.log("Created new alarm:", alarm);
    res.status(201).json(alarm);
  } catch (error) {
    console.error("Error creating alarm:", error);
    res.status(500).json({ error: "Failed to create alarm" });
  }
});

// 2. Get all active alarms for a user
app.get('/api/alarms/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const alarms = await prisma.alarm.findMany({
      where: {
        userId,
        active: true
      }
    });

    res.json(alarms);
  } catch (error) {
    console.error("Error fetching alarms:", error);
    res.status(500).json({ error: "Failed to fetch alarms" });
  }
});

// 3. Delete a specific alarm by ID
app.delete('/api/alarms/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await prisma.alarm.delete({
      where: { id: parseInt(id) }
    });

    console.log(`Deleted alarm with ID: ${id}`);
    res.json({ message: "Alarm deleted successfully" });
  } catch (error) {
    console.error("Error deleting alarm:", error);
    res.status(500).json({ error: "Failed to delete alarm" });
  }
});

// ==========================================
// BACKGROUND WORKER (Runs every 30 seconds)
// ==========================================

setInterval(async () => {
  console.log("\n--- Checking Alarms (30s Tick) ---");
  try {
    // 1. Fetch current prices from Binance
    const symbolsParam = encodeURIComponent(JSON.stringify(SUPPORTED_SYMBOLS));
    const response = await axios.get(`https://api.binance.com/api/v3/ticker/price?symbols=${symbolsParam}`);

    const prices = {};
    response.data.forEach(item => {
      prices[item.symbol] = parseFloat(item.price);
    });

    console.log(`Current Prices ->`, prices);

    // 2. Query ALL active alarms from Prisma
    const activeAlarms = await prisma.alarm.findMany({
      where: { active: true }
    });

    console.log(`Found ${activeAlarms.length} active alarms in the database.`);

    // 3. Check conditions for each alarm
    for (const alarm of activeAlarms) {
      const currentPrice = prices[alarm.symbol];

      // Skip if we don't have a price for this symbol
      if (!currentPrice) {
        console.log(`[Warning] No current price data found for symbol: ${alarm.symbol}`);
        continue;
      }

      let conditionMet = false;
      if (alarm.condition === '>=') {
        conditionMet = currentPrice >= alarm.price;
      } else if (alarm.condition === '<=') {
        conditionMet = currentPrice <= alarm.price;
      }

      console.log(`Evaluating Alarm #${alarm.id} (${alarm.symbol} ${alarm.condition} ${alarm.price}) - Current: ${currentPrice} - Met: ${conditionMet}`);

      // 4. Trigger Push Notification and Deactivate Alarm if condition is met
      if (conditionMet) {
        console.log(`\n>>> ALARM TRIGGERED: #${alarm.id} <<<`);

        const message = {
          data: {
            type: 'alarm',
            title: 'Crypto Alarm Triggered! 🚨',
            body: `${alarm.symbol} has reached your target price of $${alarm.price}. Current price is $${currentPrice}.`,
            symbol: alarm.symbol,
            price: alarm.price.toString()
          },
          token: alarm.deviceToken
        };

        try {
          // Send FCM Notification
          const response = await messaging.send(message);
          console.log(`FCM Notification sent successfully for Alarm #${alarm.id}:`, response);

          // Deactivate alarm in database
          await prisma.alarm.update({
            where: { id: alarm.id },
            data: { active: false }
          });
          console.log(`Alarm #${alarm.id} deactivated in database.\n`);
        } catch (fcmError) {
          console.error(`Error sending FCM notification for Alarm #${alarm.id}:`, fcmError.message);
        }
      }
    }
  } catch (error) {
    console.error("Error in background worker loop:", error.message);
  }
}, 30000); // 30000 ms = 30 seconds

// ==========================================
// START SERVER
// ==========================================
const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server is running on port ${PORT} at 0.0.0.0`);
});
