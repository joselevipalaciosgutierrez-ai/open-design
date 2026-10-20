# Asistente con voz (el mono)

Estado: en uso. El mono vive en el compositor (Inicio y chat de proyecto); un clic
lo hace escuchar, se da cuenta solo de cuándo terminas, transcribe, manda la
petición al orquestador y lee la respuesta en voz alta.

## Piezas

| Pieza | Dónde |
| --- | --- |
| Cara y movimiento (estados, cejas, orejas, boca por sílabas con lengua) | `apps/web/src/components/assistant/AssistantMonkey.tsx`, `runtime/assistant/monkey-motion.ts` |
| Aura: una gota líquida y delgada alrededor del mono (calma al escuchar, sigue la voz al hablar; WebGL, con anillo CSS si no hay WebGL) | `components/assistant/MonkeyAura.tsx`, `runtime/assistant/aura-shader.ts` |
| Un clic → escuchar → texto → respuesta en voz | `components/assistant/AssistantVoiceControl.tsx`, `use-voice-assistant.ts` |
| Fin de frase automático | `runtime/assistant/endpointing.ts` |
| Micrófono → WAV 16 kHz | `runtime/assistant/wav.ts`, `voice-session.ts` |
| Texto apto para voz (sin código ni markdown, resumen corto) | `runtime/assistant/speech-text.ts` |
| Ajustes (Ajustes → Apariencia → Asistente): paleta del aura (Siri por defecto, Neón, Océano, Atardecer o un color propio), voz, velocidad, leer respuestas | `components/appearance/AssistantSettings.tsx`, `state/assistant-prefs.ts` |
| Hablar: voces del Mac con `say` | `apps/daemon/src/speech/tts.ts` |
| Escuchar: whisper.cpp local | `apps/daemon/src/speech/stt.ts` |
| HTTP y CLI | `GET /api/speech/status|voices`, `POST /api/speech/speak|stop|warmup|transcribe`; `od speech status|voices|say|stop|transcribe` |

## Escucha (whisper.cpp)

No sale ningún audio del equipo. El daemon busca, sin descargar nada por su cuenta:

1. `OD_WHISPER_BIN` / `OD_WHISPER_MODEL` (y `OD_WHISPER_SERVER_BIN`), si existen;
2. `<datos>/speech/whisper/{whisper-cli,whisper-server,ggml-*.bin}`;
3. `whisper-cli` o `whisper-cpp` en el `PATH`.

Elige el modelo multilingüe más grande que encuentre (`large-v3-turbo`, `medium`,
`small`, `base`, `tiny`; nunca los `.en`).

**Velocidad.** Cargar el modelo tarda segundos, así que se mantiene un
`whisper-server` residente (arranca al primer uso o con `/api/speech/warmup`, que
la app llama en cuanto se hace clic en el mono, y se apaga tras 10 minutos sin
uso). Con `-ac 768` (15 s de contexto) una frase tarda ≈1,3 s en un M4 con
`large-v3-turbo` cuantizado; sin él, ≈2,5 s. Si el servidor no puede correr, o el
audio dura más de 14,5 s, responde la CLI de un solo uso (más lenta). La app
corta lo que dices a los 14 s por esa razón.

### Instalación (macOS, Apple Silicon)

Se compila una vez; se necesita `git`, un compilador y `cmake` (`pip install cmake`
sirve). Los binarios van estáticos y con el código Metal embebido, para poder
copiarlos solos:

```bash
git clone --depth 1 https://github.com/ggml-org/whisper.cpp
cd whisper.cpp
cmake -B build -DCMAKE_BUILD_TYPE=Release -DBUILD_SHARED_LIBS=OFF \
  -DGGML_METAL=ON -DGGML_METAL_EMBED_LIBRARY=ON -DWHISPER_BUILD_TESTS=OFF
cmake --build build -j 8 --target whisper-cli whisper-server
# copiar build/bin/whisper-cli y build/bin/whisper-server a <datos>/speech/whisper/
# y el modelo ggml-large-v3-turbo-q5_0.bin (≈574 MB) de
# https://huggingface.co/ggerganov/whisper.cpp junto a ellos.
```

## Voz

`say` con las voces del Mac. Las Premium o Enhanced (Ajustes del Sistema,
Accesibilidad, Contenido hablado, Voz del sistema, Administrar voces) aparecen
solas y se prefieren. Se ignoran las voces de juguete y las robóticas
(Eloquence). Fuera de macOS el navegador habla con su propia voz.

## Aura

Una gota de luz con tres tonos, dibujada con un shader de ruido detrás del mono
(`MonkeyAura`). Escuchando es fija: una respiración lenta, sin viajar. Hablando
sigue la voz: se hincha, ondula más y se mueve más rápido con cada sílaba, con
topes para que siga siendo un halo (`auraDrive`). La "voz" es la apertura de la
boca del mono (`setAssistantLevel`), que va a ritmo de sílabas: `say` no entrega
el audio, así que no es la amplitud real. En desarrollo, `__odAssistant.setPhase()`
y `.setLevel()` en la consola permiten verla sin micrófono.

## Pendiente

- Probar el micrófono dentro de Electron empaquetado (el panel de vista previa
  del navegador lo bloquea; hay que confirmar `NSMicrophoneUsageDescription` en el
  `Info.plist` del paquete).
- Voces más naturales que las del sistema (Kokoro u otra local) detrás de la misma
  interfaz de `tts.ts`.
- Mono en la mascota flotante del escritorio y seguimiento del cursor fuera de la ventana.
- Transcripción en streaming (hoy se transcribe al terminar la frase).
