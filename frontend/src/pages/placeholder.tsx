interface PlaceholderPageProps {
  title: string
}

export function PlaceholderPage({ title }: PlaceholderPageProps) {
  return (
    <div>
      <h1 className="font-serif text-[32px] font-bold mb-6">{title}</h1>
      <div className="p-6 rounded-lg border border-border bg-card">
        <p className="text-muted-foreground">
          This feature is coming soon.
        </p>
      </div>
    </div>
  )
}
