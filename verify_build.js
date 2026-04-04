import { build } from 'vite';

async function verifyBuild() {
  try {
    const res = await build({
      root: 'c:/Users/fausb/Downloads/Control de entrada',
      build: {
        outDir: 'dist-test',
        emptyOutDir: true,
      },
      logLevel: 'error'
    });
    console.log("Vite build passed!");
  } catch (e) {
    console.log("Vite build failed!");
    console.error(e);
  }
}

verifyBuild();
