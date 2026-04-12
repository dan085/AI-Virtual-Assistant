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
  agentId: string;
  agentDisplayName: string;
  usage?: { inputTokens?: number; outputTokens?: number };
  toolCalls?: Array<{ name: string; input: unknown }>;
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
}

export interface ListAgentsResponse {
  agents: AgentSummary[];
  skills: SkillDescriptor[];
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

  async listAvailableAgents(): Promise<ListAgentsResponse> {
    const callable = httpsCallable<void, ListAgentsResponse>(
      this.fns,
      'listAvailableAgents',
    );
    const res = await callable();
    return res.data;
  }
}
