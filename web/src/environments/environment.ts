/**
 * DEVELOPMENT environment.
 * These values come from Firebase Console → Project settings → Web App.
 * They are PUBLIC (safe to ship to the browser and commit to source
 * control) — unlike service account keys, which must NEVER live here.
 */
export const environment = {
  production: false,
  useEmulators: true,
  firebase: {
    apiKey: 'AIzaSyClItxVf142PYYlnymmRemHgpvM0vQCDTM',
    authDomain: 'avatar-ia-59442.firebaseapp.com',
    projectId: 'avatar-ia-59442',
    storageBucket: 'avatar-ia-59442.firebasestorage.app',
    messagingSenderId: '635931171706',
    appId: '1:635931171706:web:e196efdcdb8d23321954c3',
    measurementId: 'G-0DSC9MQ831',
  },
};
