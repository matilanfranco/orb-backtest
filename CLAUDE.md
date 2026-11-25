# ORB Backtest Log — contexto del proyecto

## Qué es y para qué
App móvil (PWA) para que Mati registre a mano un backtesting de su estrategia **ORB sobre NQ/Nasdaq**: la primera vela de M15 de la apertura de NY (9:30–9:45) marca el rango, y opera dos tipos de entrada:

- **Absorción**: una vela de M5 cierra dentro del rango tras una ruptura fallida; entra por orden stop, con el SL en la última mecha/estructura que absorbió. Objetivo 1:1.
- **Ruptura**: espera la ruptura y entra con orden límite en un FVG, con el SL en una zona de estructura de M1. Objetivo 1:1.
- **¿El impulso dejó FVG?** (`fvgFormed`): sí/no — si el movimiento *después* de romper o absorber el borde del rango dejó un FVG. Aplica a los dos tipos y es independiente del punto de entrada. (Mati descartó un tercer tipo "ruptura con imbalance": quiere este dato también en absorción.)

La pregunta que quiere responder con los datos: **¿qué objetivo conviene (1:1, 1.5:1, 2:1) y qué tipo de entrada rinde mejor?** Quiere distinguir los setups de 1.5 de los de 1.1, así que más adelante conviene sumar campos de contexto para filtrar (ver ideas).

## Reglas del proyecto
- **Sin build ni dependencias**: HTML/CSS/JS puro con `<script>` clásicos (no módulos ES, para que también abra desde `file://`).
- **Offline primero**: todo en `localStorage` (clave `orb-bt:v5`) + service worker (`sw.js`). Si agregás archivos nuevos que la app necesite, sumalos a `ASSETS` en `sw.js` y subí el número de `CACHE`.
- **Publicada en GitHub Pages**: https://matilanfranco.github.io/orb-backtest/ (rama `main`, raíz). El SW es *network-first* con timeout de 4 s y `cache: 'no-cache'`: con internet trae siempre lo último; sin internet usa la caché.
- **En cada cambio publicado, actualizar `APP_VERSION` en `js/app.js`** (fecha). Se ve en Historial y es la forma de confirmar que el celu tomó la versión nueva.
- UI en **español**, pensada para celu (botones grandes, una mano). Mantener simple el flujo de registro: pocas pantallas, pocos toques.
- La lógica de estadísticas vive en `js/stats.js` como funciones puras y se prueba con `npm test` (node:test). La migración/importación de `js/store.js` se prueba en `tests/store.test.js` con un localStorage falso. Cualquier cambio de cálculo lleva su test.
- Los datos del usuario no se pueden romper: si cambia el formato guardado, subir la versión de la clave y migrar; mantener Exportar/Importar JSON.

## Modelo de datos (un trade)
```js
{ id, date: 'YYYY-MM-DD', type: 'absorcion' | 'ruptura',
  rr: 1 | 1.5 | 2, result: 'TP' | 'SL',
  mfe: 0 | 1 | 1.5 | 2 | 3,   // máximo movimiento a favor antes de volver al SL: 0 = <1R, 3 = >2R
  mfeX: number | null,     // solo con mfe 3: hasta cuántos R llegó (>2, hasta 50, 2 decimales); null = sin dato
  note: string,            // descripción libre, hasta 500 caracteres
  createdAt: number,
  entry: Array<'fvg' | 'ob' | 'borde'>,     // punto de entrada, multiselección (puede quedar vacía), sin repetidos y en ese orden
  fvgFormed: true | false | null }         // ¿el impulso (post ruptura/absorción del borde) dejó FVG? (opcional)
```
- Guardado en `orb-bt:v5`. Al abrir, si no existe, se migra desde `orb-bt:v4`, `v3`, `v2` o `v1` (las viejas quedan intactas como respaldo). v2 guardaba `entry` como valor único o null; v3 lo pasa a lista; v4 suma `fvgFormed`; v5 suma `mfeX` (cada vez con clave nueva para que una versión vieja de la app no lea ni pise esos datos). `normalize()` en `js/store.js` lleva cualquier trade al formato actual; Importar acepta todas las versiones.
- **Regla**: agregar un valor nuevo a un campo validado (tipo, R:R, MFE, punto de entrada) también es cambio de formato → subir la clave.
- Estadísticas por punto de entrada con `groupByTags`: un trade con varias marcas cuenta en cada grupo.
- R real del trade: `TP → +rr`, `SL → −1`.
- Validaciones de consistencia en la UI: con TP, `mfe >= rr`; con SL, `mfe < rr`.
- "Take profit ideal" (tarjeta "¿Hasta dónde llegaron? · RR ideal"): con objetivo T, el trade gana si llegó a T, si no, se asume −1R. Objetivos 1/1.5/2 siempre; si algún trade tiene `mfeX`, también 2.5/3/4 (`TARGETS_EXT`), contando solo los trades con dato (los >2 sin número quedan afuera de esas filas y se avisa). Las tablas por grupo siguen con 1/1.5/2.
- Profit factor = R ganado ÷ R perdido (resultados reales, no el potencial).

## Cómo correr
- `npm start` → http://localhost:8080 (o la extensión Live Server de VS Code).
- `npm test` → tests de estadísticas.
- El service worker solo corre en https o localhost; para probar offline: cargar en localhost, esperar un segundo y desactivar la red en DevTools.

## Ideas para seguir (por orden de valor)
1. ~~Punto de entrada~~ (hecho: FVG / OB / borde del rango, multiselección desde v3, con tabla de TP ideal por punto de entrada). A Mati **no** le interesan campos como rango vs ATR, PDH/PDL, Asia/Londres o noticias: no proponerlos.
2. ~~Editar un trade existente desde el historial~~ (hecho: edición *inline* en la tarjeta del historial — `itemEditor()` en `js/app.js`, guarda con `DB.update`, mantiene id y createdAt. Mati quiere poder editar uno tras otro sin cambiar de pantalla).
3. Filtro por rango de fechas en Estadísticas.
4. ~~MFE exacto~~ (hecho a medias, a pedido de Mati: número opcional solo cuando marca "más de 2:1"; el resto sigue en categorías).
5. Foto/captura por trade.
6. Sincronización opcional (por ahora todo es local a propósito).
