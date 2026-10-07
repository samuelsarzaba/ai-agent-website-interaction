import { createRoot } from 'react-dom/client';
import AgentPanel from './AgentPanel.jsx';
import Shop from './Shop.jsx';
import './styles.css';

createRoot(document.getElementById('root')).render(
  <div className="grid h-full lg:grid-cols-[1fr_360px_440px] [&>*]:min-h-0 [&>*]:overflow-auto">
    <div className="px-6">
      <Shop />
    </div>
    <AgentPanel />
  </div>,
);
