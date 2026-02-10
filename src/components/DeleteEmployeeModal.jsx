import React, { useState, useEffect, useMemo } from 'react';
import { db } from '../firebaseConfig';
import { collection, query, getDocs, deleteDoc, doc, orderBy, addDoc, serverTimestamp } from 'firebase/firestore';
import { X, Trash2, Loader2, UserX, Search, User, ClipboardList, CheckCircle2 } from 'lucide-react';

export default function DeleteEmployeeModal({ isOpen, onClose }) {
    const [employees, setEmployees] = useState([]);
    const [queue, setQueue] = useState([]);
    const [activeTab, setActiveTab] = useState('active'); // 'active' or 'queue'
    const [loading, setLoading] = useState(false);
    const [deletingId, setDeletingId] = useState(null);
    const [searchTerm, setSearchTerm] = useState('');

    useEffect(() => {
        if (isOpen) {
            fetchData();
        }
    }, [isOpen, activeTab]);

    const fetchData = async () => {
        setLoading(true);
        try {
            if (activeTab === 'active') {
                const q = query(collection(db, "employees"), orderBy("email", "asc"));
                const querySnapshot = await getDocs(q);
                const data = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                setEmployees(data);
            } else {
                const q = query(collection(db, "deletionQueue"), orderBy("fechaBaja", "desc"));
                const querySnapshot = await getDocs(q);
                const data = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                setQueue(data);
            }
        } catch (error) {
            console.error("Error fetching data:", error);
        } finally {
            setLoading(false);
        }
    };

    const handleDelete = async (employee) => {
        if (!window.confirm(`¿Dar de baja a ${employee.email}? No podrá registrar más asistencia. Se moverá a la cola de borrado manual.`)) {
            return;
        }

        setDeletingId(employee.id);
        try {
            // 1. Añadir a la cola de borrado
            await addDoc(collection(db, "deletionQueue"), {
                email: employee.email,
                idOriginal: employee.id,
                fechaBaja: serverTimestamp()
            });

            // 2. Eliminar de la lista activa (BLOQUEO INMEDIATO)
            await deleteDoc(doc(db, "employees", employee.id));

            setEmployees(employees.filter(e => e.id !== employee.id));
        } catch (error) {
            console.error("Error moving to queue:", error);
            alert("No se pudo procesar la baja.");
        } finally {
            setDeletingId(null);
        }
    };

    const handleClearFromQueue = async (item) => {
        if (!window.confirm(`¿Confirmas que ya borraste a ${item.email} de Firebase Auth?`)) {
            return;
        }

        setDeletingId(item.id);
        try {
            await deleteDoc(doc(db, "deletionQueue", item.id));
            setQueue(queue.filter(q => q.id !== item.id));
        } catch (error) {
            console.error("Error clearing queue item:", error);
            alert("No se pudo limpiar el registro.");
        } finally {
            setDeletingId(null);
        }
    };

    const filteredList = useMemo(() => {
        const list = activeTab === 'active' ? employees : queue;
        return list.filter(emp =>
            emp.email.toLowerCase().includes(searchTerm.toLowerCase())
        );
    }, [employees, queue, searchTerm, activeTab]);

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md animate-in fade-in duration-300">
            <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col max-h-[85vh] transition-all transform scale-100">
                {/* Header */}
                <div className="bg-gradient-to-r from-red-50 to-white px-6 py-5 flex justify-between items-center border-b border-gray-100">
                    <div className="flex items-center gap-3">
                        <div className="bg-red-100 p-2 rounded-xl">
                            <UserX className="text-red-600" size={24} />
                        </div>
                        <div>
                            <h3 className="text-xl font-bold text-gray-800">Gestionar Empleados</h3>
                            <p className="text-[10px] text-gray-400 uppercase tracking-wider font-semibold">Baja de Personal</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-2 rounded-full hover:bg-gray-100 transition duration-200">
                        <X size={20} />
                    </button>
                </div>

                {/* Tabs */}
                <div className="flex px-6 pt-4 gap-4 bg-gray-50/30 border-b border-gray-100">
                    <button
                        onClick={() => setActiveTab('active')}
                        className={`pb-3 text-sm font-bold transition-all relative ${activeTab === 'active' ? 'text-blue-600' : 'text-gray-400 hover:text-gray-600'
                            }`}
                    >
                        Empleados Activos
                        {activeTab === 'active' && <div className="absolute bottom-0 left-0 w-full h-1 bg-blue-600 rounded-t-full" />}
                    </button>
                    <button
                        onClick={() => setActiveTab('queue')}
                        className={`pb-3 text-sm font-bold transition-all relative flex items-center gap-2 ${activeTab === 'queue' ? 'text-red-600' : 'text-gray-400 hover:text-gray-600'
                            }`}
                    >
                        Cola de Borrado (Auth)
                        {activeTab === 'queue' && <div className="absolute bottom-0 left-0 w-full h-1 bg-red-600 rounded-t-full" />}
                        {queue.length > 0 && (
                            <span className="bg-red-100 text-red-600 text-[10px] px-1.5 py-0.5 rounded-full">
                                {queue.length}
                            </span>
                        )}
                    </button>
                </div>

                {/* Search */}
                <div className="px-6 py-4 bg-gray-50/50 border-b border-gray-100">
                    <div className="relative group">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-blue-500 transition-colors" size={18} />
                        <input
                            type="text"
                            placeholder={activeTab === 'active' ? "Buscar empleado activo..." : "Buscar en cola de borrado..."}
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full pl-10 pr-4 py-2.5 bg-white border border-gray-200 rounded-2xl text-sm focus:ring-4 focus:ring-blue-100 focus:border-blue-400 outline-none transition-all"
                        />
                    </div>
                </div>

                {/* Body */}
                <div className="flex-1 overflow-y-auto p-2 custom-scrollbar min-h-[300px]">
                    {loading ? (
                        <div className="flex flex-col items-center justify-center py-20">
                            <Loader2 className="animate-spin text-blue-500 mb-4" size={48} />
                            <p className="text-sm font-medium text-gray-500">Cargando base de datos...</p>
                        </div>
                    ) : filteredList.length === 0 ? (
                        <div className="text-center py-20 px-10">
                            <div className="bg-gray-100 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 text-gray-400">
                                {activeTab === 'active' ? <User size={32} /> : <ClipboardList size={32} />}
                            </div>
                            <p className="text-gray-500 font-medium">
                                {activeTab === 'active' ? 'No hay empleados registrados' : 'La cola de borrado está vacía'}
                            </p>
                            <p className="text-xs text-gray-400 mt-1">
                                {activeTab === 'active' ? 'Usa el panel de registro para añadir nuevos' : 'Todo sincronizado con Firebase Auth'}
                            </p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 gap-2 p-2">
                            {filteredList.map((item) => (
                                <div key={item.id} className="flex items-center justify-between p-4 bg-white border border-gray-100 rounded-2xl hover:border-blue-200 hover:shadow-md transition-all group animate-in slide-in-from-bottom-2 duration-200">
                                    <div className="flex items-center gap-4 min-w-0">
                                        <div className={`p-2.5 rounded-xl transition-colors ${activeTab === 'active' ? 'bg-blue-50 group-hover:bg-red-50' : 'bg-red-50 group-hover:bg-green-50'}`}>
                                            <User className={activeTab === 'active' ? 'text-blue-600 group-hover:text-red-600' : 'text-red-600 group-hover:text-green-600'} size={24} />
                                        </div>
                                        <div className="truncate">
                                            <p className="text-sm font-bold text-gray-900 truncate leading-tight">{item.email}</p>
                                            <div className="flex items-center gap-2 mt-1">
                                                <span className="text-[10px] px-2 py-0.5 bg-gray-100 text-gray-500 rounded-full font-medium">
                                                    {activeTab === 'active' ? 'Alta: ' : 'Baja: '}
                                                    {activeTab === 'active'
                                                        ? (item.fechaCreacion?.toDate ? item.fechaCreacion.toDate().toLocaleDateString('es-ES') : 'N/A')
                                                        : (item.fechaBaja?.toDate ? item.fechaBaja.toDate().toLocaleDateString('es-ES') : 'N/A')
                                                    }
                                                </span>
                                            </div>
                                        </div>
                                    </div>

                                    {activeTab === 'active' ? (
                                        <button
                                            onClick={() => handleDelete(item)}
                                            disabled={deletingId === item.id}
                                            className="p-3 text-red-400 hover:text-white hover:bg-red-500 rounded-2xl transition-all duration-200 shrink-0 shadow-sm hover:shadow-red-100 group/btn"
                                            title="Dar de baja y enviar a cola"
                                        >
                                            {deletingId === item.id ? <Loader2 size={20} className="animate-spin" /> : <Trash2 size={20} />}
                                        </button>
                                    ) : (
                                        <button
                                            onClick={() => handleClearFromQueue(item)}
                                            disabled={deletingId === item.id}
                                            className="p-3 text-green-400 hover:text-white hover:bg-green-500 rounded-2xl transition-all duration-200 shrink-0 shadow-sm hover:shadow-green-100 group/btn"
                                            title="Confirmar borrado manual de Auth"
                                        >
                                            {deletingId === item.id ? <Loader2 size={20} className="animate-spin" /> : <CheckCircle2 size={20} />}
                                        </button>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="p-6 bg-gray-50 border-t border-gray-100">
                    <div className="flex items-center justify-between mb-2">
                        <p className="text-xs text-gray-400 font-medium">
                            {activeTab === 'active' ? 'Total Empleados: ' : 'Pendientes de Borrado: '}
                            <span className="text-gray-700 font-bold">{filteredList.length}</span>
                        </p>
                        <button
                            onClick={onClose}
                            className="px-8 py-2.5 bg-white text-gray-700 border border-gray-200 rounded-2xl font-bold hover:bg-gray-100 hover:border-gray-300 transition-all shadow-sm active:scale-95"
                        >
                            Cerrar
                        </button>
                    </div>
                </div>
            </div>

            <style dangerouslySetInnerHTML={{
                __html: `
                .custom-scrollbar::-webkit-scrollbar { width: 6px; }
                .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
                .custom-scrollbar::-webkit-scrollbar-thumb { background: #e5e7eb; border-radius: 10px; }
                .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #d1d5db; }
            `}} />
        </div>
    );
}
