import React from 'react';
import { Zap } from 'lucide-react';
import { useStore } from '../store/useStore';

const NotificationToast: React.FC = () => {
  const { lastSignal } = useStore();

  if (!lastSignal) return null;

  return (
    <div className="bridge-toast">
      <div className="toast-icon"><Zap size={16} /></div>
      <div className="toast-content">
        <div className="toast-title">MCP Signal</div>
        <div className="toast-desc">{lastSignal.type}: {lastSignal.name}</div>
      </div>
    </div>
  );
};

export default NotificationToast;
