import { useSyncExternalStore } from "react";

const subscribe = () => () => {};

// True only after the client has taken over from SSR. Deliberately not a
// useState+useEffect("mounted") pair: useSyncExternalStore's
// getServerSnapshot lets the first client render match the server
// render exactly (both `false`), so there's nothing to reconcile and no
// hydration-mismatch warning — the same class of bug as next-themes'
// own client-only `theme` value, just without triggering one itself.
export function useHydrated() {
  return useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
}
