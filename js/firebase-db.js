/**
 * TermChat — Firebase Firestore & Authentication Engine
 * Implements persistent user profiles, chat history, and project settings
 * with Firestore Enterprise, offline-fallback resilience, and real-time syncing.
 */

(function () {
  "use strict";

  const OperationType = {
    CREATE: 'create',
    UPDATE: 'update',
    DELETE: 'delete',
    LIST: 'list',
    GET: 'get',
    WRITE: 'write',
  };

  // Standard Firestore error handler conforming strictly to FirestoreErrorInfo
  function handleFirestoreError(error, operationType, path, currentUser) {
    const errInfo = {
      error: error instanceof Error ? error.message : String(error),
      authInfo: {
        userId: currentUser?.uid || null,
        email: currentUser?.email || null,
        emailVerified: currentUser?.emailVerified || null,
        isAnonymous: currentUser?.isAnonymous || null,
        tenantId: currentUser?.tenantId || null,
        providerInfo: currentUser?.providerData?.map(provider => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || []
      },
      operationType: operationType,
      path: path
    };
    console.warn('Firestore Error Context: ', JSON.stringify(errInfo));
    return errInfo;
  }

  class TermFirebaseManager {
    constructor() {
      this.initialized = false;
      this.app = null;
      this.db = null;
      this.auth = null;
      this.currentUser = null;
      this.config = null;
      this.listeners = [];
      this.chatUnsubscribe = null;
      this.settingsUnsubscribe = null;
    }

    async init() {
      try {
        // Load config from firebase-applet-config.json
        const cfgRes = await fetch('/firebase-applet-config.json').catch(() => null);
        if (cfgRes && cfgRes.ok) {
          this.config = await cfgRes.json();
        } else {
          // Fallback configuration if file fetch blocked
          this.config = {
            projectId: "original-mission-k5xj8",
            appId: "1:387962834742:web:d21687d60389485a6a2d97",
            apiKey: "AIzaSyDngAsnFDWNv50I5fuzKC_Hbjqm0bp9208",
            authDomain: "original-mission-k5xj8.firebaseapp.com",
            firestoreDatabaseId: "ai-studio-termchat-7a30a4e2-972f-4b73-89be-5ceb99e30878",
            storageBucket: "original-mission-k5xj8.firebasestorage.app",
            messagingSenderId: "387962834742"
          };
        }

        // Dynamically import Firebase Modular SDK from official CDN / gstatic
        const [
          { initializeApp },
          { getAuth, onAuthStateChanged, signInWithPopup, GoogleAuthProvider, signOut },
          { getFirestore, doc, collection, setDoc, getDoc, getDocFromServer, getDocs, query, orderBy, limit, onSnapshot, serverTimestamp }
        ] = await Promise.all([
          import('https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js'),
          import('https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js'),
          import('https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js')
        ]);

        this.sdk = {
          initializeApp,
          getAuth,
          onAuthStateChanged,
          signInWithPopup,
          GoogleAuthProvider,
          signOut,
          getFirestore,
          doc,
          collection,
          setDoc,
          getDoc,
          getDocFromServer,
          getDocs,
          query,
          orderBy,
          limit,
          onSnapshot,
          serverTimestamp
        };

        this.app = initializeApp(this.config);
        // CRITICAL: The app will break without this line
        const dbId = this.config.firestoreDatabaseId || "ai-studio-termchat-7a30a4e2-972f-4b73-89be-5ceb99e30878";
        this.db = getFirestore(this.app, dbId);
        this.auth = getAuth(this.app);

        this.initialized = true;

        // Test connection as required by Firebase skill
        await this.testConnection();

        // Listen for auth state changes
        this.sdk.onAuthStateChanged(this.auth, (user) => {
          this.currentUser = user;
          this.onUserAuthStateChanged(user);
        });

        if (window.TermLogs) {
          window.TermLogs.add('Firebase', 'Firestore inicializado e pronto para persistência.', 'success');
        }

        return true;
      } catch (err) {
        console.warn('Firebase init fallback (offline mode enabled):', err.message);
        if (window.TermLogs) {
          window.TermLogs.add('Firebase', `Modo offline ativo: ${err.message}`, 'info');
        }
        return false;
      }
    }

    async testConnection() {
      if (!this.db || !this.sdk) return;
      try {
        await this.sdk.getDocFromServer(this.sdk.doc(this.db, 'test', 'connection'));
      } catch (error) {
        if (error instanceof Error && error.message.includes('the client is offline')) {
          console.warn("Please check your Firebase configuration or network connection.");
        }
      }
    }

    onUserAuthStateChanged(user) {
      if (user) {
        // Sync user profile to Firestore
        this.saveUserProfile({
          id: user.uid,
          email: user.email || 'user@termchat.dev',
          displayName: user.displayName || user.email?.split('@')[0] || 'TermChat Dev',
          photoURL: user.photoURL || '',
          deviceMode: window.cfg?.deviceMode || 'desktop',
          updatedAt: new Date().toISOString()
        }).catch(() => {});

        // Attach listeners for chat history and project settings
        this.attachLiveListeners(user.uid);
      } else {
        if (this.chatUnsubscribe) {
          this.chatUnsubscribe();
          this.chatUnsubscribe = null;
        }
        if (this.settingsUnsubscribe) {
          this.settingsUnsubscribe();
          this.settingsUnsubscribe = null;
        }
      }

      // Notify global app
      if (window.onFirebaseUserChange) {
        window.onFirebaseUserChange(user);
      }
    }

    async signInWithGoogle() {
      if (!this.initialized || !this.auth) {
        const ok = await this.init();
        if (!ok) throw new Error('Firebase não pôde ser inicializado');
      }

      try {
        const provider = new this.sdk.GoogleAuthProvider();
        provider.setCustomParameters({ prompt: 'select_account' });
        const cred = await this.sdk.signInWithPopup(this.auth, provider);
        return { ok: true, user: cred.user };
      } catch (err) {
        handleFirestoreError(err, OperationType.GET, 'auth/google', this.currentUser);
        throw err;
      }
    }

    async logout() {
      if (this.auth && this.sdk) {
        await this.sdk.signOut(this.auth);
      }
      this.currentUser = null;
    }

    // --- User Profile Persistence ---
    async saveUserProfile(profileData) {
      if (!this.db || !this.currentUser) return;
      const path = `users/${this.currentUser.uid}`;
      try {
        const userRef = this.sdk.doc(this.db, 'users', this.currentUser.uid);
        await this.sdk.setDoc(userRef, {
          id: this.currentUser.uid,
          email: profileData.email || this.currentUser.email || 'user@termchat.dev',
          displayName: profileData.displayName || this.currentUser.displayName || '',
          photoURL: profileData.photoURL || this.currentUser.photoURL || '',
          deviceMode: profileData.deviceMode || window.cfg?.deviceMode || 'desktop',
          updatedAt: new Date().toISOString()
        }, { merge: true });
      } catch (err) {
        handleFirestoreError(err, OperationType.WRITE, path, this.currentUser);
      }
    }

    // --- Chat Messages Persistence ---
    async saveChatMessage(msg) {
      // Always store locally first
      const localHist = window.store ? window.store.get('hist', []) : [];
      localHist.push(msg);
      if (window.store) window.store.set('hist', localHist.slice(-50));

      if (!this.db || !this.currentUser) return;

      const path = `users/${this.currentUser.uid}/chat_messages`;
      try {
        const msgId = 'msg-' + Date.now() + '-' + Math.random().toString(36).substring(2, 7);
        const msgDocRef = this.sdk.doc(this.db, 'users', this.currentUser.uid, 'chat_messages', msgId);

        await this.sdk.setDoc(msgDocRef, {
          id: msgId,
          userId: this.currentUser.uid,
          role: msg.role || 'user',
          content: String(msg.content || '').slice(0, 65000),
          provider: msg.provider || window.cfg?.provider || 'auto',
          model: msg.model || window.cfg?.model || '',
          timestamp: Date.now(),
          createdAt: new Date().toISOString()
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.CREATE, path, this.currentUser);
      }
    }

    // --- Project Settings Persistence ---
    async saveProjectSettings(settings) {
      if (!this.db || !this.currentUser) return;

      const path = `users/${this.currentUser.uid}/project_settings/default`;
      try {
        const settingDocRef = this.sdk.doc(this.db, 'users', this.currentUser.uid, 'project_settings', 'default');
        await this.sdk.setDoc(settingDocRef, {
          id: 'default',
          userId: this.currentUser.uid,
          projectName: settings.projectName || 'meu-projeto',
          provider: settings.provider || window.cfg?.provider || 'auto',
          model: settings.model || window.cfg?.model || '',
          theme: settings.theme || window.cfg?.theme || 'obsidian',
          autoSave: Boolean(settings.autoSave !== false),
          deviceMode: settings.deviceMode || window.cfg?.deviceMode || 'desktop',
          activePlugins: JSON.stringify(window.store ? window.store.get('plugins', []) : []),
          updatedAt: new Date().toISOString()
        }, { merge: true });

        if (window.TermLogs) {
          window.TermLogs.add('Firestore', 'Configurações sincronizadas na nuvem.', 'info');
        }
      } catch (err) {
        handleFirestoreError(err, OperationType.WRITE, path, this.currentUser);
      }
    }

    // --- Workspace Files Persistence ---
    async saveWorkspaceFile(filePath, content, language = 'javascript') {
      if (!this.db || !this.currentUser) return;

      const fileId = filePath.replace(/[^a-zA-Z0-9_-]/g, '_');
      const path = `users/${this.currentUser.uid}/workspace_files/${fileId}`;

      try {
        const fileDocRef = this.sdk.doc(this.db, 'users', this.currentUser.uid, 'workspace_files', fileId);
        await this.sdk.setDoc(fileDocRef, {
          id: fileId,
          userId: this.currentUser.uid,
          path: filePath,
          content: String(content || '').slice(0, 260000),
          language: language,
          updatedAt: new Date().toISOString()
        }, { merge: true });
      } catch (err) {
        handleFirestoreError(err, OperationType.WRITE, path, this.currentUser);
      }
    }

    // --- Realtime Snapshot Listeners ---
    attachLiveListeners(userId) {
      if (!this.db || !this.sdk) return;

      const chatPath = `users/${userId}/chat_messages`;
      try {
        const messagesCol = this.sdk.collection(this.db, 'users', userId, 'chat_messages');
        const q = this.sdk.query(messagesCol, this.sdk.orderBy('timestamp', 'asc'), this.sdk.limit(50));

        this.chatUnsubscribe = this.sdk.onSnapshot(q, (snapshot) => {
          if (!snapshot.empty) {
            const msgs = [];
            snapshot.forEach(d => msgs.push(d.data()));
            if (window.onFirestoreChatSync) {
              window.onFirestoreChatSync(msgs);
            }
          }
        }, (error) => {
          handleFirestoreError(error, OperationType.LIST, chatPath, this.currentUser);
        });
      } catch (e) {
        console.warn('Live chat listener could not be established:', e.message);
      }

      const settingsPath = `users/${userId}/project_settings/default`;
      try {
        const settingDoc = this.sdk.doc(this.db, 'users', userId, 'project_settings', 'default');
        this.settingsUnsubscribe = this.sdk.onSnapshot(settingDoc, (snap) => {
          if (snap.exists()) {
            const data = snap.data();
            if (window.onFirestoreSettingsSync) {
              window.onFirestoreSettingsSync(data);
            }
          }
        }, (error) => {
          handleFirestoreError(error, OperationType.GET, settingsPath, this.currentUser);
        });
      } catch (e) {
        console.warn('Live settings listener could not be established:', e.message);
      }
    }
  }

  window.TermFirebase = new TermFirebaseManager();
})();
