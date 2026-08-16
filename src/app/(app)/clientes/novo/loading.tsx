import { Skeleton, SkeletonPageHeader } from "@/components/ui/skeleton";

export default function NovoClienteLoading() {
  return (
    <>
      <SkeletonPageHeader />
      <div className="min-h-0 flex-1 overflow-hidden">
        <div className="mx-auto max-w-2xl space-y-5 p-4 sm:p-6">
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="space-y-1.5">
              <Skeleton className="h-2.5 w-24" />
              <Skeleton className="h-9 w-full" />
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
