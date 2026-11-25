# ORB Backtest Log

App simple para registrar y analizar a mano tus setups del ORB (primera vela de M15, 9:30–9:45 NY): **entrada por absorción** o **entrada por ruptura**. Funciona en el celu, sin internet, y guarda todo en el `localStorage` del dispositivo.

Sin dependencias ni build: HTML + CSS + JS puro.

## Flujo de registro

1. Elegís la **fecha** y tocás **Entrada por absorción** o **Entrada por ruptura**.
2. **R:R**: 1:1 por defecto (también 1.5:1 y 2:1).
3. **¿Salió SL o Take?**
4. **Máximo movimiento antes de llegar al nivel del SL**: menos de 1:1, 1:1, 1.5:1, 2:1 o más de 2:1. Las opciones imposibles quedan deshabilitadas (si salió Take, el movimiento fue al menos tu R:R; si salió SL, no llegó a tu objetivo).
5. **Punto de entrada (opcional)**, en la misma pantalla: **FVG**, **OB** o **Borde del rango**. Tocá de nuevo para quitarlo. Abajo hay un cuadro de **descripción** libre (opcional).
6. **Guardar**. La fecha queda seleccionada para cargar varios trades del mismo día.

## Estadísticas

Filtrables por tipo de entrada (todas / absorción / ruptura):

- Trades, win rate (con margen de error 95%), R neto, expectativa por trade, profit factor, drawdown máximo, rachas.
- Win rate real vs. el mínimo que necesitás según tus R:R.
- Curva de capital en R.
- **Take profit ideal**: para 1:1, 1.5:1 y 2:1, qué porcentaje de tus trades llegó al objetivo y qué expectativa daría cada uno.
- Distribución del máximo movimiento.
- **Take profit ideal por punto de entrada**: para FVG, OB y borde del rango, la expectativa con 1:1, 1.5:1 y 2:1. Los grupos con menos de 10 trades se ven atenuados.
- Desglose por tipo de entrada, por R:R elegido y por día de la semana.

**Supuesto del take profit ideal:** un trade "gana" con objetivo T si su máximo movimiento llegó a T; si no llegó, se asume pérdida de 1R. Con menos de ~30 trades la app avisa que la muestra es chica.

## Abrirla en VS Code

1. Descomprimí la carpeta y abrila con **File → Open Folder**.
2. Instalá la extensión recomendada **Live Server** (VS Code te la sugiere) y tocá **Go Live**, o desde la terminal: `npm start` (usa `python3 -m http.server 8080`) y abrí `http://localhost:8080`.
3. Tests de las estadísticas: `npm test` (Node 20 o superior).

## Usarla en el celu, offline

El modo offline (service worker) solo funciona sobre **https** (o localhost), así que hay que publicarla una vez. Opciones gratis y simples:

- **GitHub Pages:** subí la carpeta a un repo → Settings → Pages → Deploy from branch `main`, carpeta `/ (root)`.
- **Netlify** o **Cloudflare Pages:** arrastrar la carpeta.

Después, en el celu:

1. Abrí la URL una vez con internet.
2. **iPhone (Safari):** Compartir → *Agregar a pantalla de inicio*. **Android (Chrome):** menú ⋮ → *Instalar app*.
3. Abrila desde el ícono. Desde ahí funciona sin conexión.

## Tus datos

- Se guardan en el `localStorage` del navegador, en tu dispositivo. No hay servidor ni cuenta.
- El `localStorage` se puede perder si borrás los datos del sitio o desinstalás la app. En iPhone, Safari puede limpiar el almacenamiento de sitios que no se usan por varios días; instalada en la pantalla de inicio es mucho más estable.
- **Hacé backup de vez en cuando:** Historial → *Exportar JSON* (o CSV). *Importar JSON* mezcla sin duplicar.

## Estructura

```
index.html            pantalla única con 3 pestañas
styles.css
js/stats.js           estadísticas puras (sin DOM) — con tests
js/store.js           localStorage, export/import
js/app.js             interfaz
sw.js                 service worker (offline)
manifest.webmanifest  instalación como app
tests/stats.test.js   tests de estadísticas
tests/store.test.js   tests de migración e importación
CLAUDE.md             contexto para seguir con Claude Code
```
