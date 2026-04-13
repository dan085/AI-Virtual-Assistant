/**
 * Per-request context that every skill (tool) needs in order to write
 * back to the correct user's data. Genkit tools are pure functions, so
 * we pass the context in via a factory pattern: `buildTools(ctx)`.
 */
export interface ToolContext {
  /** Firebase Auth uid of the caller. Tools use this to scope writes. */
  uid: string;
  /** Conversation the tool call is happening inside (for audit trails). */
  conversationId: string;
}
