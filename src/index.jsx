import { createRoot } from 'react-dom/client';
import './styles/index.css';
import App from './App.jsx';  // Added .js extension
const root = createRoot(document.getElementById('root'));
root.render(<App />);