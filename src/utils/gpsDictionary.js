export const GPS_ERROR_DICTIONARY = {
    "ERR-01": {
        title: "Altitud Ausente (Señal Bidimensional Incompleta)",
        description: "El dispositivo transmitió coordenadas de latitud y longitud, pero no incluyó dato de altitud. Los receptores GPS físicos conectados a la red satelital producen por diseño una solución tridimensional; la altitud puede variar en precisión según las condiciones, pero generalmente está presente. La ausencia de este campo es una característica frecuentemente observada en aplicaciones de simulación de ubicación, que suelen replicar señal en dos dimensiones sin modelar el eje vertical."
    },
    "ERR-02": {
        title: "Precisión Estática Inusual (Ausencia de Variación Ambiental)",
        description: "Los receptores GPS operan en entornos con interferencia continua: vegetación, edificaciones y condiciones atmosféricas generan fluctuaciones naturales en el valor de precisión, produciendo cifras irregulares y con decimales variables (por ejemplo, 14.537 m o 23.812 m). En este registro, el valor de precisión reportado es matemáticamente uniforme y sin variación decimal. Este comportamiento difiere del patrón habitual del hardware físico operando en condiciones reales, y es consistente con coordenadas generadas por software de simulación de ubicación."
    },
    "ERR-03": {
        title: "Variación Posicional Nula (Coordenadas Sin Fluctuación)",
        description: "Durante el intervalo de muestreo, el sistema realizó múltiples lecturas consecutivas de posición y no detectó variación en ningún eje. En condiciones normales, un receptor satelital activo presenta pequeños desplazamientos residuales conocidos como ruido de señal, incluso cuando el dispositivo está estático. La ausencia total de esta variación es un patrón asociado a aplicaciones que fijan artificialmente la posición reportada, en lugar de leerla del hardware de localización del dispositivo."
    },
    "ERR-04": {
        title: "Incongruencia Topográfica (Altitud vs. Elevación del Terreno)",
        description: "El dispositivo reportó un valor de altitud. Al comparar este valor contra el Modelo Digital de Elevación (DEM) correspondiente a las coordenadas horizontales recibidas, se detectó una diferencia que supera el margen de error admisible para receptores GPS civiles en condiciones normales (típicamente entre ±10 y ±30 metros). Una discrepancia de esta magnitud no es atribuible a variación atmosférica ni a la posición del dispositivo en un piso elevado, y es consistente con un valor de altitud asignado por software de simulación en lugar de medido por hardware satelital."
    },
    "ERR-05": {
        title: "Velocidad Reportada Estática (Ausencia de Ruido de Movimiento)",
        description: "Un dispositivo en reposo o en manos de una persona quieta típicamente reporta micro-variaciones de velocidad producto del ruido natural de la señal satelital (por ejemplo, entre 0.03 y 0.8 m/s). En este registro, el valor de velocidad reportado es exactamente cero sin ninguna oscilación. Este patrón de quietud matemática perfecta difiere del comportamiento habitual del hardware GPS y es consistente con un valor generado por software de simulación."
    },
    "ERR-06": {
        title: "Rumbo Magnético Estático (Orientación Sin Variación)",
        description: "El rumbo magnético de un dispositivo físico presenta pequeñas oscilaciones continuas causadas por el pulso natural del usuario, micro-movimientos y la sensibilidad del sensor. En este registro, el valor de orientación se mantuvo fijo sin ninguna variación detectable durante el período de muestreo. Este comportamiento es consistente con un valor de rumbo fijado estáticamente por software de simulación, en lugar de ser leído dinámicamente por el sensor del dispositivo."
    },
    "ERR-07": {
        title: "Registro con Integridad Dudosa (Detección de Vida Pasiva)",
        description: "El sistema de análisis de imagen detectó patrones consistentes con una captura no original (foto de una foto, pantalla digital o impresión). Se identificaron anomalías como patrones de Moiré, reflejos característicos de cristales líquidos o bordes de dispositivos externos. Este registro ha sido marcado para revisión humana por el administrador para confirmar la presencia física del empleado."
    }
};