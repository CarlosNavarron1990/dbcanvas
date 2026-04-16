import React, { useState, useEffect } from 'react';
import { Save, Loader2, CheckCircle, AlertCircle, Server, X } from 'lucide-react';

interface ConnectionWizardProps {
  projectPath: string;
  onClose: () => void;
  onSuccess: () => void;
}

const ConnectionWizard: React.FC<ConnectionWizardProps> = ({ projectPath, onClose, onSuccess }) => {
  const [formData, setFormData] = useState({
    client: 'mssql',
    server: '',
    port: '',
    database: '',
    user: '',
    password: '',
    options: {
      encrypt: false,
      trustServerCertificate: true,
    }
  });

  const [testing, setTesting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    // Attempt to load existing if any
    fetch(`/api/project/connection?projectPath=${encodeURIComponent(projectPath)}`)
      .then(r => r.json())
      .then(data => {
        if (data && !data.error) {
          setFormData(prev => ({ ...prev, ...data }));
        }
      })
      .catch(() => {});
  }, [projectPath]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target as HTMLInputElement;
    if (type === 'checkbox') {
      const checked = (e.target as HTMLInputElement).checked;
      setFormData(prev => ({
        ...prev,
        options: {
          ...prev.options,
          [name]: checked
        }
      }));
    } else {
      setFormData(prev => ({ ...prev, [name]: value }));
    }
  };

  const handleSaveAndTest = async () => {
    setTesting(true);
    setError(null);
    setSuccess(null);
    
    try {
      const payload = {
        projectPath,
        connectionData: {
          client: formData.client,
          server: formData.server,
          port: formData.port ? parseInt(formData.port) : undefined,
          database: formData.database,
          user: formData.user,
          password: formData.password,
          options: formData.options
        }
      };

      const res = await fetch('/api/project/connection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      
      const data = await res.json();
      
      if (!res.ok) throw new Error(data.error || 'Failed to save configuration');
      
      if (data.testResult && !data.testResult.success) {
        throw new Error(data.testResult.message + (data.testResult.details ? `\n${data.testResult.details}` : ''));
      }
      
      setSuccess('Connection established successfully!');
      setTimeout(() => {
        onSuccess();
      }, 1500);
      
    } catch (err: any) {
      setError(err.message);
    } finally {
      setTesting(false);
    }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.7)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(4px)' }}>
      <div className="card-obsidian slide-up" style={{ width: 500, maxWidth: '90vw', padding: 24, position: 'relative' }}>
        <button 
          className="btn-icon-only" 
          onClick={onClose} 
          style={{ position: 'absolute', top: 12, right: 12, outline: 'none' }}
        >
          <X size={18} />
        </button>
        
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8, color: 'var(--accent)' }}>
          <Server size={24} />
          <h1 style={{ margin: 0 }}>Connection Wizard</h1>
        </div>
        
        <p className="description" style={{ marginBottom: 20 }}>
          Configure your database connection. These credentials will be stored safely in `.dbcanvas/connection.json` without facing special character issues.
        </p>

        <form onSubmit={(e) => { e.preventDefault(); handleSaveAndTest(); }}>
          
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', fontSize: 12, marginBottom: 4, color: 'rgba(255,255,255,0.7)' }}>Driver / Engine</label>
            <select name="client" className="input-dark" value={formData.client} onChange={handleChange} required>
              <option value="mssql">SQL Server (MSSQL)</option>
              <option value="pg">PostgreSQL</option>
            </select>
          </div>

          <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
            <div style={{ flex: 3 }}>
              <label style={{ display: 'block', fontSize: 12, marginBottom: 4, color: 'rgba(255,255,255,0.7)' }}>Host / Server</label>
              <input type="text" name="server" className="input-dark" value={formData.server} onChange={handleChange} placeholder="localhost or 192.168.x.x" required />
            </div>
            <div style={{ flex: 1 }}>
              <label style={{ display: 'block', fontSize: 12, marginBottom: 4, color: 'rgba(255,255,255,0.7)' }}>Port (optional)</label>
              <input type="number" name="port" className="input-dark" value={formData.port} onChange={handleChange} placeholder={formData.client === 'mssql' ? '1433' : '5432'} />
            </div>
          </div>

          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', fontSize: 12, marginBottom: 4, color: 'rgba(255,255,255,0.7)' }}>Database Name</label>
            <input type="text" name="database" className="input-dark" value={formData.database} onChange={handleChange} placeholder="MyDatabase" required />
          </div>

          <div style={{ display: 'flex', gap: 12, marginBottom: 20 }}>
             <div style={{ flex: 1 }}>
               <label style={{ display: 'block', fontSize: 12, marginBottom: 4, color: 'rgba(255,255,255,0.7)' }}>Username</label>
               <input type="text" name="user" className="input-dark" value={formData.user} onChange={handleChange} required />
             </div>
             <div style={{ flex: 1 }}>
               <label style={{ display: 'block', fontSize: 12, marginBottom: 4, color: 'rgba(255,255,255,0.7)' }}>Password</label>
               <input type="password" name="password" className="input-dark" value={formData.password} onChange={handleChange} required />
             </div>
          </div>

          {formData.client === 'mssql' && (
             <div style={{ marginBottom: 24, display: 'flex', gap: 20 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer' }}>
                  <input type="checkbox" name="encrypt" checked={formData.options.encrypt} onChange={handleChange} />
                  Encrypt Connection
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer' }}>
                  <input type="checkbox" name="trustServerCertificate" checked={formData.options.trustServerCertificate} onChange={handleChange} />
                  Trust Server Certificate
                </label>
             </div>
          )}

          {error && (
            <div style={{ padding: 12, borderRadius: 6, backgroundColor: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.2)', color: '#ef4444', marginBottom: 16, fontSize: 13, whiteSpace: 'pre-wrap' }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 4 }}><AlertCircle size={14} /> <strong>Connection Error</strong></div>
              {error}
            </div>
          )}

          {success && (
            <div style={{ padding: 12, borderRadius: 6, backgroundColor: 'rgba(34, 197, 94, 0.1)', border: '1px solid rgba(34, 197, 94, 0.2)', color: '#22c55e', marginBottom: 16, fontSize: 13 }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}><CheckCircle size={14} /> {success}</div>
            </div>
          )}

          <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
            <button type="button" className="btn-secondary" onClick={onClose} disabled={testing}>Cancel</button>
            <button type="submit" className="btn-primary-capture" disabled={testing}>
              {testing ? <><Loader2 className="spin" size={16} /> Testing...</> : <><Save size={16} /> Save & Test</>}
            </button>
          </div>
        </form>

      </div>
    </div>
  );
};

export default ConnectionWizard;
