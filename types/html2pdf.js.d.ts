declare module 'html2pdf.js' {
  type Html2PdfOptions = {
    filename?: string
    margin?: number | number[]
    image?: { type?: string; quality?: number }
    html2canvas?: Record<string, unknown>
    jsPDF?: Record<string, unknown>
    pagebreak?: Record<string, unknown>
  }

  type Html2PdfWorker = {
    set(options: Html2PdfOptions): Html2PdfWorker
    from(element: HTMLElement): Html2PdfWorker
    save(): Promise<void>
  }

  const html2pdf: () => Html2PdfWorker
  export default html2pdf
}
