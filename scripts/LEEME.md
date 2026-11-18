# Cargar los datos del Excel en la app

Lo normal: en la app, **Más → Actualizar desde el Excel**, elige tu archivo `.xlsx` directamente.
La app te muestra qué trae (personajes, NPCs, precios, cuántos son nuevos) y tú eliges qué actualizar:
"No tocar", "Solo agregar los nuevos" o "Agregar y actualizar los existentes". Tus combates y el historial no se tocan.

Alternativa por terminal (genera un `respaldo.json` que la app también acepta en ese mismo botón):

   npx tsx scripts/import-excel.ts "C:\ruta\a\tu\AAA_GM_Gestion_de_Datos.xlsx"

`respaldo.json` tiene los datos de tu campaña: no lo subas a GitHub (ya está en el `.gitignore`).
