import fs from 'fs';

function checkVersion(pkgName) {
    try {
        const pkgPath = `c:/Users/fausb/Downloads/Control de entrada/node_modules/${pkgName}/package.json`;
        const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
        console.log(`${pkgName} version: ${pkg.version}`);
    } catch(e) {
        console.log(`Could not read ${pkgName} package.json`);
    }
}

checkVersion('react');
checkVersion('react-dom');
