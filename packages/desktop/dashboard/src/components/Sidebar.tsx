import React from 'react';
import { Database, Layers, Settings, User } from 'lucide-react';
import { useStore } from '../store/useStore';

const Sidebar: React.FC = () => {
  const { viewMode, setViewMode, selectNode, loadIdes, session } = useStore();

  const goGraph = () => {
    selectNode(null);
    setViewMode('graph');
  };

  const goSettings = () => {
    setViewMode('settings');
    loadIdes();
  };

  const initials = session?.user?.name
    ? session.user.name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)
    : null;

  return (
    <nav className="far-left-nav">
      <div
        className={`nav-icon ${viewMode === 'graph' || viewMode === 'detail' ? 'active' : ''}`}
        onClick={goGraph}
        title="Database Explorer"
      >
        <Database size={20} />
      </div>
      <div className="nav-icon" onClick={goGraph} title="Graph View">
        <Layers size={20} />
      </div>
      <div className="spacer" />
      {session?.user && (
        <div className="nav-user-wrapper" onClick={goSettings} title={session.user.name || session.user.email}>
          <div className="nav-user-avatar">
            {initials || <User size={14} />}
          </div>
          <span className="nav-user-name">
            {(session.user.name || '').split(' ')[0]}
          </span>
        </div>
      )}
      <div
        className={`nav-icon ${viewMode === 'settings' ? 'active' : ''}`}
        onClick={goSettings}
        title="Settings"
      >
        <Settings size={20} />
      </div>
    </nav>
  );
};

export default Sidebar;
