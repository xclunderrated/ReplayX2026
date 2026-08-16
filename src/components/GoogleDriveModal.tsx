import React from "react";
import { CloudBackupModal } from "./CloudBackupModal";

// Re-export for compatibility
export const GoogleDriveModal: React.FC<{ isOpen: boolean; onClose: () => void }> = (props) => {
  return <CloudBackupModal {...props} />;
};
