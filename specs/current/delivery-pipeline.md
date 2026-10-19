# Entrega completa (diseño → código → verificación → publicar)

Estado: en curso (Fase 3 de la hoja de ruta del fork). Este documento reúne lo que
investigamos y lo que decidimos construir. Las referencias externas son de blogs y
foros: sirven como señal, no como prueba.

## Qué encontramos fuera

| Idea | De dónde sale | Qué significa para nosotros |
| --- | --- | --- |
| Empieza por el patrón más simple. Cadena de pasos fijos; orquestador–trabajadores solo cuando las partes no se conocen de antemano; evaluador–optimizador cuando hay un criterio claro de "bien" | Anthropic, *Building effective agents* | Un pipeline fijo de etapas, con el orquestador repartiendo solo dentro de la etapa de construcción |
| Para trabajos largos: un archivo con la lista de funciones en **JSON** (no Markdown, el modelo lo reescribe), cada una con `passes: false`; los agentes solo pueden cambiar `passes`; un log de progreso; commits pequeños; empezar cada sesión leyendo ambos y verificando que lo anterior sigue funcionando | Anthropic, *Effective harnesses for long-running agents* | `DELIVERY.json` + `PROGRESS.md` en la raíz del proyecto; el agente no puede borrar etapas |
| Un agente da por terminado algo que no funciona. El remedio es verificar de extremo a extremo, como un usuario, antes de marcar "hecho" | Mismo artículo; Replit Agent hace un ciclo construir → probar en navegador → reparar → publicar | Etapa de verificación con comandos reales (typecheck, build, tests) y comprobación en el navegador antes de publicar |
| Los agentes entran en "madrigueras": arreglo tras arreglo de un enfoque equivocado | Reseñas de Replit Agent | Tope de 3 rondas de reparación; después se detiene y le dice al usuario qué falla |
| Dos agentes sobre los mismos archivos se pisan; cada uno con su zona (o su worktree), y un único orquestador que integra | Hilos y blogs sobre Claude Code en paralelo | Ya está en la directiva del orquestador (carpeta por agente, `SPEC.md`); worktrees quedan para más adelante |
| "Pipeline, no enjambre" | Comentarios de Reddit | Etapas en orden, paralelo solo para piezas independientes |

## Lo que ya existe en el repo y reutilizamos

- Orquestador y delegación con límites impuestos por el daemon (`delegation.ts`).
- Atoms de plugin: `todo-write`, `critique-theater`, `build-test` (typecheck/test y señales
  `build.passing` / `tests.passing`), `diff-review`, `handoff` (`plugins/_official/atoms`).
- Publicación: `od deploy` hacia Vercel y Cloudflare Pages.
- Panel de estado del chat, que dibuja el plan (TodoWrite) como "Tareas".

## Diseño

1. **Contrato en archivos, en la raíz del proyecto.**
   - `DELIVERY.json`: `{ goal, stages: [{ id, name, agent, deliverable, status, check }] }`.
     Estados: `pending`, `running`, `done`, `blocked`. Los agentes solo cambian `status` y añaden notas.
   - `PROGRESS.md`: bitácora de lo hecho y de lo que sigue.
   - `SPEC.md`: lo que los agentes deben acordar (ya lo pide la directiva).
2. **Etapas:** especificar → diseñar → construir → verificar → revisar → publicar.
3. **Verificación como verdad del entorno:** comandos reales; si fallan, el informe vuelve al agente que construyó como un encargo nuevo. Máximo 3 rondas.
4. **Puntos de control humanos:** tras diseñar (a menos que el usuario haya pedido ir hasta el final) y **siempre** antes de publicar.
5. **Progreso visible:** las etapas se escriben como plan (TodoWrite), así aparecen en "Tareas".

## Fases

1. **Directiva de entrega** en el orquestador (texto único en `packages/contracts/src/prompts/orchestrator.ts`, que consumen las dos implementaciones de prompt). *Esta entrega.*
2. **Soporte del daemon:** validar `DELIVERY.json` (solo `status`/notas), `od delivery status|next --json` y endpoint, para que la UI y agentes externos lean el mismo estado (regla UI + CLI del repo).
3. **UI:** vista de etapas en el panel de estado y botón "Continuar / Publicar" en los puntos de control.
4. **Verificación en navegador** como etapa propia y worktrees por agente.

## Riesgos conocidos

- Cada delegación gasta cuota del CLI del usuario: la directiva ya limita total y concurrencia.
- Un agente puede escribir mal `DELIVERY.json`: por eso la fase 2 lo valida en el daemon.
- Antigravity no admite mensajes a mitad de turno (`steer`), así que los puntos de control son entre etapas, no dentro de ellas.
