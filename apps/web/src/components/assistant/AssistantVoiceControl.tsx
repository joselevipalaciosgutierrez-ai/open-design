import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useI18n } from '../../i18n';
import type { VoiceSessionError } from '../../runtime/assistant/voice-session';
import { AssistantMonkey } from './AssistantMonkey';
import { getAssistantCopy } from './assistant-copy';
import { createSpeechStream, type SpeechStream } from '../../runtime/assistant/speech-stream';
import {
  markSpokenTurn,
  setAssistantStage,
  speechMouthLevel,
  setStageOnSend,
  takeStageOnSend,
  setAwaitingSpokenReply,
  takeAwaitingSpokenReply,
  useAssistantStage,
} from '../../state/assistant-voice-store';
import { useVoiceAssistant } from './use-voice-assistant';
import styles from './AssistantVoiceControl.module.css';

export interface AssistantReply {
  /** The reply message; the same id while it is being written. */
  id: string;
  text: string;
  /** False while the reply is still being written; it is read as it arrives. */
  done?: boolean;
}

export interface AssistantVoiceControlProps {
  /** An agent is working: the monkey thinks. */
  thinking: boolean;
  /** What the person said, as a message for the orchestrator. */
  onTranscript: (text: string) => void;
  /** The newest finished reply. It is read aloud only if it answers something said by voice. */
  reply: AssistantReply | null;
  size?: number;
  /**
   * Where the control lives. `home`: holding the monkey stands it out large at
   * the left. `chat`: holding or clicking it brings it out softly. `off`
   * (design, previews): it stays in the composer.
   */
  stageMode?: 'home' | 'chat' | 'off';
}

const NOTICE_MS = 6000;
const HOLD_MS = 450;
const STAGE_IDLE_MS = 12_000;
const STAGE_EXIT_MS = 160;
const STAGE_SIZE = { big: 190, subtle: 100 } as const;

/**
 * The assistant in the composer: click the monkey, say what you want, stop
 * talking, and it answers out loud. Replies to typed messages stay silent;
 * only a spoken request gets a spoken answer.
 */
export function AssistantVoiceControl({ thinking, onTranscript, reply, size = 42, stageMode = 'off' }: AssistantVoiceControlProps) {
  const { locale } = useI18n();
  const copy = getAssistantCopy(locale);
  const lang = locale.toLowerCase().startsWith('es') ? 'es-MX' : 'en-US';
  const [notice, setNotice] = useState<VoiceSessionError | null>(null);
  // A finished reply already on screen is old. One still being written may be
  // the answer to what was just said on Home, before this control mounted.
  const lastReplyId = useRef<string | null>(reply && reply.done !== false ? reply.id : null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showNotice = useCallback((error: VoiceSessionError) => {
    setNotice(error);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setNotice(null), NOTICE_MS);
  }, []);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  const handleTranscript = useCallback(
    (text: string) => {
      setAwaitingSpokenReply(true);
      markSpokenTurn();
      if (takeStageOnSend()) setAssistantStage('big');
      setNotice(null);
      onTranscript(text);
    },
    [onTranscript],
  );

  const { phase, monkeyState, toggle, speak } = useVoiceAssistant({
    lang,
    onTranscript: handleTranscript,
    onNotice: showNotice,
    thinking,
  });

  // The reply to a spoken request is read as it is written, sentence by
  // sentence, instead of after the run closes.
  const streamRef = useRef<{ id: string; stream: SpeechStream } | null>(null);
  useEffect(() => {
    if (!reply) return;
    if (streamRef.current?.id !== reply.id) {
      if (reply.id === lastReplyId.current) return;
      lastReplyId.current = reply.id;
      if (!takeAwaitingSpokenReply()) return;
      streamRef.current = { id: reply.id, stream: createSpeechStream({ lang }) };
    }
    const done = reply.done !== false;
    for (const piece of streamRef.current.stream.push(reply.text, done)) void speak(piece);
    if (done) streamRef.current = null;
  }, [reply, speak, lang]);

  // Press and hold stands the monkey out; a plain click works as it always did.
  const stage = useAssistantStage();
  // Only a chat gives the assistant a stage; Home just listens and design keeps it in the composer.
  const staged = stageMode === 'chat' && stage !== 'off';
  const [exiting, setExiting] = useState(false);
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const heldRef = useRef(false);
  const stageIdle = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clearHold = () => {
    if (holdTimer.current) clearTimeout(holdTimer.current);
    holdTimer.current = null;
  };
  const onPointerDown = () => {
    heldRef.current = false;
    if (stageMode === 'off') return;
    clearHold();
    holdTimer.current = setTimeout(() => {
      holdTimer.current = null;
      heldRef.current = true;
      setExiting(false);
      // Holding listens. In a chat it also comes out softly; from Home it comes
      // out large once what was said opens the chat.
      toggle();
      if (stageMode === 'chat') setAssistantStage('subtle');
      else setStageOnSend(true);
    }, HOLD_MS);
  };
  const handleClick = () => {
    clearHold();
    if (heldRef.current) {
      heldRef.current = false;
      return;
    }
    toggle();
  };
  useEffect(() => clearHold, []);

  // Left alone for a while, the monkey folds back into the composer.
  useEffect(() => {
    if (stageIdle.current) clearTimeout(stageIdle.current);
    stageIdle.current = null;
    if (!staged || phase !== 'idle') return;
    stageIdle.current = setTimeout(() => {
      setExiting(true);
      stageIdle.current = setTimeout(() => {
        setAssistantStage('off');
        setExiting(false);
      }, STAGE_EXIT_MS);
    }, STAGE_IDLE_MS);
    return () => {
      if (stageIdle.current) clearTimeout(stageIdle.current);
    };
  }, [staged, phase]);

  const label =
    phase === 'speaking' ? copy.stopTalking : phase === 'listening' ? copy.stopListening : copy.talk;

  return (
    <span
      className={styles.wrap}
      onPointerDown={onPointerDown}
      onPointerUp={clearHold}
      onPointerLeave={clearHold}
      onPointerCancel={clearHold}
    >
      {notice ? (
        <span className={styles.notice} role="status" data-testid="assistant-notice">
          {copy.noticeFor(notice)}
        </span>
      ) : null}
      <span className={styles.stage} data-speaking={phase === 'speaking' ? 'true' : undefined} data-staged={staged ? 'true' : undefined}>
        <AssistantMonkey state={monkeyState} size={size} label={label} onClick={handleClick}
          publishLevel={!staged}
          mouthLevelRef={speechMouthLevel}
          rings={false}
        />
      </span>
      {staged && typeof document !== 'undefined'
        ? createPortal(
            <div
              className={styles.standing}
              data-kind={stage}
              data-exiting={exiting ? 'true' : undefined}
              data-speaking={phase === 'speaking' ? 'true' : undefined}
              data-testid="assistant-stage"
            >
              <AssistantMonkey
                state={monkeyState}
                size={STAGE_SIZE[stage === 'big' ? 'big' : 'subtle']}
                label={label}
                onClick={toggle}
                publishLevel
                mouthLevelRef={speechMouthLevel}
                rings={false}
              />
            </div>,
            document.body,
          )
        : null}
    </span>
  );
}
