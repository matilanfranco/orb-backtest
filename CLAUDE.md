# ORB Backtest Log — contexto del proyecto

## Qué es y para qué
App móvil (PWA) para que Mati registre a mano un backtesting de su estrategia **ORB sobre NQ/Nasdaq**: la primera vela de M15 de la apertura de NY (9:30–9:45) marca el rango, y opera dos tipos de entrada:

- **Absorción**: una vela de M5 cierra dentro del rango tras una ruptura fallida; entra por orden stop, con el SL en la última mecha/estructura que absorbió. Objetivo 1:1.
- **Ruptura**: espera la ruptura y entra con orden límite en un FVG, con el SL en una zona de estructura de M1. Objetivo 1:1.

La pregunta que quiere responder con los datos: **¿qué objetivo conviene (1:1, 1.5:1, 2:1) y qué tipo de entrada rinde mejor?** Quiere distinguir los setups de 1.5 de los de 1.1, así que más adelante conviene sumar campos de contexto para filtrar (ver ideas).

## Reglas del proyecto
- **Sin build ni dependencias**: HTML/CSS/JS puro con `<script>` clásicos (no módulos ES, para que también abra desde `file://`).
- **Offline primero**: todo en `localStorage` (clave `orb-bt:v1`) + service worker (`sw.js`). Si agregás archivos nuevos que la app necesite, sumalos a `ASSETS` en `sw.js`.
- UI en **español**, pensada para celu (botones grandes, una mano). Mantener simple el flujo de registro: pocas pantallas, pocos toques.
- La lógica de estadísticas vive en `js/stats.js` como funciones puras y se prueba con `npm test` (node:test). La migración/importación de `js/store.js` se prueba en `tests/store.test.js` con un localStorage falso. Cualquier cambio de cálculo lleva su test.
- Los datos del usuario no se pueden romper: si cambia el formato guardado, subir la versión de la clave y migrar; mantener Exportar/Importar JSON.

## Modelo de datos (un trade)
```js
{ id, date: 'YYYY-MM-DD', type: 'absorcion' | 'ruptura',
  rr: 1 | 1.5 | 2, result: 'TP' | 'SL',
  mfe: 0 | 1 | 1.5 | 2 | 3,   // máximo movimiento a favor antes de volver al SL: 0 = <1R, 3 = >2R
  note: string, createdAt: number,
  // contexto (v2, opcional: null = no cargado)
  range: 'chico' | 'normal' | 'grande' | null,   // vela 9:30–9:45 vs ATR diario: <15%, 15–30%, >30%
  space: 'lt1' | '1a2' | 'gt2' | null,           // espacio hasta el próximo nivel (PDH/PDL, Asia, Londres), en R desde la entrada
  candle: 'fuerte' | 'debil' | null,             // vela de ruptura: fuerte = cuerpo grande / FVG propio
  news: true | false | null }                    // día de noticias
```
- Guardado en `orb-bt:v2`. Al abrir, si no existe, se migra desde `orb-bt:v1` (que queda intacta como respaldo). `normalize()` en `js/store.js` lleva cualquier trade v1/v2 al formato actual; Importar acepta ambos.
- Al registrar, `range` y `news` se precargan del último trade de la misma fecha (son datos del día).
- R real del trade: `TP → +rr`, `SL → −1`.
- Validaciones de consistencia en la UI: con TP, `mfe >= rr`; con SL, `mfe < rr`.
- "Take profit ideal": con objetivo T, el trade gana si `mfe >= T`, si no, se asume −1R.

## Cómo correr
- `npm start` → http://localhost:8080 (o la extensión Live Server de VS Code).
- `npm test` → tests de estadísticas.
- El service worker solo corre en https o localhost; para probar offline: cargar en localhost, esperar un segundo y desactivar la red en DevTools.

## Ideas para seguir (por orden de valor)
1. ~~Campos de contexto por trade~~ (hecho en v2: rango vs ATR, espacio al nivel, vela de ruptura, noticias, con tabla de TP ideal por contexto). Siguiente paso posible: cruzar dos campos (ej. espacio >2R + vela fuerte).
2. Editar un trade existente desde el historial.
3. Filtro por rango de fechas en Estadísticas.
4. MFE exacto en R (número libre) en vez de categorías, para ver el TP ideal con más resolución.
5. Foto/captura por trade.
6. Sincronización opcional (por ahora todo es local a propósito).
