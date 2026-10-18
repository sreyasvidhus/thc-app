// Firebase project: thc-app (thc-app-358f1). Keys here are public client identifiers; access is enforced by Firestore rules.
// Cloud Messaging → Web Push certificates provides VAPID_KEY. ADMIN_EMAILS get treasurer controls (keep in sync with firestore.rules).
self.THC_CONFIG = {
  firebase: {
    apiKey: "AIzaSyDm3uJ7OatYvEcSBael-3oddVNlf0zkTa8",
    authDomain: "thc-app-358f1.firebaseapp.com",
    projectId: "thc-app-358f1",
    storageBucket: "thc-app-358f1.firebasestorage.app",
    messagingSenderId: "667448831622",
    appId: "1:667448831622:web:61c753951f948db4c1eb07"
  },
  VAPID_KEY: "BKUah8RFjTiC6dRy5ESIJ-w-wQYRsz4PckvozavxHUBL7_pkvPBHowQ0jToB-mJ2YWIDpmQACIK_zj5BTk97Jl0",
  ADMIN_EMAILS: ["sreyas@fellowyellow.in", "sreyas1234@gmail.com"],
  // Collective's UPI ID that members pay into (shown in the Pay screen, pre-filled in GPay/PhonePe).
  UPI_ID: "sreyas1234-2@oksbi",
  UPI_NAME: "Sreyas S"
};
