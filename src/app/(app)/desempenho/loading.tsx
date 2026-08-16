import { Skeleton, SkeletonPageHeader } from "@/components/ui/skeleton";

export default function DesempenhoLoading() {
  return (
    <>
      <SkeletonPageHeader />

      <div className="min-h-0 flex-1 overflow-hidden">
        <div className="mx-auto max-w-6xl space-y-6 p-4 sm:p-6">
          <Skeleton className="h-8 w-64 rounded-md" />

          <section className="space-y-3">
            <Skeleton className="h-3 w-28" />
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
              {Array.from({ length: 6 }, (_, i) => (
                <Skeleton key={i} className="h-[76px]" />
              ))}
            </div>
          </section>

          <section className="space-y-3">
            <Skeleton className="h-3 w-36" />
            {/* O gráfico de volume: mesma altura da versão real. */}
            <Skeleton className="h-[200px]" />
          </section>
        </div>
      </div>
    </>
  );
}
