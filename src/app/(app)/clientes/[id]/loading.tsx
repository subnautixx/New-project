import { Skeleton, SkeletonPageHeader } from "@/components/ui/skeleton";

export default function ClienteLoading() {
  return (
    <>
      <SkeletonPageHeader />
      <div className="min-h-0 flex-1 overflow-hidden">
        <div className="mx-auto max-w-4xl space-y-5 p-4 sm:p-6">
          <div className="flex items-center gap-3">
            <Skeleton className="h-12 w-12 shrink-0 rounded-full" />
            <div className="space-y-1.5">
              <Skeleton className="h-4 w-44" />
              <Skeleton className="h-3 w-32" />
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {Array.from({ length: 6 }, (_, i) => (
              <Skeleton key={i} className="h-14" />
            ))}
          </div>
          <Skeleton className="h-40" />
        </div>
      </div>
    </>
  );
}
