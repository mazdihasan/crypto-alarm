# Admin API Guide — Notice & Broadcast Notifications

This guide explains how to manage the **sticky notice banner** and **broadcast push notifications** to all devices.

The admin endpoints are protected by `ADMIN_SECRET` defined in `backend/.env`.

---

## 1. Set or Update Sticky Notice

Updates the notice banner displayed at the bottom of all user devices. The app automatically polls and updates in real time.

- **URL:** `POST https://cryptoalarm-server.mazdi.dev/api/notice`
  *(or `http://localhost:3000/api/notice` for local test)*
- **Headers:** `Content-Type: application/json`
- **Body:**
```json
{
  "text": "🚨 Maintenance scheduled tonight at 12:00 AM UTC.",
  "secret": "changeme_use_a_secure_password_here"
}
```

### Example with HTML Link:
You can use standard HTML links `<a href="...">text</a>`, bold `<b>`, or line breaks `<br>`:

```bash
curl -X POST https://cryptoalarm-server.mazdi.dev/api/notice \
  -H "Content-Type: application/json" \
  -d '{
    "text": "Join our official <a href=\"https://t.me/yourchannel\">Telegram Group</a> for live signals!",
    "secret": "changeme_use_a_secure_password_here"
  }'
```

*(Markdown links like `[Telegram Group](https://t.me/yourchannel)` and `<b>bold</b>` tags are also supported!)*

---

## 2. Clear Sticky Notice

To remove the notice from user screens, send empty text or whitespace:

```bash
curl -X POST https://cryptoalarm-server.mazdi.dev/api/notice \
  -H "Content-Type: application/json" \
  -d "{\"text\": \"\", \"secret\": \"changeme_use_a_secure_password_here\"}"
```

---

## 3. Check Current Active Notice (Public)

- **URL:** `GET https://cryptoalarm-server.mazdi.dev/api/notice`

```bash
curl https://cryptoalarm-server.mazdi.dev/api/notice
```

**Response:**
```json
{
  "text": "🚨 Bitcoin surges past $90,000!"
}
```

---

## 4. Broadcast Push Notification to ALL Devices

Sends a high-priority push notification to all registered devices using Firebase Cloud Messaging (FCM).

- **URL:** `POST https://cryptoalarm-server.mazdi.dev/api/broadcast`
- **Headers:** `Content-Type: application/json`
- **Body:**
```json
{
  "title": "Crypto Market Alert 🚀",
  "body": "Major volatility detected across BTC and ETH. Check your alarms!",
  "secret": "changeme_use_a_secure_password_here"
}
```

### Example (cURL):
```bash
curl -X POST https://cryptoalarm-server.mazdi.dev/api/broadcast \
  -H "Content-Type: application/json" \
  -d "{\"title\": \"Crypto Market Alert 🚀\", \"body\": \"Major volatility detected!\", \"secret\": \"changeme_use_a_secure_password_here\"}"
```

**Response:**
```json
{
  "sent": 15,
  "failed": 0,
  "totalDevices": 15
}
```
*(Dead or uninstalled tokens are automatically pruned from the database).*
