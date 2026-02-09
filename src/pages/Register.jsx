import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { auth, db } from '../firebaseConfig';
import { createUserWithEmailAndPassword } from 'firebase/auth';
import { collection, addDoc, serverTimestamp, getDocs, query, orderBy, where } from 'firebase/firestore';
import DeleteEmployeeModal from '../components/DeleteEmployeeModal';
import { Trash2, Download, UserPlus, LogOut, FileText, Loader2 } from 'lucide-react';

export default function Register() {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const [exporting, setExporting] = useState(false);
    const [showDeleteModal, setShowDeleteModal] = useState(false);
    const navigate = useNavigate();
    const { isAdminAuthenticated } = useAuth();

    React.useEffect(() => {
        if (!isAdminAuthenticated) {
            navigate('/login');
        }
    }, [isAdminAuthenticated, navigate]);

    const handleSubmit = async (e) => {
        e.preventDefault();

        if (password !== confirmPassword) {
            return setError('Las contraseñas no coinciden');
        }

        try {
            setError('');
            setLoading(true);
            // Auto-agregar dominio si no está presente
            const emailToUse = email.includes('@') ? email : `${email}@vertiaguas.com`;

            await createUserWithEmailAndPassword(auth, emailToUse, password);

            // Guardar en colección de empleados para gestión
            await addDoc(collection(db, "employees"), {
                email: emailToUse,
                fechaCreacion: serverTimestamp()
            });

            alert('Usuario creado exitosamente.');
            setEmail('');
            setPassword('');
            setConfirmPassword('');
        } catch (err) {
            console.error(err);
            if (err.code === 'auth/email-already-in-use') {
                // Lógica de "vincular" si ya existe en Auth pero no en Firestore
                try {
                    const emailToUse = email.includes('@') ? email : `${email}@vertiaguas.com`;
                    const q = query(collection(db, "employees"), where("email", "==", emailToUse));
                    const snap = await getDocs(q);

                    if (snap.empty) {
                        await addDoc(collection(db, "employees"), {
                            email: emailToUse,
                            fechaCreacion: serverTimestamp()
                        });
                        alert('Este usuario ya existía en Auth y ha sido vinculado correctamente a la lista de gestión.');
                        setEmail('');
                        setPassword('');
                        setConfirmPassword('');
                    } else {
                        setError('Este usuario ya existe y ya está en la lista de gestión.');
                    }
                } catch (linkErr) {
                    setError('El usuario ya existe, pero hubo un error al vincularlo: ' + linkErr.message);
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
            const q = query(collection(db, "employees"), orderBy("fechaCreacion", "desc"));
            const querySnapshot = await getDocs(q);
            const employees = querySnapshot.docs.map(doc => {
                const data = doc.data();
                const d = data.fechaCreacion?.toDate();
                return {
                    email: data.email,
                    fecha: d ? d.toLocaleDateString('es-ES') : 'N/A',
                    hora: d ? d.toLocaleTimeString('es-ES') : 'N/A'
                };
            });

            if (employees.length === 0) {
                alert('No hay empleados para exportar.');
                return;
            }

            // Headers sin tildes
            const headers = ['Email/ID', 'Fecha de Creacion', 'Hora'];
            const csvRows = [headers.join(',')];

            employees.forEach(emp => {
                csvRows.push(`${emp.email},${emp.fecha},${emp.hora}`);
            });

            // Añadir BOM (\ufeff) para que Excel reconozca UTF-8 (tildes/caracteres especiales si los hubiera)
            const csvContent = "\ufeff" + csvRows.join('\n');
            const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
            const link = document.createElement('a');
            const url = URL.createObjectURL(blob);

            const now = new Date();
            const timeStr = now.getHours().toString().padStart(2, '0') + now.getMinutes().toString().padStart(2, '0');
            const dateStr = now.toISOString().split('T')[0];

            link.setAttribute('href', url);
            link.setAttribute('download', `empleados_${dateStr}_${timeStr}.csv`);
            link.style.visibility = 'hidden';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);

        } catch (err) {
            console.error("Error exportando empleados:", err);
            alert("Error al exportar empleados.");
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
                            placeholder="Ej: nuevoempleado"
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
                    <button
                        onClick={handleSubmit}
                        disabled={loading}
                        className="w-full flex justify-center py-3 px-4 border border-transparent rounded-lg shadow-sm text-sm font-medium text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 transition duration-150"
                    >
                        {loading ? 'Creando...' : 'Crear Cuenta'}
                    </button>

                    <div className="grid grid-cols-2 gap-3 mt-4">
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
