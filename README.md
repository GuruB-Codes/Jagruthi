# 🛡️ Jagruthi – Intelligent Women Safety System

> **A multi-layer emergency communication and safety system designed to protect women during critical situations — even when internet connectivity is unavailable.**

## 🚨 About Jagruthi

**Jagruthi** is an IoT-based women safety solution that combines a **smart wearable device** with a **mobile application** to provide fast emergency communication and location-based safety features.

The system is designed with a **three-layer communication architecture**, allowing emergency alerts to be transmitted even when conventional internet connectivity is unavailable.

---

## 🎯 Problem Statement

Women may face emergency situations where:

- 📵 A smartphone is inaccessible or unavailable
- 🌐 Internet connectivity is poor or unavailable
- 📶 Cellular networks are unavailable
- 🆘 Immediate emergency assistance is required

Traditional safety applications mainly depend on smartphones and internet connectivity.

**Jagruthi addresses this limitation by providing multiple communication fallback mechanisms.**

---

## 💡 Key Features

### 🆘 Emergency SOS

The wearable device contains a physical **SOS button**.

When activated:

1. Emergency mode is triggered.
2. The user's location is obtained using GPS.
3. The system attempts communication through the available network layer.
4. Emergency information is sent to predefined contacts.

### 📍 Location Tracking

Jagruthi uses GPS to obtain the user's location during an emergency.

The location can be used to:

- Identify the user's current position
- Send emergency location information
- Support route and safety monitoring

### 🛣️ Safe Route Monitoring

The mobile application provides route-based safety monitoring to help users stay aware of their journey.

### 🔔 Automatic Safety Alerts

The system can periodically check the user's safety and provide alerts when required.

### 📡 Multi-Layer Emergency Communication

Jagruthi uses three communication layers:

| Layer | Technology | Purpose |
|------|------------|---------|
| Layer 1 | 🌐 Internet / 4G / 5G | Primary communication |
| Layer 2 | 📱 GSM / SMS | Communication when internet is unavailable |
| Layer 3 | 📡 LoRa | Emergency communication when cellular network is unavailable |

This architecture improves the reliability of emergency communication.

---

# 🏗️ System Architecture

```text
                 ┌──────────────────────┐
                 │     JAGRUTHI APP     │
                 │   Mobile Application │
                 └──────────┬───────────┘
                            │
                            ▼
                 ┌──────────────────────┐
                 │     SUPABASE         │
                 │ Authentication/DB    │
                 └──────────────────────┘


        ┌─────────────────────────────────────┐
        │          JAGRUTHI WEARABLE          │
        │                                     │
        │   ┌───────────┐    ┌────────────┐   │
        │   │ SOS Button│    │   GPS      │   │
        │   └─────┬─────┘    └─────┬──────┘   │
        │         │                 │          │
        │         └────────┬────────┘          │
        │                  ▼                   │
        │              ┌───────┐              │
        │              │ ESP32 │              │
        │              └───┬───┘              │
        │                  │                   │
        │       ┌──────────┼──────────┐        │
        │       ▼          ▼          ▼        │
        │     4G/GSM      GSM        LoRa      │
        │    Internet      SMS       Network   │
        └─────────────────────────────────────┘
