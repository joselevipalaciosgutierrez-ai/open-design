/**
 * Copy for the Agents screen.
 *
 * It lives beside the screen instead of in the shared i18n dictionaries on
 * purpose: those must carry the same keys in all 19 locales, and every new key
 * is a merge conflict waiting in files the upstream project edits daily. Spanish
 * and English are written out; every other locale falls back to English.
 */

export interface AgentsCopy {
  title: string;
  subtitle: string;
  newAgent: string;
  loading: string;
  loadError: string;
  retry: string;
  empty: string;
  openChat: string;
  edit: string;
  noActivity: string;
  activeAgo: (elapsedMs: number) => string;
  modelDefault: string;
  runtimeUnavailable: string;
  editorTitleNew: string;
  editorTitleEdit: string;
  emojiLabel: string;
  nameLabel: string;
  roleLabel: string;
  rolePlaceholder: string;
  runtimeLabel: string;
  modelLabel: string;
  modelOther: string;
  modelOtherPlaceholder: string;
  instructionsLabel: string;
  instructionsHint: string;
  instructionsPlaceholder: string;
  save: string;
  saving: string;
  cancel: string;
  remove: string;
  removeConfirm: (name: string) => string;
  designSystemLabel: string;
  designSystemNone: string;
  skillsLabel: string;
  skillsHint: string;
  skillsLoading: string;
  cliMenuTitle: string;
  cliNoneInstalled: string;
  cliHoldHint: string;
  switcherLabel: string;
  switcherTitle: string;
  switcherClear: string;
  switcherEmpty: string;
  switcherNone: string;
  switcherAll: string;
  skillsSearch: string;
  skillsUpload: string;
  skillsUploaded: (name: string) => string;
  skillsUploadError: string;
  skillsSelected: string;
  skillRemove: (name: string) => string;
  skillsSuggested: string;
  skillsNone: string;
  delegatedTitle: string;
  delegateRunning: string;
  delegateDone: string;
  delegateFailed: string;
  delegateCanceled: string;
  delegateOpen: string;
  delegateWorker: string;
  needName: string;
  needRuntime: string;
  saveError: string;
  chatTitle: (name: string) => string;
  chatProjectLabel: string;
  chatNewProject: string;
  chatStart: string;
  chatStarting: string;
  chatError: string;
}

function elapsedParts(elapsedMs: number): { unit: 'now' | 'min' | 'h' | 'd'; n: number } {
  const minutes = Math.floor(elapsedMs / 60_000);
  if (minutes < 1) return { unit: 'now', n: 0 };
  if (minutes < 60) return { unit: 'min', n: minutes };
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return { unit: 'h', n: hours };
  return { unit: 'd', n: Math.floor(hours / 24) };
}

const es: AgentsCopy = {
  title: 'Agentes',
  subtitle: 'Quién forma parte de tu equipo y qué está haciendo',
  newAgent: 'Nuevo agente',
  loading: 'Cargando agentes…',
  loadError: 'No se pudieron cargar los agentes.',
  retry: 'Reintentar',
  empty: 'Todavía no tienes agentes. Crea uno con un rol, un modelo y sus instrucciones.',
  openChat: 'Abrir chat',
  edit: 'Editar',
  noActivity: 'Sin actividad todavía',
  activeAgo: (ms) => {
    const { unit, n } = elapsedParts(ms);
    if (unit === 'now') return 'Activo ahora';
    return `Activo hace ${n} ${unit}`;
  },
  modelDefault: 'Predeterminado de la CLI',
  runtimeUnavailable: 'CLI no disponible',
  editorTitleNew: 'Nuevo agente',
  editorTitleEdit: 'Editar agente',
  emojiLabel: 'Ícono (emoji)',
  nameLabel: 'Nombre',
  roleLabel: 'Rol (una línea)',
  rolePlaceholder: 'Asistente de diseño e interfaces',
  runtimeLabel: 'CLI',
  modelLabel: 'Modelo',
  modelOther: 'Otro modelo…',
  modelOtherPlaceholder: 'Id del modelo',
  instructionsLabel: 'Instrucciones del rol',
  instructionsHint: 'Se agregan al prompt del sistema en cada mensaje de este agente.',
  instructionsPlaceholder: 'Eres el agente de diseño. Escribes solo dentro de design/…',
  save: 'Guardar',
  saving: 'Guardando…',
  cancel: 'Cancelar',
  remove: 'Eliminar agente',
  removeConfirm: (name) => `¿Eliminar a "${name}"? Sus conversaciones se conservan.`,
  designSystemLabel: 'Sistema de diseño',
  designSystemNone: 'Ninguno (el del proyecto)',
  skillsLabel: 'Skills',
  skillsHint: 'El agente las usará en cada respuesta.',
  skillsLoading: 'Cargando skills…',
  cliMenuTitle: 'Cambiar de CLI',
  cliNoneInstalled: 'No hay ningún CLI instalado. Instálalo y reescanea en Ajustes.',
  cliHoldHint: 'Mantén pulsado para cambiar de CLI',
  switcherLabel: 'Agentes',
  switcherTitle: 'Agentes',
  switcherClear: 'Quitar agente',
  switcherEmpty: 'Todavía no tienes agentes.',
  switcherNone: 'Sin agente',
  switcherAll: 'Todos los agentes',
  skillsSearch: 'Buscar skill…',
  skillsUpload: 'Subir SKILL.md',
  skillsUploaded: (name) => `Skill «${name}» añadida.`,
  skillsUploadError: 'No se pudo importar ese archivo. Debe ser un SKILL.md con contenido.',
  skillsSelected: 'Seleccionadas',
  skillRemove: (name) => `Quitar ${name}`,
  skillsSuggested: 'Tus skills',
  skillsNone: 'No tienes skills propias todavía. Sube un SKILL.md para añadir una.',
  delegatedTitle: 'El orquestador delegó',
  delegateRunning: 'Trabajando',
  delegateDone: 'Terminó',
  delegateFailed: 'Falló',
  delegateCanceled: 'Cancelado',
  delegateOpen: 'Abrir conversación',
  delegateWorker: 'Ayudante',
  needName: 'Escribe un nombre.',
  needRuntime: 'Elige una CLI.',
  saveError: 'No se pudo guardar el agente.',
  chatTitle: (name) => `Chat con ${name}`,
  chatProjectLabel: 'Proyecto',
  chatNewProject: 'Proyecto nuevo',
  chatStart: 'Empezar chat',
  chatStarting: 'Abriendo…',
  chatError: 'No se pudo abrir el chat.',
};

const en: AgentsCopy = {
  title: 'Agents',
  subtitle: "Who's on your team and what they're doing",
  newAgent: 'New agent',
  loading: 'Loading agents…',
  loadError: 'Could not load the agents.',
  retry: 'Retry',
  empty: "You don't have any agents yet. Create one with a role, a model and its instructions.",
  openChat: 'Open chat',
  edit: 'Edit',
  noActivity: 'No activity yet',
  activeAgo: (ms) => {
    const { unit, n } = elapsedParts(ms);
    if (unit === 'now') return 'Active now';
    return `Active ${n}${unit} ago`;
  },
  modelDefault: 'CLI default',
  runtimeUnavailable: 'CLI unavailable',
  editorTitleNew: 'New agent',
  editorTitleEdit: 'Edit agent',
  emojiLabel: 'Icon (emoji)',
  nameLabel: 'Name',
  roleLabel: 'Role (one line)',
  rolePlaceholder: 'Design and interfaces assistant',
  runtimeLabel: 'CLI',
  modelLabel: 'Model',
  modelOther: 'Other model…',
  modelOtherPlaceholder: 'Model id',
  instructionsLabel: 'Role instructions',
  instructionsHint: "Added to the system prompt on every message to this agent.",
  instructionsPlaceholder: 'You are the design agent. You write only inside design/…',
  save: 'Save',
  saving: 'Saving…',
  cancel: 'Cancel',
  remove: 'Delete agent',
  removeConfirm: (name) => `Delete "${name}"? Its conversations are kept.`,
  designSystemLabel: 'Design system',
  designSystemNone: 'None (use the project one)',
  skillsLabel: 'Skills',
  skillsHint: 'The agent applies them on every reply.',
  skillsLoading: 'Loading skills…',
  cliMenuTitle: 'Switch CLI',
  cliNoneInstalled: 'No CLI is installed. Install one and rescan in Settings.',
  cliHoldHint: 'Hold to switch CLI',
  switcherLabel: 'Agents',
  switcherTitle: 'Agents',
  switcherClear: 'Remove agent',
  switcherEmpty: "You don't have any agents yet.",
  switcherNone: 'No agent',
  switcherAll: 'All agents',
  skillsSearch: 'Search skills…',
  skillsUpload: 'Upload SKILL.md',
  skillsUploaded: (name) => `Skill "${name}" added.`,
  skillsUploadError: 'Could not import that file. It must be a SKILL.md with content.',
  skillsSelected: 'Selected',
  skillRemove: (name) => `Remove ${name}`,
  skillsSuggested: 'Your skills',
  skillsNone: "You don't have any skills of your own yet. Upload a SKILL.md to add one.",
  delegatedTitle: 'The orchestrator delegated',
  delegateRunning: 'Working',
  delegateDone: 'Done',
  delegateFailed: 'Failed',
  delegateCanceled: 'Canceled',
  delegateOpen: 'Open conversation',
  delegateWorker: 'Helper',
  needName: 'Enter a name.',
  needRuntime: 'Pick a CLI.',
  saveError: 'Could not save the agent.',
  chatTitle: (name) => `Chat with ${name}`,
  chatProjectLabel: 'Project',
  chatNewProject: 'New project',
  chatStart: 'Start chat',
  chatStarting: 'Opening…',
  chatError: 'Could not open the chat.',
};

export function getAgentsCopy(locale: string): AgentsCopy {
  return locale.toLowerCase().startsWith('es') ? es : en;
}

/**
 * Copy for the current UI language, read from `<html lang>` (which the i18n
 * provider keeps in sync). For hosts that only need a string or two and should
 * not take a hard dependency on the i18n context.
 */
export function getAgentsCopyForDocument(): AgentsCopy {
  const lang = typeof document !== 'undefined' ? document.documentElement.lang : '';
  return getAgentsCopy(lang || 'en');
}
