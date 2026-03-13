/**
 * Script para generar hash bcrypt de una contraseña
 * 
 * USO:
 *   node generar-hash.js "miContraseña"
 * 
 * EJEMPLO:
 *   node generar-hash.js "perro456"
 * 
 * El script generará un hash que puedes copiar y pegar en Firebase Console.
 */

import bcrypt from 'bcrypt';
/* global process */

// Obtener la contraseña del argumento de línea de comandos
const password = process.argv[2];

if (!password) {
    console.error('\n❌ ERROR: Debes proporcionar una contraseña como argumento.\n');
    console.log('USO:');
    console.log('  node generar-hash.js "tuContraseña"\n');
    console.log('EJEMPLO:');
    console.log('  node generar-hash.js "perro456"\n');
    process.exit(1);
}

// Número de rondas de salt (10 es un buen balance entre seguridad y velocidad)
const saltRounds = 10;

console.log('\n🔐 Generando hash bcrypt...\n');
console.log(`Contraseña: "${password}"`);
console.log(`Salt rounds: ${saltRounds}\n`);

// Generar el hash
bcrypt.hash(password, saltRounds, (err, hash) => {
    if (err) {
        console.error('❌ Error generando hash:', err);
        process.exit(1);
    }

    console.log('✅ Hash generado exitosamente:\n');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(hash);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    console.log('📋 INSTRUCCIONES PARA ACTUALIZAR EN FIRESTORE:\n');
    console.log('1. Ve a Firebase Console: https://console.firebase.google.com');
    console.log('2. Selecciona tu proyecto: attendance-pwa-dev');
    console.log('3. Ve a Firestore Database');
    console.log('4. Navega a: settings → config');
    console.log('5. Edita el campo "adminPassword"');
    console.log('6. Pega el hash de arriba (todo el texto entre las líneas)');
    console.log('7. Guarda los cambios\n');

    console.log('⚠️  IMPORTANTE:');
    console.log('   - Copia TODO el hash, incluyendo el "$2b$10$" del inicio');
    console.log('   - NO agregues espacios ni saltos de línea');
    console.log('   - Verifica que se guardó correctamente antes de cerrar\n');
});
