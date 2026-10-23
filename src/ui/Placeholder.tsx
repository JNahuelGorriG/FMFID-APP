export function Placeholder({ title }: { title: string }) {
  return (
    <section>
      <h1>{title}</h1>
      <div className="card">
        <p className="muted">Esta sección se construye en una próxima etapa.</p>
      </div>
    </section>
  )
}
