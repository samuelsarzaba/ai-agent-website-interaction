import { createRoot } from 'react-dom/client';
import AgentPanel from './AgentPanel.jsx';
import Shop from './Shop.jsx';
import './styles.css';

createRoot(document.getElementById('root')).render(
  <div className="layout">
    <div className="shop">
      <Shop />
    </div>
    <AgentPanel />
  </div>,
);
