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

            // Force cell type to string to prevent dropping leading zeros or weird number formatting
            ws[cellRef].t = 's';
            if (ws[cellRef].v !== undefined && ws[cellRef].v !== null) {
                // Remove trailing/leading artificial quotes if inherited from previous CSV logic
                let val = String(ws[cellRef].v);
                if (val.startsWith('"') && val.endsWith('"') && val.length >= 2) {
                    val = val.slice(1, -1);
                    val = val.replace(/""/g, '"');
                }
                ws[cellRef].v = val;
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
