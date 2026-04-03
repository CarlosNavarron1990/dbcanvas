import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Search, Database, Zap, Layers, Settings, RefreshCw } from 'lucide-react';
import { useStore } from '../store/useStore';

interface PaletteItem {
  id: string;
  label: string;
  description?: string;
  icon: React.ReactNode;
  action: () => void;
}

const CommandPalette: React.FC = () => {
  const {
    commandPaletteOpen, setCommandPaletteOpen,
    graphData, selectNode, setViewMode, runSync, fetchGraph, toggleTheme,
  } = useStore();
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // Build items list from nodes + actions
  const items = useMemo<PaletteItem[]>(() => {
    const nodeItems: PaletteItem[] = graphData.nodes.map(node => ({
      id: node.id,
      label: node.name,
      description: node.type,
      icon: node.type === 'TABLE' ? <Database size={14} /> :
            node.type === 'PROCEDURE' ? <Zap size={14} /> : <Layers size={14} />,
      action: () => { selectNode(node); setCommandPaletteOpen(false); },
    }));

    const actionItems: PaletteItem[] = [
      { id: 'action:sync', label: 'Sync Discovery', description: 'Full database sync', icon: <RefreshCw size={14} />, action: () => { runSync(); setCommandPaletteOpen(false); } },
      { id: 'action:refresh', label: 'Refresh Graph', description: 'Reload graph data', icon: <RefreshCw size={14} />, action: () => { fetchGraph(); setCommandPaletteOpen(false); } },
      { id: 'action:settings', label: 'Open Settings', description: 'IDE integration & theme', icon: <Settings size={14} />, action: () => { setViewMode('settings'); setCommandPaletteOpen(false); } },
      { id: 'action:theme', label: 'Toggle Theme', description: 'Switch dark/light', icon: <Settings size={14} />, action: () => { toggleTheme(); setCommandPaletteOpen(false); } },
      { id: 'action:graph', label: 'Show Graph', description: 'Back to graph view', icon: <Layers size={14} />, action: () => { selectNode(null); setCommandPaletteOpen(false); } },
    ];

    return [...actionItems, ...nodeItems];
  }, [graphData.nodes, selectNode, setCommandPaletteOpen, runSync, fetchGraph, setViewMode, toggleTheme]);

  const filtered = useMemo(() => {
    if (!query) return items.slice(0, 20);
    const q = query.toLowerCase();
    return items.filter(item =>
      item.label.toLowerCase().includes(q) ||
      item.description?.toLowerCase().includes(q)
    ).slice(0, 20);
  }, [items, query]);

  // Reset on open
  useEffect(() => {
    if (commandPaletteOpen) {
      setQuery('');
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [commandPaletteOpen]);

  // Keyboard shortcut
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setCommandPaletteOpen(!commandPaletteOpen);
      }
      if (e.key === 'Escape' && commandPaletteOpen) {
        setCommandPaletteOpen(false);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [commandPaletteOpen, setCommandPaletteOpen]);

  // Arrow keys
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(i => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(i => Math.max(i - 1, 0));
    } else if (e.key === 'Enter' && filtered[selectedIndex]) {
      filtered[selectedIndex].action();
    }
  };

  if (!commandPaletteOpen) return null;

  return (
    <div className="command-palette-overlay" onClick={() => setCommandPaletteOpen(false)}>
      <div className="command-palette" onClick={e => e.stopPropagation()}>
        <div className="palette-input-row">
          <Search size={16} />
          <input
            ref={inputRef}
            type="text"
            placeholder="Search objects, actions..."
            value={query}
            onChange={e => { setQuery(e.target.value); setSelectedIndex(0); }}
            onKeyDown={handleKeyDown}
          />
          <kbd>ESC</kbd>
        </div>
        <div className="palette-results">
          {filtered.map((item, i) => (
            <div
              key={item.id}
              className={`palette-item ${i === selectedIndex ? 'selected' : ''}`}
              onClick={item.action}
              onMouseEnter={() => setSelectedIndex(i)}
            >
              <div className="palette-item-icon">{item.icon}</div>
              <div className="palette-item-text">
                <span className="palette-item-label">{item.label}</span>
                {item.description && <span className="palette-item-desc">{item.description}</span>}
              </div>
            </div>
          ))}
          {filtered.length === 0 && (
            <div className="palette-empty">No results for "{query}"</div>
          )}
        </div>
      </div>
    </div>
  );
};

export default CommandPalette;
