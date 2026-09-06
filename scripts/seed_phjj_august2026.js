// scripts/seed_phjj_august2026.js
/**
 * Script de siembra de datos de prueba para PROPIEDAD HORIZONTAL JJ (attendance-pwa-dev)
 * Genera datos completos para 10 empleados con perfiles diferenciados para todo Agosto de 2026:
 * - Empleados con horas extras
 * - Empleados con déficit
 * - Turnos nocturnos (recargo 35%)
 * - Turnos dominicales y festivos (recargo 75% y 110%)
 * - Visitas de ruta (1 a 5 por día) con desplazamientos variables
 * - Almuerzos de 60 mins
 * Utiliza la API REST de Firestore con el token de sesión de Firebase CLI (permisos de Administrador).
 */

import fs from 'fs';
import path from 'path';
import os from 'os';

const PROJECT_ID = "attendance-pwa-dev";

// ── 1. Obtener Token de Acceso de Administrador ─────────────────────────────
function getAccessToken() {
    const configPath = path.join(os.homedir(), '.config', 'configstore', 'firebase-tools.json');
    if (!fs.existsSync(configPath)) {
        throw new Error(`No se encontró el archivo de credenciales de Firebase CLI en: ${configPath}`);
    }
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    const token = config.tokens?.access_token;
    if (!token) {
        throw new Error("No hay un token de acceso activo en Firebase CLI. Ejecuta 'firebase login'.");
    }
    return token;
}

// ── 2. Convertir JSON plano a formato de campos de Firestore REST API ────────
function jsonToFirestoreFields(obj) {
    const fields = {};
    for (const [key, val] of Object.entries(obj)) {
        if (val === undefined) continue;
        if (val === null) {
            fields[key] = { nullValue: null };
        } else if (typeof val === 'string') {
            fields[key] = { stringValue: val };
        } else if (typeof val === 'boolean') {
            fields[key] = { booleanValue: val };
        } else if (typeof val === 'number') {
            if (Number.isInteger(val)) {
                fields[key] = { integerValue: String(val) };
            } else {
                fields[key] = { doubleValue: val };
            }
        } else if (val instanceof Date) {
            fields[key] = { timestampValue: val.toISOString() };
        }
    }
    return fields;
}

// ── 3. Gestor de Lotes vía REST API (:commit) ───────────────────────────────
class FirestoreBatchCommitter {
    constructor(projectId, token) {
        this.projectId = projectId;
        this.token = token;
        this.writes = [];
        this.totalCommitted = 0;
    }

    async addWrite(collectionName, docId, data) {
        const fullDocName = `projects/${this.projectId}/databases/(default)/documents/${collectionName}/${docId}`;
        this.writes.push({
            update: {
                name: fullDocName,
                fields: jsonToFirestoreFields(data)
            }
        });

        if (this.writes.length >= 350) {
            await this.commit();
        }
    }

    async commit() {
        if (this.writes.length === 0) return;
        const currentWrites = this.writes;
        this.writes = [];

        const url = `https://firestore.googleapis.com/v1/projects/${this.projectId}/databases/(default)/documents:commit`;
        const res = await fetch(url, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${this.token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ writes: currentWrites })
        });

        if (!res.ok) {
            const errText = await res.text();
            throw new Error(`Error en commit de Firestore (${res.status}): ${errText}`);
        }

        this.totalCommitted += currentWrites.length;
        console.log(`   📦 Lote de ${currentWrites.length} documentos guardado en Firestore. (Total: ${this.totalCommitted})`);
    }
}

// ── 4. Los 10 Colaboradores con Perfiles Estadísticos ────────────────────────
const EMPLOYEES = [
    {
        email: "carlos.mendoza@phjj.com",
        firstName: "Carlos",
        lastName: "Mendoza",
        nombre: "Carlos Mendoza",
        documentoIdentidad: "1018452390",
        cargo: "Técnico Líder de Mantenimiento",
        departamento: "Mantenimiento y Operaciones",
        profile: "overtime_high" // Gran acumulador de extras (+35h), labora sábados y el festivo 7 de agosto, 3-4 visitas/día
    },
    {
        email: "andres.gomez@phjj.com",
        firstName: "Andrés Felipe",
        lastName: "Gómez",
        nombre: "Andrés Felipe Gómez",
        documentoIdentidad: "1024589632",
        cargo: "Supervisor de Operaciones",
        departamento: "Operaciones",
        profile: "overtime_moderate" // Horas extras moderadas (+15h), 2-3 visitas/día
    },
    {
        email: "mateo.restrepo@phjj.com",
        firstName: "Mateo",
        lastName: "Restrepo",
        nombre: "Mateo Restrepo",
        documentoIdentidad: "1032478951",
        cargo: "Vigilante Nocturno",
        departamento: "Seguridad",
        profile: "night_shift" // Turno nocturno 19:00 a 03:30 (madrugada), genera masa de Nocturnas 35% y Festivas Nocturnas 110%
    },
    {
        email: "diego.castro@phjj.com",
        firstName: "Diego Fernando",
        lastName: "Castro",
        nombre: "Diego Fernando Castro",
        documentoIdentidad: "1015698421",
        cargo: "Técnico de Urgencias",
        departamento: "Mantenimiento",
        profile: "mixed_evening" // Turno mixto tarde-noche 14:00 a 22:30 (diurno + nocturno ordinario)
    },
    {
        email: "camilo.rojas@phjj.com",
        firstName: "Camilo Andrés",
        lastName: "Rojas",
        nombre: "Camilo Andrés Rojas",
        documentoIdentidad: "1028741236",
        cargo: "Técnico Express en Moto",
        departamento: "Operaciones en Ruta",
        profile: "route_efficient" // 4-5 visitas diarias, traslados muy cortos (alta eficiencia de ruta > 2.5 vis/h)
    },
    {
        email: "juan.silva@phjj.com",
        firstName: "Juan Pablo",
        lastName: "Silva",
        nombre: "Juan Pablo Silva",
        documentoIdentidad: "1019852147",
        cargo: "Inspector de Zonas Distantes",
        departamento: "Inspecciones",
        profile: "route_slow" // 1-2 visitas diarias pero 3h-4h de viaje en carretera (mucho tiempo en ruta)
    },
    {
        email: "valentina.diaz@phjj.com",
        firstName: "Valentina",
        lastName: "Díaz",
        nombre: "Valentina Díaz",
        documentoIdentidad: "1033654128",
        cargo: "Recepción y Monitoreo",
        departamento: "Administración",
        profile: "standard_exact" // L-V 08:00 a 17:00 (1h almuerzo), cumple exacto la base del periodo
    },
    {
        email: "daniela.ospina@phjj.com",
        firstName: "Daniela",
        lastName: "Ospina",
        nombre: "Daniela Ospina",
        documentoIdentidad: "1025896314",
        cargo: "Supervisora de Fin de Semana",
        departamento: "Operaciones",
        profile: "sunday_holiday" // Trabaja sábados, domingos y festivos (17 agosto), genera recargo 75% Dominical Diurna
    },
    {
        email: "santiago.morales@phjj.com",
        firstName: "Santiago",
        lastName: "Morales",
        nombre: "Santiago Morales",
        documentoIdentidad: "1014785236",
        cargo: "Auxiliar Operativo",
        departamento: "Mantenimiento",
        profile: "deficit_moderate" // Faltó 3 días y salía temprano, déficit de ~25h bajo la meta
    },
    {
        email: "sofia.ramirez@phjj.com",
        firstName: "Sofía",
        lastName: "Ramírez",
        nombre: "Sofía Ramírez",
        documentoIdentidad: "1036985214",
        cargo: "Operaria de Mantenimiento",
        departamento: "Mantenimiento",
        profile: "deficit_high" // Incapacidad médica, solo laboró 9 días en el mes, fondo del ranking (-70h)
    }
];

// Lugares reales de la copropiedad para visitas
const LOCALIDADES = [
    "Torre 1 - Apto 302",
    "Torre 1 - Cuarto de Bombas",
    "Torre 2 - Apto 504",
    "Torre 2 - Cubierta y Tanques",
    "Torre 3 - Apto 201",
    "Torre 3 - Subestación Eléctrica",
    "Plataforma Comercial - Local 12",
    "Portería y Control de Acceso Principal",
    "Zona Húmeda y Piscina",
    "Salón Comunal y Gimnasio",
    "Parqueadero Sótano 1 - Zona de Basuras",
    "Parqueadero Sótano 2 - Planta de Emergencia"
];

const DUMMY_PHOTO_URL = "https://ui-avatars.com/api/?background=2563eb&color=fff&size=128&name=";

const pad = (n) => String(n).padStart(2, '0');

function getDaySchedule(profile, day, dayOfWeek, isHoliday) {
    const isSunday = dayOfWeek === 0;

    switch (profile) {
        case "overtime_high": // Carlos Mendoza
            if (isSunday && day !== 9) return null;
            if (isHoliday && day === 17) return null;
            return {
                inH: 7, inM: 30,
                outH: 18, outM: 30,
                visitsCount: 4
            };

        case "overtime_moderate": // Andrés Felipe Gómez
            if (isSunday || isHoliday) return null;
            if (dayOfWeek === 6 && day > 15) return null;
            return {
                inH: 8, inM: 0,
                outH: 17, outM: 45,
                visitsCount: 3
            };

        case "night_shift": // Mateo Restrepo
            if (dayOfWeek === 1 || dayOfWeek === 2) return null;
            return {
                inH: 19, inM: 0,
                outH: 3, outM: 30,
                isNextDayExit: true,
                visitsCount: 2
            };

        case "mixed_evening": // Diego Fernando Castro
            if (isSunday || isHoliday || dayOfWeek === 6) return null;
            return {
                inH: 14, inM: 0,
                outH: 22, outM: 30,
                visitsCount: 3
            };

        case "route_efficient": // Camilo Andrés Rojas
            if (isSunday || isHoliday || dayOfWeek === 6) return null;
            return {
                inH: 7, inM: 30,
                outH: 16, outM: 45,
                visitsCount: 5,
                routeStyle: "fast"
            };

        case "route_slow": // Juan Pablo Silva
            if (isSunday || isHoliday || dayOfWeek === 6) return null;
            return {
                inH: 8, inM: 0,
                outH: 17, outM: 0,
                visitsCount: 2,
                routeStyle: "slow"
            };

        case "standard_exact": // Valentina Díaz
            if (isSunday || isHoliday || dayOfWeek === 6) return null;
            return {
                inH: 8, inM: 0,
                outH: 17, outM: 0,
                visitsCount: 0
            };

        case "sunday_holiday": // Daniela Ospina
            const isWeekendOrHoliday = dayOfWeek === 0 || dayOfWeek === 6 || isHoliday || dayOfWeek === 5;
            if (!isWeekendOrHoliday) return null;
            return {
                inH: 8, inM: 30,
                outH: 17, outM: 30,
                visitsCount: 3
            };

        case "deficit_moderate": // Santiago Morales
            if (isSunday || isHoliday || dayOfWeek === 6) return null;
            if (day >= 10 && day <= 12) return null;
            return {
                inH: 8, inM: 30,
                outH: 15, outM: 30,
                visitsCount: 2
            };

        case "deficit_high": // Sofía Ramírez
            if (day < 20) return null;
            if (isSunday || isHoliday || dayOfWeek === 6) return null;
            return {
                inH: 8, inM: 0,
                outH: 16, outM: 30,
                visitsCount: 1,
                comentario: "Reintegro de incapacidad médica EPS"
            };

        default:
            return null;
    }
}

// ── 5. Ejecución Principal de Siembra ────────────────────────────────────────
async function main() {
    console.log("===============================================================");
    console.log("🚀 INICIANDO SIEMBRA DE DATOS: PROPIEDAD HORIZONTAL JJ");
    console.log(`   Proyecto Firebase: ${PROJECT_ID}`);
    console.log("   Periodo Objetivo: 01 de Agosto al 31 de Agosto de 2026");
    console.log("===============================================================\n");

    const token = getAccessToken();
    const committer = new FirestoreBatchCommitter(PROJECT_ID, token);

    // ── Paso A: Guardar 10 Empleados en `employees` ──────────────────────────
    console.log("👤 [1/3] Registrando 10 colaboradores en la colección 'employees'...");
    for (const emp of EMPLOYEES) {
        const safeDocId = emp.email.replace(/[@.]/g, '-');
        await committer.addWrite("employees", safeDocId, {
            email: emp.email,
            firstName: emp.firstName,
            lastName: emp.lastName,
            nombre: emp.nombre,
            documentoIdentidad: emp.documentoIdentidad,
            cedula: emp.documentoIdentidad,
            cargo: emp.cargo,
            departamento: emp.departamento,
            estado: "activo",
            aceptaPoliticaDatos: true,
            fechaAceptacionPolitica: "2026-07-28T10:00:00.000Z",
            fotoUrl: `${DUMMY_PHOTO_URL}${encodeURIComponent(emp.nombre)}`,
            fechaCreacion: new Date(2026, 6, 25, 8, 0, 0)
        });
    }
    console.log("   ✅ 10 Colaboradores registrados con éxito.\n");

    // ── Paso B: Generar Asistencias y Visitas de Agosto 2026 ─────────────────
    console.log("📅 [2/3] Generando turnos de asistencia y visitas de Agosto 2026...");

    const YEAR = 2026;
    const MONTH = 7; // Agosto (0-indexed en JS Date)
    const DAYS_IN_AUGUST = 31;
    const HOLIDAYS_AUGUST = [7, 17]; // Viernes 7 (Boyacá), Lunes 17 (Asunción)

    let totalTurnosCreados = 0;
    let totalVisitasCreadas = 0;

    for (const emp of EMPLOYEES) {
        const safeEmail = emp.email.replace(/[@.]/g, '-');
        const encodedName = encodeURIComponent(emp.nombre);

        for (let day = 1; day <= DAYS_IN_AUGUST; day++) {
            const dateObj = new Date(YEAR, MONTH, day);
            const dayOfWeek = dateObj.getDay();
            const isHoliday = HOLIDAYS_AUGUST.includes(day);

            const schedule = getDaySchedule(emp.profile, day, dayOfWeek, isHoliday);
            if (!schedule) continue;

            const fStr = `${pad(day)}/${pad(MONTH + 1)}/${YEAR}`;
            const safeFecha = fStr.replace(/\//g, '-');

            // 1. Marca de ENTRADA
            const inHora = `${pad(schedule.inH)}:${pad(schedule.inM)}:00`;
            const safeInHora = inHora.replace(/:/g, '-');
            const inDate = new Date(YEAR, MONTH, day, schedule.inH, schedule.inM, 0);
            const inDocId = `${safeEmail}_${safeFecha}_${safeInHora}`;

            const entryData = {
                usuario: emp.email,
                nombre: emp.nombre,
                tipo: "Entrada",
                fecha: fStr,
                hora: inHora,
                localidad: "Sede Principal PH JJ - Portería",
                latitud: 4.60971,
                longitud: -74.08175,
                timestamp: inDate,
                fotoURL: `${DUMMY_PHOTO_URL}${encodedName}`
            };
            if (schedule.comentario) {
                entryData.comentarioAdmin = schedule.comentario;
            }

            await committer.addWrite("attendance", inDocId, entryData);

            // 2. Marca de SALIDA
            let outDay = day;
            let outMonth = MONTH;
            if (schedule.isNextDayExit) {
                outDay = day + 1;
            }
            const outDate = new Date(YEAR, outMonth, outDay, schedule.outH, schedule.outM, 0);
            const outFStr = `${pad(outDay)}/${pad(outMonth + 1)}/${YEAR}`;
            const safeOutFecha = outFStr.replace(/\//g, '-');
            const outHora = `${pad(schedule.outH)}:${pad(schedule.outM)}:00`;
            const safeOutHora = outHora.replace(/:/g, '-');
            const outDocId = `${safeEmail}_${safeOutFecha}_${safeOutHora}`;

            const exitData = {
                usuario: emp.email,
                nombre: emp.nombre,
                tipo: "Salida",
                fecha: outFStr,
                hora: outHora,
                localidad: "Sede Principal PH JJ - Portería",
                latitud: 4.60971,
                longitud: -74.08175,
                timestamp: outDate,
                fotoURL: `${DUMMY_PHOTO_URL}${encodedName}`
            };

            await committer.addWrite("attendance", outDocId, exitData);
            totalTurnosCreados++;

            // 3. Generar VISITAS si el colaborador tiene asignadas
            if (schedule.visitsCount > 0 && !schedule.isNextDayExit) {
                const duracionVisitaMins = schedule.routeStyle === "fast" ? 35 : (schedule.routeStyle === "slow" ? 75 : 45);
                let currentH = schedule.inH + 1;
                let currentM = 15;

                for (let v = 0; v < schedule.visitsCount; v++) {
                    const localidad = LOCALIDADES[(day + v + emp.documentoIdentidad.length) % LOCALIDADES.length];

                    // Hora Llegada
                    const llegadaH = currentH;
                    const llegadaM = currentM;
                    const vLlegadaHora = `${pad(llegadaH)}:${pad(llegadaM)}:00`;
                    const safeVLlegada = vLlegadaHora.replace(/:/g, '-');
                    const vInDate = new Date(YEAR, MONTH, day, llegadaH, llegadaM, 0);
                    const vInDocId = `${safeEmail}_${safeFecha}_${safeVLlegada}`;

                    const llegadaData = {
                        usuario: emp.email,
                        tipo: "Llegada Cliente",
                        fecha: fStr,
                        hora: vLlegadaHora,
                        cliente: localidad,
                        localidad: localidad,
                        observacion: `Inspección de rutina #${v + 1}`,
                        latitud: 4.6097 + (v * 0.001),
                        longitud: -74.0817 - (v * 0.001),
                        timestamp: vInDate
                    };

                    await committer.addWrite("visitas", vInDocId, llegadaData);

                    // Hora Salida de Visita
                    let salidaM = llegadaM + duracionVisitaMins;
                    let salidaH = llegadaH + Math.floor(salidaM / 60);
                    salidaM = salidaM % 60;

                    const vSalidaHora = `${pad(salidaH)}:${pad(salidaM)}:00`;
                    const safeVSalida = vSalidaHora.replace(/:/g, '-');
                    const vOutDate = new Date(YEAR, MONTH, day, salidaH, salidaM, 0);
                    const vOutDocId = `${safeEmail}_${safeFecha}_${safeVSalida}`;

                    const salidaData = {
                        usuario: emp.email,
                        tipo: "Salida Cliente",
                        fecha: fStr,
                        hora: vSalidaHora,
                        cliente: localidad,
                        localidad: localidad,
                        observacion: "Servicio completado a conformidad",
                        latitud: 4.6097 + (v * 0.001),
                        longitud: -74.0817 - (v * 0.001),
                        timestamp: vOutDate
                    };

                    await committer.addWrite("visitas", vOutDocId, salidaData);
                    totalVisitasCreadas++;

                    // Siguiente visita (tiempo de traslado)
                    const tiempoTrasladoMins = schedule.routeStyle === "slow" ? 70 : (schedule.routeStyle === "fast" ? 25 : 40);
                    let nextM = salidaM + tiempoTrasladoMins;
                    currentH = salidaH + Math.floor(nextM / 60);
                    currentM = nextM % 60;

                    if (currentH >= schedule.outH - 1) break;
                }
            }
        }
    }

    // ── Paso C: Confirmar cualquier documento restante ───────────────────────
    console.log("💾 [3/3] Guardando registros pendientes en Firestore...");
    await committer.commit();

    console.log("\n===============================================================");
    console.log("🎉 SIEMBRA COMPLETADA CON ÉXITO EN FIRESTORE");
    console.log(`   - Colaboradores creados en 'employees': 10`);
    console.log(`   - Turnos creados en 'attendance': ${totalTurnosCreados} pares (${totalTurnosCreados * 2} marcas)`);
    console.log(`   - Visitas creadas en 'visitas': ${totalVisitasCreadas} visitas completas (${totalVisitasCreadas * 2} registros)`);
    console.log(`   - Total documentos guardados: ${committer.totalCommitted}`);
    console.log("===============================================================");
}

main().catch(err => {
    console.error("❌ Error ejecutando la siembra:", err.message);
});
