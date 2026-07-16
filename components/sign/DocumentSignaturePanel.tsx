'use client'

import { useCallback, useEffect, useState } from 'react'
import { useAppAlert } from '@/lib/use-app-alert'
import {
  cancelClassDocumentProposal,
  cancelPp5SubjectProposal,
  fetchClassDocApprovalStatus,
  fetchDocumentApprovalSubmissionHistory,
  fetchPp5SubjectApprovalStatus,
  proposeClassDocument,
  proposePp5Subject,
  putClassDocumentSignature,
  putPp5SubjectSignature,
  signClassDocument,
  signPp5Subject,
} from '@/app/sign/actions'
import type { ApprovalSubmissionHistoryItem } from '@/lib/approvals/submission-history'
import type { ClassDocType } from '@/lib/approvals/types'
import { approvalTermFromReport } from '@/lib/approvals/types'

type SignatureState = {
  status: string
  status_label: string
  isInitiator: boolean
  hasDocumentSignature: boolean
  canPutSignature: boolean
  canPropose: boolean
  canShowPropose: boolean
  canRepropose?: boolean
  canCancelProposal?: boolean
  hasApproverSignatures?: boolean
  canSign: boolean
  isDirectorStep: boolean
  next_step: string | null
}

type Props = {
  variant: 'pp5_subject' | 'pp5_class' | 'pp6' | 'classroom_admin'
  classSubjectId?: string
  classroomId?: string
  reportTerm: number
  /** ธุรการชั้นเรียน — เซ็นรายเดือน */
  reportMonth?: number | null
  disabled?: boolean
  compact?: boolean
  /** false = ยังไม่ fetch (แสดงปุ่มจางไว้) — ให้โหลดตารางก่อน */
  enabled?: boolean
  onSignatureChange?: () => void | Promise<void>
}

function variantToDocType(variant: Props['variant']): ClassDocType | null {
  if (variant === 'pp5_class') return 'pp5_class'
  if (variant === 'pp6') return 'pp6'
  if (variant === 'classroom_admin') return 'classroom_admin'
  return null
}

function formatThaiDateTime(value: string) {
  try {
    return new Date(value).toLocaleString('th-TH', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return value
  }
}

export default function DocumentSignaturePanel({
  variant,
  classSubjectId,
  classroomId,
  reportTerm,
  reportMonth,
  disabled,
  compact,
  enabled = true,
  onSignatureChange,
}: Props) {
  const { notify, AlertModal } = useAppAlert('ดำเนินการสำเร็จ', 'ดำเนินการไม่สำเร็จ')
  const [state, setState] = useState<SignatureState | null>(null)
  const [history, setHistory] = useState<ApprovalSubmissionHistoryItem[]>([])
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [rejectOpen, setRejectOpen] = useState(false)
  const [rejectNote, setRejectNote] = useState('')

  const signTerm = approvalTermFromReport(reportTerm)
  const signMonth = variant === 'classroom_admin' ? (reportMonth ?? null) : null
  const ready = variant === 'pp5_subject'
    ? Boolean(classSubjectId)
    : variant === 'classroom_admin'
      ? Boolean(classroomId && signMonth)
      : Boolean(classroomId)
  const canLoad = enabled && ready

  const reload = useCallback(async () => {
    if (!canLoad) {
      setState(null)
      setHistory([])
      setLoading(false)
      return
    }
    setLoading(true)
    try {
      if (variant === 'pp5_subject' && classSubjectId) {
        if (compact) {
          setState(await fetchPp5SubjectApprovalStatus(classSubjectId, signTerm))
          setHistory([])
        } else {
          const [nextState, nextHistory] = await Promise.all([
            fetchPp5SubjectApprovalStatus(classSubjectId, signTerm),
            fetchDocumentApprovalSubmissionHistory({
              variant: 'pp5_subject',
              classSubjectId,
              term: signTerm,
            }),
          ])
          setState(nextState)
          setHistory(nextHistory)
        }
      } else if (classroomId) {
        const docType = variantToDocType(variant)!
        if (compact) {
          // compact toolbar ไม่แสดงประวัติ — โหลดแค่สถานะเพื่อไม่แย่ง bandwidth กับตาราง
          setState(await fetchClassDocApprovalStatus(docType, classroomId, signTerm, signMonth))
          setHistory([])
        } else {
          const [nextState, nextHistory] = await Promise.all([
            fetchClassDocApprovalStatus(docType, classroomId, signTerm, signMonth),
            fetchDocumentApprovalSubmissionHistory({
              variant,
              classroomId,
              term: signTerm,
            }),
          ])
          setState(nextState)
          setHistory(nextHistory)
        }
      }
    } catch (err) {
      notify('error', err instanceof Error ? err.message : 'โหลดสถานะลายเซ็นไม่สำเร็จ')
    } finally {
      setLoading(false)
    }
  }, [variant, classSubjectId, classroomId, signTerm, signMonth, canLoad, compact, notify])

  useEffect(() => { void reload() }, [reload])

  async function afterAction(successMessage: string) {
    notify('success', successMessage)
    await reload()
    try {
      await onSignatureChange?.()
    } catch (previewErr) {
      notify('error', previewErr instanceof Error ? previewErr.message : 'โหลดพรีวิวใหม่ไม่สำเร็จ')
    }
  }

  async function handlePutSignature() {
    setBusy(true)
    try {
      let result: { error?: string }
      if (variant === 'pp5_subject' && classSubjectId) {
        result = await putPp5SubjectSignature(classSubjectId, signTerm)
      } else if (classroomId) {
        result = await putClassDocumentSignature(variantToDocType(variant)!, classroomId, signTerm, signMonth)
      } else {
        result = { error: 'ข้อมูลไม่ครบ' }
      }
      if (result.error) notify('error', result.error)
      else await afterAction('ใส่ลายเซ็นแล้ว — พิมพ์เอกสารได้เลย')
    } catch (err) {
      notify('error', err instanceof Error ? err.message : 'ใส่ลายเซ็นไม่สำเร็จ')
    } finally {
      setBusy(false)
    }
  }

  async function handlePropose() {
    if (!state?.hasDocumentSignature) {
      notify('error', 'กรุณากดใส่ลายเซ็นก่อน')
      return
    }
    setBusy(true)
    try {
      let result: { error?: string }
      if (variant === 'pp5_subject' && classSubjectId) {
        result = await proposePp5Subject(classSubjectId, signTerm)
      } else if (classroomId) {
        result = await proposeClassDocument(variantToDocType(variant)!, classroomId, signTerm, signMonth)
      } else {
        result = { error: 'ข้อมูลไม่ครบ' }
      }
      if (result.error) notify('error', result.error)
      else {
        await afterAction(state?.canRepropose ? 'เสนอเซ็นรอบใหม่แล้ว' : 'เสนอเซ็นเข้าสายอนุมัติแล้ว')
      }
    } catch (err) {
      notify('error', err instanceof Error ? err.message : 'เสนอเซ็นไม่สำเร็จ')
    } finally {
      setBusy(false)
    }
  }

  async function handleSign(decision?: 'approve' | 'reject', note?: string) {
    setBusy(true)
    try {
      let result: { error?: string }
      if (variant === 'pp5_subject' && classSubjectId) {
        result = await signPp5Subject(classSubjectId, signTerm, decision, note)
      } else if (classroomId) {
        result = await signClassDocument(variantToDocType(variant)!, classroomId, signTerm, decision, note, signMonth)
      } else {
        result = { error: 'ข้อมูลไม่ครบ' }
      }
      if (result.error) notify('error', result.error)
      else {
        notify('success', decision === 'reject' ? 'บันทึกไม่อนุมัติแล้ว' : 'ลงนามเรียบร้อย')
        setRejectOpen(false)
        await reload()
        try {
          await onSignatureChange?.()
        } catch (previewErr) {
          notify('error', previewErr instanceof Error ? previewErr.message : 'โหลดพรีวิวใหม่ไม่สำเร็จ')
        }
      }
    } catch (err) {
      notify('error', err instanceof Error ? err.message : 'ลงนามไม่สำเร็จ')
    } finally {
      setBusy(false)
    }
  }

  async function handleCancelProposal() {
    const message = state?.hasApproverSignatures
      ? 'มีผู้อนุมัติลงนามแล้ว — ยืนยันยกเลิกการเสนอเซ็น?'
      : 'ยืนยันยกเลิกการเสนอเซ็น?'
    if (!window.confirm(message)) return

    setBusy(true)
    try {
      let result: { error?: string }
      if (variant === 'pp5_subject' && classSubjectId) {
        result = await cancelPp5SubjectProposal(classSubjectId, signTerm)
      } else if (classroomId) {
        result = await cancelClassDocumentProposal(variantToDocType(variant)!, classroomId, signTerm, signMonth)
      } else {
        result = { error: 'ข้อมูลไม่ครบ' }
      }
      if (result.error) notify('error', result.error)
      else await afterAction('ยกเลิกการเสนอเซ็นแล้ว')
    } catch (err) {
      notify('error', err instanceof Error ? err.message : 'ยกเลิกไม่สำเร็จ')
    } finally {
      setBusy(false)
    }
  }

  if (!ready) return null

  const actionsLocked = Boolean(disabled)
  const awaitingState = loading || !state
  const showInitiatorActions = compact
    ? !actionsLocked && (awaitingState || Boolean(state?.isInitiator && (state.canPutSignature || state.canShowPropose)))
    : Boolean(state?.isInitiator && (state.canPutSignature || state.canShowPropose) && !actionsLocked)
  const proposeLabel = state?.canRepropose ? 'เสนอเซ็นอีกครั้ง' : 'เสนอเซ็น'
  const putLabel = state?.canRepropose ? 'ใส่ลายเซ็นใหม่' : 'ใส่ลายเซ็น'
  const putReady = !awaitingState && !busy && !actionsLocked && Boolean(state?.canPutSignature)
  const proposeReady = !awaitingState && !busy && !actionsLocked && Boolean(state?.canPropose)

  return (
    <>
      <section className={`sign-panel sign-panel--simple${compact ? ' sign-panel--compact' : ''}`} aria-label="ลายเซ็น">
        <div className="sign-panel__head">
          <span>ลายเซ็น</span>
          {state ? (
            <span className={`sign-panel__badge sign-panel__badge--${state.status}`}>
              {state.status_label}
              {state.status === 'in_review' && state.next_step ? ` · ${state.next_step}` : ''}
            </span>
          ) : (
            <span className="sign-panel__badge sign-panel__badge--draft">ยังไม่พร้อม</span>
          )}
        </div>

        {showInitiatorActions && (
          <>
            {!compact && (
              <p className="sign-panel__hint">
                {state?.canRepropose
                  ? 'เอกสารรอบก่อนเสร็จแล้ว — กดเสนอเซ็นอีกครั้งเพื่อส่งรอบใหม่'
                  : 'ใส่ลายเซ็นเพื่อพิมพ์ได้ทันที — กดเสนอเซ็นเมื่อต้องการส่งเข้าสายอนุมัติ'}
              </p>
            )}
            <div className="sign-panel__dual-actions">
              <button
                type="button"
                className={`sign-panel__btn sign-panel__btn--signature${putReady ? '' : ' is-dimmed'}`}
                disabled={!putReady}
                onClick={handlePutSignature}
              >
                {putLabel}
              </button>
              <button
                type="button"
                className={`sign-panel__btn sign-panel__btn--propose${proposeReady ? '' : ' is-dimmed'}`}
                disabled={!proposeReady}
                onClick={handlePropose}
              >
                {proposeLabel}
              </button>
            </div>
          </>
        )}

        {actionsLocked && state?.isInitiator && (state.canPutSignature || state.canShowPropose) && (
          <div className="sign-panel__dual-actions">
            <button type="button" className="sign-panel__btn sign-panel__btn--signature is-dimmed" disabled>
              {putLabel}
            </button>
            <button type="button" className="sign-panel__btn sign-panel__btn--propose is-dimmed" disabled>
              {proposeLabel}
            </button>
          </div>
        )}

        {state?.canSign && !actionsLocked && (
          <div className="sign-panel__dual-actions">
            {!state.isDirectorStep ? (
              <button
                type="button"
                className={`sign-panel__btn sign-panel__btn--propose${busy ? ' is-dimmed' : ''}`}
                disabled={busy}
                onClick={() => handleSign()}
              >
                ลงนาม
              </button>
            ) : (
              <>
                <button
                  type="button"
                  className={`sign-panel__btn sign-panel__btn--approve${busy ? ' is-dimmed' : ''}`}
                  disabled={busy}
                  onClick={() => handleSign('approve')}
                >
                  อนุมัติ
                </button>
                <button type="button" className="sign-panel__btn sign-panel__btn--ghost" disabled={busy} onClick={() => setRejectOpen(true)}>
                  ไม่อนุมัติ
                </button>
              </>
            )}
          </div>
        )}

        {state?.canCancelProposal && !actionsLocked && (
          <>
            {!compact && (
              <p className="sign-panel__hint sign-panel__hint--warning">
                {state.hasApproverSignatures
                  ? 'มีผู้อนุมัติลงนามแล้ว — ยกเลิกได้เฉพาะผู้บริหาร'
                  : 'ยังไม่มีผู้อนุมัติลงนาม — ครูเจ้าของเอกสารยกเลิกได้'}
              </p>
            )}
            <div className="sign-panel__dual-actions">
              <button
                type="button"
                className={`sign-panel__btn sign-panel__btn--cancel${busy ? ' is-dimmed' : ''}`}
                disabled={busy}
                onClick={handleCancelProposal}
              >
                ยกเลิกเสนอเซ็น
              </button>
            </div>
          </>
        )}

        {rejectOpen && (
          <div className="sign-panel__reject">
            <label className="form-label">เหตุผลไม่อนุมัติ</label>
            <textarea className="form-input" rows={2} value={rejectNote} onChange={e => setRejectNote(e.target.value)} />
            <div className="sign-panel__dual-actions" style={{ marginTop: 8 }}>
              <button type="button" className="sign-panel__btn sign-panel__btn--ghost" onClick={() => setRejectOpen(false)}>
                ยกเลิก
              </button>
              <button
                type="button"
                className={`sign-panel__btn sign-panel__btn--danger${busy ? ' is-dimmed' : ''}`}
                disabled={busy}
                onClick={() => handleSign('reject', rejectNote)}
              >
                ยืนยัน
              </button>
            </div>
          </div>
        )}
        <AlertModal />
      </section>

      {history.length > 0 && (
        <section className="sign-panel sign-panel--history" aria-label="ประวัติการเสนอเซ็น">
          <div className="sign-panel__head">
            <span>ประวัติการเสนอเซ็น</span>
          </div>
          <ul className="sign-panel__history-list">
            {history.map(item => (
              <li key={item.id} className={`sign-panel__history-item sign-panel__history-item--${item.status}`}>
                <div className="sign-panel__history-top">
                  <span className="sign-panel__history-cycle">ครั้งที่ {item.cycle}</span>
                  <span className={`sign-panel__history-status sign-panel__history-status--${item.status}`}>
                    {item.status_label}
                  </span>
                </div>
                <p className="sign-panel__history-line">
                  เสนอเมื่อ {formatThaiDateTime(item.submitted_at)}
                </p>
                {item.completed_at && (
                  <p className="sign-panel__history-line">
                    สรุปเมื่อ {formatThaiDateTime(item.completed_at)}
                  </p>
                )}
                {item.rejection_note && (
                  <p className="sign-panel__history-note">เหตุผล: {item.rejection_note}</p>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  )
}
