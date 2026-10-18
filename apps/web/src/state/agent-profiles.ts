import type {
  AgentProfile,
  AgentProfileInput,
  AgentProfileResponse,
  AgentProfilesResponse,
} from '@open-design/contracts';

export class AgentProfilesHttpError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
    this.name = 'AgentProfilesHttpError';
  }
}

async function readErrorMessage(resp: Response): Promise<string> {
  try {
    const json = (await resp.json()) as { error?: string | { message?: string } };
    if (typeof json.error === 'string') return json.error;
    if (json.error && typeof json.error.message === 'string') return json.error.message;
  } catch {
    // Not JSON: fall through to the status line.
  }
  return `HTTP ${resp.status}`;
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const resp = await fetch(url, init);
  if (!resp.ok) throw new AgentProfilesHttpError(resp.status, await readErrorMessage(resp));
  return (await resp.json()) as T;
}

const JSON_HEADERS = { 'Content-Type': 'application/json' };

export async function listAgentProfiles(): Promise<AgentProfile[]> {
  const json = await request<AgentProfilesResponse>('/api/agent-profiles');
  return json.profiles;
}

export async function createAgentProfile(
  input: AgentProfileInput & { name: string; runtimeId: string },
): Promise<AgentProfile> {
  const json = await request<AgentProfileResponse>('/api/agent-profiles', {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify(input),
  });
  return json.profile;
}

export async function updateAgentProfile(
  id: string,
  input: AgentProfileInput,
): Promise<AgentProfile> {
  const json = await request<AgentProfileResponse>(
    `/api/agent-profiles/${encodeURIComponent(id)}`,
    { method: 'PATCH', headers: JSON_HEADERS, body: JSON.stringify(input) },
  );
  return json.profile;
}

export async function deleteAgentProfile(id: string): Promise<void> {
  await request<{ ok: true }>(`/api/agent-profiles/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
}
