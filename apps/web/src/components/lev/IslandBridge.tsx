import { useCallback, useEffect, useRef, useState } from 'react';
import type { IslandCommand, IslandState } from '@open-design/contracts';
import { useI18n } from '../../i18n';
import { createSpeechStream, type SpeechStream } from '../../runtime/assistant/speech-stream';
import type { VoiceSessionError } from '../../runtime/assistant/voice-session';
import { speechMouthLevel } from '../../state/assistant-voice-store';
import { forgetCurrentLevSession, levSession } from '../../state/lev-session';
import { getAssistantCopy } from '../assistant/assistant-copy';
import { useVoiceAssistant } from '../assistant/use-voice-assistant';
import { visibleReplyText } from './LevChat';
import { useLevChat, type LevAgentChoice } from './use-lev-chat';

/** Home reloads Lev's conversation when a turn from the island lands in it. */
export const LEV_SESSION_UPDATED_EVENT = 'od:lev-session-updated';

const MOUTH_PUBLISH_MS = 66;

/**
 * The notch island's other end. The island has no assistant of its own: it
 * sends commands here (see contracts/api/island.ts), and this runs them with
 * the app's own pieces (Lev's current session, the same voice loop, the same
 * monkey states), then reports back what the island should show. Renders
 * nothing.
 */
export function IslandBridge({ agent }: { agent: LevAgentChoice }) {
  const { locale } = useI18n();
  const copy = getAssistantCopy(locale);
  const lang = locale.toLowerCase().startsWith('es') ? 'es-MX' : 'en-US';
  const lev = useLevChat(agent);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, setPending] = useState<{ text: string; spoken: boolean } | null>(null);
  const loadedSession = useRef<string | null>(null);
  const spokenTurn = useRef(false);

  /** Sends to Lev's current session, loading it first so the history is right. */
  const sendToLev = useCallback(async (text: string, spoken: boolean) => {
    const { projectId, sessionId } = levSession();
    if (projectId && sessionId && loadedSession.current !== sessionId) {
      await lev.load(projectId, sessionId);
      loadedSession.current = sessionId;
    }
    if (!sessionId) loadedSession.current = null;
    setPending({ text, spoken });
  }, [lev]);

  // The send runs once the loaded history is in, not from inside the load.
  const lastSent = useRef<{ text: string; spoken: boolean; retried: boolean } | null>(null);
  useEffect(() => {
    if (!pending || lev.streaming) return;
    setPending(null);
    spokenTurn.current = pending.spoken;
    lastSent.current = { ...pending, retried: lastSent.current?.text === pending.text && lastSent.current.retried };
    void lev.send(pending.text, { fresh: false });
  }, [pending, lev]);

  // The session was deleted elsewhere (Home, `od lev delete`): start a new one and send again, once.
  useEffect(() => {
    const sent = lastSent.current;
    if (!sent || sent.retried || !lev.error || !/conversation not found/i.test(lev.error)) return;
    lastSent.current = { ...sent, retried: true };
    forgetCurrentLevSession();
    loadedSession.current = null;
    lev.clear();
    setPending({ text: sent.text, spoken: sent.spoken });
  }, [lev]);

  const voice = useVoiceAssistant({
    lang,
    thinking: lev.streaming,
    onTranscript: (text) => {
      setNotice(null);
      void sendToLev(text, true);
    },
    onNotice: (error: VoiceSessionError) => setNotice(copy.noticeFor(error)),
  });

  // Commands from the island.
  const voiceRef = useRef(voice);
  voiceRef.current = voice;
  const sendRef = useRef(sendToLev);
  sendRef.current = sendToLev;
  useEffect(() => {
    if (typeof EventSource === 'undefined') return;
    const source = new EventSource('/api/island/commands');
    source.addEventListener('command', (event) => {
      let command: IslandCommand;
      try {
        command = JSON.parse((event as MessageEvent<string>).data) as IslandCommand;
      } catch {
        return;
      }
      if (command.action === 'voice') voiceRef.current.toggle();
      else if (command.action === 'stop') voiceRef.current.stopTalking();
      else if (command.action === 'say') void sendRef.current(command.text, false);
    });
    return () => source.close();
  }, []);

  // A spoken request is answered aloud, sentence by sentence as it is written.
  const last = lev.messages[lev.messages.length - 1];
  const replyText = last?.role === 'assistant' ? visibleReplyText(last.content, lev.streaming) : '';
  const stream = useRef<{ id: string; stream: SpeechStream } | null>(null);
  useEffect(() => {
    if (!last || last.role !== 'assistant') return;
    if (stream.current?.id !== last.id) {
      if (!spokenTurn.current || !lev.streaming) return;
      spokenTurn.current = false;
      stream.current = { id: last.id, stream: createSpeechStream({ lang }) };
    }
    const done = !lev.streaming;
    for (const piece of stream.current.stream.push(replyText, done)) void voice.speak(piece);
    if (done) stream.current = null;
  }, [last, replyText, lev.streaming, lang, voice]);

  // Home shows the same session: tell it when a turn from here finished.
  const wasStreaming = useRef(false);
  useEffect(() => {
    if (wasStreaming.current && !lev.streaming) {
      window.dispatchEvent(new CustomEvent(LEV_SESSION_UPDATED_EVENT, { detail: levSession() }));
    }
    wasStreaming.current = lev.streaming;
  }, [lev.streaming]);

  // What the island shows. The mouth follows the sound at ~15 Hz while speaking.
  const publish = useCallback((state: Omit<IslandState, 'appConnected' | 'updatedAt'>) => {
    void fetch('/api/island/state', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(state),
    }).catch(() => {});
  }, []);
  const snapshot = useRef<Omit<IslandState, 'appConnected' | 'updatedAt' | 'mouth'>>({ phase: 'idle', monkey: 'idle', reply: null, notice: null });
  snapshot.current = { phase: voice.phase, monkey: voice.monkeyState, reply: replyText || null, notice: notice ?? lev.error };
  useEffect(() => {
    publish({ ...snapshot.current, mouth: null });
  }, [voice.phase, voice.monkeyState, replyText, notice, lev.error, publish]);
  useEffect(() => {
    if (voice.phase !== 'speaking') return;
    const timer = setInterval(() => publish({ ...snapshot.current, mouth: speechMouthLevel.current }), MOUTH_PUBLISH_MS);
    return () => clearInterval(timer);
  }, [voice.phase, publish]);

  return null;
}
