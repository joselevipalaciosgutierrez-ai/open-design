import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

// cli.ts is `@ts-nocheck`, so deleting a helper that other subcommands still call
// passes typecheck and only fails at run time with a ReferenceError (the AMR
// cleanup removed this one together with `od collab`, breaking `od project`,
// `od conversation` and `od run`, which is what an orchestrator delegates with).
const cliSource = readFileSync(fileURLToPath(new URL('../src/cli.ts', import.meta.url)), 'utf8');

describe('od CLI helpers used across subcommands', () => {
  it.each(['workspaceHeadersFromExplicitFlags', 'exitWithStructuredError'])(
    '%s is defined wherever it is called',
    (name) => {
      const calls = cliSource.match(new RegExp(`\\b${name}\\(`, 'g'))?.length ?? 0;
      const defined = new RegExp(`function ${name}\\(`).test(cliSource);
      expect(calls).toBeGreaterThan(0);
      expect(defined, `${name} is called ${calls} times but never defined`).toBe(true);
    },
  );
});
