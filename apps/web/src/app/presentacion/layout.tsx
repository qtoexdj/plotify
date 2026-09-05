/**
 * La presentación ocupa la ventana completa: sin el shell del dashboard y sin
 * scroll de página (cada diapositiva maneja el suyo).
 */
export default function LayoutPresentacion({ children }: { children: React.ReactNode }) {
  return <div className="isolate">{children}</div>
}
