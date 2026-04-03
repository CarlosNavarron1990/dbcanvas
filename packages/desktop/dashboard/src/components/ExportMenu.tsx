import React, { useState } from 'react';
import { Download, Image, FileText, Table } from 'lucide-react';
import { useStore } from '../store/useStore';

const ExportMenu: React.FC = () => {
  const { graphData, selectedNode, tableSchema, shadowData } = useStore();
  const [open, setOpen] = useState(false);

  const exportGraphPNG = () => {
    const ref = (window as any).__dbcanvas_graph_ref?.current;
    if (!ref) return;

    // ForceGraph2D exposes the canvas element
    const canvas = ref.canvas?.() || document.querySelector('.canvas-wrapper canvas');
    if (!canvas) return;

    const link = document.createElement('a');
    link.download = 'dbcanvas-graph.png';
    link.href = canvas.toDataURL('image/png');
    link.click();
    setOpen(false);
  };

  const exportSchemaDDL = () => {
    if (!selectedNode || tableSchema.length === 0) return;

    const lines = [`-- DDL for ${selectedNode.name}`, `CREATE TABLE [${selectedNode.name}] (`];
    tableSchema.forEach((col, i) => {
      const nullable = col.nullable === 'YES' ? 'NULL' : 'NOT NULL';
      const comma = i < tableSchema.length - 1 ? ',' : '';
      lines.push(`  [${col.name}] ${col.type.toUpperCase()} ${nullable}${comma}`);
    });
    lines.push(');');

    downloadFile(`${selectedNode.name}.sql`, lines.join('\n'), 'text/sql');
    setOpen(false);
  };

  const exportDataCSV = () => {
    if (shadowData.length === 0) return;

    const headers = Object.keys(shadowData[0]);
    const rows = shadowData.map(row =>
      headers.map(h => {
        const val = String(row[h] ?? '');
        return val.includes(',') || val.includes('"') ? `"${val.replace(/"/g, '""')}"` : val;
      }).join(',')
    );

    const csv = [headers.join(','), ...rows].join('\n');
    const name = selectedNode?.name || 'data';
    downloadFile(`${name}.csv`, csv, 'text/csv');
    setOpen(false);
  };

  const exportGraphJSON = () => {
    downloadFile('dbcanvas-graph.json', JSON.stringify(graphData, null, 2), 'application/json');
    setOpen(false);
  };

  return (
    <div className="export-menu-wrapper">
      <button className="btn-cmd-k" onClick={() => setOpen(!open)} title="Export">
        <Download size={12} />
        <span>Export</span>
      </button>

      {open && (
        <div className="export-dropdown">
          <div className="export-item" onClick={exportGraphPNG}>
            <Image size={14} /> Export Graph as PNG
          </div>
          <div className="export-item" onClick={exportGraphJSON}>
            <FileText size={14} /> Export Graph as JSON
          </div>
          {selectedNode?.type === 'TABLE' && tableSchema.length > 0 && (
            <div className="export-item" onClick={exportSchemaDDL}>
              <FileText size={14} /> Export Schema as SQL DDL
            </div>
          )}
          {shadowData.length > 0 && (
            <div className="export-item" onClick={exportDataCSV}>
              <Table size={14} /> Export Data as CSV
            </div>
          )}
        </div>
      )}
    </div>
  );
};

function downloadFile(filename: string, content: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.download = filename;
  link.href = url;
  link.click();
  URL.revokeObjectURL(url);
}

export default ExportMenu;
