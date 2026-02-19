// scripts/generateLicense.js
/*
  USO:
  node scripts/generateLicense.js <ClienteID> <FechaExpiracion YYYY-MM-DD>
  
  Ejemplo:
  node scripts/generateLicense.js cliente_001 2026-12-31
*/

// simulamos require de crypto-js si no soporta import
import CryptoJS from 'crypto-js';

// CLAVE MAESTRA (¡NO COMPARTIR!)
// Esta misma clave debe estar en licenseService.js para poder leerlo.
const SECRET_KEY = "S3cr3t_K3y_M4st3r_P4r4_L1c3nc14s_V1";

const args = process.argv.slice(2);

if (args.length < 2) {
    console.error("❌ Uso: node scripts/generateLicense.js <ClienteID> <YYYY-MM-DD>");
    process.exit(1);
}

const [clientId, expirationDate] = args;

const payload = {
    c: clientId,           // c = client
    e: expirationDate,     // e = expires
    t: new Date().toISOString() // t = created at
};

// Encriptamos el objeto JSON
const ciphertext = CryptoJS.AES.encrypt(JSON.stringify(payload), SECRET_KEY).toString();

console.log("\n✅ Licencia Generada Exitosamente:\n");
console.log(ciphertext);
console.log("\n📋 Copia la cadena de arriba y guárdala en Firebase en: settings/license -> token\n");
