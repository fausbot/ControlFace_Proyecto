/**
 * Generates an XML-based Excel Spreadsheet 2003 file and triggers download.
 * This native format prevents the "format and extension don't match" warning in modern Excel
 * and properly supports background colors and borders.
 *
 * @param {string} filename The name of the downloaded file.
 * @param {string[]} headers Array of header strings.
 * @param {string[][]} rows Array of row arrays, where each row is an array of strings.
 */
export const exportToExcelHTML = (filename, headers, rows) => {
    // Escape XML special characters to prevent document corruption
    const escapeXml = (unsafe) => {
        if (unsafe === null || unsafe === undefined) return '';
        return String(unsafe)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&apos;");
    };

    // Calculate columns count
    const colCount = Math.max(headers.length, ...rows.map(r => r.length));

    // Constructing the XML Spreadsheet 2003 structure
    let xml = '<?xml version="1.0"?>\n';
    xml += '<?mso-application progid="Excel.Sheet"?>\n';
    xml += '<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"\n';
    xml += ' xmlns:o="urn:schemas-microsoft-com:office:office"\n';
    xml += ' xmlns:x="urn:schemas-microsoft-com:office:excel"\n';
    xml += ' xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"\n';
    xml += ' xmlns:html="http://www.w3.org/TR/REC-html40">\n';

    // Styles Definition
    xml += '<Styles>\n';

    // Default Style (s62)
    xml += '  <Style ss:ID="Default" ss:Name="Normal">\n';
    xml += '   <Alignment ss:Vertical="Bottom"/>\n';
    xml += '   <Borders/>\n';
    xml += '   <Font ss:FontName="Calibri" x:Family="Swiss" ss:Size="11" ss:Color="#000000"/>\n';
    xml += '   <Interior/>\n';
    xml += '   <NumberFormat/>\n';
    xml += '   <Protection/>\n';
    xml += '  </Style>\n';

    // Header Style (s63) - Blue background, Bold, Centered, Borders
    xml += '  <Style ss:ID="s63">\n';
    xml += '   <Alignment ss:Horizontal="Center" ss:Vertical="Center" ss:WrapText="1"/>\n';
    xml += '   <Borders>\n';
    xml += '    <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1"/>\n';
    xml += '    <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1"/>\n';
    xml += '    <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1"/>\n';
    xml += '    <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1"/>\n';
    xml += '   </Borders>\n';
    xml += '   <Font ss:FontName="Calibri" x:Family="Swiss" ss:Size="11" ss:Color="#000000" ss:Bold="1"/>\n';
    xml += '   <Interior ss:Color="#D9E1F2" ss:Pattern="Solid"/>\n';
    xml += '  </Style>\n';

    // First Column Style (s64) - Green background, Text format, Borders
    xml += '  <Style ss:ID="s64">\n';
    xml += '   <Borders>\n';
    xml += '    <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1"/>\n';
    xml += '    <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1"/>\n';
    xml += '    <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1"/>\n';
    xml += '    <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1"/>\n';
    xml += '   </Borders>\n';
    xml += '   <Interior ss:Color="#E2EFDA" ss:Pattern="Solid"/>\n';
    xml += '   <NumberFormat ss:Format="@"/>\n';
    xml += '  </Style>\n';

    // Standard Cell Style (s65) - Text format, Borders
    xml += '  <Style ss:ID="s65">\n';
    xml += '   <Borders>\n';
    xml += '    <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1"/>\n';
    xml += '    <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1"/>\n';
    xml += '    <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1"/>\n';
    xml += '    <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1"/>\n';
    xml += '   </Borders>\n';
    xml += '   <NumberFormat ss:Format="@"/>\n';
    xml += '  </Style>\n';

    xml += '</Styles>\n';

    // Worksheet
    xml += ' <Worksheet ss:Name="Reporte">\n';
    xml += `  <Table ss:ExpandedColumnCount="${colCount}" ss:ExpandedRowCount="${rows.length + 1}" x:FullColumns="1" x:FullRows="1" ss:DefaultRowHeight="15">\n`;

    // Auto-width for some columns (Optional, setting rough defaults)
    for (let c = 0; c < colCount; c++) {
        const width = c === 0 ? 150 : 100; // First column wider
        xml += `   <Column ss:AutoFitWidth="0" ss:Width="${width}"/>\n`;
    }

    // Headers Row
    xml += '   <Row ss:AutoFitHeight="0" ss:Height="25">\n';
    headers.forEach(header => {
        xml += `    <Cell ss:StyleID="s63"><Data ss:Type="String">${escapeXml(header)}</Data></Cell>\n`;
    });
    xml += '   </Row>\n';

    // Data Rows
    rows.forEach(row => {
        xml += '   <Row ss:AutoFitHeight="0">\n';
        row.forEach((cell, index) => {
            let cellValue = String(cell || '');
            if (cellValue.startsWith('"') && cellValue.endsWith('"') && cellValue.length >= 2) {
                cellValue = cellValue.slice(1, -1);
                cellValue = cellValue.replace(/""/g, '"');
            }

            const styleId = index === 0 ? 's64' : 's65';
            xml += `    <Cell ss:StyleID="${styleId}"><Data ss:Type="String">${escapeXml(cellValue)}</Data></Cell>\n`;
        });
        xml += '   </Row>\n';
    });

    xml += '  </Table>\n';
    xml += ' </Worksheet>\n';
    xml += '</Workbook>\n';

    // Generate output Blob (XML Spreadsheet extension can be .xls or .xml, .xml is safer for Excel 2007+, but 2003 XML works fine with .xls without warning in recent patches if mime is correct)
    const blob = new Blob([xml], { type: 'application/vnd.ms-excel' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);

    // If we name it .xml, Excel opens it perfectly as 2003 spreadsheet without warnings.
    // If we name it .xls, some aggressive security settings in Windows still flag the mismatch of MIME.
    // We will use .xml which is the standard extension for SpreadsheetML.
    const safeFilename = filename.endsWith('.xls') ? filename.replace('.xls', '.xml') : filename;

    link.setAttribute('download', safeFilename);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
};
