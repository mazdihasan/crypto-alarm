# Crypto Alarm App

A full-stack application featuring a Node.js/Express backend that tracks cryptocurrency prices via the Binance API, and a React Native (Expo) mobile app that allows users to set target price alarms with push notifications.

## Features
- Dynamic symbol support (e.g., BTC, ETH, BNB, GOLD).
- Real-time Binance API integration for live prices.
- Custom price threshold alarms (`>=` and `<=`).
- Push notifications via Firebase Cloud Messaging (FCM).

---

## 1. Backend Setup

The backend is built with Node.js, Express, and Prisma. It runs a background worker every 30 seconds to fetch live prices and evaluate alarms.

### Prerequisites
- Node.js installed.
- A Firebase Service Account Key for push notifications.

### Installation
1. Navigate to the backend directory:
   ```bash
   cd backend
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Environment Configuration:
   - Copy `.env-example` to `.env`:
     ```bash
     cp .env-example .env
     ```
   - Customize your `SUPPORTED_SYMBOLS` in `.env` if desired.
4. Firebase Configuration:
   - Place your Firebase service account JSON file in the `backend` directory and name it exactly `crypto-alarm-firebase-admin.json`.
5. Database Setup (Prisma & SQLite):
   - Push the schema to the database:
     ```bash
     npx prisma db push
     ```
6. Start the Server:
   ```bash
   npm start
   ```
   (Alternatively, use `npm run dev` for nodemon development).

---

## 2. Mobile App Setup

The mobile application is built with Expo and React Native.

### Prerequisites
- Node.js installed.
- Expo CLI.

### Installation
1. Navigate to the mobile app directory:
   ```bash
   cd cryptoalarm
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Update Backend URL (Optional depending on your setup):
   - In `cryptoalarm/src/utils/api.ts`, update the `BASE_URL` to point to your backend server IP if running on a physical device or a separate emulator network. (e.g. `http://192.168.x.x:3000/api`)
4. Start the Expo Development Server:
   ```bash
   npx expo start
   ```
5. Scan the QR code using the Expo Go app on your phone, or press `a` / `i` to open in an emulator.
