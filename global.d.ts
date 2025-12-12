import type { drive_v3 } from "googleapis";

declare global {
  var __driveClient: drive_v3.Drive | undefined;

  var __driveCache: {
    middleCache: Record<
      string,
      {
        id: string;
        subFolders: drive_v3.Schema$File[];
        images: Record<string, string[]>;
      }
    >;
  } | undefined;

  var __detailCache: {
    rootFolderId: string | null;
    middleFolders: Record<string, string>;
  } | undefined;
}

export {};
