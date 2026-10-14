import { Loader2 } from "lucide-react";

export default function Loading() {
  return (
    <div className="flex items-center justify-center py-20 text-slate-500" role="status">
      <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Memuat…
    </div>
  );
}
