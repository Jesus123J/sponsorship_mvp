'use client'

interface ErrorAlertProps {
  message: string
  onRetry?: () => void
}

export default function ErrorAlert({ message, onRetry }: ErrorAlertProps) {
  return (
    <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-center">
      <div className="text-3xl mb-3">⚠️</div>
      <p className="text-sm font-medium text-red-700 mb-1">Error al cargar datos</p>
      <p className="text-xs text-red-500 mb-4">{message}</p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="px-4 py-2 bg-red-600 text-white text-sm rounded-xl hover:bg-red-700 transition-colors"
        >
          Reintentar
        </button>
      )}
    </div>
  )
}
