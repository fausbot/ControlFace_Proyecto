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

                // Set canvas dimensions to match image
                canvas.width = img.width;
                canvas.height = img.height;

                // Draw original image
                ctx.drawImage(img, 0, 0);

                // --- Draw Mode Label (ENTRADA/SALIDA/INCIDENTE) at Top ---
                let modeText = 'ENTRADA';
                if (data.mode === 'exit') modeText = 'SALIDA';
                else if (data.mode === 'incident') modeText = 'NOVEDAD';
                const modeFontSize = Math.max(40, img.width * 0.08); // Large font
                ctx.font = `bold ${modeFontSize}px Arial`;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'top';

                // Measure text for background
                const modeTextWidth = ctx.measureText(modeText).width;
                const modePadding = 20;
                const modeBoxWidth = modeTextWidth + (modePadding * 2);
                const modeBoxHeight = modeFontSize + (modePadding * 2);
                const modeBoxX = (canvas.width - modeBoxWidth) / 2;
                const modeBoxY = 20;

                // Background for mode label
                let modeColor = 'rgba(34, 197, 94, 0.85)'; // Green: entry
                if (data.mode === 'exit') modeColor = 'rgba(239, 68, 68, 0.85)'; // Red: exit
                else if (data.mode === 'incident') modeColor = 'rgba(234, 88, 12, 0.92)'; // Orange: incident
                ctx.fillStyle = modeColor;
                ctx.fillRect(modeBoxX, modeBoxY, modeBoxWidth, modeBoxHeight);

                // Draw mode text
                ctx.fillStyle = '#ffffff';
                ctx.fillText(modeText, canvas.width / 2, modeBoxY + modePadding);

                // Reset text alignment for other text
                ctx.textAlign = 'left';

                // --- Draw Logo ---
                // Draw logo small in top-left
                const logoWidth = img.width * 0.15; // 15% of width
                const logoHeight = logoWidth * (logo.height / logo.width);
                // Fallback if logo failed to load or has 0 dims
                if (logo.width > 0) {
                    ctx.drawImage(logo, 20, 20, logoWidth, logoHeight);
                }

                // --- Watermark Text ---
                const fontSize = Math.max(20, img.width * 0.035);
                ctx.font = `bold ${fontSize}px monospace`;
                ctx.textBaseline = 'top'; // Use top for easier layout

                const padding = 20;
                const lineHeight = fontSize * 1.4; // More breathing room
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

                // Final lines to draw
                const headerLines = [
                    `ID: ${data.employeeId}`,
                    `FECHA: ${data.timestamp}`,
                    `UBICACION: ${data.coords}`
                ];

                const totalLines = headerLines.length + addressLines.length;
                const textBlockHeight = (lineHeight * totalLines) + (padding * 2);

                // Background
                ctx.fillStyle = 'rgba(0, 0, 0, 0.7)'; // Slightly darker for better contrast
                ctx.fillRect(0, canvas.height - textBlockHeight, canvas.width, textBlockHeight);

                // Draw Text
                ctx.fillStyle = '#ffffff';
                let currentY = canvas.height - textBlockHeight + padding;
                const currentX = padding;

                // Draw Headers
                headerLines.forEach(line => {
                    ctx.fillText(line, currentX, currentY);
                    currentY += lineHeight;
                });

                // Draw Wrapped Address
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

export const fetchServerTime = async () => {
    try {
        const response = await fetch('https://worldtimeapi.org/api/timezone/Etc/UTC');
        const data = await response.json();
        return new Date(data.utc_datetime).toLocaleString();
    } catch (error) {
        console.error("Error fetching server time, falling back to local time", error);
        return new Date().toLocaleString();
    }
};

export const fetchLocationName = async (lat, lng) => {
    try {
        const response = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`);
        const data = await response.json();
        if (data && data.display_name) {
            // Return a shortened address (first 3 parts usually suffice)
            return data.display_name.split(',').slice(0, 3).join(',');
        }
        return "Dirección no encontrada";
    } catch (error) {
        console.error("Error fetching location name:", error);
        return "Sin conexión a mapas";
    }
};
