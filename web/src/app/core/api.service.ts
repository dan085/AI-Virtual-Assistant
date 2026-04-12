import { Injectable, inject } from '@angular/core';
import { Functions, httpsCallable } from '@angular/fire/functions';

export interface ChatRequest {
  conversationId: string;
  message: string;
  agentId?: string;
}

export interface ChatResponse {
  conversationId: string;
  reply: string;
  usage?: { inputTokens?: number; outputTokens?: number };
}

export interface PublishRequest {
  imageUrl: string;
  caption?: string;
  draftId?: string;
}

export interface PublishResponse {
  mediaId: string;
  creationId: string;
  postDocId: string;
}

@Injectable({ providedIn: 'root' })
export class ApiService {
  private readonly fns = inject(Functions);

  async chatWithAgent(req: ChatRequest): Promise<ChatResponse> {
    const callable = httpsCallable<ChatRequest, ChatResponse>(
      this.fns,
      'chatWithAgent',
    );
    const res = await callable(req);
    return res.data;
  }

  async publishToInstagram(req: PublishRequest): Promise<PublishResponse> {
    const callable = httpsCallable<PublishRequest, PublishResponse>(
      this.fns,
      'publishToInstagram',
    );
    const res = await callable(req);
    return res.data;
  }
}
