// src/pages/Privacidad.jsx
// Página pública — accesible sin login en /privacidad
// leyendo las variables VITE_CLIENT_* del archivo .env de cada despliegue.

import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
    Shield, Camera, MapPin, CheckCircle, XCircle,
    Globe, Lock, Server, FileText, ChevronDown, ChevronUp,
    Printer, Share2, Eye, Download, Building2, Phone, Mail, ArrowLeft
} from 'lucide-react';

// ─── Variables del cliente (vienen del .env de cada despliegue) ───────────────
const CLIENT = {
    nombre: import.meta.env.VITE_CLIENT_NAME || '[Nombre de la Empresa]',
    direccion: import.meta.env.VITE_CLIENT_ADDRESS || '[Dirección]',
    telefono: import.meta.env.VITE_CLIENT_PHONE || '[Teléfono]',
    nit: import.meta.env.VITE_CLIENT_NIT || '[NIT]',
    repLegal: import.meta.env.VITE_CLIENT_REP_LEGAL || '[Representante Legal]',
    email: import.meta.env.VITE_CLIENT_EMAIL || '[Correo de contacto]',
    ciudad: import.meta.env.VITE_CLIENT_CITY || 'Colombia',
};

const FACECONTROL = {
    jorge: 'Jorge Botero Calderón — CC 79.732.648',
    faustino: 'Faustino Botero Arbeláez — CC 79.591.167',
};

const FECHA = new Date().toLocaleDateString('es-CO', {
    timeZone: 'America/Bogota', day: 'numeric', month: 'long', year: 'numeric'
});

// ─── Componentes internos ─────────────────────────────────────────────────────
function Section({ icon: Icon, title, children, defaultOpen = false }) {
    const [open, setOpen] = useState(defaultOpen);
    return (
        <div style={{ border: '1px solid #e2e8f0', borderRadius: 16, marginBottom: 12, overflow: 'hidden' }}>
            <button
                onClick={() => setOpen(o => !o)}
                style={{
                    width: '100%', display: 'flex', alignItems: 'center',
                    justifyContent: 'space-between', padding: '16px 20px',
                    background: '#fff', border: 'none', cursor: 'pointer', textAlign: 'left'
                }}
            >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ background: '#eff6ff', padding: 8, borderRadius: 10 }}>
                        <Icon size={18} color="#2563eb" />
                    </div>
                    <span style={{ fontWeight: 700, color: '#1e293b', fontSize: 15 }}>{title}</span>
                </div>
                {open ? <ChevronUp size={16} color="#94a3b8" /> : <ChevronDown size={16} color="#94a3b8" />}
            </button>
            {open && (
                <div style={{ padding: '0 20px 20px', background: '#fff', borderTop: '1px solid #f1f5f9' }}>
                    {children}
                </div>
            )}
        </div>
    );
}

// ─── Página principal ─────────────────────────────────────────────────────────
export default function Privacidad({ isEmbedded = false, onClose = null }) {

    const navigate = useNavigate();
    const location = useLocation();

    const fromLogin = location.state?.from === 'login';

    const handleRegresar = () => {
        // En modo "modal/overlay" desde el Registro
        if (isEmbedded && onClose) {
            onClose();
            return;
        }

        // En navegación tradicional (desde Login, etc.)
        if (fromLogin) {
            navigate('/login');
            return;
        }

        // Fallback seguro usando el router interno
        navigate(-1);
    };

    const handlePrint = () => window.print();

    const handleShare = async () => {
        if (navigator.share) {
            try {
                await navigator.share({
                    title: `Política de Privacidad — ${CLIENT.nombre}`,
                    url: window.location.href
                });
            } catch { /* cancelado */ }
        } else {
            await navigator.clipboard?.writeText(window.location.href);
            alert('Enlace copiado al portapapeles.');
        }
    };

    const noRecopila = [
        'Contactos del teléfono',
        'Mensajes SMS / WhatsApp',
        'Datos bancarios o contraseñas',
        'Fotos almacenadas en el dispositivo',
        'Historial de llamadas',
        'Aplicaciones instaladas',
        'Historial de navegación web',
        'IMEI o número de teléfono',
    ];

    const siRecopila = [
        { label: 'Fotografía con marca de agua', motivo: 'Evidencia del registro de asistencia' },
        { label: 'Coordenadas GPS', motivo: 'Verificar lugar de trabajo' },
        { label: 'Fecha y hora del registro', motivo: 'Control de jornada laboral' },
        { label: 'Correo electrónico / ID del empleado', motivo: 'Identificación del empleado' },
        { label: 'Tipo de registro (Entrada/Salida)', motivo: 'Gestión de asistencia y nómina' },
    ];

    return (
        <div style={{ minHeight: '100vh', background: 'linear-gradient(135deg,#0f172a,#1e3a5f,#0f172a)', fontFamily: 'system-ui, sans-serif' }}>

            {/* ── Header ── */}
            <div style={{
                background: 'rgba(255,255,255,0.06)', backdropFilter: 'blur(10px)',
                borderBottom: '1px solid rgba(255,255,255,0.1)',
                padding: '14px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between'
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <Shield size={26} color="#60a5fa" />
                    <div>
                        <div style={{ color: '#fff', fontWeight: 700, fontSize: 15 }}>Política de Privacidad</div>
                        <div style={{ color: '#93c5fd', fontSize: 11 }}>{CLIENT.nombre}</div>
                    </div>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                    <button onClick={handleShare} title="Compartir"
                        style={{ background: 'rgba(255,255,255,0.12)', border: 'none', borderRadius: 10, padding: 8, cursor: 'pointer', color: '#fff', display: 'flex' }}>
                        <Share2 size={16} />
                    </button>
                    <button onClick={handlePrint} title="Imprimir / Descargar PDF"
                        style={{ background: 'rgba(255,255,255,0.12)', border: 'none', borderRadius: 10, padding: 8, cursor: 'pointer', color: '#fff', display: 'flex' }}>
                        <Printer size={16} />
                    </button>
                </div>
            </div>

            <div style={{ maxWidth: 640, margin: '0 auto', padding: '20px 16px 48px' }}>

                {/* ── Tarjeta del responsable ── */}
                <div style={{
                    background: 'linear-gradient(135deg,#1d4ed8,#2563eb)',
                    borderRadius: 20, padding: 20, marginBottom: 16, color: '#fff',
                    boxShadow: '0 8px 32px rgba(29,78,216,0.4)'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                        <Building2 size={22} color="#bfdbfe" />
                        <span style={{ fontSize: 11, color: '#bfdbfe', fontWeight: 700, letterSpacing: 1 }}>RESPONSABLE DEL TRATAMIENTO DE DATOS</span>
                    </div>
                    <div style={{ fontWeight: 800, fontSize: 18, lineHeight: 1.3, marginBottom: 10 }}>
                        {CLIENT.nombre}
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, fontSize: 12, color: '#bfdbfe' }}>
                        <div><span style={{ opacity: 0.7 }}>NIT:</span> <strong style={{ color: '#fff' }}>{CLIENT.nit}</strong></div>
                        <div><span style={{ opacity: 0.7 }}>Ciudad:</span> <strong style={{ color: '#fff' }}>{CLIENT.ciudad}</strong></div>
                        <div style={{ gridColumn: '1/-1' }}><span style={{ opacity: 0.7 }}>Dirección:</span> <strong style={{ color: '#fff' }}>{CLIENT.direccion}</strong></div>
                        <div><span style={{ opacity: 0.7 }}>Tel:</span> <strong style={{ color: '#fff' }}>{CLIENT.telefono}</strong></div>
                        <div><span style={{ opacity: 0.7 }}>Rep. Legal:</span> <strong style={{ color: '#fff' }}>{CLIENT.repLegal}</strong></div>
                    </div>
                </div>

                {/* ── Sello de transparencia ── */}
                <div style={{
                    background: 'linear-gradient(135deg,#059669,#0d9488)',
                    borderRadius: 20, padding: 18, marginBottom: 16, color: '#fff',
                    boxShadow: '0 8px 24px rgba(5,150,105,0.3)'
                }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                        <div style={{ background: 'rgba(255,255,255,0.2)', borderRadius: 12, padding: 8, flexShrink: 0 }}>
                            <Shield size={26} color="#fff" />
                        </div>
                        <div>
                            <div style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.8)', marginBottom: 4 }}>
                                ✅ APLICACIÓN CERTIFICADA POR FACECONTROL
                            </div>
                            <div style={{ fontWeight: 700, fontSize: 15, lineHeight: 1.4 }}>
                                El sistema FaceControl solo accede a Cámara y GPS
                            </div>
                            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.8)', marginTop: 4, lineHeight: 1.5 }}>
                                Es técnicamente imposible acceder a mensajes, datos bancarios, archivos u otra información del dispositivo.
                            </div>
                        </div>
                    </div>
                </div>

                {/* ── Política Integral ── */}
                <Section icon={FileText} title="Política de Tratamiento de Datos Personales">
                    <div style={{ paddingTop: 12, fontSize: 13, color: '#475569', lineHeight: 1.8 }}>
                        <div style={{ fontWeight: 700, color: '#1e293b', marginBottom: 12, textAlign: 'center' }}>
                            SISTEMA DE CONTROL DE ASISTENCIA "FACECONTROL"<br/>
                            <span style={{ fontSize: 12, fontWeight: 500 }}>
                                Responsable del Tratamiento: {CLIENT.nombre} (en adelante, "La Empresa") NIT: {CLIENT.nit}<br/>
                                Encargado del Tratamiento: FaceControl<br/>
                                Fecha de última actualización: {FECHA}
                            </span>
                        </div>
                        
                        <div style={{ fontWeight: 600, color: '#1e293b', marginBottom: 4 }}>1. Objeto y Alcance</div>
                        <p style={{ marginBottom: 10 }}>La presente política regula la recolección, almacenamiento y uso de datos personales a través de la aplicación FaceControl. Se informa a los titulares que {CLIENT.nombre} es la responsable y controladora de la base de datos alojada en su instancia privada de Google Firebase, siendo la única con potestad sobre el uso de la información.</p>

                        <div style={{ fontWeight: 600, color: '#1e293b', marginBottom: 4 }}>2. Identificación de Roles</div>
                        <ul style={{ paddingLeft: 20, marginBottom: 10, listStyleType: 'disc' }}>
                            <li style={{ marginBottom: 4 }}><strong>Responsable (La Empresa):</strong> Decide sobre la finalidad de los datos, términos de retención y mantiene la relación laboral con el titular.</li>
                            <li><strong>Encargado (FaceControl):</strong> Actúa como proveedor de la infraestructura técnica. Su acceso está limitado estrictamente a labores de mantenimiento, soporte técnico y actualizaciones, bajo protocolos de seguridad que impiden el uso de la información para fines propios.</li>
                        </ul>

                        <div style={{ fontWeight: 600, color: '#1e293b', marginBottom: 4 }}>3. Tratamiento de Datos Sensibles (Biometría)</div>
                        <p style={{ marginBottom: 4 }}>De conformidad con la Ley 1581 de 2012 y el Decreto 1377 de 2013, se informa al trabajador:</p>
                        <ul style={{ paddingLeft: 20, marginBottom: 10, listStyleType: 'disc' }}>
                            <li style={{ marginBottom: 4 }}><strong>Naturaleza del dato:</strong> Se procesará un descriptor facial (hash numérico) para la verificación de identidad.</li>
                            <li style={{ marginBottom: 4 }}><strong>Carácter facultativo:</strong> Por tratarse de datos sensibles, el titular no está obligado a autorizar su tratamiento. En caso de no autorizar, La Empresa dispondrá de métodos alternativos (como registro manual o PIN) para el control de asistencia.</li>
                            <li><strong>Finalidad específica:</strong> Control de jornada laboral, seguridad de las instalaciones y prevención de suplantación de identidad.</li>
                        </ul>

                        <div style={{ fontWeight: 600, color: '#1e293b', marginBottom: 4 }}>4. Seguridad y Privacidad desde el Diseño</div>
                        <ul style={{ paddingLeft: 20, marginBottom: 10, listStyleType: 'disc' }}>
                            <li style={{ marginBottom: 4 }}><strong>Descentralización:</strong> Los datos se almacenan en contenedores aislados de Google Firebase, garantizando que el repositorio de {CLIENT.nombre} es independiente de otros clientes.</li>
                            <li style={{ marginBottom: 4 }}><strong>Procesamiento Local:</strong> La inferencia facial ocurre en el dispositivo del usuario. Solo el vector matemático resultante es transmitido y almacenado bajo encriptación AES-256.</li>
                            <li><strong>Seguridad Cloud:</strong> Se utilizan los estándares de seguridad de Google Cloud Platform para proteger la integridad y disponibilidad de la información.</li>
                        </ul>

                        <div style={{ fontWeight: 600, color: '#1e293b', marginBottom: 4 }}>5. Derechos de los Titulares</div>
                        <p style={{ marginBottom: 10 }}>Los empleados pueden ejercer sus derechos de acceso, actualización, rectificación y supresión enviando una comunicación al área de Recursos Humanos / Datos Personales de La Empresa al correo <strong>{CLIENT.email}</strong> o teléfono <strong>{CLIENT.telefono}</strong>.</p>

                        <div style={{ fontWeight: 600, color: '#1e293b', marginBottom: 4 }}>6. Transferencia y Transmisión Internacional</div>
                        <p style={{ marginBottom: 10 }}>El titular autoriza la transmisión de sus datos a los servidores de Google Cloud (Firebase) en Estados Unidos u otras regiones, los cuales cumplen con los niveles de protección exigidos por la Superintendencia de Industria y Comercio (SIC).</p>

                        <div style={{ fontWeight: 600, color: '#1e293b', marginBottom: 4 }}>7. Vigencia y Conservación de los Datos</div>
                        <p style={{ marginBottom: 4 }}>{CLIENT.nombre} aplicará diferentes criterios de retención según la naturaleza del dato:</p>
                        <ul style={{ paddingLeft: 20, marginBottom: 0, listStyleType: 'disc' }}>
                            <li style={{ marginBottom: 4 }}><strong>Registros de Asistencia y Logs:</strong> Se conservarán de manera indefinida o durante la vigencia del vínculo laboral y los términos de prescripción legal de las obligaciones laborales, con el fin de servir como soporte probatorio de la jornada cumplida.</li>
                            <li><strong>Evidencias Fotográficas:</strong> La fotografía capturada como soporte de la marcación tendrá un ciclo de vida temporal y será eliminada automáticamente del sistema cada 45 días, conservando únicamente el registro de texto y el vector de verificación para optimizar el almacenamiento y proteger la privacidad del titular.</li>
                        </ul>
                    </div>
                </Section>

                {/* ── Qué hace y qué no hace ── */}
                <Section icon={Globe} title="¿Por qué es imposible espiarte?">
                    <div style={{ paddingTop: 12 }}>
                        <div style={{
                            background: '#eff6ff', border: '1px solid #bfdbfe',
                            borderRadius: 12, padding: 12, marginBottom: 14, fontSize: 13, color: '#1d4ed8', lineHeight: 1.6
                        }}>
                            📌 FaceControl es una <strong>app web (PWA)</strong>, no una app instalada. Corre dentro de tu navegador (Chrome, Safari), que actúa como un escudo — la app <strong>no puede salir del navegador</strong> ni acceder a nada más del teléfono.
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 7 }}>
                            {noRecopila.map(item => (
                                <div key={item} style={{
                                    display: 'flex', alignItems: 'center', gap: 6,
                                    background: '#fff1f2', borderRadius: 10, padding: '7px 10px',
                                    fontSize: 11, color: '#be123c', fontWeight: 500
                                }}>
                                    <XCircle size={12} color="#f43f5e" style={{ flexShrink: 0 }} /> {item}
                                </div>
                            ))}
                            {['Cámara (foto al registrar)', 'GPS (solo al registrar)'].map(item => (
                                <div key={item} style={{
                                    display: 'flex', alignItems: 'center', gap: 6,
                                    background: '#f0fdf4', borderRadius: 10, padding: '7px 10px',
                                    fontSize: 11, color: '#15803d', fontWeight: 500
                                }}>
                                    <CheckCircle size={12} color="#22c55e" style={{ flexShrink: 0 }} /> {item}
                                </div>
                            ))}
                        </div>
                    </div>
                </Section>

                {/* ── Secciones colapsables ── */}
                <Section icon={Server} title="¿Qué datos guarda el sistema?">
                    <div style={{ paddingTop: 12 }}>
                        {siRecopila.map(({ label, motivo }) => (
                            <div key={label} style={{
                                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                padding: '9px 0', borderBottom: '1px solid #f1f5f9', fontSize: 13
                            }}>
                                <span style={{ color: '#334155', fontWeight: 500 }}>{label}</span>
                                <span style={{ color: '#64748b', fontSize: 12, textAlign: 'right', maxWidth: '50%' }}>{motivo}</span>
                            </div>
                        ))}
                        <div style={{ background: '#fef9c3', border: '1px solid #fde68a', borderRadius: 10, padding: 10, marginTop: 12, fontSize: 12, color: '#92400e' }}>
                            ⚠️ Los datos se almacenan en la base de datos propia de <strong>{CLIENT.nombre}</strong>.
                            FaceControl NO tiene acceso a esta información.
                        </div>
                    </div>
                </Section>

                <Section icon={Camera} title="Cámara — ¿Cómo se usa?">
                    <div style={{ paddingTop: 12, fontSize: 13, color: '#475569', lineHeight: 1.7 }}>
                        Solo se activa cuando presionas el botón de registro. Toma una foto con marca de agua (hora, fecha, ubicación) como evidencia. <strong>No graba video, no transmite en vivo, no accede a la galería.</strong>
                    </div>
                    <div style={{ background: '#fefce8', border: '1px solid #fde68a', borderRadius: 12, padding: 10, marginTop: 10, fontSize: 12, color: '#92400e' }}>
                        ⚠️ La cámara se apaga automáticamente después de cada foto.
                    </div>
                </Section>

                <Section icon={MapPin} title="GPS — ¿Cómo se usa?">
                    <div style={{ paddingTop: 12, fontSize: 13, color: '#475569', lineHeight: 1.7 }}>
                        La ubicación se pide <strong>únicamente en el momento del registro</strong>. Sirve para confirmar que estás en tu lugar de trabajo. <strong>No hay rastreo continuo.</strong>
                    </div>
                    <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 12, padding: 10, marginTop: 10, fontSize: 12, color: '#166534' }}>
                        ✅ Cierra la app → el ícono de GPS desaparece. Puedes verificarlo tú mismo.
                    </div>
                </Section>

                <Section icon={Lock} title="¿Quién tiene acceso a tus datos?">
                    <div style={{ paddingTop: 12 }}>
                        {[
                            { quien: `Administrador de ${CLIENT.nombre}`, acceso: 'Completo — gestión de asistencia y nómina', color: '#eff6ff' },
                            { quien: 'Google Firebase', acceso: 'Almacenamiento técnico cifrado — nunca usa tus datos', color: '#f8fafc' },
                            { quien: 'FaceControl (proveedor)', acceso: 'NINGUNO en operación normal. Solo soporte si tu empresa lo autoriza expresamente', color: '#f0fdf4' },
                        ].map(({ quien, acceso, color }) => (
                            <div key={quien} style={{ background: color, borderRadius: 10, padding: '10px 12px', marginTop: 8 }}>
                                <div style={{ fontWeight: 600, color: '#1e293b', fontSize: 13 }}>{quien}</div>
                                <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>{acceso}</div>
                            </div>
                        ))}
                    </div>
                </Section>

                <Section icon={FileText} title="Tus derechos — Ley 1581 de 2012">
                    <div style={{ paddingTop: 12, fontSize: 13, color: '#475569', lineHeight: 1.8 }}>
                        Tienes derecho a <strong>conocer, actualizar, rectificar y solicitar la supresión</strong> de tus datos personales.
                        Contacta directamente a <strong>{CLIENT.nombre}</strong>:
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 12 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#334155' }}>
                            <Phone size={14} color="#2563eb" /> {CLIENT.telefono}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#334155' }}>
                            <Mail size={14} color="#2563eb" /> {CLIENT.email}
                        </div>
                    </div>
                    <div style={{ marginTop: 10, fontSize: 12, color: '#64748b' }}>
                        Tiempo de respuesta: <strong>10 días hábiles</strong> ·
                    </div>
                </Section>

                <Section icon={Eye} title="Cómo verificarlo tú mismo">
                    <div style={{ paddingTop: 12 }}>
                        {[
                            { n: '1', t: 'Revisa permisos del navegador', d: 'Ajustes → Chrome → Permisos. Solo Cámara y Ubicación.' },
                            { n: '2', t: 'Observa el ícono de GPS', d: 'Solo aparece activo al registrar. Nunca en segundo plano.' },
                            { n: '3', t: 'Consulta un experto', d: 'Cualquier técnico en sistemas puede confirmar las limitaciones de una PWA.' },
                        ].map(({ n, t, d }) => (
                            <div key={n} style={{ display: 'flex', gap: 10, marginTop: 12 }}>
                                <div style={{
                                    background: '#ede9fe', color: '#7c3aed', fontWeight: 700,
                                    borderRadius: '50%', width: 26, height: 26,
                                    display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: 13
                                }}>{n}</div>
                                <div>
                                    <div style={{ fontWeight: 600, color: '#1e293b', fontSize: 13 }}>{t}</div>
                                    <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>{d}</div>
                                </div>
                            </div>
                        ))}
                    </div>
                </Section>

                <Section icon={CheckCircle} title="Autorización para el Tratamiento de Datos Personales y Sensibles" defaultOpen>
                    <div style={{ paddingTop: 12, fontSize: 13, color: '#475569', lineHeight: 1.8 }}>
                        <p style={{ marginBottom: 12 }}>
                            Yo, identificado con los datos registrados en este dispositivo, de manera libre, previa, expresa e informada, autorizo a <strong>{CLIENT.nombre}</strong> (en adelante, "La Empresa"), en su calidad de Responsable del Tratamiento, para que realice la recolección y tratamiento de mis datos personales y sensibles conforme a su Política de Tratamiento de Datos.
                        </p>
                        
                        <div style={{ fontWeight: 600, color: '#1e293b', marginBottom: 4 }}>1. Datos Sensibles (Biometría)</div>
                        <p style={{ marginBottom: 8 }}>
                            Entiendo y acepto que para el funcionamiento del sistema de asistencia se capturará un descriptor facial (representación matemática de rasgos del rostro). Se me ha informado que:
                        </p>
                        <ul style={{ paddingLeft: 20, marginBottom: 12, listStyleType: 'disc' }}>
                            <li>Al ser un dato sensible, mi autorización es facultativa y no estoy obligado a darla.</li>
                            <li>En caso de no autorizar, puedo solicitar a La Empresa un método alternativo de marcaje.</li>
                        </ul>

                        <div style={{ fontWeight: 600, color: '#1e293b', marginBottom: 4 }}>2. Finalidades del Tratamiento</div>
                        <p style={{ marginBottom: 8 }}>
                            Autorizo el uso de mis datos (biometría, geolocalización y registro fotográfico) para:
                        </p>
                        <ul style={{ paddingLeft: 20, marginBottom: 12, listStyleType: 'disc' }}>
                            <li>Verificar mi identidad en los registros de entrada y salida.</li>
                            <li>Garantizar la seguridad y evitar suplantaciones mediante pruebas de vida (liveness).</li>
                            <li>Generar reportes de asistencia y evidencias para la gestión de nómina.</li>
                        </ul>

                        <div style={{ fontWeight: 600, color: '#1e293b', marginBottom: 4 }}>3. Almacenamiento y Seguridad</div>
                        <p style={{ marginBottom: 12 }}>
                            Se me informa que mis datos se almacenarán en una instancia privada de Google Firebase administrada por La Empresa, con el soporte técnico de FaceControl como encargado tecnológico. Mis datos estarán protegidos mediante encriptación y no serán cedidos a terceros con fines comerciales.
                        </p>

                        <div style={{ fontWeight: 600, color: '#1e293b', marginBottom: 4 }}>4. Derechos del Titular</div>
                        <p>
                            Declaro que se me ha informado sobre mi derecho a conocer, actualizar, rectificar y solicitar la supresión de mis datos, así como a revocar esta autorización, contactando directamente al área de [Recursos Humanos / Datos Personales] de La Empresa.
                        </p>
                    </div>
                </Section>

                {/* ── Botón de Regreso Inteligente ── */}
                <div style={{ marginTop: 24, display: 'flex', justifyContent: 'center' }}>
                    <button
                        onClick={handleRegresar}
                        style={{
                            display: 'flex', alignItems: 'center', gap: 10,
                            background: '#16a34a', color: '#fff',
                            border: 'none', borderRadius: 12, padding: '14px 24px',
                            fontWeight: 700, fontSize: 16, cursor: 'pointer',
                            boxShadow: '0 8px 24px rgba(22, 163, 74, 0.4)',
                            transition: 'all 0.2s', width: '100%', justifyContent: 'center'
                        }}
                    >
                        <CheckCircle size={22} />
                        Regresar
                    </button>
                </div>

                {/* ── Pie ── */}
                <div style={{ textAlign: 'center', marginTop: 28, color: 'rgba(255,255,255,0.45)', fontSize: 11, lineHeight: 1.8 }}>
                    <Shield size={18} color="#60a5fa" style={{ margin: '0 auto 6px', display: 'block' }} />
                    <div style={{ color: '#cbd5e1', fontWeight: 600, fontSize: 13 }}>{CLIENT.nombre}</div>
                    <div>NIT: {CLIENT.nit} · {CLIENT.ciudad}</div>
                    <div>Rep. Legal: {CLIENT.repLegal}</div>
                    <div style={{ marginTop: 8, borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: 8 }}>
                        Sistema proporcionado por <strong style={{ color: '#93c5fd' }}>FaceControl</strong>
                        <br />{FACECONTROL.jorge}
                        <br />{FACECONTROL.faustino}
                        <br /><span style={{ fontSize: 10, opacity: 0.6 }}>Vigente desde: {FECHA}</span>
                    </div>
                </div>
            </div>
        </div>
    );
}
