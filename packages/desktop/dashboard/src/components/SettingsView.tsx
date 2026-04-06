import React, { useEffect, useState } from 'react';
import { Database, Check, AlertCircle, Sun, Moon, Copy, Terminal, ChevronDown, ChevronRight, User, LogOut, Download, RefreshCw } from 'lucide-react';
import { useStore } from '../store/useStore';
import { isElectron } from '../api';

// The canonical MCP server path
const MCP_SERVER_PATH = '/Users/xmn/Desarrollos/PlugginSQLAgent/packages/mcp-server/build/index.js';

interface IdeInstallInfo {
  name: string;
  icon: string;
  configFile: string;
  configJson: string;
  description: string;
}

const ideInstallGuides: IdeInstallInfo[] = [
  {
    name: 'Claude Desktop',
    icon: 'C',
    configFile: '~/Library/Application Support/Claude/claude_desktop_config.json',
    configJson: JSON.stringify({
      mcpServers: {
        dbcanvas: {
          command: 'node',
          args: [MCP_SERVER_PATH],
        },
      },
    }, null, 2),
    description: 'Add to your claude_desktop_config.json (merge with existing mcpServers)',
  },
  {
    name: 'Claude Code (CLI)',
    icon: '>',
    configFile: '~/.claude/claude_desktop_config.json',
    configJson: JSON.stringify({
      mcpServers: {
        dbcanvas: {
          command: 'node',
          args: [MCP_SERVER_PATH],
        },
      },
    }, null, 2),
    description: 'Add to your Claude Code config file',
  },
  {
    name: 'Cursor',
    icon: '{',
    configFile: '~/.cursor/mcp.json',
    configJson: JSON.stringify({
      mcpServers: {
        dbcanvas: {
          command: 'node',
          args: [MCP_SERVER_PATH],
        },
      },
    }, null, 2),
    description: 'Add to your Cursor MCP config',
  },
  {
    name: 'Windsurf',
    icon: 'W',
    configFile: '~/.windsurf/mcp.json',
    configJson: JSON.stringify({
      mcpServers: {
        dbcanvas: {
          command: 'node',
          args: [MCP_SERVER_PATH],
        },
      },
    }, null, 2),
    description: 'Add to your Windsurf MCP config',
  },
  {
    name: 'Antigravity',
    icon: 'A',
    configFile: '~/.antigravity/mcp.json',
    configJson: JSON.stringify({
      mcpServers: {
        dbcanvas: {
          command: 'node',
          args: [MCP_SERVER_PATH],
        },
      },
    }, null, 2),
    description: 'Create or add to your Antigravity MCP config',
  },
  {
    name: 'VS Code (Copilot)',
    icon: 'V',
    configFile: '~/.vscode/mcp.json',
    configJson: JSON.stringify({
      mcpServers: {
        dbcanvas: {
          command: 'node',
          args: [MCP_SERVER_PATH],
        },
      },
    }, null, 2),
    description: 'Add to your VS Code MCP config (requires Copilot MCP extension)',
  },
  {
    name: 'Codex (OpenAI)',
    icon: 'O',
    configFile: '~/.codex/mcp.json',
    configJson: JSON.stringify({
      mcpServers: {
        dbcanvas: {
          command: 'node',
          args: [MCP_SERVER_PATH],
        },
      },
    }, null, 2),
    description: 'Add to your Codex MCP config',
  },
];

function copyToClipboard(text: string, setCopied: (id: string) => void, id: string) {
  navigator.clipboard.writeText(text).then(() => {
    setCopied(id);
    setTimeout(() => setCopied(''), 2000);
  });
}

const SettingsView: React.FC = () => {
  const {
    ides, ideMessage, theme, session, updateStatus, updateVersion,
    loadIdes, registerIde, unregisterIde, registerAllIdes, toggleTheme, logout,
  } = useStore();
  const [copied, setCopied] = useState('');
  const [expandedGuide, setExpandedGuide] = useState<string | null>(null);
  const [activeSection, setActiveSection] = useState<'account' | 'install' | 'auto' | 'theme'>(isElectron ? 'account' : 'install');

  useEffect(() => { loadIdes(); }, []);

  const toggleGuide = (name: string) => {
    setExpandedGuide(expandedGuide === name ? null : name);
  };

  return (
    <div className="detail-central-view slide-up">
      <div className="detail-header-tabs">
        {isElectron && (
          <button className={`tab ${activeSection === 'account' ? 'active' : ''}`} onClick={() => setActiveSection('account')}>
            <User size={12} />
            <span style={{ marginLeft: 6 }}>ACCOUNT</span>
          </button>
        )}
        <button className={`tab ${activeSection === 'install' ? 'active' : ''}`} onClick={() => setActiveSection('install')}>
          <Terminal size={12} />
          <span style={{ marginLeft: 6 }}>INSTALL MCP</span>
        </button>
        {isElectron && (
          <button className={`tab ${activeSection === 'auto' ? 'active' : ''}`} onClick={() => setActiveSection('auto')}>
            <Database size={12} />
            <span style={{ marginLeft: 6 }}>AUTO-REGISTER</span>
          </button>
        )}
        <button className={`tab ${activeSection === 'theme' ? 'active' : ''}`} onClick={() => setActiveSection('theme')}>
          {theme === 'dark' ? <Sun size={12} /> : <Moon size={12} />}
          <span style={{ marginLeft: 6 }}>THEME</span>
        </button>
      </div>

      <div className="detail-body">
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
                  <code>{MCP_SERVER_PATH}</code>
                  <button
                    className={`btn-sm btn-copy ${copied === 'path' ? 'copied' : ''}`}
                    onClick={() => copyToClipboard(MCP_SERVER_PATH, setCopied, 'path')}
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
              <h2>Configuration per IDE</h2>
              <div className="ide-guides">
                {ideInstallGuides.map(guide => (
                  <div key={guide.name} className="guide-item">
                    <div className="guide-header" onClick={() => toggleGuide(guide.name)}>
                      {expandedGuide === guide.name ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                      <div className="guide-icon">{guide.icon}</div>
                      <div className="guide-title">
                        <span className="guide-name">{guide.name}</span>
                        <span className="guide-file">{guide.configFile}</span>
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
                        <pre className="guide-code">{guide.configJson}</pre>
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
