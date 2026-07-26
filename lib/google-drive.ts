import { Readable } from 'stream'
import 'server-only'
import { google } from 'googleapis'
import { getDriveClientForSchool } from '@/lib/google-drive/school-drive'

type ServiceAccount = {
  client_email: string
  private_key: string
}

function loadServiceAccount(): ServiceAccount | null {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON
  if (!raw) return null
  try {
    return JSON.parse(raw) as ServiceAccount
  } catch {
    return null
  }
}

function serviceAccountDriveClient() {
  const account = loadServiceAccount()
  if (!account) return null
  const auth = new google.auth.JWT({
    email: account.client_email,
    key: account.private_key,
    scopes: ['https://www.googleapis.com/auth/drive'],
  })
  return google.drive({ version: 'v3', auth })
}

async function resolveDriveClient(schoolId?: string) {
  if (schoolId) {
    const oauthDrive = await getDriveClientForSchool(schoolId)
    if (oauthDrive) return oauthDrive
  }
  return serviceAccountDriveClient()
}

async function findFolder(drive: ReturnType<typeof google.drive>, parentId: string, name: string) {
  const q = [
    `'${parentId}' in parents`,
    `name = '${name.replace(/'/g, "\\'")}'`,
    "mimeType = 'application/vnd.google-apps.folder'",
    'trashed = false',
  ].join(' and ')
  const res = await drive.files.list({
    q,
    fields: 'files(id, name)',
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
    pageSize: 1,
  })
  return res.data.files?.[0]?.id || null
}

async function createFolder(drive: ReturnType<typeof google.drive>, parentId: string, name: string) {
  const res = await drive.files.create({
    requestBody: {
      name,
      mimeType: 'application/vnd.google-apps.folder',
      parents: [parentId],
    },
    fields: 'id',
    supportsAllDrives: true,
  })
  return res.data.id!
}

export async function ensureDriveFolderPath(
  drive: ReturnType<typeof google.drive>,
  rootFolderId: string,
  segments: string[],
) {
  let parentId = rootFolderId
  const built: string[] = []
  for (const segment of segments) {
    built.push(segment)
    const existing = await findFolder(drive, parentId, segment)
    parentId = existing || await createFolder(drive, parentId, segment)
  }
  return { folderId: parentId, folderPath: built.join('/') }
}

export async function uploadFileToDrive(params: {
  schoolId: string
  rootFolderId: string
  folderSegments: string[]
  fileName: string
  buffer: Buffer
  mimeType?: string
}) {
  const drive = await resolveDriveClient(params.schoolId)
  if (!drive) {
    return { fileId: null, webViewLink: null, folderPath: params.folderSegments.join('/') }
  }

  const { folderId, folderPath } = await ensureDriveFolderPath(
    drive,
    params.rootFolderId,
    params.folderSegments,
  )
  if (!folderId) {
    return { fileId: null, webViewLink: null, folderPath }
  }

  const res = await drive.files.create({
    requestBody: {
      name: params.fileName,
      parents: [folderId],
    },
    media: {
      mimeType: params.mimeType || 'application/octet-stream',
      body: Readable.from(params.buffer),
    },
    fields: 'id, webViewLink, webContentLink',
    supportsAllDrives: true,
  })

  return {
    fileId: res.data.id || null,
    webViewLink: res.data.webViewLink || res.data.webContentLink || null,
    folderPath,
  }
}

export async function uploadPdfToDrive(params: {
  schoolId: string
  rootFolderId: string
  folderSegments: string[]
  fileName: string
  buffer: Buffer
}) {
  return uploadFileToDrive({ ...params, mimeType: 'application/pdf' })
}

export async function deleteDriveFile(schoolId: string, fileId: string | null | undefined) {
  if (!fileId) return
  const drive = await resolveDriveClient(schoolId)
  if (!drive) return
  await drive.files.delete({ fileId, supportsAllDrives: true }).catch(() => {})
}

export function isGoogleDriveConfigured() {
  return Boolean(
    process.env.GOOGLE_OAUTH_CLIENT_ID
    || loadServiceAccount(),
  )
}
