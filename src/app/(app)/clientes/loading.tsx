import { SkeletonPageHeader, SkeletonRows } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <>
      <SkeletonPageHeader />
      <div className="min-h-0 flex-1 overflow-hidden">
        <SkeletonRows rows={10} />
      </div>
    </>
  );
}
