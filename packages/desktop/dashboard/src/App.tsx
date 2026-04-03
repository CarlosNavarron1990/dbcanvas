import React, { useEffect, useState, useRef } from 'react';
import { useStore } from './store/useStore';
import * as api from './api';
import Sidebar from './components/Sidebar';
import TreeExplorer from './components/TreeExplorer';
import Toolbar from './components/Toolbar';
import GraphCanvas from './components/GraphCanvas';
import DetailPanel from './components/DetailPanel';
import SettingsView from './components/SettingsView';
import CommandPalette from './components/CommandPalette';
import NotificationToast from './components/NotificationToast';
import Onboarding from './components/Onboarding';
import './index.css';

const POLL_INTERVAL = 10_000; // 10 seconds

const App: React.FC = () => {
  const { viewMode, selectedNode, theme, fetchGraph, fetchProjects, fetchStatus, selectNode, setActiveTab, setLastSignal } = useStore();
  const [showOnboarding, setShowOnboarding] = useState(() => !localStorage.getItem('dbcanvas-onboarded'));
  const lastNodeCount = useRef(0);

  useEffect(() => {
    fetchGraph();
    fetchStatus();
    fetchProjects();

    // SSE notifications from MCP
    const cleanup = api.onNotification((signal) => {
      setLastSignal(signal);
      setTimeout(() => {
        useStore.getState().lastSignal?.name === signal.name && setLastSignal(null);
      }, 5000);

      // Always refresh graph on any notification
      fetchGraph().then((freshData) => {
        if (!freshData) return;
        if (signal.name) {
          const node = freshData.nodes.find((n: any) =>
            n.id.toLowerCase().includes(signal.name.toLowerCase())
          );
          if (node) {
            selectNode(node);
            setActiveTab(signal.type === 'PROCEDURE' ? 'code' : 'data');
            const ref = (window as any).__dbcanvas_graph_ref?.current;
            if (ref) {
              ref.centerAt(node.x, node.y, 1000);
              ref.zoom(2, 1000);
            }
          }
        }
      });
    });

    // Auto-polling: refresh graph every 10s if node count changed
    const pollInterval = setInterval(async () => {
      const data = await fetchGraph();
      if (data && data.nodes.length !== lastNodeCount.current) {
        lastNodeCount.current = data.nodes.length;
        // Also refresh projects and status when graph changes
        fetchProjects();
        fetchStatus();
      }
    }, POLL_INTERVAL);

    return () => {
      cleanup();
      clearInterval(pollInterval);
    };
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  if (showOnboarding) {
    return <Onboarding onComplete={() => setShowOnboarding(false)} />;
  }

  return (
    <div className="obsidian-app">
      <Sidebar />
      <TreeExplorer />
      <NotificationToast />
      <CommandPalette />

      <main className="main-stage">
        <Toolbar />
        <div className="content-viewport">
          {viewMode === 'settings' ? <SettingsView /> :
           viewMode === 'detail' && selectedNode ? <DetailPanel /> :
           <GraphCanvas />}
        </div>
      </main>
    </div>
  );
};

export default App;
