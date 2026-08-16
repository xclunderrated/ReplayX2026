import { useEffect, useState } from "react";
import { driveSyncService, DriveSyncStatus } from "../services/driveSyncService";

export function useDriveSync(): DriveSyncStatus & {
  connectGoogle: () => void;
  disconnectGoogle: () => Promise<void>;
  triggerSync: (force?: boolean) => Promise<boolean>;
  restoreFromDrive: () => Promise<{ success: boolean; error?: string }>;
  setAutoSyncEnabled: (enabled: boolean) => void;
  checkStatus: () => Promise<void>;
} {
  const [status, setStatus] = useState<DriveSyncStatus>(() => driveSyncService.getStatus());

  useEffect(() => {
    driveSyncService.init();
    const unsubscribe = driveSyncService.subscribe((newStatus) => {
      setStatus(newStatus);
    });
    return () => {
      unsubscribe();
    };
  }, []);

  return {
    ...status,
    connectGoogle: () => driveSyncService.connectGoogle(),
    disconnectGoogle: () => driveSyncService.disconnectGoogle(),
    triggerSync: (force?: boolean) => driveSyncService.triggerSync(force),
    restoreFromDrive: () => driveSyncService.restoreFromDrive(),
    setAutoSyncEnabled: (enabled: boolean) => driveSyncService.setAutoSyncEnabled(enabled),
    checkStatus: () => driveSyncService.checkStatus(),
  };
}
