import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { collection, addDoc, serverTimestamp, getDocs, query, orderBy, where, deleteDoc } from 'firebase/firestore';
import { createUserWithEmailAndPassword } from 'firebase/auth';
import { httpsCallable } from 'firebase/functions';
import { auth, db, functions } from '../firebaseConfig';
import DeleteEmployeeModal from '../components/DeleteEmployeeModal';
import { Trash2, UserPlus, LogOut, FileText, Loader2, Camera, UserCheck } from 'lucide-react';
import * as faceapi from '@vladmandic/face-api';

export default function Register() {
    const [email, setEmail] = useState('');
    const [firstName, setFirstName] = useState('');
    const [lastName, setLastName] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const [exporting, setExporting] = useState(false);
    const [showDeleteModal, setShowDeleteModal] = useState(false);
    const [faceDescriptor, setFaceDescriptor] = useState(null);
    const [isCameraOpen, setIsCameraOpen] = useState(false);
    const [modelsLoaded, setModelsLoaded] = useState(false);
    const [capturingFace, setCapturingFace] = useState(false);
    const videoRef = React.useRef(null);
    const canvasRef = React.useRef(null);
    const streamRef = React.useRef(null);

    const navigate = useNavigate();
    const { isAdminAuthenticated } = useAuth();

    // Cargar modelos al iniciar
    useEffect(() => {
        const loadModels = async () => {
            try {
                // Verificar si ya están cargados para evitar recarga
                if (faceapi.nets.tinyFaceDetector.isLoaded &&
                    faceapi.nets.faceLandmark68Net.isLoaded &&
                    faceapi.nets.faceRecognitionNet.isLoaded) {
                    console.log("Modelos ya cargados en memoria. Omitiendo descarga.");
                    setModelsLoaded(true);
                    return;
                }

                console.log("Descargando modelos...");
                const MODEL_URL = 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api/model/';
                await Promise.all([
                    faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
                    faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
                    faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL)
                ]);
                setModelsLoaded(true);
            } catch (err) {
                console.error("Error al cargar modelos de cara:", err);
                setError("No se pudieron cargar los modelos de reconocimiento facial.");
            }
        };
        loadModels();
    }, []);

    React.useEffect(() => {
        if (!isAdminAuthenticated) {
            navigate('/login');
        }
    }, [isAdminAuthenticated, navigate]);

    const startCamera = async () => {
        setError('');
        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: 'user' },
                audio: false
            });
            streamRef.current = stream;
            // Solo abrimos la interfaz; el useEffect se encargará de asignar el stream al videoRef
            setIsCameraOpen(true);
        } catch (err) {
            console.error("Error al acceder a la cámara:", err);
            setError("No se pudo acceder a la cámara. Asegúrate de dar permisos.");
        }
    };

    // Efecto para asignar el stream cuando el videoRef esté disponible
    useEffect(() => {
        if (isCameraOpen && videoRef.current && streamRef.current) {
            console.log("Asignando stream al videoRef...");
            videoRef.current.srcObject = streamRef.current;
            // Intentar reproducir explícitamente
            videoRef.current.play().catch(e => {
                console.error("Error al reproducir video en ref:", e);
                setError("Error al iniciar el video. Intenta de nuevo.");
            });
        }
    }, [isCameraOpen]);

    const stopCamera = () => {
        if (streamRef.current) {
            streamRef.current.getTracks().forEach(track => track.stop());
            streamRef.current = null;
        }
        setIsCameraOpen(false);
    };

    const captureFace = async () => {
        if (!videoRef.current || !modelsLoaded) return;
        setCapturingFace(true);
        setError('');

        try {
            const detections = await faceapi.detectSingleFace(
                videoRef.current,
                new faceapi.TinyFaceDetectorOptions()
            ).withFaceLandmarks().withFaceDescriptor();

            if (!detections) {
                setError('No se detectó un rostro. Asegúrate de estar en un lugar iluminado.');
                setCapturingFace(false);
                return;
            }

            // Guardamos el descriptor como Array para Firestore
            setFaceDescriptor(Array.from(detections.descriptor));
            setCapturingFace(false);
            stopCamera();
            alert('¡Rostro capturado exitosamente!');
        } catch (err) {
            console.error("Error al capturar rostro:", err);
            setError("Error al procesar el reconocimiento facial.");
            setCapturingFace(false);
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();

        if (password !== confirmPassword) {
            return setError('Las contraseñas no coinciden');
        }

        if (!faceDescriptor) {
            return setError('Debes capturar el rostro del empleado antes de crear la cuenta.');
        }

        try {
            setError('');
            setLoading(true);
            // Si no tiene arroba, le agregamos @usuario.com por defecto (o lo dejamos libre)
            // El usuario pidió quitar el autocompletado de vertiaguas, así que usaremos un genérico o dejaremos que escriban todo.
            // Dado el ejemplo "nuevo@usuario.com", asumiré que si no escriben dominio, agrego @usuario.com por seguridad.
            let emailToUse = email.includes('@') ? email : `${email}@usuario.com`;
            emailToUse = emailToUse.toLowerCase().trim();

            await createUserWithEmailAndPassword(auth, emailToUse, password);

            // Guardar en colección de empleados para gestión
            await addDoc(collection(db, "employees"), {
                email: emailToUse,
                firstName: firstName.trim(),
                lastName: lastName.trim(),
                fechaCreacion: serverTimestamp(),
                faceDescriptor: faceDescriptor // Guardar el descriptor facial
            });

            alert('Usuario creado exitosamente.');
            alert('Usuario creado exitosamente.');
            setEmail('');
            setFirstName('');
            setLastName('');
            setPassword('');
            setConfirmPassword('');
            setFaceDescriptor(null);
        } catch (err) {
            console.error(err);
            if (err.code === 'auth/email-already-in-use') {
                // Lógica de "vincular" si ya existe en Auth pero no en Firestore
                try {
                    let emailToUse = email.includes('@') ? email : `${email}@vertiaguas.com`;
                    emailToUse = emailToUse.toLowerCase().trim();

                    const q = query(collection(db, "employees"), where("email", "==", emailToUse));
                    const snap = await getDocs(q);

                    if (snap.empty) {
                        // Agregar a la lista de empleados
                        await addDoc(collection(db, "employees"), {
                            email: emailToUse,
                            firstName: firstName.trim(),
                            lastName: lastName.trim(),
                            fechaCreacion: serverTimestamp()
                        });

                        // Limpiar de la cola de borrado si estaba allí
                        const { deleteDoc, doc } = await import('firebase/firestore');
                        const qQueue = query(collection(db, "deletionQueue"), where("email", "==", emailToUse));
                        const snapQueue = await getDocs(qQueue);
                        snapQueue.forEach(async (d) => {
                            await deleteDoc(d.ref);
                        });

                        alert('Este usuario ya tenía cuenta de acceso. Se ha re-vinculado correctamente a la lista de empleados.');
                        setEmail('');
                        setPassword('');
                        setConfirmPassword('');
                    } else {
                        setError('Este usuario ya existe y ya está en la lista de gestión.');
                    }
                } catch (linkErr) {
                    setError('El usuario ya existe, pero hubo un error al sincronizarlo: ' + linkErr.message);
                }
            } else if (err.code === 'auth/weak-password') {
                setError('La contraseña debe tener al menos 6 caracteres.');
            } else {
                setError('Error al crear cuenta: ' + err.message);
            }
        }
        setLoading(false);
    };

    const exportEmployeesToCSV = async () => {
        setExporting(true);
        try {
            const getUsersListFn = httpsCallable(functions, 'getUsersList');
            const result = await getUsersListFn();
            const employees = result.data.users;

            if (!employees || employees.length === 0) {
                alert('No hay empleados para exportar.');
                return;
            }

            // Headers
            const headers = ['Email/ID', 'Fecha de Creacion', 'Ultimo Acceso', 'UID'];
            const csvRows = [headers.join(',')];

            employees.forEach(emp => {
                const created = emp.creationTime ? new Date(emp.creationTime).toLocaleString('es-ES') : 'N/A';
                const lastLogin = emp.lastSignInTime ? new Date(emp.lastSignInTime).toLocaleString('es-ES') : 'N/A';
                csvRows.push(`${emp.email},"${created}","${lastLogin}",${emp.uid}`);
            });

            // Añadir BOM (\ufeff) pa Excel
            const csvContent = "\ufeff" + csvRows.join('\n');
            const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
            const link = document.createElement('a');
            const url = URL.createObjectURL(blob);

            const now = new Date();
            const year = now.getFullYear();
            const month = String(now.getMonth() + 1).padStart(2, '0');
            const day = String(now.getDate()).padStart(2, '0');
            const hours = String(now.getHours()).padStart(2, '0');
            const minutes = String(now.getMinutes()).padStart(2, '0');
            const timestamp = `${year}${month}${day}${hours}${minutes}`;

            link.setAttribute('href', url);
            link.setAttribute('download', `empleados_auth_${timestamp}.csv`);
            link.style.visibility = 'hidden';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);

        } catch (err) {
            console.error("Error exportando empleados:", err);
            alert("Error al exportar empleados: " + err.message);
        } finally {
            setExporting(false);
        }
    };



    return (
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-green-500 to-teal-600 p-4">
            <div className="bg-white p-8 rounded-2xl shadow-xl w-full max-w-md backdrop-blur-sm bg-opacity-90">
                <div className="flex justify-center mb-4">
                    <div className="bg-green-100 p-3 rounded-full">
                        <UserPlus className="text-green-600" size={32} />
                    </div>
                </div>
                <h2 className="text-3xl font-bold text-center mb-6 text-gray-800">Registrar Nuevo Empleado</h2>
                {error && <div className="bg-red-100 text-red-700 p-3 rounded mb-4">{error}</div>}
                <div className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700">Nuevo Usuario / ID</label>
                        <input
                            type="text"
                            required
                            className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-green-500 focus:border-green-500"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            placeholder="Ej: nuevo.empleado"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700">Nombres</label>
                        <input
                            type="text"
                            required
                            className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-green-500 focus:border-green-500"
                            value={firstName}
                            onChange={(e) => setFirstName(e.target.value)}
                            placeholder="Ej: Juan"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700">Apellidos</label>
                        <input
                            type="text"
                            required
                            className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-green-500 focus:border-green-500"
                            value={lastName}
                            onChange={(e) => setLastName(e.target.value)}
                            placeholder="Ej: Pérez"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700">Contraseña</label>
                        <input
                            type="text"
                            style={{ WebkitTextSecurity: 'disc' }}
                            name="new_sec_field_a"
                            autoComplete="off"
                            required
                            className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-green-500 focus:border-green-500"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700">Confirmar Contraseña</label>
                        <input
                            type="text"
                            style={{ WebkitTextSecurity: 'disc' }}
                            name="new_sec_field_b"
                            autoComplete="off"
                            required
                            className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-green-500 focus:border-green-500"
                            value={confirmPassword}
                            onChange={(e) => setConfirmPassword(e.target.value)}
                        />
                    </div>

                    {/* Sección de Reconocimiento Facial */}
                    <div className="bg-gray-50 p-4 rounded-xl border border-gray-200">
                        <label className="block text-sm font-bold text-gray-700 mb-2">Reconocimiento Facial</label>
                        {!isCameraOpen ? (
                            <div className="flex flex-col items-center">
                                {faceDescriptor ? (
                                    <div className="flex items-center gap-2 text-green-600 mb-3">
                                        <UserCheck size={20} />
                                        <span className="text-sm font-medium">Rostro registrado correctamente</span>
                                    </div>
                                ) : (
                                    <p className="text-xs text-gray-500 mb-3 text-center">Es necesario registrar el rostro para que el empleado pueda marcar asistencia.</p>
                                )}
                                <button
                                    type="button"
                                    onClick={startCamera}
                                    disabled={!modelsLoaded}
                                    className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition ${faceDescriptor ? 'bg-gray-100 text-gray-600' : 'bg-blue-600 text-white hover:bg-blue-700'}`}
                                >
                                    <Camera size={18} />
                                    {faceDescriptor ? 'Capturar de nuevo' : 'Activar Cámara'}
                                </button>
                                {!modelsLoaded && <p className="text-[10px] text-orange-500 mt-1">Cargando modelos inteligentes...</p>}
                            </div>
                        ) : (
                            <div className="flex flex-col items-center animate-fade-in">
                                <div className="relative rounded-lg overflow-hidden border-2 border-blue-400 bg-black aspect-[3/4] w-full max-w-[200px]">
                                    <video
                                        ref={videoRef}
                                        autoPlay
                                        playsInline
                                        muted
                                        className="w-full h-full object-cover transform scale-x-[-1]"
                                    />
                                    <canvas ref={canvasRef} className="hidden" />
                                </div>
                                <div className="flex gap-2 mt-3">
                                    <button
                                        type="button"
                                        onClick={stopCamera}
                                        className="px-3 py-1.5 bg-gray-200 text-gray-700 rounded-md text-xs font-bold"
                                    >
                                        Cancelar
                                    </button>
                                    <button
                                        type="button"
                                        onClick={captureFace}
                                        disabled={capturingFace}
                                        className="px-4 py-1.5 bg-blue-600 text-white rounded-md text-xs font-bold"
                                    >
                                        {capturingFace ? 'Analizando...' : 'Capturar Rostro'}
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                    <button
                        onClick={handleSubmit}
                        disabled={loading}
                        className="w-full flex justify-center py-3 px-4 border border-transparent rounded-lg shadow-sm text-sm font-medium text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 transition duration-150"
                    >
                        {loading ? 'Creando...' : 'Crear Cuenta'}
                    </button>

                    <div className="grid grid-cols-1 gap-3 mt-4">
                        <div className="grid grid-cols-2 gap-3">
                            <button
                                type="button"
                                onClick={() => setShowDeleteModal(true)}
                                className="flex items-center justify-center gap-2 py-2.5 px-4 bg-blue-600 text-white text-xs rounded-lg hover:bg-blue-700 font-bold transition shadow-sm"
                            >
                                <Trash2 size={16} />
                                Borrar Empleado
                            </button>
                            <button
                                type="button"
                                onClick={exportEmployeesToCSV}
                                disabled={exporting}
                                className="flex items-center justify-center gap-2 py-2.5 px-4 bg-blue-500 text-white text-xs rounded-lg hover:bg-blue-600 font-bold transition shadow-sm disabled:opacity-50"
                            >
                                {exporting ? <Loader2 size={16} className="animate-spin" /> : <FileText size={16} />}
                                Exportar CSV
                            </button>
                        </div>


                    </div>

                    <div className="pt-4 border-t border-gray-100">
                        <button
                            type="button"
                            onClick={() => navigate('/login')}
                            className="flex items-center justify-center gap-2 w-full text-sm text-gray-500 hover:text-gray-700 transition"
                        >
                            <LogOut size={16} />
                            Volver al Login
                        </button>
                    </div>
                </div>
            </div>

            <DeleteEmployeeModal
                isOpen={showDeleteModal}
                onClose={() => setShowDeleteModal(false)}
            />
        </div>
    );
}
