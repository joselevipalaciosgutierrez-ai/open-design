// Shared logic that maps a failed run's error code + agent into the failure UI.
import {
  isModelWindowLimitFailure,
  readMembershipConcurrencyResetAt,
  readModelWindowResetAt,
} from '@open-design/contracts';
import type { RunFailureAction } from '@open-design/contracts';
import { byokApiKeyIsEditableInSettings } from '../utils/byokProvider';

export const RECONNECT_OWNED_FAILURE_CODE = 'DAEMON_STREAM_DISCONNECTED';
const RECONNECT_OWNED_FAILURE_MESSAGE =
  'daemon stream disconnected before run completed';

export function isReconnectOwnedFailure(
  code: string | null | undefined,
  rawMessage?: string | null,
): boolean {
  if (code === RECONNECT_OWNED_FAILURE_CODE) return true;
  return typeof rawMessage === 'string'
    && rawMessage.trim() === RECONNECT_OWNED_FAILURE_MESSAGE;
}

export type RunFailurePrimaryAction =
  | 'retry'
  | 'authorize'
  | 'recharge'
  | 'upgrade'
  | 'switch-model'
  | 'open-settings'
  | 'launch-terminal-auth'
  | 'launch-terminal-switch-model'
  | 'switch-to-cloud'
  | 'contact-support';

export type RunFailureTitleKey =
  | 'chat.runError.title.authRequired'
  | 'chat.runError.title.balance'
  | 'chat.runError.title.connectionDropped'
  | 'chat.runError.title.signInRequired.other'
  | 'chat.runError.title.signInRequired.amr'
  | 'chat.runError.title.rateLimited'
  | 'chat.runError.title.modelWindowLimit'
  | 'chat.runError.title.membershipConcurrencyLimit'
  | 'chat.amrBalanceGate.title'
  | 'chat.runError.title.cliMissing'
  | 'chat.runError.title.promptTooLarge'
  | 'chat.runError.title.modelUnavailable'
  | 'chat.runError.title.modelCapabilityUnsupported'
  | 'chat.runError.title.upstreamUnavailable'
  | 'chat.runError.title.toolLoop'
  | 'chat.runError.title.outputInvalid'
  | 'chat.runError.title.runtimeConfig'
  | 'chat.runError.title.apiKeyInvalid'
  | 'chat.runError.title.quotaExhausted'
  | 'chat.runError.title.timedOut'
  | 'chat.runError.title.emptyOutput'
  | 'chat.runError.title.sessionExpired'
  | 'chat.runError.title.gitBashMissing'
  | 'chat.runError.title.artifactMissing'
  | 'chat.runError.title.cpuUnsupported'
  | 'chat.runError.title.osUnsupported'
  | 'chat.runError.title.agentCrashed'
  | 'chat.runError.title.accountSuspended'
  | 'chat.runError.title.cliSessionRefused'
  | 'chat.runError.title.strategyTaskHalted'
  | 'chat.runError.title.agentReplyIncomplete'
  | 'chat.runError.title.noDeliverable'
  | 'chat.runError.title.clarificationRepeated'
  | 'chat.runError.title.regionNotSupported'
  | 'chat.runError.title.clientEnvironment'
  | 'chat.runError.title.certificateFailure'
  | 'chat.runError.title.proxyConfiguration'
  | 'chat.runError.title.networkConfiguration'
  | 'chat.runError.title.hostPolicyBlock'
  | 'chat.runError.title.localStorageFailure'
  | 'chat.runError.title.tierUpgradeRequired'
  | 'chat.runError.title.generic';

export type RunFailureMessageKey =
  | 'chat.amrError.authMessage'
  | 'chat.amrError.balanceMessage'
  | 'chat.connectionDropped'
  | 'chat.runError.signInMessage.amr'
  | 'chat.runError.signInMessage.other'
  | 'chat.runError.cliMissingMessage'
  | 'chat.runError.promptTooLargeMessage'
  | 'chat.runError.modelUnavailableMessage'
  | 'chat.runError.modelCapabilityUnsupportedMessage'
  | 'chat.runError.artifactMissingMessage'
  | 'chat.runError.rateLimitedMessage'
  | 'chat.runError.modelWindowLimitMessage'
  | 'chat.runError.modelWindowLimitMessageNoTime'
  | 'chat.runError.membershipConcurrencyLimitMessage'
  | 'chat.runError.membershipConcurrencyLimitMessageNoTime'
  | 'chat.runError.upstreamUnavailableMessage'
  | 'chat.runError.toolLoopMessage'
  | 'chat.runError.outputInvalidMessage'
  | 'chat.runError.runtimeConfigMessage'
  | 'chat.runError.apiKeyInvalidMessage'
  | 'chat.runError.quotaExhaustedMessage'
  | 'chat.runError.workspaceCreditsMessage'
  | 'chat.runError.timedOutMessage'
  | 'chat.runError.inactivityTimeoutMessage'
  | 'chat.runError.emptyOutputMessage'
  | 'chat.runError.sessionExpiredMessage'
  | 'chat.runError.gitBashMissingMessage'
  | 'chat.runError.cpuUnsupportedMessage'
  | 'chat.runError.osUnsupportedMessage'
  | 'chat.runError.agentCrashedMessage'
  | 'chat.runError.accountSuspendedMessage'
  | 'chat.runError.certificateFailureMessage'
  | 'chat.runError.proxyConfigurationMessage'
  | 'chat.runError.networkConfigurationMessage'
  | 'chat.runError.hostPolicyBlockMessage'
  | 'chat.runError.localStorageFailureMessage'
  | 'chat.runError.tierUpgradeRequiredMessage'
  | 'chat.runError.fallbackMessage'
  | 'chat.runError.cliSessionRefusedMessage'
  | 'chat.runError.strategyTaskStateMismatchMessage'
  | 'chat.runError.agentReplyIncompleteMessage'
  | 'chat.runError.noDeliverableMessage'
  | 'chat.runError.clarificationRepeatedMessage'
  | 'chat.runError.regionNotSupportedMessage'
  | 'chat.runError.clientEnvironmentMessage'
  | null;

export type RunFailureCauseKey =
  | 'chat.runError.clientEnvironmentCause.certificate'
  | 'chat.runError.clientEnvironmentCause.proxy'
  | 'chat.runError.clientEnvironmentCause.network'
  | 'chat.runError.clientEnvironmentCause.hostPolicy'
  | 'chat.runError.clientEnvironmentCause.localStorage';

export const RUN_FAILURE_FALLBACK_MESSAGE_KEY =
  'chat.runError.fallbackMessage' as const;

export type RunErrorCardDescription =
  | { render: 'none' }
  | { render: 'mapped'; messageKey: NonNullable<RunFailureMessageKey> }
  | { render: 'fallback' }
  | { render: 'app-text'; text: string };

export function resolveRunErrorCardDescription(input: {
  handedToAnotherSurface: boolean;
  mappedMessageKey: RunFailureMessageKey;
  paneError: string | null;
  paneErrorCameFromARun: boolean;
  failedRunRawDetail: string | null;
  turnEndedInTerminalFailure: boolean;
}): RunErrorCardDescription {
  if (input.handedToAnotherSurface) return { render: 'none' };
  if (input.mappedMessageKey) {
    return { render: 'mapped', messageKey: input.mappedMessageKey };
  }
  if (input.paneError) {
    return input.paneErrorCameFromARun
      ? { render: 'fallback' }
      : { render: 'app-text', text: input.paneError };
  }
  if (input.failedRunRawDetail) return { render: 'fallback' };
  return input.turnEndedInTerminalFailure
    ? { render: 'fallback' }
    : { render: 'none' };
}

export interface RunFailureUi {
  primaryAction: RunFailurePrimaryAction;
  titleKey: RunFailureTitleKey;
  messageKey: RunFailureMessageKey;
  messageVars?: Record<string, string>;
  messageCauseKey?: RunFailureCauseKey;
  secondaryRetry: boolean;
  cloudSwitchCta: boolean;
  suppressCard?: boolean;
}

export function failureCardHandedToAmrBalanceCard(
  _ui: RunFailureUi | null | undefined,
): boolean {
  return false;
}

export type ModelWindowLimitMessageKey =
  | 'chat.runError.modelWindowLimitMessage'
  | 'chat.runError.modelWindowLimitMessageNoTime';

export function modelWindowLimitCopy(
  rawMessage: string | null | undefined,
): { messageKey: ModelWindowLimitMessageKey; retryAt?: string } | null {
  if (!isModelWindowLimitFailure(rawMessage)) return null;
  const parsed = readModelWindowResetAt(rawMessage);
  const retryAt = parsed && Number.isFinite(Date.parse(parsed)) ? parsed : null;
  return retryAt
    ? { messageKey: 'chat.runError.modelWindowLimitMessage', retryAt }
    : { messageKey: 'chat.runError.modelWindowLimitMessageNoTime' };
}

export function formatModelWindowRetryAt(retryAt: string, locale: string): string {
  const parsed = new Date(retryAt);
  if (!Number.isFinite(parsed.getTime())) return retryAt;
  try {
    return new Intl.DateTimeFormat(locale, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(parsed);
  } catch {
    return retryAt;
  }
}

export type RunFailureDirectFix = Extract<
  RunFailurePrimaryAction,
  | 'authorize'
  | 'recharge'
  | 'upgrade'
  | 'switch-model'
  | 'open-settings'
  | 'launch-terminal-auth'
  | 'launch-terminal-switch-model'
>;

export interface RunFailureNature {
  directFix?: RunFailureDirectFix;
  transient?: boolean;
  localDeadEnd?: boolean;
}

export function primaryActionForFailure(
  nature: RunFailureNature,
): RunFailurePrimaryAction {
  if (nature.directFix) return nature.directFix;
  if (nature.transient) return 'retry';
  if (nature.localDeadEnd) return 'switch-to-cloud';
  return 'contact-support';
}

export interface RunFailureDaemonVerdict {
  retryable?: boolean | null;
  failureAction?: RunFailureAction | null;
}

export function daemonNamedTheFailure(detail: string | null | undefined): boolean {
  return typeof detail === 'string' && detail.length > 0 && detail !== 'unknown';
}

function daemonSaysRetryIsFutile(
  verdict: RunFailureDaemonVerdict | null | undefined,
): boolean {
  if (!verdict) return false;
  return verdict.retryable === false || verdict.failureAction === 'none';
}

export function daemonFailureVerdictFrom(
  source: unknown,
): RunFailureDaemonVerdict | undefined {
  const value = source as
    | { retryable?: unknown; failureAction?: unknown }
    | null
    | undefined;
  if (!value || typeof value !== 'object') return undefined;
  const retryable = typeof value.retryable === 'boolean' ? value.retryable : undefined;
  const failureAction =
    typeof value.failureAction === 'string'
      ? (value.failureAction as RunFailureAction)
      : undefined;
  if (retryable === undefined && failureAction === undefined) return undefined;
  return {
    ...(retryable === undefined ? {} : { retryable }),
    ...(failureAction === undefined ? {} : { failureAction }),
  };
}

function failureCard(
  nature: RunFailureNature,
  titleKey: RunFailureTitleKey,
  messageKey: RunFailureMessageKey,
  extra: Partial<
    Pick<
      RunFailureUi,
      'secondaryRetry' | 'cloudSwitchCta' | 'messageVars' | 'messageCauseKey'
    >
  > = {},
): RunFailureUi {
  return {
    primaryAction: primaryActionForFailure(nature),
    titleKey,
    messageKey,
    secondaryRetry: extra.secondaryRetry ?? false,
    cloudSwitchCta: false,
    ...(extra.messageVars ? { messageVars: extra.messageVars } : {}),
    ...(extra.messageCauseKey ? { messageCauseKey: extra.messageCauseKey } : {}),
  };
}

function retryWithGuidance(
  titleKey: RunFailureTitleKey,
  messageKey: RunFailureMessageKey,
): RunFailureUi {
  return failureCard({ transient: true }, titleKey, messageKey);
}

function switchModelWithGuidance(
  titleKey: RunFailureTitleKey,
  messageKey: RunFailureMessageKey,
): RunFailureUi {
  return failureCard({ directFix: 'switch-model' }, titleKey, messageKey);
}

function clientEnvironmentCard(
  titleKey: RunFailureTitleKey,
  messageKey: RunFailureMessageKey,
  causeKey: RunFailureCauseKey,
): RunFailureUi {
  return failureCard(
    { directFix: 'open-settings' },
    titleKey,
    messageKey,
    { secondaryRetry: true, messageCauseKey: causeKey },
  );
}

function contactSupportOnly(
  titleKey: RunFailureTitleKey,
  messageKey: RunFailureMessageKey,
): RunFailureUi {
  return failureCard({}, titleKey, messageKey);
}

function agentReplyIncomplete(): RunFailureUi {
  return retryWithGuidance(
    'chat.runError.title.agentReplyIncomplete',
    'chat.runError.agentReplyIncompleteMessage',
  );
}

const AGENT_AGNOSTIC_FAILURE_UI: Record<string, RunFailureUi> = {
  ARTIFACT_NOT_FOUND: retryWithGuidance(
    'chat.runError.title.artifactMissing',
    'chat.runError.artifactMissingMessage',
  ),
  AGENT_UNAVAILABLE: retryWithGuidance(
    'chat.runError.title.cliMissing',
    'chat.runError.cliMissingMessage',
  ),
  AGENT_PROMPT_TOO_LARGE: retryWithGuidance(
    'chat.runError.title.promptTooLarge',
    'chat.runError.promptTooLargeMessage',
  ),
  AMR_MODEL_UNAVAILABLE: switchModelWithGuidance(
    'chat.runError.title.modelUnavailable',
    'chat.runError.modelUnavailableMessage',
  ),
  TOOL_LOOP_DETECTED: retryWithGuidance(
    'chat.runError.title.toolLoop',
    'chat.runError.toolLoopMessage',
  ),
  ROLE_MARKER_HALLUCINATION: retryWithGuidance(
    'chat.runError.title.outputInvalid',
    'chat.runError.outputInvalidMessage',
  ),
  AGENT_RUNTIME_DEF_INVALID: contactSupportOnly(
    'chat.runError.title.runtimeConfig',
    'chat.runError.runtimeConfigMessage',
  ),
  [RECONNECT_OWNED_FAILURE_CODE]: {
    ...failureCard(
      { transient: true },
      'chat.runError.title.connectionDropped',
      'chat.connectionDropped',
    ),
    suppressCard: true,
  },
  STRATEGY_TASK_STATE_MISMATCH: retryWithGuidance(
    'chat.runError.title.strategyTaskHalted',
    'chat.runError.strategyTaskStateMismatchMessage',
  ),
  od_next_canonical_deliverable_invalid: retryWithGuidance(
    'chat.runError.title.noDeliverable',
    'chat.runError.noDeliverableMessage',
  ),
  od_next_protocol_runtime_state_missing: agentReplyIncomplete(),
  od_next_protocol_runtime_state_duplicate: agentReplyIncomplete(),
  od_next_protocol_runtime_state_invalid_json: agentReplyIncomplete(),
  od_next_protocol_runtime_state_invalid_schema: agentReplyIncomplete(),
  od_next_clarification_repeated: retryWithGuidance(
    'chat.runError.title.clarificationRepeated',
    'chat.runError.clarificationRepeatedMessage',
  ),
};

function apiKeyInvalidCardFor(agentId: string | null | undefined): RunFailureUi | null {
  if (!byokApiKeyIsEditableInSettings(agentId)) return null;
  return failureCard(
    { directFix: 'open-settings' },
    'chat.runError.title.apiKeyInvalid',
    'chat.runError.apiKeyInvalidMessage',
  );
}

const AGENT_AGNOSTIC_DETAIL_FAILURE_UI: Record<string, RunFailureUi> = {
  stream_disconnected: retryWithGuidance(
    'chat.runError.title.connectionDropped',
    'chat.connectionDropped',
  ),
  timeout: retryWithGuidance(
    'chat.runError.title.timedOut',
    'chat.runError.timedOutMessage',
  ),
  inactivity_timeout: retryWithGuidance(
    'chat.runError.title.timedOut',
    'chat.runError.inactivityTimeoutMessage',
  ),
  empty_output: retryWithGuidance(
    'chat.runError.title.emptyOutput',
    'chat.runError.emptyOutputMessage',
  ),
  session_resume_expired: retryWithGuidance(
    'chat.runError.title.sessionExpired',
    'chat.runError.sessionExpiredMessage',
  ),
  git_bash_missing: {
    ...retryWithGuidance(
      'chat.runError.title.gitBashMissing',
      'chat.runError.gitBashMissingMessage',
    ),
    suppressCard: true,
  },
  cpu_unsupported: contactSupportOnly(
    'chat.runError.title.cpuUnsupported',
    'chat.runError.cpuUnsupportedMessage',
  ),
  os_unsupported: contactSupportOnly(
    'chat.runError.title.osUnsupported',
    'chat.runError.osUnsupportedMessage',
  ),
  process_crashed: retryWithGuidance(
    'chat.runError.title.agentCrashed',
    'chat.runError.agentCrashedMessage',
  ),
  signal_killed: retryWithGuidance(
    'chat.runError.title.agentCrashed',
    'chat.runError.agentCrashedMessage',
  ),
  terminated_unknown: retryWithGuidance(
    'chat.runError.title.agentCrashed',
    'chat.runError.agentCrashedMessage',
  ),
  exit_code: retryWithGuidance(
    'chat.runError.title.agentCrashed',
    'chat.runError.agentCrashedMessage',
  ),
  exit_nonzero: retryWithGuidance(
    'chat.runError.title.agentCrashed',
    'chat.runError.agentCrashedMessage',
  ),
  execution_failed: retryWithGuidance(
    'chat.runError.title.agentCrashed',
    'chat.runError.agentCrashedMessage',
  ),
  fatal_rpc_error: retryWithGuidance(
    'chat.runError.title.upstreamUnavailable',
    'chat.runError.upstreamUnavailableMessage',
  ),
  upstream_5xx: retryWithGuidance(
    'chat.runError.title.upstreamUnavailable',
    'chat.runError.upstreamUnavailableMessage',
  ),
  provider_high_demand: retryWithGuidance(
    'chat.runError.title.upstreamUnavailable',
    'chat.runError.upstreamUnavailableMessage',
  ),
  account_suspended: contactSupportOnly(
    'chat.runError.title.accountSuspended',
    'chat.runError.accountSuspendedMessage',
  ),
  cli_version_incompatible: switchModelWithGuidance(
    'chat.runError.title.modelUnavailable',
    'chat.runError.modelUnavailableMessage',
  ),
  model_not_found: switchModelWithGuidance(
    'chat.runError.title.modelUnavailable',
    'chat.runError.modelUnavailableMessage',
  ),
  model_not_supported: switchModelWithGuidance(
    'chat.runError.title.modelCapabilityUnsupported',
    'chat.runError.modelCapabilityUnsupportedMessage',
  ),
  model_disabled: switchModelWithGuidance(
    'chat.runError.title.modelCapabilityUnsupported',
    'chat.runError.modelCapabilityUnsupportedMessage',
  ),
  local_model_not_loaded: switchModelWithGuidance(
    'chat.runError.title.modelCapabilityUnsupported',
    'chat.runError.modelCapabilityUnsupportedMessage',
  ),
  certificate_failure: clientEnvironmentCard(
    'chat.runError.title.certificateFailure',
    'chat.runError.certificateFailureMessage',
    'chat.runError.clientEnvironmentCause.certificate',
  ),
  proxy_configuration: clientEnvironmentCard(
    'chat.runError.title.proxyConfiguration',
    'chat.runError.proxyConfigurationMessage',
    'chat.runError.clientEnvironmentCause.proxy',
  ),
  network_configuration: clientEnvironmentCard(
    'chat.runError.title.networkConfiguration',
    'chat.runError.networkConfigurationMessage',
    'chat.runError.clientEnvironmentCause.network',
  ),
  host_policy_block: clientEnvironmentCard(
    'chat.runError.title.hostPolicyBlock',
    'chat.runError.hostPolicyBlockMessage',
    'chat.runError.clientEnvironmentCause.hostPolicy',
  ),
  local_storage_failure: clientEnvironmentCard(
    'chat.runError.title.localStorageFailure',
    'chat.runError.localStorageFailureMessage',
    'chat.runError.clientEnvironmentCause.localStorage',
  ),
};

const DETAIL_FAILURE_UI: Record<string, RunFailureUi> = {
  hard_quota: contactSupportOnly(
    'chat.runError.title.quotaExhausted',
    'chat.runError.quotaExhaustedMessage',
  ),
  workspace_credits_exhausted: contactSupportOnly(
    'chat.runError.title.quotaExhausted',
    'chat.runError.workspaceCreditsMessage',
  ),
  cli_not_installed: retryWithGuidance(
    'chat.runError.title.cliMissing',
    'chat.runError.cliMissingMessage',
  ),
};

export function resolveRunFailureUi(
  code: string | null | undefined,
  detail: string | null | undefined,
  agentId: string | null | undefined,
  rawMessage?: string | null,
  verdict?: RunFailureDaemonVerdict | null,
): RunFailureUi {
  if (code === 'AGENT_CLI_SESSION_REFUSED') {
    return {
      primaryAction: 'retry',
      titleKey: 'chat.runError.title.cliSessionRefused',
      messageKey: 'chat.runError.cliSessionRefusedMessage',
      secondaryRetry: false,
      cloudSwitchCta: false,
    };
  }
  const agnostic = typeof code === 'string' ? AGENT_AGNOSTIC_FAILURE_UI[code] : undefined;
  if (agnostic) return agnostic;

  if (detail === 'model_window_limit') {
    const parsed = readModelWindowResetAt(rawMessage);
    const retryAt = parsed && Number.isFinite(Date.parse(parsed)) ? parsed : null;
    return failureCard(
      { transient: true },
      'chat.runError.title.modelWindowLimit',
      retryAt
        ? 'chat.runError.modelWindowLimitMessage'
        : 'chat.runError.modelWindowLimitMessageNoTime',
      retryAt ? { messageVars: { retryAt } } : {},
    );
  }

  if (detail === 'membership_concurrency_limit') {
    const parsed = readMembershipConcurrencyResetAt(rawMessage);
    const retryAt = parsed && Number.isFinite(Date.parse(parsed)) ? parsed : null;
    return {
      primaryAction: 'retry',
      titleKey: 'chat.runError.title.membershipConcurrencyLimit',
      messageKey: retryAt
        ? 'chat.runError.membershipConcurrencyLimitMessage'
        : 'chat.runError.membershipConcurrencyLimitMessageNoTime',
      ...(retryAt ? { messageVars: { retryAt } } : {}),
      secondaryRetry: false,
      cloudSwitchCta: false,
    };
  }

  const agnosticDetail =
    typeof detail === 'string' ? AGENT_AGNOSTIC_DETAIL_FAILURE_UI[detail] : undefined;
  if (agnosticDetail) return agnosticDetail;

  if (agentId === 'antigravity') {
    if (code === 'AGENT_AUTH_REQUIRED') {
      return failureCard(
        { directFix: 'launch-terminal-auth' },
        'chat.runError.title.signInRequired.other',
        'chat.runError.signInMessage.other',
        { secondaryRetry: true },
      );
    }
    if (code === 'RATE_LIMITED') {
      return failureCard(
        { directFix: 'launch-terminal-switch-model' },
        'chat.runError.title.rateLimited',
        null,
        { secondaryRetry: true },
      );
    }
  }

  if (detail === 'invalid_api_key') {
    const apiKeyCard = apiKeyInvalidCardFor(agentId);
    if (apiKeyCard) return apiKeyCard;
  }

  const detailUi = typeof detail === 'string' ? DETAIL_FAILURE_UI[detail] : undefined;
  if (detailUi) return detailUi;

  if (code === 'AGENT_CONNECTION_DROPPED') {
    return retryWithGuidance(
      'chat.runError.title.connectionDropped',
      'chat.connectionDropped',
    );
  }

  if (code === 'AGENT_AUTH_REQUIRED' || code === 'UNAUTHORIZED') {
    return failureCard(
      { transient: true },
      'chat.runError.title.signInRequired.other',
      'chat.runError.signInMessage.other',
    );
  }

  if (code === 'RATE_LIMITED') {
    return failureCard(
      { transient: true },
      'chat.runError.title.rateLimited',
      'chat.runError.rateLimitedMessage',
    );
  }

  if (code === 'UPSTREAM_UNAVAILABLE') {
    return failureCard(
      { transient: true },
      'chat.runError.title.upstreamUnavailable',
      'chat.runError.upstreamUnavailableMessage',
    );
  }

  if (daemonNamedTheFailure(detail) && daemonSaysRetryIsFutile(verdict)) {
    return failureCard({}, 'chat.runError.title.generic', null);
  }

  return failureCard({ transient: true }, 'chat.runError.title.generic', null);
}

// Stubs for clean compatibility
export function setRuntimeAmrConsoleOrigin(_origin?: string | null): void {}
export function amrPlansUrlForProfile(_profile?: string | null): string {
  return '';
}
export function amrConsoleUrlForProfile(_profile?: string | null): string {
  return '';
}
export function amrProfileBadgeLabel(_profile?: string | null): string | null {
  return null;
}
export function amrConsoleUrlForWorkspace(
  _profile?: string | null,
  _workspaceId?: string | null,
): string | null {
  return null;
}
export function amrPlansUrlForWorkspace(
  _profile?: string | null,
  _workspaceId?: string | null,
): string | null {
  return null;
}
export function amrAutoRechargeUrlForProfile(_profile?: string | null): string {
  return '';
}
export const AMR_CONSOLE_AUTO_RECHARGE_INTENT = 'auto-recharge';
export const AMR_CONSOLE_RECHARGE_INTENT = 'recharge';
export const AMR_CONSOLE_UPGRADE_INTENT = 'plan';
