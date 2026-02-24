/**
 * Generates an HTML-based XLS file and triggers download.
 *
 * @param {string} filename The name of the downloaded file.
 * @param {string[]} headers Array of header strings.
 * @param {string[][]} rows Array of row arrays, where each row is an array of strings.
 */
export const exportToExcelHTML = (filename, headers, rows) => {
    // Escape XML/HTML special characters for basic safety
    const escapeHtml = (unsafe) => {
        if (unsafe === null || unsafe === undefined) return '';
        return String(unsafe)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    };

    // Construcción de la tabla HTML
    let tableHtml = '<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">';
    tableHtml += '<head><meta charset="UTF-8">';
    tableHtml += '<!--[if gte mso 9]><xml><x:ExcelWorkbook><x:ExcelWorksheets><x:ExcelWorksheet><x:Name>Sheet1</x:Name><x:WorksheetOptions><x:DisplayGridlines/></x:WorksheetOptions></x:ExcelWorksheet></x:ExcelWorksheets></x:ExcelWorkbook></xml><![endif]-->';
    tableHtml += `
    <style>
        table { border-collapse: collapse; width: 100%; font-family: Calibri, Arial, sans-serif; }
        th, td { border: 1pt solid #000000; padding: 4px; }
        th { background-color: #D9E1F2; font-weight: bold; text-align: center; }
        td.first-col { background-color: #E2EFDA; font-weight: bold; }
        .text { mso-number-format:"\\@"; } /* Tratar como texto plano */
    </style>
    `;
    tableHtml += '</head><body><table>';

    // Cabeceras
    tableHtml += '<thead><tr>';
    headers.forEach(header => {
        tableHtml += `<th>${escapeHtml(header)}</th>`;
    });
    tableHtml += '</tr></thead>';

    // Filas
    tableHtml += '<tbody>';
    rows.forEach(row => {
        tableHtml += '<tr>';
        row.forEach((cell, index) => {
            // Eliminar comillas dobles explícitas si vienen rodeando el valor (común en nuestro CSV formatter anterior)
            let cellValue = String(cell || '');
            if (cellValue.startsWith('"') && cellValue.endsWith('"') && cellValue.length >= 2) {
                cellValue = cellValue.slice(1, -1);
                // Restaurar comillas escapadas "" a "
                cellValue = cellValue.replace(/""/g, '"');
            }

            // La primera columna recibe clase `first-col`, y a todas les damos formato de texto `.text`
            const className = index === 0 ? 'text first-col' : 'text';
            tableHtml += `<td class="${className}">${escapeHtml(cellValue)}</td>`;
        });
        tableHtml += '</tr>';
    });
    tableHtml += '</tbody></table></body></html>';

    // Generar archivo y forzar descarga
    const blob = new Blob(['\ufeff', tableHtml], { type: 'application/vnd.ms-excel;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
};
