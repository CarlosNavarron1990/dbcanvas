import React, { useMemo, useRef } from 'react';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import ReactMarkdown from 'react-markdown';
import { useStore, type GraphNode } from '../store/useStore';
import { Loader2, FileCode, Table as TableIcon, Eye, ArrowRight, ArrowLeft, Link2 } from 'lucide-react';

const DetailPanel: React.FC = () => {
  const {
    selectedNode, activeTab, setActiveTab, status,
    procedureCode, procedureMd, tableSchema, shadowData,
    captureData, loading, graphData, selectNode,
  } = useStore();
  const captureRef = useRef<HTMLInputElement>(null);

  // Compute references (incoming/outgoing) for the selected node from the existing graph data.
  // Links may have source/target as either string ids or node objects (mutated by ForceGraph2D).
  const references = useMemo(() => {
    const empty = { incoming: [] as GraphNode[], outgoing: [] as GraphNode[] };
    if (!selectedNode) return empty;
    const nodeMap = new Map(graphData.nodes.map(n => [n.id, n]));
    const incoming = new Map<string, GraphNode>();
    const outgoing = new Map<string, GraphNode>();
    for (const link of graphData.links as any[]) {
      const src = typeof link.source === 'object' ? link.source.id : link.source;
      const tgt = typeof link.target === 'object' ? link.target.id : link.target;
      if (tgt === selectedNode.id) {
        const n = nodeMap.get(src);
        if (n && n.id !== selectedNode.id) incoming.set(n.id, n);
      }
      if (src === selectedNode.id) {
        const n = nodeMap.get(tgt);
        if (n && n.id !== selectedNode.id) outgoing.set(n.id, n);
      }
    }
    return {
      incoming: Array.from(incoming.values()).sort((a, b) => a.name.localeCompare(b.name)),
      outgoing: Array.from(outgoing.values()).sort((a, b) => a.name.localeCompare(b.name)),
    };
  }, [selectedNode, graphData]);

  if (!selectedNode) return null;

  const isTable = selectedNode.type === 'TABLE' || selectedNode.type === 'VIEW';

  const groupByType = (nodes: GraphNode[]) => ({
    PROCEDURE: nodes.filter(n => n.type === 'PROCEDURE'),
    VIEW: nodes.filter(n => n.type === 'VIEW'),
    TABLE: nodes.filter(n => n.type === 'TABLE'),
  });

  const iconFor = (t: GraphNode['type']) =>
    t === 'PROCEDURE' ? <FileCode size={14} /> : t === 'VIEW' ? <Eye size={14} /> : <TableIcon size={14} />;

  const renderGroup = (label: string, nodes: GraphNode[]) => {
    if (nodes.length === 0) return null;
    return (
      <div className="ref-group" key={label}>
        <div className="ref-group-header">{label} <span className="ref-count">{nodes.length}</span></div>
        <ul className="ref-list">
          {nodes.map(n => (
            <li key={n.id}>
              <button className="ref-item" onClick={() => selectNode(n)}>
                {iconFor(n.type)}
                <span className="ref-name">{n.name}</span>
                <span className="ref-type">{n.type}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    );
  };

  return (
    <div className="detail-central-view slide-up">
      <div className="detail-header-tabs">
        <button onClick={() => setActiveTab('info')} className={`tab ${activeTab === 'info' ? 'active' : ''}`}>
          PROPERTIES
        </button>
        {selectedNode.type === 'PROCEDURE' && (
          <button onClick={() => setActiveTab('code')} className={`tab ${activeTab === 'code' ? 'active' : ''}`}>
            CODE
          </button>
        )}
        {isTable && (
          <button onClick={() => setActiveTab('code')} className={`tab ${activeTab === 'code' ? 'active' : ''}`}>
            SCHEMA
          </button>
        )}
        {isTable && (
          <button onClick={() => setActiveTab('data')} className={`tab ${activeTab === 'data' ? 'active' : ''}`}>
            DATA
          </button>
        )}
        <button onClick={() => setActiveTab('references')} className={`tab ${activeTab === 'references' ? 'active' : ''}`}>
          REFERENCES
        </button>
      </div>

      <div className="detail-body">
        {/* PROPERTIES TAB */}
        {activeTab === 'info' && (
          <div className="card-obsidian">
            <h1>{selectedNode.name}</h1>
            <span className="badge-type">{selectedNode.type}</span>
            {status && <p className="description">Discovered in <code>{status.projectRoot}</code></p>}
            <div className="meta-box">
              <label>IDENTIFIER</label>
              <code>{selectedNode.id}</code>
            </div>
          </div>
        )}

        {/* CODE / SCHEMA TAB */}
        {activeTab === 'code' && (
          <div className="detail-visualizer">
            {selectedNode.type === 'PROCEDURE' ? (
              procedureMd ? (
                <div className="obsidian-md-render"><ReactMarkdown>{procedureMd}</ReactMarkdown></div>
              ) : procedureCode ? (
                <SyntaxHighlighter language="sql" style={vscDarkPlus}
                  customStyle={{ background: 'transparent', padding: '20px', fontSize: '12px' }}>
                  {procedureCode}
                </SyntaxHighlighter>
              ) : (
                <div className="empty-state"><Loader2 size={20} className="spin" /> Loading procedure code...</div>
              )
            ) : (
              /* TABLE / VIEW SCHEMA */
              tableSchema.length > 0 ? (
                <div className="schema-table-container">
                  <table>
                    <thead>
                      <tr>
                        <th>#</th>
                        <th>COLUMN</th>
                        <th>TYPE</th>
                        <th>NULLABLE</th>
                      </tr>
                    </thead>
                    <tbody>
                      {tableSchema.map((col: any, i: number) => (
                        <tr key={i}>
                          <td className="row-num">{i + 1}</td>
                          <td><strong>{col.name}</strong></td>
                          <td><span className="type-pill">{col.type}</span></td>
                          <td>{col.nullable === 'YES' || col.nullable === 'yes' ? 'Yes' : 'No'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="empty-state"><Loader2 size={20} className="spin" /> Loading schema...</div>
              )
            )}
          </div>
        )}

        {/* DATA TAB */}
        {activeTab === 'data' && isTable && (
          <div className="detail-data-view">
            <div className="snapshot-controls">
              <input ref={captureRef} type="text" placeholder='Filter: {"column": "value"}' className="obsidian-input" />
              <button disabled={loading} onClick={() => {
                const val = captureRef.current?.value || '';
                let p: Record<string, unknown> = {};
                try { if (val) p = JSON.parse(val); } catch { alert('Invalid JSON'); return; }
                captureData(selectedNode.name, p);
              }} className="btn-primary-capture">
                {loading ? 'CAPTURING...' : 'CAPTURE DATA'}
              </button>
            </div>
            <div className="modern-table">
              {shadowData.length > 0 ? (
                <div style={{ overflowX: 'auto' }}>
                  <table>
                    <thead>
                      <tr>{Object.keys(shadowData[0]).map(k => <th key={k}>{k}</th>)}</tr>
                    </thead>
                    <tbody>
                      {shadowData.map((r: any, i: number) => (
                        <tr key={i}>{Object.values(r).map((v: any, j: number) => <td key={j}>{String(v ?? '')}</td>)}</tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : <div className="empty-state">No local snapshot. Click CAPTURE DATA to pull sample rows from the database.</div>}
            </div>
          </div>
        )}

        {/* REFERENCES TAB */}
        {activeTab === 'references' && (() => {
          const incomingGroups = groupByType(references.incoming);
          const outgoingGroups = groupByType(references.outgoing);
          const hasIncoming = references.incoming.length > 0;
          const hasOutgoing = references.outgoing.length > 0;
          const incomingLabel = isTable ? 'USED BY' : 'REFERENCED BY';
          const outgoingLabel = isTable ? 'REFERENCES' : 'USES';
          return (
            <div className="card-obsidian">
              <h1><Link2 size={22} style={{ verticalAlign: '-3px', marginRight: 8 }} />References</h1>
              <p className="description">
                Objects related to <code>{selectedNode.name}</code> derived from the discovery graph.
              </p>

              <div className="ref-section">
                <h3 className="ref-section-title"><ArrowLeft size={14} /> {incomingLabel}</h3>
                {hasIncoming ? (
                  <>
                    {renderGroup('Stored Procedures', incomingGroups.PROCEDURE)}
                    {renderGroup('Views', incomingGroups.VIEW)}
                    {renderGroup('Tables', incomingGroups.TABLE)}
                  </>
                ) : (
                  <div className="empty-state">No incoming references found.</div>
                )}
              </div>

              <div className="ref-section">
                <h3 className="ref-section-title"><ArrowRight size={14} /> {outgoingLabel}</h3>
                {hasOutgoing ? (
                  <>
                    {renderGroup('Tables', outgoingGroups.TABLE)}
                    {renderGroup('Views', outgoingGroups.VIEW)}
                    {renderGroup('Stored Procedures', outgoingGroups.PROCEDURE)}
                  </>
                ) : (
                  <div className="empty-state">No outgoing references found.</div>
                )}
              </div>
            </div>
          );
        })()}
      </div>
    </div>
  );
};

export default DetailPanel;
