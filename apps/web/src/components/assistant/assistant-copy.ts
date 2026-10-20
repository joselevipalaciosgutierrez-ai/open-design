import type { VoiceSessionError } from '../../runtime/assistant/voice-session';

/** The assistant's own texts. Spanish and English; other locales read English. */
export interface AssistantCopy {
  talk: string;
  stopListening: string;
  stopTalking: string;
  /** The assistant's name while it works on a spoken request. */
  thinking: string;
  noticeFor: (error: VoiceSessionError) => string;
}

const ES: AssistantCopy = {
  talk: 'Hablar con el asistente',
  stopListening: 'Dejar de escuchar',
  stopTalking: 'Callar al asistente',
  thinking: 'Lev está pensando…',
  noticeFor: (error) => {
    switch (error.code) {
      case 'mic-denied':
        return 'No puedo usar el micrófono. Actívalo para esta app en Ajustes del Sistema, Privacidad.';
      case 'no-speech':
        return 'No te escuché. Haz clic y habla de nuevo.';
      case 'stt-unavailable':
        return error.reason === 'model-missing'
          ? 'Falta el modelo de voz a texto. Aún no puedo entenderte.'
          : 'Falta instalar el motor de voz a texto (whisper.cpp). Aún no puedo entenderte.';
      default:
        return 'No pude entender el audio. Inténtalo de nuevo.';
    }
  },
};

const EN: AssistantCopy = {
  talk: 'Talk to the assistant',
  stopListening: 'Stop listening',
  stopTalking: 'Quiet the assistant',
  thinking: 'Lev is thinking…',
  noticeFor: (error) => {
    switch (error.code) {
      case 'mic-denied':
        return 'I can’t use the microphone. Allow it for this app in System Settings, Privacy.';
      case 'no-speech':
        return 'I didn’t hear you. Click and speak again.';
      case 'stt-unavailable':
        return error.reason === 'model-missing'
          ? 'The speech-to-text model is missing, so I can’t understand you yet.'
          : 'The speech-to-text engine (whisper.cpp) isn’t installed, so I can’t understand you yet.';
      default:
        return 'I couldn’t make out the audio. Try again.';
    }
  },
};

export function getAssistantCopy(locale: string): AssistantCopy {
  return locale.toLowerCase().startsWith('es') ? ES : EN;
}
