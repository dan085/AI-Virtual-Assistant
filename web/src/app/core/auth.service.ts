import { Injectable, inject, signal } from '@angular/core';
import {
  Auth,
  GoogleAuthProvider,
  User,
  signInWithPopup,
  signOut,
  onAuthStateChanged,
} from '@angular/fire/auth';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly auth = inject(Auth);

  readonly user = signal<User | null>(null);
  readonly ready = signal<boolean>(false);
  readonly isAdmin = signal<boolean>(false);

  constructor() {
    onAuthStateChanged(this.auth, async (user) => {
      this.user.set(user);
      this.ready.set(true);

      // Resolve the `admin` custom claim. Set it server-side with:
      //   admin.auth().setCustomUserClaims(uid, { admin: true })
      if (user) {
        try {
          const token = await user.getIdTokenResult();
          this.isAdmin.set(token.claims['admin'] === true);
        } catch {
          this.isAdmin.set(false);
        }
      } else {
        this.isAdmin.set(false);
      }
    });
  }

  async signInWithGoogle(): Promise<void> {
    await signInWithPopup(this.auth, new GoogleAuthProvider());
  }

  async signOut(): Promise<void> {
    await signOut(this.auth);
  }
}
