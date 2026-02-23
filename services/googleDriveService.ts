
/**
 * Google Drive Service for StallMate
 * Designed for Portable Shop State Architecture
 */

export interface SyncData {
  products: any[];
  transactions: any[];
  reports: any[];
  settings: {
    lang: string;
    telegramConfig: any;
    paymentQRCodes: any;
    receiptConfig: any;
    changeLogs: any[];
    settlementConfig: any;
  };
}

export interface ConnectionStatus {
  ok: boolean;
  message: string;
  details?: {
    libraryLoaded: boolean;
    tokenPresent: boolean;
    apiResponse?: any;
  };
}

export interface SyncResult {
  success: boolean;
  error?: string;
}

const getAccessToken = () => {
  return (window as any).google_access_token || localStorage.getItem('google_access_token');
};

const CLOUD_FOLDER_NAME = 'StallMate_Cloud_Data';
const SETTLEMENTS_FOLDER_NAME = 'Settlements';

/**
 * Verifies if the Google Drive API is accessible with current token.
 */
export const verifyGoogleConnection = async (): Promise<ConnectionStatus> => {
  const token = getAccessToken();

  if (!token) {
    return { ok: false, message: "No access token found.", details: { libraryLoaded: false, tokenPresent: false } };
  }

  try {
    const response = await fetch('https://www.googleapis.com/drive/v3/about?fields=user', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    
    if (response.ok) {
      const data = await response.json();
      return { ok: true, message: `Connected as ${data.user.displayName}`, details: { libraryLoaded: false, tokenPresent: true, apiResponse: data } };
    } else {
      const errorData = await response.json();
      return { ok: false, message: `API Error: ${response.status}`, details: { libraryLoaded: false, tokenPresent: true, apiResponse: errorData } };
    }
  } catch (error: any) {
    return { ok: false, message: `Network Error: ${error.message}`, details: { libraryLoaded: false, tokenPresent: true } };
  }
};

const findFile = async (token: string, query: string): Promise<string | null> => {
  const resp = await fetch(`https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id,name)`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  if (resp.status === 401) throw new Error('UNAUTHORIZED');
  if (!resp.ok) return null;
  const data = await resp.json();
  return data.files?.length > 0 ? data.files[0].id : null;
};

const getOrCreateFolder = async (token: string, folderName: string, parentId?: string): Promise<string> => {
  const headers = { 'Authorization': `Bearer ${token}` };
  let query = `name = '${folderName}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
  if (parentId) query += ` and '${parentId}' in parents`;
  
  let folderId = await findFile(token, query);
  
  if (!folderId) {
    const body: any = {
      name: folderName,
      mimeType: 'application/vnd.google-apps.folder',
    };
    if (parentId) body.parents = [parentId];

    const createFolderResp = await fetch('https://www.googleapis.com/drive/v3/files', {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    if (!createFolderResp.ok) throw new Error('FOLDER_CREATION_FAILED');
    const folderData = await createFolderResp.json();
    folderId = folderData.id;
  }
  return folderId!;
};

/**
 * Uploads a binary settlement file to a sub-folder in Drive using multipart/related.
 */
export const uploadSettlementToDrive = async (fileName: string, blob: Blob): Promise<SyncResult> => {
  const token = getAccessToken();
  if (!token) return { success: false, error: 'NO_TOKEN' };

  try {
    const rootFolderId = await getOrCreateFolder(token, CLOUD_FOLDER_NAME);
    const settlementsFolderId = await getOrCreateFolder(token, SETTLEMENTS_FOLDER_NAME, rootFolderId);

    const metadata = {
      name: fileName,
      parents: [settlementsFolderId],
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    };

    const boundary = 'StallMate_Multipart_Boundary';
    
    // Construct headers for the multipart request
    const metadataPart = 
      `--${boundary}\r\n` +
      `Content-Type: application/json; charset=UTF-8\r\n\r\n` +
      `${JSON.stringify(metadata)}\r\n`;
    
    const mediaPartHeader = 
      `--${boundary}\r\n` +
      `Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet\r\n\r\n`;
    
    const mediaPartFooter = `\r\n--${boundary}--`;

    // Create the final multipart Blob
    const multipartBlob = new Blob([metadataPart, mediaPartHeader, blob, mediaPartFooter], { 
      type: `multipart/related; boundary=${boundary}` 
    });

    const response = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
      method: 'POST',
      headers: { 
        'Authorization': `Bearer ${token}`,
        'Content-Type': `multipart/related; boundary=${boundary}`
      },
      body: multipartBlob
    });

    if (!response.ok) {
      const errData = await response.json();
      throw new Error(errData.error?.message || 'UPLOAD_FAILED');
    }

    return { success: true };
  } catch (error: any) {
    console.error("Settlement Upload Error:", error);
    return { success: false, error: error.message };
  }
};

/**
 * Full cloud synchronization: Saves Inventory and Settings to Drive.
 */
export const syncToGoogleDrive = async (data: SyncData): Promise<SyncResult> => {
  const token = getAccessToken();
  if (!token) return { success: false, error: 'NO_TOKEN' };

  try {
    const folderId = await getOrCreateFolder(token, CLOUD_FOLDER_NAME);

    // 2. Parallel upload of all data registries
    await Promise.all([
      updateOrCreateFile(token, folderId, "inventory.json", data.products),
      updateOrCreateFile(token, folderId, "transactions.json", data.transactions),
      updateOrCreateFile(token, folderId, "daily_reports.json", data.reports),
      updateOrCreateFile(token, folderId, "settings.json", data.settings)
    ]);

    return { success: true };
  } catch (error: any) {
    console.error("Cloud Sync Error:", error);
    if (error.message === 'UNAUTHORIZED') return { success: false, error: 'UNAUTHORIZED' };
    return { success: false, error: error.message };
  }
};

/**
 * Cloud Retrieval: Reconstructs local state from Drive JSON files.
 */
export const downloadFromGoogleDrive = async (): Promise<{ success: boolean; data?: SyncData; error?: string }> => {
  const token = getAccessToken();
  if (!token) return { success: false, error: 'NO_TOKEN' };

  try {
    const folderId = await findFile(token, `name = '${CLOUD_FOLDER_NAME}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`);
    if (!folderId) return { success: false, error: 'FOLDER_NOT_FOUND' };

    // Fetch all registries in parallel for speed
    const [products, transactions, reports, settings] = await Promise.all([
      getFileContent(token, folderId, "inventory.json"),
      getFileContent(token, folderId, "transactions.json"),
      getFileContent(token, folderId, "daily_reports.json"),
      getFileContent(token, folderId, "settings.json")
    ]);

    return {
      success: true,
      data: {
        products: products || [],
        transactions: transactions || [],
        reports: reports || [],
        settings: settings || {
          lang: 'en',
          telegramConfig: { botToken: '', chatId: '', alertType: 'both' },
          paymentQRCodes: {},
          receiptConfig: { companyName: '', address: '', phone: '', email: '' },
          changeLogs: [],
          settlementConfig: { enabled: false, time: '22:00' }
        }
      }
    };
  } catch (error: any) {
    console.error("Cloud Retrieval Error:", error);
    return { success: false, error: error.message };
  }
};

const getFileContent = async (token: string, folderId: string, fileName: string): Promise<any> => {
  const query = `name = '${fileName}' and '${folderId}' in parents and trashed = false`;
  const fileId = await findFile(token, query);
  if (!fileId) return null;

  const resp = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  if (resp.status === 401) throw new Error('UNAUTHORIZED');
  if (resp.ok) return await resp.json();
  return null;
};

const updateOrCreateFile = async (token: string, folderId: string, fileName: string, content: any) => {
  const query = `name = '${fileName}' and '${folderId}' in parents and trashed = false`;
  let fileId = await findFile(token, query);

  if (!fileId) {
    const createResp = await fetch('https://www.googleapis.com/drive/v3/files', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: fileName, parents: [folderId], mimeType: 'application/json' })
    });
    const fileData = await createResp.json();
    fileId = fileData.id;
  }

  const uploadUrl = `https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media`;
  await fetch(uploadUrl, {
    method: 'PATCH',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(content)
  });
};

// Helper methods for Picker UI
export const listDriveFiles = async (): Promise<{ files: any[], error?: string }> => {
  const token = getAccessToken();
  if (!token) return { files: [], error: "No token" };
  const query = "(mimeType contains 'image/' or mimeType = 'application/vnd.google-apps.spreadsheet' or mimeType = 'text/csv') and trashed = false";
  const resp = await fetch(`https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id,name,thumbnailLink,mimeType)&pageSize=50`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  if (resp.status === 401) return { files: [], error: "UNAUTHORIZED" };
  const data = await resp.json();
  return { files: data.files || [] };
};

export const getDriveFileAsBase64 = async (fileId: string): Promise<string | null> => {
  const token = getAccessToken();
  const resp = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  if (resp.status === 401) throw new Error('UNAUTHORIZED');
  if (!resp.ok) return null;
  const blob = await resp.blob();
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.readAsDataURL(blob);
  });
};

export const getDriveFileAsBlob = async (fileId: string): Promise<Blob | null> => {
  const token = getAccessToken();
  const resp = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  if (resp.status === 401) throw new Error('UNAUTHORIZED');
  return resp.ok ? await resp.blob() : null;
};
