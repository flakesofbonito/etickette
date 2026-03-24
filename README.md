# 🎫 eTickette — Hybrid Smart Queue Management System

> **"Preparedness over Priority"** — Reserve your slot before you arrive, scan at the Kiosk, and track your queue live.

[![Firebase](https://img.shields.io/badge/Firebase-Firestore-orange?logo=firebase)](https://firebase.google.com/)
[![Hosting](https://img.shields.io/badge/Deployed-Firebase%20Hosting-blue?logo=firebase)](https://etickette.web.app)
[![License](https://img.shields.io/badge/License-Academic-green)](/)
[![School](https://img.shields.io/badge/STI-College%20Fairview-red)](/)

---

## 📖 Overview

**eTickette** is a hybrid smart queue management system built for **STI College Fairview**. It eliminates physical queuing by letting students, teachers, and parents reserve queue slots online before arriving — then activate their ticket by scanning a QR code at the on-campus kiosk.

This project was developed as a capstone for **IT in Mobile & Web App Development (SHS)**, School Year 2026.

---

## ✨ Features

| Feature | Description |
|---|---|
| 🌐 **Online Reservation** | Reserve a queue slot from any device before coming to school |
| 📱 **QR Code Activation** | Get a QR code upon reservation; scan at the Kiosk to issue your actual ticket number |
| 🖥️ **Live Queue Tracker** | Track your position in real-time from your phone |
| 🖨️ **Thermal Ticket Printing** | Physical ticket printed at the kiosk via USB thermal printer |
| 📺 **Lobby Monitor** | Public display showing current serving number and queue status |
| 🧑‍💼 **Staff Dashboard** | Full queue control — call, complete, no-show, recall, reset, export CSV |
| 📊 **Daily Quota System** | Configurable per-department ticket limits |
| 📢 **System Announcements** | Push messages to the website banner and lobby monitor ticker |
| 🔔 **Push Notifications** | Browser notifications when it's your turn |
| 🔌 **Offline Detection** | Real-time connectivity banners across all pages |

---

## 🏛️ System Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    eTickette System                     │
│                                                         │
│  ┌──────────────┐   ┌──────────────┐  ┌─────────────┐  │
│  │   Website    │   │    Kiosk     │  │   Monitor   │  │
│  │ (Reserve /   │   │ (Issue /     │  │ (Lobby TV   │  │
│  │  Track)      │   │  Scan QR)    │  │  Display)   │  │
│  └──────┬───────┘   └──────┬───────┘  └──────┬──────┘  │
│         │                 │                  │          │
│         └─────────────────┼──────────────────┘          │
│                           ▼                             │
│                  ┌─────────────────┐                    │
│                  │  Cloud Firestore │                    │
│                  │  (Real-time DB)  │                    │
│                  └─────────────────┘                    │
│                           │                             │
│              ┌────────────┘                             │
│              ▼                                          │
│     ┌─────────────────┐                                 │
│     │ Staff Dashboard │                                 │
│     │ (Queue Control) │                                 │
│     └─────────────────┘                                 │
└─────────────────────────────────────────────────────────┘
```

---

## 🧩 Tech Stack

| Layer | Technology |
|---|---|
| **Frontend** | Vanilla HTML/CSS/JS (ES Modules) |
| **Database** | Firebase Cloud Firestore (real-time) |
| **Hosting** | Firebase Hosting |
| **Printer Server** | Python + Flask + PyUSB (`printer_server.py`) |
| **QR Scanning** | jsQR (via webcam in kiosk) |
| **QR Generation** | qrcodejs |
| **CI/CD** | GitHub Actions → Firebase Hosting |
| **Fonts** | Plus Jakarta Sans (Google Fonts) |

---

## 📂 Project Structure

```
etickette/
├── website/
│   ├── index.html          # Main web app (reservation + tracking)
│   ├── kiosk/
│   │   └── index.html      # Kiosk interface (ticket issuance / QR scan)
│   ├── monitor/
│   │   └── index.html      # Lobby display monitor
│   ├── staff/
│   │   └── index.html      # Staff queue management dashboard
│   ├── tracker/
│   │   └── index.html      # Live queue tracker page
│   ├── css/
│   │   ├── website.css     # Main web app styles
│   │   ├── kiosk.css       # Kiosk styles
│   │   ├── monitor.css     # Monitor styles
│   │   ├── staff.css       # Staff dashboard styles
│   │   └── tracker.css     # Tracker page styles
│   ├── js/
│   │   ├── app.js          # Main web app logic
│   │   ├── kiosk.js        # Kiosk logic
│   │   ├── monitor.js      # Monitor logic
│   │   ├── staff.js        # Staff dashboard logic
│   │   ├── tracker.js      # Tracker logic
│   │   └── reasons.js      # Shared reason/document config
│   └── assets/             # Logo, poster, images
├── python/
│   └── printer_server.py   # Local Flask server for thermal printing
├── firebase.json           # Firebase hosting config
├── firestore.rules         # Firestore security rules
├── start_etickette.bat     # One-click kiosk launcher (Windows)
└── .github/workflows/      # CI/CD auto-deploy pipeline
```

---

## 🚀 How It Works

### For Students / Parents / Teachers (Online)
1. Go to [etickette.web.app](https://etickette.web.app)
2. Log in with your Student ID (or Employee ID / Child's ID for parents)
3. Choose a department (Cashier or Registrar) and select your reason
4. Pick your visit date and confirm — you get a **QR code**
5. Come to school and scan your QR at the **Kiosk** to get your ticket number
6. Track your queue live via the **Tracker** link

### At the Kiosk (Walk-in)
1. Tap **"Issue a Ticket"** on the kiosk screen
2. Select department → user type → enter your ID
3. Select your reason → confirm required documents
4. Receive printed ticket with your queue number

### At the Kiosk (Reservation)
1. Tap **"I Have a Reservation"**
2. Scan your QR code — ticket is instantly issued and printed

### For Staff
1. Navigate to `/staff/` and log in with your PIN
2. Use **Call Next**, **Complete**, or **No-Show** to manage the queue
3. Use **Recall** to call a specific ticket number again
4. Use **Export CSV** for daily reports

---

## ⚙️ Local Kiosk Setup (Thermal Printer)

The kiosk requires a local Python server to communicate with the USB thermal printer.

### Requirements
- Python 3.x
- USB Thermal Printer (VID: `0x0416`, PID: `0x5011`)
- libusb (bundled `libusb-1.0.dll` in project root)

### Run
```bash
pip install flask flask-cors pyusb
python python/printer_server.py
```

Or simply double-click **`start_etickette.bat`** on Windows — it handles everything automatically.

The printer server runs on `http://localhost:8000` and serves the kiosk at `http://localhost:8000/kiosk/`.

---

## 🔒 Security

- **Firestore Rules** enforce write restrictions — tickets can only be created with valid fields and proper statuses
- **Department docs** can only have status/counter/queue fields updated (no create/delete)
- **Staff PIN** is stored in Firestore `system/settings` and fetched at login
- **Monitor PIN** is separate from Staff PIN
- No personal data is stored beyond Student/Employee IDs entered by the user

---

## 🗄️ Firestore Data Model

| Collection | Purpose |
|---|---|
| `departments/{cashier\|registrar}` | Queue counter, status, now serving, avg wait |
| `tickets/{ticketId}` | Individual ticket records |
| `reservations/{resId}` | Online reservation records |
| `system/settings` | Quotas, PINs, announcements |

---

## 🚢 Deployment

Deployment is fully automated via GitHub Actions:

- **Push to `main`** → auto-deploys to Firebase Hosting (live)
- **Pull Request** → deploys to a preview channel

No manual `firebase deploy` needed.

---

## 👨‍💻 The Team

| Name | Role |
|---|---|
| **Kurt Luis Grape** | Leader & Lead Developer |
| **Reysean Policarpio** | Assistant Leader & UX Designer |
| **Crizdellyn Romero** | UI Designer |
| **Sean Evangelista** | QA & Quality Assurance |
| **Darryl Sugiura** | System Analyst |
| **Dawn Althea Vasquez** | Marketing & Page Handler |
| **Renzo Caoili** | Admin & Logistics Lead |

---

## 📄 License

This project was developed for academic purposes as part of the **STI SHS IT in Mobile & Web App Development** strand, School Year 2026. All rights reserved by the development team.

---

<p align="center">
  <strong>eTickette</strong> · STI College Fairview · SHS IT in Mobile & Web App Development · 2026
</p>
