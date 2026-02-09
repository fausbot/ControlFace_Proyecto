import React, { useState, useEffect, useMemo } from 'react';
import { db } from '../firebaseConfig';
import { collection, query, getDocs, deleteDoc, doc, orderBy } from 'firebase/firestore';
import { X, Trash2, Loader2, UserX, Search, User } from 'lucide-react';

export default function DeleteEmployeeModal({ isOpen, onClose }) {
    const [employees, setEmployees] = useState([]);
    const [loading, setLoading] = useState(false);
    const [deletingId, setDeletingId] = useState(null);
    const [searchTerm, setSearchTerm] = useState('');

    useEffect(() => {
        if (isOpen) {
            fetchEmployees();
        }
    }, [isOpen]);

    const fetchEmployees = async () => {
        setLoading(true);
        try {
            const q = query(collection(db, "employees"), orderBy("email", "asc"));
            const querySnapshot = await getDocs(q);
            const data = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            setEmployees(data);
        } catch (error) {
            console.error("Error fetching employees:", error);
        } finally {
            setLoading(false);
        }
    };

    const handleDelete = async (employee) => {
        if (!window.confirm(`¿Estás seguro de que deseas eliminar a ${employee.email}? Ya no podrá registrar asistencia.`)) {
            return;
        }

        setDeletingId(employee.id);
        try {
            await deleteDoc(doc(db, "employees", employee.id));
            setEmployees(employees.filter(e => e.id !== employee.id));
        } catch (error) {
            console.error("Error deleting employee:", error);
            alert("No se pudo eliminar al empleado.");
        } finally {
            setDeletingId(null);
        }
    };

    const filteredEmployees = useMemo(() => {
        return employees.filter(emp =>
            emp.email.toLowerCase().includes(searchTerm.toLowerCase())
        );
    }, [employees, searchTerm]);

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

                {/* Sub-header with search */}
                <div className="px-6 py-4 bg-gray-50/50 border-b border-gray-100">
                    <div className="relative group">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-blue-500 transition-colors" size={18} />
                        <input
                            type="text"
                            placeholder="Buscar empleado por nombre o ID..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full pl-10 pr-4 py-2.5 bg-white border border-gray-200 rounded-2xl text-sm focus:ring-4 focus:ring-blue-100 focus:border-blue-400 outline-none transition-all"
                        />
                    </div>
                </div>

                {/* Body with scalable list */}
                <div className="flex-1 overflow-y-auto p-2 custom-scrollbar">
                    {loading ? (
                        <div className="flex flex-col items-center justify-center py-20">
                            <div className="relative">
                                <Loader2 className="animate-spin text-blue-500" size={48} />
                                <User className="absolute inset-0 m-auto text-blue-200" size={20} />
                            </div>
                            <p className="mt-4 text-sm font-medium text-gray-500">Cargando base de datos...</p>
                        </div>
                    ) : filteredEmployees.length === 0 ? (
                        <div className="text-center py-20">
                            <div className="bg-gray-100 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
                                <Search className="text-gray-400" size={32} />
                            </div>
                            <p className="text-gray-500 font-medium">No se encontraron empleados</p>
                            <p className="text-xs text-gray-400 mt-1">Prueba con otro término de búsqueda</p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 gap-2 p-2">
                            {filteredEmployees.map((emp) => (
                                <div key={emp.id} className="flex items-center justify-between p-4 bg-white border border-gray-100 rounded-2xl hover:border-red-200 hover:shadow-md transition-all group active:scale-[0.98]">
                                    <div className="flex items-center gap-4 min-w-0">
                                        <div className="bg-blue-50 p-2.5 rounded-xl group-hover:bg-red-50 transition-colors">
                                            <User className="text-blue-600 group-hover:text-red-600" size={24} />
                                        </div>
                                        <div className="truncate">
                                            <p className="text-sm font-bold text-gray-900 truncate leading-tight">{emp.email}</p>
                                            <div className="flex items-center gap-2 mt-1">
                                                <span className="text-[10px] px-2 py-0.5 bg-gray-100 text-gray-500 rounded-full font-medium">
                                                    Registro: {emp.fechaCreacion?.toDate ? emp.fechaCreacion.toDate().toLocaleDateString('es-ES') : 'N/A'}
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                    <button
                                        onClick={() => handleDelete(emp)}
                                        disabled={deletingId === emp.id}
                                        className="p-3 text-red-400 hover:text-white hover:bg-red-500 rounded-2xl transition-all duration-200 shrink-0 shadow-sm hover:shadow-red-200 group/btn"
                                        title="Eliminar acceso permanentemente"
                                    >
                                        {deletingId === emp.id ? (
                                            <Loader2 size={20} className="animate-spin" />
                                        ) : (
                                            <Trash2 size={20} className="group-hover/btn:scale-110" />
                                        )}
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="p-6 bg-gray-50 border-t border-gray-100 flex items-center justify-between">
                    <p className="text-xs text-gray-400 font-medium">
                        Total: <span className="text-gray-700">{filteredEmployees.length} empleados</span>
                    </p>
                    <button
                        onClick={onClose}
                        className="px-8 py-2.5 bg-white text-gray-700 border border-gray-200 rounded-2xl font-bold hover:bg-gray-100 hover:border-gray-300 transition-all shadow-sm active:scale-95"
                    >
                        Cerrar Panel
                    </button>
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
