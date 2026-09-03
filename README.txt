ZeMobida - prueba minima de editor visual
========================================

Objetivo de esta prueba:
- mover dos nodos en un canvas;
- ver una conexion INICIO -> FINAL;
- seleccionar un nodo;
- modificar su nombre y texto en el inspector lateral.

No incluye aun:
- importacion/exportacion TXT;
- condiciones;
- objetos;
- opciones editables;
- creacion de conexiones;
- guardado;
- GitHub/GMX.

WINDOWS - forma facil
---------------------
1. Instala Node.js LTS si no lo tienes.
2. Haz doble clic en start.bat.
3. La primera vez npm descargara las dependencias.
4. Abre la direccion Local que muestra la consola, normalmente:
   http://localhost:5173
5. Para cerrar el servidor, pulsa Ctrl+C en la ventana de consola.

FORMA MANUAL
------------
Abre una terminal dentro de esta carpeta y ejecuta:

npm install
npm run dev

Luego abre http://localhost:5173
