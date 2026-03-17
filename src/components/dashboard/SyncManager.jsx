import React, { useEffect, useState, useRef } from 'react';
import { getPendingRecords, deleteOfflineRecord, getPendingCount } from '../../services/offlineStorage';
import { db } from '../../firebaseConfig';
import { collection, addDoc, query, where, getDocs, updateDoc, doc, serverTimestamp } from 'firebase/firestore';
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
                            finalImage = await addWatermarkToImage(record.image, {
                                employeeId: record.metadata?.usuario,
                                timestamp: record.metadata?.fecha + ' ' + record.metadata?.hora,
                                coords: `${latitud.toFixed(5)}, ${longitud.toFixed(5)}`,
                                locationName: localidad,
                                mode: record.mode === 'incident' ? 'incident' : record.metadata?.tipo === 'Salida' ? 'exit' : 'entry'
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
                            const photoPath = buildPath(
                                finalMetadata.tipo,
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
                        } catch (err) {
                            console.error("Error subiendo foto a Storage:", err);
                        }
                    }

                    // 5. Buscar si ya existe un documento con el mismo usuario, fecha y hora
                    const collectionName = record.mode === 'incident' ? 'incidents' : 'attendance';
                    const existingQuery = query(
                        collection(db, collectionName),
                        where("usuario", "==", finalMetadata.usuario),
                        where("fecha", "==", finalMetadata.fecha),
                        where("hora", "==", finalMetadata.hora)
                    );
                    
                    const existingSnap = await getDocs(existingQuery);
                    let existingDocId = null;
                    
                    if (!existingSnap.empty) {
                        existingDocId = existingSnap.docs[0].id;
                        console.log(`📝 Documento existente encontrado: ${existingDocId}`);
                    }

                    console.log(`💾 ${existingDocId ? 'Actualizando' : 'Creando nuevo en'} ${collectionName}:`, finalMetadata);
                    
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

                    if (existingDocId) {
                        // Actualizar documento existente
                        await updateDoc(doc(db, collectionName, existingDocId), docData);
                        console.log(`✅ Documento ${existingDocId} actualizado.`);
                    } else {
                        // Crear nuevo documento
                        await addDoc(collection(db, collectionName), docData);
                    }

                    // 6. Limpiar local
                    await deleteOfflineRecord(record.id);
                    console.log(`✅ Registro ${record.id} sincronizado con éxito.`);

                    // 7. Actualizar localStorage con el tipo sincronizado
                    if (finalMetadata.tipo) {
                        localStorage.setItem('lastAttendanceType', finalMetadata.tipo);
                        localStorage.setItem('lastAttendanceTime', Date.now().toString());
                        console.log(`📱 localStorage actualizado: ${finalMetadata.tipo}`);
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
