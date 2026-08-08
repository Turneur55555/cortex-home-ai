import { useEffect, useState } from "react";
import { getIsOnline, subscribeToNetworkStatus } from "@/lib/offline/networkStatus";

/** État réseau réactif (`navigator.onLine` + events `online`/`offline`). */
export function useNetworkStatus(): boolean {
  const [isOnline, setIsOnline] = useState(getIsOnline);

  useEffect(() => {
    setIsOnline(getIsOnline());
    return subscribeToNetworkStatus(setIsOnline);
  }, []);

  return isOnline;
}
