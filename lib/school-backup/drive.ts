import 'server-only'
import { ensureDriveFolderPath } from '@/lib/google-drive'
import { getDriveClientForSchool } from '@/lib/google-drive/school-drive'
import { BACKUP_FOLDER } from '@/lib/school-backup/format'

const MAX_BACKUP_BYTES = 80 * 1024 * 1024

export type DriveBackupFile = {
  id: string
  name: string
  size: number | null
  createdTime: string | null
  webViewLink: string | null
}

async function backupFolder(schoolId: string, rootFolderId: string) {
  const drive = await getDriveClientForSchool(schoolId)
  if (!drive) throw new Error('ยังไม่ได้เชื่อม Google Drive')
  const folder = await ensureDriveFolderPath(drive, rootFolderId, [BACKUP_FOLDER])
  if (!folder.folderId) throw new Error('สร้างโฟลเดอร์สำรองข้อมูลบน Google Drive ไม่สำเร็จ')
  return { drive, folderId: folder.folderId }
}

export async function listDriveBackups(schoolId: string, rootFolderId: string): Promise<DriveBackupFile[]> {
  const { drive, folderId } = await backupFolder(schoolId, rootFolderId)
  const listed = await drive.files.list({
    q: `'${folderId}' in parents and trashed = false and name contains 'Database_'`,
    fields: 'files(id, name, size, createdTime, webViewLink)',
    orderBy: 'createdTime desc',
    pageSize: 50,
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
  })
  return (listed.data.files || []).map(file => ({
    id: file.id || '',
    name: file.name || '',
    size: file.size ? Number(file.size) : null,
    createdTime: file.createdTime || null,
    webViewLink: file.webViewLink || null,
  })).filter(file => file.id && file.name.startsWith('Database_'))
}

export async function downloadDriveBackup(schoolId: string, rootFolderId: string, fileId: string) {
  const { drive, folderId } = await backupFolder(schoolId, rootFolderId)
  const meta = await drive.files.get({
    fileId,
    fields: 'id, name, size, parents',
    supportsAllDrives: true,
  })
  if (!meta.data.parents?.includes(folderId) || !meta.data.name?.startsWith('Database_')) {
    throw new Error('เลือกได้เฉพาะไฟล์สำรองในโฟลเดอร์สำรองข้อมูล')
  }
  if (meta.data.size && Number(meta.data.size) > MAX_BACKUP_BYTES) {
    throw new Error('ไฟล์สำรองใหญ่เกินกว่าที่ระบบนำเข้าได้')
  }
  const media = await drive.files.get({
    fileId,
    alt: 'media',
    supportsAllDrives: true,
  }, { responseType: 'arraybuffer' })
  const buffer = Buffer.from(media.data as ArrayBuffer)
  if (buffer.length > MAX_BACKUP_BYTES) throw new Error('ไฟล์สำรองใหญ่เกินกว่าที่ระบบนำเข้าได้')
  return { name: meta.data.name, buffer }
}
