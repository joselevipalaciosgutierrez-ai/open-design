/**
 * `od resource` is a compatibility entry point for resource commands.
 */
export async function runResource(_args: string[]): Promise<void> {
  console.error('Resource hub is unavailable in standalone mode.');
  process.exitCode = 1;
}
