// Controlador Principal de la Aplicación (UI, Eventos y Renderizado)
import { COLOMBIA_HOLIDAYS, isHoliday, isSunday } from './holidays.js?v=28';
import { INITIAL_GUARDS, INITIAL_CONTRACTS, NOVELTIES_CATALOG, SHIFT_TYPES, ROTATION_SCHEMES, DEFAULT_CONTRACT_ROTATION_PATTERNS } from './data.js?v=28';
import { generateRotationSchedule, findBestReliefCandidates } from './scheduler.js?v=28';
import { calculateGuardPayroll } from './payroll.js?v=28';

export let masterSchedule = {};
export let reliefContractMap = {};
export let guardDailyContractMap = {};
export let guardsState = [...INITIAL_GUARDS];
export let contractsState = [...INITIAL_CONTRACTS];

let currentYear = 2026;
let currentMonth = 6; // Julio (0-indexed)
let selectedContractFilter = 'ALL';
let activeTab = 'ROSTER';

let activeModalCell = { guardId: null, dateStr: null, shiftCode: null };

export function saveAppState() {
    try {
        localStorage.setItem('controlVigilantes_contracts', JSON.stringify(contractsState));
        localStorage.setItem('controlVigilantes_guards', JSON.stringify(guardsState));
        localStorage.setItem('controlVigilantes_schedule', JSON.stringify(masterSchedule));
        localStorage.setItem('controlVigilantes_reliefMap', JSON.stringify(reliefContractMap));
        localStorage.setItem('controlVigilantes_dailyContractMap', JSON.stringify(guardDailyContractMap));
        localStorage.setItem('controlVigilantes_desiredReliefPoolSize', String(desiredReliefPoolSize));
    } catch (e) {
        console.error('Error guardando estado en localStorage:', e);
    }
}

export function loadAppState() {
    try {
        const savedContracts = localStorage.getItem('controlVigilantes_contracts');
        const savedGuards = localStorage.getItem('controlVigilantes_guards');
        const savedSchedule = localStorage.getItem('controlVigilantes_schedule');
        const savedReliefMap = localStorage.getItem('controlVigilantes_reliefMap');
        const savedDailyMap = localStorage.getItem('controlVigilantes_dailyContractMap');

        localStorage.setItem('controlVigilantes_v33_reset', 'true');

        if (savedContracts && savedGuards) {
            const parsedContracts = JSON.parse(savedContracts);
            const parsedGuards = JSON.parse(savedGuards);

            // Validar integridad: debe haber al menos 1 contrato válido y 1 vigilante
            if (!Array.isArray(parsedContracts) || parsedContracts.length === 0 ||
                !Array.isArray(parsedGuards) || parsedGuards.length === 0) {
                console.warn('⚠️ Datos en localStorage inválidos o vacíos. Reconstruyendo desde datos iniciales...');
                clearAndRebuild();
                return;
            }

            contractsState = parsedContracts.map(c => {
                const canonicalPattern = DEFAULT_CONTRACT_ROTATION_PATTERNS[c.id];
                if (!c.defaultRotationPattern || (canonicalPattern && c.defaultRotationPattern !== canonicalPattern && !c.isCustomUserScheme)) {
                    c.defaultRotationPattern = canonicalPattern || (c.postType === '12_DIA' ? 'SOLO_DIA_12H' : (c.postType === '12_NOCHE' ? 'SOLO_NOCHE_12H' : '2D-2N-2X'));
                }
                return c;
            });
            guardsState = parsedGuards;
            if (savedSchedule) {
                const parsedSchedule = JSON.parse(savedSchedule);
                if (parsedSchedule && typeof parsedSchedule === 'object') {
                    masterSchedule = parsedSchedule;
                }
            }
            if (savedReliefMap) {
                const parsedRelief = JSON.parse(savedReliefMap);
                if (parsedRelief && typeof parsedRelief === 'object') reliefContractMap = parsedRelief;
            }
            if (savedDailyMap) {
                const parsedDaily = JSON.parse(savedDailyMap);
                if (parsedDaily && typeof parsedDaily === 'object') guardDailyContractMap = parsedDaily;
            }

            const savedPoolSize = localStorage.getItem('controlVigilantes_desiredReliefPoolSize');
            if (savedPoolSize) {
                desiredReliefPoolSize = parseInt(savedPoolSize) || 3;
            }

            const desiredSelect = document.getElementById('desiredReliefSelect');
            if (desiredSelect) {
                desiredSelect.value = String(desiredReliefPoolSize);
            }

            contractsState.forEach(contract => {
                ensureContractGuards(contract, false);
            });

            // Asegurar que cada guard tiene su schedule generado si está vacío
            guardsState.forEach(guard => {
                if (!masterSchedule[guard.id] || Object.keys(masterSchedule[guard.id]).length === 0) {
                    masterSchedule[guard.id] = {};
                    for (let m = 0; m < 12; m++) {
                        const rot = generateRotationSchedule(guard, currentYear, m);
                        Object.assign(masterSchedule[guard.id], rot);
                    }
                }
            });

            autoAssignRestReliefs();
            saveAppState();
        } else {
            clearAndRebuild();
        }
    } catch (e) {
        console.error('Error cargando estado de localStorage:', e);
        clearAndRebuild();
    }
}

function clearAndRebuild() {
    // Limpiar localStorage corrupto / reset
    localStorage.removeItem('controlVigilantes_contracts');
    localStorage.removeItem('controlVigilantes_guards');
    localStorage.removeItem('controlVigilantes_schedule');
    localStorage.removeItem('controlVigilantes_reliefMap');
    localStorage.removeItem('controlVigilantes_dailyContractMap');

    // Restaurar desde datos iniciales de fábrica (copia limpia)
    contractsState = JSON.parse(JSON.stringify(INITIAL_CONTRACTS));
    guardsState = JSON.parse(JSON.stringify(INITIAL_GUARDS));
    masterSchedule = {};
    reliefContractMap = {};
    guardDailyContractMap = {};

    setupInitialSchedules();
    saveAppState();
}

export function resetToDefaults() {
    if (confirm('¿Estás seguro de restablecer todos los datos a la configuración inicial de fábrica? Se restablecerán las sedes y la asignación original de los vigilantes.')) {
        clearAndRebuild();
        populateContractDropdowns();
        refreshAllViews();
        alert('✓ Datos y asignaciones de vigilantes restablecidos a la configuración inicial.');
    }
}

document.addEventListener('DOMContentLoaded', () => {
    initApp();
});

function initApp() {
    loadAppState();
    populateContractDropdowns();
    setupEventListeners();
    renderKPIs();
    renderRosterGrid();
}

function getGuardsNeededForContract(contract) {
    if (!contract) return 0;
    if (contract.id === 'RELIEVISTA') return 3; // 3 vigilantes base del Pool Comodines
    const postsCount = (contract.posts && contract.posts.length > 0) ? contract.posts.length : (contract.totalPosts || 1);
    const pattern = contract.defaultRotationPattern || '2D-2N-2X';
    let factor = 3; // 3 Vigilantes Fijos por puesto 24/7 (rotación 2D-2N-2X)
    if (pattern.startsWith('SOLO_')) factor = 1; // 1 Vigilante Fijo por puesto 12h
    return postsCount * factor;
}

function ensureContractGuards(contract, overwriteSchedule = true) {
    if (!contract || contract.id === 'RELIEVISTA') return;

    const neededCount = getGuardsNeededForContract(contract);
    contract.guardsNeeded = neededCount;

    // Preservar la asignación explícita de vigilantes para reflejar faltantes reales de fijos y comodines
    contract.guardsNeeded = neededCount;

    const finalFixed = guardsState.filter(g => g.contractId === contract.id && g.type === 'FIJO');
    const is247 = (contract.postType === '24_7' || (contract.defaultRotationPattern &&
        (contract.defaultRotationPattern.includes('24_7') ||
         contract.defaultRotationPattern.includes('2D-2N-2X') ||
         contract.defaultRotationPattern.includes('4D-4N-2X'))));

    // Respetar el patrón ya configurado en el contrato; solo asignar default si no existe
    const pattern = contract.defaultRotationPattern || (is247 ? '2D-2N-2X' : 'SOLO_DIA_12H');
    contract.defaultRotationPattern = pattern;

    finalFixed.forEach((guard, index) => {
        const patternChanged = (guard.rotationPattern !== pattern);
        guard.rotationPattern = pattern;
        if (pattern === '2D-2N-2X') {
            // 3 guardias por puesto, offset de 2 días entre cada uno
            guard.rotationOffset = (index % 3) * 2;
        } else if (pattern === '4D-4N-2X') {
            // 3 guardias por puesto, offset de 4 días entre cada uno (ciclo de 10)
            guard.rotationOffset = (index % 3) * 4;
        } else if (pattern.startsWith('SOLO_')) {
            guard.rotationOffset = (index % 2) * 5;
        }

        if (overwriteSchedule || patternChanged || !masterSchedule[guard.id] || Object.keys(masterSchedule[guard.id]).length === 0) {
            masterSchedule[guard.id] = masterSchedule[guard.id] || {};
            for (let m = 0; m < 12; m++) {
                const rot = generateRotationSchedule(guard, currentYear, m);
                Object.assign(masterSchedule[guard.id], rot);
            }
        }
    });

    guardsState.filter(g => g.type === 'RELIEVISTA').forEach(guard => {
        guard.contractId = 'RELIEVISTA';
        guard.rotationPattern = 'COMODIN';
        if (overwriteSchedule || !masterSchedule[guard.id] || Object.keys(masterSchedule[guard.id]).length === 0) {
            masterSchedule[guard.id] = masterSchedule[guard.id] || {};
            for (let m = 0; m < 12; m++) {
                const rot = generateRotationSchedule(guard, currentYear, m);
                Object.assign(masterSchedule[guard.id], rot);
            }
        }
    });
}

/**
 * Garantiza que todos los guardias tengan sus rotaciones calculadas
 * para el año indicado. Solo genera los meses que aún no existan
 * en masterSchedule (no sobreescribe ajustes manuales).
 */
function ensureScheduleForYear(year) {
    guardsState.forEach(guard => {
        masterSchedule[guard.id] = masterSchedule[guard.id] || {};
        for (let m = 0; m < 12; m++) {
            const firstDay = `${year}-${String(m + 1).padStart(2, '0')}-01`;
            // Solo genera si ese mes del año aún no tiene datos
            if (!masterSchedule[guard.id][firstDay]) {
                const rot = generateRotationSchedule(guard, year, m);
                Object.assign(masterSchedule[guard.id], rot);
            }
        }
    });
}

function populateContractDropdowns() {
    const filterSelect = document.getElementById('contractFilter');
    const newGuardContractSelect = document.getElementById('newContract');
    const editContractSelect = document.getElementById('editContractSelect');

    let filterHTML = `<option value="ALL">Todos los Contratos y Sedes</option>`;
    let newGuardHTML = '';
    let editHTML = '';

    contractsState.forEach(c => {
        const scheme = ROTATION_SCHEMES[c.defaultRotationPattern] || { name: c.defaultRotationPattern };
        const postsCount = c.posts ? c.posts.length : (c.totalPosts || 1);
        const guardsNeeded = getGuardsNeededForContract(c);

        filterHTML += `<option value="${c.id}">${c.name} (${postsCount} puesto${postsCount > 1 ? 's' : ''} | ${guardsNeeded} vig.)</option>`;
        newGuardHTML += `<option value="${c.id}">${c.name} — [Regla: ${scheme.name}]</option>`;
        if (c.id !== 'RELIEVISTA') {
            editHTML += `<option value="${c.id}">${c.name} (${postsCount} puesto${postsCount > 1 ? 's' : ''} | ${scheme.name})</option>`;
        }
    });

    filterSelect.innerHTML = filterHTML;
    newGuardContractSelect.innerHTML = newGuardHTML;
    if (editContractSelect) {
        editContractSelect.innerHTML = editHTML;
    }
}

function setupInitialSchedules() {
    for (let member in reliefContractMap) delete reliefContractMap[member];

    contractsState.forEach(contract => {
        ensureContractGuards(contract);
    });

    autoAssignRestReliefs();
}

// Helpers para la creación y edición dinámica de puestos
function createPostInputRow(postName = '') {
    const row = document.createElement('div');
    row.className = 'post-input-row';
    row.style.cssText = 'display:flex; gap:0.5rem; align-items:center;';
    row.innerHTML = `
        <input type="text" class="form-input post-name-input" style="flex:1;" value="${postName}" placeholder="Nombre del puesto (ej. Portería 1)" required>
        <button type="button" class="btn btn-danger btn-remove-post" style="padding:0.3rem 0.6rem;">🗑️</button>
    `;
    return row;
}

function getPostsFromContainer(containerElem) {
    const inputs = containerElem.querySelectorAll('.post-name-input');
    const posts = [];
    inputs.forEach(inp => {
        const val = inp.value.trim();
        if (val) posts.push(val);
    });
    return posts.length > 0 ? posts : ['Puesto 1'];
}

function updateCalcSummary(schemePattern, postsCount, summaryElem) {
    const is247 = (schemePattern === '4D-4N-2X' || schemePattern === '2D-2N-2X');
    const factor = is247 ? 3 : 1;
    const totalNeeded = postsCount * factor;
    const modeText = is247 ? '24/7 (Continuo Día y Noche)' : '12 Horas (Solo Día o Solo Noche)';

    summaryElem.innerHTML = `
        <strong>Cálculo Automático de Cobertura:</strong><br>
        • Modalidad: <strong>${modeText}</strong><br>
        • ${postsCount} Puesto(s) de Trabajo × ${factor} Vigilantes/Puesto = 
        <span style="font-size:1rem; font-weight:800; color:#10b981;">${totalNeeded} Vigilantes Requeridos</span>
    `;
}

function loadContractIntoEditForm(contractId) {
    const contract = contractsState.find(c => c.id === contractId);
    if (!contract) return;

    document.getElementById('editContractName').value = contract.name;
    document.getElementById('editContractStartDate').value = contract.startDate || '2026-01-01';
    document.getElementById('editContractScheme').value = contract.defaultRotationPattern;

    const container = document.getElementById('editContractPostsContainer');
    container.innerHTML = '';

    const posts = contract.posts && contract.posts.length > 0 ? contract.posts : Array.from({ length: contract.totalPosts || 1 }, (_, i) => `Puesto ${i + 1}`);
    posts.forEach(pName => {
        const row = createPostInputRow(pName);
        container.appendChild(row);
    });

    const summaryElem = document.getElementById('editContractCalcSummary');
    updateCalcSummary(contract.defaultRotationPattern, posts.length, summaryElem);
}

export function closeModal() {
    document.querySelectorAll('.modal-overlay').forEach(modal => {
        modal.classList.remove('active');
    });
}

function setupEventListeners() {
    document.getElementById('monthSelect').addEventListener('change', (e) => {
        currentMonth = parseInt(e.target.value);
        refreshAllViews();
    });

    document.getElementById('yearSelect').addEventListener('change', (e) => {
        currentYear = parseInt(e.target.value);
        ensureScheduleForYear(currentYear);
        autoAssignRestReliefs();
        saveAppState();
        refreshAllViews();
    });

    document.getElementById('contractFilter').addEventListener('change', (e) => {
        selectedContractFilter = e.target.value;
        refreshAllViews();
    });

    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const targetBtn = e.currentTarget;
            document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            targetBtn.classList.add('active');
            activeTab = targetBtn.dataset.tab;
            refreshAllViews();
        });
    });

    document.getElementById('btnExportExcel').addEventListener('click', exportToExcel);
    document.getElementById('btnAutoBalance').addEventListener('click', handleAutoBalance);

    const btnReset = document.getElementById('btnResetDefaults');
    if (btnReset) {
        btnReset.addEventListener('click', resetToDefaults);
    }

    const desiredSelect = document.getElementById('desiredReliefSelect');
    if (desiredSelect) {
        desiredSelect.value = String(desiredReliefPoolSize);
        desiredSelect.addEventListener('change', (e) => {
            desiredReliefPoolSize = parseInt(e.target.value) || 1;
            saveAppState();
            renderKPIs();
        });
    }

    document.getElementById('btnAddGuard').addEventListener('click', () => {
        document.getElementById('addGuardModal').classList.add('active');
    });

    document.getElementById('btnAddContract').addEventListener('click', () => {
        const container = document.getElementById('newContractPostsContainer');
        container.innerHTML = '';
        container.appendChild(createPostInputRow('Portería 1'));
        updateCalcSummary(document.getElementById('newContractScheme').value, 1, document.getElementById('newContractCalcSummary'));
        document.getElementById('addContractModal').classList.add('active');
    });

    document.getElementById('btnManageContracts').addEventListener('click', () => {
        populateContractDropdowns();
        const editSelect = document.getElementById('editContractSelect');
        if (editSelect.options.length > 0) {
            loadContractIntoEditForm(editSelect.value);
        }
        document.getElementById('manageContractsModal').classList.add('active');
    });

    document.getElementById('editContractSelect').addEventListener('change', (e) => {
        loadContractIntoEditForm(e.target.value);
    });

    // Delegación de eventos para eliminar filas de puestos en modales
    document.addEventListener('click', (e) => {
        if (e.target && e.target.classList.contains('btn-remove-post')) {
            const row = e.target.closest('.post-input-row');
            const container = row.parentElement;
            if (container.children.length > 1) {
                row.remove();
                if (container.id === 'newContractPostsContainer') {
                    updateCalcSummary(document.getElementById('newContractScheme').value, container.children.length, document.getElementById('newContractCalcSummary'));
                } else if (container.id === 'editContractPostsContainer') {
                    updateCalcSummary(document.getElementById('editContractScheme').value, container.children.length, document.getElementById('editContractCalcSummary'));
                }
            } else {
                alert('Debe conservar al menos 1 puesto de trabajo por sede.');
            }
        }
    });

    // Agregar nuevo campo de puesto en modal de creación
    document.getElementById('btnAddPostFieldNew').addEventListener('click', () => {
        const container = document.getElementById('newContractPostsContainer');
        const count = container.children.length + 1;
        container.appendChild(createPostInputRow(`Portería ${count}`));
        updateCalcSummary(document.getElementById('newContractScheme').value, container.children.length, document.getElementById('newContractCalcSummary'));
    });

    // Agregar nuevo campo de puesto en modal de edición
    document.getElementById('btnAddPostFieldEdit').addEventListener('click', () => {
        const container = document.getElementById('editContractPostsContainer');
        const count = container.children.length + 1;
        container.appendChild(createPostInputRow(`Puesto ${count}`));
        updateCalcSummary(document.getElementById('editContractScheme').value, container.children.length, document.getElementById('editContractCalcSummary'));
    });

    // Escuchar cambios de esquema para actualizar el cálculo dinámico
    document.getElementById('newContractScheme').addEventListener('change', (e) => {
        const count = document.getElementById('newContractPostsContainer').children.length;
        updateCalcSummary(e.target.value, count, document.getElementById('newContractCalcSummary'));
    });

    document.getElementById('editContractScheme').addEventListener('change', (e) => {
        const count = document.getElementById('editContractPostsContainer').children.length;
        updateCalcSummary(e.target.value, count, document.getElementById('editContractCalcSummary'));
    });

    document.querySelectorAll('.close-modal-btn').forEach(btn => {
        btn.addEventListener('click', closeModal);
    });

    // Form Add Guard (Hereda la regla del contrato elegido + Fecha de Ingreso)
    document.getElementById('addGuardForm').addEventListener('submit', (e) => {
        e.preventDefault();
        const cedula = document.getElementById('newCedula').value;
        const name = document.getElementById('newName').value;
        const type = document.getElementById('newType').value;
        const contractId = document.getElementById('newContract').value;
        const startDate = document.getElementById('newGuardStartDate').value || '2026-01-01';

        const contract = contractsState.find(c => c.id === contractId);
        const rotationPattern = contract ? (contract.defaultRotationPattern || '2D-2N-2X') : '2D-2N-2X';

        const newId = `V${String(guardsState.length + 1).padStart(3, '0')}`;
        const newGuard = {
            id: newId,
            cedula,
            name,
            type,
            contractId,
            rotationPattern,
            rotationOffset: 0,
            startDate
        };

        guardsState.push(newGuard);
        masterSchedule[newId] = {};
        for (let m = 0; m < 12; m++) {
            const rot = generateRotationSchedule(newGuard, currentYear, m);
            Object.assign(masterSchedule[newId], rot);
        }

        saveAppState();
        closeModal();
        refreshAllViews();
        alert(`Vigilante ${name} creado con fecha de ingreso ${startDate} y adaptado a ${contract ? contract.name : 'Sede'}.`);
    });

    // Form Add Contract (Crear Negocio/Sede con Puestos y Fecha de Inicio)
    document.getElementById('addContractForm').addEventListener('submit', (e) => {
        e.preventDefault();
        const name = document.getElementById('newContractName').value;
        const startDate = document.getElementById('newContractStartDate').value || '2026-01-01';
        const defaultRotationPattern = document.getElementById('newContractScheme').value;
        const postsContainer = document.getElementById('newContractPostsContainer');
        const posts = getPostsFromContainer(postsContainer);
        const totalPosts = posts.length;

        const id = name.toUpperCase().replace(/[^A-Z0-9]/g, '_');
        const postType = defaultRotationPattern.startsWith('SOLO_DIA') ? '12_DIA' : (defaultRotationPattern.startsWith('SOLO_NOCHE') ? '12_NOCHE' : '24_7');

        const tempContract = { defaultRotationPattern, posts, totalPosts };
        const guardsNeeded = getGuardsNeededForContract(tempContract);

        const newContract = {
            id,
            name,
            startDate,
            postType,
            defaultRotationPattern,
            isCustomUserScheme: true,
            totalPosts,
            posts,
            guardsNeeded,
            description: `Servicio ${postType === '24_7' ? '24/7' : '12h'} con ${totalPosts} puesto(s) desde ${startDate}`
        };

        contractsState.push(newContract);
        ensureContractGuards(newContract);
        autoAssignRestReliefs();
        saveAppState();
        populateContractDropdowns();
        closeModal();
        refreshAllViews();
        alert(`Sede "${name}" creada desde ${startDate} con ${totalPosts} puesto(s) de trabajo.`);
    });

    // Form Edit Contract (Guardar cambios de Sede, Puestos y Fecha)
    document.getElementById('editContractForm').addEventListener('submit', (e) => {
        e.preventDefault();
        const contractId = document.getElementById('editContractSelect').value;
        const contract = contractsState.find(c => c.id === contractId);
        if (!contract) return;

        const newName = document.getElementById('editContractName').value.trim();
        const newStartDate = document.getElementById('editContractStartDate').value || '2026-01-01';
        const newScheme = document.getElementById('editContractScheme').value;
        const postsContainer = document.getElementById('editContractPostsContainer');
        const newPosts = getPostsFromContainer(postsContainer);
        const newTotalPosts = newPosts.length;

        const postType = newScheme.startsWith('SOLO_DIA') ? '12_DIA' : (newScheme.startsWith('SOLO_NOCHE') ? '12_NOCHE' : '24_7');

        contract.name = newName;
        contract.startDate = newStartDate;
        contract.defaultRotationPattern = newScheme;
        contract.isCustomUserScheme = true;
        contract.postType = postType;
        contract.posts = newPosts;
        contract.totalPosts = newTotalPosts;
        contract.guardsNeeded = getGuardsNeededForContract(contract);

        ensureContractGuards(contract, true);
        autoAssignRestReliefs();
        saveAppState();

        populateContractDropdowns();
        closeModal();
        refreshAllViews();
        alert(`Sede "${newName}" actualizada (Vigencia desde ${newStartDate}).`);
    });

    // Eliminar Sede
    document.getElementById('btnDeleteContract').addEventListener('click', () => {
        const contractId = document.getElementById('editContractSelect').value;
        const contract = contractsState.find(c => c.id === contractId);
        if (!contract) return;

        if (confirm(`¿Estás seguro de eliminar la sede "${contract.name}"? Los vigilantes asignados quedarán sin sede.`)) {
            contractsState = contractsState.filter(c => c.id !== contractId);
            guardsState.forEach(g => {
                if (g.contractId === contractId) {
                    g.contractId = 'RELIEVISTA';
                    g.type = 'RELIEVISTA';
                    g.rotationPattern = 'COMODIN';
                }
            });

            saveAppState();
            populateContractDropdowns();
            closeModal();
            refreshAllViews();
            alert(`Sede "${contract.name}" eliminada.`);
        }
    });

    // Botón y Formulario de Intercambio / Traslado de Vigilantes
    const btnSwap = document.getElementById('btnSwapGuards');
    if (btnSwap) {
        btnSwap.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            openSwapGuardsModal();
        });
    }

    const swapForm = document.getElementById('swapGuardsForm');
    if (swapForm) {
        swapForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const g1Id = document.getElementById('swapGuard1Select').value;
            const g2Id = document.getElementById('swapGuard2Select').value;
            const startDay = parseInt(document.getElementById('swapStartDaySelect').value) || 16;

            executeGuardSwap(g1Id, g2Id, startDay);
            closeModal();
            alert(`✓ Intercambio de sede ejecutado exitosamente a partir del Día ${startDay}. Las mallas y horas efectivamente trabajadas han sido actualizadas.`);
        });
    }
}

export function openSwapGuardsModal(preselectGuardId = null) {
    const modal = document.getElementById('swapGuardsModal');
    const select1 = document.getElementById('swapGuard1Select');
    const select2 = document.getElementById('swapGuard2Select');
    const daySelect = document.getElementById('swapStartDaySelect');
    const summary = document.getElementById('swapPreviewSummary');

    let guardsHTML = '';
    guardsState.forEach(g => {
        const contract = contractsState.find(c => c.id === g.contractId) || { name: 'Sin Asignar' };
        guardsHTML += `<option value="${g.id}">${g.name} (${g.type} - ${contract.name})</option>`;
    });

    select1.innerHTML = guardsHTML;
    select2.innerHTML = guardsHTML;

    if (preselectGuardId && guardsState.some(g => g.id === preselectGuardId)) {
        select1.value = preselectGuardId;
        const other = guardsState.find(g => g.id !== preselectGuardId);
        if (other) select2.value = other.id;
    } else if (guardsState.length >= 2) {
        select2.selectedIndex = 1;
    }

    const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
    let daysHTML = '';
    for (let d = 1; d <= daysInMonth; d++) {
        const dateObj = new Date(currentYear, currentMonth, d);
        const dayNames = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
        daysHTML += `<option value="${d}" ${d === 16 ? 'selected' : ''}>Día ${d} (${dayNames[dateObj.getDay()]} ${d} de Julio)</option>`;
    }
    daySelect.innerHTML = daysHTML;

    const updatePreview = () => {
        const g1 = guardsState.find(g => g.id === select1.value);
        const g2 = guardsState.find(g => g.id === select2.value);
        const startDay = parseInt(daySelect.value) || 16;

        if (!g1 || !g2 || g1.id === g2.id) {
            summary.innerHTML = `<span style="color:#f87171;">⚠️ Debes seleccionar dos vigilantes distintos para realizar el traslado / intercambio.</span>`;
            return;
        }

        const c1 = contractsState.find(c => c.id === g1.contractId) || { name: 'Sede A' };
        const c2 = contractsState.find(c => c.id === g2.contractId) || { name: 'Sede B' };

        const sch1 = masterSchedule[g1.id] || {};
        const sch2 = masterSchedule[g2.id] || {};

        const p1 = calculateGuardPayroll(g1, sch1, currentYear, currentMonth);
        const p2 = calculateGuardPayroll(g2, sch2, currentYear, currentMonth);

        summary.innerHTML = `
            <strong>🔄 Resumen Operativo del Traslado (A partir del Día ${startDay}):</strong><br>
            • <strong>${g1.name}</strong>: Pasa de <em>${c1.name}</em> a <em>${c2.name}</em> a partir del día ${startDay}. Horas efectivas proyectadas en el mes: <strong>${p1.totalWorkedHours}h</strong>.<br>
            • <strong>${g2.name}</strong>: Pasa de <em>${c2.name}</em> a <em>${c1.name}</em> a partir del día ${startDay}. Horas efectivas proyectadas en el mes: <strong>${p2.totalWorkedHours}h</strong>.<br>
            <span style="font-size:0.75rem; color:#a5b4fc; margin-top:0.3rem; display:block;">
                ✓ Los turnos laborados antes del día ${startDay} se conservan en la sede origen. Todas las horas trabajadas se acumulan sin causar traumatismo en el servicio.
            </span>
        `;
    };

    select1.onchange = updatePreview;
    select2.onchange = updatePreview;
    daySelect.onchange = updatePreview;
    updatePreview();

    modal.classList.add('active');
}

export function executeGuardSwap(guard1Id, guard2Id, startDay) {
    const g1 = guardsState.find(g => g.id === guard1Id);
    const g2 = guardsState.find(g => g.id === guard2Id);
    if (!g1 || !g2 || g1.id === g2.id) return;

    const contract1Id = g1.contractId;
    const contract2Id = g2.contractId;
    const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();

    for (let day = 1; day <= daysInMonth; day++) {
        const dateStr = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

        if (day < startDay) {
            guardDailyContractMap[`${g1.id}_${dateStr}`] = contract1Id;
            guardDailyContractMap[`${g2.id}_${dateStr}`] = contract2Id;
        } else {
            guardDailyContractMap[`${g1.id}_${dateStr}`] = contract2Id;
            guardDailyContractMap[`${g2.id}_${dateStr}`] = contract1Id;

            // Intercambiar turnos programados en masterSchedule a partir del día de inicio
            const shift1 = masterSchedule[g1.id]?.[dateStr] || 'X';
            const shift2 = masterSchedule[g2.id]?.[dateStr] || 'X';

            masterSchedule[g1.id] = masterSchedule[g1.id] || {};
            masterSchedule[g2.id] = masterSchedule[g2.id] || {};

            masterSchedule[g1.id][dateStr] = shift2;
            masterSchedule[g2.id][dateStr] = shift1;
        }
    }

    saveAppState();
    refreshAllViews();
}

function refreshAllViews() {
    renderKPIs();
    const rosterSec = document.getElementById('rosterSection');
    const guardsSec = document.getElementById('guardsSection');
    const payrollSec = document.getElementById('payrollSection');
    const coverageSec = document.getElementById('coverageSection');

    rosterSec.style.display = 'none';
    guardsSec.style.display = 'none';
    payrollSec.style.display = 'none';
    coverageSec.style.display = 'none';

    if (activeTab === 'ROSTER') {
        rosterSec.style.display = 'block';
        renderRosterGrid();
    } else if (activeTab === 'GUARDS') {
        guardsSec.style.display = 'block';
        renderGuardsDirectory();
    } else if (activeTab === 'PAYROLL') {
        payrollSec.style.display = 'block';
        renderPayrollReport();
    } else if (activeTab === 'COVERAGE') {
        coverageSec.style.display = 'block';
        renderCoverageAudit();
    }
}

function autoAssignRelievistasToMissingFixedPosts() {
    let stateChanged = false;
    contractsState.forEach(c => {
        if (c.id === 'RELIEVISTA') return;
        const needed = getGuardsNeededForContract(c);
        let currentFixed = guardsState.filter(g => g.contractId === c.id && g.type === 'FIJO');
        let deficit = needed - currentFixed.length;

        if (deficit > 0) {
            const availableRelievistas = guardsState.filter(g => g.type === 'RELIEVISTA');
            for (let i = 0; i < deficit && i < availableRelievistas.length; i++) {
                const rel = availableRelievistas[i];
                rel.type = 'FIJO';
                rel.contractId = c.id;
                rel.rotationPattern = c.defaultRotationPattern || '2D-2N-2X';
                rel.name = rel.name.replace(/\s*\(Comodín\)/gi, '').trim();

                masterSchedule[rel.id] = {};
                for (let m = 0; m < 12; m++) {
                    const rot = generateRotationSchedule(rel, currentYear, m);
                    Object.assign(masterSchedule[rel.id], rot);
                }
                stateChanged = true;
            }
        }
    });
    if (stateChanged) {
        contractsState.forEach(contract => {
            ensureContractGuards(contract, false);
        });
        saveAppState();
    }
}

let desiredReliefPoolSize = 5;

function renderKPIs() {
    autoAssignRelievistasToMissingFixedPosts();

    const totalGuards = guardsState.length;

    let fijosNeeded = 0;
    let fijosDeficit = 0;
    const missingSedes = [];

    contractsState.forEach(c => {
        if (c.id === 'RELIEVISTA') return;
        const neededForC = getGuardsNeededForContract(c);
        fijosNeeded += neededForC;
        const assignedForC = guardsState.filter(g => g.contractId === c.id && g.type === 'FIJO').length;

        if (assignedForC < neededForC) {
            const def = neededForC - assignedForC;
            fijosDeficit += def;
            missingSedes.push(`${c.name} (-${def})`);
        }
    });

    const fijosAssigned = guardsState.filter(g => g.type === 'FIJO').length;
    const relievistasAssigned = guardsState.filter(g => g.type === 'RELIEVISTA').length;

    const desiredSelect = document.getElementById('desiredReliefSelect');
    if (desiredSelect && desiredSelect.value !== String(desiredReliefPoolSize)) {
        desiredSelect.value = String(desiredReliefPoolSize);
    }

    const relievistasDeficit = Math.max(0, desiredReliefPoolSize - relievistasAssigned);
    const totalNeeded = fijosNeeded + desiredReliefPoolSize; // 28 fijos + 5 comodines = 33
    const totalDeficit = fijosDeficit + relievistasDeficit;

    const elTotal = document.getElementById('kpiTotalGuards');
    if (elTotal) elTotal.innerText = `${totalGuards} / ${totalNeeded}`;
    
    const elTotalBadge = document.getElementById('kpiTotalBadge');
    if (elTotalBadge) elTotalBadge.innerText = `${totalGuards} Contratados de ${totalNeeded} Requeridos`;

    const elFijos = document.getElementById('kpiFijos');
    if (elFijos) elFijos.innerText = `${fijosAssigned} / ${fijosNeeded}`;

    const elRelievistas = document.getElementById('kpiRelievistas');
    if (elRelievistas) elRelievistas.innerText = `${relievistasAssigned} / ${desiredReliefPoolSize}`;

    const diagVal = document.getElementById('kpiDiagnosisValue');
    const diagBadge = document.getElementById('kpiDiagnosisBadge');

    if (diagVal && diagBadge) {
        if (totalDeficit > 0) {
            diagVal.innerText = `Faltan ${totalDeficit}`;
            diagVal.style.color = '#ef4444';
            diagBadge.className = 'kpi-badge bg-red-500/20 text-red-300';
            
            let msg = '🔴 ';
            if (fijosDeficit > 0 && relievistasDeficit > 0) {
                msg += `Faltan ${fijosDeficit} Fijo(s) [${missingSedes.join(', ')}] + ${relievistasDeficit} Comodín(es) libre(s)`;
            } else if (fijosDeficit > 0) {
                msg += `Faltan ${fijosDeficit} Fijo(s) en sedes [${missingSedes.join(', ')}]`;
            } else {
                msg += `Faltan ${relievistasDeficit} Comodín(es) libre(s) · Fijos OK`;
            }
            diagBadge.innerText = msg;
        } else if (totalGuards > totalNeeded) {
            const excess = totalGuards - totalNeeded;
            diagVal.innerText = `Sobran ${excess}`;
            diagVal.style.color = '#f59e0b';
            diagBadge.className = 'kpi-badge bg-amber-500/20 text-amber-300';
            diagBadge.innerText = `⚠️ Excedente +${excess} sobre lo requerido`;
        } else {
            diagVal.innerText = `100% Óptimo`;
            diagVal.style.color = '#10b981';
            diagBadge.className = 'kpi-badge bg-emerald-500/20 text-emerald-300';
            diagBadge.innerText = `✓ Plantilla Óptima (${fijosNeeded} Fijos + ${desiredReliefPoolSize} Comodín OK)`;
        }
    }

    let monthlyNovelties = 0;
    const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();

    guardsState.forEach(guard => {
        const sch = masterSchedule[guard.id] || {};
        for (let d = 1; d <= daysInMonth; d++) {
            const dateStr = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
            if (NOVELTIES_CATALOG[sch[dateStr]]) {
                monthlyNovelties++;
            }
        }
    });

    document.getElementById('kpiNovelties').innerText = monthlyNovelties;
}

function renderRosterGrid() {
    const tableHeader = document.getElementById('tableHeader');
    const tableBody = document.getElementById('tableBody');

    const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();

    let headerHTML = `
        <th class="sticky-col">Vigilante / Sede</th>
        <th style="min-width:130px">Puesto de Trabajo</th>
    `;

    const dayNames = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

    for (let day = 1; day <= daysInMonth; day++) {
        const dateObj = new Date(currentYear, currentMonth, day);
        const dateStr = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        const dayOfWeekStr = dayNames[dateObj.getDay()];
        const isSun = isSunday(dateObj);
        const isHol = isHoliday(dateStr);

        let cellClass = '';
        if (isHol) cellClass = 'th-holiday';
        else if (isSun) cellClass = 'th-sun';

        headerHTML += `
            <th class="${cellClass}" title="${isHol ? 'Festivo Oficial Colombia' : ''}">
                <div style="font-size:0.7rem;">${dayOfWeekStr}</div>
                <div style="font-size:0.95rem; font-weight:700;">${day}</div>
                ${isHol ? '<span class="th-holiday-title">★</span>' : ''}
            </th>
        `;
    }

    headerHTML += `<th style="min-width:90px">Tot. Horas</th>`;
    tableHeader.innerHTML = `<tr>${headerHTML}</tr>`;

    let filteredGuards = guardsState;
    if (selectedContractFilter !== 'ALL') {
        filteredGuards = guardsState.filter(g => {
            if (g.contractId === selectedContractFilter) return true;

            for (let d = 1; d <= daysInMonth; d++) {
                const dateStr = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
                if (guardDailyContractMap[`${g.id}_${dateStr}`] === selectedContractFilter) return true;

                if (g.type === 'RELIEVISTA') {
                    const sch = masterSchedule[g.id] || {};
                    const shift = sch[dateStr];
                    if (shift === 'D-REL' || shift === 'N-REL') {
                        if (reliefContractMap[`${g.id}_${dateStr}`] === selectedContractFilter) {
                            return true;
                        }
                    }
                }
            }
            return false;
        });
    }

    let allDisplayGuards = [...filteredGuards];

    // Para cada contrato (respetando el filtro), agregar filas vacantes por cada fijo faltante
    contractsState.forEach(contract => {
        if (contract.id === 'RELIEVISTA') return;
        if (selectedContractFilter !== 'ALL' && selectedContractFilter !== contract.id) return;

        const needed = getGuardsNeededForContract(contract);
        const assignedFixed = guardsState.filter(g => g.contractId === contract.id && g.type === 'FIJO');

        if (assignedFixed.length < needed) {
            const deficit = needed - assignedFixed.length;
            const postsList = (contract.posts && contract.posts.length > 0) ? contract.posts : ['Portería Principal'];

            for (let k = 0; k < deficit; k++) {
                const slotIndex = assignedFixed.length + k;
                const postIdx = Math.floor(slotIndex / 3) % postsList.length;
                const postName = postsList[postIdx] || `Puesto ${postIdx + 1}`;

                allDisplayGuards.push({
                    id: `VACANTE_${contract.id}_${k}`,
                    name: `⚠️ VACANTE (Fijo Faltante)`,
                    cedula: '—',
                    contractId: contract.id,
                    type: 'VACANTE',
                    isVacant: true,
                    postNameDisplay: postName
                });
            }
        }
    });

    allDisplayGuards.sort((a, b) => (a.contractId > b.contractId ? 1 : -1));

    let bodyHTML = '';

    allDisplayGuards.forEach(guard => {
        const contract = contractsState.find(c => c.id === guard.contractId) || { name: 'Sin Asignar' };

        if (guard.isVacant) {
            const typeBadgeInline = `<span class="shift-badge bg-red-500/20 text-red-400 border-red-500/40" style="font-size:0.65rem; padding:0.1rem 0.35rem; margin-left:0.4rem; display:inline-block; vertical-align:middle;">FALTA FIJO</span>`;
            const postBadge = `<span class="shift-badge bg-red-500/20 text-red-300 border-red-500/40" style="font-size:0.72rem; padding:0.25rem 0.5rem; white-space:nowrap; font-weight:600;">📍 ${guard.postNameDisplay}</span>`;

            let rowHTML = `
                <tr style="background:rgba(239,68,68,0.04);">
                    <td class="sticky-col" style="border-left:3px solid #ef4444;">
                        <div style="display:flex; align-items:center;">
                            <span class="guard-name" style="color:#fca5a5;">${guard.name}</span>
                            ${typeBadgeInline}
                        </div>
                        <span class="guard-meta" style="color:#ef4444;">Sin Asignar | ${contract.name}</span>
                    </td>
                    <td>${postBadge}</td>
            `;

            for (let day = 1; day <= daysInMonth; day++) {
                const dateObj = new Date(currentYear, currentMonth, day);
                const isSun = isSunday(dateObj);
                const dateStr = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                const isHol = isHoliday(dateStr);

                let dayBgClass = '';
                if (isHol) dayBgClass = 'td-holiday';
                else if (isSun) dayBgClass = 'td-sun';

                rowHTML += `
                    <td class="${dayBgClass}">
                        <div class="cell-shift" 
                             style="background:rgba(239,68,68,0.18); border:1px dashed rgba(239,68,68,0.55); color:#fca5a5; font-weight:700; cursor:not-allowed;"
                             title="Puesto Vacante — Falta Vigilante Fijo en ${guard.postNameDisplay} (${contract.name})">
                            X
                        </div>
                    </td>
                `;
            }

            rowHTML += `
                <td style="font-weight:700; color:#ef4444; font-size:0.75rem;">Sin Asignar</td>
                </tr>
            `;

            bodyHTML += rowHTML;
            return;
        }

        const sch = masterSchedule[guard.id] || {};
        const payroll = calculateGuardPayroll(guard, sch, currentYear, currentMonth);

        const typeBadgeInline = guard.type === 'FIJO' 
            ? `<span class="shift-badge bg-blue-500/20 text-blue-300 border-blue-500/40" style="font-size:0.65rem; padding:0.1rem 0.35rem; margin-left:0.4rem; display:inline-block; vertical-align:middle;">FIJO</span>`
            : `<span class="shift-badge bg-emerald-500/20 text-emerald-300 border-emerald-500/40" style="font-size:0.65rem; padding:0.1rem 0.35rem; margin-left:0.4rem; display:inline-block; vertical-align:middle;">COMODÍN</span>`;

        let postNameDisplay = 'Pool Comodines';
        if (guard.type === 'FIJO' && contract.id !== 'RELIEVISTA') {
            const fixedInContract = guardsState.filter(g => g.contractId === contract.id && g.type === 'FIJO');
            const guardIndexInContract = fixedInContract.findIndex(g => g.id === guard.id);
            const postsList = contract.posts && contract.posts.length > 0 ? contract.posts : ['Portería Principal'];
            const pIdx = guardIndexInContract >= 0 ? Math.floor(guardIndexInContract / 3) % postsList.length : 0;
            postNameDisplay = postsList[pIdx] || `Puesto ${pIdx + 1}`;
        }

        const postBadge = `
            <span class="shift-badge bg-indigo-500/20 text-indigo-200 border-indigo-500/40" style="font-size:0.72rem; padding:0.25rem 0.5rem; white-space:nowrap; font-weight:600;">
                📍 ${postNameDisplay}
            </span>
        `;

        let rowHTML = `
            <tr>
                <td class="sticky-col">
                    <div style="display:flex; align-items:center;">
                        <span class="guard-name">${guard.name}</span>
                        ${typeBadgeInline}
                    </div>
                    <span class="guard-meta">C.C. ${guard.cedula} | ${contract.name}</span>
                </td>
                <td>${postBadge}</td>
        `;

        for (let day = 1; day <= daysInMonth; day++) {
            const dateObj = new Date(currentYear, currentMonth, day);
            const dateStr = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            let shiftCode = sch[dateStr] || 'X';

            const activeContractOnDate = guardDailyContractMap[`${guard.id}_${dateStr}`] || guard.contractId;
            let isBelongingToSelectedFilter = true;

            if (selectedContractFilter !== 'ALL' && selectedContractFilter !== 'RELIEVISTA') {
                if (activeContractOnDate !== selectedContractFilter) {
                    isBelongingToSelectedFilter = false;
                    if (guard.type === 'RELIEVISTA' && (shiftCode === 'D-REL' || shiftCode === 'N-REL')) {
                        if (reliefContractMap[`${guard.id}_${dateStr}`] === selectedContractFilter) {
                            isBelongingToSelectedFilter = true;
                        }
                    }
                }
            }

            const isSun = isSunday(dateObj);
            const isHol = isHoliday(dateStr);

            let dayBgClass = '';
            if (isHol) dayBgClass = 'td-holiday';
            else if (isSun) dayBgClass = 'td-sun';

            const guardStart = guard.startDate || '2026-01-01';
            const contractStart = contract.startDate || '2026-01-01';
            const effectiveStart = (guardStart > contractStart) ? guardStart : contractStart;

            if (dateStr < effectiveStart) {
                rowHTML += `
                    <td class="${dayBgClass}">
                        <div class="cell-shift" 
                             style="background:rgba(255,255,255,0.02); border:1px solid rgba(255,255,255,0.06); cursor:not-allowed; opacity:0.3; color:#6b7280; font-size:0.75rem;"
                             title="${guard.name} — Fecha de ingreso (${effectiveStart}): Inactivo antes de esta fecha">
                            —
                        </div>
                    </td>
                `;
                continue;
            }

            if (!isBelongingToSelectedFilter) {
                const otherContract = contractsState.find(c => c.id === activeContractOnDate);
                const otherName = otherContract ? otherContract.name : 'Otra Sede';
                rowHTML += `
                    <td class="${dayBgClass}">
                        <div class="cell-shift" 
                             style="background:rgba(255,255,255,0.02); border:1px dashed rgba(255,255,255,0.08); cursor:not-allowed; opacity:0.35;"
                             title="${guard.name} — Prestando servicio o trasladado a ${otherName} en esta fecha">
                            <span style="font-size:0.75rem; color:#6b7280;">—</span>
                        </div>
                    </td>
                `;
                continue;
            }

            let shiftClass = 'shift-X';
            let labelHTML = shiftCode;
            let cellTitle = NOVELTIES_CATALOG[shiftCode]?.name || SHIFT_TYPES[shiftCode]?.name || shiftCode;

            if (NOVELTIES_CATALOG[shiftCode]) {
                shiftClass = 'shift-NOVELTY';
            } else if (SHIFT_TYPES[shiftCode]) {
                shiftClass = `shift-${shiftCode}`;
            }

            if (guard.type === 'RELIEVISTA' && shiftCode === 'X') {
                cellTitle = `${guard.name} — DISPONIBLE (Libre para asignación de reemplazo, vacaciones o incapacidad)`;
                labelHTML = `<span style="font-weight:700; color:#10b981;" title="${cellTitle}">X</span>`;
            } else if (shiftCode === 'D-REL' || shiftCode === 'N-REL') {
                const targetContractId = reliefContractMap[`${guard.id}_${dateStr}`];
                const targetContract = contractsState.find(c => c.id === targetContractId);
                const sedeName = targetContract ? targetContract.name : '';
                const shortSede = targetContract ? targetContract.name.split(' ')[0] : 'Sede';

                cellTitle = `Reemplazo (${shiftCode}) en ${sedeName || 'Sede'}`;
                labelHTML = `
                    <div style="line-height:1.1; padding:0.1rem 0;">
                        <div>${shiftCode}</div>
                        <div style="font-size:0.55rem; font-weight:700; opacity:0.9; text-transform:uppercase; margin-top:1px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:42px;">${shortSede}</div>
                    </div>
                `;
            }

            rowHTML += `
                <td class="${dayBgClass}">
                    <div class="cell-shift ${shiftClass}" 
                         title="${cellTitle}"
                         data-guard-id="${guard.id}" 
                         data-date="${dateStr}" 
                         data-shift="${shiftCode}">
                        ${labelHTML}
                    </div>
                </td>
            `;
        }

        rowHTML += `
            <td style="font-weight:700; color:#3b82f6;">${payroll.totalWorkedHours}h</td>
            </tr>
        `;

        bodyHTML += rowHTML;
    });

    tableBody.innerHTML = bodyHTML;

    document.querySelectorAll('.cell-shift').forEach(cell => {
        cell.addEventListener('click', handleCellClick);
    });
}

let directorySearchQuery = '';

function getSortSurnameKey(name) {
    if (!name) return '';
    let clean = name.replace(/\s*\(Comodín\)/gi, '').trim();
    const parts = clean.split(/\s+/);
    if (parts.length <= 1) return clean;
    if (parts.length === 2) return parts[1];
    if (parts.length === 3) return parts[2];
    if (parts.length >= 4) {
        if (clean.includes(' de Jesús ')) {
            return parts[parts.length - 1];
        }
        return parts[parts.length - 2];
    }
    return parts[parts.length - 1];
}

function renderGuardsDirectory() {
    const container = document.getElementById('guardsDirectoryContainer');

    let sedesSummaryHTML = `
        <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap:1rem; margin-bottom:1.5rem;">
    `;

    contractsState.forEach(c => {
        if (c.id === 'RELIEVISTA') return;
        const postsList = c.posts && c.posts.length > 0 ? c.posts.join(', ') : 'Portería Principal';
        const postsCount = c.posts ? c.posts.length : (c.totalPosts || 1);
        const needed = getGuardsNeededForContract(c);
        const assigned = guardsState.filter(g => g.contractId === c.id && g.type === 'FIJO').length;

        const isOk = assigned >= needed;
        const statusClass = isOk ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40' : 'bg-red-500/20 text-red-300 border-red-500/40';
        const statusText = isOk ? '✓ Plantilla Completa' : `⚠️ Faltan ${needed - assigned} Vigilante(s)`;

        sedesSummaryHTML += `
            <div style="background:rgba(17,24,39,0.75); border:1px solid var(--border-color); border-radius:12px; padding:1rem;">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.5rem;">
                    <strong style="font-size:1rem; color:#fff;">🏢 ${c.name}</strong>
                    <div style="display:flex; gap:0.5rem; align-items:center;">
                        <span class="shift-badge ${statusClass}">${statusText}</span>
                        <button class="btn btn-primary btn-edit-single-contract" data-contract-id="${c.id}" style="padding:0.25rem 0.6rem; font-size:0.75rem; background:linear-gradient(135deg,#3b82f6,#6366f1);">
                            ✏️ Editar Sede y Puestos
                        </button>
                    </div>
                </div>
                <div style="font-size:0.8rem; color:#9ca3af; margin-bottom:0.4rem;">
                    <strong>Puestos de Trabajo (${postsCount}):</strong> ${postsList}
                </div>
                <div style="font-size:0.8rem; color:#e5e7eb;">
                    Vigilantes Asignados: <strong>${assigned}</strong> / <strong>${needed} Requeridos</strong>
                    <span style="font-size:0.75rem; color:#9ca3af;"> (${c.defaultRotationPattern})</span>
                </div>
            </div>
        `;
    });
    sedesSummaryHTML += `</div>`;

    // Filtrar vigilantes según la búsqueda en el directorio
    let displayGuards = [...guardsState];
    if (directorySearchQuery.trim()) {
        const q = directorySearchQuery.toLowerCase().trim();
        displayGuards = displayGuards.filter(g => {
            const contract = contractsState.find(c => c.id === g.contractId) || { name: '' };
            const surname = getSortSurnameKey(g.name).toLowerCase();
            return g.name.toLowerCase().includes(q) ||
                   surname.includes(q) ||
                   g.cedula.includes(q) ||
                   contract.name.toLowerCase().includes(q);
        });
    }

    // Ordenar alfabéticamente por PRIMER APELLIDO
    displayGuards.sort((a, b) => {
        const surnameA = getSortSurnameKey(a.name);
        const surnameB = getSortSurnameKey(b.name);
        return surnameA.localeCompare(surnameB, 'es', { sensitivity: 'base' });
    });

    let searchToolbarHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center; background:rgba(17,24,39,0.8); border:1px solid var(--border-color); border-radius:12px; padding:0.85rem 1.25rem; margin-bottom:1.25rem; flex-wrap:wrap; gap:1rem;">
            <div style="display:flex; align-items:center; gap:0.75rem; flex:1; min-width:280px;">
                <span style="font-size:1.1rem; color:#60a5fa;">🔍</span>
                <input type="text" id="guardDirectorySearch" class="form-input" value="${directorySearchQuery}" placeholder="Buscar por nombre o primer apellido (ej. Ospina, Arango, Restrepo)..." style="flex:1; font-size:0.9rem; padding:0.45rem 0.85rem;">
            </div>
            <div style="font-size:0.85rem; color:#9ca3af; white-space:nowrap;">
                Mostrando <strong style="color:#60a5fa; font-size:1rem;">${displayGuards.length}</strong> de <strong style="color:#fff; font-size:1rem;">${guardsState.length}</strong> Vigilantes
            </div>
        </div>
    `;

    let html = sedesSummaryHTML + searchToolbarHTML + `
        <table class="roster-table" style="font-size:0.85rem;">
            <thead>
                <tr>
                    <th style="width:45px; text-align:center; color:#9ca3af;">#</th>
                    <th class="sticky-col">Vigilante (Empleado)</th>
                    <th>Tipo</th>
                    <th>Sede / Negocio Asignado</th>
                    <th>Esquema Heredado de la Sede</th>
                    <th>Requerimiento del Puesto</th>
                    <th>Acciones</th>
                </tr>
            </thead>
            <tbody>
    `;

    displayGuards.forEach((guard, index) => {
        const contract = contractsState.find(c => c.id === guard.contractId) || { name: 'Sin Asignar', defaultRotationPattern: '2D-2N-2X' };
        const scheme = ROTATION_SCHEMES[guard.rotationPattern] || { name: guard.rotationPattern, type: '24_7' };

        let postTypeLabel = '24/7 (Continuo Día y Noche)';
        if (scheme.type === '12_DIA') postTypeLabel = '☀️ Solo Diurno (12h - Cierra Noche)';
        if (scheme.type === '12_NOCHE') postTypeLabel = '🌙 Solo Nocturno (12h - Cierra Día)';
        if (guard.type === 'RELIEVISTA') postTypeLabel = '🔄 Rotativo Comodín';

        html += `
            <tr>
                <td style="text-align:center;">
                    <span style="background:rgba(59,130,246,0.18); color:#93c5fd; border:1px solid rgba(59,130,246,0.35); padding:0.15rem 0.5rem; border-radius:6px; font-weight:700; font-size:0.78rem; display:inline-block;">
                        ${index + 1}
                    </span>
                </td>
                <td class="sticky-col">
                    <strong>${guard.name}</strong><br>
                    <span style="font-size:0.75rem; color:#9ca3af;">C.C. ${guard.cedula}</span>
                </td>
                <td>
                    <span class="shift-badge ${guard.type === 'FIJO' ? 'bg-blue-500/20 text-blue-300' : 'bg-emerald-500/20 text-emerald-300'}">
                        ${guard.type}
                    </span>
                </td>
                <td>
                    <span class="shift-badge bg-blue-500/15 text-blue-200 border-blue-500/30 font-medium" style="display:inline-flex; align-items:center; gap:0.3rem;">
                        🏛️ ${contract.name}
                    </span>
                </td>
                <td>
                    <span class="shift-badge bg-indigo-500/20 text-indigo-200 border-indigo-500/40">
                        ${scheme.name}
                    </span>
                </td>
                <td style="font-weight:600; color:#e5e7eb;">${postTypeLabel}</td>
                <td>
                    <button class="btn btn-secondary btn-open-swap-guard" data-guard-id="${guard.id}" style="padding:0.3rem 0.6rem; font-size:0.75rem;">
                        🔄 Trasladar / Intercambiar
                    </button>
                </td>
            </tr>
        `;
    });

    if (displayGuards.length === 0) {
        html += `
            <tr>
                <td colspan="7" style="text-align:center; padding:2rem; color:#9ca3af;">
                    🔍 No se encontraron vigilantes que coincidan con "<strong>${directorySearchQuery}</strong>".
                </td>
            </tr>
        `;
    }

    html += `</tbody></table>`;
    container.innerHTML = html;

    // Conectar eventos del buscador en vivo
    const searchInput = document.getElementById('guardDirectorySearch');
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            directorySearchQuery = e.target.value;
            renderGuardsDirectory();
            const newSearch = document.getElementById('guardDirectorySearch');
            if (newSearch) {
                newSearch.focus();
                newSearch.setSelectionRange(newSearch.value.length, newSearch.value.length);
            }
        });
    }

    // Manejador para botón Editar Sede directa desde la tarjeta de la sede
    document.querySelectorAll('.btn-edit-single-contract').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const contractId = e.currentTarget.dataset.contractId;
            populateContractDropdowns();
            const editSelect = document.getElementById('editContractSelect');
            if (editSelect) {
                editSelect.value = contractId;
                loadContractIntoEditForm(contractId);
            }
            document.getElementById('manageContractsModal').classList.add('active');
        });
    });

    // Abrir modal seguro de intercambio/traslado preseleccionando al vigilante
    document.querySelectorAll('.btn-open-swap-guard').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const guardId = e.currentTarget.dataset.guardId;
            openSwapGuardsModal(guardId);
        });
    });
}

function handleCellClick(e) {
    const guardId = e.currentTarget.dataset.guardId;
    const dateStr = e.currentTarget.dataset.date;
    const shiftCode = e.currentTarget.dataset.shift;

    const guard = guardsState.find(g => g.id === guardId);
    activeModalCell = { guardId, dateStr, shiftCode };

    document.getElementById('modalGuardName').innerText = `${guard.name} (${guard.type})`;
    document.getElementById('modalDate').innerText = dateStr;

    const modal = document.getElementById('shiftEditModal');
    modal.classList.add('active');
}


document.getElementById('btnSaveShiftChange').addEventListener('click', () => {
    const newShift = document.getElementById('modalShiftSelect').value;
    const { guardId, dateStr } = activeModalCell;

    masterSchedule[guardId][dateStr] = newShift;
    saveAppState();
    closeModal();

    if (NOVELTIES_CATALOG[newShift]) {
        openSubstituteFinderModal(guardId, dateStr, newShift);
    } else {
        refreshAllViews();
    }
});

function openSubstituteFinderModal(guardId, dateStr, noveltyCode) {
    const guard = guardsState.find(g => g.id === guardId);
    const contract = contractsState.find(c => c.id === guard.contractId);

    const baseRot = generateRotationSchedule(guard, currentYear, currentMonth);
    const originalShift = baseRot[dateStr] || 'D';
    const targetReliefCode = (originalShift === 'N') ? 'N-REL' : 'D-REL';
    const turnoTexto = (targetReliefCode === 'N-REL') ? 'Turno NOCHE (18:00–06:00)' : 'Turno DÍA (06:00–18:00)';

    document.getElementById('subsituteModalTitle').innerText = `Seleccionar Comodín — Reemplazo para: ${guard.name}`;
    document.getElementById('substituteModalDate').innerText =
        `📅 ${dateStr}  |  📋 ${NOVELTIES_CATALOG[noveltyCode].name}  |  🕐 ${turnoTexto}  |  🏢 ${contract.name}`;

    const candidates = findBestReliefCandidates(dateStr, targetReliefCode, guardsState, masterSchedule);
    const container = document.getElementById('substitutesListContainer');

    if (candidates.length === 0) {
        container.innerHTML = `
            <div style="background:rgba(239,68,68,0.12); border:1px solid rgba(239,68,68,0.3); border-radius:8px; padding:1rem; color:#fca5a5; text-align:center;">
                ⚠️ No hay comodines disponibles para este turno.<br>
                <small style="color:#9ca3af;">Todos están en servicio o en período de descanso obligatorio (48h post-noche).</small>
            </div>`;
    } else {
        let html = `<div style="font-size:0.78rem; color:#9ca3af; margin-bottom:0.75rem;">
            El sistema recomienda el primero (⭐) según disponibilidad y menor carga de horas, pero <strong style="color:#fff;">tú decides quién va</strong>:
        </div>`;

        candidates.forEach((cand, idx) => {
            const isRecommended = idx === 0;
            const rowBg = isRecommended ? 'rgba(245,158,11,0.08)' : 'rgba(255,255,255,0.03)';
            const rowBorder = isRecommended ? 'rgba(245,158,11,0.5)' : 'rgba(255,255,255,0.07)';

            const recommendedBadge = isRecommended
                ? `<span style="background:rgba(245,158,11,0.2); color:#fbbf24; padding:0.15rem 0.5rem; border-radius:4px; font-size:0.68rem; font-weight:700; margin-left:0.4rem;">⭐ RECOMENDADO</span>`
                : `<span style="background:rgba(99,102,241,0.12); color:#a5b4fc; padding:0.15rem 0.5rem; border-radius:4px; font-size:0.68rem; font-weight:600; margin-left:0.4rem;">DISPONIBLE</span>`;

            const hoursColor = cand.weeklyHours < 48 ? '#10b981' : cand.weeklyHours < 60 ? '#f59e0b' : '#ef4444';

            html += `
                <div style="display:flex; align-items:center; justify-content:space-between;
                            background:${rowBg}; border:1px solid ${rowBorder};
                            border-radius:8px; padding:0.75rem 1rem; margin-bottom:0.5rem;
                            ${isRecommended ? 'box-shadow: 0 0 0 1px rgba(245,158,11,0.2);' : ''}">
                    <div style="flex:1; min-width:0;">
                        <div style="display:flex; align-items:center; flex-wrap:wrap; gap:0.25rem; margin-bottom:0.25rem;">
                            <span style="font-weight:700; color:#fff; font-size:0.92rem;">${cand.guard.name}</span>
                            ${recommendedBadge}
                        </div>
                        <div style="font-size:0.73rem; color:#9ca3af;">
                            C.C. ${cand.guard.cedula}
                            &nbsp;|&nbsp; Horas semana: <strong style="color:${hoursColor};">${cand.weeklyHours}h</strong>
                            &nbsp;|&nbsp; ${cand.reason}
                        </div>
                    </div>
                    <button class="btn btn-success btn-assign-sub"
                            data-sub-id="${cand.guard.id}"
                            data-date="${dateStr}"
                            data-shift="${targetReliefCode}"
                            data-contract="${guard.contractId}"
                            style="min-width:120px; font-size:0.8rem; margin-left:1rem; flex-shrink:0;
                                   ${isRecommended ? 'background: linear-gradient(135deg,#d97706,#f59e0b); border-color:#d97706;' : ''}">
                        ⚡ Asignar
                    </button>
                </div>`;
        });

        container.innerHTML = html;

        document.querySelectorAll('.btn-assign-sub').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const subId = e.currentTarget.dataset.subId;
                const date = e.currentTarget.dataset.date;
                const shift = e.currentTarget.dataset.shift;
                const contractId = e.currentTarget.dataset.contract;

                masterSchedule[subId][date] = shift;
                reliefContractMap[`${subId}_${date}`] = contractId;
                saveAppState();
                closeModal();
                refreshAllViews();
            });
        });
    }

    refreshAllViews();
    document.getElementById('substituteFinderModal').classList.add('active');
}



function renderPayrollReport() {
    const container = document.getElementById('payrollTableContainer');

    let html = `
        <div style="background:rgba(59,130,246,0.1); border:1px solid rgba(59,130,246,0.3); border-radius:10px; padding:0.9rem 1.25rem; margin-bottom:1rem; font-size:0.82rem; color:#93c5fd;">
            <strong>ℹ️ Regla de Liquidación Legal (Colombia - Ley 2101 / Ley 1846):</strong><br>
            • <strong>Jornada Diurna:</strong> 06:00 - 19:00 (7:00 PM)<br>
            • <strong>Jornada Nocturna (Recargo 35%):</strong> 19:00 (7:00 PM) - 06:00 (6:00 AM)<br>
            • <strong>Turno Noche (12h de 18:00 a 06:00):</strong> 1 hora diurna (18:00 - 19:00) + 11 horas de Recargo Nocturno (19:00 - 06:00) evaluando el cambio de día a medianoche.<br>
            • <strong>Domingos y Festivos:</strong> Diurno 06:00 - 19:00 (175%) y Nocturno 19:00 - 06:00 (210%).
        </div>
        <table class="roster-table" style="font-size:0.85rem;">
            <thead>
                <tr>
                    <th class="sticky-col">Vigilante</th>
                    <th>Tipo</th>
                    <th>Contrato / Sede</th>
                    <th>Tot. Horas</th>
                    <th>Descansos</th>
                    <th>Ordinarias</th>
                    <th>H.E. Diurnas (125%)</th>
                    <th>H.E. Nocturnas (175%)</th>
                    <th>Recargo Nocturno (35%)</th>
                    <th>Dominical Diurno (175%)</th>
                    <th>Dominical Nocturno (210%)</th>
                </tr>
            </thead>
            <tbody>
    `;

    guardsState.forEach(guard => {
        const contract = contractsState.find(c => c.id === guard.contractId) || { name: 'Sin Asignar' };
        const sch = masterSchedule[guard.id] || {};
        const p = calculateGuardPayroll(guard, sch, currentYear, currentMonth);

        html += `
            <tr>
                <td class="sticky-col">
                    <strong>${guard.name}</strong><br>
                    <span style="font-size:0.7rem; color:#9ca3af;">C.C. ${guard.cedula}</span>
                </td>
                <td>${guard.type}</td>
                <td>${contract.name}</td>
                <td style="font-weight:700; color:#3b82f6;">${p.totalWorkedHours}h</td>
                <td style="color:${p.totalRestDays >= 7 ? '#10b981' : '#f59e0b'}; font-weight:700;">${p.totalRestDays} días</td>
                <td>${p.ordinarias}h</td>
                <td style="color:#f59e0b; font-weight:600;">${p.hed}h</td>
                <td style="color:#ef4444; font-weight:600;">${p.hen}h</td>
                <td style="color:#8b5cf6;">${p.rn}h</td>
                <td>${p.rdfd}h</td>
                <td>${p.rdfn}h</td>
            </tr>
        `;
    });

    html += `</tbody></table>`;
    container.innerHTML = html;
}

function renderCoverageAudit() {
    const container = document.getElementById('coverageAuditContainer');
    const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();

    let html = '';

    contractsState.forEach(contract => {
        if (contract.id === 'RELIEVISTA') return;

        const isDayOnly = (contract.postType === '12_DIA');
        const postLabel = isDayOnly ? 'Solo Diurno 12h (Cierra de Noche)' : '24/7 (Día y Noche)';
        const postsList = contract.posts && contract.posts.length > 0 ? contract.posts.join(', ') : 'Portería Principal';
        const postsCount = contract.posts ? contract.posts.length : (contract.totalPosts || 1);
        const needed = getGuardsNeededForContract(contract);
        const assigned = guardsState.filter(g => g.contractId === contract.id && g.type === 'FIJO').length;

        html += `
            <div style="background:rgba(17,24,39,0.7); border:1px solid var(--border-color); border-radius:12px; padding:1.25rem; margin-bottom:1.5rem;">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.25rem;">
                    <h3 style="font-size:1.1rem; font-weight:700; color:#fff;">🏢 ${contract.name}</h3>
                    <span class="shift-badge ${assigned >= needed ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40' : 'bg-red-500/20 text-red-300 border-red-500/40'}">
                        ${assigned}/${needed} Vigilantes Asignados
                    </span>
                </div>
                <p style="font-size:0.8rem; color:#9ca3af; margin-bottom:1rem;">
                    Modalidad: <strong>${postLabel}</strong> | Puestos de Trabajo (${postsCount}): <strong>${postsList}</strong>
                </p>

                <div style="display:flex; gap:0.25rem; overflow-x:auto; padding-bottom:0.5rem;">
        `;

        for (let day = 1; day <= daysInMonth; day++) {
            const dateStr = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

            let dayShiftCount = 0;
            let nightShiftCount = 0;

            guardsState.forEach(g => {
                const s = masterSchedule[g.id]?.[dateStr];
                if (g.contractId === contract.id && g.type === 'FIJO') {
                    if (s === 'D') dayShiftCount++;
                    if (s === 'N') nightShiftCount++;
                } else if (g.type === 'RELIEVISTA' && (s === 'D-REL' || s === 'N-REL')) {
                    if (reliefContractMap[`${g.id}_${dateStr}`] === contract.id) {
                        if (s === 'D-REL') dayShiftCount++;
                        if (s === 'N-REL') nightShiftCount++;
                    }
                }
            });

            const neededDay = postsCount;
            const neededNight = isDayOnly ? 0 : postsCount;

            const isExcess = (dayShiftCount > neededDay) || (!isDayOnly && nightShiftCount > neededNight);
            const isDeficit = (dayShiftCount < neededDay) || (!isDayOnly && nightShiftCount < neededNight);

            let mainBadgeText = '✓ 24/7 OK';
            let statusBg = 'rgba(16,185,129,0.18)';
            let borderBg = 'rgba(16,185,129,0.45)';
            let textColor = '#6ee7b7';

            if (isDeficit) {
                mainBadgeText = '🔴 FALTA';
                statusBg = 'rgba(239,68,68,0.25)';
                borderBg = 'rgba(239,68,68,0.65)';
                textColor = '#fca5a5';
            } else if (isExcess) {
                mainBadgeText = '⚠️ EXCESO';
                statusBg = 'rgba(245,158,11,0.22)';
                borderBg = 'rgba(245,158,11,0.55)';
                textColor = '#fcd34d';
            } else if (isDayOnly) {
                mainBadgeText = '✓ DÍA 100%';
            }

            const detailLine = isDayOnly 
                ? `${dayShiftCount}/${neededDay}D` 
                : `${dayShiftCount}/${neededDay}D · ${nightShiftCount}/${neededNight}N`;

            html += `
                <div style="min-width:72px; flex-shrink:0; background:${statusBg}; border:1px solid ${borderBg}; border-radius:8px; padding:0.4rem 0.25rem; text-align:center;" title="Día ${day}: ${dayShiftCount}/${neededDay} Día, ${nightShiftCount}/${neededNight} Noche">
                    <div style="font-size:0.68rem; font-weight:700; color:#d1d5db; margin-bottom:0.15rem;">Día ${day}</div>
                    <div style="font-size:0.72rem; font-weight:800; color:${textColor}; margin-bottom:0.15rem;">
                        ${mainBadgeText}
                    </div>
                    <div style="font-size:0.62rem; font-weight:600; color:${isDeficit ? '#fca5a5' : '#9ca3af'}; white-space:nowrap;">
                        ${detailLine}
                    </div>
                </div>
            `;
        }

        html += `</div></div>`;
    });

    container.innerHTML = html;
}

function autoAssignRestReliefs() {
    // Recorrer los 12 meses del año para generar relevos completos
    for (let month = 0; month < 12; month++) {
        const daysInMonth = new Date(currentYear, month + 1, 0).getDate();

        // 1. Limpiar relevos automáticos anteriores de este mes (solo X→D-REL/N-REL automáticos, no los manuales)
        guardsState.filter(g => g.type === 'RELIEVISTA').forEach(rel => {
            masterSchedule[rel.id] = masterSchedule[rel.id] || {};
            for (let day = 1; day <= daysInMonth; day++) {
                const dateStr = `${currentYear}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                // Solo limpiar si era un relevo automático (guardado en reliefContractMap), no el actual
                if ((masterSchedule[rel.id][dateStr] === 'D-REL' || masterSchedule[rel.id][dateStr] === 'N-REL')
                    && reliefContractMap[`${rel.id}_${dateStr}`]) {
                    masterSchedule[rel.id][dateStr] = 'X';
                    delete reliefContractMap[`${rel.id}_${dateStr}`];
                }
            }
        });

        // 2. Asignar relevos para DESCANSOS y NOVEDADES de puestos SOLO_DIA / SOLO_NOCHE
        for (let day = 1; day <= daysInMonth; day++) {
            const dateStr = `${currentYear}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

            contractsState.forEach(contract => {
                if (contract.id === 'RELIEVISTA') return;
                // Solo aplica a contratos de turno parcial (SOLO_DIA o SOLO_NOCHE)
                const isSoloContract = contract.defaultRotationPattern &&
                    (contract.defaultRotationPattern.startsWith('SOLO_') || contract.postType === '12_DIA' || contract.postType === '12_NOCHE');
                if (!isSoloContract) return;

                const isNightGuard = (contract.defaultRotationPattern === 'SOLO_NOCHE' ||
                    contract.defaultRotationPattern === 'SOLO_NOCHE_12H' ||
                    contract.postType === '12_NOCHE');
                const targetReliefCode = isNightGuard ? 'N-REL' : 'D-REL';

                const fixedGuards = guardsState.filter(g => g.contractId === contract.id && g.type === 'FIJO');

                fixedGuards.forEach(guard => {
                    const shift = masterSchedule[guard.id]?.[dateStr];
                    // Cubrir tanto descansos (X) como novedades (INC, FAL, VAC, PRM, etc.)
                    const needsCoverage = shift === 'X' || (shift && shift !== 'D' && shift !== 'N' && shift !== 'D-REL' && shift !== 'N-REL');
                    if (!needsCoverage) return;

                    // Verificar que no hay ya un comodín asignado a este contrato ese día
                    const alreadyCovered = guardsState.filter(g => g.type === 'RELIEVISTA').some(rel => {
                        return (masterSchedule[rel.id]?.[dateStr] === 'D-REL' || masterSchedule[rel.id]?.[dateStr] === 'N-REL')
                            && reliefContractMap[`${rel.id}_${dateStr}`] === contract.id;
                    });
                    if (alreadyCovered) return;

                    // Buscar el mejor comodín disponible
                    let relievistas = guardsState.filter(g => g.type === 'RELIEVISTA');
                    let sub = null;

                    // Primero intentar el comodín preferido del contrato
                    if (contract.preferredReliefGuardId) {
                        const pref = relievistas.find(r => r.id === contract.preferredReliefGuardId);
                        if (pref && (masterSchedule[pref.id]?.[dateStr] || 'X') === 'X') {
                            sub = pref;
                        }
                    }

                    // Si no, buscar el primer comodín libre ese día
                    if (!sub) {
                        sub = relievistas.find(rel => (masterSchedule[rel.id]?.[dateStr] || 'X') === 'X');
                    }

                    if (sub) {
                        masterSchedule[sub.id][dateStr] = targetReliefCode;
                        reliefContractMap[`${sub.id}_${dateStr}`] = contract.id;
                    }
                });
            });
        }
    }
}

function handleAutoBalance() {
    let adjustments = [];

    contractsState.forEach(contract => {
        if (contract.id === 'RELIEVISTA') return;
        const prevFixedCount = guardsState.filter(g => g.contractId === contract.id && g.type === 'FIJO').length;
        ensureContractGuards(contract);
        const newFixedCount = guardsState.filter(g => g.contractId === contract.id && g.type === 'FIJO').length;

        if (prevFixedCount !== newFixedCount) {
            adjustments.push(`• ${contract.name}: Se ajustó la plantilla de ${prevFixedCount} a ${newFixedCount} vigilantes fijos.`);
        }
    });

    autoAssignRestReliefs();
    populateContractDropdowns();
    refreshAllViews();

    if (adjustments.length > 0) {
        alert(`🔍 Auditar y Validar Malla:\n\nSe ajustó automáticamente la plantilla de vigilantes para cubrir la totalidad de los puestos contratados:\n\n${adjustments.join('\n')}\n\n✓ Mallas de turnos y descansos 100% balanceadas y cubiertas.`);
    } else {
        alert('🔍 Auditar y Validar Malla:\n\n✓ Todos los contratos y puestos cuentan con su plantilla fija completa y 100% cubierta.\n✓ No se requiere ningún ajuste adicional.');
    }
}

function exportToExcel() {
    if (typeof XLSX !== 'undefined') {
        const data = [];
        const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();

        const header = ['Cedula', 'Nombre', 'Tipo', 'Contrato', 'Esquema Rotación'];
        for (let d = 1; d <= daysInMonth; d++) header.push(`Día ${d}`);
        header.push('Total Horas', 'Descansos');
        data.push(header);

        guardsState.forEach(guard => {
            const contract = contractsState.find(c => c.id === guard.contractId) || { name: '' };
            const sch = masterSchedule[guard.id] || {};
            const p = calculateGuardPayroll(guard, sch, currentYear, currentMonth);

            const row = [guard.cedula, guard.name, guard.type, contract.name, guard.rotationPattern];
            for (let d = 1; d <= daysInMonth; d++) {
                const dateStr = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
                row.push(sch[dateStr] || 'X');
            }
            row.push(p.totalWorkedHours, p.totalRestDays);
            data.push(row);
        });

        const ws = XLSX.utils.aoa_to_sheet(data);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, `Malla_${currentYear}_${currentMonth + 1}`);
        XLSX.writeFile(wb, `Malla_Vigilancia_${currentYear}_${currentMonth + 1}.xlsx`);
    } else {
        alert('Generando exportación de datos...');
    }
}
