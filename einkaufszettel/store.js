/* Data layer: Firebase (login + Firestore live sync) or an in-memory demo.
   All paths are relative to the shared household document, so the app only
   ever names collections like "items" or "lists". */

const HOUSEHOLD = 'households/main';

export async function createStore(config) {
  if (config === 'demo') return createDemoStore();
  return createFirebaseStore(config);
}

function snapDocs(snap) {
  return snap.docs.map((d) => Object.assign({ id: d.id }, d.data()));
}

async function createFirebaseStore(config) {
  const fb = await import('./vendor/firebase.js');
  const app = fb.initializeApp(config);
  const auth = fb.getAuth(app);
  await fb.setPersistence(auth, fb.browserLocalPersistence).catch(() => { });
  let db;
  try {
    db = fb.initializeFirestore(app, { localCache: fb.persistentLocalCache({ tabManager: fb.persistentMultipleTabManager() }) });
  } catch (e) {
    db = fb.initializeFirestore(app, {});
  }
  const ref = (coll, id) => fb.doc(db, HOUSEHOLD + '/' + coll + '/' + id);
  const userOf = (u) => u && { uid: u.uid, email: u.email, emailVerified: u.emailVerified, name: u.displayName || '' };

  return {
    isDemo: false,
    auth: {
      onChange(cb) { return fb.onAuthStateChanged(auth, (u) => cb(userOf(u))); },
      async signIn(email, pass) { await fb.signInWithEmailAndPassword(auth, email, pass); },
      async signUp(name, email, pass) {
        const cred = await fb.createUserWithEmailAndPassword(auth, email, pass);
        if (name) await fb.updateProfile(cred.user, { displayName: name });
        await fb.sendEmailVerification(cred.user);
      },
      resetPassword(email) { return fb.sendPasswordResetEmail(auth, email); },
      sendVerification() { return auth.currentUser ? fb.sendEmailVerification(auth.currentUser) : Promise.resolve(); },
      // Reload the account and a fresh token so the security rules see email_verified.
      async refresh() {
        if (!auth.currentUser) return null;
        await fb.reload(auth.currentUser);
        await auth.currentUser.getIdToken(true);
        return userOf(auth.currentUser);
      },
      signOut() { return fb.signOut(auth); }
    },
    listen(coll, cb, onErr) {
      return fb.onSnapshot(fb.collection(db, HOUSEHOLD + '/' + coll), { includeMetadataChanges: true },
        (snap) => cb(snapDocs(snap), { fromCache: snap.metadata.fromCache, pending: snap.metadata.hasPendingWrites }), onErr);
    },
    listenDoc(coll, id, cb, onErr) {
      return fb.onSnapshot(ref(coll, id), (snap) => cb(snap.exists() ? snap.data() : null), onErr);
    },
    newId(coll) { return fb.doc(fb.collection(db, HOUSEHOLD + '/' + coll)).id; },
    set(coll, id, data) { return fb.setDoc(ref(coll, id), data); },
    update(coll, id, data) { return fb.updateDoc(ref(coll, id), data); },
    remove(coll, id) { return fb.deleteDoc(ref(coll, id)); },
    // ops: [{op: 'set'|'delete', coll, id, data}] — committed in chunks of 400.
    async batch(ops) {
      for (let i = 0; i < ops.length; i += 400) {
        const b = fb.writeBatch(db);
        ops.slice(i, i + 400).forEach((o) => {
          if (o.op === 'delete') b.delete(ref(o.coll, o.id));
          else b.set(ref(o.coll, o.id), o.data);
        });
        await b.commit();
      }
    },
    getUserPrefs(uid) {
      return fb.getDoc(fb.doc(db, 'users/' + uid)).then((s) => (s.exists() ? s.data() : null));
    },
    setUserPrefs(uid, data) { return fb.setDoc(fb.doc(db, 'users/' + uid), data, { merge: true }); }
  };
}

/* In-memory store for trying the app without an account (index.html#demo). */
function createDemoStore() {
  const data = {};
  const subs = {};
  let n = 0;
  const me = { uid: 'demo-me', email: 'demo@example.com', emailVerified: true, name: 'Du' };
  const coll = (c) => (data[c] = data[c] || {});
  const emit = (c) => (subs[c] || []).forEach((fn) => fn());
  const now = Date.now();
  const seed = {
    lists: {
      lidl: { name: 'Lidl', market: 'lidl', order: 1, createdAt: now },
      aldi: { name: 'Aldi Nord', market: 'aldi', order: 2, createdAt: now },
      rewe: { name: 'Rewe', market: 'rewe', order: 3, createdAt: now }
    },
    members: { 'demo-me': { name: 'Du', color: '#0B7A5C' }, 'demo-p': { name: 'Partner', color: '#B5527A' } },
    items: {
      a: { listId: 'lidl', name: 'Äpfel', qty: 2, unit: 'kg', category: 'obst', note: '', done: false, addedBy: 'demo-p', createdAt: now - 3600e3 },
      b: { listId: 'lidl', name: 'Vollmilch', qty: 2, unit: 'l', category: 'kuehl', note: '', done: false, addedBy: 'demo-me', createdAt: now - 1800e3 },
      c: { listId: 'lidl', name: 'Brötchen', qty: 6, unit: '', category: 'brot', note: 'Körner', done: false, addedBy: 'demo-p', createdAt: now - 600e3 },
      d: { listId: 'lidl', name: 'Kaffee', qty: null, unit: '', category: 'vorrat', note: '', done: true, addedBy: 'demo-me', doneBy: 'demo-p', doneAt: now - 300e3, createdAt: now - 7200e3 }
    },
    offers: {
      o1: { market: 'lidl', title: 'Frische Vollmilch 3,5 % (Beispiel)', price: 0.99, oldPrice: 1.19, size: '1 l', validTo: null, keywords: ['milch'] }
    }
  };
  Object.keys(seed).forEach((c) => { data[c] = seed[c]; });
  const list = (c) => Object.keys(coll(c)).map((id) => Object.assign({ id }, coll(c)[id]));
  const later = (fn) => setTimeout(fn, 0);
  return {
    isDemo: true,
    auth: {
      onChange(cb) { later(() => cb(me)); return () => { }; },
      async signIn() { }, async signUp() { }, async resetPassword() { }, async sendVerification() { },
      async refresh() { return me; }, async signOut() { location.hash = ''; location.reload(); }
    },
    listen(c, cb) {
      const fn = () => cb(list(c), { fromCache: false, pending: false });
      (subs[c] = subs[c] || []).push(fn); later(fn);
      return () => { subs[c] = subs[c].filter((f) => f !== fn); };
    },
    listenDoc(c, id, cb) {
      const fn = () => cb(coll(c)[id] || null);
      (subs[c] = subs[c] || []).push(fn); later(fn);
      return () => { };
    },
    newId() { return 'd' + (++n) + '-' + Date.now().toString(36); },
    async set(c, id, d) { coll(c)[id] = JSON.parse(JSON.stringify(d)); emit(c); },
    async update(c, id, d) {
      if (!coll(c)[id]) throw { code: 'not-found' };
      Object.assign(coll(c)[id], JSON.parse(JSON.stringify(d))); emit(c);
    },
    async remove(c, id) { delete coll(c)[id]; emit(c); },
    async batch(ops) {
      ops.forEach((o) => { if (o.op === 'delete') delete coll(o.coll)[o.id]; else coll(o.coll)[o.id] = JSON.parse(JSON.stringify(o.data)); });
      [...new Set(ops.map((o) => o.coll))].forEach(emit);
    },
    async getUserPrefs() { return null; },
    async setUserPrefs() { }
  };
}
