// website/js/app.js
console.log("🚀 app.js loaded"); // If you don't see this, the file path is wrong.

import {
  getFirestore, doc, collection, setDoc, getDoc,
  onSnapshot, updateDoc, query, where, serverTimestamp,
  getDocs, increment 
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";

const firebaseConfig = {
  apiKey: "AIzaSyA3g7-_ldguMjweIHrIduBNJOcJ3201bQc",
  authDomain: "etickette-78f74.firebaseapp.com",
  projectId: "etickette-78f74",
  storageBucket: "etickette-78f74.firebasestorage.app",
  messagingSenderId: "147547566302",
  appId: "1:147547566302:web:2c7a52792b539331d8524f",
  measurementId: "G-QHMMWXW7F3"
};

const REASONS = {
  cashier: [
    { label: "Pay Tuition / Fees", docs: ["Valid ID", "Statement of Account"] },
    { label: "Pay Miscellaneous Fees", docs: ["Valid ID", "Fee Slip"] },
    { label: "Request Official Receipt", docs: ["Valid ID", "Proof of Payment"] },
    { label: "Scholarship Clearance", docs: ["Valid ID", "Grant Letter"] },
    { label: "Other", docs: [] }
  ],
  registrar: [
    { label: "Request Transcript (TOR)", docs: ["Valid ID", "Request Form", "Clearance"] },
    { label: "Certificate of Enrollment", docs: ["Valid ID", "Request Form"] },
    { label: "Certificate of Graduation", docs: ["Valid ID", "Request Form", "Clearance"] },
    { label: "Form 137 / 138", docs: ["Valid ID", "Request Form"] },
    { label: "Diploma / Authentication", docs: ["Valid ID", "Claim Stub"] },
    { label: "Other", docs: [] }
  ]
};

let app, db;
let currentStudentId = null;
let reserveDept = null;
let reserveReason = null;
let currentStep = 1;
let hasActiveReservation = false;

// We export this so the HTML can call it
export function initWebsite() {
  console.log("🛠 Initializing Firebase...");
  app = initializeApp(firebaseConfig);
  db = getFirestore(app);

  // Bind to window so HTML onclick works
  window.loginStudent = loginStudent;
  window.logout = logout;
  window.navigate = navigate;
  window.toggleMenu = toggleMenu;
  window.openReserveModal = openReserveModal;
  window.closeModal = closeModal;
  window.handleOverlay = handleOverlay;
  window.rGoStep = rGoStep;
  window.submitReserveDate = submitReserveDate;
  window.cancelReservation = cancelReservation;

  const saved = sessionStorage.getItem('studentId');
  if (saved) { currentStudentId = saved; afterLogin(); }
}

// ... (Rest of your functions: loginStudent, submitReserveDate, etc.)
// Make sure you copy them from your original code, 
// but ONLY PASTE THEM ONCE.