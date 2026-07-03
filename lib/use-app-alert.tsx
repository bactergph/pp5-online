'use client'

import { useCallback, useState } from 'react'
import AppAlertModal from '@/components/AppAlertModal'

export type AppAlertType = 'success' | 'error'

export type AppAlertState = {
  type: AppAlertType
  title: string
  message?: string
} | null

export function useAppAlert(
  successTitle = 'บันทึกสำเร็จ',
  errorTitle = 'บันทึกไม่สำเร็จ',
) {
  const [alertModal, setAlertModal] = useState<AppAlertState>(null)

  const notify = useCallback((
    type: AppAlertType,
    message: string,
    title?: string,
  ) => {
    setAlertModal({
      type,
      title: title ?? (type === 'success' ? successTitle : errorTitle),
      message,
    })
  }, [successTitle, errorTitle])

  const clearAlert = useCallback(() => setAlertModal(null), [])

  const AlertModal = useCallback(() => (
    <AppAlertModal
      open={alertModal !== null}
      type={alertModal?.type || 'success'}
      title={alertModal?.title || ''}
      message={alertModal?.message}
      onClose={clearAlert}
    />
  ), [alertModal, clearAlert])

  return { alertModal, notify, clearAlert, AlertModal }
}
