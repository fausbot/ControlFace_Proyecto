import qrcode
import os

def generar_codigo_qr():
    carpeta_destino = r"C:\Users\fausb\Downloads\Control de entrada"
    if not os.path.exists(carpeta_destino):
        os.makedirs(carpeta_destino)

    print("-" * 40)
    print("      GENERADOR DE QR PROFESIONAL")
    print("-" * 40)

    # 1. Entrada de URL
    url = input("\n1. Pega la dirección web: ").strip()
    if not url: return
    if not url.startswith("http"): url = "https://" + url

    # 2. Selector de Estilo
    print("\n2. Selecciona el estilo del QR:")
    print("   [1] Estándar (Rápido y simple)")
    print("   [2] Detallado (Más puntos, aspecto profesional/denso)")
    opcion = input("   Elige una opción (1 o 2): ").strip()

    if opcion == "2":
        # Configuración para QR más denso (Más puntos)
        version_qr = 10 # Fuerza una rejilla más grande
        error_corr = qrcode.constants.ERROR_CORRECT_H # Máxima recuperación de datos (más puntos)
        box_sz = 8
        print("   -> Configurando estilo Detallado...")
    else:
        version_qr = 1
        error_corr = qrcode.constants.ERROR_CORRECT_L
        box_sz = 10
        print("   -> Configurando estilo Estándar...")

    # 3. Nombre del archivo
    nombre_base = input("\n3. Nombre para la imagen (ej: qr_login): ").strip()
    if not nombre_base: nombre_base = "codigo_qr"
    if not nombre_base.lower().endswith(".png"): nombre_base += ".png"

    ruta_completa = os.path.join(carpeta_destino, nombre_base)

    try:
        qr = qrcode.QRCode(
            version=version_qr,
            error_correction=error_corr,
            box_size=box_sz,
            border=4,
        )
        
        qr.add_data(url)
        qr.make(fit=True)

        # Crear la imagen
        img = qr.make_image(fill_color="black", back_color="white")
        
        # Guardar
        img.save(ruta_completa)
        
        print(f"\n¡ÉXITO! Archivo guardado en: {ruta_completa}")
        print(f"Contenido: {url}")

    except Exception as e:
        print(f"\nError: {e}")

if __name__ == "__main__":
    generar_codigo_qr()
    print("\n" + "="*40)
    input("Presiona Enter para finalizar...")
