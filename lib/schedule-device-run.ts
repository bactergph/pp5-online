import { buildDeviceDraft, type DeviceDraft, type DeviceSnapshot } from './schedule-device-build'

export function solveScheduleOnDevice(data: DeviceSnapshot, year: string, rooms: string[], clear: boolean, signal?: AbortSignal) {
  const cancelled:DeviceDraft={status:'invalid',message:'ยกเลิกการจัดแล้ว ตารางเดิมไม่เปลี่ยน',issues:[],rows:[],offerings:[],unlock:[],assigned:0,locked:0}
  const build=():DeviceDraft=>{
    try{return buildDeviceDraft(data,year,rooms,clear)}
    catch(error){return {...cancelled,message:error instanceof Error?error.message:'จัดตารางบนเครื่องไม่สำเร็จ'}}
  }
  if(signal?.aborted)return Promise.resolve(cancelled)
  if (typeof Worker === 'undefined') return Promise.resolve(build())
  return new Promise<DeviceDraft>(resolve => {
    let worker: Worker
    try {
      worker = new Worker(new URL('./schedule-device.worker.ts', import.meta.url))
    } catch {
      resolve(build())
      return
    }
    const finish = (result: DeviceDraft) => {
      clearTimeout(timer)
      signal?.removeEventListener('abort',abort)
      worker.terminate()
      resolve(result)
    }
    const abort=()=>finish(cancelled)
    const timer = setTimeout(() => finish({ status: 'timeout', issues: [{ severity: 'error', message: 'จัดตารางบนเครื่องนี้ใช้เวลานานเกิน 60 วินาที', step: 6 }], rows: [], offerings: [], unlock: [], assigned: 0, locked: 0 }), 60_000)
    worker.onmessage = (event: MessageEvent<DeviceDraft>) => finish(event.data)
    worker.onerror = () => finish(build())
    signal?.addEventListener('abort',abort,{once:true})
    worker.postMessage({ data, year, rooms, clear })
  })
}
