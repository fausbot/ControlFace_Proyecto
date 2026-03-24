import React, { useEffect, useState, useRef } from 'react';
import { getPendingRecords, deleteOfflineRecord, getPendingCount } from '../../services/offlineStorage';
import { db } from '../../firebaseConfig';
import { collection, addDoc, query, where, getDocs, updateDoc, doc, serverTimestamp, setDoc } from 'firebase/firestore';
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

            console.log(`📡 Iniciando sincronización de ${pending.length} registros...`);

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
                            const address = await fetchLocationName(latitud, longitud);
                            console.log(`📍 Dirección resuelta: "${address}"`);
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
                            
                            // Extraer año y mes de la fecha guardada
                            const fechaParts = (finalMetadata.fecha || '').split('/');
                            const year = fechaParts[2] || new Date().getFullYear().toString();
                            const month = (fechaParts[1] || '').padStart(2, '0');
                            
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

                    console.log(`💾 Guardando en ${collectionName} con ID: ${deterministicDocId}`, finalMetadata);
                    
                    const docData = {
                        ...finalMetadata,
                        sincronizadoAt: new Date().toISOString(),
                        metodo: 'offline-sync',
                        latitud: latitud || finalMetadata.latitud,
                        longitud: longitud || finalMetadata.longitud,
                        timestamp: serverTimestamp()
                    };
                    
                    if (photoURL) {
                        docData.fotoURL = photoURL;
                    }

                    // Usar setDoc para sobrescribir si ya existe (evita duplicados)
                    await setDoc(doc(db, collectionName, deterministicDocId), docData);
                    console.log(`✅ Documento ${deterministicDocId} guardado/actualizado.`);

                    // 6. Limpiar local
                    await deleteOfflineRecord(record.id);
                    console.log(`✅ Registro ${record.id} sincronizado con éxito.`);

                    // 7. Actualizar localStorage con el tipo sincronizado (específico por usuario)
                    if (finalMetadata.tipo && finalMetadata.usuario) {
                        const userSuffix = `_${finalMetadata.usuario}`;
                        const storageKey = record.mode === 'visita' ? `lastRutaType${userSuffix}` : `lastAttendanceType${userSuffix}`;
                        const timeKey = record.mode === 'visita' ? null : `lastAttendanceTime${userSuffix}`;

                        localStorage.setItem(storageKey, finalMetadata.tipo);
                        if (timeKey) {
                            localStorage.setItem(timeKey, Date.now().toString());
                        }
                        console.log(`📱 localStorage actualizado para ${finalMetadata.usuario}: ${finalMetadata.tipo}`);
                    }
                } catch (error) {
                    console.error(`❌ Error sincronizando registro ${record.id}:`, error);
                }
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
