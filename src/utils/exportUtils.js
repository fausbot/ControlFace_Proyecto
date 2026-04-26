import * as XLSX from 'xlsx-js-style';

/**
 * Generates a true binary .xlsx file encoded with styles 
 * using the xlsx-js-style library (SheetJS fork).
 * This natively prevents Excel format/extension mismatch warnings
 * while maintaining background colors, bold text, and borders.
 *
 * @param {string} filename The name of the downloaded file.
 * @param {string[]} headers Array of header strings.
 * @param {string[][]} rows Array of row arrays, where each row is an array of strings.
 */
export const exportToExcelHTML = (filename, headers, rows) => {
    // Combine headers and rows
    const ws_data = [headers, ...rows];

    // Create worksheet
    const ws = XLSX.utils.aoa_to_sheet(ws_data);

    // Default border style
    const defaultBorder = {
        top: { style: "thin", color: { auto: 1 } },
        bottom: { style: "thin", color: { auto: 1 } },
        left: { style: "thin", color: { auto: 1 } },
        right: { style: "thin", color: { auto: 1 } }
    };

    // Apply styles to headers (row 0)
    for (let c = 0; c < headers.length; c++) {
        const cellRef = XLSX.utils.encode_cell({ r: 0, c: c });
        if (!ws[cellRef]) continue;

        ws[cellRef].s = {
            fill: { fgColor: { rgb: "D9E1F2" } }, // Light blue
            font: { bold: true, name: "Calibri", sz: 11 },
            border: defaultBorder,
            alignment: { horizontal: "center", vertical: "center" }
        };
    }

    // Apply styles to data rows
    for (let r = 1; r <= rows.length; r++) {
        for (let c = 0; c < headers.length; c++) {
            const cellRef = XLSX.utils.encode_cell({ r: r, c: c });

            // If cell is empty, still create it to apply borders
            if (!ws[cellRef]) {
                ws[cellRef] = { t: 's', v: '' };
            }

            if (ws[cellRef].v !== undefined && ws[cellRef].v !== null) {
                const rawVal = ws[cellRef].v;

                // ── CASO 1: El valor ya es un número JS (viene de parseFloat en Informes.jsx) ──
                // Esto cubre todos los campos de horas decimales sin depender del encabezado.
                if (typeof rawVal === 'number' && !isNaN(rawVal)) {
                    ws[cellRef].t = 'n';
                    ws[cellRef].v = rawVal;
                    ws[cellRef].z = '0.00';
                } else {
                    // Remove trailing/leading artificial quotes if inherited from previous CSV logic
                    let val = String(rawVal);
                    if (val.startsWith('"') && val.endsWith('"') && val.length >= 2) {
                        val = val.slice(1, -1);
                        val = val.replace(/""/g, '"');
                    }

                    // ── CASO 2: Formato HH:MM o HH:MM:SS ──
                    const timeMatch = val.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
                    // ── CASO 3: Columna con encabezado conocido de horas ──
                    const isNumericCol = /horas|total|diu|noc|dom\s*diu|dom\s*noc|diurnas|nocturnas|tiempo|clientes\s*visitados/i.test(headers[c] || '');

                    if (timeMatch) {
                        const h = parseInt(timeMatch[1], 10);
                        const m = parseInt(timeMatch[2], 10);
                        const s = parseInt(timeMatch[3] || '0', 10);
                        ws[cellRef].t = 'n';
                        ws[cellRef].v = (h * 3600 + m * 60 + s) / 86400;
                        ws[cellRef].z = timeMatch[3] ? 'hh:mm:ss' : 'hh:mm';
                    } else if (isNumericCol && !isNaN(val) && val.trim() !== '') {
                        ws[cellRef].t = 'n';
                        ws[cellRef].v = parseFloat(val);
                        ws[cellRef].z = '0.00';
                    } else if (val.startsWith('http://') || val.startsWith('https://')) {
                        ws[cellRef].t = 's';
                        ws[cellRef].v = 'Ver evidencia';
                        ws[cellRef].l = { Target: val, Tooltip: 'Haz clic para ver la foto original' };
                    } else {
                        // Default to string to protect user IDs from scientific format
                        ws[cellRef].t = 's';
                        ws[cellRef].v = val;
                    }
                }
            } else {
                ws[cellRef].t = 's';
            }

            // Base style: just borders
            ws[cellRef].s = {
                font: { name: "Calibri", sz: 11 },
                border: defaultBorder,
                alignment: { vertical: "center" }
            };

            // First column styling (light green background and bold)
            if (c === 0) {
                ws[cellRef].s.fill = { fgColor: { rgb: "E2EFDA" } };
                ws[cellRef].s.font.bold = true;
            }

            // Link styling
            if (ws[cellRef].l) {
                ws[cellRef].s.font.color = { rgb: "0563C1" };
                ws[cellRef].s.font.underline = true;
                ws[cellRef].s.font.bold = true;
            }
        }
    }

    // Set column widths (first column wider, others normal)
    const colWidths = headers.map((_, i) => ({ wch: i === 0 ? 25 : 20 }));
    ws['!cols'] = colWidths;

    // Create workbook and append worksheet
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Reporte");

    // Ensure the downloaded extension matches the binary format
    const safeFilename = filename.replace(/\.(xls|xml|csv)$/i, '.xlsx');

    // Trigger download
    XLSX.writeFile(wb, safeFilename);
};
