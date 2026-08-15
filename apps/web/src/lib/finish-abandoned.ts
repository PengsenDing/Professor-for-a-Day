// Starting a new session abandons any still-active one. Best-effort finish
// each orphan so every session reaches a terminal state with a Teacher Report
// (finishSession is idempotent); failures just leave it active.

import { finishSession } from "./api";
import {
  applyFinished,
  loadActiveStoredSessions,
  saveStoredSession,
} from "./session-store";

export function finishAbandonedSessions(excludeSessionId: string) {
  for (const stale of loadActiveStoredSessions()) {
    if (stale.session_id === excludeSessionId) continue;
    void finishSession(stale.session_id)
      .then((finished) => saveStoredSession(applyFinished(stale, finished)))
      .catch(() => {});
  }
}
