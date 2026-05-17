import { Injectable, NgZone } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { BehaviorSubject, Observable, from } from 'rxjs';
import { map, tap } from 'rxjs/operators';
import { Application, ApplicationSettings, Utils } from '@nativescript/core';
import { environment } from '../../environments/environment';

export interface AuthTokens {
  access_token: string;
  refresh_token?: string;
  id_token?: string;
  expires_at: number; // epoch ms
}

export interface Auth0UserProfile {
  sub: string;
  name?: string;
  given_name?: string;
  family_name?: string;
  email?: string;
  picture?: string;
}

const TOKEN_KEY = 'auth_tokens';

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private tokensSubject = new BehaviorSubject<AuthTokens | null>(this.loadStoredTokens());
  isAuthenticated$: Observable<boolean> = this.tokensSubject.pipe(
    map(tokens => !!tokens && tokens.expires_at > Date.now())
  );

  private pendingCodeVerifier: string | null = null;

  constructor(private http: HttpClient, private ngZone: NgZone) {
    // Listen for deep link callbacks (Android)
    Application.android?.on('activityNewIntent', (args: any) => {
      const intent = args.intent;
      const data = intent?.getData();
      if (data) {
        const url = data.toString();
        if (url.startsWith(environment.AUTH_REDIRECT_URI)) {
          this.ngZone.run(() => this.handleCallback(url));
        }
      }
    });
  }

  get isAuthenticated(): boolean {
    const tokens = this.tokensSubject.value;
    return !!tokens && tokens.expires_at > Date.now();
  }

  get accessToken(): string | null {
    return this.tokensSubject.value?.access_token ?? null;
  }

  get userId(): string | null {
    const idToken = this.tokensSubject.value?.id_token;
    if (!idToken) return null;
    try {
      const payload = JSON.parse(atob(idToken.split('.')[1]));
      return payload.sub ?? null;
    } catch {
      return null;
    }
  }

  getUserProfile(): Auth0UserProfile | null {
    const idToken = this.tokensSubject.value?.id_token;
    if (!idToken) return null;
    try {
      return JSON.parse(atob(idToken.split('.')[1])) as Auth0UserProfile;
    } catch {
      return null;
    }
  }

  login(): void {
    const verifier = this.generateCodeVerifier();
    this.pendingCodeVerifier = verifier;
    const challenge = this.generateCodeChallenge(verifier);

    const params = new HttpParams()
      .set('response_type', 'code')
      .set('client_id', environment.AUTH_CLIENT_ID)
      .set('redirect_uri', environment.AUTH_REDIRECT_URI)
      .set('scope', 'openid profile email offline_access')
      .set('audience', environment.AUTH_AUDIENCE)
      .set('code_challenge', challenge)
      .set('code_challenge_method', 'S256');

    const url = `https://${environment.AUTH_DOMAIN}/authorize?${params.toString()}`;
    Utils.openUrl(url);
  }

  handleCallback(callbackUrl: string): void {
    const queryStart = callbackUrl.indexOf('?');
    if (queryStart === -1) return;
    const params = new URLSearchParams(callbackUrl.substring(queryStart + 1));
    const code = params.get('code');
    if (!code || !this.pendingCodeVerifier) return;

    const verifier = this.pendingCodeVerifier;
    this.pendingCodeVerifier = null;

    const body = new HttpParams()
      .set('grant_type', 'authorization_code')
      .set('client_id', environment.AUTH_CLIENT_ID)
      .set('code', code)
      .set('redirect_uri', environment.AUTH_REDIRECT_URI)
      .set('code_verifier', verifier);

    this.http.post<any>(`https://${environment.AUTH_DOMAIN}/oauth/token`, body.toString(), {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
    }).subscribe({
      next: (response) => {
        const tokens: AuthTokens = {
          access_token: response.access_token,
          refresh_token: response.refresh_token,
          id_token: response.id_token,
          expires_at: Date.now() + (response.expires_in * 1000)
        };
        this.storeTokens(tokens);
        this.tokensSubject.next(tokens);
      },
      error: (err) => console.error('Token exchange failed:', err)
    });
  }

  refreshToken(): Observable<AuthTokens> {
    const refreshToken = this.tokensSubject.value?.refresh_token;
    if (!refreshToken) throw new Error('No refresh token available');

    const body = new HttpParams()
      .set('grant_type', 'refresh_token')
      .set('client_id', environment.AUTH_CLIENT_ID)
      .set('refresh_token', refreshToken);

    return this.http.post<any>(`https://${environment.AUTH_DOMAIN}/oauth/token`, body.toString(), {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
    }).pipe(
      map(response => ({
        access_token: response.access_token,
        refresh_token: response.refresh_token ?? refreshToken,
        id_token: response.id_token,
        expires_at: Date.now() + (response.expires_in * 1000)
      })),
      tap(tokens => {
        this.storeTokens(tokens);
        this.tokensSubject.next(tokens);
      })
    );
  }

  logout(): void {
    ApplicationSettings.remove(TOKEN_KEY);
    this.tokensSubject.next(null);
    const logoutUrl = `https://${environment.AUTH_DOMAIN}/v2/logout?client_id=${environment.AUTH_CLIENT_ID}&returnTo=${encodeURIComponent(environment.AUTH_REDIRECT_URI)}`;
    Utils.openUrl(logoutUrl);
  }

  private loadStoredTokens(): AuthTokens | null {
    try {
      const raw = ApplicationSettings.getString(TOKEN_KEY);
      if (!raw) return null;
      const tokens: AuthTokens = JSON.parse(raw);
      return tokens.expires_at > Date.now() ? tokens : null;
    } catch {
      return null;
    }
  }

  private storeTokens(tokens: AuthTokens): void {
    ApplicationSettings.setString(TOKEN_KEY, JSON.stringify(tokens));
  }

  private generateCodeVerifier(): string {
    const array = new Uint8Array(32);
    for (let i = 0; i < array.length; i++) {
      array[i] = Math.floor(Math.random() * 256);
    }
    return btoa(String.fromCharCode(...array))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=/g, '');
  }

  private generateCodeChallenge(verifier: string): string {
    // SHA-256 via SubtleCrypto is async; use a synchronous PKCE-compatible approach
    // For NativeScript Android, we'll use the Java MessageDigest
    const msgBuffer = new java.lang.String(verifier).getBytes('UTF-8');
    const md = java.security.MessageDigest.getInstance('SHA-256');
    const digest = md.digest(msgBuffer);
    const base64 = android.util.Base64.encodeToString(digest, android.util.Base64.NO_PADDING | android.util.Base64.NO_WRAP | android.util.Base64.URL_SAFE);
    return base64;
  }
}
