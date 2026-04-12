import { Injectable, inject } from '@angular/core';
import { Functions, httpsCallable } from '@angular/fire/functions';

// ---------- Chat ----------
export interface ChatRequest {
  conversationId: string;
  message: string;
  agentId?: string;
}
export interface ChatResponse {
  conversationId: string;
  reply: string;
  agentId: string;
  agentDisplayName: string;
  usage?: { inputTokens?: number; outputTokens?: number };
  toolCalls?: Array<{ name: string; input: unknown }>;
}

// ---------- Instagram (legacy platform-wide token) ----------
export type InstagramMediaType =
  | 'IMAGE'
  | 'VIDEO'
  | 'REELS'
  | 'STORIES'
  | 'CAROUSEL';

export interface PublishRequest {
  mediaType: InstagramMediaType;
  caption?: string;
  imageUrl?: string;
  videoUrl?: string;
  coverUrl?: string;
  shareToFeed?: boolean;
  children?: Array<{ imageUrl?: string; videoUrl?: string }>;
  draftId?: string;
}
export interface PublishResponse {
  mediaId: string;
  creationId: string;
  postDocId: string;
  mediaType: InstagramMediaType;
}

// ---------- Agents ----------
export interface AgentSummary {
  id: string;
  displayName: string;
  tagline: string;
  description: string;
  skills: string[];
}
export interface SkillDescriptor {
  id: string;
  label: string;
  description: string;
  category?: string;
}
export interface ProviderStatus {
  id: string;
  label: string;
  configured: boolean;
}
export interface ListAgentsResponse {
  agents: AgentSummary[];
  skills: SkillDescriptor[];
  videoProviders?: ProviderStatus[];
  imageProviders?: ProviderStatus[];
}

// ---------- Social (multi-platform, per-user OAuth) ----------
export type SocialPlatformId = 'instagram' | 'facebook' | 'twitter' | 'tiktok';
export type SocialMediaType =
  | 'IMAGE'
  | 'VIDEO'
  | 'REEL_OR_SHORT'
  | 'STORY'
  | 'CAROUSEL'
  | 'TEXT';

export interface ConnectedSocialAccount {
  platform: SocialPlatformId;
  accountId: string;
  handle?: string;
  scopes?: string[];
  connectedAt?: number;
  expiresAt?: number;
}
export interface AvailablePlatform {
  id: SocialPlatformId;
  label: string;
  configured: boolean;
  supportedMediaTypes: SocialMediaType[];
}
export interface ListConnectionsResponse {
  connected: ConnectedSocialAccount[];
  available: AvailablePlatform[];
}
export interface StartOAuthResponse {
  authorizeUrl: string;
  state: string;
}
export interface SocialPublishRequest {
  platform: SocialPlatformId;
  mediaType: SocialMediaType;
  caption?: string;
  imageUrl?: string;
  videoUrl?: string;
  coverUrl?: string;
}

@Injectable({ providedIn: 'root' })
export class ApiService {
  private readonly fns = inject(Functions);

  // ----- Chat -----
  async chatWithAgent(req: ChatRequest): Promise<ChatResponse> {
    const cb = httpsCallable<ChatRequest, ChatResponse>(this.fns, 'chatWithAgent');
    return (await cb(req)).data;
  }

  // ----- Instagram (legacy) -----
  async publishToInstagram(req: PublishRequest): Promise<PublishResponse> {
    const cb = httpsCallable<PublishRequest, PublishResponse>(this.fns, 'publishToInstagram');
    return (await cb(req)).data;
  }

  // ----- Agents -----
  async listAvailableAgents(): Promise<ListAgentsResponse> {
    const cb = httpsCallable<void, ListAgentsResponse>(this.fns, 'listAvailableAgents');
    return (await cb()).data;
  }

  // ----- Social (multi-platform) -----
  async listSocialConnections(): Promise<ListConnectionsResponse> {
    const cb = httpsCallable<void, ListConnectionsResponse>(this.fns, 'listSocialConnections');
    return (await cb()).data;
  }

  async startSocialOAuth(platform: SocialPlatformId): Promise<StartOAuthResponse> {
    const cb = httpsCallable<{ platform: SocialPlatformId; origin: string }, StartOAuthResponse>(
      this.fns,
      'startSocialOAuth',
    );
    return (await cb({ platform, origin: window.location.origin })).data;
  }

  async disconnectSocial(platform: SocialPlatformId): Promise<void> {
    const cb = httpsCallable<{ platform: SocialPlatformId }, { ok: boolean }>(
      this.fns,
      'disconnectSocial',
    );
    await cb({ platform });
  }

  async publishToSocial(
    req: SocialPublishRequest,
  ): Promise<{ remoteId: string; permalink?: string }> {
    const cb = httpsCallable<SocialPublishRequest, { remoteId: string; permalink?: string }>(
      this.fns,
      'publishToSocial',
    );
    return (await cb(req)).data;
  }
}
