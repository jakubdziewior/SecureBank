export const INACTIVITY_LOCK_MS = 5 * 60 * 1000;

let lastActivityAt = Date.now();

export const markUserActivity = (): void => {
  lastActivityAt = Date.now();
};

export const getIdleTimeMs = (): number => Date.now() - lastActivityAt;
