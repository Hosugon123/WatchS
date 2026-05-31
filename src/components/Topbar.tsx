import { Search } from 'lucide-react';
import { MobileMenuButton } from '@/components/Sidebar';
import { useAuth } from '@/contexts/AuthContext';

type TopbarProps = {
  title: string;
  onMenuClick: () => void;
};

function avatarChar(name: string): string {
  const t = name.trim();
  return t ? ([...t][0] ?? '?') : '?';
}

export default function Topbar({ title, onMenuClick }: TopbarProps) {
  const { user, session } = useAuth();

  const displayName = user?.name ?? session?.loginId ?? '';
  const roleLabel = user?.role === 'admin' ? 'BOSS' : '員工';

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-4 border-b border-slate-200 bg-white/95 px-4 shadow-sm backdrop-blur md:px-6">
      <MobileMenuButton onClick={onMenuClick} />

      <h1 className="hidden text-base font-semibold text-slate-800 md:block">{title}</h1>

      <div className="mx-auto hidden max-w-md flex-1 md:block">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="search"
            placeholder="搜尋品牌、型號、客戶…"
            className="w-full rounded-full border border-slate-200 bg-slate-50 py-2 pl-10 pr-4 text-sm outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-100"
          />
        </div>
      </div>

      <div className="ml-auto flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 py-1 pl-1 pr-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-slate-700 to-slate-900 text-xs font-bold text-white">
          {avatarChar(displayName)}
        </div>
        <div className="hidden text-left sm:block">
          <p className="text-xs font-semibold text-slate-800">{displayName}</p>
          <p className="text-[10px] text-amber-700">{roleLabel}</p>
        </div>
      </div>
    </header>
  );
}
