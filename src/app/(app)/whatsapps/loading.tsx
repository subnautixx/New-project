import { Skeleton, SkeletonPageHeader } from "@/components/ui/skeleton";

export default function WhatsappsLoading() {
  return (
    <>
      <SkeletonPageHeader />
      <div className="min-h-0 flex-1 overflow-hidden">
        <div className="mx-auto max-w-4xl space-y-4 p-4 sm:p-6">
          <div className="flex justify-end gap-2">
            <Skeleton className="h-8 w-32" />
            <Skeleton className="h-8 w-36" />
          </div>
          {Array.from({ length: 2 }, (_, i) => (
            <Skeleton key={i} className="h-[116px]" />
          ))}
        </div>
      </div>
    </>
  );
}
