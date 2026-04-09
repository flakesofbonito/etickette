# eTickette — User Manual

STI College Fairview | School Year 2026

---

## Contents

1. [What is eTickette](#what-is-etickette)
2. [For Students, Teachers, and Parents](#for-students-teachers-and-parents)
3. [At the Kiosk (Walk-in)](#at-the-kiosk-walk-in)
4. [At the Kiosk (Reservation)](#at-the-kiosk-reservation)
5. [Tracking Your Queue](#tracking-your-queue)
6. [For Staff](#for-staff)
7. [For the Lobby Monitor](#for-the-lobby-monitor)
8. [Frequently Asked Questions](#frequently-asked-questions)

---

## What is eTickette

eTickette is the queue management system used at STI College Fairview's Cashier and Registrar departments. Instead of waiting in a physical line, you reserve a slot online before you arrive, then scan a QR code at the kiosk when you get there. Your actual queue number is only assigned at that point — not when you book.

The system runs entirely in the browser. No app installation is required.

---

## For Students, Teachers, and Parents

### Accessing the System

Open a browser on your phone or computer and go to:

```
https://etickette.web.app
```

### Logging In

Select your user type at the top of the login screen:

- **Student** — Enter your 11-digit Student ID
- **Teacher / Staff** — Enter your 11-digit Employee ID
- **Parent** — Enter your child's 11-digit Student ID and your own full name

Tap **Continue** to proceed.

### Making a Reservation

1. On the home screen, you will see the Cashier and Registrar cards. Each shows the current status (Open, On Break, or Closed), how many people are in the queue, and how many slots remain for today.

2. Tap **Reserve Cashier Ticket** or **Reserve Registrar Ticket**.

3. Select the reason for your visit from the list. The system will show you the required documents to bring.

4. Pick a date using the calendar. Weekends are not available.

5. Tap **Reserve**. A QR code will appear. Take a screenshot or save the image — you will need it at the kiosk.

> Your queue number is not assigned yet. The QR code is your reservation token. You get a number only when you scan at the kiosk.

### Managing Your Reservation

Go to **My Ticket** in the sidebar or bottom navigation to see your active reservation.

- Your QR code is shown here if the reservation is still pending
- A tracking link appears once your ticket is activated at the kiosk
- To cancel, tap the Cancel button in the active reservation banner

You can only hold one active reservation at a time. Cancel the current one before making a new reservation.

### Quota and Availability

Each department has a daily slot limit set by staff. Once the quota is full, the Reserve button will be disabled and will show "Quota Full." Slots reset when staff perform the daily reset at the start of each school day.

---

## At the Kiosk (Walk-in)

If you do not have a reservation and want a ticket on the spot:

1. On the kiosk home screen, tap the department you need — **Cashier** or **Registrar**.
2. Select your visitor type: Student, Teacher/Staff, or Parent.
3. Enter your ID using the on-screen numpad. Parents also enter their name.
4. Select the reason for your visit from the dropdown.
5. Review the required documents on the next screen. If you have everything, tap **I Have All Documents — Get Ticket**.
6. Your ticket number will appear on screen and a physical ticket will print automatically.

If you already have an active reservation or a ticket in the queue, the system will block you from getting a second ticket.

---

## At the Kiosk (Reservation)

If you reserved online and are now at school:

1. On the kiosk home screen, tap **I Have a Reservation**.
2. Point the camera at the QR code from your phone or printout.
3. Once scanned and verified, your ticket number is assigned immediately and a physical ticket prints.

The reservation must be for today's date. If it is for a future date, the scan will be rejected. If the department is on break or closed at the time of scanning, you will need to wait for it to reopen.

---

## Tracking Your Queue

Every ticket — whether walk-in or reservation — comes with a tracking link in the form:

```
https://etickette.web.app/tracker/?t=TICKET-ID&d=DEPARTMENT
```

This link is printed as a QR code on your physical ticket and is also available in the **My Ticket** section of the website.

On the tracker page you will see:

- Your ticket number and department
- Current status: Waiting, Being Served, Completed, No-Show, or Cancelled
- Your position in the queue and the number of people ahead of you
- Estimated wait time based on average service times
- The number currently being served

### Browser Notifications

Tap **Enable Notifications** on the tracker page to receive an alert when it is your turn. You must keep the page open in your browser. On iOS, the page must be added to your home screen first (as a PWA) before notifications are available.

When your number is called, the page will also flash the browser tab title and attempt to vibrate your device.

---

## For Staff

Navigate to:

```
https://etickette.web.app/staff/
```

Enter your department and PIN to log in.

### Department Status

Use the three buttons at the top of the dashboard to set your window's status:

- **Open** — tickets can be issued and the queue is active
- **Break** — new tickets are blocked; the queue is paused
- **Closed** — the department is closed for the day

### Calling Tickets

**Call Next Ticket** calls the next waiting ticket automatically. It marks the current ticket as Completed first if one is being served.

**Complete** marks the current ticket as done and clears the serving slot.

**No-Show** marks the current ticket as a no-show. A 3-second countdown will then automatically call the next ticket (can be cancelled).

The serving timer shows how long the current ticket has been active. It turns orange after 5 minutes and red after 10. After 3 minutes (configurable), a prompt will appear asking whether to mark the ticket as a no-show.

### Recall

Enter a ticket number (e.g. `C-05`) in the Recall field and tap **Recall** to call a specific ticket regardless of its current position or status. If a ticket is currently being served, it will be returned to the queue first.

### Manual Complete

Use the **Mark Done** field to mark a specific ticket as completed without calling it first.

### Daily Quota

Enter a number in the quota field and tap **Set** to change the daily slot limit for your department. This takes effect immediately.

### System Announcements

Type a message and tap **Set Message** to push an announcement. It will appear on the website banner and scroll across the lobby monitor ticker for 30 seconds. Tap **Clear** to remove it early.

### Export Report

- **This Department** — exports today's tickets for your department as a CSV file
- **All Departments** — exports both Cashier and Registrar combined

The CSV includes ticket number, type, reason, student ID, status, issued time, called time, completed time, wait time, and a summary section at the bottom.

### Daily Reset

At the start of each school day, tap **Reset System for Today**. This will:

- Cancel all waiting and serving tickets
- Expire all pending reservations
- Reset the counters and queue sizes for both departments
- Reset issued counts to zero

You will be asked to confirm twice before the reset runs. This cannot be undone.

---

## For the Lobby Monitor

Navigate to:

```
https://etickette.web.app/monitor/
```

Enter the monitor PIN to unlock the display. This is a separate PIN from the staff PIN.

Once unlocked, the monitor shows:

- Now Serving number for each department
- Next 5 tickets in line for each department
- Department status (Open, On Break, Closed)
- Total in queue
- Remaining daily quota in the footer
- Announcement ticker when a staff message is active

A three-note audio alert plays each time a new number is called.

The monitor session is stored in the browser session so the PIN does not need to be re-entered on refresh. To lock it again, close and reopen the browser.

---

## Frequently Asked Questions

**Can I reserve for both Cashier and Registrar at the same time?**
No. The system allows one active reservation or ticket at a time across all departments.

**I reserved but the wrong date is showing at the kiosk.**
The reservation must be for today. Future-dated reservations cannot be activated until the correct day.

**My QR code was scanned but no ticket printed.**
The ticket was still created in the system. The printer may be offline. Show your ticket number on the tracker page to staff and they can manually manage your queue position.

**The Reserve button is greyed out.**
Either the department is closed or on break, the daily quota is full, or you already have an active reservation. Check the status label on the department card.

**How do I get notifications on iPhone?**
On Safari, tap the Share button and select "Add to Home Screen." Open the app from your home screen, then enable notifications on the tracker page.

**The kiosk camera isn't working.**
The kiosk must be accessed over HTTPS. If running locally, make sure the SSL certificate was generated using `generate_cert.py` and that your browser has accepted the security warning once.

---

*eTickette — STI College Fairview — SHS IT in Mobile and Web App Development — 2026*