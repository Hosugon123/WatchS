import { ShieldOff } from 'lucide-react';

export default function AccessDenied({ message = '您沒有權限檢視此功能。' }: { message?: string }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-slate-200 bg-white px-6 py-16 text-center shadow-sm">
      <ShieldOff className="mb-3 h-10 w-10 text-slate-300" />
      <p className="text-sm text-slate-600">{message}</p>
    </div>
  );
}
