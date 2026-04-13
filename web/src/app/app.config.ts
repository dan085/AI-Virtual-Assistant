import { ApplicationConfig, provideZoneChangeDetection } from '@angular/core';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { provideFirebaseApp, initializeApp } from '@angular/fire/app';
import { provideAuth, getAuth, connectAuthEmulator } from '@angular/fire/auth';
import { provideFirestore, getFirestore, connectFirestoreEmulator } from '@angular/fire/firestore';
import {
  provideFunctions,
  getFunctions,
  connectFunctionsEmulator,
} from '@angular/fire/functions';
import {
  provideStorage,
  getStorage,
  connectStorageEmulator,
} from '@angular/fire/storage';
import {
  provideAnalytics,
  getAnalytics,
  isSupported as analyticsSupported,
  ScreenTrackingService,
} from '@angular/fire/analytics';

import { routes } from './app.routes';
import { environment } from '../environments/environment';

export const appConfig: ApplicationConfig = {
  providers: [
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideRouter(routes, withComponentInputBinding()),

    provideFirebaseApp(() => initializeApp(environment.firebase)),

    provideAuth(() => {
      const auth = getAuth();
      if (environment.useEmulators) {
        connectAuthEmulator(auth, 'http://localhost:9099', {
          disableWarnings: true,
        });
      }
      return auth;
    }),

    provideFirestore(() => {
      const fs = getFirestore();
      if (environment.useEmulators) {
        connectFirestoreEmulator(fs, 'localhost', 8080);
      }
      return fs;
    }),

    provideFunctions(() => {
      const fns = getFunctions(undefined, 'us-central1');
      if (environment.useEmulators) {
        connectFunctionsEmulator(fns, 'localhost', 5001);
      }
      return fns;
    }),

    provideStorage(() => {
      const st = getStorage();
      if (environment.useEmulators) {
        connectStorageEmulator(st, 'localhost', 9199);
      }
      return st;
    }),

    // Analytics is optional: only load in prod, only if the browser
    // supports it (SSR / bots / privacy modes don't). measurementId
    // must be set in environment.firebase for it to initialize.
    provideAnalytics(() => {
      // isSupported() is async — Firebase handles the lazy init behind
      // the scenes, so returning getAnalytics() directly is fine here.
      // On unsupported platforms it no-ops.
      void analyticsSupported();
      return getAnalytics();
    }),
    ScreenTrackingService,
  ],
};
