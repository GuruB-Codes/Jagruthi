# 🛡️ Jagruthi – Intelligent Women Safety System

> **An IoT-based women safety solution with multi-layer emergency communication for reliable alerts even when internet connectivity is unavailable.**

## 🚨 About Jagruthi

**Jagruthi** is an IoT-based women safety system that combines a **smart wearable device** with a **mobile application** to provide emergency communication, location tracking, and safety monitoring.

The system uses a **three-layer communication architecture**:

**Internet → GSM/SMS → LoRa**

This fallback mechanism helps the user send emergency alerts even when the primary communication network is unavailable.

---

## 🎯 Problem Statement

Traditional women safety applications mainly depend on smartphones and internet connectivity. During an emergency, the user may not be able to access their phone, or internet/cellular connectivity may be unavailable.

**Jagruthi addresses this challenge by providing a dedicated SOS wearable and multiple communication technologies.**

---

## ✨ Key Features

* 🆘 **Physical SOS Button** – Trigger an emergency alert directly from the wearable.
* 📍 **GPS Location Tracking** – Obtain the user's location during an emergency.
* 📡 **Multi-Layer Communication** – Internet, GSM/SMS, and LoRa-based communication.
* 🛣️ **Safe Route Monitoring** – Monitor journeys and support safer travel.
* 🔔 **Safety Alerts** – Provide safety notifications and emergency updates.
* 📱 **Mobile Application** – Manage safety features and emergency information.
* 🗺️ **Map Integration** – Display location and route information.
* 📶 **Offline Emergency Communication** – LoRa provides an additional communication option when normal networks are unavailable.

---

## 🏗️ System Architecture

```text
                 ┌─────────────────────┐
                 │    JAGRUTHI APP     │
                 │  Mobile Application │
                 └──────────┬──────────┘
                            │
                            ▼
                 ┌─────────────────────┐
                 │      SUPABASE       │
                 │ Authentication/DB   │
                 └─────────────────────┘


        ┌─────────────────────────────────┐
        │       JAGRUTHI WEARABLE        │
        │                                 │
        │   SOS Button ──┐               │
        │                │               │
        │   GPS ─────────┤               │
        │                ▼               │
        │             ┌───────┐          │
        │             │ ESP32 │          │
        │             └───┬───┘          │
        │                 │              │
        │       ┌─────────┼─────────┐    │
        │       ▼         ▼         ▼    │
        │   Internet     GSM       LoRa   │
        │                 SMS             │
        └─────────────────────────────────┘
```

---

## 🔄 Emergency Communication Flow

```text
              SOS Button Pressed
                       │
                       ▼
                Get GPS Location
                       │
                       ▼
             Internet Available?
                  /         \
                YES          NO
                 │            │
                 ▼            ▼
          Internet Alert   GSM Available?
                              /      \
                            YES       NO
                             │         │
                             ▼         ▼
                         SMS Alert   LoRa Alert
```

---

## 📡 Communication Layers

| Layer   | Technology         | Purpose                                                 |
| ------- | ------------------ | ------------------------------------------------------- |
| Layer 1 | Internet / 4G / 5G | Primary communication                                   |
| Layer 2 | GSM / SMS          | Fallback when internet is unavailable                   |
| Layer 3 | LoRa               | Communication when cellular connectivity is unavailable |

---

## 🔧 Hardware Components

| Component               | Purpose                   |
| ----------------------- | ------------------------- |
| **ESP32**               | Main microcontroller      |
| **NEO-6M GPS**          | Location tracking         |
| **SIM900A / SIM800L**   | GSM and SMS communication |
| **SX1278 LoRa**         | Long-range communication  |
| **SOS Push Button**     | Emergency activation      |
| **OLED Display**        | Device status information |
| **3.7V Li-ion Battery** | Portable power supply     |

---

## 💻 Technologies Used

### Frontend

* HTML
* CSS
* JavaScript
* React.js

### Backend

* Supabase
* Supabase Authentication
* Supabase Database

### IoT & Embedded

* ESP32
* GPS
* GSM
* LoRa

### Maps

* OpenStreetMap

### Development Tools

* Arduino IDE
* KiCad
* Git
* GitHub

---

## 📱 Mobile Application

The Jagruthi application provides features such as:

* User authentication
* Emergency SOS management
* Location visualization
* Safe route monitoring
* Safety notifications
* Emergency contact management
* Wearable device support

---

## 📿 Smart Wearable

The Jagruthi wearable is designed to provide a simple and accessible way to trigger an emergency alert.

The wearable can be designed as:

* 📿 Pendant
* 🔑 Keychain
* ⌚ Bracelet

The user can press the physical **SOS button** during an emergency without depending entirely on the smartphone.

---

## 🗺️ Location & Mapping

Jagruthi uses GPS coordinates to identify the user's location and integrates map services for location visualization and route monitoring.

**OpenStreetMap** is used for map-based functionality.

---

## 🧪 Testing

The system is designed to work under different connectivity conditions:

| Scenario                   | Communication Method |
| -------------------------- | -------------------- |
| Internet available         | Internet             |
| Internet unavailable       | GSM/SMS              |
| Internet & GSM unavailable | LoRa                 |
| SOS button pressed         | Emergency mode       |
| GPS available              | Location included    |

---

## 🚀 Future Improvements

* Real-time location tracking
* Advanced geofencing
* Emergency service integration
* LoRa gateway infrastructure
* Improved battery optimization
* Custom compact PCB
* Improved mobile application
* Secure emergency communication
* Cloud-based emergency event management

---

## 🌟 Project Highlights

* 🛡️ Women-focused safety solution
* 📡 Internet + GSM + LoRa communication
* 🆘 Dedicated physical SOS wearable
* 📍 GPS-based emergency location
* 📱 Mobile application
* 🗺️ Map-based safety monitoring
* 🔌 IoT-enabled emergency communication
* 📶 Offline communication capability

---

## 👥 Team

### Team Protectors

**Jagruthi – Intelligent Women Safety Wearable with Offline Emergency Communication**

A social-impact **IoT + Mobile Application** project focused on improving emergency communication reliability and women's safety.

---

## 📄 License

This project is developed for educational, research, and social-impact purposes.

---

⭐ **If you find Jagruthi useful, consider giving this repository a star!**
