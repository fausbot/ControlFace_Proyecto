/**
 * Generates an HTML-based file encoded properly to bypass strict Excel warnings
 * while maintaining background colors, bold text, and borders.
 *
 * @param {string} filename The name of the downloaded file.
 * @param {string[]} headers Array of header strings.
 * @param {string[][]} rows Array of row arrays, where each row is an array of strings.
 */
export const exportToExcelHTML = (filename, headers, rows) => {
    // Escape HTML special characters
    const escapeHtml = (unsafe) => {
        if (unsafe === null || unsafe === undefined) return '';
        return String(unsafe)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    };

    // The key to avoiding the warning in modern Excel when using HTML is including the mso-excel schemas
    // and properly encoding it as a Blob with UTF-8 BOM, but we stick to standard HTML table which Excel parses natively.
    let tableHtml = `
<html xmlns:o="urn:schemas-microsoft-com:office:office" 
      xmlns:x="urn:schemas-microsoft-com:office:excel" 
      xmlns="http://www.w3.org/TR/REC-html40">
<head>
    <meta charset="utf-8">
    <style>
        table { border-collapse: collapse; width: 100%; font-family: Calibri, sans-serif; }
        th, td { border: .5pt solid #000000; padding: 5px; }
        th { background-color: #D9E1F2; font-weight: bold; text-align: center; }
        td.first-col { background-color: #E2EFDA; font-weight: bold; }
        .text-format { mso-number-format: "\\@"; } /* Force Excel to treat as text */
    </style>
</head>
<body>
    <table>
        <thead>
            <tr>`;

    // Headers
    headers.forEach(header => {
        tableHtml += `<th>${escapeHtml(header)}</th>`;
    });
    tableHtml += `</tr>
        </thead>
        <tbody>`;

    // Data Rows
    rows.forEach(row => {
        tableHtml += '<tr>';
        row.forEach((cell, index) => {
            let cellValue = String(cell || '');
            if (cellValue.startsWith('"') && cellValue.endsWith('"') && cellValue.length >= 2) {
                cellValue = cellValue.slice(1, -1);
                cellValue = cellValue.replace(/""/g, '"');
            }

            const extraClass = index === 0 ? ' first-col' : '';
            tableHtml += `<td class="text-format${extraClass}">${escapeHtml(cellValue)}</td>`;
        });
        tableHtml += '</tr>\n';
    });

    tableHtml += `
        </tbody>
    </table>
</body>
</html>`;

    // Para evitar advertencias de Excel, a veces es mejor un Data URI Base64 si el archivo no es inmenso.
    // Usaremos un Blob estandar con Excel MIME type y BOM.
    const blob = new Blob(['\ufeff', tableHtml], { type: 'application/vnd.ms-excel;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');

    // Asegurarse que es extension .xls
    const safeFilename = filename.endsWith('.xls') || filename.endsWith('.csv') || filename.endsWith('.xml')
        ? filename.replace(/\.(xls|csv|xml)$/i, '.xls')
        : filename + '.xls';

    link.setAttribute('href', url);
    link.setAttribute('download', safeFilename);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
};
