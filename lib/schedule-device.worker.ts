import { buildDeviceDraft, type DeviceSnapshot } from './schedule-device-build'

const worker = self as unknown as {
  onmessage: ((event: MessageEvent<{ data: DeviceSnapshot; year: string; rooms: string[]; clear: boolean }>) => void) | null
  postMessage: (message: unknown) => void
}

worker.onmessage = event => {
  try {
    worker.postMessage(buildDeviceDraft(event.data.data, event.data.year, event.data.rooms, event.data.clear))
  } catch (error) {
    worker.postMessage({
      status: 'invalid',
      issues: [{ severity: 'error', message: error instanceof Error ? error.message : 'จัดตารางบนเครื่องนี้ไม่สำเร็จ', step: 6 }],
      rows: [],
      offerings: [],
      unlock: [],
      assigned: 0,
      locked: 0,
    })
  }
}
