import './globals.css'

export const metadata = {
  title: 'Sponsorship MVP — Liga 1 Peru',
  description: 'Sistema de Medicion de Sponsorship Deportivo',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body className="bg-gray-50 min-h-screen">
        {children}
      </body>
    </html>
  )
}
