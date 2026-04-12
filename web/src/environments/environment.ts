/**
 * DEVELOPMENT environment.
 * These values come from your Firebase project's "Web App" config.
 * They are PUBLIC (safe to ship to the browser) — unlike service account
 * keys, which must NEVER live in this file.
 */
export const environment = {
  production: false,
  useEmulators: true,
  firebase: {
    apiKey: 'REPLACE_ME',
    authDomain: 'your-project.firebaseapp.com',
    projectId: 'your-firebase-project-id',
    storageBucket: 'your-project.appspot.com',
    messagingSenderId: 'REPLACE_ME',
    appId: 'REPLACE_ME',
  },
};
