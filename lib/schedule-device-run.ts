import { buildDeviceDraft, type DeviceDraft, type DeviceSnapshot } from './schedule-device-build'

export function solveScheduleOnDevice(data: DeviceSnapshot, year: string, rooms: string[], clear: boolean) {
  if (typeof Worker === 'undefined') return Promise.resolve(buildDeviceDraft(data, year, rooms, clear))
  return new Promise<DeviceDraft>(resolve => {
    let worker: Worker
    try {
      worker = new Worker(new URL('./schedule-device.worker.ts', import.meta.url))
    } catch {
      resolve(buildDeviceDraft(data, year, rooms, clear))
      return
    }
    const finish = (result: DeviceDraft) => {
      clearTimeout(timer)
      worker.terminate()
      resolve(result)
    }
    const timer = setTimeout(() => finish({ status: 'timeout', issues: [{ severity: 'error', message: 'จัดตารางบนเครื่องนี้ใช้เวลานานเกิน 60 วินาที', step: 6 }], rows: [], offerings: [], unlock: [], assigned: 0, locked: 0 }), 60_000)
    worker.onmessage = (event: MessageEvent<DeviceDraft>) => finish(event.data)
    worker.onerror = () => finish(buildDeviceDraft(data, year, rooms, clear))
    worker.postMessage({ data, year, rooms, clear })
  })
}
