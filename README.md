# eTickette

**Hybrid Smart Queue Management System — STI College Fairview**

<img src="website/assets/poster.png" alt="eTickette — Queue Smarter. Anywhere." width="100%" />

> Reserve your slot before you arrive, scan at the Kiosk, and track your queue live.

[![Live](https://img.shields.io/badge/Live-etickette.web.app-e3cf57?style=flat-square&labelColor=1f3c88)](https://etickette.web.app)
[![Firebase](https://img.shields.io/badge/Firebase-Firestore-e3cf57?style=flat-square&labelColor=1f3c88&logo=firebase&logoColor=e3cf57)](https://firebase.google.com/)
[![Hosting](https://img.shields.io/badge/Hosted-Firebase%20Hosting-e3cf57?style=flat-square&labelColor=1f3c88)](https://firebase.google.com/products/hosting)
[![Status](https://img.shields.io/badge/Build-Passing-e3cf57?style=flat-square&labelColor=1f3c88)](https://github.com/flakesofbonito/etickette/actions)
[![School](https://img.shields.io/badge/STI-College%20Fairview-e3cf57?style=flat-square&labelColor=1f3c88)]([https://www.sti.edu.ph](https://www.facebook.com/fairview.sti.edu))

---

## Overview

eTickette eliminates physical queuing at STI College Fairview. Students, teachers, and parents reserve a slot online before arriving, then activate their ticket by scanning a QR code at the on-campus kiosk. Queue numbers are only issued upon physical arrival — not at reservation time.

Built for the **IT in Mobile & Web App Development** strand, School Year 2026.

**Principle:** Preparedness over Priority.

---

## Features

**Online Reservation** — Reserve a ticket from any device before coming to school.

**QR Activation** — A QR code is issued upon reservation. Scan it at the kiosk to get your actual queue number.

**Live Queue Tracker** — Track your position in real-time from your phone, with browser notifications when called.

**Thermal Printing** — Physical ticket printed via USB thermal printer at the kiosk.

**Lobby Monitor** — Public display showing the current serving number and queue status for both departments.

**Staff Dashboard** — Full queue control: call, complete, no-show, recall, manual override, daily reset, and CSV export.

**Daily Quotas** — Configurable per-department ticket limits with real-time tracking.

**System Announcements** — Push a message to the website banner and lobby monitor ticker.

**Offline Detection** — Real-time connectivity banners across all pages.

---

## System Architecture

```
                          eTickette
    ┌──────────────┐   ┌──────────────┐   ┌─────────────┐
    │   Website    │   │    Kiosk     │   │   Monitor   │
    │ Reserve /    │   │ Issue /      │   │ Lobby TV    │
    │ Track        │   │ Scan QR      │   │ Display     │
    └──────┬───────┘   └──────┬───────┘   └──────┬──────┘
           │                  │                  │
           └──────────────────┼──────────────────┘
                              ▼
                   ┌─────────────────┐
                   │ Cloud Firestore  │
                   │  (Real-time DB)  │
                   └────────┬────────┘
                            │
               ┌────────────┘
               ▼
      ┌─────────────────┐
      │ Staff Dashboard │
      └─────────────────┘
```

---

## Stack

| Layer | Technology |
|---|---|
| Frontend | Vanilla HTML / CSS / JS (ES Modules) |
| Database | Firebase Cloud Firestore |
| Hosting | Firebase Hosting |
| Printer Server | Python + Flask + PyUSB |
| QR Scanning | jsQR (webcam) |
| QR Generation | qrcodejs |
| CI/CD | GitHub Actions |
| Fonts | Plus Jakarta Sans |

---

## Project Structure

```
etickette/
├── website/
│   ├── index.html              Main web app (reservation + tracking)
│   ├── kiosk/index.html        Kiosk interface (ticket issuance / QR scan)
│   ├── monitor/index.html      Lobby display monitor
│   ├── staff/index.html        Staff queue management dashboard
│   ├── tracker/index.html      Live queue tracker page
│   ├── css/
│   │   ├── variables.css       Design tokens (colors, spacing, radii)
│   │   ├── website.css
│   │   ├── kiosk.css
│   │   ├── monitor.css
│   │   ├── staff.css
│   │   └── tracker.css
│   ├── js/
│   │   ├── app.js              Main web app logic
│   │   ├── kiosk.js            Kiosk logic
│   │   ├── monitor.js          Monitor logic
│   │   ├── staff.js            Staff dashboard logic
│   │   ├── tracker.js          Tracker logic
│   │   ├── calendar.js         Custom date picker
│   │   ├── firebase.js         Firebase init
│   │   ├── utils.js            Shared toast / confirm dialog
│   │   └── reasons.js          Department reasons and required documents
│   └── assets/
├── python/
│   ├── printer_server.py       Local Flask server for thermal printing
│   └── generate_cert.py        Self-signed HTTPS cert for tablet access
├── firebase.json
├── firestore.rules
├── start_etickette.bat         One-click kiosk launcher (Windows)
└── .github/workflows/          CI/CD auto-deploy
```

---

## How It Works

### Students, Teachers, and Parents (Online)

1. Go to [etickette.web.app](https://etickette.web.app)
2. Select your user type and enter your ID
3. Choose a department (Cashier or Registrar) and select your reason
4. Pick a visit date — a QR code is generated
5. On the day, scan your QR at the kiosk to receive your ticket number
6. Track your queue live via the Tracker link

### Kiosk — Walk-in

1. Tap the department on the home screen
2. Select your user type, enter your ID
3. Select your reason and confirm required documents
4. Receive a printed ticket with your queue number

### Kiosk — Reservation

1. Tap "I Have a Reservation" on the home screen
2. Scan your QR code — ticket is instantly issued and printed

### Staff

1. Navigate to `/staff/` and log in with your PIN
2. Use Call Next, Complete, or No-Show to manage the queue
3. Use Recall to call a specific ticket number again
4. Use Export CSV for daily reports

---

## Local Kiosk Setup (Thermal Printer)

The kiosk requires a local Python server to drive the USB thermal printer.

**Requirements**
- Python 3.x
- USB Thermal Printer (VID: `0x0416`, PID: `0x5011`)
- libusb (`libusb-1.0.dll` bundled in project root)

**Install dependencies**
```bash
pip install flask flask-cors pyusb
```

**Generate HTTPS certificate** (required for camera access on tablet)
```bash
python python/generate_cert.py
```

**Run the server**
```bash
python python/printer_server.py
```

Or double-click `start_etickette.bat` on Windows. It handles dependencies, firewall rules, and launches the browser automatically.

The server runs on `https://localhost:8000` and serves the kiosk at `https://localhost:8000/kiosk/`.

---

## Firestore Data Model

| Collection | Purpose |
|---|---|
| `departments/{cashier\|registrar}` | Counter, queue size, now serving, avg wait, status |
| `tickets/{ticketId}` | Individual ticket records |
| `reservations/{resId}` | Online reservation records |
| `system/settings` | Quotas, PINs, announcements, issued counts |

---

## Security Notes

- Firestore rules restrict department documents to updates only — no create or delete
- Staff and Monitor PINs are stored in `system/settings` and never exposed client-side beyond the login check
- No personal data beyond Student/Employee IDs is stored

---

## Deployment

Deployment is fully automated via GitHub Actions.

- Push to `main` triggers a live deploy to Firebase Hosting
- Pull requests deploy to a preview channel

No manual `firebase deploy` needed.

---

## The Team

| Name | Role |
|---|---|
| Kurt Luis Grape | Leader and Lead Developer |
| Reysean Policarpio | Assistant Leader and UX Designer |
| Crizdellyn Romero | UI Designer |
| Sean Evangelista | QA and Quality Assurance |
| Darryl Sugiura | System Analyst |
| Dawn Althea Vasquez | Marketing and Page Handler |
| Renzo Caoili | Admin and Logistics Lead |

---

STI College Fairview — SHS IT in Mobile and Web App Development — 2026
