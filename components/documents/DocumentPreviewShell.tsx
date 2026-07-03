'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import LoadingButton from '@/components/LoadingButton'
import { useAppAlert } from '@/lib/use-app-alert'
import {
  fetchClassDocApprovalStatus,
  fetchPp5SubjectApprovalStatus,
  proposeClassDocument,
  proposePp5Subject,
  putClassDocumentSignature,
  putPp5SubjectSignature,
  signClassDocument,
  signPp5Subject,
} from '@/app/sign/actions'
import type { ClassDocType } from '@/lib/approvals/types'
import { scopeDocumentPreviewPath, resolveDocumentPreviewUrl } from '@/lib/document-preview-popup'
import {
  buildSignDocumentPreviewUrl,
  buildSignDocumentPrintRequest,
  parseSignDocumentPreviewTarget,
  type SignDocumentPreviewTarget,
} from '@/lib/sign-document-preview'
import { buildPreviewShellStatusUi } from '@/lib/document-preview-status-ui'
import type { WorkflowStepUiState } from '@/lib/approvals/pp5-subject'

type SignStatus = NonNullable<Awaited<ReturnType<typeof fetchPp5SubjectApprovalStatus>>>

function classDocTypeFromKind(kind: SignDocumentPreviewTarget['kind']): ClassDocType | null {
  if (kind === 'pp5-class') return 'pp5_class'
  if (kind === 'pp6') return 'pp6'
  return null
}

function stepperNodeSymbol(state: WorkflowStepUiState) {
  if (state === 'done') return '✓'
  if (state === 'skipped') return '—'
  if (state === 'current') return '●'
  return '○'
}

export default function DocumentPreviewShell() {
  const searchParams = useSearchParams()
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const { notify, AlertModal } = useAppAlert('ดำเนินการสำเร็จ', 'ดำเนินการไม่สำเร็จ')

  const title = searchParams.get('title') || 'พรีวิวเอกสาร'
  const readonly = searchParams.get('readonly') === '1'
  const srcOverride = searchParams.get('src')

  const target = useMemo(() => parseSignDocumentPreviewTarget(searchParams), [searchParams])

  const embedPath = useMemo(() => {
    if (srcOverride) return srcOverride
    if (!target) return null
    return buildSignDocumentPreviewUrl(target, 'embed')
  }, [srcOverride, target])

  const [embedUrl, setEmbedUrl] = useState<string | null>(null)

  const [iframeReady, setIframeReady] = useState(false)
  const [signBusy, setSignBusy] = useState(false)
  const [pdfBusy, setPdfBusy] = useState(false)
  const [status, setStatus] = useState<SignStatus | null>(null)
  const [statusLoading, setStatusLoading] = useState(!readonly && Boolean(target))
  const [showReject, setShowReject] = useState(false)
  const [rejectNote, setRejectNote] = useState('')

  const loadStatus = useCallback(async () => {
    if (!target || readonly) {
      setStatusLoading(false)
      return
    }
    setStatusLoading(true)
    try {
      if (target.kind === 'pp5-subject' && target.classSubjectId) {
        setStatus(await fetchPp5SubjectApprovalStatus(target.classSubjectId, target.signTerm))
        return
      }
      const docType = classDocTypeFromKind(target.kind)
      if (docType) {
        setStatus(await fetchClassDocApprovalStatus(docType, target.classroomId, target.signTerm))
      }
    } finally {
      setStatusLoading(false)
    }
  }, [readonly, target])

  useEffect(() => { void loadStatus() }, [loadStatus])

  useEffect(() => {
    document.title = title
  }, [title])

  useEffect(() => {
    if (!embedPath) {
      setEmbedUrl(null)
      return
    }
    setEmbedUrl(resolveDocumentPreviewUrl(embedPath))
    setIframeReady(false)
  }, [embedPath])

  function refreshIframe() {
    if (!iframeRef.current || !embedUrl) return
    const url = new URL(embedUrl)
    url.searchParams.set('_', String(Date.now()))
    iframeRef.current.src = url.href
    setIframeReady(false)
  }

  const statusUi = useMemo(
    () => buildPreviewShellStatusUi(status, {
      readonly,
      loading: statusLoading,
    }),
    [status, readonly, statusLoading],
  )

  async function handleSign(decision?: 'approve' | 'reject') {
    if (!target || !status) return
    setSignBusy(true)
    let result: { error?: string; success?: boolean } = { error: 'ไม่สามารถดำเนินการได้' }

    try {
      if (status.canPutSignature) {
        if (target.kind === 'pp5-subject' && target.classSubjectId) {
          result = await putPp5SubjectSignature(target.classSubjectId, target.signTerm)
        } else {
          const docType = classDocTypeFromKind(target.kind)
          if (docType) result = await putClassDocumentSignature(docType, target.classroomId, target.signTerm)
        }
      } else if (status.canPropose) {
        if (target.kind === 'pp5-subject' && target.classSubjectId) {
          result = await proposePp5Subject(target.classSubjectId, target.signTerm)
        } else {
          const docType = classDocTypeFromKind(target.kind)
          if (docType) result = await proposeClassDocument(docType, target.classroomId, target.signTerm)
        }
      } else if (status.canSign) {
        if (target.kind === 'pp5-subject' && target.classSubjectId) {
          result = await signPp5Subject(target.classSubjectId, target.signTerm, decision, rejectNote || undefined)
        } else {
          const docType = classDocTypeFromKind(target.kind)
          if (docType) result = await signClassDocument(docType, target.classroomId, target.signTerm, decision, rejectNote || undefined)
        }
      }
    } finally {
      setSignBusy(false)
    }

    if (result.error) notify('error', result.error)
    else {
      notify('success', 'ดำเนินการเรียบร้อย')
      setShowReject(false)
      setRejectNote('')
      await loadStatus()
      refreshIframe()
      window.opener?.postMessage({ type: 'pp5-document-preview-updated' }, window.location.origin)
    }
  }

  async function handleSavePdf() {
    if (pdfBusy) return
    setPdfBusy(true)
    try {
      let printReq: { path: string; query: string; landscape?: boolean }
      if (target) {
        printReq = buildSignDocumentPrintRequest(target)
      } else if (srcOverride) {
        const printPath = srcOverride.replace('embed=1', 'print=1')
        const [path, query = ''] = printPath.split('?')
        printReq = { path, query, landscape: printPath.includes('classroom-admin') }
      } else {
        return
      }
      const res = await fetch('/api/reports/pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(printReq),
      })
      if (!res.ok) {
        let message = 'สร้าง PDF ไม่สำเร็จ'
        try {
          const body = await res.json()
          if (body?.error) message = body.error
        } catch {}
        throw new Error(message)
      }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `${title.replace(/[\\/:*?"<>|]/g, '-')}.pdf`
      document.body.appendChild(link)
      link.click()
      link.remove()
      URL.revokeObjectURL(url)
    } catch (err) {
      notify('error', err instanceof Error ? err.message : 'สร้าง PDF ไม่สำเร็จ')
    } finally {
      setPdfBusy(false)
    }
  }

  function handlePrint() {
    if (!target) return
    const printPath = scopeDocumentPreviewPath(buildSignDocumentPreviewUrl(target, 'print'))
    window.open(resolveDocumentPreviewUrl(printPath), '_blank')
  }

  function handlePrintFromSrc() {
    if (!srcOverride) return
    const printPath = srcOverride.replace('embed=1', 'print=1')
    window.open(resolveDocumentPreviewUrl(printPath), '_blank')
  }

  if (!embedPath) {
    return (
      <div className="document-preview-shell">
        <div className="document-preview-shell__loading">ไม่พบเอกสารสำหรับพรีวิว</div>
      </div>
    )
  }

  if (!embedUrl) {
    return (
      <div className="document-preview-shell">
        <div className="document-preview-shell__loading">กำลังโหลด...</div>
      </div>
    )
  }

  const directorReject = status?.canSign && status.isDirectorStep

  return (
    <div className="document-preview-shell">
      <header className={`doc-preview-chrome doc-preview-chrome--${statusUi.tone}`}>
        <div className="doc-preview-chrome__row">
          <div className="doc-preview-chrome__identity">
            <span className="doc-preview-chrome__eyebrow">พรีวิวเอกสาร</span>
            <h1 className="doc-preview-chrome__title">{title}</h1>
          </div>

          <div className="doc-preview-chrome__actions">
            {statusUi.canShowSign && statusUi.signLabel ? (
              <div className="doc-preview-chrome__sign-group">
                <LoadingButton
                  className="doc-preview-chrome__btn doc-preview-chrome__btn--sign"
                  loading={signBusy}
                  onClick={() => {
                    if (directorReject) void handleSign('approve')
                    else void handleSign()
                  }}
                >
                  {statusUi.signLabel}
                </LoadingButton>
                {directorReject && (
                  <button
                    type="button"
                    className="doc-preview-chrome__btn doc-preview-chrome__btn--ghost"
                    onClick={() => setShowReject(v => !v)}
                  >
                    ไม่อนุมัติ
                  </button>
                )}
              </div>
            ) : !readonly && status?.status === 'in_review' ? (
              <div className="doc-preview-chrome__locked" title={statusUi.message}>
                <span className="doc-preview-chrome__locked-icon" aria-hidden>🔒</span>
                <span>ยังไม่ถึงลำดับ</span>
              </div>
            ) : null}

            <div className="doc-preview-chrome__tool-group" role="group" aria-label="เครื่องมือเอกสาร">
              {(target || srcOverride) && (
                <LoadingButton
                  className="doc-preview-chrome__btn doc-preview-chrome__btn--tool"
                  loading={pdfBusy}
                  disabled={!iframeReady}
                  onClick={() => void handleSavePdf()}
                >
                  บันทึก PDF
                </LoadingButton>
              )}
              <button
                type="button"
                className="doc-preview-chrome__btn doc-preview-chrome__btn--tool"
                disabled={!iframeReady}
                onClick={() => (target ? handlePrint() : handlePrintFromSrc())}
              >
                พิมพ์
              </button>
            </div>
          </div>
        </div>

        <div className="doc-preview-chrome__status-panel">
          <div className="doc-preview-chrome__status-copy">
            <span className={`doc-preview-chrome__status-dot doc-preview-chrome__status-dot--${statusUi.tone}`} aria-hidden />
            <div>
              <p className="doc-preview-chrome__status-label">{statusUi.badge}</p>
              <p className="doc-preview-chrome__status-message">{statusUi.message}</p>
            </div>
          </div>

          {statusUi.workflowStepStates.length > 0 && (
            <ol className="doc-preview-stepper" aria-label="ลำดับการลงนาม">
              {statusUi.workflowStepStates.map(step => (
                <li
                  key={step.label}
                  className={`doc-preview-stepper__step doc-preview-stepper__step--${step.state}`}
                >
                  <span className="doc-preview-stepper__node" aria-hidden>
                    {stepperNodeSymbol(step.state)}
                  </span>
                  <span className="doc-preview-stepper__label">
                    {step.label}
                    {step.state === 'skipped' && <span className="doc-preview-stepper__skip-note"> (ข้าม)</span>}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </div>
      </header>

      {showReject && directorReject && (
        <div className="doc-preview-chrome__reject">
          <textarea
            className="form-input"
            rows={2}
            value={rejectNote}
            onChange={e => setRejectNote(e.target.value)}
            placeholder="เหตุผล (ถ้ามี)"
          />
          <LoadingButton
            className="btn btn-danger btn-sm"
            loading={signBusy}
            onClick={() => void handleSign('reject')}
          >
            ยืนยันไม่อนุมัติ
          </LoadingButton>
        </div>
      )}

      <iframe
        ref={iframeRef}
        title={title}
        src={embedUrl}
        className="document-preview-shell__frame"
        onLoad={() => setIframeReady(true)}
      />
      <AlertModal />
    </div>
  )
}
