import React from 'react';
import { CheckCircle } from 'lucide-react';

export default function SuccessView() {
    return (
        <div className="text-center p-10 bg-white rounded-2xl shadow-2xl animate-fade-in">
            <CheckCircle className="w-20 h-20 text-green-500 mx-auto mb-4" />
            <h2 className="text-2xl font-bold text-gray-800 mb-2">¡Registrado!</h2>
            <p className="text-gray-600">Registro guardado exitosamente.</p>
        </div>
    );
}
