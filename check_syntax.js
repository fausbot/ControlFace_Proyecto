import fs from 'fs';
import { transformSync } from './node_modules/esbuild/lib/main.js';

function check(file) {
  try {
    transformSync(fs.readFileSync(file, 'utf8'), { loader: 'jsx' });
    console.log(file, 'Syntax OK');
  } catch(e) {
    console.error(file, 'Syntax ERROR:', e.message);
  }
}

check('c:/Users/fausb/Downloads/Control de entrada/src/components/dashboard/SyncManager.jsx');
check('c:/Users/fausb/Downloads/Control de entrada/src/pages/RutaDashboard.jsx');
check('c:/Users/fausb/Downloads/Control de entrada/src/pages/Datos.jsx');
