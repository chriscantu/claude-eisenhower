/**
 * google.ts — Google Tasks adapter (STUB).
 *
 * Real implementation lands in issue #66 (https://github.com/chriscantu/claude-eisenhower/issues/66).
 * Shares OAuth refresh-token flow via scripts/google-auth.ts.
 *
 * Until #66 ships, calling pushTask() or completeTask() throws a descriptive
 * error pointing at the tracking issue so installs configured with
 * `adapter: google` fail loudly, not silently.
 */

import type {
  TaskOutputAdapter,
  TaskOutputRecord,
  PushResult,
  CompleteResult,
} from "../../adapter-types";

export function createGoogleTasksAdapter(): TaskOutputAdapter {
  return {
    name: "google",
    async pushTask(_record: TaskOutputRecord): Promise<PushResult> {
      throw new Error(
        "Google Tasks adapter not yet implemented — see #66 (https://github.com/chriscantu/claude-eisenhower/issues/66)",
      );
    },
    async completeTask(
      _title: string,
      _list_name: string,
      _externalId?: string
    ): Promise<CompleteResult> {
      throw new Error(
        "Google Tasks adapter not yet implemented — see #66 (https://github.com/chriscantu/claude-eisenhower/issues/66)",
      );
    },
  };
}
