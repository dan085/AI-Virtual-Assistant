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
  accountId: string;
  handle?: string;
  accessToken: string;
  refreshToken?: string;
  expiresAt?: number;
  scopes?: string[];
  connectedAt?: number;
}

export interface SocialPublishRequest {
  mediaType: SocialMediaType;
  caption?: string;
  imageUrl?: string;
  videoUrl?: string;
  coverUrl?: string;
  children?: Array<{ imageUrl?: string; videoUrl?: string }>;
  options?: Record<string, unknown>;
}

export interface SocialPublishResult {
  remoteId: string;
  permalink?: string;
  meta?: Record<string, unknown>;
}

export interface OAuthStartResult {
  authorizeUrl: string;
  state: string;
}

export interface OAuthCallbackContext {
  /** Nonce extracted from the state parameter — used to look up per-flow
   *  secrets like PKCE verifiers. */
  nonce: string;
}

export interface OAuthCallbackResult {
  account: SocialAccount;
}

export interface SocialPlatform {
  readonly id: SocialPlatformId;
  readonly label: string;
  readonly supportedMediaTypes: readonly SocialMediaType[];

  isConfigured(): boolean;

  /** Build an OAuth authorization URL. May persist per-flow state (PKCE). */
  buildAuthorizeUrl(uid: string, redirectUri: string): Promise<OAuthStartResult>;

  /** Exchange the authorization code for tokens and fetch account metadata. */
  handleCallback(
    code: string,
    redirectUri: string,
    ctx: OAuthCallbackContext,
  ): Promise<OAuthCallbackResult>;

  /** Publish a post using the stored per-user account. */
  publish(
    account: SocialAccount,
    req: SocialPublishRequest,
  ): Promise<SocialPublishResult>;
}
