export function DashboardSkeleton() {
  return (
    <div aria-label="Carregando dashboard" className="space-y-6" role="status">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        {Array.from({ length: 5 }).map((_, index) => (
          <div className="h-32 animate-pulse rounded-2xl bg-white shadow-sm" key={index} />
        ))}
      </div>
      <div className="h-80 animate-pulse rounded-2xl bg-white shadow-sm" />
      <div className="grid gap-5 xl:grid-cols-2">
        <div className="h-72 animate-pulse rounded-2xl bg-white shadow-sm" />
        <div className="h-72 animate-pulse rounded-2xl bg-white shadow-sm" />
      </div>
    </div>
  )
}
