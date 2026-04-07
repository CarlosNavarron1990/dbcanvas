import React from 'react';
import { Database, Zap, RefreshCw, Search, ChevronRight, ChevronDown, Folder, Layers, Layout, FolderOpen } from 'lucide-react';
import { useStore } from '../store/useStore';
import type { GraphNode } from '../store/useStore';
import { getProjectPath } from '../api';

const TreeExplorer: React.FC = () => {
  const {
    graphData, loading, selectedNode, searchTerm, projects, status,
    expandedFolders, fetchGraph, runSync, selectNode,
    setSearchTerm, toggleFolder, setViewMode,
  } = useStore();

  const handleProjectChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const url = new URL(window.location.href);
    url.searchParams.set('projectPath', e.target.value);
    window.location.href = url.toString();
  };

  const filteredNodes = (type: string) => graphData.nodes.filter(n =>
    n.type === type && n.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const spCount = filteredNodes('PROCEDURE').length;
  const tableCount = filteredNodes('TABLE').length;
  const viewCount = filteredNodes('VIEW').length;

  const renderFolder = (name: string, items: GraphNode[], icon: React.ReactNode) => {
    const isExpanded = expandedFolders.includes(name);
    return (
      <div className="folder-container" key={name}>
        <div className="folder-header" onClick={() => toggleFolder(name)}>
          {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          <Folder size={14} style={{ color: '#6366f1' }} />
          <span>{name} ({items.length})</span>
        </div>
        {isExpanded && (
          <div className="folder-items">
            {items.map(node => (
              <div key={node.id}
                className={`tree-item ${selectedNode?.id === node.id ? 'active' : ''}`}
                onClick={() => selectNode(node)}>
                {icon}
                <span title={node.name}>{node.name}</span>
              </div>
            ))}
            {items.length === 0 && <div className="empty-msg">No items found</div>}
          </div>
        )}
      </div>
    );
  };

  const currentProject = getProjectPath();
  const projectLabel = currentProject
    ? currentProject.split(/[/\\]/).pop()
    : status?.projectRoot?.split(/[/\\]/).pop() || 'No Project';

  return (
    <aside className="obsidian-explorer">
      {/* Project Selector - Always visible at top */}
      <div className="project-header">
        <div className="project-current" title={currentProject || status?.projectRoot || ''}>
          <FolderOpen size={16} style={{ color: '#6366f1', flexShrink: 0 }} />
          <span className="project-name">{projectLabel}</span>
          {status && <div className="status-dot online" />}
        </div>

        {projects.length > 1 && (
          <select className="project-dropdown" value={currentProject} onChange={handleProjectChange}>
            <option value="">Switch Project...</option>
            {projects.map(p => (
              <option key={p.path} value={p.path}>{p.name}</option>
            ))}
          </select>
        )}
      </div>

      {/* Search + Actions */}
      <div className="explorer-controls">
        <div className="search-box">
          <Search size={14} />
          <input type="text" placeholder="Search Objects..." value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)} />
        </div>
        <div className="icon-btns">
          <div title="Refresh Graph" onClick={() => fetchGraph()} className="icon-btn">
            <RefreshCw size={14} className={loading ? 'spin' : ''} />
          </div>
          <div title="Force Full Sync" onClick={runSync} className="icon-btn">
            <Zap size={14} className={loading ? 'pulse' : ''} style={{ color: '#fbbf24' }} />
          </div>
        </div>
      </div>

      {/* Stats bar */}
      <div className="explorer-stats">
        <span title="Stored Procedures"><Zap size={10} /> {spCount}</span>
        <span title="Tables"><Database size={10} /> {tableCount}</span>
        <span title="Views"><Layers size={10} /> {viewCount}</span>
      </div>

      {/* Tree */}
      <div className="tree-root">
        {renderFolder("Stored Procedures", filteredNodes("PROCEDURE"), <Zap size={12} />)}
        {renderFolder("Tables", filteredNodes("TABLE"), <Database size={12} />)}
        {renderFolder("Views", filteredNodes("VIEW"), <Layers size={12} />)}

        <div className="folder-container">
          <div className="folder-header no-chevron" onClick={() => { selectNode(null); setViewMode('graph'); }}>
            <Layout size={14} style={{ color: '#10b981' }} />
            <span>Graph Overview</span>
          </div>
        </div>
      </div>
    </aside>
  );
};

export default TreeExplorer;
