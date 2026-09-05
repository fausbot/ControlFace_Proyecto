import { getTimeZoneFromCoords, COLOMBIA_TZ } from './timezone.js';

/**
 * Abreviador inteligente de palabras comunes en direcciones para ganar espacio en la foto.
 */
export const abbreviateAddress = (text) => {
    if (!text) return '';
    return text
        .replace(/\burbanizaci[oó]n\b/gi, 'Urb.')
        .replace(/\bapartamento\b/gi, 'Apto.')
        .replace(/\bavenida\b/gi, 'Av.')
        .replace(/\bcarrera\b/gi, 'Cra.')
        .replace(/\bn[uú]mero\b/gi, 'No.')
        .replace(/\bdiagonal\b/gi, 'Diag.')
        .replace(/\btransversal\b/gi, 'Tv.')
        .replace(/\blocalidad\b/gi, 'Loc.')
        .replace(/\bcondominio\b/gi, 'Cond.')
        .replace(/\bedificio\b/gi, 'Edif.');
};

const COUNTRY_CODES = {
    'co': 'COL',
    'es': 'ESP',
    'us': 'USA',
    'mx': 'MEX',
    'ar': 'ARG',
    'cl': 'CHL',
    'pe': 'PER',
    'ec': 'ECU',
    'pa': 'PAN',
    've': 'VEN',
    'br': 'BRA',
    'ca': 'CAN',
    'gb': 'GBR',
    'fr': 'FRA',
    'de': 'DEU',
    'it': 'ITA',
    'pt': 'PRT'
};

export const addWatermarkToImage = async (imageSrc, data) => {
    return new Promise((resolve, reject) => {
        const img = new Image();
        const logo = new Image();
        logo.crossOrigin = "anonymous";
        logo.src = import.meta.env.VITE_CLIENT_LOGO_URL || "/logo.jpg"; // Path to the logo from env or default

        img.onload = () => {
            // Wait for logo to load as well
            if (!logo.complete) {
                logo.onload = () => drawCanvas();
                logo.onerror = () => drawCanvas(); // Draw even if logo fails
            } else {
                drawCanvas();
            }

            function drawCanvas() {
                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d');

                // Canvas = same size as photo
                canvas.width = img.width;
                canvas.height = img.height;

                // Draw original image
                ctx.drawImage(img, 0, 0);

                // --- 1. Preparar tipografía y cálculo DINÁMICO de líneas del banner ---
                const fontSize = Math.max(20, img.width * 0.038);
                const lineHeight = fontSize * 1.38;
                const padding = 14;
                ctx.font = `bold ${fontSize}px monospace`;
                ctx.textBaseline = 'top';

                const maxWidth = canvas.width - (padding * 2);

                // Helper to wrap text based on canvas width
                const wrapText = (text, maxW) => {
                    const words = text.split(' ');
                    const lines = [];
                    let currentLine = '';

                    words.forEach(word => {
                        const testLine = currentLine ? `${currentLine} ${word}` : word;
                        const testWidth = ctx.measureText(testLine).width;
                        if (testWidth > maxW && currentLine) {
                            lines.push(currentLine);
                            currentLine = word;
                        } else {
                            currentLine = testLine;
                        }
                    });
                    if (currentLine) lines.push(currentLine);
                    return lines;
                };

                // Abreviar dirección y usar prefijo DIR:
                const cleanLocation = abbreviateAddress(data.locationName || '');
                const addressLines = wrapText(`DIR: ${cleanLocation}`, maxWidth);

                const headerLines = [
                    `ID: ${data.employeeId}`,
                    `FECHA: ${data.timestamp}`,
                    `UBICACION: ${data.coords}`
                ];

                // 2. Altura 100% DINÁMICA del banner: ajusta el fondo negro a las líneas reales
                const totalLines = headerLines.length + addressLines.length;
                const bannerHeight = (totalLines * lineHeight) + (padding * 2) + 8;
                const bannerY = canvas.height - bannerHeight;

                // Dibujar banner semi-transparente que cubre exactamente las líneas calculadas
                ctx.fillStyle = 'rgba(0, 0, 0, 0.82)';
                ctx.fillRect(0, bannerY, canvas.width, bannerHeight);

                // --- 3. Draw Mode Label (ENTRADA/SALIDA/INCIDENTE/VISITA) at Top ---
                let modeText = 'ENTRADA';
                if (data.mode === 'entry') modeText = 'ENTRADA';
                else if (data.mode === 'exit') modeText = 'SALIDA';
                else if (data.mode === 'incident') modeText = 'NOVEDAD';
                else if (data.mode === 'Llegada Cliente') modeText = 'LLEGADA A CLIENTE';
                else if (data.mode === 'Salida Cliente') modeText = 'SALIDA DEL CLIENTE';
                else if (data.mode) modeText = data.mode.toUpperCase();

                const isClientMode = data.mode === 'Llegada Cliente' || data.mode === 'Salida Cliente';

                // Tamaño de fuente — más pequeño para rótulos largos de cliente
                let modeFontSize = Math.max(35, img.width * 0.065);
                if (isClientMode) {
                    modeFontSize = Math.max(28, img.width * 0.048);
                }

                ctx.font = `bold ${modeFontSize}px Arial`;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'top';

                // Medir texto
                const modeTextWidth = ctx.measureText(modeText).width;
                const modePadding = 12;
                const modeBoxWidth = modeTextWidth + (modePadding * 2);
                const modeBoxHeight = modeFontSize + (modePadding * 2);
                const modeBoxY = 20;

                // Posición X: para no chocar con el logo del cliente a la izquierda
                let modeBoxX;
                if (isClientMode) {
                    modeBoxX = canvas.width - modeBoxWidth - 18; // Pegado al borde derecho
                } else {
                    modeBoxX = (canvas.width - modeBoxWidth) / 2; // Centrado normal
                    const safetyRightEdge = (img.width * 0.25) + 30;
                    if (modeBoxX < safetyRightEdge) {
                        modeBoxX = safetyRightEdge;
                    }
                }

                // Centro del texto = centro de la caja
                const textCenterX = modeBoxX + modeBoxWidth / 2;

                // Color de fondo
                let modeColor = 'rgba(34, 197, 94, 0.85)'; // Green: entry
                if (data.mode === 'exit') modeColor = 'rgba(239, 68, 68, 0.85)'; // Red
                else if (data.mode === 'incident') modeColor = 'rgba(234, 88, 12, 0.92)'; // Orange
                else if (isClientMode) modeColor = 'rgba(59, 130, 246, 0.92)'; // Blue

                ctx.fillStyle = modeColor;
                ctx.fillRect(modeBoxX, modeBoxY, modeBoxWidth, modeBoxHeight);

                // Texto centrado dentro de su propia caja
                ctx.fillStyle = '#ffffff';
                ctx.fillText(modeText, textCenterX, modeBoxY + modePadding);

                // Reset text alignment for other text
                ctx.textAlign = 'left';

                // --- 4. Draw Logo ---
                const logoWidth = img.width * 0.25;
                const logoHeight = logoWidth * (logo.height / logo.width);
                if (logo.width > 0) {
                    ctx.drawImage(logo, 18, 18, logoWidth, logoHeight);
                }

                // --- 5. Draw Watermark Text ---
                ctx.font = `bold ${fontSize}px monospace`;
                ctx.textBaseline = 'top';
                ctx.fillStyle = '#ffffff';
                let currentY = bannerY + padding;
                const currentX = padding;

                headerLines.forEach(line => {
                    ctx.fillText(line, currentX, currentY);
                    currentY += lineHeight;
                });

                addressLines.forEach(line => {
                    ctx.fillText(line, currentX, currentY);
                    currentY += lineHeight;
                });

                resolve(canvas.toDataURL('image/jpeg', 0.8));
            }
        };
        img.onerror = reject;
        img.src = imageSrc;
    });
};

// ─────────────────────────────────────────────────────────────────────────────
// CONTROL DE TIMEZONE Y SERVIDORES DE HORA
// ─────────────────────────────────────────────────────────────────────────────
export const fetchServerDate = async () => {
    const fetchSingleSource = async (source) => {
        const controller = new AbortController();
        const id = setTimeout(() => controller.abort(), 1500); // Timeout ultrarrápido de 1.5s por fuente
        try {
            const response = await fetch(source.url, {
                signal: controller.signal,
                headers: { 'Accept': 'application/json' }
            });
            clearTimeout(id);
            if (!response.ok) return null;
            const data = await response.json();
            const dateStr = source.parse(data);
            return dateStr ? new Date(dateStr) : null;
        } catch {
            return null;
        }
    };

    const sources = [
        { url: 'https://worldtimeapi.org/api/timezone/America/Bogota', parse: (d) => d.datetime },
        { url: 'https://www.timeapi.io/api/Time/current/zone?timeZone=America%2FBogota', parse: (d) => d.dateTime }
    ];

    try {
        const results = await Promise.all(sources.map(s => fetchSingleSource(s)));
        const validDate = results.find(d => d && !isNaN(d.getTime()));
        if (validDate) return validDate;
    } catch (e) {
        console.warn("[Timezone] Error en consulta paralela de servidores de tiempo:", e);
    }
    return new Date();
};

/**
 * Retorna la hora formateada para la marca de agua.
 * Si se proporcionan coordenadas (lat, lng), detecta automáticamente la zona horaria del lugar.
 * Si no, usa Colombia ('America/Bogota') por defecto.
 */
export const fetchServerTime = async (coords = null) => {
    let targetTz = COLOMBIA_TZ;
    if (coords && typeof coords.latitude === 'number' && typeof coords.longitude === 'number') {
        targetTz = getTimeZoneFromCoords(coords.latitude, coords.longitude);
    }

    try {
        const serverDate = await fetchServerDate();
        return serverDate.toLocaleString('es-CO', {
            timeZone: targetTz
        });
    } catch (error) {
        console.warn("[Timezone] Servidores de tiempo no disponibles. Usando hora local para zona:", targetTz);
        return new Date().toLocaleString('es-CO', { timeZone: targetTz });
    }
};

/**
 * Obtiene la dirección mediante geocodificación inversa con OpenStreetMap.
 * Estructura el resultado como: "[Dirección corta] - [Ciudad], [COL|ESP]"
 * aplicando abreviaturas limpias para optimizar el espacio.
 */
export const fetchLocationName = async (lat, lng) => {
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 2500);

        const response = await fetch(
            `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`,
            { signal: controller.signal }
        );
        clearTimeout(timeoutId);

        if (!response.ok) return "Dirección no encontrada";
        const data = await response.json();

        if (data && data.address) {
            const addr = data.address;
            const countryCode = (addr.country_code || '').toLowerCase();
            const country3 = COUNTRY_CODES[countryCode] || countryCode.toUpperCase();

            // Identificar ciudad / municipio principal y limpiar palabras redundantes como "ciudad", "D.C.", etc.
            let rawCity = addr.city || addr.town || addr.village || addr.municipality || addr.county || '';
            let city = rawCity
                .replace(/\s+ciudad\b/gi, '') // "Bogotá ciudad" -> "Bogotá"
                .replace(/\bciudad\s+de\s+bogot[aá]\b/gi, 'Bogotá')
                .replace(/\bmunicipio\s+de\s+/gi, '')
                .replace(/\bdistrito\s+capital\b/gi, '')
                .replace(/\bd\.?c\.?\b/gi, '')
                .replace(/\s+/g, ' ')
                .trim();
            if (/^bogota$/i.test(city)) city = 'Bogotá';

            // Identificar calle y barrio / sector
            const road = addr.road || addr.pedestrian || addr.footway || addr.street || '';
            const suburb = addr.suburb || addr.neighbourhood || addr.residential || '';

            const localParts = [];
            if (road) localParts.push(road);
            if (suburb && suburb !== road && suburb !== city) localParts.push(suburb);

            // Fallback si no hay road ni suburb
            if (localParts.length === 0 && data.display_name) {
                const firstPart = data.display_name.split(',')[0]?.trim();
                if (firstPart && firstPart !== city) localParts.push(firstPart);
            }

            const streetText = abbreviateAddress(localParts.join(', '));

            if (streetText && city) {
                return `${streetText} - ${city}, ${country3}`;
            } else if (city) {
                return `${city}, ${country3}`;
            } else if (streetText) {
                return `${streetText}, ${country3}`;
            }
        }

        if (data && data.display_name) {
            const fallbackParts = data.display_name.split(',').slice(0, 3).map(p => p.trim());
            return abbreviateAddress(fallbackParts.join(', '));
        }

        return "Dirección no encontrada";
    } catch (error) {
        if (error.name === 'AbortError') {
            console.warn("[Ubicación] Timeout al obtener dirección (red lenta).");
        } else {
            console.error("Error fetching location name:", error);
        }
        return "Sin conexión a mapas";
    }
};
