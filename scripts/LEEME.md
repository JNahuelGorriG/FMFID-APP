# Cargar los datos del Excel en la app

1. Cierra el Excel y abre una terminal en la carpeta del proyecto (en VS Code: Terminal → New Terminal).
2. Ejecuta, con la ruta de tu archivo:

   npx tsx scripts/import-excel.ts "C:\ruta\a\tu\AAA_GM_Gestion_de_Datos.xlsx"

   Aparece el informe de verificación y se crea `respaldo.json` en la carpeta del proyecto.
3. En la app, en **Más**, toca **Actualizar desde el Excel** y elige `respaldo.json`.
   - "Actualizar desde el Excel" conserva tus combates, el historial y los NPC que hayas creado.
   - "Importar respaldo completo" reemplaza todo (úsalo para restaurar un respaldo exportado desde la app).

`respaldo.json` tiene los datos de tu campaña: no lo subas a GitHub (ya está en el `.gitignore`).
