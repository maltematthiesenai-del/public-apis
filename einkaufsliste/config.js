/* Firebase project of this household (Firebase console → Projekteinstellungen
   → Meine Apps). These values are not secret: access is guarded by firestore.rules. */
export const firebaseConfig = {
  apiKey: 'AIzaSyAeWAV2dlwUxdesNLd7Pgt8CFPNbqASDx4',
  authDomain: 'einkaufsliste-d44c4.firebaseapp.com',
  projectId: 'einkaufsliste-d44c4',
  storageBucket: 'einkaufsliste-d44c4.firebasestorage.app',
  messagingSenderId: '466644273460',
  appId: '1:466644273460:web:ed0505da90b9c31950bd61'
};

/* SHA-256 of the admin's e-mail address (lower case). The app shows the admin
   controls to the account whose address matches; the Firestore rules decide
   what each account may actually change. The address itself stays out of this
   public repository. */
export const adminEmailHash = 'f521946d8d1265925753f0e0c2b2669d264a0f78d06cc6ff9da0c78aea173a27';
