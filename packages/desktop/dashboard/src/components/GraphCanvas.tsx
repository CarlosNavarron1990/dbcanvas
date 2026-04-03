import React, { useRef, useEffect, useCallback, useState, useMemo } from 'react';
import ForceGraph2D from 'react-force-graph-2d';
import { useStore } from '../store/useStore';
import type { GraphNode } from '../store/useStore';
import { ChevronDown, ChevronRight, RotateCcw } from 'lucide-react';

const TYPE_COLORS: Record<string, string> = {
  TABLE: '#4f46e5',
  PROCEDURE: '#ec4899',
  VIEW: '#10b981',
};

interface ForceSettings {
  centerForce: number;
  chargeForce: number;
  linkForce: number;
  linkDistance: number;
}

const DEFAULT_FORCES: ForceSettings = {
  centerForce: 0.3,
  chargeForce: -120,
  linkForce: 0.5,
  linkDistance: 80,
};

const GraphCanvas: React.FC = () => {
  const { graphData, selectNode, theme } = useStore();
  const fgRef = useRef<any>(null);
  const [hoveredNode, setHoveredNode] = useState<string | null>(null);
  const [forces, setForces] = useState<ForceSettings>({ ...DEFAULT_FORCES });
  const [showControls, setShowControls] = useState(false);
  const [visibleTypes, setVisibleTypes] = useState({ TABLE: true, PROCEDURE: true, VIEW: true });

  useEffect(() => {
    (window as any).__dbcanvas_graph_ref = fgRef;
  }, []);

  // Auto zoom-to-fit when data changes
  useEffect(() => {
    if (graphData.nodes.length > 0 && fgRef.current) {
      setTimeout(() => fgRef.current?.zoomToFit(400, 80), 600);
    }
  }, [graphData.nodes.length]);

  // Apply force settings
  useEffect(() => {
    const fg = fgRef.current;
    if (!fg) return;
    fg.d3Force('center')?.strength(forces.centerForce);
    fg.d3Force('charge')?.strength(forces.chargeForce);
    fg.d3Force('link')?.strength(forces.linkForce).distance(forces.linkDistance);
    fg.d3ReheatSimulation();
  }, [forces]);

  // Compute connected nodes/links for hover highlight
  const { connectedNodes, connectedLinks } = useMemo(() => {
    if (!hoveredNode) return { connectedNodes: new Set<string>(), connectedLinks: new Set<string>() };
    const nodes = new Set<string>([hoveredNode]);
    const links = new Set<string>();
    graphData.links.forEach((link: any) => {
      const src = typeof link.source === 'object' ? link.source.id : link.source;
      const tgt = typeof link.target === 'object' ? link.target.id : link.target;
      if (src === hoveredNode || tgt === hoveredNode) {
        nodes.add(src);
        nodes.add(tgt);
        links.add(`${src}->${tgt}`);
      }
    });
    return { connectedNodes: nodes, connectedLinks: links };
  }, [hoveredNode, graphData.links]);

  // Filter visible data
  const filteredData = useMemo(() => {
    const nodes = graphData.nodes.filter(n => visibleTypes[n.type as keyof typeof visibleTypes] !== false);
    const nodeIds = new Set(nodes.map(n => n.id));
    const links = graphData.links.filter((l: any) => {
      const src = typeof l.source === 'object' ? l.source.id : l.source;
      const tgt = typeof l.target === 'object' ? l.target.id : l.target;
      return nodeIds.has(src) && nodeIds.has(tgt);
    });
    return { nodes, links };
  }, [graphData, visibleTypes]);

  const handleNodeClick = useCallback((node: any) => {
    selectNode(node as GraphNode);
  }, [selectNode]);

  const handleNodeHover = useCallback((node: any) => {
    setHoveredNode(node?.id || null);
    const el = document.querySelector('.canvas-wrapper');
    if (el) (el as HTMLElement).style.cursor = node ? 'pointer' : 'default';
  }, []);

  const nodeCanvasObject = useCallback((node: any, ctx: CanvasRenderingContext2D) => {
    const label = node.name || '';
    const color = TYPE_COLORS[node.type] || '#94a3b8';
    const x = node.x as number;
    const y = node.y as number;
    const isHighlighted = hoveredNode === node.id;
    const isConnected = connectedNodes.has(node.id);
    const isDimmed = hoveredNode && !isConnected;

    ctx.save();

    const alpha = isDimmed ? 0.12 : 1;
    ctx.globalAlpha = alpha;

    // Glow for highlighted node
    if (isHighlighted) {
      ctx.shadowColor = color;
      ctx.shadowBlur = 20;
    } else if (isConnected && hoveredNode) {
      ctx.shadowColor = color;
      ctx.shadowBlur = 10;
    }

    // Size: bigger for highlighted, proportional to connections
    const baseSize = isHighlighted ? 8 : isConnected && hoveredNode ? 6 : 5;

    ctx.fillStyle = color;
    ctx.strokeStyle = isHighlighted ? '#ffffff' : color;
    ctx.lineWidth = isHighlighted ? 2 : 1;

    if (node.type === 'TABLE') {
      // Rounded rectangle
      const w = baseSize * 2.2, h = baseSize * 1.5, r = 2;
      ctx.beginPath();
      ctx.moveTo(x - w/2 + r, y - h/2);
      ctx.lineTo(x + w/2 - r, y - h/2);
      ctx.quadraticCurveTo(x + w/2, y - h/2, x + w/2, y - h/2 + r);
      ctx.lineTo(x + w/2, y + h/2 - r);
      ctx.quadraticCurveTo(x + w/2, y + h/2, x + w/2 - r, y + h/2);
      ctx.lineTo(x - w/2 + r, y + h/2);
      ctx.quadraticCurveTo(x - w/2, y + h/2, x - w/2, y + h/2 - r);
      ctx.lineTo(x - w/2, y - h/2 + r);
      ctx.quadraticCurveTo(x - w/2, y - h/2, x - w/2 + r, y - h/2);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    } else if (node.type === 'PROCEDURE') {
      // Diamond
      ctx.beginPath();
      ctx.moveTo(x, y - baseSize);
      ctx.lineTo(x + baseSize, y);
      ctx.lineTo(x, y + baseSize);
      ctx.lineTo(x - baseSize, y);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    } else {
      // View = circle
      ctx.beginPath();
      ctx.arc(x, y, baseSize, 0, 2 * Math.PI);
      ctx.fill();
      ctx.stroke();
    }

    ctx.shadowBlur = 0;

    // Label
    const fontSize = isHighlighted ? 11 : (isConnected && hoveredNode) ? 9 : Math.max(3.5, 8 / (graphData.nodes.length > 80 ? 1.5 : 1));
    ctx.font = `${isHighlighted ? 'bold ' : ''}${fontSize}px Inter, system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillStyle = theme === 'dark' ? `rgba(255,255,255,${isDimmed ? 0.1 : 0.85})` : `rgba(0,0,0,${isDimmed ? 0.1 : 0.85})`;

    const maxLen = isHighlighted ? 40 : 22;
    const displayName = label.length > maxLen ? label.substring(0, maxLen) + '...' : label;
    ctx.fillText(displayName, x, y + baseSize + 3);

    ctx.restore();
  }, [theme, hoveredNode, connectedNodes, graphData.nodes.length]);

  const linkColor = useCallback((link: any) => {
    if (!hoveredNode) return theme === 'dark' ? 'rgba(148,163,184,0.2)' : 'rgba(100,116,139,0.15)';
    const src = typeof link.source === 'object' ? link.source.id : link.source;
    const tgt = typeof link.target === 'object' ? link.target.id : link.target;
    const key = `${src}->${tgt}`;
    if (connectedLinks.has(key)) return '#818cf8'; // indigo-400, like Obsidian purple
    return theme === 'dark' ? 'rgba(148,163,184,0.05)' : 'rgba(100,116,139,0.05)';
  }, [hoveredNode, connectedLinks, theme]);

  const linkWidth = useCallback((link: any) => {
    if (!hoveredNode) return 1;
    const src = typeof link.source === 'object' ? link.source.id : link.source;
    const tgt = typeof link.target === 'object' ? link.target.id : link.target;
    return connectedLinks.has(`${src}->${tgt}`) ? 2.5 : 0.3;
  }, [hoveredNode, connectedLinks]);

  const resetForces = () => setForces({ ...DEFAULT_FORCES });
  const toggleType = (type: string) => setVisibleTypes(prev => ({ ...prev, [type]: !prev[type as keyof typeof prev] }));

  const bgColor = theme === 'dark' ? '#0f172a' : '#f8fafc';

  return (
    <div className="canvas-wrapper">
      {/* Legend */}
      <div className="graph-legend">
        <span className="legend-item" onClick={() => toggleType('TABLE')} style={{ opacity: visibleTypes.TABLE ? 1 : 0.3, cursor: 'pointer' }}>
          <span className="legend-shape legend-rect" /> Tables ({filteredData.nodes.filter(n => n.type === 'TABLE').length})
        </span>
        <span className="legend-item" onClick={() => toggleType('PROCEDURE')} style={{ opacity: visibleTypes.PROCEDURE ? 1 : 0.3, cursor: 'pointer' }}>
          <span className="legend-shape legend-diamond" /> SPs ({filteredData.nodes.filter(n => n.type === 'PROCEDURE').length})
        </span>
        <span className="legend-item" onClick={() => toggleType('VIEW')} style={{ opacity: visibleTypes.VIEW ? 1 : 0.3, cursor: 'pointer' }}>
          <span className="legend-shape legend-triangle" /> Views ({filteredData.nodes.filter(n => n.type === 'VIEW').length})
        </span>
      </div>

      {/* Force Controls Panel (Obsidian-style) */}
      <div className="graph-controls">
        <div className="gc-header" onClick={() => setShowControls(!showControls)}>
          {showControls ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          <span>Forces</span>
          {showControls && <RotateCcw size={12} className="gc-reset" onClick={(e) => { e.stopPropagation(); resetForces(); }} />}
        </div>
        {showControls && (
          <div className="gc-body">
            <label>
              <span>Center force</span>
              <input type="range" min="0" max="1" step="0.05" value={forces.centerForce}
                onChange={e => setForces(p => ({ ...p, centerForce: +e.target.value }))} />
            </label>
            <label>
              <span>Repel force</span>
              <input type="range" min="-500" max="0" step="10" value={forces.chargeForce}
                onChange={e => setForces(p => ({ ...p, chargeForce: +e.target.value }))} />
            </label>
            <label>
              <span>Link strength</span>
              <input type="range" min="0" max="2" step="0.1" value={forces.linkForce}
                onChange={e => setForces(p => ({ ...p, linkForce: +e.target.value }))} />
            </label>
            <label>
              <span>Link distance</span>
              <input type="range" min="20" max="300" step="10" value={forces.linkDistance}
                onChange={e => setForces(p => ({ ...p, linkDistance: +e.target.value }))} />
            </label>
          </div>
        )}
      </div>

      <ForceGraph2D
        ref={fgRef}
        graphData={filteredData}
        backgroundColor={bgColor}
        nodeCanvasObject={nodeCanvasObject}
        nodePointerAreaPaint={(node: any, color, ctx) => {
          ctx.beginPath();
          ctx.arc(node.x, node.y, 12, 0, 2 * Math.PI);
          ctx.fillStyle = color;
          ctx.fill();
        }}
        linkDirectionalArrowLength={4}
        linkDirectionalArrowRelPos={0.85}
        linkWidth={linkWidth}
        linkColor={linkColor}
        linkCurvature={0.12}
        onNodeClick={handleNodeClick}
        onNodeHover={handleNodeHover}
        d3AlphaDecay={0.04}
        d3VelocityDecay={0.25}
        cooldownTicks={200}
        warmupTicks={100}
        minZoom={0.3}
        maxZoom={10}
      />
    </div>
  );
};

export default GraphCanvas;
