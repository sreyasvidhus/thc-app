// 1. Firebase console → Project settings → Your apps → Web app → copy the firebaseConfig object here.
// 2. Cloud Messaging tab → Web Push certificates → Generate key pair → paste as VAPID_KEY.
// 3. ADMIN_EMAILS: Google accounts that get treasurer controls on first sign-in.
self.THC_CONFIG = {
  firebase: {
    apiKey: "PASTE_API_KEY",
    authDomain: "PASTE_PROJECT_ID.firebaseapp.com",
    projectId: "PASTE_PROJECT_ID",
    storageBucket: "PASTE_PROJECT_ID.appspot.com",
    messagingSenderId: "PASTE_SENDER_ID",
    appId: "PASTE_APP_ID"
  },
  VAPID_KEY: "PASTE_VAPID_PUBLIC_KEY",
  ADMIN_EMAILS: ["sreyas@fellowyellow.in", "sreyas1234@gmail.com"],
  // Collective's UPI ID that members pay into (shown in the Pay screen, pre-filled in GPay/PhonePe).
  UPI_ID: "PASTE_THC_UPI_ID@bank",
  UPI_NAME: "The Hyderabad Cartel"
};
