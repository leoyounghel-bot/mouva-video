import type { CodexOptions, Thread, ThreadOptions } from '@openai/codex-sdk' with { 'resolution-mode': 'import' };
export type ClientFactory = (options: CodexOptions) => Promise<{ startThread(options: ThreadOptions): Pick<Thread, 'runStreamed'> & { id?: string | null } }>;
export interface Provider { provider: 'gemini' | 'anthropic'; model: string; apiKey: string; baseUrl?: string; }
export interface Usage { harness: 'codex'; provider: 'gemini' | 'anthropic'; model: string; inputTokens: number; cachedInputTokens: number; outputTokens: number; }
export interface RunOptions {
  provider: Provider; prompt: string; system?: string; schema?: Record<string, unknown>; nativeSchema?: boolean;
  jsonOnly?: boolean; maxOutputTokens?: number; maxResponseBytes?: number; signal?: AbortSignal;
  onUsage?: (usage: Usage) => void;
}
export interface Chunk { type: 'text-delta' | 'done' | 'error'; text?: string; error?: string; code?: string; status?: number; usage?: Usage; threadId?: string; providerRequestId?: string; }
export class HarnessError extends Error { code: string; status: number; constructor(code: string, status?: number); }
export function isRuntimeInstalled(): Promise<boolean>;
export function createHarness(configuration?: { env?: NodeJS.ProcessEnv; clientFactory?: ClientFactory; fetchImpl?: typeof fetch; allowedTools?: readonly string[] }): {
  stream(options: RunOptions): AsyncGenerator<Chunk>;
  generate(options: RunOptions): Promise<{ text: string; usage: Usage; threadId?: string; providerRequestId?: string }>;
};
