'use client'

export default function ExportPDF({ targetId, filename }: { targetId: string; filename: string }) {
  const exportar = async () => {
    const html2canvas = (await import('html2canvas')).default
    const { jsPDF } = await import('jspdf')

    const element = document.getElementById(targetId)
    if (!element) return

    const canvas = await html2canvas(element, { scale: 2, useCORS: true })
    const imgData = canvas.toDataURL('image/png')

    const pdf = new jsPDF('p', 'mm', 'a4')
    const pageWidth = pdf.internal.pageSize.getWidth()
    const imgWidth = pageWidth - 20
    const imgHeight = (canvas.height * imgWidth) / canvas.width

    pdf.setFontSize(18)
    pdf.text('Sponsorship MVP — Liga 1 Peru', 10, 15)
    pdf.setFontSize(10)
    pdf.setTextColor(128)
    pdf.text(`Reporte generado: ${new Date().toLocaleDateString('es-PE')}`, 10, 22)
    pdf.setTextColor(0)

    pdf.addImage(imgData, 'PNG', 10, 30, imgWidth, imgHeight)
    pdf.save(`${filename}.pdf`)
  }

  return (
    <button onClick={exportar}
      className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm font-medium hover:bg-indigo-700 transition-colors shadow-lg shadow-indigo-500/20">
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" />
      </svg>
      Exportar PDF
    </button>
  )
}
