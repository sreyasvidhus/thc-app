# THC app – setup (about 20 minutes, all free tiers)

The app is a PWA hosted on GitHub Pages. Data, sign-in and push run on Firebase's free Spark plan.

## 1. Firebase project
1. https://console.firebase.google.com → **Add project** → name it `thc-app`. Analytics off is fine.
2. **Build → Authentication → Get started → Sign-in method → Google → Enable**. Set the support email. Save.
3. **Authentication → Settings → Authorized domains → Add domain**: `sreyasvidhus.github.io`
4. **Build → Firestore Database → Create database** → Production mode → location `asia-south1 (Mumbai)`.
5. **Firestore → Rules** → replace everything with the contents of `firestore.rules` from this repo → **Publish**.
   If you change the admin emails in `firebase-config.js`, change the same two emails in the rules.
6. **Project settings (gear) → General → Your apps → Web (</>)** → nickname `THC` → Register. Copy the `firebaseConfig` block.
7. **Project settings → Cloud Messaging → Web Push certificates → Generate key pair**. Copy the key.

## 2. Fill in `firebase-config.js`
Paste the config from step 6, the VAPID key from step 7, and the collective's UPI ID (the one members should pay into). Commit and push; GitHub Pages redeploys in about a minute.

## 3. First sign-in (you)
Open https://sreyasvidhus.github.io/thc-app/ → Continue with Google (sreyas@fellowyellow.in or sreyas1234@gmail.com, both are admins).
Home → **Treasurer → Import the Excel register**. This loads all 22 members, 148 ledger entries and the contributions. Do this once.
Treasurer → **Fee, UPI ID and admins** to confirm the UPI ID and add Faisal / Pavan / whoever else as admin.

## 4. Members
Share the link. Each member signs in with Google. They are matched automatically when their Google email is on their member record (Members → Edit → Google email). Otherwise they pick their name once and you confirm it under Treasurer → Member sign-in links.
Install: Android Chrome shows "Add to Home screen"; iPhone: Safari → Share → Add to Home Screen (notifications on iPhone only work from the installed app).

## 5. Push notifications (optional but recommended)
Notices, "event tomorrow" reminders and a dues nudge on the 5th are sent by a GitHub Action every 10 minutes.
1. Firebase **Project settings → Service accounts → Generate new private key** (downloads a JSON).
2. GitHub repo → **Settings → Secrets and variables → Actions → New repository secret** → name `FIREBASE_SERVICE_ACCOUNT`, value = entire JSON file contents.
3. Repo → **Actions** → enable workflows if asked. Done.

## How payments work
- Member taps the months → Google Pay / PhonePe opens with the amount and a "THC Oct 26 Name" note pre-filled.
- After paying, the app asks for the UTR from the receipt. On submit, the months turn green and a ledger credit is posted, both flagged **unverified**.
- Treasurer → **Payments to verify**: match the UTR with the bank statement, then Verify (clears the flag) or Reject (reverts the months and removes the ledger entry). Only admins can do this; members can't edit anything else on their record.
- Cash / bank transfers: Treasurer → Record a cash / bank payment.

## Attendance
Create the event (a 4-digit check-in code is generated). At the venue, open Attendance and read the code out; members tap Check in and enter it. You can also toggle anyone present/absent by hand.

## Event invitations
Every event has a shareable landing page: `event.html?e=<event id>`. Tap **Share invite** on an event in the app to send it on WhatsApp. The page shows date, time, venue, notes, RSVP count and an Add-to-calendar button, and works without sign-in; RSVP itself happens in the app.

## Admin tab (treasurer only)
Balance, outstanding, this month's collections and the verification queue, plus CSV downloads: payment status by member, the member × month summary matrix, full ledger, this month's collections, pending verifications, contributions and the member directory. "Copy reminder list" copies a WhatsApp-ready list of defaulters.

## Paying for someone else
On the Pay screen tick more than one member (e.g. Ravi ticks Pallavi too). One UPI payment covers both; the app posts a separate ledger line per member, marked "paid by Ravi", all flagged unverified until the treasurer verifies the single UTR.

## Food & drink
Account → Food & drink. Diet, drinks, allergies and a usual order. On any event the host/admin taps **Catering** for a headcount by diet and drink among those who RSVP'd.

## Member accounts (username + password)
Sign-in is by username (first.last, e.g. `faisal.vohra`) and a password. Accounts are created by the **Set up member accounts** workflow (Actions tab) from the `THC_ACCOUNTS` secret; each member is forced to set their own password at first sign-in. Treasurer resets a password from Firebase console → Authentication → Users → ⋮ → Reset password (or re-run the workflow with a new secret). Admin usernames: `sreyas.vidhu` (add more in the `admins` collection as `<username>@thehyderabadcartel.com`).

## Google Sheet mirror
Create a Google Sheet, share it (Editor) with `firebase-adminsdk-fbsvc@thc-app-358f1.iam.gserviceaccount.com`, enable the Google Sheets API for project thc-app-358f1 in Google Cloud, and set the repo variable `SHEET_ID` (Settings → Secrets and variables → Actions → Variables) to the sheet's ID. Every 10 minutes the sheet is rewritten with Summary, Member status, Dues matrix, Ledger, App payments and Contributions. The app stays the source of truth; edits in the sheet are overwritten.
