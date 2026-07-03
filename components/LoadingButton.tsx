'use client'

import type { ButtonHTMLAttributes, ReactNode } from 'react'

type LoadingButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  loading?: boolean
  loadingText?: ReactNode
}

export default function LoadingButton({
  loading = false,
  loadingText = 'กำลังบันทึก...',
  disabled,
  children,
  className = 'btn btn-primary',
  type = 'button',
  ...props
}: LoadingButtonProps) {
  return (
    <button
      {...props}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading}
      className={className}
    >
      {loading && <span className="btn-spinner" aria-hidden="true" />}
      <span>{loading ? loadingText : children}</span>
    </button>
  )
}
