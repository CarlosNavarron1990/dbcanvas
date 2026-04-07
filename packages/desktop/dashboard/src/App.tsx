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
import LoginScreen from './components/LoginScreen';
import './index.css';

const POLL_INTERVAL = 10_000; // 10 seconds

function hasElectronBridge(): boolean {
  return typeof window !== 'undefined' && !!(window as any).dbcanvas?.startLogin;
}

const App: React.FC = () => {
  const { viewMode, selectedNode, theme, fetchGraph, fetchProjects, fetchStatus, selectNode, setActiveTab, setLastSignal, setSession, setUpdateStatus } = useStore();
  const [showOnboarding, setShowOnboarding] = useState(() => !localStorage.getItem('dbcanvas-onboarded'));
  const [showLogin, setShowLogin] = useState(false);
  const [loginChecked, setLoginChecked] = useState(false);
  const lastNodeCount = useRef(0);

  // Check for existing session or show login
  useEffect(() => {
    const w = window as any;
    const electron = hasElectronBridge();
    console.log('[DBCanvas] hasElectronBridge:', electron, 'window.dbcanvas:', !!w.dbcanvas, 'startLogin:', !!w.dbcanvas?.startLogin);

    if (!electron) {
      // Not in Electron — skip login
      console.log('[DBCanvas] Not in Electron, skipping login');
      setLoginChecked(true);
      return;
    }

    console.log('[DBCanvas] In Electron, checking session...');
    w.dbcanvas.getSession().then((session: any) => {
      console.log('[DBCanvas] getSession result:', session);
      if (session?.token) {
        setSession(session);
        localStorage.setItem('dbcanvas-session', JSON.stringify(session));
      } else {
        localStorage.removeItem('dbcanvas-session');
        setShowLogin(true);
      }
      setLoginChecked(true);
    }).catch((err: any) => {
      console.error('[DBCanvas] getSession error:', err);
      setShowLogin(true);
      setLoginChecked(true);
    });

    // Listen for auto-update events
    const cleanupAvailable = w.dbcanvas.onUpdateAvailable?.((info: any) => {
      setUpdateStatus('available', info?.version);
    });
    const cleanupDownloaded = w.dbcanvas.onUpdateDownloaded?.((info: any) => {
      setUpdateStatus('downloaded', info?.version);
    });
    return () => {
      cleanupAvailable?.();
      cleanupDownloaded?.();
    };
  }, []);

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

  if (!loginChecked) {
    return <div className="login-screen"><div className="login-card"><h1>DBCanvas</h1><p>Loading...</p></div></div>;
  }

  if (showLogin) {
    return <LoginScreen
      onLogin={(s) => {
        setSession(s);
        localStorage.setItem('dbcanvas-session', JSON.stringify(s));
        setShowLogin(false);
      }}
      onSkip={() => {
        setShowLogin(false);
      }}
    />;
  }

  if (showOnboarding) {
    return <Onboarding onComplete={() => setShowOnboarding(false)} />;
  }

  return (
    <div className="obsidian-app">
      <div className="titlebar-drag" />
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
