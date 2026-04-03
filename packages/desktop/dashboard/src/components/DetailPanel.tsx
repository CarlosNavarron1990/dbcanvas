import React, { useRef } from 'react';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import ReactMarkdown from 'react-markdown';
import { useStore } from '../store/useStore';
import { Loader2 } from 'lucide-react';

const DetailPanel: React.FC = () => {
  const {
    selectedNode, activeTab, setActiveTab, status,
    procedureCode, procedureMd, tableSchema, shadowData,
    captureData, loading,
  } = useStore();
  const captureRef = useRef<HTMLInputElement>(null);

  if (!selectedNode) return null;

  const isTable = selectedNode.type === 'TABLE' || selectedNode.type === 'VIEW';

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
      </div>
    </div>
  );
};

export default DetailPanel;
