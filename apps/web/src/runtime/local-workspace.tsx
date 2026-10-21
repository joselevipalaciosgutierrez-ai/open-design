import type { ReactNode } from 'react';
import { createContext, useContext, useMemo, useCallback } from 'react';
import type {
  CollabCloudMemberDirectoryEntry,
  OwnedProjectContentUpdate,
  OwnedProjectContentUpdateRequest,
  ProjectVisibility,
  ProjectWorkspaceScope,
  TeamProject,
  WorkspaceBillingResponse,
  WorkspaceBillingSummary,
  WorkspaceCollabContext,
  WorkspaceInvalidationEventName,
  WorkspaceInvalidationSsePayload,
} from '@open-design/contracts';
import type { Project } from '../types';
import type { AnchorWriteBack } from '../comments';

export interface WorkspaceResourceReadIdentity {
  readonly context: WorkspaceCollabContext;
  readonly generation: string;
}

export interface WorkspaceContextState {
  context: WorkspaceCollabContext | null;
  accountGeneration?: number;
  resourceReadIdentity?: WorkspaceResourceReadIdentity | null;
  loading: boolean;
  identityChangePending?: boolean;
  failure?: 'unsupported' | 'unavailable' | 'reauth-required';
  error?: null;
  refresh?: () => Promise<void>;
  switchWorkspace?: () => Promise<void>;
}

const DEFAULT_WORKSPACE_CONTEXT: WorkspaceContextState = {
  context: null,
  loading: false,
  error: null,
  refresh: async () => {},
  switchWorkspace: async () => {},
};

export function useWorkspaceContext(): WorkspaceContextState {
  return DEFAULT_WORKSPACE_CONTEXT;
}

export function workspaceResourceReadContext(state: WorkspaceContextState): WorkspaceCollabContext | null {
  if (state.resourceReadIdentity !== undefined) {
    return state.resourceReadIdentity?.context ?? null;
  }
  return state.context;
}

export function workspaceIdentityCanBillAmr(_state: WorkspaceContextState): boolean {
  return false;
}

let currentRequestToken = 'initial';

export function currentWorkspaceContextRequestToken(): string {
  return currentRequestToken;
}

export function readWorkspaceDirectoryForCurrentGeneration(): unknown[] {
  return [];
}

export function workspaceContextFromDirectoryItem(_item: unknown): WorkspaceCollabContext | null {
  return null;
}

export async function resolveBoundProjectWorkspaceContext(
  _projectId: string,
): Promise<WorkspaceCollabContext | null> {
  return null;
}

export interface CurrentWorkspaceContextReadWitness {
  context: WorkspaceCollabContext | null;
  isStillCurrent: () => boolean;
}

export function workspaceContextReadWitnessFromState(
  state: Pick<WorkspaceContextState, 'resourceReadIdentity'>,
): CurrentWorkspaceContextReadWitness | null {
  if (!state.resourceReadIdentity) return null;
  return {
    context: state.resourceReadIdentity.context,
    isStillCurrent: () => true,
  };
}

export async function resolveCurrentWorkspaceContextReadWitness(): Promise<CurrentWorkspaceContextReadWitness | null> {
  return null;
}

export function resetWorkspaceContextCache(): void {}

export function lastResolvedWorkspaceContext(): WorkspaceCollabContext | null {
  return null;
}

export function resetTeamProjectsCache(): void {}

export function lastResolvedTeamProjects(): unknown[] {
  return [];
}

export const WORKSPACE_CONTEXT_REFRESH_EVENT = 'od:workspace-context-refresh';

export function workspaceContextRefreshHasVerifiedSelection(): boolean {
  return false;
}

export function notifyWorkspaceContextRefresh(_options?: unknown): void {}

export function resetWorkspaceBillingCache(): void {}

export function shouldRefreshWorkspaceBilling(
  _event: unknown,
  _context?: WorkspaceCollabContext | null,
): boolean {
  return false;
}

export interface WorkspaceBillingScopeInput {
  workspaceId?: string;
  context?: WorkspaceCollabContext | null;
  loading?: boolean;
  revision?: number;
}

export function useWorkspaceBillingResponse(_explicitScope?: unknown): WorkspaceBillingResponse | null {
  return null;
}

export function workspaceBillingSummaryForContext(_response?: unknown, _context?: unknown): WorkspaceBillingSummary | null {
  return null;
}

export function useWorkspaceBilling(): WorkspaceBillingSummary | null {
  return null;
}

export function workspaceBillingBalanceUsd(_response?: unknown, _context?: unknown): string | null {
  return null;
}

export function workspaceBillingSnapshotForContext(_context: unknown): null {
  return null;
}

export const WORKSPACE_BILLING_REFRESH_EVENT = 'od:workspace-billing-refresh';

export function notifyWorkspaceBillingRefresh(_options?: unknown): void {}

export interface TeamProjectsState {
  projects: TeamProject[];
  loading: boolean;
  error: null;
  refresh: () => Promise<void>;
  reload: () => Promise<void>;
}

export const TEAM_PROJECTS_CHANGED_EVENT = 'od:team-projects-changed';

export function notifyTeamProjectsChanged(_options?: unknown): void {}

export function useTeamProjects(): TeamProjectsState {
  return {
    projects: [],
    loading: false,
    error: null,
    refresh: async () => {},
    reload: async () => {},
  };
}

// Workspace identity
export function workspaceProjectHeaders(_context?: unknown): HeadersInit {
  return {};
}

export function workspaceResourceUrl(path: string, _identity?: unknown): string {
  return path;
}

export function appendResourceQuery(path: string, _query: string): string {
  return path;
}

export function workspaceIdentityCacheKey(_context?: unknown): string {
  return '';
}

export function currentWorkspaceAccountGeneration(): number {
  return 0;
}

export function advanceWorkspaceAccountGeneration(_stamp?: string): void {}

export function resetWorkspaceAccountGeneration(): void {}

export function workspaceAccountScopedCacheKey(
  _context?: WorkspaceCollabContext | null | undefined,
  _generation?: number,
): string {
  return '';
}

export function resolveWorkspaceResourceReadIdentity(_state?: unknown): WorkspaceResourceReadIdentity | null {
  return null;
}

export function workspaceResourceReadIdentityFromContext(_context?: unknown): WorkspaceResourceReadIdentity | null {
  return null;
}

export function workspaceResourceReadIdentityKey(_identity?: unknown): string {
  return 'local';
}

export interface WorkspaceResourceScopedRead {
  readonly context: WorkspaceCollabContext | null;
  isStillCurrent: (current?: unknown) => boolean;
}

export function beginWorkspaceResourceScopedRead(
  identity?: WorkspaceResourceReadIdentity | null,
): WorkspaceResourceScopedRead {
  return {
    context: identity?.context ?? null,
    isStillCurrent: () => true,
  };
}

export interface WorkspaceScopedRead {
  readonly context: WorkspaceCollabContext | null;
  isStillCurrent: (current?: unknown) => boolean;
}

export function beginWorkspaceScopedRead(
  context?: WorkspaceCollabContext | null,
): WorkspaceScopedRead {
  return {
    context: context ?? null,
    isStillCurrent: () => true,
  };
}

// Project workspace scope
export interface ProjectWorkspaceScopeState {
  loading: boolean;
  scope: ProjectWorkspaceScope | null;
  failure?: 'unsupported' | 'forbidden' | 'unavailable';
}

export function projectWorkspaceContext(scope: ProjectWorkspaceScope | null | undefined): WorkspaceCollabContext | null {
  return scope?.kind === 'personal' || scope?.kind === 'team' ? scope.context : null;
}

export function projectWorkspaceScopeReady(scope: ProjectWorkspaceScope | null | undefined): boolean {
  return scope?.kind === 'unbound' || scope?.kind === 'personal' || scope?.kind === 'team';
}

export function projectWorkspaceVisibility(scope: ProjectWorkspaceScope | null | undefined): ProjectVisibility | null {
  return scope && scope.kind !== 'unbound' ? scope.visibility : null;
}

export function projectWorkspaceScopeAuthorizesAmr(_scope: unknown): boolean {
  return false;
}

export function runWorkspaceIdentity(
  _state: unknown,
  _caller?: unknown,
  _persistedProjectWorkspaceId?: unknown,
): WorkspaceCollabContext | null {
  return null;
}

export function runWorkspacePersonalAdoptionWitness(
  _state: unknown,
  _caller?: unknown,
  _persistedProjectWorkspaceId?: string | null,
): WorkspaceCollabContext | null {
  return null;
}

export async function resolveProjectWorkspaceContext(
  _projectId?: unknown,
  _caller?: unknown,
  _workspaceId?: unknown,
): Promise<WorkspaceCollabContext | null> {
  return null;
}

export function useProjectWorkspaceScope(
  projectId: string,
  _caller?: unknown,
  _persistedWorkspaceId?: unknown,
  _initialScope?: unknown,
): ProjectWorkspaceScopeState {
  return useMemo(
    () => ({
      loading: false,
      scope: {
        kind: 'unbound',
        projectId,
        workspaceId: null,
        context: null,
      },
    }),
    [projectId],
  );
}

// Team members
export interface TeamMembersState {
  members: CollabCloudMemberDirectoryEntry[];
  byId: Map<string, CollabCloudMemberDirectoryEntry>;
  resolve: (memberId: string | null | undefined) => CollabCloudMemberDirectoryEntry | null;
}

export function currentUserDirectoryEntry(
  context: WorkspaceCollabContext | null | undefined,
): CollabCloudMemberDirectoryEntry | null {
  const memberId = context?.workspaceMemberId?.trim();
  if (!context || !memberId) return null;
  return {
    memberId,
    displayName: context.displayName?.trim() || memberId,
    role: context.role,
  };
}

export function useTeamMembers(
  currentUser?: CollabCloudMemberDirectoryEntry | null,
  _workspaceContextOverride?: unknown,
): TeamMembersState {
  const resolve = useCallback(
    (memberId: string | null | undefined): CollabCloudMemberDirectoryEntry | null => {
      if (currentUser && memberId && currentUser.memberId === memberId) {
        return currentUser;
      }
      return null;
    },
    [currentUser],
  );
  return useMemo(
    () => ({
      members: [],
      byId: new Map<string, CollabCloudMemberDirectoryEntry>(),
      resolve,
    }),
    [resolve],
  );
}

// Collab context & Project collab
export type ProjectResourceAuthority = 'pending' | 'denied' | 'local' | 'workspace';

export interface CollabPresenceMember {
  memberId: string;
  displayName?: string;
  name?: string;
  role?: string;
}

export interface ProjectCollab {
  enabled: boolean;
  member: CollabPresenceMember | null;
  present: CollabPresenceMember[];
  publishedVersion: number | null;
  syncState: string | null;
  viewerOnly: boolean;
  writerAuthority: 'pending' | 'allowed' | 'denied';
  isOwner: boolean;
  isEffectiveOwner: boolean;
  isSharedNonOwner: boolean;
  ownerDisplayName: string | null;
  ownerRole: string | null;
  downloadPending: boolean;
  materializationPending?: boolean;
  reportChange: () => void;
  requestPublish: () => void;
  refreshPresence: () => void;
  checkStatusNow: () => void;
  requestContentUpdate?: (input: OwnedProjectContentUpdateRequest) => Promise<OwnedProjectContentUpdate | null>;
  ownedContentUpdate?: OwnedProjectContentUpdate | null;
  applyContentTransferState?: (state: any) => void;
}

export interface CollabContextValue extends ProjectCollab {
  workspaceContext: WorkspaceCollabContext | null;
  workspaceContextLoading: boolean;
  projectResourceAuthority?: ProjectResourceAuthority;
  onLostAnchors?: (writeBacks: AnchorWriteBack[]) => void;
}

const DEFAULT_COLLAB_VALUE: CollabContextValue = {
  workspaceContext: null,
  workspaceContextLoading: false,
  projectResourceAuthority: 'local',
  enabled: false,
  member: null,
  present: [],
  publishedVersion: null,
  syncState: null,
  viewerOnly: false,
  writerAuthority: 'allowed',
  isOwner: true,
  isEffectiveOwner: true,
  isSharedNonOwner: false,
  ownerDisplayName: null,
  ownerRole: null,
  downloadPending: false,
  materializationPending: false,
  reportChange: () => {},
  requestPublish: () => {},
  refreshPresence: () => {},
  checkStatusNow: () => {},
};

const CollabContext = createContext<CollabContextValue>(DEFAULT_COLLAB_VALUE);

export function CollabProvider({
  value,
  children,
}: {
  value?: CollabContextValue;
  children: ReactNode;
}) {
  return (
    <CollabContext.Provider value={value ?? DEFAULT_COLLAB_VALUE}>
      {children}
    </CollabContext.Provider>
  );
}

export function useProjectCollabContext(): CollabContextValue {
  return useContext(CollabContext);
}

export function useProjectCollab(_projectId?: unknown, _options?: unknown): ProjectCollab {
  return DEFAULT_COLLAB_VALUE;
}

export function markProjectCreatedByViewer(_projectId: string, _workspaceContext?: unknown): void {}

// Team plan
export function resolvePlanTier(_input?: unknown): string {
  return 'free';
}

export function canUpgradeFromPlanTier(_tier?: unknown): boolean {
  return false;
}

export function isMaxPlanTier(_tier?: unknown): boolean {
  return true;
}

export function resolvePlanLabelTier(_tier?: unknown): string {
  return 'Free';
}

export function isTeamPlanTier(_tier?: unknown): boolean {
  return false;
}

// Tab scope
export const UNSET_ACCOUNT_BUCKET = '__unset__';

export interface TabIdentityScopeInputs {
  amrLoginStatus: {
    loggedIn: boolean;
    profile: string;
    user: { id?: string; email?: string } | null;
  } | null;
  workspaceContext: Pick<WorkspaceCollabContext, 'workspaceId'> | null;
  workspaceContextLoading: boolean;
  previousWorkspaceBucket: string;
  previousAccountBucket: string;
}

export interface TabIdentityScopeResult {
  scopeKey: string | null;
  nextWorkspaceBucket: string;
  nextAccountBucket: string;
}

export function deriveTabIdentityScope(
  inputs: TabIdentityScopeInputs,
): TabIdentityScopeResult {
  const {
    amrLoginStatus,
    previousWorkspaceBucket,
    previousAccountBucket,
  } = inputs;

  if (amrLoginStatus === null) {
    return {
      scopeKey: null,
      nextWorkspaceBucket: previousWorkspaceBucket,
      nextAccountBucket: previousAccountBucket,
    };
  }

  const accountBucket = amrLoginStatus.loggedIn
    ? amrLoginStatus.user?.id?.trim()
      || amrLoginStatus.user?.email?.trim()
      || `profile:${amrLoginStatus.profile}`
    : 'anon';

  return {
    scopeKey: `${accountBucket}::none`,
    nextWorkspaceBucket: 'none',
    nextAccountBucket: accountBucket,
  };
}

// Team projects catalog
export function asTeamProjectRows(value: unknown): TeamProject[] {
  return Array.isArray(value) ? (value as TeamProject[]) : [];
}

export async function fetchTeamProjectsCatalog(_options?: unknown): Promise<TeamProject[]> {
  return [];
}

export function beginTeamProjectMetadataRefresh(_options?: unknown): {
  cacheDiscriminator: string;
  isLatest: () => boolean;
} {
  return {
    cacheDiscriminator: '',
    isLatest: () => true,
  };
}

export async function fetchTeamProjectCatalogEntry(
  _options: unknown,
): Promise<TeamProject | null> {
  return null;
}

// All projects list helpers
export type SharedProjectPredicate = (projectId: string) => boolean;

export function createSharedProjectPredicate(_input?: unknown): SharedProjectPredicate {
  return () => false;
}

export function buildAllProjectsList(input: {
  projects: Project[];
  [k: string]: unknown;
}): Project[] {
  return input.projects;
}

export function buildDraftsList(input: {
  projects: Project[];
  [k: string]: unknown;
}): Project[] {
  return input.projects;
}

export function reconcileSharedProjectCatalogFields(input: {
  projects: Project[];
  [k: string]: unknown;
}): Project[] {
  return input.projects;
}

// Optimistic project ownership
export type OptimisticProjectOwnershipWitnesses = ReadonlyMap<string, unknown>;

export function recordOptimisticProjectOwnership(
  current: OptimisticProjectOwnershipWitnesses,
  _input?: unknown,
): OptimisticProjectOwnershipWitnesses {
  return current;
}

export function forgetOptimisticProjectOwnership(
  current: OptimisticProjectOwnershipWitnesses,
  _projectId?: string,
): OptimisticProjectOwnershipWitnesses {
  return current;
}

export function optimisticProjectOwnershipScopeKey(_context?: unknown, _accountGeneration?: number): string {
  return 'local';
}

export function projectOwnerMemberIdsWithOptimisticWitnesses(_input?: unknown): ReadonlyMap<string, string> {
  return new Map<string, string>();
}

export function reconcileOptimisticProjectOwnership(
  current: OptimisticProjectOwnershipWitnesses,
  _input?: unknown,
): OptimisticProjectOwnershipWitnesses {
  return current;
}

// Project shared status
export async function projectIsSharedWithWorkspace(
  _projectIdOrProject?: unknown,
  _workspaceContext?: unknown,
): Promise<boolean> {
  return false;
}

// Public file publish
export class PublicFilePublishError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
    public readonly code?: string,
    public readonly recoveryData?: unknown,
  ) {
    super(message);
    this.name = 'PublicFilePublishError';
  }
}

export function canPublishPublicFile(_project?: unknown): boolean {
  return false;
}

export function publicFileManualRevokePublication(
  _error?: unknown,
): { url: string; slug: string; fileName?: string } | null {
  return null;
}

export type PublicFilePublishFailureKey =
  | 'fileViewer.publishFileRequiresWorkspace'
  | 'fileViewer.publishFileFailed';

export function publicFilePublishFailureKey(_error?: unknown): PublicFilePublishFailureKey {
  return 'fileViewer.publishFileFailed';
}

// Settings access
export function canShowWorkspaceSettings(_context?: unknown): boolean {
  return false;
}

// Comment anchor
export async function persistCommentAnchors(_anchors?: unknown): Promise<void> {}

// Invite error copy
export function workspaceInviteErrorMessageKey(_code?: unknown): any {
  return 'workspaceInvite.submitFailed';
}

// Workspace events & snapshot activation
export type WorkspaceInvalidationHandlers = {
  [Name in WorkspaceInvalidationEventName]?: (
    payload: Extract<WorkspaceInvalidationSsePayload, { type: Name }>,
  ) => void;
};

export interface UseWorkspaceInvalidationOptions {
  workspaceContext?: WorkspaceCollabContext | null;
  onActive?: (reason: any) => void;
  enabled?: boolean;
}

export function useWorkspaceInvalidation(
  _handlers?: WorkspaceInvalidationHandlers,
  _options?: UseWorkspaceInvalidationOptions,
): { connected: boolean } {
  return { connected: false };
}

export function useWorkspaceSnapshotActivation(_options?: unknown): () => void {
  return () => {};
}

// Project route workspace context
export interface ProjectRouteWorkspaceContextState {
  context: WorkspaceCollabContext | null;
  loading: boolean;
  failure?: 'forbidden' | 'unavailable';
  retry: () => void;
}

export function useProjectRouteWorkspaceContext(
  _persistedWorkspaceId?: string | null | undefined,
  _ambientState?: WorkspaceContextState,
  _bootstrapWorkspaceContext?: WorkspaceCollabContext | null,
): ProjectRouteWorkspaceContextState {
  return { context: null, loading: false, retry: () => {} };
}

export function projectResourceReadsCanStart(
  _persistedWorkspaceId?: string | null | undefined,
  _state?: ProjectRouteWorkspaceContextState,
): boolean {
  return true;
}

// UI stubs
export type FileSyncBadgeState = 'downloading' | 'uploading';

export function FileSyncBadge(_props?: { state?: FileSyncBadgeState | null; size?: number; title?: string }) {
  return null;
}

export function PresenceBar(_props: any): any {
  return null;
}

export function CollabDemoView(_props: any): any {
  return null;
}

export function WorkspaceMemberDirectoryPreloader(): any {
  return null;
}

export function resetTeamMembersStores(): void {}

export class CollabClient {
  constructor(_options?: any) {}

  static create(..._args: any[]): any {
    return new CollabClient();
  }

  async pollStatus(): Promise<any> {
    return null;
  }
}

export async function fetchProjectCollabStatus(..._args: any[]): Promise<any> {
  return null;
}
