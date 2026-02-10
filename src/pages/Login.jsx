import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';

import { Settings } from 'lucide-react';
import AdminPasswordModal from '../components/AdminPasswordModal';

export default function Login() {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const { login, logout } = useAuth();
    const navigate = useNavigate();
    const [error, setError] = useState('');
    const [showAdminModal, setShowAdminModal] = useState(false);
    const [adminTarget, setAdminTarget] = useState(''); // '/registro' or '/admin'

    const handleSubmit = async (e) => {
        e.preventDefault();
        try {
            setError('');
            // Auto-append domain if not present y normalizar
            let emailToUse = email.includes('@') ? email : `${email}@vertiaguas.com`;
            emailToUse = emailToUse.toLowerCase().trim();
            const userCredential = await login(emailToUse, password);
            const user = userCredential.user;

            // Verificar lista blanca en Firestore (BLOQUEO DE COLA DE BORRADO)
            const { db } = await import('../firebaseConfig');
            const { collection, query, where, getDocs } = await import('firebase/firestore');

            const q = query(collection(db, "employees"), where("email", "==", user.email));
            const querySnapshot = await getDocs(q);

            if (querySnapshot.empty) {
                await logout();
                setError('Acceso denegado: Usuario no autorizado o dado de baja.');
                return;
            }

            navigate('/dashboard');
        } catch (err) {
            setError('Error al ingresar: Verifique sus datos');
            console.error(err);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-500 to-purple-600 p-4 relative">
            <div className="absolute top-4 right-4 flex gap-2">
                <button
                    onClick={() => { setAdminTarget('/registro'); setShowAdminModal(true); }}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-white/10 hover:bg-white/20 text-white rounded-lg border border-white/30 backdrop-blur-sm transition text-xs font-bold"
                >
                    <Settings size={14} />
                    REGISTRO
                </button>
                <button
                    onClick={() => { setAdminTarget('/admin'); setShowAdminModal(true); }}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-white/10 hover:bg-white/20 text-white rounded-lg border border-white/30 backdrop-blur-sm transition text-xs font-bold"
                >
                    <Settings size={14} />
                    ADMIN
                </button>
            </div>

            <AdminPasswordModal
                isOpen={showAdminModal}
                onClose={() => setShowAdminModal(false)}
                onSuccess={() => {
                    setShowAdminModal(false);
                    navigate(adminTarget);
                }}
            />

            <div className="bg-white p-8 rounded-2xl shadow-xl w-full max-w-md backdrop-blur-sm bg-opacity-90">
                <h2 className="text-3xl font-bold text-center mb-6 text-gray-800">Acceso Empleados</h2>
                {error && <div className="bg-red-100 text-red-700 p-3 rounded mb-4">{error}</div>}
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700">Usuario / ID</label>
                        <input
                            type="text"
                            required
                            className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            placeholder="Ej: juan (sin @vertiaguas.com)"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700">Contraseña</label>
                        <input
                            type="password"
                            required
                            className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                        />
                    </div>
                    <button
                        type="submit"
                        className="w-full flex justify-center py-3 px-4 border border-transparent rounded-lg shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition duration-150"
                    >
                        Ingresar
                    </button>
                </form>
            </div>
        </div>
    );
}
