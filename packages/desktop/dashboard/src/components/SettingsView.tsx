import React, { useEffect, useState } from 'react';
import { 
  Database, Check, AlertCircle, Sun, Moon, Copy, Terminal, ChevronDown, 
  ChevronRight, User, LogOut, Download, RefreshCw, Edit, Trash2, 
  Search, Plus, Save, X, Loader2 
} from 'lucide-react';
import { useStore } from '../store/useStore';
import { isElectron as importedIsElectron } from '../api';

interface IdeInstallInfo {
  name: string;
  icon: string;
  configFile: string;
  configJson: string;
  description: string;
}

/**
 * Generate all IDE guides based on real platform and path
 */
function getIdeInstallGuides(platform: string, mcpPath: string): IdeInstallInfo[] {
  const isWin = platform === 'win32';
  const homeLabel = isWin ? '%USERPROFILE%' : '~';
  const appDataLabel = isWin ? '%APPDATA%' : '~/Library/Application Support';

  const mcpEntry = (path: string) => JSON.stringify({
    mcpServers: {
      dbcanvas: {
        command: 'node',
        args: [path],
      },
    },
  }, null, 2);

  return [
    {
      name: 'Claude Desktop',
      icon: 'C',
      configFile: isWin 
        ? `${appDataLabel}\\Claude\\claude_desktop_config.json`
        : `${homeLabel}/Library/Application Support/Claude/claude_desktop_config.json`,
      configJson: mcpEntry(mcpPath),
      description: 'Add to your claude_desktop_config.json (merge with existing mcpServers)',
    },
    {
      name: 'Claude Code (CLI)',
      icon: '>',
      configFile: isWin ? `${homeLabel}\\.claude\\claude_desktop_config.json` : `${homeLabel}/.claude/claude_desktop_config.json`,
      configJson: mcpEntry(mcpPath),
      description: 'Add to your Claude Code config file',
    },
    {
      name: 'Cursor',
      icon: '{',
      configFile: isWin ? `${homeLabel}\\.cursor\\mcp.json` : `${homeLabel}/.cursor/mcp.json`,
      configJson: mcpEntry(mcpPath),
      description: 'Add to your Cursor MCP config',
    },
    {
      name: 'Windsurf',
      icon: 'W',
      configFile: isWin ? `${homeLabel}\\.windsurf\\mcp.json` : `${homeLabel}/.windsurf/mcp.json`,
      configJson: mcpEntry(mcpPath),
      description: 'Add to your Windsurf MCP config',
    },
    {
      name: 'Antigravity',
      icon: 'A',
      configFile: isWin ? `${homeLabel}\\.antigravity\\mcp.json` : `${homeLabel}/.antigravity/mcp.json`,
      configJson: mcpEntry(mcpPath),
      description: 'Create or add to your Antigravity MCP config',
    },
    {
      name: 'VS Code (Copilot)',
      icon: 'V',
      configFile: isWin ? `${homeLabel}\\.vscode\\mcp.json` : `${homeLabel}/.vscode/mcp.json`,
      configJson: mcpEntry(mcpPath),
      description: 'Add to your VS Code MCP config (requires Copilot MCP extension)',
    },
    {
      name: 'Codex (OpenAI)',
      icon: 'O',
      configFile: isWin ? `${homeLabel}\\.codex\\mcp.json` : `${homeLabel}/.codex/mcp.json`,
      configJson: mcpEntry(mcpPath),
      description: 'Add to your Codex MCP config',
    },
  ];
}

function copyToClipboard(text: string, setCopied: (id: string) => void, id: string) {
  navigator.clipboard.writeText(text).then(() => {
    setCopied(id);
    setTimeout(() => setCopied(''), 2000);
  });
}

const SettingsView: React.FC = () => {
  // Use a local check for Electron to be 100% sure it's reactive if the bridge injects late
  const isElectron = typeof window !== 'undefined' && (!!(window as any).dbcanvas || importedIsElectron);

  const {
    ides, ideMessage, theme, session, updateStatus, updateVersion,
    projects, discoveryLoading,
    loadIdes, registerIde, unregisterIde, registerAllIdes, toggleTheme, logout,
    deleteProject, renameProject, runDiscovery, fetchProjects
  } = useStore();
  
  const [copied, setCopied] = useState('');
  const [expandedGuide, setExpandedGuide] = useState<string | null>(null);
  const [activeSection, setActiveSection] = useState<'account' | 'projects' | 'install' | 'auto' | 'theme'>(isElectron ? 'projects' : 'install');

  // Dynamic environment info
  const [mcpPath, setMcpPath] = useState('');
  const [platform, setPlatform] = useState('darwin');

  // Local state for renaming
  const [editingPath, setEditingPath] = useState<string | null>(null);
  const [editName, setEditName] = useState('');

  useEffect(() => { 
    loadIdes(); 
    fetchProjects();

    // Fetch dynamic path and platform if in Electron
    if (isElectron && (window as any).dbcanvas) {
      if ((window as any).dbcanvas.getMcpPath) {
        (window as any).dbcanvas.getMcpPath().then(setMcpPath);
      }
      if ((window as any).dbcanvas.getPlatform) {
        (window as any).dbcanvas.getPlatform().then(setPlatform);
      }
    } else {
      // Fallback for web preview
      setMcpPath('/path/to/dbcanvas/mcp-server/index.mjs');
    }
  }, []);

  const handleStartRename = (project: { name: string, path: string }) => {
    setEditingPath(project.path);
    setEditName(project.name);
  };

  const handleSaveRename = async () => {
    if (editingPath && editName.trim()) {
      await renameProject(editingPath, editName.trim());
      setEditingPath(null);
    }
  };

  const toggleGuide = (name: string) => {
    setExpandedGuide(expandedGuide === name ? null : name);
  };

  const ideInstallGuides = getIdeInstallGuides(platform, mcpPath);

  return (
    <div className="detail-central-view slide-up">
      <div className="detail-header-tabs">
        {isElectron && (
          <button className={`tab ${activeSection === 'account' ? 'active' : ''}`} onClick={() => setActiveSection('account')}>
            <User size={12} />
            <span style={{ marginLeft: 6 }}>ACCOUNT</span>
          </button>
        )}
        {isElectron && (
          <button className={`tab ${activeSection === 'projects' ? 'active' : ''}`} onClick={() => setActiveSection('projects')}>
            <Database size={12} />
            <span style={{ marginLeft: 6 }}>PROJECTS</span>
          </button>
        )}
        <button className={`tab ${activeSection === 'install' ? 'active' : ''}`} onClick={() => setActiveSection('install')}>
          <Terminal size={12} />
          <span style={{ marginLeft: 6 }}>INSTALL MCP</span>
        </button>
        {isElectron && (
          <button className={`tab ${activeSection === 'auto' ? 'active' : ''}`} onClick={() => setActiveSection('auto')}>
            <RefreshCw size={12} />
            <span style={{ marginLeft: 6 }}>AUTO-REGISTER</span>
          </button>
        )}
        <button className={`tab ${activeSection === 'theme' ? 'active' : ''}`} onClick={() => setActiveSection('theme')}>
          {theme === 'dark' ? <Sun size={12} /> : <Moon size={12} />}
          <span style={{ marginLeft: 6 }}>THEME</span>
        </button>
      </div>

      <div className="detail-body">
        {/* ===================== PROJECTS SECTION ===================== */}
        {activeSection === 'projects' && (
          <div className="card-obsidian">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h1>Project Management</h1>
              <button 
                className="btn-primary-capture" 
                onClick={() => runDiscovery()} 
                disabled={discoveryLoading}
                style={{ gap: 8 }}
              >
                {discoveryLoading ? <Loader2 size={14} className="spin" /> : <Search size={14} />}
                Discover Solutions
              </button>
            </div>

            <p className="description">
              Manage your registered database solutions. You can rename them for better organization or remove obsolete test projects.
            </p>

            <div className="ide-list" style={{ marginTop: 20 }}>
              {projects.length === 0 && !discoveryLoading && (
                <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-muted)' }}>
                  <Plus size={32} style={{ opacity: 0.2, marginBottom: 16 }} />
                  <p>No projects found. Use "Discover" to find solutions with a .dbcanvas folder.</p>
                </div>
              )}

              {projects.map(project => (
                <div key={project.path} className="ide-row" style={{ alignItems: 'flex-start' }}>
                  <div className="ide-info" style={{ flex: 1 }}>
                    {editingPath === project.path ? (
                      <div style={{ display: 'flex', gap: 8, width: '100%' }}>
                        <input 
                          type="text" 
                          className="input-dark" 
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          autoFocus
                          onKeyDown={(e) => e.key === 'Enter' && handleSaveRename()}
                          style={{ flex: 1, fontSize: 13, padding: '4px 8px' }}
                        />
                        <button className="btn-sm btn-primary" onClick={handleSaveRename}><Save size={12} /></button>
                        <button className="btn-sm btn-secondary" onClick={() => setEditingPath(null)}><X size={12} /></button>
                      </div>
                    ) : (
                      <div className="ide-name" style={{ justifyContent: 'space-between' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <Database size={14} />
                          <span style={{ fontWeight: 600 }}>{project.name}</span>
                        </div>
                        <button className="btn-icon-only" onClick={() => handleStartRename(project)}>
                          <Edit size={12} />
                        </button>
                      </div>
                    )}
                    <code className="ide-path" style={{ marginTop: 4, display: 'block', fontSize: 11, opacity: 0.6 }}>
                      {project.path}
                    </code>
                  </div>
                  
                  <div className="ide-status" style={{ marginLeft: 16 }}>
                    <button 
                      className="btn-sm btn-danger" 
                      onClick={() => {
                        if (confirm(`Remove project "${project.name}" from registry? (This won't delete files)`)) {
                          deleteProject(project.path);
                        }
                      }}
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ===================== ACCOUNT SECTION ===================== */}
        {activeSection === 'account' && (
          <>
            <div className="card-obsidian">
              <h1>Account</h1>
              {session ? (
                <div className="account-info">
                  <div className="account-row">
                    <span className="account-label">Name</span>
                    <span className="account-value">{session.user.name}</span>
                  </div>
                  <div className="account-row">
                    <span className="account-label">Email</span>
                    <span className="account-value">{session.user.email}</span>
                  </div>
                  <div className="account-row">
                    <span className="account-label">Tier</span>
                    <span className={`badge-${session.license?.tier === 'pro' ? 'active' : session.license?.tier === 'team' ? 'active' : 'muted'}`}>
                      {session.license?.tier?.toUpperCase() || 'FREE'}
                    </span>
                  </div>
                  {session.license?.expiresAt && (
                    <div className="account-row">
                      <span className="account-label">Expires</span>
                      <span className="account-value">{new Date(session.license.expiresAt).toLocaleDateString()}</span>
                    </div>
                  )}
                  <button className="btn-sm btn-danger" style={{ marginTop: 16 }} onClick={logout}>
                    <LogOut size={12} /> Logout
                  </button>
                </div>
              ) : (
                <div className="account-info">
                  <p style={{ color: 'var(--text-muted)', marginBottom: 12 }}>Not logged in. Using Free tier.</p>
                  <button className="btn-primary-capture" onClick={() => {
                    localStorage.removeItem('dbcanvas-session');
                    window.location.reload();
                  }}>
                    Login with DBCanvas Account
                  </button>
                </div>
              )}
            </div>

            {/* Update status */}
            <div className="card-obsidian" style={{ marginTop: 16 }}>
              <h2>Updates</h2>
              {updateStatus === 'idle' && (
                <p style={{ color: 'var(--text-muted)' }}>You are on the latest version.</p>
              )}
              {updateStatus === 'available' && (
                <div className="update-notice">
                  <Download size={16} />
                  <span>Version {updateVersion} is downloading...</span>
                </div>
              )}
              {updateStatus === 'downloaded' && (
                <div className="update-notice">
                  <RefreshCw size={16} />
                  <span>Version {updateVersion} is ready to install.</span>
                  <button className="btn-primary-capture" style={{ marginLeft: 12 }} onClick={() => {
                    (window as any).dbcanvas?.installUpdate();
                  }}>
                    Restart & Update
                  </button>
                </div>
              )}
            </div>
          </>
        )}

        {/* ===================== INSTALL MCP SECTION ===================== */}
        {activeSection === 'install' && (
          <>
            <div className="card-obsidian">
              <h1>Install DBCanvas MCP</h1>
              <p className="description">
                Connect DBCanvas to your AI IDE in seconds. Select your IDE below, copy the config, and paste it into the corresponding file.
              </p>

              {/* Quick copy of the MCP path */}
              <div className="mcp-path-box">
                <label>MCP SERVER PATH</label>
                <div className="mcp-path-row">
                  <code>{mcpPath || 'Loading...'}</code>
                  <button
                    className={`btn-sm btn-copy ${copied === 'path' ? 'copied' : ''}`}
                    onClick={() => copyToClipboard(mcpPath, setCopied, 'path')}
                    disabled={!mcpPath}
                  >
                    {copied === 'path' ? <><Check size={12} /> Copied</> : <><Copy size={12} /> Copy</>}
                  </button>
                </div>
              </div>

              <div className="install-note">
                The MCP server auto-discovers your database connection from <code>.env</code>, <code>web.config</code>, or <code>appsettings.json</code> — no need to hardcode credentials.
              </div>
            </div>

            {/* IDE Guides */}
            <div className="card-obsidian" style={{ marginTop: 16 }}>
              <h2>Configuration per IDE ({platform})</h2>
              <div className="ide-guides">
                {ideInstallGuides.map(guide => (
                  <div key={guide.name} className="guide-item">
                    <div className="guide-header" onClick={() => toggleGuide(guide.name)}>
                      {expandedGuide === guide.name ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                      <div className="guide-icon">{guide.icon}</div>
                      <div className="guide-title">
                        <span className="guide-name">{guide.name}</span>
                        <span className="guide-file" title={guide.configFile}>{guide.configFile.length > 40 ? '...' + guide.configFile.slice(-37) : guide.configFile}</span>
                      </div>
                      <button
                        className={`btn-sm btn-copy ${copied === guide.name ? 'copied' : ''}`}
                        onClick={(e) => { e.stopPropagation(); copyToClipboard(guide.configJson, setCopied, guide.name); }}
                      >
                        {copied === guide.name ? <><Check size={12} /> Copied</> : <><Copy size={12} /> Copy</>}
                      </button>
                    </div>
                    {expandedGuide === guide.name && (
                      <div className="guide-body">
                        <p className="guide-desc">{guide.description}</p>
                        <div className="guide-steps">
                          <div className="step">
                            <span className="step-num">1</span>
                            <span>Open <code>{guide.configFile}</code></span>
                          </div>
                          <div className="step">
                            <span className="step-num">2</span>
                            <span>Add the following JSON (merge into existing <code>mcpServers</code> if present):</span>
                          </div>
                        </div>
                        <div style={{ position: 'relative' }}>
                          <pre className="guide-code">{guide.configJson}</pre>
                          <button
                             style={{ position: 'absolute', top: 8, right: 8, background: 'rgba(255,255,255,0.05)', border: 'none', borderRadius: 4, padding: 4, cursor: 'pointer', color: 'var(--text-muted)' }}
                             onClick={() => copyToClipboard(guide.configJson, setCopied, guide.name)}
                          >
                            <Copy size={14} />
                          </button>
                        </div>
                        <div className="step">
                          <span className="step-num">3</span>
                          <span>Restart the IDE to activate DBCanvas</span>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </>
        )}

        {/* ===================== AUTO-REGISTER SECTION ===================== */}
        {activeSection === 'auto' && (
          <div className="card-obsidian">
            <h1>Auto-Register</h1>
            <p className="description">
              Automatically detect and register DBCanvas in all installed IDEs.
            </p>

            {ideMessage && (
              <div className="ide-message"><Check size={14} /> {ideMessage}</div>
            )}

            <div className="ide-actions">
              <button className="btn-primary-capture" onClick={registerAllIdes}>
                Register in All Detected IDEs
              </button>
            </div>

            <div className="ide-list">
              {ides.map(ide => (
                <div key={ide.configPath} className="ide-row">
                  <div className="ide-info">
                    <div className="ide-name">
                      {ide.exists ? <Database size={14} /> : <AlertCircle size={14} style={{ opacity: 0.3 }} />}
                      <span>{ide.name}</span>
                    </div>
                    <code className="ide-path">{ide.configPath}</code>
                  </div>
                  <div className="ide-status">
                    {!ide.exists ? (
                      <span className="badge-muted">Not Installed</span>
                    ) : ide.registered ? (
                      <>
                        <span className="badge-active">Active</span>
                        <button className="btn-sm btn-danger" onClick={() => unregisterIde(ide.configPath)}>Remove</button>
                      </>
                    ) : (
                      <button className="btn-sm btn-primary" onClick={() => registerIde(ide.configPath)}>Register</button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ===================== THEME SECTION ===================== */}
        {activeSection === 'theme' && (
          <div className="card-obsidian">
            <h2>Appearance</h2>
            <div className="ide-row" style={{ cursor: 'pointer' }} onClick={toggleTheme}>
              <div className="ide-info">
                <div className="ide-name">
                  {theme === 'dark' ? <Moon size={14} /> : <Sun size={14} />}
                  <span>Theme: {theme === 'dark' ? 'Dark' : 'Light'}</span>
                </div>
              </div>
              <button className="btn-sm btn-primary" onClick={toggleTheme}>Toggle</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default SettingsView;
