import React from 'react';
import { Database, Layers, Settings } from 'lucide-react';
import { useStore } from '../store/useStore';

const Sidebar: React.FC = () => {
  const { viewMode, setViewMode, selectNode, loadIdes } = useStore();

  const goGraph = () => {
    selectNode(null);
    setViewMode('graph');
  };

  const goSettings = () => {
    // Set viewMode first, then clear node without triggering viewMode override
    setViewMode('settings');
    loadIdes();
  };

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
