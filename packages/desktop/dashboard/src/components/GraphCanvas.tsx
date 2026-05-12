import React, { useRef, useEffect, useCallback, useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import ForceGraph2D from 'react-force-graph-2d';
import { useStore } from '../store/useStore';
import type { GraphNode } from '../store/useStore';
import {
  RotateCcw,
  Search,
  Focus,
  X,
  Maximize2,
} from 'lucide-react';

// --- Palette (original saturated tones) -----------------------------------
const TYPE_COLORS: Record<string, string> = {
  TABLE: '#4f46e5',     // indigo-600 — structure
  PROCEDURE: '#ec4899', // pink-500 — action
  VIEW: '#10b981',      // emerald-500 — derived
};

const HIGHLIGHT_COLOR = '#FBBF24';
const EDGE_IDLE_DARK = 'rgba(200,210,225,0.18)';
const EDGE_IDLE_LIGHT = 'rgba(100,116,139,0.22)';
const EDGE_DIM = 'rgba(148,163,184,0.05)';

// Adaptive node sizing: small world base (so they shrink at low zoom)
// + screen-size cap (so they don't grow too big at high zoom).
const NODE_WORLD_BASE = 3.5;
const NODE_WORLD_BONUS_MAX = 2.5;     // hubs slightly larger in world coords
const NODE_SCREEN_CAP = 11;           // max on-screen radius (px) — never bigger

function nodeWorldRadius(degree: number): number {
  const bonus = Math.min(Math.log2(degree + 1) * 0.7, NODE_WORLD_BONUS_MAX);
  return NODE_WORLD_BASE + bonus;
}

function nodeRadiusAtZoom(degree: number, globalScale: number): number {
  const worldR = nodeWorldRadius(degree);
  // If the world-sized node would appear larger than the screen cap, shrink the world radius
  if (worldR * globalScale > NODE_SCREEN_CAP) {
    return NODE_SCREEN_CAP / globalScale;
  }
  return worldR;
}

// Labels kept at screen-constant size (like Obsidian) via / globalScale
const LABEL_SCREEN_PX = 10;
const LABEL_SCREEN_PX_HIGHLIGHT = 12;

// Label visibility thresholds
const LABEL_ZOOM_ALL = 0.9;      // all labels shown at/above this zoom
const LABEL_ZOOM_HUBS = 0;       // hub labels always visible (even at min zoom)

// Top-N hubs by degree always get labels
const HUB_COUNT = 25;

interface ForceSettings {
  centerForce: number;
  chargeForce: number;
  linkForce: number;
  linkDistance: number;
}

// Defaults tuned for ~500–1500 nodes: strong repel, long links, weak center
const DEFAULT_FORCES: ForceSettings = {
  centerForce: 0.02,
  chargeForce: -450,
  linkForce: 0.55,
  linkDistance: 110,
};

// Strip common SQL prefixes for display (shape/color already indicates type)
const PREFIX_STRIP_RE = /^(SP|USP|TB|T|V|VW|FN|UDF|P|PROC)_/i;
function formatLabel(name: string, isHighlighted: boolean, maxChars = 22): string {
  if (!name) return '';
  if (isHighlighted) return name;
  const stripped = name.replace(PREFIX_STRIP_RE, '');
  return stripped.length > maxChars ? stripped.substring(0, maxChars) + '…' : stripped;
}

// --- Reduced motion -------------------------------------------------------
function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(() =>
    typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true
  );
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const onChange = () => setReduced(mq.matches);
    mq.addEventListener?.('change', onChange);
    return () => mq.removeEventListener?.('change', onChange);
  }, []);
  return reduced;
}

// --- Viewport culling helper ---------------------------------------------
function getVisibleBounds(ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement, pad = 60) {
  const t = ctx.getTransform();
  if (!t.a || !t.d) return { x1: -Infinity, y1: -Infinity, x2: Infinity, y2: Infinity };
  const x1 = -t.e / t.a - pad;
  const y1 = -t.f / t.d - pad;
  const x2 = x1 + canvas.width / t.a + pad * 2;
  const y2 = y1 + canvas.height / t.d + pad * 2;
  return { x1, y1, x2, y2 };
}

// --------------------------------------------------------------------------

const GraphCanvas: React.FC = () => {
  const { graphData, selectNode, theme } = useStore();
  const fgRef = useRef<any>(null);
  const reducedMotion = useReducedMotion();

  const [hoveredNode, setHoveredNode] = useState<string | null>(null);
  const [focusNodeId, setFocusNodeId] = useState<string | null>(null);
  const [focusHops, setFocusHops] = useState(2);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; node: any } | null>(null);
  const [forces, setForces] = useState<ForceSettings>({ ...DEFAULT_FORCES });
  const [showDevPanel, setShowDevPanel] = useState(false);
  const hasZoomedInitial = useRef(false);
  const lastRenderTime = useRef(0);
  const [visibleTypes, setVisibleTypes] = useState<Record<string, boolean>>({
    TABLE: true,
    PROCEDURE: true,
    VIEW: true,
  });
  const [localSearch, setLocalSearch] = useState('');

  useEffect(() => {
    (window as any).__dbcanvas_graph_ref = fgRef;
  }, []);

  // Dev panel toggle: Cmd/Ctrl+Shift+D
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && (e.key === 'D' || e.key === 'd')) {
        e.preventDefault();
        setShowDevPanel(v => !v);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  // --- Degrees + top hubs (for size + always-visible labels) -------------
  const { nodeDegrees, hubSet } = useMemo(() => {
    const degrees: Record<string, number> = {};
    graphData.links.forEach((l: any) => {
      const sid = typeof l.source === 'object' ? l.source.id : l.source;
      const tid = typeof l.target === 'object' ? l.target.id : l.target;
      degrees[sid] = (degrees[sid] || 0) + 1;
      degrees[tid] = (degrees[tid] || 0) + 1;
    });
    const topIds = Object.entries(degrees)
      .sort((a, b) => b[1] - a[1])
      .slice(0, HUB_COUNT)
      .map(([id]) => id);
    return { nodeDegrees: degrees, hubSet: new Set(topIds) };
  }, [graphData.links]);

  // --- Focus mode: N-hop neighborhood ------------------------------------
  const focusVisibleIds = useMemo(() => {
    if (!focusNodeId) return null;
    const adj = new Map<string, Set<string>>();
    graphData.links.forEach((l: any) => {
      const s = typeof l.source === 'object' ? l.source.id : l.source;
      const t = typeof l.target === 'object' ? l.target.id : l.target;
      if (!adj.has(s)) adj.set(s, new Set());
      if (!adj.has(t)) adj.set(t, new Set());
      adj.get(s)!.add(t);
      adj.get(t)!.add(s);
    });
    const visited = new Set<string>([focusNodeId]);
    let frontier: string[] = [focusNodeId];
    for (let hop = 0; hop < focusHops; hop++) {
      const next: string[] = [];
      for (const id of frontier) {
        for (const nb of adj.get(id) || []) {
          if (!visited.has(nb)) { visited.add(nb); next.push(nb); }
        }
      }
      frontier = next;
    }
    return visited;
  }, [focusNodeId, focusHops, graphData.links]);

  // --- Connected nodes (hover highlight) ---------------------------------
  const connectedNodes = useMemo(() => {
    if (!hoveredNode) return new Set<string>();
    const nodes = new Set<string>([hoveredNode]);
    graphData.links.forEach((link: any) => {
      const src = typeof link.source === 'object' ? link.source.id : link.source;
      const tgt = typeof link.target === 'object' ? link.target.id : link.target;
      if (src === hoveredNode || tgt === hoveredNode) {
        nodes.add(src);
        nodes.add(tgt);
      }
    });
    return nodes;
  }, [hoveredNode, graphData.links]);

  // --- Filter by type + search + focus -----------------------------------
  const filteredData = useMemo(() => {
    const search = localSearch.trim().toLowerCase();
    const nodes = graphData.nodes.filter(n => {
      if (visibleTypes[n.type] === false) return false;
      if (focusVisibleIds && !focusVisibleIds.has(n.id)) return false;
      if (search && !n.name.toLowerCase().includes(search)) return false;
      return true;
    });
    const nodeIds = new Set(nodes.map(n => n.id));
    const links = graphData.links.filter((l: any) => {
      const src = typeof l.source === 'object' ? l.source.id : l.source;
      const tgt = typeof l.target === 'object' ? l.target.id : l.target;
      return nodeIds.has(src) && nodeIds.has(tgt);
    });
    return { nodes, links };
  }, [graphData, visibleTypes, focusVisibleIds, localSearch]);

  // --- Stats --------------------------------------------------------------
  const stats = useMemo(() => ({
    total: graphData.nodes.length,
    visible: filteredData.nodes.length,
    links: filteredData.links.length,
  }), [graphData.nodes.length, filteredData]);

  // --- Counts by type (for filter pill labels) ---------------------------
  const typeCounts = useMemo(() => {
    const c: Record<string, number> = { TABLE: 0, PROCEDURE: 0, VIEW: 0 };
    for (const n of graphData.nodes) {
      c[n.type] = (c[n.type] || 0) + 1;
    }
    return c;
  }, [graphData.nodes]);

  // --- Context menu: close on outside click / Escape ---------------------
  useEffect(() => {
    if (!contextMenu) return;
    const close = () => setContextMenu(null);
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    window.addEventListener('click', close);
    window.addEventListener('keydown', esc);
    return () => {
      window.removeEventListener('click', close);
      window.removeEventListener('keydown', esc);
    };
  }, [contextMenu]);

  // --- Apply forces -------------------------------------------------------
  useEffect(() => {
    const fg = fgRef.current;
    if (!fg) return;
    
    const nodeCount = graphData.nodes.length;
    const isLarge = nodeCount > 800;

    // Adaptive forces: large graphs need stronger repulsion and faster cooling
    fg.d3Force('center')?.strength(forces.centerForce);
    fg.d3Force('charge')?.strength(isLarge ? forces.chargeForce * 1.5 : forces.chargeForce);
    fg.d3Force('link')?.strength(forces.linkForce).distance(isLarge ? forces.linkDistance * 1.2 : forces.linkDistance);
    
    if (isLarge) {
      fg.d3AlphaDecay(0.08); // Settle faster
      fg.d3VelocityDecay(0.5); // Less "bouncy"
    }

    fg.d3ReheatSimulation();
  }, [forces, graphData.nodes.length]);

  // --- Auto zoom-to-fit ---------------------------------------------------
  useEffect(() => {
    if (filteredData.nodes.length > 0 && fgRef.current) {
      // If we already zoomed and the data didn't change drastically, don't force a re-zoom
      // This prevents the "restarts" (jumping) when slightly filtering or during minor updates
      if (hasZoomedInitial.current && Math.abs(filteredData.nodes.length - stats.visible) < 5) return;
      
      const delay = reducedMotion ? 50 : 400;
      setTimeout(() => {
        fgRef.current?.zoomToFit(delay, 80);
        hasZoomedInitial.current = true;
      }, reducedMotion ? 100 : 600);
    }
  }, [filteredData.nodes.length, reducedMotion]);

  // --- Callbacks ----------------------------------------------------------
  const handleNodeClick = useCallback((node: any, event: MouseEvent) => {
    if (event && (event.metaKey || event.ctrlKey)) {
      setFocusNodeId(node.id);
      return;
    }
    selectNode(node as GraphNode);
  }, [selectNode]);

  const handleNodeHover = useCallback((node: any) => {
    setHoveredNode(node?.id || null);
    const el = document.querySelector('.canvas-wrapper');
    if (el) (el as HTMLElement).style.cursor = node ? 'pointer' : 'default';
  }, []);

  const handleNodeRightClick = useCallback((node: any, event: MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    setContextMenu({ x: event.clientX, y: event.clientY, node });
  }, []);

  const applyFocus = useCallback((nodeId: string, hops: number) => {
    setFocusNodeId(nodeId);
    setFocusHops(hops);
    setContextMenu(null);
  }, []);

  // --- Node render (Obsidian-style: subtle degree-sized, screen-constant labels)
  const nodeCanvasObject = useCallback((node: any, ctx: CanvasRenderingContext2D, globalScale: number) => {
    try {
      const x = node.x ?? 0;
      const y = node.y ?? 0;

      const canvas = ctx.canvas as HTMLCanvasElement;
      const bounds = getVisibleBounds(ctx, canvas, 80);
      if (x < bounds.x1 || x > bounds.x2 || y < bounds.y1 || y > bounds.y2) return;

      const color = TYPE_COLORS[node.type] || '#94a3b8';
      const isHighlighted = hoveredNode === node.id;
      const isConnected = connectedNodes.has(node.id);
      const isDimmed = hoveredNode && !isConnected;
      const isHub = hubSet.has(node.id);

      const degree = nodeDegrees[node.id] || 0;
      const radius = nodeRadiusAtZoom(degree, globalScale) * (isHighlighted ? 1.3 : 1);

      ctx.save();
      ctx.globalAlpha = isDimmed ? 0.18 : 1;

      if (isHighlighted) {
        ctx.shadowColor = HIGHLIGHT_COLOR;
        ctx.shadowBlur = 16;
      } else if (isConnected && hoveredNode) {
        ctx.shadowColor = color;
        ctx.shadowBlur = 8;
      }

      ctx.fillStyle = color;
      ctx.strokeStyle = isHighlighted ? '#ffffff' : color;
      ctx.lineWidth = isHighlighted ? 1.5 / globalScale : 0.6 / globalScale;

      if (node.type === 'TABLE') {
        const w = radius * 1.7, h = radius * 1.3, r = 1.2;
        ctx.beginPath();
        ctx.moveTo(x - w / 2 + r, y - h / 2);
        ctx.lineTo(x + w / 2 - r, y - h / 2);
        ctx.quadraticCurveTo(x + w / 2, y - h / 2, x + w / 2, y - h / 2 + r);
        ctx.lineTo(x + w / 2, y + h / 2 - r);
        ctx.quadraticCurveTo(x + w / 2, y + h / 2, x + w / 2 - r, y + h / 2);
        ctx.lineTo(x - w / 2 + r, y + h / 2);
        ctx.quadraticCurveTo(x - w / 2, y + h / 2, x - w / 2, y + h / 2 - r);
        ctx.lineTo(x - w / 2, y - h / 2 + r);
        ctx.quadraticCurveTo(x - w / 2, y - h / 2, x - w / 2 + r, y - h / 2);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      } else if (node.type === 'PROCEDURE') {
        ctx.beginPath();
        ctx.moveTo(x, y - radius);
        ctx.lineTo(x + radius, y);
        ctx.lineTo(x, y + radius);
        ctx.lineTo(x - radius, y);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      } else {
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, 2 * Math.PI);
        ctx.fill();
        ctx.stroke();
      }

      ctx.shadowBlur = 0;
      void isHub; // labels handled in onRenderFramePost with collision detection

      ctx.restore();
    } catch { /* noop */ }
  }, [theme, hoveredNode, connectedNodes, nodeDegrees]);

  // --- Labels with collision detection (rendered in one pass after nodes) ---
  const onRenderFramePost = useCallback((ctx: CanvasRenderingContext2D, globalScale: number) => {
    const nodes = filteredData.nodes as any[];
    if (!nodes.length) return;

    // Throttle label rendering to ~30fps for performance on large graphs
    const now = performance.now();
    if (now - lastRenderTime.current < 32 && nodes.length > 500) return;
    lastRenderTime.current = now;

    const canvas = ctx.canvas as HTMLCanvasElement;
    const bounds = getVisibleBounds(ctx, canvas, 80);

    // Build label candidates, prioritized
    // priority: 100 highlighted · 50 connected-to-hover · 20 hub · 5 regular
    type Candidate = { node: any; priority: number };
    const candidates: Candidate[] = [];
    for (const n of nodes) {
      if (n.x == null || n.y == null) continue;
      if (n.x < bounds.x1 || n.x > bounds.x2 || n.y < bounds.y1 || n.y > bounds.y2) continue;
      const isHighlighted = n.id === hoveredNode;
      const isConnected = connectedNodes.has(n.id);
      const isHub = hubSet.has(n.id);
      let priority: number;
      if (isHighlighted) priority = 100;
      else if (isConnected && hoveredNode) priority = 50;
      else if (isHub) priority = 20;
      else priority = 5;
      // LOD gating — regular nodes only at high zoom
      if (priority === 5 && globalScale < LABEL_ZOOM_ALL) continue;
      // Hubs only at mid+ zoom (handled via LABEL_ZOOM_HUBS which is 0 = always)
      if (priority === 20 && globalScale < LABEL_ZOOM_HUBS) continue;
      candidates.push({ node: n, priority });
    }

    // Limit candidates to avoid O(N^2) collision checks on massive graphs
    if (candidates.length > 400) {
       candidates.sort((a, b) => b.priority - a.priority);
       candidates.splice(150); // Keep top 150 labels max
    } else {
       candidates.sort((a, b) => b.priority - a.priority);
    }

    // Draw with AABB collision detection (world coords)
    const drawn: { x1: number; y1: number; x2: number; y2: number }[] = [];
    const colPad = 3 / globalScale;

    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';

    for (const { node, priority } of candidates) {
      const isHighlighted = priority === 100;
      const isConnected = priority === 50;
      const isHub = priority === 20;
      const isDimmed = !!hoveredNode && !isHighlighted && !isConnected;

      const screenPx = isHighlighted ? LABEL_SCREEN_PX_HIGHLIGHT : (isHub ? LABEL_SCREEN_PX + 1 : LABEL_SCREEN_PX);
      const fontSize = screenPx / globalScale;
      ctx.font = `${isHighlighted ? '600 ' : isHub ? '600 ' : '500 '}${fontSize}px Inter, system-ui, sans-serif`;

      const displayName = formatLabel(node.name, isHighlighted);
      const textWidth = ctx.measureText(displayName).width;

      const degree = nodeDegrees[node.id] || 0;
      const nodeR = nodeRadiusAtZoom(degree, globalScale);
      const labelPad = 4 / globalScale;
      const labelY = node.y + nodeR + labelPad;

      const box = {
        x1: node.x - textWidth / 2,
        y1: labelY,
        x2: node.x + textWidth / 2,
        y2: labelY + fontSize,
      };

      // Skip if collides with a previously drawn label (except highlighted — always shows)
      if (!isHighlighted) {
        let collides = false;
        for (const d of drawn) {
          if (
            box.x1 < d.x2 + colPad &&
            box.x2 > d.x1 - colPad &&
            box.y1 < d.y2 + colPad &&
            box.y2 > d.y1 - colPad
          ) {
            collides = true;
            break;
          }
        }
        if (collides) continue;
      }
      drawn.push(box);

      // Backdrop
      const bgPadX = 4 / globalScale;
      const bgPadY = 2 / globalScale;
      ctx.fillStyle = theme === 'dark'
        ? `rgba(15,23,42,${isDimmed ? 0.3 : 0.78})`
        : `rgba(248,250,252,${isDimmed ? 0.3 : 0.82})`;
      ctx.fillRect(
        box.x1 - bgPadX,
        box.y1 - bgPadY,
        textWidth + bgPadX * 2,
        fontSize + bgPadY * 2
      );

      // Text
      ctx.fillStyle = theme === 'dark'
        ? `rgba(226,232,240,${isDimmed ? 0.3 : isHub ? 0.97 : 0.9})`
        : `rgba(30,41,59,${isDimmed ? 0.3 : isHub ? 0.97 : 0.92})`;
      ctx.fillText(displayName, node.x, labelY);
    }
    ctx.restore();
  }, [filteredData.nodes, theme, hoveredNode, connectedNodes, hubSet, nodeDegrees]);

  const linkColor = useCallback((link: any) => {
    if (!hoveredNode) return theme === 'dark' ? EDGE_IDLE_DARK : EDGE_IDLE_LIGHT;
    const src = typeof link.source === 'object' ? link.source.id : link.source;
    const tgt = typeof link.target === 'object' ? link.target.id : link.target;
    if (src === hoveredNode || tgt === hoveredNode) return HIGHLIGHT_COLOR;
    return EDGE_DIM;
  }, [hoveredNode, theme]);

  const linkWidth = useCallback((link: any) => {
    const src = typeof link.source === 'object' ? link.source.id : link.source;
    const tgt = typeof link.target === 'object' ? link.target.id : link.target;
    return (src === hoveredNode || tgt === hoveredNode) ? 1.2 : 0.3;
  }, [hoveredNode]);

  const bgColor = theme === 'dark' ? '#0f172a' : '#f8fafc';
  const visibleTypeCount = Object.values(visibleTypes).filter(Boolean).length;

  // --- Inline style tokens (bypass Tailwind — guarantees rendering) -----
  const cardStyle: React.CSSProperties = {
    position: 'absolute',
    top: 16,
    left: 16,
    zIndex: 50,
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
    padding: 12,
    width: 300,
    background: 'rgba(15, 23, 42, 0.82)',
    backdropFilter: 'blur(14px)',
    WebkitBackdropFilter: 'blur(14px)',
    border: '1px solid rgba(71, 85, 105, 0.5)',
    borderRadius: 12,
    boxShadow: '0 20px 40px -12px rgba(0,0,0,0.6), 0 0 0 1px rgba(0,0,0,0.2)',
    fontFamily: 'Inter, system-ui, sans-serif',
    color: '#e2e8f0',
  };
  const statsStyle: React.CSSProperties = {
    position: 'absolute',
    top: 16,
    right: 16,
    zIndex: 50,
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '6px 12px',
    fontSize: 11,
    fontFamily: 'Inter, system-ui, sans-serif',
    color: '#94a3b8',
    background: 'rgba(15, 23, 42, 0.75)',
    backdropFilter: 'blur(12px)',
    WebkitBackdropFilter: 'blur(12px)',
    border: '1px solid rgba(71, 85, 105, 0.5)',
    borderRadius: 8,
    boxShadow: '0 10px 25px -8px rgba(0,0,0,0.5)',
    fontVariantNumeric: 'tabular-nums',
  };
  const iconBtnStyle: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 28,
    height: 28,
    background: 'transparent',
    border: '1px solid rgba(71, 85, 105, 0.5)',
    borderRadius: 6,
    color: '#cbd5e1',
    cursor: 'pointer',
    padding: 0,
  };

  return (
    <div className="relative w-full h-full canvas-wrapper overflow-hidden bg-transparent" style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden' }}>
      {/* Top-left: unified floating card */}
      <div style={cardStyle} className="graph-controls-container">
        {/* Search */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '6px 10px',
          background: 'rgba(2, 6, 23, 0.6)',
          border: '1px solid rgba(71, 85, 105, 0.4)',
          borderRadius: 8,
        }}>
          <Search size={13} color="#94a3b8" />
          <input
            type="text"
            value={localSearch}
            onChange={e => setLocalSearch(e.target.value)}
            placeholder="Filtrar por nombre…"
            style={{
              flex: 1,
              minWidth: 0,
              background: 'transparent',
              border: 'none',
              outline: 'none',
              color: '#f1f5f9',
              fontSize: 12,
              fontFamily: 'inherit',
            }}
          />
          {localSearch && (
            <button
              onClick={() => setLocalSearch('')}
              style={{ background: 'transparent', border: 'none', color: '#64748b', cursor: 'pointer', padding: 0, display: 'inline-flex' }}
              aria-label="Limpiar búsqueda"
            >
              <X size={13} />
            </button>
          )}
        </div>

        {/* Type filter pill with counts (doubles as legend) */}
        <div style={{
          display: 'inline-flex',
          alignItems: 'stretch',
          background: 'rgba(2, 6, 23, 0.6)',
          border: '1px solid rgba(71, 85, 105, 0.4)',
          borderRadius: 999,
          overflow: 'hidden',
        }}>
          {([
            { key: 'TABLE', label: 'Tablas', shape: 'square' },
            { key: 'PROCEDURE', label: 'SPs', shape: 'diamond' },
            { key: 'VIEW', label: 'Vistas', shape: 'circle' },
          ] as const).map(({ key, label, shape }, i) => {
            const active = visibleTypes[key];
            const count = typeCounts[key] || 0;
            return (
              <button
                key={key}
                onClick={() => setVisibleTypes(v => ({ ...v, [key]: !v[key] }))}
                aria-pressed={active}
                title={`${active ? 'Ocultar' : 'Mostrar'} ${label}`}
                style={{
                  flex: 1,
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6,
                  padding: '6px 10px',
                  fontSize: 11,
                  fontWeight: 500,
                  fontFamily: 'inherit',
                  background: 'transparent',
                  border: 'none',
                  borderLeft: i > 0 ? '1px solid rgba(71, 85, 105, 0.4)' : 'none',
                  color: active ? '#f1f5f9' : '#64748b',
                  cursor: 'pointer',
                }}
              >
                <span
                  style={{
                    display: 'inline-block',
                    width: shape === 'square' ? 9 : 7,
                    height: shape === 'square' ? 7 : 7,
                    background: active ? TYPE_COLORS[key] : '#475569',
                    borderRadius: shape === 'circle' ? '50%' : shape === 'square' ? 2 : 0,
                    transform: shape === 'diamond' ? 'rotate(45deg)' : undefined,
                    flexShrink: 0,
                  }}
                />
                <span>{label}</span>
                <span style={{
                  fontSize: 10,
                  color: active ? '#94a3b8' : '#475569',
                  fontVariantNumeric: 'tabular-nums',
                }}>
                  ({count})
                </span>
              </button>
            );
          })}
        </div>

        {/* Focus bar */}
        {focusNodeId && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '6px 10px',
            background: 'rgba(69, 26, 3, 0.35)',
            border: '1px solid rgba(245, 158, 11, 0.35)',
            borderRadius: 8,
          }}>
            <Focus size={13} color="#FCD34D" style={{ flexShrink: 0 }} />
            <span style={{
              flex: 1,
              minWidth: 0,
              fontSize: 11,
              color: '#FDE68A',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}>
              Enfoque: {graphData.nodes.find(n => n.id === focusNodeId)?.name || focusNodeId}
            </span>
            <select
              value={focusHops}
              onChange={e => setFocusHops(+e.target.value)}
              aria-label="Profundidad de enfoque"
              style={{
                background: 'rgba(69, 26, 3, 0.55)',
                border: '1px solid rgba(245, 158, 11, 0.35)',
                borderRadius: 4,
                color: '#FEF3C7',
                fontSize: 10,
                padding: '1px 4px',
                outline: 'none',
                cursor: 'pointer',
              }}
            >
              <option value={1}>1 salto</option>
              <option value={2}>2 saltos</option>
              <option value={3}>3 saltos</option>
            </select>
            <button
              onClick={() => setFocusNodeId(null)}
              style={{ background: 'transparent', border: 'none', color: 'rgba(252, 211, 77, 0.7)', cursor: 'pointer', padding: 0, display: 'inline-flex' }}
              aria-label="Salir del enfoque"
            >
              <X size={13} />
            </button>
          </div>
        )}

        {/* Dev panel (⌘⇧D) */}
        {showDevPanel && (
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 10,
            padding: 10,
            background: 'rgba(2, 6, 23, 0.8)',
            border: '1px solid rgba(71, 85, 105, 0.5)',
            borderRadius: 8,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid rgba(71, 85, 105, 0.4)', paddingBottom: 6 }}>
              <span style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#94a3b8' }}>Dev · Fuerzas</span>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => setForces({ ...DEFAULT_FORCES })} style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: 0 }} aria-label="Restablecer">
                  <RotateCcw size={11} />
                </button>
                <button onClick={() => setShowDevPanel(false)} style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: 0 }} aria-label="Cerrar">
                  <X size={12} />
                </button>
              </div>
            </div>
            {([
              ['centerForce', 'Centro', 0, 1, 0.05],
              ['chargeForce', 'Repulsión', -1500, 0, 20],
              ['linkForce', 'Fuerza enlace', 0, 2, 0.1],
              ['linkDistance', 'Distancia enlace', 10, 200, 5],
            ] as const).map(([key, label, min, max, step]) => (
              <label key={key} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <span style={{ fontSize: 10, color: '#94a3b8' }}>{label} ({forces[key]})</span>
                <input
                  type="range"
                  min={min}
                  max={max}
                  step={step}
                  value={forces[key]}
                  onChange={e => setForces(p => ({ ...p, [key]: +e.target.value }))}
                />
              </label>
            ))}
          </div>
        )}

        {/* Hint footer */}
        <div style={{
          paddingTop: 4,
          fontSize: 10,
          color: '#64748b',
          borderTop: '1px solid rgba(71, 85, 105, 0.3)',
          paddingLeft: 2,
          lineHeight: 1.5,
        }}>
          Click derecho en un nodo para opciones · ⌘-click = enfoque rápido
        </div>
      </div>

      {/* Top-right: stats + fit */}
      <div style={statsStyle}>
        <span><span style={{ color: '#f1f5f9', fontWeight: 600 }}>{stats.visible}</span>/{stats.total} nodos</span>
        <span style={{ color: '#334155' }}>·</span>
        <span><span style={{ color: '#f1f5f9', fontWeight: 600 }}>{stats.links}</span> enlaces</span>
        <button
          onClick={() => fgRef.current?.zoomToFit(reducedMotion ? 0 : 400, 80)}
          style={{ ...iconBtnStyle, marginLeft: 6 }}
          aria-label="Ajustar a pantalla"
          title="Ajustar a pantalla"
        >
          <Maximize2 size={13} />
        </button>
      </div>

      {/* Context menu (right-click) — rendered via Portal to escape ancestor backdrop-filter containing blocks */}
      {contextMenu && createPortal(
        (() => {
          const MENU_W = 240;
          const MENU_H_APPROX = focusNodeId ? 240 : 200;
          const viewportW = window.innerWidth;
          const viewportH = window.innerHeight;
          const left = Math.min(contextMenu.x, viewportW - MENU_W - 8);
          const top = Math.min(contextMenu.y, viewportH - MENU_H_APPROX - 8);
          const menuStyle: React.CSSProperties = {
            position: 'fixed',
            left,
            top,
            minWidth: MENU_W,
            zIndex: 9999,
            background: 'rgba(15, 23, 42, 0.97)',
            backdropFilter: 'blur(14px)',
            WebkitBackdropFilter: 'blur(14px)',
            border: '1px solid rgba(71, 85, 105, 0.6)',
            borderRadius: 8,
            boxShadow: '0 20px 40px -12px rgba(0,0,0,0.7), 0 0 0 1px rgba(0,0,0,0.2)',
            padding: '4px 0',
            color: '#e2e8f0',
            fontFamily: 'Inter, system-ui, sans-serif',
          };
          const itemStyle: React.CSSProperties = {
            display: 'block',
            width: '100%',
            textAlign: 'left',
            padding: '8px 12px',
            fontSize: 12,
            background: 'transparent',
            border: 'none',
            color: '#e2e8f0',
            cursor: 'pointer',
          };
          const dividerStyle: React.CSSProperties = {
            borderTop: '1px solid rgba(71, 85, 105, 0.4)',
            margin: '4px 0',
          };
          return (
            <div
              style={menuStyle}
              onClick={e => e.stopPropagation()}
              onContextMenu={e => e.preventDefault()}
              role="menu"
            >
              <div style={{
                padding: '6px 12px',
                fontSize: 10,
                fontWeight: 600,
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                color: '#94a3b8',
                borderBottom: '1px solid rgba(71, 85, 105, 0.4)',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                maxWidth: 240,
              }}>
                {contextMenu.node.name}
              </div>
              <button
                style={itemStyle}
                onMouseEnter={e => (e.currentTarget.style.background = 'rgba(30,41,59,0.7)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                onClick={() => applyFocus(contextMenu.node.id, 1)}
              >
                <span style={{ color: '#FCD34D', marginRight: 8 }}>◉</span>
                Aislar (vecinos directos)
              </button>
              <button
                style={itemStyle}
                onMouseEnter={e => (e.currentTarget.style.background = 'rgba(30,41,59,0.7)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                onClick={() => applyFocus(contextMenu.node.id, 2)}
              >
                <span style={{ color: '#FCD34D', marginRight: 8 }}>◎</span>
                Aislar + vecinos (2 saltos)
              </button>
              <button
                style={itemStyle}
                onMouseEnter={e => (e.currentTarget.style.background = 'rgba(30,41,59,0.7)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                onClick={() => applyFocus(contextMenu.node.id, 3)}
              >
                <span style={{ color: '#FCD34D', marginRight: 8 }}>◉</span>
                Vecindario extendido (3 saltos)
              </button>
              <div style={dividerStyle} />
              <button
                style={itemStyle}
                onMouseEnter={e => (e.currentTarget.style.background = 'rgba(30,41,59,0.7)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                onClick={() => { selectNode(contextMenu.node); setContextMenu(null); }}
              >
                <span style={{ color: '#94a3b8', marginRight: 8 }}>›</span>
                Abrir detalles
              </button>
              {focusNodeId && (
                <>
                  <div style={dividerStyle} />
                  <button
                    style={{ ...itemStyle, color: '#FCD34D' }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'rgba(69, 26, 3, 0.4)')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                    onClick={() => { setFocusNodeId(null); setContextMenu(null); }}
                  >
                    <span style={{ marginRight: 8 }}>×</span>
                    Salir del enfoque
                  </button>
                </>
              )}
            </div>
          );
        })(),
        document.body
      )}

      {/* Empty states */}
      {visibleTypeCount === 0 ? (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 40, pointerEvents: 'none' }}>
          <div style={{ textAlign: 'center', fontFamily: 'Inter, system-ui, sans-serif' }}>
            <p style={{ fontWeight: 500, color: '#cbd5e1', fontSize: 14 }}>Ningún tipo seleccionado</p>
            <p style={{ fontSize: 12, marginTop: 4, color: '#94a3b8' }}>Activa al menos un tipo en los filtros</p>
          </div>
        </div>
      ) : filteredData.nodes.length === 0 && graphData.nodes.length > 0 ? (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 40, pointerEvents: 'none' }}>
          <div style={{ textAlign: 'center', fontFamily: 'Inter, system-ui, sans-serif' }}>
            <p style={{ fontWeight: 500, color: '#cbd5e1', fontSize: 14 }}>Sin coincidencias</p>
            <p style={{ fontSize: 12, marginTop: 4, color: '#94a3b8' }}>Ajusta filtros o búsqueda</p>
          </div>
        </div>
      ) : null}

      <ForceGraph2D
        ref={fgRef}
        graphData={filteredData}
        backgroundColor={bgColor}
        nodeCanvasObject={nodeCanvasObject}
        onRenderFramePost={onRenderFramePost}
        nodePointerAreaPaint={(node: any, color, ctx) => {
          const t = ctx.getTransform();
          const dpr = window.devicePixelRatio || 1;
          const scale = Math.max((t.a || 1) / dpr, 0.01);
          const degree = nodeDegrees[node.id] || 0;
          const worldR = nodeRadiusAtZoom(degree, scale);
          // Ensure at least 8px hit target on screen
          const hitR = Math.max(worldR + 2 / scale, 8 / scale);
          ctx.beginPath();
          ctx.arc(node.x, node.y, hitR, 0, 2 * Math.PI);
          ctx.fillStyle = color;
          ctx.fill();
        }}
        linkDirectionalArrowLength={0}
        linkWidth={linkWidth}
        linkColor={linkColor}
        linkCurvature={0.08}
        onNodeClick={handleNodeClick}
        onNodeRightClick={handleNodeRightClick}
        onNodeHover={handleNodeHover}
        d3AlphaDecay={reducedMotion ? 0.2 : 0.05}
        d3VelocityDecay={reducedMotion ? 0.6 : 0.45}
        cooldownTicks={reducedMotion ? 60 : 120}
        cooldownTime={reducedMotion ? 1500 : 4000}
        warmupTicks={reducedMotion ? 20 : 50}
        enableNodeDrag={true}
        minZoom={0.02}
        maxZoom={20}
      />
    </div>
  );
};

export default GraphCanvas;
