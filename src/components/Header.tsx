import { Dumbbell, History, Settings, ChevronLeft } from 'lucide-react';
import { useAppStore } from '../store/useAppStore';

interface HeaderProps {
  onHistory: () => void;
  onSettings: () => void;
}

export function Header({ onHistory, onSettings }: HeaderProps) {
  const { mode, setMode } = useAppStore();
  const canGoBack = mode !== 'home';

  return (
    <header className="header">
      <div className="header-left">
        {canGoBack ? (
          <button className="icon-btn" onClick={() => setMode('home')} aria-label="Back">
            <ChevronLeft size={22} />
          </button>
        ) : (
          <Dumbbell size={22} className="brand-icon" />
        )}
        <span className="brand-name">Lifting Lens</span>
      </div>
      <div className="header-right">
        <button className="icon-btn" onClick={onHistory} aria-label="History">
          <History size={20} />
        </button>
        <button className="icon-btn" onClick={onSettings} aria-label="Settings">
          <Settings size={20} />
        </button>
      </div>
    </header>
  );
}
