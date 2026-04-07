import { create } from 'zustand';
import * as api from '../api';

export interface GraphNode {
  id: string;
  name: string;
  type: 'TABLE' | 'PROCEDURE' | 'VIEW';
  x?: number;
  y?: number;
}

export interface GraphLink {
  source: string;
  target: string;
  type: string;
  label?: string;
}

export interface GraphData {
  nodes: GraphNode[];
  links: GraphLink[];
  total?: number;
}

export interface IdeInfo {
  name: string;
  configPath: string;
  exists: boolean;
  registered: boolean;
}

export type ViewMode = 'graph' | 'settings' | 'detail';
export type DetailTab = 'info' | 'code' | 'data';
export type Theme = 'dark' | 'light';

export interface UserSession {
  token: string;
  user: { id: string; email: string; name: string };
  license: { key: string; tier: string; expiresAt?: string } | null;
}

export type UpdateStatus = 'idle' | 'available' | 'downloaded';

interface AppState {
  // Graph
  graphData: GraphData;
  loading: boolean;
  selectedNode: GraphNode | null;
  searchTerm: string;

  // Navigation
  viewMode: ViewMode;
  activeTab: DetailTab;
  expandedFolders: string[];

  // Detail data
  procedureCode: string;
  procedureMd: string;
  tableSchema: any[];
  shadowData: any[];

  // Project
  projects: api.RegisteredProject[];
  status: { projectRoot: string; databasePath: string; configSource?: string } | null;
  discoveryLoading: boolean;

  // IDE
  ides: IdeInfo[];
  ideMessage: string;

  // Auth / Account
  session: UserSession | null;
  updateStatus: UpdateStatus;
  updateVersion: string;

  // Notifications
  lastSignal: { type: string; name: string } | null;

  // Theme
  theme: Theme;

  // Command palette
  commandPaletteOpen: boolean;

  // Actions
  fetchGraph: () => Promise<GraphData | undefined>;
  runSync: () => Promise<void>;
  fetchProjects: () => Promise<void>;
  fetchStatus: () => Promise<void>;
  deleteProject: (projectPath: string) => Promise<void>;
  renameProject: (projectPath: string, newName: string) => Promise<void>;
  runDiscovery: (searchPath?: string) => Promise<void>;
  selectNode: (node: GraphNode | null) => void;
  setSearchTerm: (term: string) => void;
  setViewMode: (mode: ViewMode) => void;
  setActiveTab: (tab: DetailTab) => void;
  toggleFolder: (name: string) => void;
  setLastSignal: (signal: { type: string; name: string } | null) => void;
  toggleTheme: () => void;
  setCommandPaletteOpen: (open: boolean) => void;

  // Detail loaders
  loadProcedureDetail: (name: string) => Promise<void>;
  loadTableDetail: (name: string) => Promise<void>;
  captureData: (tableName: string, params: Record<string, unknown>) => Promise<void>;

  // IDE actions
  loadIdes: () => Promise<void>;
  registerIde: (configPath: string) => Promise<void>;
  unregisterIde: (configPath: string) => Promise<void>;
  registerAllIdes: () => Promise<void>;

  // Auth / Account
  setSession: (session: UserSession | null) => void;
  logout: () => Promise<void>;
  setUpdateStatus: (status: UpdateStatus, version?: string) => void;
}

const savedTheme = (typeof localStorage !== 'undefined' ? localStorage.getItem('dbcanvas-theme') : null) as Theme | null;

export const useStore = create<AppState>((set, get) => ({
  graphData: { nodes: [], links: [] },
  loading: false,
  selectedNode: null,
  searchTerm: '',
  viewMode: 'graph',
  activeTab: 'info',
  expandedFolders: ['Stored Procedures', 'Tables', 'Views'],
  procedureCode: '',
  procedureMd: '',
  tableSchema: [],
  shadowData: [],
  projects: [],
  status: null,
  discoveryLoading: false,
  ides: [],
  ideMessage: '',
  session: null,
  updateStatus: 'idle',
  updateVersion: '',
  lastSignal: null,
  theme: savedTheme || 'dark',
  commandPaletteOpen: false,

  fetchGraph: async () => {
    set({ loading: true });
    try {
      const data = await api.getGraph();
      set({ graphData: data, loading: false });
      return data;
    } catch {
      set({ loading: false });
      return undefined;
    }
  },

  runSync: async () => {
    set({ loading: true });
    try {
      await api.syncDiscovery();
      await get().fetchGraph();
    } catch {} finally {
      set({ loading: false });
    }
  },

  fetchProjects: async () => {
    try { set({ projects: await api.getProjects() }); } catch {}
  },

  deleteProject: async (path) => {
    try {
      await api.deleteProject(path);
      await get().fetchProjects();
    } catch {}
  },

  renameProject: async (path, newName) => {
    try {
      await api.renameProject(path, newName);
      await get().fetchProjects();
    } catch {}
  },

  runDiscovery: async (searchPath) => {
    set({ discoveryLoading: true });
    try {
      await api.runDiscovery(searchPath);
      await get().fetchProjects();
    } catch {} finally {
      set({ discoveryLoading: false });
    }
  },

  fetchStatus: async () => {
    try { set({ status: await api.getStatus() }); } catch {}
  },

  selectNode: (node) => {
    set({ selectedNode: node });
    if (node) {
      set({ viewMode: 'detail', activeTab: 'code' });
      if (node.type === 'PROCEDURE') get().loadProcedureDetail(node.name);
      if (node.type === 'TABLE' || node.type === 'VIEW') get().loadTableDetail(node.name);
    } else {
      // Only switch to graph if we're in detail view — don't override settings
      if (get().viewMode === 'detail') {
        set({ viewMode: 'graph' });
      }
    }
  },

  setSearchTerm: (term) => set({ searchTerm: term }),
  setViewMode: (mode) => set({ viewMode: mode }),
  setActiveTab: (tab) => set({ activeTab: tab }),
  setLastSignal: (signal) => set({ lastSignal: signal }),
  setCommandPaletteOpen: (open) => set({ commandPaletteOpen: open }),

  toggleFolder: (name) => set(state => ({
    expandedFolders: state.expandedFolders.includes(name)
      ? state.expandedFolders.filter(f => f !== name)
      : [...state.expandedFolders, name],
  })),

  toggleTheme: () => {
    const next = get().theme === 'dark' ? 'light' : 'dark';
    localStorage.setItem('dbcanvas-theme', next);
    set({ theme: next });
  },

  loadProcedureDetail: async (name) => {
    set({ procedureCode: '', procedureMd: '' });
    try {
      const [code, md] = await Promise.all([
        api.getProcedureCode(name),
        api.getProcedureMd(name),
      ]);
      set({ procedureCode: code || '-- No code available', procedureMd: md || '' });
    } catch {
      set({ procedureCode: '-- Failed to fetch', procedureMd: '' });
    }
  },

  loadTableDetail: async (name) => {
    set({ tableSchema: [], shadowData: [] });
    try {
      const [schema, shadow] = await Promise.all([
        api.getTableSchema(name),
        api.getShadowData(name),
      ]);
      set({ tableSchema: schema || [], shadowData: shadow || [] });
    } catch {}
  },

  captureData: async (tableName, params) => {
    set({ loading: true });
    try {
      await api.captureShadowData(tableName, params);
      const data = await api.getShadowData(tableName);
      set({ shadowData: data || [] });
    } catch {} finally {
      set({ loading: false });
    }
  },

  loadIdes: async () => {
    try { set({ ides: await api.detectIdes() }); } catch {}
  },

  registerIde: async (configPath) => {
    const result = await api.registerIde(configPath);
    set({ ideMessage: result.success ? 'Registered successfully' : (result.error || 'Failed') });
    setTimeout(() => set({ ideMessage: '' }), 3000);
    await get().loadIdes();
  },

  unregisterIde: async (configPath) => {
    await api.unregisterIde(configPath);
    await get().loadIdes();
  },

  registerAllIdes: async () => {
    const result = await api.registerAllIdes();
    const count = result.results.filter((r: any) => r.success).length;
    set({ ideMessage: `Registered in ${count} IDE(s)` });
    setTimeout(() => set({ ideMessage: '' }), 3000);
    await get().loadIdes();
  },

  setSession: (session) => set({ session }),

  logout: async () => {
    const w = window as any;
    if (w.dbcanvas?.logout) await w.dbcanvas.logout();
    localStorage.removeItem('dbcanvas-session');
    set({ session: null });
  },

  setUpdateStatus: (status, version) => set({ updateStatus: status, updateVersion: version || '' }),
}));
