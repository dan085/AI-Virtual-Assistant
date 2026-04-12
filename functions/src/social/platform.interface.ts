/**
 * Multi-platform social publishing abstraction.
 *
 * Each social platform (Instagram, Twitter/X, TikTok, …) implements
 * this interface. User-owned OAuth tokens are stored in Firestore at
 * `users/{uid}/socialAccounts/{platformId}` and loaded per call.
 *
 * SAFETY: this layer NEVER stores client secrets in Firestore. Only
 * the per-user access/refresh tokens. Client secrets stay in Firebase
 * Functions secrets (firebase functions:secrets:set ...).
 */

export type SocialPlatformId = 'instagram' | 'facebook' | 'twitter' | 'tiktok';

export type SocialMediaType =
  | 'IMAGE'
  | 'VIDEO'
  | 'REEL_OR_SHORT'
  | 'STORY'
  | 'CAROUSEL'
  | 'TEXT';

export interface SocialAccount {
  platform: SocialPlatformId;
  /** Platform-specific account id (e.g. IG business id, Twitter user id, TikTok open_id). */
  accountId: string;
  /** Handle/username shown in UI. */
  handle?: string;
  /** OAuth tokens — NEVER log or return these to the client. */
  accessToken: string;
  refreshToken?: string;
  /** Unix seconds when the access token expires. */
  expiresAt?: number;
  /** Granted OAuth scopes. */
  scopes?: string[];
  /** When this connection was created. */
  connectedAt?: number;
}

export interface SocialPublishRequest {
  mediaType: SocialMediaType;
  caption?: string;
  imageUrl?: string;
  videoUrl?: string;
  coverUrl?: string;
  children?: Array<{ imageUrl?: string; videoUrl?: string }>;
  /** Platform-specific options. */
  options?: Record<string, unknown>;
}

export interface SocialPublishResult {
  /** Platform-native post id. */
  remoteId: string;
  /** Canonical URL of the published post (if the platform returns one). */
  permalink?: string;
  /** Any additional metadata worth persisting. */
  meta?: Record<string, unknown>;
}

export interface OAuthStartResult {
  /** Full URL the client should redirect the browser to. */
  authorizeUrl: string;
  /** Opaque state string to validate on callback. */
  state: string;
}

export interface OAuthCallbackResult {
  account: SocialAccount;
}

export interface SocialPlatform {
  readonly id: SocialPlatformId;
  readonly label: string;
  readonly supportedMediaTypes: readonly SocialMediaType[];

  /** Whether the OAuth client credentials for this platform are configured. */
  isConfigured(): boolean;

  /** Build an OAuth authorization URL. `uid` is embedded in the state. */
  buildAuthorizeUrl(uid: string, redirectUri: string): OAuthStartResult;

  /** Exchange the authorization code for tokens and fetch account metadata. */
  handleCallback(code: string, redirectUri: string): Promise<OAuthCallbackResult>;

  /** Publish a post using the stored per-user account. */
  publish(
    account: SocialAccount,
    req: SocialPublishRequest,
  ): Promise<SocialPublishResult>;
}
