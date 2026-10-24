# Orquestador integrado y contexto compartido

Estado: diseño para revisión; fase 1 (medición) hecha, ver §5b. No hay código de esto todavía. Escrito en español
para quien lo revisa; los identificadores de código van en inglés.
Fuera de alcance, a petición del producto: el **modo Chat** no se toca hasta que
se defina su cambio.

Complementa `token-efficiency-beyond-harness2.md` (ahorro de tokens del prompt).

## 1. Objetivo

Que el usuario pueda pedir desde el orquestador "quiero diseñar y desarrollar
esta app", y que el orquestador reparta el trabajo entre los agentes que existan,
con muchos agentes o subagentes trabajando a la vez **sin gastar tokens de más y
sin bajar la calidad** de ninguno.

No objetivos: elegir el modelo por fase (lo elige el usuario, como hoy), tocar el
modo Chat, decidir tipografía o colores por el usuario.

## 2. Principios (con su evidencia)

| Principio | Por qué | Fuente |
| --- | --- | --- |
| El brief a cada agente lleva objetivo, formato de salida, guía de herramientas y límites | Sin eso los agentes duplican trabajo o dejan huecos | Anthropic, sistema multiagente de investigación (resúmenes de terceros) |
| Un mensaje suelto pierde decisiones implícitas | Dos agentes toman decisiones que chocan (estilo, paleta, API) | Cognition, "Don't Build Multi-Agents" |
| Multiagente cuesta ~15x tokens y encaja con trabajo en amplitud | Las tareas acopladas (diseño → desarrollo) rinden mejor en un hilo | Anthropic (resúmenes), Cognition |
| Los tokens explican gran parte de la calidad | No se ahorra quitando contexto a quien lo necesita; se ahorra quitando desperdicio | Anthropic (resúmenes) |
| Los límites van en código, no en el prompt | Un modelo puede ignorar un "no hagas bucles"; el daemon no | `delegation.ts` (ya aplicado) |

Las fuentes son resúmenes de terceros; los textos originales no se han leído.

## 3. Estado actual verificado

- El asistente por defecto se vuelve orquestador solo si hay agentes o está en el
  espacio de Lev (`apps/daemon/src/orchestrator-context.ts`). Recibe la lista de
  agentes con su tarjeta (`goodFor`, `notFor`, `delivers`) y su historial.
- Delegación (`apps/daemon/src/delegation.ts`): profundidad máxima 2 (agentes y sus
  subagentes), 8 ejecuciones delegadas por petición, 3 a la vez, 2 instancias del
  mismo agente a la vez (`DELEGATION_AGENT_BUSY`). Se cuenta por árbol, es decir por
  petición del usuario: dos proyectos distintos no se bloquean entre sí.
- Un delegado se lanza con `od run start` dentro de otra ejecución (`OD_RUN_ID`);
  el daemon deriva profundidad y raíz, el llamador no las declara (`cli.ts`).
- La encuesta previa ya existe: el `<question-form>` de la fase Requirements
  Clarification (`prompts/core-slim.ts`). Pregunta tipo de tarea, público, objetivo,
  plataforma y volumen; 1–3 preguntas (máx. 5); no pregunta por estilo con sistema de
  diseño activo; se salta con "empieza ya" o en cambios locales.
- Hay cuaderno por proyecto (`notebook.ts`: una línea por ejecución terminada),
  memoria, lecciones y un volcado de la transcripción (`conversation-history.ts`).
- El índice de skills y el cuaderno viajan por turno **delante** del prompt estable
  en `clientSystemPrompt` (`server.ts`), y el índice lleva rutas propias de cada
  ejecución.

## 4. Diseño

### 4.1 Orquestador integrado

- Es parte fija de la app, no un perfil que el usuario crea ni puede borrar. Tiene
  su sección en Ajustes para editar sus instrucciones, sus skills y su
  comportamiento de delegación.
- Sus reglas (cómo repartir, cuándo delegar, cómo escribir un brief) se inyectan
  **solo** en su ejecución. Un agente especializado recibe un **núcleo mínimo común**
  (seguridad, protocolo de entrega) más sus propias reglas y su brief; nunca las del
  orquestador.
- Sin agentes especializados, el orquestador trabaja solo con skills cargadas bajo
  demanda (`design-craft` ya existe). Delegar tiene coste; no es el valor por
  defecto.
- Crear agentes especializados es opcional. El orquestador puede **proponerlo**
  cuando detecte trabajo repetido o paralelo; nunca lo impone.

### 4.2 Encuesta antes de diseñar

- Se mantiene el mecanismo existente. La encuesta recoge **qué** hay que construir,
  no decisiones visuales.
- Se añade una opción: "Yo defino tipografía y colores" frente a "que lo decida el
  agente de diseño". Si el usuario lo dice directamente en su mensaje, no se
  pregunta.
- El orquestador **no toma decisiones visuales**. Lo que el usuario fije se anota en
  el libro de decisiones como `fijado por el usuario` y se pasa literal; lo demás lo
  decide el agente de diseño y se anota como `decidido por <agente>`.

### 4.3 Reparto del trabajo

1. El orquestador lee las tarjetas de los agentes y las respuestas de la encuesta.
2. Tareas independientes (investigar y estructurar) van en paralelo, dentro de los
   límites.
3. Tareas encadenadas (diseño → desarrollo de la misma app) van en secuencia pasando
   el libro de decisiones, o en un solo hilo si están muy acopladas.
4. Regla de delegar: solo si hay paralelismo real, una herramienta o runtime
   distinto, o una tarea larga que ensuciaría el contexto principal.

### 4.4 Libro de decisiones

Registro estructurado y corto por conversación, mantenido por el orquestador:

- Entradas: `{ clave, valor, origen: usuario | agente | orquestador, rol_destino[], ronda }`.
  Ejemplos: dirección visual, paleta, tipografías, plataforma, restricciones,
  preferencias, archivos creados, trabajo pendiente.
- Cada agente recibe **solo las entradas de su rol**, no el libro entero ni la
  conversación.
- Un puntero a la transcripción completa en archivo (patrón de `conversation.md`)
  para que el agente la lea solo si le falta un detalle.
- Almacén: tabla del daemon accesible por `/api/*` y por `od` (regla de doble vía
  UI/CLI). Se relaciona con el cuaderno: el cuaderno resume ejecuciones, el libro
  guarda decisiones; no se duplican.
- Hipótesis, no resultado: que esto evite los choques de decisiones que Cognition
  describe sin perder calidad.

### 4.5 Brief a un agente

Plantilla fija del orquestador: objetivo, formato de salida y dónde dejar los
archivos, guía de herramientas y skills, límites de la tarea, entradas del libro de
su rol, puntero a la transcripción. La salida vuelve como **resumen corto más
archivos**, no como transcripción, para mantener pequeño el contexto del orquestador.

### 4.6 Instancias y subagentes en paralelo

- Ya soportado: instancias del mismo perfil (límite 2 por petición) y subagentes
  (profundidad 2). Varios proyectos a la vez usan árboles distintos.
- Pendiente de decidir: si 2 instancias es el límite correcto y si deben ser
  configurables en Ajustes. Los límites siguen en código.

### 4.7 Coste

1. Prefijo idéntico entre instancias del mismo agente, para que el proveedor reutilice
   caché. Hipótesis a medir: hoy el índice de skills y los marcadores con nonce van
   **delante** del prompt estable, lo que impediría compartir prefijo.
2. Brief más libro de rol, no historial.
3. Resultados como resumen más archivos.
4. Orquestador con contexto pequeño: decisiones, no salidas completas.
5. Delegar solo si compensa, con los límites de código como techo.

### 4.8 Guardas de calidad

- Prueba de puntos de decisión (ver el otro spec) sobre las trazas de
  `mocks/recordings`.
- El linter de artefactos y la crítica ya existentes siguen siendo la puerta.
- Ningún ahorro se acepta si baja esas puertas.

## 5. Verificado y por verificar

| Pregunta | Estado | Cómo verificarlo |
| --- | --- | --- |
| ¿Existe un tope global de ejecuciones simultáneas? | **No se encontró** en el código (solo límites por árbol); no probado en ejecución | Lanzar N ejecuciones a la vez y observar CPU, memoria y errores del proveedor |
| ¿Qué recibe un delegado? | **Verificado en texto**: solo el brief (`--prompt-file`) y la carpeta compartida del proyecto | Medir con `od run budget <runId>` en un delegado real |
| ¿Qué devuelve a su padre? | **Verificado en código y medido en 1 muestra** (§5c): `--follow` imprime todos los eventos del delegado; el CLI del orquestador (Antigravity) los truncó | Repetir con Claude (requiere un modelo que acepte la pasarela configurada) y con tareas más grandes |
| ¿Dónde está el texto del orquestador? | **Localizado**: `packages/contracts/src/prompts/orchestrator.ts` (~19 KB, ~4,7K tokens, solo en ejecuciones de orquestador) | — |
| ¿Se rompe el caché entre instancias por el nonce y las rutas delante del prompt estable? | Hipótesis (orden confirmado en `server.ts`, efecto no medido) | Comparar `cache_read_input_tokens` de dos instancias seguidas |
| ¿El agente lee las skills bajo demanda de forma fiable? | Sin validar (sin acceso al CLI desde la sesión) | `.tmp/probes/design-craft-read-probe.mts` en el terminal del usuario |
| ¿Un libro de decisiones aporta algo sobre `SPEC.md` + cuaderno? | Hipótesis; ver §5b | Prueba A/B con dos agentes sobre una misma app |
| ¿Hace falta un campo de especialidad en el perfil? | Decisión abierta | Con tarjetas (`goodFor`/`notFor`) puede no hacer falta |

## 5b. Resultados de la fase 1 (lo que cambia el diseño)

El orquestador existente cubre mucho más de lo que este documento suponía.
`orchestrator.ts` ya define dos orquestadores: el del proyecto y **Lev**, el chat
general de Home.

Ya existe, y no hay que construirlo:

- Decidir primero si es conversación o trabajo; responder solo lo simple.
- Delegar solo si una tarjeta de agente encaja; "si ningún agente encaja, hazlo tú o
  di qué tipo de agente falta y ofrece crearlo" (Lev).
- Un brief que dice "es todo lo que el agente sabe": objetivo, entregable, qué no
  tocar, decisiones ya tomadas.
- Estado compartido en archivos: `SPEC.md`, `DELIVERY.json`, `PROGRESS.md` y
  `ORCHESTRATOR.md` para instrucciones permanentes; el cuaderno por proyecto y la
  memoria para Lev.
- Canalización de etapas spec → design → build → verify → review → publish, un
  paso a la vez, con puntos de control.
- Límites en código y la regla "menos ejecuciones mejor briefadas".
- Un medidor de tokens por ejecución: `run-budget.ts` escribe `budget.json` con
  reglas, skills, sistema de diseño, historial y mensaje (`od run budget`). Es la
  herramienta para medir las fases siguientes.

Consecuencias para el diseño:

1. **4.4 Libro de decisiones**: se solapa con `SPEC.md`, el cuaderno y `memory`. No
   se crea una tabla nueva sin antes comprobar si basta con dar estructura a
   `SPEC.md` (decisiones con origen: usuario / agente) y pasar a cada agente solo la
   parte que le toca.
2. **4.1 Orquestador integrado**: lo que falta no es el texto sino convertirlo en
   pieza fija con sección en Ajustes, y acotar sus reglas a su propia ejecución.
3. **Fuga probable de tokens**: `od run start --follow` vuelca todos los eventos del
   delegado en la salida del orquestador, y el directive solo le pide "leer los
   últimos eventos". Si el CLI del orquestador no trunca esa salida, la transcripción
   entera del delegado entra en su contexto. Mejora candidata: un modo compacto
   (estado, mensaje final, archivos, tokens) como retorno por defecto de un
   delegado. Falta medir cuánto pesa en la práctica.
4. **Sin tope global** de ejecuciones: muchos proyectos y agentes a la vez solo están
   acotados por árbol. Hay que probar el comportamiento antes de prometer que escala.
5. El directive del orquestador pesa ~4,7K tokens. Es candidato a la misma
   técnica del skill bajo demanda (partes como "pipeline de entrega") si la
   medición muestra que no se usan en la mayoría de ejecuciones.

## 5c. Medición real (una muestra, no una conclusión)

Condiciones: runtime `antigravity`, modelo `Gemini 3.5 Flash (Low)`, una tarea corta
(landing de una tostadora), orquestador con un delegado. El daemon trató la
ejecución como orquestador, que delegó con `od run start --follow`. Herramienta:
`.tmp/probes/delegate-cost-probe.sh` y `od run budget`.

| Medida | Resultado |
| --- | --- |
| Prompt fijo del orquestador (`od run budget`) | ~11.550 tokens (reglas ~11.040, skills ~490) |
| Flujo completo del delegado | ~7.420 tokens (29,7 KB); 62% resultados de herramientas |
| Lo que llegó al contexto del orquestador | ~2.930 tokens: **el CLI truncó la salida** y guardó el resto en un archivo |
| Retorno compacto (mensaje final del delegado) | ~400 tokens de texto en total; unos 150–500 con las líneas de estado |
| Llamadas de orientación del orquestador antes de delegar | ~3.200 tokens: `env \| grep OD_` ~2.030, `run list` ~900, `conversation list` ~270 |
| Orquestador entero: flujo | ~9.855 tokens; 70% son resultados de herramientas |
| ¿Leyó `design-craft`? | **Sí**, como su 2.ª acción, antes de elegir dirección y delegar (n = 1, otro runtime) |

Lectura prudente:

- La fuga del retorno existe pero este CLI la acota: ~2,9K tokens por delegación, en
  lugar de ~7,4K. Un retorno compacto ahorraría unos 2,4–2,8K por delegación aquí, y
  más en CLIs que no truncan. Con Claude Code no se ha medido.
- El volcado del entorno (~2K tokens) es desperdicio puro: un comando `od` que
  devuelva solo lo necesario costaría decenas de tokens.
- Una sola muestra con una tarea pequeña no permite promediar. El flujo de un
  delegado crece con el trabajo; el recorte de este CLI no.
- Pendiente: repetir con Claude cuando el CLI de Claude funcione (ver más abajo).

Bloqueo conocido para repetirlo con Claude: `~/.claude/settings.json` del usuario
redirige `ANTHROPIC_BASE_URL` a una pasarela de terceros, y los nombres de modelo de
Claude no existen allí; además el daemon arrancado desde una sesión de Claude Code
hereda sus variables (procedimiento de reinicio limpio en la memoria del proyecto).

## 5d. Después del retorno compacto y `od context` (2026-10-24, muestras únicas)

Mismo runtime y tarea que 5c (Antigravity, landing de la tostadora), con el daemon
reiniciado en limpio y el texto nuevo del orquestador.

| Medida | Antes | Después |
| --- | --- | --- |
| Flujo del orquestador | ~9.855 tokens | ~4.786 (−51%) |
| Resultados de herramientas del orquestador | ~6.919 | ~2.074 (−70%) |
| Resultado de la delegación (`run start --follow`) | ~2.930 (truncado por el CLI) | ~618 (−79%) |
| Volcado del entorno | ~2.030 | no hubo (primera llamada: ~84) |
| Llamadas de orientación (`run list`, `conversation list`) | ~1.170 | no hubo |

Con Claude (`haiku`, delegado sin orquestador) el flujo completo de la ejecución
fue de **~72.266 tokens**: 59% fragmentos de entrada de herramientas, ~19% de
razonamiento. Pasado por el resumen compacto real: **~519 tokens** (−99%). Sin
truncado de ningún CLI, ese flujo entero habría entrado en el contexto de un
orquestador.

Lectura prudente:

- Son muestras únicas con un agente no determinista: parte de la caída de llamadas
  de orientación puede ser azar y no del texto nuevo. El orquestador no usó
  `od context`; simplemente no volcó el entorno.
- Lo que sí es mecánico: el retorno de una delegación pasó de un volcado de eventos
  a un resumen de unos cientos de tokens, y el resumen funciona con las formas de
  evento reales de Claude y de Antigravity.
- El delegado de esta segunda ejecución usó ~123K tokens de entrada y ~49K de salida:
  el coste de un delegado varía mucho con la tarea, y este diseño no lo reduce.

## 6. Fases propuestas

1. **Medir** (hecha en parte, ver §5b): falta medir el retorno de un delegado con `od run budget` y el caché entre instancias.
2. **Retorno compacto de delegados** y, si la medición lo justifica, decisiones estructuradas dentro de `SPEC.md` (antes que una tabla nueva).
3. **Orquestador integrado**: sección en Ajustes, reglas solo para él, núcleo común
   para el resto, i18n en los 19 idiomas.
4. **Encuesta**: la opción "yo defino tipografía y colores".
5. **Brief y retorno compactos**, y reordenar el prefijo si la medición lo confirma.
6. **Validación en vivo** con la prueba de decisiones y la de lectura de skills.

Cada fase se entrega completa en UI y CLI, con tests primero y sin tocar Chat.

## 7. Riesgos

- Delegar puede costar más de lo que ahorra en trabajo acoplado: de ahí la regla de
  delegar solo si compensa.
- El libro de decisiones puede quedarse corto y reproducir los choques que Cognition
  describe: se mide antes de generalizar.
- Cambiar el orden del prompt altera el comportamiento del caché de sesión: se mide
  con el test de caché que ya existe.
- El orquestador integrado cambia la experiencia de quien ya usa el asistente por
  defecto: requiere un camino de migración.

## 8. Fuentes

- Anthropic, sistema multiagente de investigación (resúmenes):
  https://theaiengineer.substack.com/p/how-anthropic-built-multi-agent-deep
  https://www.zenml.io/llmops-database/building-a-multi-agent-research-system-for-complex-information-tasks
- Cognition, Don't Build Multi-Agents: https://cognition.com/blog/dont-build-multi-agents
- Comentario de J. Liu: https://jxnl.co/writing/2025/09/11/why-cognition-does-not-use-multi-agent-systems/
