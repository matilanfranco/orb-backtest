# ORB Backtest Log

App simple para registrar y analizar a mano tus setups del ORB (primera vela de M15, 9:30–9:45 NY): **entrada por absorción** o **entrada por ruptura**. Funciona en el celu, sin internet, y guarda todo en el `localStorage` del dispositivo.

Sin dependencias ni build: HTML + CSS + JS puro.

## Flujo de registro

1. Elegís la **fecha** y tocás **Entrada por absorción** o **Entrada por ruptura**.
2. **R:R**: 1:1 por defecto (también 1.5:1 y 2:1).
3. **¿Salió SL o Take?**
4. **Máximo movimiento antes de llegar al nivel del SL**: menos de 1:1, 1:1, 1.5:1, 2:1 o más de 2:1. Las opciones imposibles quedan deshabilitadas (si salió Take, el movimiento fue al menos tu R:R; si salió SL, no llegó a tu objetivo).
5. **Punto de entrada (opcional)**, en la misma pantalla: **FVG**, **OB** y/o **Borde del rango**. Podés marcar varios; tocá de nuevo para desmarcar. Después, **¿El impulso dejó FVG?** Sí / No: si el movimiento después de romper o absorber el borde del rango dejó un FVG (opcional, sirve para absorción y ruptura; es independiente de si entraste en el FVG). Abajo hay un cuadro de **descripción** libre (opcional).
6. **Guardar**. La fecha queda seleccionada para cargar varios trades del mismo día.

**Editar un trade:** Historial → *Editar*. La tarjeta se abre ahí mismo con todo en versión compacta (fecha, tipo, R:R, resultado, máximo movimiento, punto de entrada, descripción). *Guardar* la cierra en el mismo lugar, así pasás directo al siguiente. Si abrís otro con cambios sin guardar, te pregunta antes de descartarlos.

## Estadísticas

Filtrables por tipo de entrada (todas / absorción / ruptura):

- Trades, win rate (con margen de error 95%), R neto, expectativa por trade, profit factor, drawdown máximo, rachas.
- **Por tipo de entrada**, los dos lado a lado (en "Todas"): trades, win rate con margen de error, win rate mínimo, R neto, expectativa, profit factor, drawdown, racha perdedora y TP ideal, con el mejor de cada fila resaltado.
- Win rate real vs. el mínimo que necesitás según tus R:R.
- Curva de capital en R.
- **Take profit ideal**: para 1:1, 1.5:1 y 2:1, qué porcentaje de tus trades llegó al objetivo y qué expectativa daría cada uno.
- Distribución del máximo movimiento.
- **Take profit ideal por punto de entrada**: para FVG, OB y borde del rango, la expectativa con 1:1, 1.5:1 y 2:1. Si un trade tiene varios marcados, cuenta en cada grupo. Los grupos con menos de 10 trades se ven atenuados.
- **Take profit ideal: ¿el impulso dejó FVG?**: lo mismo, separando los trades donde el impulso dejó FVG de los que no. Respeta el filtro de arriba (ej. solo absorción).
- Desglose por R:R elegido y por día de la semana.

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

- Se guardan en el `localStorage` del navegador, en tu dispositivo, en el momento en que tocás Guardar. No hay servidor ni cuenta. Funciona igual sin internet y sobrevive a cerrar la app.
- La app le pide al navegador **almacenamiento persistente** para que no borre los datos aunque falte espacio (en Historial dice "Almacenamiento protegido ✓" si lo aceptó).
- Lo que sí borra el historial: desinstalar la app, borrar los datos del sitio en el navegador, o usar navegación privada. En iPhone, Safari y la app instalada en la pantalla de inicio **no comparten datos**: usá siempre el ícono.
- **Backup:** Historial → *Exportar JSON* (o el botón *Hacer backup* del aviso). La app te avisa si nunca exportaste y tenés 5+ trades, o si pasaron 7+ días / 20+ trades nuevos desde el último backup. *Importar JSON* mezcla sin duplicar.

## Actualizaciones

Con internet, la app siempre carga la última versión publicada; sin internet, usa la que tiene guardada. La versión instalada se ve al pie de la tarjeta *Datos* en Historial. Si no ves un cambio: abrila con internet, esperá unos segundos, cerrala del todo (deslizándola en el selector de apps) y volvé a abrirla.

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
