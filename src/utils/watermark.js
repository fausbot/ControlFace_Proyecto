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

                // Calculate extra padding at the bottom so the data banner never overlays the face.
                // We calculate the banner height first, then extend the canvas to fit both photo + banner.
                const fontSize = Math.max(20, img.width * 0.038);
                const lineHeight = fontSize * 1.4;
                const padding = 12;
                // We'll estimate lines count: 3 header + ~2 address lines = 5 lines max
                const estimatedBannerHeight = (lineHeight * 5) + (padding * 2);

                // Canvas = same size as photo (banner overlays the bottom of the image)
                canvas.width = img.width;
                canvas.height = img.height;

                // Draw original image
                ctx.drawImage(img, 0, 0);

                // Draw semi-transparent banner overlaid on the bottom of the photo
                const bannerY = img.height - estimatedBannerHeight;
                ctx.fillStyle = 'rgba(0, 0, 0, 0.82)';
                ctx.fillRect(0, bannerY, canvas.width, estimatedBannerHeight);


                // --- Draw Mode Label (ENTRADA/SALIDA/INCIDENTE/VISITA) at Top ---
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

                // Posición X: para no chocar con el gran logo del cliente a la izquierda, 
                // anclaremos los rótulos largos a la esquina superior derecha.
                let modeBoxX;
                if (isClientMode) {
                    modeBoxX = canvas.width - modeBoxWidth - 18; // Pegado al borde derecho (simétrico al margen del logo)
                } else {
                    modeBoxX = (canvas.width - modeBoxWidth) / 2; // Centrado normal
                    
                    // Asegurar de forma preventiva que ni siquiera los textos centrados pisen el logo:
                    // El logo ocupa ~25% + 18px de margen, sumando algo de aire (12px).
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

                // --- Draw Logo ---
                // Draw logo bigger in top-left (25% of width for better visibility)
                const logoWidth = img.width * 0.25;
                const logoHeight = logoWidth * (logo.height / logo.width);
                // Fallback if logo failed to load or has 0 dims
                if (logo.width > 0) {
                    ctx.drawImage(logo, 18, 18, logoWidth, logoHeight);
                }

                // --- Watermark Text (drawn in the extra banner area below the photo) ---
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

                const addressLines = wrapText(`LOCALIDAD: ${data.locationName || ''}`, maxWidth);

                const headerLines = [
                    `ID: ${data.employeeId}`,
                    `FECHA: ${data.timestamp}`,
                    `UBICACION: ${data.coords}`
                ];

                // Draw text starting inside the overlay banner
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
// CONTROL CRÍTICO DE TIMEZONE:
// Las APIs se consultan para America/Bogota (UTC-5).
// El formateo SIEMPRE especifica timeZone: 'America/Bogota' explícitamente
// para que el resultado sea correcto independientemente de la zona horaria
// configurada en el dispositivo del empleado.
// ─────────────────────────────────────────────────────────────────────────────
export const fetchServerTime = async () => {
    const BOGOTA_TZ     = 'America/Bogota';
    const BOGOTA_LOCALE = 'es-CO';

    // ✅ CORRECCIÓN: Solicitamos la hora directamente en la zona América/Bogotá
    const sources = [
        {
            url: 'https://worldtimeapi.org/api/timezone/America/Bogota',
            parse: (d) => d.datetime
        },
        {
            url: 'https://www.timeapi.io/api/Time/current/zone?timeZone=America%2FBogota',
            parse: (d) => d.dateTime
        }
    ];

    for (const source of sources) {
        try {
            const controller = new AbortController();
            const id = setTimeout(() => controller.abort(), 3500);

            const response = await fetch(source.url, {
                signal: controller.signal,
                headers: { 'Accept': 'application/json' }
            });
            clearTimeout(id);

            if (!response.ok) continue;
            const data = await response.json();
            const dateStr = source.parse(data);

            // ✅ CORRECCIÓN: Forzar timezone de Bogotá en el formateo final
            // Esto garantiza que aunque el dispositivo esté en UTC u otra zona,
            // la hora que aparece en la foto sea siempre la hora colombiana.
            if (dateStr) {
                return new Date(dateStr).toLocaleString(BOGOTA_LOCALE, {
                    timeZone: BOGOTA_TZ
                });
            }
        } catch (error) {
            console.warn(`[Timezone] Error consultando ${source.url}:`, error.message);
        }
    }

    // Fallback: usa hora local del dispositivo pero FORZANDO zona Colombia
    // Esto es seguro incluso si el dispositivo tiene mal configurada la hora
    console.warn("[Timezone] Servidores de tiempo no disponibles. Usando hora local forzada a Colombia.");
    return new Date().toLocaleString(BOGOTA_LOCALE, { timeZone: BOGOTA_TZ });
};

export const fetchLocationName = async (lat, lng) => {
    try {
        const controller = new AbortController();
        // Timeout de 6 segundos — suficiente para red lenta pero evita colgarse indefinidamente
        const timeoutId = setTimeout(() => controller.abort(), 6000);

        const response = await fetch(
            `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`,
            { signal: controller.signal }
        );
        clearTimeout(timeoutId);

        if (!response.ok) return "Dirección no encontrada";
        const data = await response.json();
        if (data && data.display_name) {
            // Return a shortened address (first 3 parts usually suffice)
            return data.display_name.split(',').slice(0, 3).join(',');
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
