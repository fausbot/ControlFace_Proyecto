import React, { useEffect, useState, useRef } from 'react';
import { getPendingRecords, deleteOfflineRecord, getPendingCount } from '../../services/offlineStorage';
import { db } from '../../firebaseConfig';
import { collection, addDoc, query, where, getDocs, updateDoc, doc, deleteDoc, serverTimestamp, setDoc } from 'firebase/firestore';
import { getStorage, ref, uploadString, getDownloadURL } from 'firebase/storage';
import { CloudUpload, Wifi, WifiOff } from 'lucide-react';
import { fetchLocationName, addWatermarkToImage } from '../../utils/watermark';
import { buildPath } from '../../services/storageService';

export default function SyncManager() {
    const [pendingCount, setPendingCount] = useState(0);
    const [isSyncing, setIsSyncing] = useState(false);
    const [isOnline, setIsOnline] = useState(navigator.onLine);
    const syncIntervalRef = useRef(null);
    const isSyncingRef = useRef(false);

    const updateStatus = async () => {
        const count = await getPendingCount();
        setPendingCount(count);
        setIsOnline(navigator.onLine);
    };

    const startSync = async () => {
        if (isSyncingRef.current) return;
        isSyncingRef.current = true;
        setIsSyncing(true);

        try {
            const pending = await getPendingRecords();
            if (pending.length === 0) {
                setIsSyncing(false);
                return;
            }

            console.log(`📡 Esperando 3 segundos para estabilizar la red antes de sincronizar ${pending.length} registros...`);
            await new Promise(resolve => setTimeout(resolve, 3000));

            for (const record of pending) {
                try {
                    console.log(`🔄 Sincronizando registro ${record.id}...`);
                    
                    // 1. Obtener dirección usando las coordenadas guardadas
                    let localidad = record.metadata?.localidad || "";
                    let latitud = record.latitude;
                    let longitud = record.longitude;
                    
                    // Si hay coordenadas, siempre intentar obtener la dirección (aunque ya tenga una anterior)
                    if (latitud && longitud) {
                        try {
                            console.log(`📍 Obteniendo dirección para ${latitud}, ${longitud}...`);
                            let address = null;
                            
                            // Reintentos para Nominatim (en caso de red inestable o rate limit)
                            for (let retry = 0; retry < 3; retry++) {
                                address = await fetchLocationName(latitud, longitud);
                                if (address && address !== "Sin conexión a mapas" && address !== "Obteniendo dirección...") {
                                    break; // Éxito
                                }
                                console.log(`⚠️ Intento ${retry + 1} de obtener dirección falló. Reintentando en 2s...`);
                                await new Promise(r => setTimeout(r, 2000));
                            }
                            
                            console.log(`📍 Dirección final resuelta: "${address}"`);
                            // Solo actualizar si la dirección es válida
                            if (address && address !== "Sin conexión a mapas" && address !== "Obteniendo dirección...") {
                                localidad = address;
                            }
                        } catch (err) {
                            console.warn("No se pudo obtener dirección en la sincronización:", err);
                            // Mantener la anterior si falla
                            if (!localidad || localidad === "Sin conexión a mapas" || localidad === "Obteniendo dirección...") {
                                localidad = "Sin conexión a mapas";
                            }
                        }
                    } else {
                        console.log("⚠️ No hay coordenadas para resolver dirección");
                        if (!localidad || localidad === "Obteniendo dirección...") {
                            localidad = "Sin conexión a mapas";
                        }
                    }

                    // 2. Preparar metadatos actualizados
                    const finalMetadata = {
                        ...record.metadata,
                        localidad: localidad,
                        latitud: latitud || record.metadata?.latitud,
                        longitud: longitud || record.metadata?.longitud
                    };

                    // 3. Aplicar watermark completo a la imagen
                    let finalImage = record.image;
                    if (record.image && latitud && longitud) {
                        try {
                            console.log(`🎨 Aplicando watermark completo...`);
                            
                            // Determinar el modo para el watermark
                            let watermarkMode = 'entry';
                            if (record.mode === 'incident') watermarkMode = 'incident';
                            else if (record.mode === 'visita') watermarkMode = record.metadata?.tipo;
                            else if (record.metadata?.tipo === 'Salida') watermarkMode = 'exit';

                            finalImage = await addWatermarkToImage(record.image, {
                                employeeId: record.metadata?.usuario,
                                timestamp: record.metadata?.fecha + ' ' + record.metadata?.hora,
                                coords: `${latitud.toFixed(5)}, ${longitud.toFixed(5)}`,
                                locationName: localidad,
                                mode: watermarkMode
                            });
                            console.log(`✅ Watermark completo aplicado`);
                        } catch (err) {
                            console.warn("Error aplicando watermark, usando imagen original:", err);
                        }
                    }

                    // 4. Subir imagen a Storage (si aplica)
                    let photoURL = null;
                    if (record.savePhoto && finalImage) {
                        try {
                            const storage = getStorage();
                            
                            // Extraer año y mes de la fecha guardada de forma robusta
                            const fStr = finalMetadata.fecha || '';
                            const separator = fStr.includes('/') ? '/' : '-';
                            const fechaParts = fStr.split(separator);
                            let year, month;
                            if (fechaParts.length === 3) {
                                if (fechaParts[0].length === 4) {
                                    // YYYY-MM-DD
                                    year = fechaParts[0];
                                    month = fechaParts[1];
                                } else {
                                    // DD/MM/YYYY
                                    year = fechaParts[2];
                                    month = fechaParts[1];
                                }
                            } else {
                                year = new Date().getFullYear().toString();
                                month = (new Date().getMonth() + 1).toString();
                            }
                            month = month.padStart(2, '0');
                            
                            // Usar la misma ruta que storageService para mantener consistencia
                            // Si es visita, la categoría es 'Visita'
                            const category = record.mode === 'visita' ? 'Visita' : finalMetadata.tipo;

                            const photoPath = buildPath(
                                category,
                                year,
                                month,
                                finalMetadata.usuario,
                                finalMetadata.fecha,
                                finalMetadata.hora
                            );
                            
                            const storageRef = ref(storage, photoPath);
                            await uploadString(storageRef, finalImage, 'data_url');
                            photoURL = await getDownloadURL(storageRef);
                            console.log(`✅ Foto sincronizada: ${photoPath}`);

                            // Registrar metadatos en la colección 'fotos' (para el visualizador de reportes)
                            // Solo si el registro NO es 'photoOnly' (para evitar duplicados en la colección 'fotos')
                            if (!record.photoOnly) {
                                try {
                                    const isAsistencia = category === 'asistencia' || category === 'Entrada' || category === 'Salida';
                                    const isVisita = category === 'Visita';
                                    
                                    await addDoc(collection(db, 'fotos'), {
                                        tipo: isAsistencia ? 'asistencia' : (isVisita ? 'visita' : 'incidente'),
                                        tipoOriginal: category,
                                        email: finalMetadata.usuario,
                                        fecha: finalMetadata.fecha,
                                        hora: finalMetadata.hora,
                                        year: year,
                                        month: month,
                                        carpeta: isAsistencia ? 'asistencia' : (isVisita ? 'visitas' : 'incidentes'),
                                        path: photoPath,
                                        url: photoURL,
                                        timestamp: serverTimestamp()
                                    });
                                    console.log(`📸 Metadatos de foto registrados en 'fotos'`);
                                } catch (err) {
                                    console.error("Error registrando metadatos en 'fotos':", err);
                                }
                            }
                        } catch (err) {
                            console.error("Error subiendo foto a Storage:", err);
                        }
                    }

                    // 5. Generar ID determinístico para evitar duplicados (Usuario_Fecha_Hora)
                    let collectionName = 'attendance';
                    if (record.mode === 'incident') collectionName = 'incidents';
                    else if (record.mode === 'visita') collectionName = 'visitas';

                    const safeEmail = finalMetadata.usuario.replace(/[@.]/g, '-');
                    const safeFecha = (finalMetadata.fecha || '').replace(/\//g, '-');
                    const safeHora = (finalMetadata.hora || '').replace(/:/g, '-').replace(/\s/g, '');
                    const deterministicDocId = `${safeEmail}_${safeFecha}_${safeHora}`;

                    // ── MODO PHOTO ONLY: Solo actualizar la fotoURL en el doc existente ──
                    if (record.photoOnly) {
                        if (photoURL) {
                            console.log(`📸 [photoOnly] Adjuntando fotoURL en ${collectionName}/${deterministicDocId}`);
                            await setDoc(doc(db, collectionName, deterministicDocId), { fotoURL: photoURL }, { merge: true });
                            if (record.mode === 'visita') {
                                // También actualizar en attendance
                                await setDoc(doc(db, 'attendance', deterministicDocId), { fotoURL: photoURL }, { merge: true });
                            }
                            console.log(`✅ fotoURL adjuntada al doc existente.`);
                        } else {
                            console.warn(`⚠️ [photoOnly] No se pudo subir la foto aún. El registro offline se mantiene.`);
                            // No borrar el registro offline — se reintentará en el próximo ciclo
                            continue;
                        }
                        // Limpiar local y continuar
                        await deleteOfflineRecord(record.id);
                        console.log(`✅ Registro photoOnly ${record.id} completado.`);
                        continue;
                    }

                    console.log(`💾 Guardando en ${collectionName} con ID: ${deterministicDocId}`, finalMetadata);
                    
                    // Convertir fecha/hora capturada a un objeto Date (Firestore lo convertirá a Timestamp automáticamente)
                    let localTimestamp = serverTimestamp();
                    try {
                        const fStr = finalMetadata.fecha || '';
                        const separator = fStr.includes('/') ? '/' : '-';
                        const parts = fStr.split(separator);
                        const [hours, minutes, seconds] = (finalMetadata.hora || '').split(':');
                        if (parts.length === 3 && hours && minutes) {
                            let d, m, y;
                            if (parts[0].length === 4) {
                                [y, m, d] = parts;
                            } else {
                                [d, m, y] = parts;
                            }
                            localTimestamp = new Date(parseInt(y), parseInt(m) - 1, parseInt(d), parseInt(hours), parseInt(minutes), parseInt(seconds || 0));
                        }
                    } catch (e) {
                        console.error("Error creando fecha local:", e);
                    }

                    const docData = {
                        ...finalMetadata,
                        sincronizadoAt: new Date().toISOString(),
                        metodo: 'offline-sync',
                        latitud: latitud || finalMetadata.latitud,
                        longitud: longitud || finalMetadata.longitud,
                        timestamp: localTimestamp
                    };
                    
                    if (photoURL) {
                        docData.fotoURL = photoURL;
                    }

                    // ── RESOLUCIÓN DE CONFLICTO: Fusión inteligente de registro manual y real ─────
                    // Si el modo es asistencia (Entrada/Salida), verificar si la empresa ya había creado
                    // un registro manual provisional (ej. porque el empleado estaba offline).
                    // REGLA CLAVE: El registro real con foto y GPS prevalece en hora, ubicación y evidencia,
                    // pero ABSORBE Y PRESERVA intactos los datos cargados por el admin:
                    //   - comentarioAdmin (observación del admin)
                    //   - applyLunch (descuento de almuerzo asignado)
                    //   - observacion manual
                    // Si el registro manual tenía una hora estimada diferente (ej. admin puso 06:00 y la foto fue 06:05),
                    // se eliminan los datos provisionales viejos para evitar duplicar la Entrada/Salida en el informe.
                    if (collectionName === 'attendance' && (finalMetadata.tipo === 'Entrada' || finalMetadata.tipo === 'Salida')) {
                        try {
                            const conflictQuery = query(
                                collection(db, 'attendance'),
                                where('usuario', '==', finalMetadata.usuario),
                                where('fecha', '==', finalMetadata.fecha),
                                where('tipo', '==', finalMetadata.tipo)
                            );
                            const conflictSnap = await getDocs(conflictQuery);

                            if (!conflictSnap.empty) {
                                for (const existingDoc of conflictSnap.docs) {
                                    const existingData = existingDoc.data();
                                    const esManual = (existingData.localidad || '') === 'ENTRADA MANUAL DE DATOS';

                                    if (esManual) {
                                        // 1. Rescatar comentario administrativo
                                        if (existingData.comentarioAdmin) {
                                            docData.comentarioAdmin = existingData.comentarioAdmin;
                                            console.log(`💬 [Sync] Comentario admin preservado del registro manual: "${existingData.comentarioAdmin}".`);
                                        }
                                        // 2. Rescatar estado de almuerzo
                                        if (existingData.applyLunch !== undefined) {
                                            docData.applyLunch = existingData.applyLunch;
                                            console.log(`🍽️ [Sync] Estado de almuerzo preservado del registro manual: ${existingData.applyLunch}.`);
                                        }
                                        // 3. Rescatar observación si existía
                                        if (existingData.observacion && existingData.observacion !== "Añadido manualmente") {
                                            docData.observacionManual = existingData.observacion;
                                        }

                                        // 4. Si la hora estimada por el admin difiere de la real (ID distinto):
                                        // Como ya rescatamos los datos admin en docData, eliminamos el doc manual
                                        // provisional para que el informe no tenga dos Entradas o dos Salidas el mismo día.
                                        if (existingDoc.id !== deterministicDocId) {
                                            await deleteDoc(doc(db, 'attendance', existingDoc.id));
                                            console.log(`🔄 [Sync] Registro manual provisional (${existingDoc.id}) fusionado exitosamente en el registro real con foto (${deterministicDocId}).`);
                                        }
                                    } else {
                                        // Es un registro legítimo (turno doble real con foto/GPS) — no tocarlo
                                        console.log(`ℹ️ [Sync] Registro existente ${existingDoc.id} no es manual. Se conserva (turno doble o válido).`);
                                    }
                                }
                            }
                        } catch (conflictErr) {
                            // Si la consulta falla, proceder con la sincronización normal sin bloquear
                            console.warn('[Sync] No se pudo verificar conflictos manuales, sincronizando normal:', conflictErr.message);
                        }
                    }
                    // ── FIN RESOLUCIÓN DE CONFLICTO ──────────────────────────────────────────

                    // Doble registro para visitas: Colección 'visitas' (original) y 'attendance' (visor)
                    if (record.mode === 'visita') {
                        // 1. Guardar en 'visitas' (formato original para informes de ruta)
                        await setDoc(doc(db, 'visitas', deterministicDocId), docData);
                        console.log(`✅ Registro original en 'visitas' guardado.`);

                        // 2. Guardar en 'attendance' (formato para el visor de datos)
                        const attendanceData = { ...docData };
                        if (attendanceData.tipo === 'Llegada Cliente') attendanceData.tipo = 'En Cliente';
                        if (attendanceData.tipo === 'Salida Cliente') attendanceData.tipo = 'En Tránsito';
                        
                        await setDoc(doc(db, 'attendance', deterministicDocId), attendanceData);
                        console.log(`✅ Registro duplicado en 'attendance' guardado como: ${attendanceData.tipo}`);
                    } else {
                        // Guardado normal para asistencia e incidentes
                        await setDoc(doc(db, collectionName, deterministicDocId), docData);
                    }
                    console.log(`✅ Documento ${deterministicDocId} guardado/actualizado.`);

                    // 6. Limpiar local
                    await deleteOfflineRecord(record.id);
                    console.log(`✅ Registro ${record.id} sincronizado con éxito.`);

                    // 7. Actualizar localStorage con el tipo sincronizado (específico por usuario)
                    if (finalMetadata.tipo && finalMetadata.usuario) {
                        // 🔒 Siempre normalizar a minúsculas para consistencia con checkLastStatus
                        const rawUser = finalMetadata.usuario || '';
                        const normUser = rawUser.trim().toLowerCase();

                        const storageKeyNorm = record.mode === 'visita' ? `lastRutaType_${normUser}` : `lastAttendanceType_${normUser}`;
                        const timeKeyNorm = record.mode === 'visita' ? null : `lastAttendanceTime_${normUser}`;

                        localStorage.setItem(storageKeyNorm, finalMetadata.tipo);
                        if (timeKeyNorm) {
                            localStorage.setItem(timeKeyNorm, Date.now().toString());
                        }

                        // También escribir con el email original si difiere (compatibilidad)
                        if (rawUser !== normUser) {
                            const storageKeyRaw = record.mode === 'visita' ? `lastRutaType_${rawUser}` : `lastAttendanceType_${rawUser}`;
                            const timeKeyRaw = record.mode === 'visita' ? null : `lastAttendanceTime_${rawUser}`;
                            localStorage.setItem(storageKeyRaw, finalMetadata.tipo);
                            if (timeKeyRaw) localStorage.setItem(timeKeyRaw, Date.now().toString());
                        }

                        console.log(`📱 localStorage actualizado para ${normUser}: ${finalMetadata.tipo}`);
                    }

                } catch (error) {
                    console.error(`❌ Error sincronizando registro ${record.id}:`, error);
                }
                
                // Pausa de 1.5 segundos entre cada registro para respetar el rate limit de Nominatim (1 req/s)
                console.log("⏱️ Pausando 1.5s antes del siguiente registro...");
                await new Promise(resolve => setTimeout(resolve, 1500));
            }
        } catch (err) {
            console.error("❌ Error general en sincronización:", err);
        } finally {
            setIsSyncing(false);
            isSyncingRef.current = false;
            updateStatus();
            
            // Limpiar cache de sincronización
            const pendingAfterSync = await getPendingCount();
            if (pendingAfterSync === 0) {
                console.log("🧹 Sync completado, toda la memoria limpiada");
            }
        }
    };

    useEffect(() => {
        updateStatus();

        // Sync inicial si hay conexión
        if (navigator.onLine) {
            setTimeout(() => startSync(), 2000);
        }

        const handleOnline = () => {
            setIsOnline(true);
            startSync();
        };

        const handleOffline = () => {
            setIsOnline(false);
        };

        window.addEventListener('online', handleOnline);
        window.addEventListener('offline', handleOffline);

        syncIntervalRef.current = setInterval(() => {
            if (navigator.onLine) {
                startSync();
            }
            updateStatus();
        }, 30000);

        return () => {
            window.removeEventListener('online', handleOnline);
            window.removeEventListener('offline', handleOffline);
            if (syncIntervalRef.current) {
                clearInterval(syncIntervalRef.current);
            }
        };
    }, []);

    return null;
}
