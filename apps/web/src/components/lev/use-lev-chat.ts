import { useCallback, useEffect, useRef, useState } from 'react';
import type { ChatMessage, PersistedAgentEvent } from '@open-design/contracts';
import { streamViaDaemon } from '../../providers/daemon';
import { listMessages, saveMessage } from '../../state/projects';
import { fetchLevSpace, levSession, startLevSession } from '../../state/lev-session';

export interface LevAgentChoice {
  agentId: string | null;
  model?: string | null;
  reasoning?: string | null;
}

function newId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

/** Events worth keeping on the saved reply: the token meter reads them. */
const KEPT_EVENT_KINDS = new Set(['usage', 'request_usage']);

/**
 * The general chat's conversation with Lev: its messages, a reply streaming
 * in, and sending. Messages are stored in Lev's session like any project
 * conversation, so a session can be resumed later, here or from `od lev`.
 */
export function useLevChat(agent: LevAgentChoice) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => () => abortRef.current?.abort(), []);

  const load = useCallback(async (projectId: string, sessionId: string) => {
    setError(null);
    try {
      setMessages(await listMessages(projectId, sessionId));
    } catch {
      setMessages([]);
    }
  }, []);

  const clear = useCallback(() => {
    abortRef.current?.abort();
    setMessages([]);
    setStreaming(false);
    setError(null);
  }, []);

  /** Sends to the current session, or to a new one when `fresh` (the chat was folded). */
  const send = useCallback(
    async (text: string, options: { fresh: boolean; sessionMode?: 'chat' }) => {
      const content = text.trim();
      if (!content || streaming) return;
      if (!agent.agentId) {
        setError('Elige un agente en Ajustes para hablar con Lev.');
        return;
      }
      setError(null);
      let { projectId, sessionId } = levSession();
      try {
        if (!projectId) projectId = (await fetchLevSpace()).projectId;
        if (options.fresh || !sessionId) {
          sessionId = await startLevSession(projectId);
          setMessages([]);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
        return;
      }
      const user: ChatMessage = { id: newId(), role: 'user', content, createdAt: Date.now(), sessionMode: 'chat' };
      const assistant: ChatMessage = {
        id: newId(),
        role: 'assistant',
        content: '',
        createdAt: Date.now(),
        agentId: agent.agentId,
        runStatus: 'running',
        sessionMode: 'chat',
      };
      const history = [...(options.fresh ? [] : messages), user];
      setMessages([...history, assistant]);
      setStreaming(true);
      void saveMessage(projectId, sessionId, user, { createOnly: true });

      const controller = new AbortController();
      abortRef.current = controller;
      const events: PersistedAgentEvent[] = [];
      let reply = '';
      const update = (patch: Partial<ChatMessage>) =>
        setMessages((current) => current.map((m) => (m.id === assistant.id ? { ...m, ...patch } : m)));
      const finish = (status: 'succeeded' | 'failed', finalText: string) => {
        setStreaming(false);
        const done: ChatMessage = { ...assistant, content: finalText, runStatus: status, events, endedAt: Date.now() };
        update(done);
        void saveMessage(projectId!, sessionId!, done, { telemetryFinalized: true });
      };
      void streamViaDaemon({
        agentId: agent.agentId,
        history,
        signal: controller.signal,
        projectId,
        conversationId: sessionId,
        sessionMode: 'chat',
        userMessageId: user.id,
        assistantMessageId: assistant.id,
        clientRequestId: newId(),
        model: agent.model ?? null,
        reasoning: agent.reasoning ?? null,
        // The first turn names the session, so the session list reads well.
        titleGeneration: { enabled: true },
        onRunCreated: (runId: string) => update({ runId }),
        handlers: {
          onDelta: (delta) => {
            reply += delta;
            update({ content: reply });
          },
          onAgentEvent: (event) => {
            if (KEPT_EVENT_KINDS.has(event.kind)) events.push(event);
          },
          onDone: (fullText) => finish('succeeded', fullText || reply),
          onError: (err) => {
            setError(err.message);
            finish('failed', reply);
          },
        },
      } as Parameters<typeof streamViaDaemon>[0]);
    },
    [agent.agentId, agent.model, agent.reasoning, messages, streaming],
  );

  return { messages, streaming, error, send, load, clear };
}
