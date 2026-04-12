import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../../core/auth.service';

@Component({
  selector: 'app-login',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="login">
      <div class="card">
        <h1>Welcome</h1>
        <p>Sign in to start chatting with your AI assistant.</p>
        <button class="primary" (click)="signIn()">
          Continue with Google
        </button>
      </div>
    </div>
  `,
  styles: [
    `
      .login {
        display: grid;
        place-items: center;
        min-height: 60vh;
      }
      .card { max-width: 380px; text-align: center; }
      h1 { margin-top: 0; }
    `,
  ],
})
export class LoginComponent {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  async signIn(): Promise<void> {
    await this.auth.signInWithGoogle();
    await this.router.navigateByUrl('/');
  }
}
