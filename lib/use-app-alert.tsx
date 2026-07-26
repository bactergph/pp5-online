'use client'

import { useCallback, useState } from 'react'
import AppAlertModal from '@/components/AppAlertModal'

export type AppAlertType = 'success' | 'error' | 'confirm'

export type AppAlertState = {
  type: AppAlertType
  title: string
  message?: string
  confirmLabel?: string
  cancelLabel?: string
  confirmTone?: 'danger' | 'primary'
  onConfirm?: () => void
  onCancel?: () => void
} | null

export function useAppAlert(
  successTitle = 'บันทึกสำเร็จ',
  errorTitle = 'บันทึกไม่สำเร็จ',
) {
  const [alertModal, setAlertModal] = useState<AppAlertState>(null)

  const notify = useCallback((
    type: 'success' | 'error',
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

  const confirm = useCallback((options: {
    title: string
    message?: string
    confirmLabel?: string
    cancelLabel?: string
    confirmTone?: 'danger' | 'primary'
  }) => new Promise<boolean>(resolve => {
    setAlertModal({
      type: 'confirm',
      title: options.title,
      message: options.message,
      confirmLabel: options.confirmLabel,
      cancelLabel: options.cancelLabel,
      confirmTone: options.confirmTone,
      onConfirm: () => {
        setAlertModal(null)
        resolve(true)
      },
      onCancel: () => {
        setAlertModal(null)
        resolve(false)
      },
    })
  }), [])

  const AlertModal = useCallback(() => (
    <AppAlertModal
      open={alertModal !== null}
      type={alertModal?.type || 'success'}
      title={alertModal?.title || ''}
      message={alertModal?.message}
      confirmLabel={alertModal?.confirmLabel}
      cancelLabel={alertModal?.cancelLabel}
      confirmTone={alertModal?.confirmTone}
      onClose={() => {
        if (alertModal?.type === 'confirm') {
          alertModal.onCancel?.()
          return
        }
        clearAlert()
      }}
      onConfirm={alertModal?.type === 'confirm' ? alertModal.onConfirm : undefined}
    />
  ), [alertModal, clearAlert])

  return { alertModal, notify, confirm, clearAlert, AlertModal }
}
