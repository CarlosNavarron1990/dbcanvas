import { File, Layers, Settings, X, Search, Maximize } from 'lucide-react';
import { useStore } from '../store/useStore';
import ExportMenu from './ExportMenu';

const Toolbar: React.FC = () => {
  const { viewMode, selectedNode, selectNode, setViewMode, setCommandPaletteOpen } = useStore();

  const backToGraph = () => { selectNode(null); setViewMode('graph'); };

  return (
    <header className="stage-header draggable">
      <div className="active-tab-label">
        {viewMode === 'settings' ? <Settings size={14} /> :
         selectedNode ? <File size={14} /> : <Layers size={14} />}
        <span>
          {viewMode === 'settings' ? 'SETTINGS' :
           selectedNode ? selectedNode.name.toUpperCase() : 'DATABASE MAP'}
        </span>
      </div>

      <div className="spacer" />

      <div className="global-actions">
        <button className="btn-cmd-k" onClick={() => {
          const ref = (window as any).__dbcanvas_graph_ref?.current;
          if (ref) ref.zoomToFit(400, 50);
        }} title="Fit Graph to View">
          <Maximize size={12} />
          <span>Fit View</span>
        </button>

        <ExportMenu />

        <button className="btn-cmd-k" onClick={() => setCommandPaletteOpen(true)} title="Command Palette (Cmd+K)">
          <Search size={12} />
          <span>Search</span>
          <kbd className="hide-mobile">⌘K</kbd>
        </button>
      </div>

      {(selectedNode || viewMode === 'settings') && (
        <button className="btn-close-detail" onClick={backToGraph}>
          <X size={16} />
          <span>BACK</span>
        </button>
      )}
    </header>
  );
};

export default Toolbar;
