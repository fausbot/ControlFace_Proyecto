// Catálogo de Datos del Sistema de Vigilancia
export const NOVELTIES_CATALOG = {
    'INC': { name: 'Incapacidad Médica', color: '#ef4444', badgeClass: 'bg-red-500/20 text-red-400 border-red-500/40', requiresSubstitute: true },
    'VAC': { name: 'Vacaciones', color: '#f59e0b', badgeClass: 'bg-amber-500/20 text-amber-400 border-amber-500/40', requiresSubstitute: true },
    'PRM': { name: 'Permiso Remunerado', color: '#3b82f6', badgeClass: 'bg-blue-500/20 text-blue-400 border-blue-500/40', requiresSubstitute: true },
    'PNR': { name: 'Permiso No Remunerado', color: '#6b7280', badgeClass: 'bg-gray-500/20 text-gray-400 border-gray-500/40', requiresSubstitute: true },
    'FAL': { name: 'Ausencia Injustificada', color: '#dc2626', badgeClass: 'bg-red-700/20 text-red-300 border-red-700/40', requiresSubstitute: true },
    'CAL': { name: 'Calamidad Doméstica', color: '#8b5cf6', badgeClass: 'bg-purple-500/20 text-purple-400 border-purple-500/40', requiresSubstitute: true },
    'MAT': { name: 'Licencia Maternidad/Paternidad', color: '#ec4899', badgeClass: 'bg-pink-500/20 text-pink-400 border-pink-500/40', requiresSubstitute: true },
    'SUS': { name: 'Suspensión Disciplinaria', color: '#b91c1c', badgeClass: 'bg-red-900/20 text-red-200 border-red-900/40', requiresSubstitute: true }
};

export const SHIFT_TYPES = {
    'D': { code: 'D', name: 'Día (06:00 - 18:00)', hours: 12, isNight: false, isRest: false, bgClass: 'bg-indigo-600/30 text-indigo-200 border-indigo-500/50' },
    'N': { code: 'N', name: 'Noche (18:00 - 06:00)', hours: 12, isNight: true, isRest: false, bgClass: 'bg-purple-900/50 text-purple-200 border-purple-500/50' },
    'X': { code: 'X', name: 'Descanso', hours: 0, isNight: false, isRest: true, bgClass: 'bg-gray-800/40 text-gray-400 border-gray-700/50' },
    'D-REL': { code: 'D-REL', name: 'Reemplazo Día', hours: 12, isNight: false, isRest: false, isRelief: true, bgClass: 'bg-emerald-600/40 text-emerald-200 border-emerald-500/70 font-semibold' },
    'N-REL': { code: 'N-REL', name: 'Reemplazo Noche', hours: 12, isNight: true, isRest: false, isRelief: true, bgClass: 'bg-cyan-600/40 text-cyan-200 border-cyan-500/70 font-semibold' }
};

export const ROTATION_SCHEMES = {
    '2D-2N-2X': { name: '2 Días Día - 2 Días Noche - 2 Descansos (24/7 Rotativo)', type: '24_7' },
    '4D-4N-2X': { name: '4 Días Día - 4 Días Noche - 2 Descansos (24/7 Rotativo)', type: '24_7' },
    'SOLO_DIA_12H': { name: 'Solo Diurno 5D-2X (06:00 - 18:00 | Máx 60h + Comodín en 2 Descansos)', type: '12_DIA' },
    'SOLO_NOCHE_12H': { name: 'Solo Nocturno 5N-2X (18:00 - 06:00 | Máx 60h + Comodín en 2 Descansos)', type: '12_NOCHE' },
    'COMODIN': { name: 'Relievista / Comodín (Rotativo Libre)', type: 'ROTATIVO' }
};

export const DEFAULT_CONTRACT_ROTATION_PATTERNS = {
    'FINCA_LA_GLORIA': '2D-2N-2X',
    'EDIFICIO_CENTRAL': '2D-2N-2X',
    'PARQUE_ALFA': '2D-2N-2X',
    'ALMACEN_DIURNO': 'SOLO_DIA_12H',
    'RELIEVISTA': 'COMODIN'
};

export const INITIAL_CONTRACTS = [
    { id: 'FINCA_LA_GLORIA', name: 'Finca La Gloria', postType: '24_7', defaultRotationPattern: '2D-2N-2X', totalPosts: 4, guardsNeeded: 12, description: '4 Puestos 24/7 (12 Vigilantes Fijos en Rotación 2D-2N-2X)', posts: ['Portería Principal', 'Recorredor 1', 'Recorredor 2', 'Portería 2'] },
    { id: 'EDIFICIO_CENTRAL', name: 'Edificio Central PH', postType: '24_7', defaultRotationPattern: '2D-2N-2X', totalPosts: 2, guardsNeeded: 6, description: '2 Puestos 24/7 (6 Vigilantes Fijos en Rotación 2D-2N-2X)', posts: ['Portería 1', 'Portería 2'] },
    { id: 'PARQUE_ALFA', name: 'Parque Industrial Alfa', postType: '24_7', defaultRotationPattern: '2D-2N-2X', totalPosts: 3, guardsNeeded: 9, description: '3 Puestos 24/7 (9 Vigilantes Fijos en Rotación 2D-2N-2X)', posts: ['Portería 1', 'Portería 2', 'Recorredor'] },
    { id: 'ALMACEN_DIURNO', name: 'Almacén Comercial (Solo Día)', postType: '12_DIA', defaultRotationPattern: 'SOLO_DIA_12H', totalPosts: 1, guardsNeeded: 1, preferredReliefGuardId: 'V004', description: '1 Puesto Diurno 12h (1 Vigilante Fijo Día + Comodín en Descansos)', posts: ['Acceso Peatonal'] },
    { id: 'RELIEVISTA', name: 'Pool Comodines / Relievistas', postType: 'ROTATIVO', defaultRotationPattern: 'COMODIN', totalPosts: 0, guardsNeeded: 5, description: 'Personal de reemplazo libre para incapacidades, vacaciones y licencias', posts: [] }
];

export const INITIAL_GUARDS = [
    // Finca La Gloria (4 Puestos 24/7 -> 12 Vigilantes Fijos: 3 por puesto, offsets 0, 2, 4)
    // Portería Principal
    { id: 'V001', cedula: '1012345671', name: 'Carlos Mario Restrepo', type: 'FIJO', contractId: 'FINCA_LA_GLORIA', rotationPattern: '2D-2N-2X', rotationOffset: 0 },
    { id: 'V002', cedula: '1012345672', name: 'John Jairo Bermúdez', type: 'FIJO', contractId: 'FINCA_LA_GLORIA', rotationPattern: '2D-2N-2X', rotationOffset: 2 },
    { id: 'V003', cedula: '1012345673', name: 'Luis Fernando Gómez', type: 'FIJO', contractId: 'FINCA_LA_GLORIA', rotationPattern: '2D-2N-2X', rotationOffset: 4 },
    // Recorredor 1
    { id: 'V004', cedula: '1012345674', name: 'Hernán Darío Valencia', type: 'FIJO', contractId: 'FINCA_LA_GLORIA', rotationPattern: '2D-2N-2X', rotationOffset: 0 },
    { id: 'V011', cedula: '1012345681', name: 'Camilo Ernesto Ruiz', type: 'FIJO', contractId: 'FINCA_LA_GLORIA', rotationPattern: '2D-2N-2X', rotationOffset: 2 },
    { id: 'V012', cedula: '1012345682', name: 'Mateo Cardona', type: 'FIJO', contractId: 'FINCA_LA_GLORIA', rotationPattern: '2D-2N-2X', rotationOffset: 4 },
    // Recorredor 2
    { id: 'V022', cedula: '1012345692', name: 'Santiago Montoya', type: 'FIJO', contractId: 'FINCA_LA_GLORIA', rotationPattern: '2D-2N-2X', rotationOffset: 0 },
    { id: 'V023', cedula: '1012345693', name: 'Manuel José Gaviria', type: 'FIJO', contractId: 'FINCA_LA_GLORIA', rotationPattern: '2D-2N-2X', rotationOffset: 2 },
    { id: 'V024', cedula: '1012345694', name: 'Rodrigo Antonio Cano', type: 'FIJO', contractId: 'FINCA_LA_GLORIA', rotationPattern: '2D-2N-2X', rotationOffset: 4 },
    // Portería 2
    { id: 'V101', cedula: '1098765431', name: 'Javier Alonso Parra', type: 'FIJO', contractId: 'FINCA_LA_GLORIA', rotationPattern: '2D-2N-2X', rotationOffset: 0 },
    { id: 'V103', cedula: '1098765433', name: 'Felipe Henao', type: 'FIJO', contractId: 'FINCA_LA_GLORIA', rotationPattern: '2D-2N-2X', rotationOffset: 2 },
    { id: 'V104', cedula: '1098765434', name: 'Cristian Camilo Marín', type: 'FIJO', contractId: 'FINCA_LA_GLORIA', rotationPattern: '2D-2N-2X', rotationOffset: 4 },

    // Almacén Comercial (1 Puesto Diurno 12h -> 1 Vigilante Fijo Día)
    { id: 'V025', cedula: '1012345695', name: 'Alba Lucía Ospina', type: 'FIJO', contractId: 'ALMACEN_DIURNO', rotationPattern: 'SOLO_DIA_12H', rotationOffset: 0 },

    // Edificio Central (2 Puestos 24/7 -> 6 Vigilantes Fijos: 3 por puesto)
    { id: 'V005', cedula: '1012345675', name: 'Andrés Felipe Ospina', type: 'FIJO', contractId: 'EDIFICIO_CENTRAL', rotationPattern: '2D-2N-2X', rotationOffset: 0 },
    { id: 'V006', cedula: '1012345676', name: 'Jorge Iván Marín', type: 'FIJO', contractId: 'EDIFICIO_CENTRAL', rotationPattern: '2D-2N-2X', rotationOffset: 2 },
    { id: 'V007', cedula: '1012345677', name: 'Diego Alejandro Londoño', type: 'FIJO', contractId: 'EDIFICIO_CENTRAL', rotationPattern: '2D-2N-2X', rotationOffset: 4 },
    { id: 'V008', cedula: '1012345678', name: 'Gustavo Adolfo Patiño', type: 'FIJO', contractId: 'EDIFICIO_CENTRAL', rotationPattern: '2D-2N-2X', rotationOffset: 0 },
    { id: 'V009', cedula: '1012345679', name: 'Mauricio Villa', type: 'FIJO', contractId: 'EDIFICIO_CENTRAL', rotationPattern: '2D-2N-2X', rotationOffset: 2 },
    { id: 'V010', cedula: '1012345680', name: 'Wilson Alberto Arango', type: 'FIJO', contractId: 'EDIFICIO_CENTRAL', rotationPattern: '2D-2N-2X', rotationOffset: 4 },

    // Parque Industrial Alfa (3 Puestos 24/7 -> 9 Vigilantes Fijos: 3 por puesto)
    { id: 'V013', cedula: '1012345683', name: 'Fabio Nelson Quintero', type: 'FIJO', contractId: 'PARQUE_ALFA', rotationPattern: '2D-2N-2X', rotationOffset: 0 },
    { id: 'V014', cedula: '1012345684', name: 'Jaime Enrique Tobón', type: 'FIJO', contractId: 'PARQUE_ALFA', rotationPattern: '2D-2N-2X', rotationOffset: 2 },
    { id: 'V015', cedula: '1012345685', name: 'Alvaro José Castrillón', type: 'FIJO', contractId: 'PARQUE_ALFA', rotationPattern: '2D-2N-2X', rotationOffset: 4 },
    { id: 'V016', cedula: '1012345686', name: 'Oscar de Jesús Henao', type: 'FIJO', contractId: 'PARQUE_ALFA', rotationPattern: '2D-2N-2X', rotationOffset: 0 },
    { id: 'V017', cedula: '1012345687', name: 'Sebastián Morales', type: 'FIJO', contractId: 'PARQUE_ALFA', rotationPattern: '2D-2N-2X', rotationOffset: 2 },
    { id: 'V018', cedula: '1012345688', name: 'Esteban Gil', type: 'FIJO', contractId: 'PARQUE_ALFA', rotationPattern: '2D-2N-2X', rotationOffset: 4 },
    { id: 'V019', cedula: '1012345689', name: 'Victor Hugo Salazar', type: 'FIJO', contractId: 'PARQUE_ALFA', rotationPattern: '2D-2N-2X', rotationOffset: 0 },
    { id: 'V020', cedula: '1012345690', name: 'David Alejandro Ríos', type: 'FIJO', contractId: 'PARQUE_ALFA', rotationPattern: '2D-2N-2X', rotationOffset: 2 },
    { id: 'V021', cedula: '1012345691', name: 'Gabriel Jaime Soto', type: 'FIJO', contractId: 'PARQUE_ALFA', rotationPattern: '2D-2N-2X', rotationOffset: 4 },

    // Pool de Comodines / Relievistas Libre (Alexander Ramírez queda disponible)
    { id: 'V102', cedula: '1098765432', name: 'Alexander Ramírez (Comodín)', type: 'RELIEVISTA', contractId: 'RELIEVISTA', rotationPattern: 'COMODIN', rotationOffset: 0 }
];
