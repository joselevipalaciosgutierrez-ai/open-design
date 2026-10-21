import type { Response } from 'express';
import type { ProjectWorkspaceScope } from '@open-design/contracts';

export type AuthorizeProjectRequestOptions =
  | {
      mode: 'read';
      allowNavigationQuery?: boolean;
      [key: string]: any;
    }
  | {
      mode: 'write';
      capability?: string;
      [key: string]: any;
    };

export type AuthorizeProjectRequest = (
  req: any,
  res: Response,
  projectId: string,
  options: AuthorizeProjectRequestOptions,
) => Promise<boolean>;

export type AuthorizedProjectToolRequest = {
  readonly workspace: {
    readonly workspaceId: string;
    readonly workspaceMemberId: string;
  } | null;
};

export type AuthorizeProjectToolRequest = (
  res: Response,
  projectId: string,
  options: AuthorizeProjectRequestOptions,
) => Promise<AuthorizedProjectToolRequest | null>;

export interface CreateAuthorizeProjectRequestOptions {
  db?: any;
  getWorkspaceProject?: (db: any, workspaceId: string, projectId: string) => any;
  getWorkspaceProjectByProjectId?: (db: any, projectId: string) => any;
  isProjectRevoked?: (db: any, projectId: string) => boolean;
  isProjectUnmaterializedPlaceholder?: (db: any, projectId: string) => boolean;
  verifyWorkspaceRequestAuthority?: any;
  sendApiError?: SendApiErrorFn;
  [k: string]: any;
}

export async function enforceLocalProjectDataPlaneRequest(input: {
  req: any;
  projectId: string;
  options: AuthorizeProjectRequestOptions;
  db: unknown;
  getWorkspaceProject: (
    db: unknown,
    workspaceId: string,
    projectId: string,
  ) => any;
  getWorkspaceProjectByProjectId: (
    db: unknown,
    projectId: string,
  ) => any;
  onDenied?: (
    status: number,
    code: string,
    message: string,
    details?: Record<string, unknown>,
  ) => unknown;
}): Promise<boolean> {
  const {
    req,
    projectId,
    options,
    db,
    getWorkspaceProject,
    getWorkspaceProjectByProjectId,
    onDenied,
  } = input;
  const deny = (
    status: number,
    code: string,
    message: string,
    details?: Record<string, unknown>,
  ): false => {
    onDenied?.(status, code, message, details);
    return false;
  };
  const persisted = getWorkspaceProjectByProjectId(db, projectId);
  if (!persisted?.workspaceId) return true;

  const scopedRequest = options.mode === 'read' && options.allowNavigationQuery
    ? requestWithWorkspaceNavigationScope(req)
    : req;
  if (scopedRequest === 'conflict') {
    return deny(
      400,
      'WORKSPACE_CONTEXT_CONFLICT',
      'workspace header and navigation scope must match',
    );
  }
  const claimed = workspaceResourceContextFromRequest(scopedRequest);
  if (claimed === 'missing') {
    return deny(
      400,
      'WORKSPACE_CONTEXT_INCOMPLETE',
      'both workspace and member identity are required',
    );
  }
  if (claimed && claimed.workspaceId !== persisted.workspaceId) {
    return deny(
      403,
      'WORKSPACE_PROJECT_PERMISSION_DENIED',
      `workspace project ${options.mode} is not allowed`,
    );
  }

  const row = getWorkspaceProject(db, persisted.workspaceId, projectId);
  if (!row || row.resourceState === 'deleted') {
    return deny(
      403,
      'WORKSPACE_PROJECT_PERMISSION_DENIED',
      `workspace project ${options.mode} is not allowed`,
    );
  }
  if (options.mode === 'read') {
    if (
      claimed
      && row.visibility === 'personal'
      && row.createdByWorkspaceMemberId
      && row.createdByWorkspaceMemberId !== claimed.workspaceMemberId
    ) {
      return deny(
        403,
        'WORKSPACE_PROJECT_PERMISSION_DENIED',
        'workspace project read is not allowed',
      );
    }
    return true;
  }
  if (row.resourceState === 'frozen') {
    return deny(
      403,
      'WORKSPACE_LOCKED',
      'workspace project mutation is not allowed',
    );
  }
  if (options.capability === 'comment' && row.visibility === 'team') return true;
  if (!claimed && row.visibility === 'team') {
    return deny(
      400,
      'WORKSPACE_CONTEXT_REQUIRED',
      'workspace context is required',
    );
  }

  if (
    row.visibility === 'team'
    && row.createdByWorkspaceMemberId !== claimed?.workspaceMemberId
  ) {
    return deny(
      403,
      'WORKSPACE_PROJECT_PERMISSION_DENIED',
      'workspace project mutation is not allowed',
    );
  }

  if (
    claimed
    && row.createdByWorkspaceMemberId
    && row.createdByWorkspaceMemberId !== claimed.workspaceMemberId
  ) {
    return deny(
      403,
      'WORKSPACE_PROJECT_PERMISSION_DENIED',
      'workspace project mutation is not allowed',
    );
  }
  return true;
}

export function createAuthorizeProjectRequest(deps: CreateAuthorizeProjectRequestOptions = {}): AuthorizeProjectRequest {
  const {
    db,
    getWorkspaceProject,
    getWorkspaceProjectByProjectId,
    isProjectRevoked,
    isProjectUnmaterializedPlaceholder,
    sendApiError,
  } = deps;
  return async (req, res, projectId, options) => {
    if (isProjectRevoked?.(db, projectId)) {
      sendApiError?.(
        res,
        options.mode === 'read' ? 404 : 403,
        options.mode === 'read'
          ? 'PROJECT_NOT_FOUND'
          : 'WORKSPACE_PROJECT_PERMISSION_DENIED',
        options.mode === 'read'
          ? 'project not found'
          : 'workspace project mutation is not allowed',
      );
      return false;
    }
    const allowed = await enforceLocalProjectDataPlaneRequest({
      req,
      projectId,
      options,
      db,
      getWorkspaceProject: getWorkspaceProject ?? (() => null),
      getWorkspaceProjectByProjectId: getWorkspaceProjectByProjectId ?? (() => null),
      onDenied: (status, code, message, details) => details === undefined
        ? sendApiError?.(res, status, code, message)
        : sendApiError?.(res, status, code, message, details),
    });
    if (!allowed) return false;
    if (
      options.mode !== 'read'
      && options.capability !== 'comment'
      && isProjectUnmaterializedPlaceholder?.(db, projectId)
    ) {
      sendApiError?.(
        res,
        409,
        'PROJECT_MATERIALIZATION_PENDING',
        'project content is still materializing',
      );
      return false;
    }
    return true;
  };
}

export interface ResourceHubPrincipal {
  memberId: string;
  teamId: string;
  role: any;
  lifecycleState: any;
  workspaceType?: any;
}

export function contextToResourceHubPrincipal(
  _context?: any,
): ResourceHubPrincipal | null {
  return null;
}

export type BoundWorkspaceResourceMutationGate = (
  req: any,
  res: Response,
  sendApiError: any,
  getWorkspaceResource: any,
  getWorkspaceResourceByResourceId: any,
  db: any,
  resourceId: string,
  capability: any,
) => Promise<boolean>;

export function resolveLocalProjectWorkspaceScope(input: {
  projectId: string;
  [k: string]: any;
}): ProjectWorkspaceScope {
  return {
    kind: 'unbound',
    projectId: input.projectId.trim(),
    workspaceId: null,
    context: null,
  };
}

export type WorkspaceResourceContext = {
  workspaceId: string;
  workspaceType: 'personal' | 'team';
  workspaceTypeAsserted: 'personal' | 'team' | null;
  appUserId: string;
  workspaceMemberId: string;
  role: 'owner' | 'admin' | 'member';
  memberStatus: 'active' | 'removed';
  lifecycleState: 'active' | 'billing_past_due' | 'locked' | 'deleting' | 'deleted';
  canShareProjects: boolean;
  canWriteSyncedFiles: boolean;
};

export type WorkspaceResourceMutationCapability =
  | 'rename'
  | 'delete'
  | 'duplicate'
  | 'writeFiles'
  | 'comment';

export type VerifyWorkspaceRequestAuthority = (
  req: unknown,
) => Promise<{ ok: true; context: any } | { ok: false; status: number; code: string; message: string; retryable?: true }>;

export type WorkspaceResourceAccessInput = {
  id?: string;
  projectId?: string;
  workspaceId?: string | null;
  createdByWorkspaceMemberId?: string | null;
  visibility?: string | null;
};

export function headerValue(req: any, name: string): string | null {
  const value = req?.headers?.[name.toLowerCase()];
  if (typeof value === 'string') return value.trim() || null;
  if (Array.isArray(value) && typeof value[0] === 'string') return value[0].trim() || null;
  return null;
}

export function isWorkspaceResourceLocked(_context?: any): boolean {
  return false;
}

export const isWorkspaceLocked = isWorkspaceResourceLocked;

export function workspaceResourceAccess(_input?: any, _ctx?: any, ..._rest: any[]): any {
  return {
    frozen: false,
    selfCreated: true,
    canMutate: true,
    canShareLocal: true,
    disabledReason: null,
    canOpen: true,
    canExport: true,
    canSendTo: true,
    canMoveToTeam: false,
    canMoveToPersonal: false,
    canRename: true,
    canDelete: true,
    canDuplicate: true,
    canWriteFiles: true,
    canComment: true,
  };
}

export function workspaceResourceContext(req: any, workspaceId?: string): WorkspaceResourceContext | null {
  const wId = workspaceId ?? headerValue(req, 'x-od-workspace-id');
  if (!wId) return null;
  const workspaceMemberId = headerValue(req, 'x-od-workspace-member-id');
  if (!workspaceMemberId) return null;
  const workspaceTypeHeader = headerValue(req, 'x-od-workspace-type');
  const lifecycleState = headerValue(req, 'x-od-workspace-lifecycle-state') ?? 'active';
  const role = (headerValue(req, 'x-od-workspace-role') ?? 'member') as any;
  return {
    workspaceId: wId,
    workspaceType: workspaceTypeHeader === 'team' ? 'team' : 'personal',
    workspaceTypeAsserted:
      workspaceTypeHeader === 'team' || workspaceTypeHeader === 'personal' ? workspaceTypeHeader : null,
    appUserId: headerValue(req, 'x-od-app-user-id') ?? 'local-user',
    workspaceMemberId,
    role: role === 'owner' || role === 'admin' ? role : 'member',
    memberStatus: headerValue(req, 'x-od-workspace-member-status') === 'removed' ? 'removed' : 'active',
    lifecycleState:
      lifecycleState === 'billing_past_due' || lifecycleState === 'locked' || lifecycleState === 'deleting' || lifecycleState === 'deleted'
        ? lifecycleState
        : 'active',
    canShareProjects: true,
    canWriteSyncedFiles: true,
  };
}

export const workspaceProjectContext = workspaceResourceContext;

export function workspaceResourceContextFromRequest(req: any): WorkspaceResourceContext | 'missing' | null {
  const workspaceId = headerValue(req, 'x-od-workspace-id');
  const workspaceMemberId = headerValue(req, 'x-od-workspace-member-id');
  if (!workspaceId && !workspaceMemberId) return null;
  if (!workspaceId || !workspaceMemberId) return 'missing';
  return workspaceResourceContext(req, workspaceId) ?? 'missing';
}

export const workspaceProjectContextFromRequest = workspaceResourceContextFromRequest;

export function workspaceResourceContextFromVerified(_verified?: any): any {
  return null;
}

export const workspaceProjectContextFromVerified = workspaceResourceContextFromVerified;

export type SendApiErrorFn = (
  res: any,
  status: number,
  code: string,
  message: string,
  details?: Record<string, unknown>,
) => unknown;

export type GetWorkspaceResourceFn = (
  db: any,
  workspaceId: string,
  resourceId: string,
) => any;

export type GetWorkspaceResourceByIdFn = (
  db: any,
  resourceId: string,
) => any;

export async function enforceVerifiedWorkspaceResourceMutation(
  _resourceType: string,
  _req: any,
  _res: any,
  _sendApiError: SendApiErrorFn,
  _getWorkspaceResource: GetWorkspaceResourceFn,
  _getWorkspaceResourceByResourceId: GetWorkspaceResourceByIdFn,
  _db: any,
  _resourceId: string,
  _capability: any,
  _verifyWorkspaceRequestAuthority?: any,
  _options?: any,
): Promise<boolean> {
  return true;
}

export async function enforceVerifiedWorkspaceResourceRead(
  _resourceType: string,
  _req: any,
  _res: any,
  _sendApiError: SendApiErrorFn,
  _getWorkspaceResource: GetWorkspaceResourceFn,
  _getWorkspaceResourceByResourceId: GetWorkspaceResourceByIdFn,
  _db: any,
  _resourceId: string,
  _verifyWorkspaceRequestAuthority?: any,
  _options?: any,
): Promise<boolean> {
  return true;
}

export function requestWithWorkspaceNavigationScope(req: any): any {
  return req;
}

export function resolveOptionalLocalWorkspaceRequestAuthority(_req?: any): any {
  return {
    ok: true,
    context: null,
  };
}

export type WorkspaceDirectoryFetchResult = {
  ok: boolean;
  items?: any[];
  error?: any;
};

export type CreatedProjectWorkspaceResolution =
  | { ok: true; context: WorkspaceResourceContext | null }
  | {
      ok: false;
      status: 400 | 401 | 403 | 503;
      code: string;
      message: string;
      retryable?: true;
    };

export function sendCreatedProjectWorkspaceError(res: any, error: any): any {
  return res.status(error.status).json({ ok: false, error: { code: error.code, message: error.message } });
}

export function localProjectWorkspaceAttribution(_req?: any): WorkspaceResourceContext | null {
  return null;
}

export async function authorizeCreatedProjectWorkspace(
  _req?: any,
  _fetchWorkspaceDirectory?: any,
  _configuredEnv?: any,
): Promise<CreatedProjectWorkspaceResolution> {
  return { ok: true, context: null };
}

export class CreatedProjectWorkspaceResolutionError extends Error {
  readonly status: number;
  readonly code: string;
  readonly retryable?: true;
  constructor(error: any) {
    super(error.message);
    this.name = 'CreatedProjectWorkspaceResolutionError';
    this.status = error.status;
    this.code = error.code;
    if (error.retryable) this.retryable = true;
  }
}

export type CreatedProjectWorkspaceResolver = (
  req: any,
) => Promise<WorkspaceResourceContext | null>;

export function createCreatedProjectWorkspaceResolver(
  _fetchDirectory?: any,
  _configuredEnv?: any,
): CreatedProjectWorkspaceResolver {
  return async () => null;
}

export type EnsureWorkspaceProjectFn = (input: {
  workspaceId: string;
  projectId: string;
  visibility: 'personal' | 'team';
  createdByWorkspaceMemberId?: string | null;
  createdAt?: number | undefined;
}) => unknown;

export function bindCreatedProjectToWorkspace(
  ensureWorkspaceProject: EnsureWorkspaceProjectFn,
  context: WorkspaceResourceContext | null | undefined,
  projectId: string,
  now?: number,
): void {
  if (!context || !context.workspaceId) return;
  ensureWorkspaceProject({
    workspaceId: context.workspaceId,
    projectId,
    visibility: 'personal',
    createdByWorkspaceMemberId: context.workspaceMemberId ?? null,
    ...(now !== undefined ? { createdAt: now } : {}),
  });
}

export type TeamShareScopeRefusal = 'asserted_personal' | 'directory_personal';

export interface WorkspaceTypeRegistry {
  typeOf: (workspaceId: string) => any;
  hasFacts: boolean;
  isKnownPersonal: (workspaceId: string) => boolean;
  learn: (...args: any[]) => void;
}

export function createWorkspaceTypeRegistry(_items?: any): WorkspaceTypeRegistry {
  return {
    typeOf: () => null,
    hasFacts: false,
    isKnownPersonal: () => false,
    learn: () => {},
  };
}

export function refuseTeamShareScope(_fact?: any, _registry?: any): TeamShareScopeRefusal | null {
  return null;
}

export function impossibleTeamShareRows(_rows?: any[], _registry?: any): any[] {
  return [];
}

export function projectCollabScope(_project?: any, _context?: any): any {
  return null;
}

export function teamResourceWorkspaceRoot(...args: any[]): string {
  const baseDir = args[0] || '';
  const workspaceId = args[1] || '';
  return `${baseDir}/workspaces/${workspaceId}`;
}

export function teamResourceMaterializationDir(...args: any[]): string {
  const kindRoot = args[0] || '';
  const workspaceId = args[1] || '';
  const resourceId = args[2] || '';
  const storageName = args[3] || '';
  return `${kindRoot}/${workspaceId}/${storageName || resourceId}`;
}

export interface TeamResourceMaterializationIdentity {
  kind: string;
  workspaceId: string;
  resourceId: string;
  storageName?: string;
  [k: string]: any;
}

export async function readTeamResourceMaterialization(
  ..._args: any[]
): Promise<TeamResourceMaterializationIdentity | null> {
  return null;
}

export function teamResourceSourceKey(_kind: string, _resourceId: string): string {
  return `${_kind}:${_resourceId}`;
}

export interface MaterializeWorkspaceScopedTeamResourceInput {
  kindRoot?: string;
  identity?: any;
  storageName?: string;
  pullInto: (stagedDir: string) => Promise<void> | void;
  verifyWorkspaceScope?: () => Promise<boolean>;
  verifyStillShared?: () => Promise<boolean>;
  [key: string]: any;
}

export async function materializeWorkspaceScopedTeamResource(
  _input?: MaterializeWorkspaceScopedTeamResourceInput,
): Promise<any> {
  return { status: 'committed' };
}

export type TeamResourceKind = 'design-system' | 'plugin' | 'skill';
export type TeamResourceKey = { kind: TeamResourceKind; id: string };

export interface TeamResourceStateProvider {
  getState: (key: TeamResourceKey) => any;
}

export function enforceTeamResourceCopyAllowed(_req?: any, _res?: any, _provider?: any, _key?: any): boolean {
  return true;
}

export class TeamResourceShareForbiddenError extends Error {
  constructor() {
    super('workspace_resource_share_denied');
    this.name = 'TeamResourceShareForbiddenError';
  }
}

export class TeamResourceAuthorityUnavailableError extends Error {
  readonly status = 503;
  readonly code = 'WORKSPACE_RESOURCE_AUTHORITY_UNAVAILABLE';
  readonly retryable = true;
  constructor(cause?: unknown) {
    super('team resource authority is temporarily unavailable', { cause });
    this.name = 'TeamResourceAuthorityUnavailableError';
  }
}

export interface TeamResourceShareRecord {
  id: string;
  hubResourceId?: string;
  title?: string;
  description?: string;
  ownerMemberId?: string;
  canUnshare?: boolean;
  versionId?: string;
  version?: number;
}

export interface TeamResourceRequestScope {
  principal: ResourceHubPrincipal;
  canShare: boolean;
}

export interface TeamResourceShareService {
  share(resourceId: string, scope: any): Promise<{ version: number } | null>;
  unshare(resourceId: string, scope: any): Promise<boolean>;
  sharedIds(scope: any): Promise<string[]>;
  sharedResources(scope: any, readOptions?: any): Promise<TeamResourceShareRecord[]>;
  isShared(resourceId: string, scope: any): boolean | Promise<boolean>;
  readonly configured: boolean;
}

// Server.ts collab stubs
export const AUTHORITATIVE_PROJECT_PRESENCE_CAPABILITY = 'authoritative_project_presence';
export const CODING_PLAN_USAGE_EVENTS_CAPABILITY = 'coding_plan_usage_events';
export const WORKSPACE_DIRECTORY_EVENTS_CAPABILITY = 'workspace_directory_events';
export const SHARED_PROJECT_PLACEHOLDER_METADATA_KEY = '__od_shared_project_placeholder';
export const COLLAB_VELA_FANOUT_CONCURRENCY = 1;

export class ConcurrencyGate {
  async run<T>(fn: () => Promise<T>): Promise<T> {
    return fn();
  }
}

export class WorkspaceBillingAccessRevokedError extends Error {}

export function activeTeamWorkspaceIdentity(): null {
  return null;
}

export function applyOwnedProjectContent(): null {
  return null;
}

export function backgroundPullMaxCumulativeEntriesFromEnv(): number {
  return 100;
}

export function backgroundPullMaxEntriesFromEnv(): number {
  return 100;
}

export function commentRelayLocalBindingMatches(): boolean {
  return false;
}

export function createAccountBillingSummaryCache(): any {
  return { get: () => null, set: () => {}, invalidate: () => {} };
}

export function createActiveWorkspaceSelectionStore(): any {
  return { get: () => null, set: () => {}, clear: () => {} };
}

export function createBackgroundPullSizeGuard(): any {
  return { check: () => true };
}

export function createCollabCloudClientFromEnv(): null {
  return null;
}

export function createCollabCloudService(): null {
  return null;
}

export function createCollabPresenceCloudClient(): null {
  return null;
}

export function createCollabPublishWatcher(): any {
  return { start: () => {}, refresh: async () => {}, dispose: () => {} };
}

export function createCollabRuntime(): any {
  return {
    coordinatePublication: async (_p: any, _pr: any, pub: any) => pub(),
    workspaceContext: async () => null,
    rememberTeamShare: () => {},
    scheduler: { notifyChanged: () => {} },
    publishedHead: () => null,
    teamResources: { resolve: async () => null, set: () => {} },
    requestTeamShare: async () => ({ ok: false }),
    requestTeamUnshare: async () => ({ ok: false }),
    refreshTeamProjectMetadata: async () => {},
  };
}

export function createCollabSyncSnapshotStore(): any {
  return { get: () => null, set: () => {} };
}

export function createCommentRelayOutboxStore(): any {
  return { get: () => null, set: () => {} };
}

export function createEventRefreshCoordinator(): any {
  return { coordinate: async (fn: any) => fn(), record: () => {}, dispose: () => {} };
}

export function createOwnedContentSync(): null {
  return null;
}

export function createPersistentSyncCache(): any {
  return { get: () => null, set: () => {}, invalidate: () => {} };
}

export function createProactiveContentPull(): any {
  return { pull: async () => false, dispose: () => {} };
}

export function createProjectContentTransferStateStore(): any {
  return { get: () => null, set: () => {} };
}

export function createRememberedTeamResourceScopes(): any {
  return {
    get: () => null,
    remember: (scope: any) => scope,
  };
}

export function createScopedVelaTeamProjectCatalogClientCache(): any {
  return { get: () => null };
}

export function createSqliteOwnedContentStore(): null {
  return null;
}

export function createSqlitePublicFilePublicationStore(): any {
  return { get: () => null, set: () => {} };
}

export function createSwrCache(): any {
  return { get: () => null, set: () => {}, invalidate: () => {} };
}

export function createSyncDigestReader(): any {
  return { read: async () => null };
}

export function createTeamProjectsChangeEmitter(): any {
  return { emit: () => {} };
}

export function createTeamProjectsLister(): any {
  return async () => [];
}

export function createTeamResourceListCache(): any {
  return { get: () => null, set: () => {}, invalidate: () => {} };
}

export function createTeamResourceShareService(): any {
  return {
    share: async () => null,
    unshare: async () => false,
    sharedIds: async () => [],
    sharedResources: async () => [],
    isShared: () => false,
    configured: false,
  };
}

export async function runVelaResourceCommand(..._args: any[]): Promise<string> {
  return JSON.stringify([]);
}

export function createTeamResourceVersionStore(): any {
  return { get: () => null, set: () => {} };
}

export function createVelaCliCollabClientFromEnv(): null {
  return null;
}

export function createVelaCliTeamProjectCatalogClientFromEnv(): null {
  return null;
}

export function createVelaCliTeamProjectCatalogFromEnv(): null {
  return null;
}

export function createVelaResourcePullBatcher(): any {
  return { batch: async () => [] };
}

export function createWorkspaceAuthorityHealthCoordinator(): any {
  return { reportHealthy: () => {}, reportUnhealthy: () => {}, isHealthy: () => true };
}

export function createWorkspaceBillingRuntimeCoordinator(): any {
  return {
    check: () => true,
    interestedKeys: () => [],
    resetIdentity: () => {},
    reconnect: () => {},
    setRealtimeHealthy: () => {},
    revokeWorkspace: () => {},
    invalidate: () => {},
    dispose: () => {},
  };
}

export function createWorkspaceContextProviderFromEnv(): any {
  return async () => null;
}

export function createWorkspaceDirectoryAuthorityBroker(): any {
  return { getDirectory: async () => [] };
}

export function createWorkspaceExactAuthorityCache(): any {
  return { get: () => null, set: () => {}, invalidate: () => {} };
}

export function createWorkspaceExactContextCache(): any {
  return { get: () => null, set: () => {}, invalidate: () => {} };
}

export function createWorkspaceHubSubscriptionManager(): any {
  return {
    subscribe: () => () => {},
    notify: () => {},
    setBillingInterests: () => {},
    activeWorkspaceIds: () => [],
    retainEventInterest: () => () => {},
    refreshEndpoints: () => {},
    dispose: () => {},
  };
}

export function createWorkspaceInvalidationPoller(): any {
  return { start: () => {}, stop: () => {}, pollNow: async () => {} };
}

export function createWorkspaceTeamResourceEventCoordinator(): any {
  return { coordinate: async (fn: any) => fn() };
}

export function emitSharedProjectPullTiming(): void {}

export function emitWorkspaceEventToAllScopes(): void {}

export function emitWorkspaceEventToScope(): void {}

export function fetchVelaWorkspaceDirectory(): any {
  return { ok: true, items: [] };
}

export function getTeamProjectMaterialization(): null {
  return null;
}

export function handleHubProjectMetadataChanged(): void {}

export function handleHubTeamProjectsChanged(): void {}

export function handlePolledWorkspaceInvalidation(): void {}

export function inspectAuthorizedTeamProjectPull(): null {
  return null;
}

export function invalidateTeamResourceListingCaches(): void {}

export function isUnmaterializedSharedPlaceholder(): boolean {
  return false;
}

export function latestTeamProjectMaterializationVersion(): number {
  return 0;
}

export function materializePulledTeamMirror(): null {
  return null;
}

export function ownedContentFingerprint(): string {
  return '';
}

export function parseMemberDirectorySnapshot(): any[] {
  return [];
}

export function parseTeamProjectSnapshot(): any[] {
  return [];
}

export function reconcileWorkspaceProjectMetadataWithRemote(): void {}

export function reconcileWorkspaceProjectsWithRemote(): void {}

export function reconcileWorkspaceResourcesWithRemote(): void {}

export function reconcilerRemoteTeamProjects(): any[] {
  return [];
}

export function recoverAuthorizedTeamProjectPromotions(): any[] {
  return [];
}

export function recoverPersistedTeamShareOwnership(): null {
  return null;
}

export function registerCollabContextRoutes(): void {}

export function registerCollabPresenceRoutes(): any {
  return { invalidatePresence: () => {}, markPresenceStale: () => {} };
}

export function registerCollabSyncRoutes(): any {
  return { pullSharedProject: async () => ({ ok: false, status: 'unavailable' }) };
}

export function resolveProjectShareDir(_p: any, id: string, _pr: any, fallback?: (id: string) => string): string {
  return fallback ? fallback(id) : id;
}

export function resolveVelaWorkspaceHubEventsEndpoint(): null {
  return null;
}

export function resolveWorkspaceAuthorityCacheMode(): string {
  return 'disabled';
}

export function resolveWorkspaceScope(): null {
  return null;
}

export function sharedProjectPullProfileEnabled(): boolean {
  return false;
}

export function shouldEmitWorkspaceBillingRuntimeNudge(): boolean {
  return false;
}

export function startHubEventsSubscriber(): any {
  return { dispose: () => {} };
}

export function teamProjectMaterializationMatches(): boolean {
  return true;
}

export function teamProjectMaterializationSupersedes(): boolean {
  return false;
}

export function teamResourceRequestScopeForWorkspaceId(): null {
  return null;
}

export function teamResourceRequestScopeFromContext(): null {
  return null;
}

export function unshareIfCurrentlyShared(): boolean {
  return false;
}

export function velaWorkspaceDirectoryIdentity(): string {
  return '';
}

export function verifyWorkspaceRequestContext(): any {
  return { ok: true, context: null };
}

export function withLastKnownWorkspaceContext<T>(fn: () => T): T {
  return fn();
}

export function workspaceContextFromDirectoryItem(
  item?: any,
  _configuredEnv?: any,
): any {
  if (!item) return null;
  return {
    workspaceId: item.workspaceId,
    workspaceType: item.workspaceType,
    workspaceMemberId: item.workspaceMemberId,
    role: item.role,
    memberStatus: item.memberStatus ?? 'active',
    lifecycleState: item.lifecycleState ?? 'active',
    billingState: 'active',
    planId: null,
    providerMode: 'platform_credits',
    seatSummary: { seatLimit: 0, usedSeats: 0 },
    permissions: {},
    ...item,
  };
}

export type TeamMirrorPullScope = any;
export type LocalTeamProjectBinding = any;
export type LocalTeamResourceBinding = any;
export type MaterializedTeamResourceRef = any;
export type OwnedContentScope = any;
export type OwnedContentSync = any;
export type ProactiveContentPullTarget = any;
export type RememberedTeamResourceScopeLease = any;
export type TeamResourceSharedReadOptions = any;
export type WorkspaceHubSubscriptionManager = any;
export type WorkspaceProjectsReconcilerDeps = any;
export type WorkspaceTeamResourceRefreshReason = any;
