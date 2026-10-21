import { describe, expect, it } from 'vitest';

import { workspaceTeamTransportEnv } from '../src/workspace-team.js';

describe('workspaceTeamTransportEnv', () => {
  it('returns empty env when cloud/vela is disabled', () => {
    expect(
      workspaceTeamTransportEnv('feature-test', 'https://feature-test.vela.example/'),
    ).toEqual({});
    expect(workspaceTeamTransportEnv('prod', 'https://open-design.ai/cloud')).toEqual({});
    expect(workspaceTeamTransportEnv('feature-test', undefined)).toEqual({});
    expect(workspaceTeamTransportEnv('prod', undefined)).toEqual({});
    expect(workspaceTeamTransportEnv('prod', '   ')).toEqual({});
    expect(workspaceTeamTransportEnv('staging', 'https://vela.example')).toEqual({});
    expect(workspaceTeamTransportEnv(null, 'https://vela.example')).toEqual({});
  });
});
