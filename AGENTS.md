# AGENTS.md — Guía para Agentes de IA (`katze_3D_logos`)

Este documento resume la arquitectura, los archivos y los contratos exactos de `katze_3D_logos` para que cualquier agente de IA pueda entender el repositorio en segundos e integrar cualquiera de los logos o la animación completa en otra aplicación o página web sin ensayo y error.

---

## 1. Mapa del Repositorio

| Ruta | Propósito | Notas clave para agentes |
| :--- | :--- | :--- |
| `models/eco.glb` | Logo **Eco** individual (sin base, negro mate, 5 nodos nombrados bajo `EcoRoot`). | Altura ~`1.0 m`, centrado en `(0, 0, 0)`, `+Y` arriba, `+Z` frente. |
| `models/katze.glb` | Logo **Katze** individual (contorno 3D con muesca circular en oreja derecha + Eco adentro, sin base). | Nodo raíz `KatzeRoot` con `Katze_Contour` y `Eco_Inner`. |
| `models/odoo.glb` | Logotipo **Odoo** completo (sin base). | 4 nodos: `Odoo_O_Purple` (`#714B67`), `Odoo_D_Gray`, `Odoo_O2_Gray`, `Odoo_O3_Gray` (`#8F8F8F`). |
| `models/odoo-o.glb` | Isotipo **O** de Odoo (sin base, `#714B67`). | Nodo raíz `OdooORoot`, grosor escultórico proporcional. |
| `models/katze-showcase-animated.glb` | Archivo **glTF 2.0 completo con animación** (`KatzeFullShowcase`, loop continuo de `24.0 s`). | Core glTF 2.0 puro (sin extensiones propietarias): incluye 24 segmentos progresivos de Katze, salida en cascada de `d`, `o`, `o`, y 2 *morph targets* en `Odoo_O_Hero` para el moldeado tipo plastilina hacia el diamante de Eco. |
| `index.html` | Página de exhibición 3D exacta con pedestal minimalista, sombras PCF 2048×2048 y barra responsiva (`01 Eco`, `02 Katze`, `03 Odoo`, `04 Odoo · O` / `O`). | Funciona directo vía `file://` o HTTP sin build step. |
| `implementacion.html` | Página interactiva de referencia que muestra los 4 modelos individuales y el showcase completo sobre fondos claro, oscuro y alfa, con snippets copiables. | Funciona directo vía `file://` o HTTP. |
| `js/math3d.js` | Matrices 4×4 column-major (`Katze3D.Math3D`), ángulos isométricos (`ISO_ELEVATION = asin(1/sqrt(3))`, `ISO_AZIMUTH = PI/4`) y curvas `Katze3D.Easing`. | Sin dependencias, namespace global `window.Katze3D`. |
| `js/logo-geometries.js` | Constructores WebGL2 de Eco, Katze (muesca circular), Odoo (`o`, `d`), motor de morphing tipo plastilina (`createClayMorphEngine`) y pedestal (`buildExhibitionStage`). | Reutilizado por `index.html` y por `<katze-logo-3d>`. |
| `js/webgl-renderer.js` | Renderizador PBR Cook-Torrance GGX en WebGL2 (`Katze3D.createRenderer`). Soporta `transparent: false` (exhibición con sombras) y `transparent: true` (fondo transparente + `darkTone`). | Shaders GLSL ES 3.00 embebidos; sin texturas externas. |
| `js/choreography.js` | Máquina de estados de animación (`Katze3D.createDirector`) con las 4 transiciones coreografiadas (incluido trazado progresivo de Katze, salida de `d,o,o` y morphing de plastilina en tiempo real). | Fuente única de verdad para la animación WebGL2. |
| `js/katze-logo-3d.js` | Custom Element `<katze-logo-3d>` sin base, fondo transparente, `ResizeObserver` e `IntersectionObserver`. | Atributos: `model`, `tone`, `speed`, `float`, `zoom`, `hold`, `interactive`, `paused`. |

---

## 2. Especificaciones Visuales y Reglas de Integración

1. **Colores oficiales**:
   - **Eco / Katze**: Negro mate escultórico (acabado cerámico/piedra, `roughness ~ 0.48`, biseles suaves que captan reflejos de estudio).
   - **Odoo Primary (`o`)**: `#714B67` (`RGB(113, 75, 103)`).
   - **Odoo Gray (`d`, `o`, `o`)**: `#8F8F8F` (`RGB(143, 143, 143)`).
2. **Proyección isométrica**:
   - Usar cámara **ortográfica** en elevación `35.264°` (`Math.asin(1 / Math.sqrt(3))`) y azimut `45°` (`Math.PI / 4`).
   - En `<model-viewer>`, aproximar la vista isométrica con `camera-orbit="45deg 54.7deg 2.5m"` y `field-of-view="20deg"` (o menor).
3. **Cuándo elegir cada método de integración**:
   - **Opción A — Web Component `<katze-logo-3d>` (`js/*.js`)**: Elegir cuando se quiera **0 dependencias externas**, **fondo 100% transparente**, **morphing tipo plastilina en tiempo real con cambio gradual de color** (`#714B67 → negro mate`) y **trazado continuo exacto de Katze** con el mismo shader PBR de la exhibición.
   - **Opción B — `.glb` + `<model-viewer>` o Three.js / React Three Fiber**: Elegir cuando el proyecto ya use Three.js/R3F, Webflow, Framer, Shopify o cuando se requiera un único archivo 3D estándar (`models/katze-showcase-animated.glb` con el clip `KatzeFullShowcase` o cualquiera de los 4 `.glb` individuales).
4. **Legibilidad y minimalismo**:
   - Mantener el código claro, plano y fácil de leer; evitar abstracciones innecesarias o dependencias pesadas si el proyecto destino no las requiere.
   - No incluir el pedestal cuando se integre el logo en otras páginas; mantener el fondo transparente (`alpha: true` / `background: transparent`).
   - En contenedores estrechos o móviles, asegurarse de pausar el render fuera de viewport (`IntersectionObserver`) y ajustar la escala ortográfica para que el logo no se recorte horizontalmente.

---

## 3. Cómo abrir y verificar localmente

```bash
# Abrir servidor estático local (opcional para file://, recomendado para probar .glb en <model-viewer>/Three.js)
python3 -m http.server 8000
# Exhibición completa:     http://localhost:8000/index.html
# Página de implementación: http://localhost:8000/implementacion.html
```

---

## 4. Prompt listo para copiar y pegar (para pedir a una IA que implemente la animación en cualquier proyecto)

Copia el bloque siguiente y reemplaza únicamente los corchetes `[...]` con los datos de tu proyecto:

```markdown
Quiero integrar la animación 3D isométrica de los logos del repositorio `katze_3D_logos`
(secuencia: Eco → Katze → Odoo → Odoo · O → Eco) en [DESCRIBIR AQUÍ TU COMPONENTE O PÁGINA, ej. "el Hero de mi landing en Next.js con Tailwind" / "un bloque HTML en mi sitio estático"].

Contexto del repositorio fuente (`katze_3D_logos`):
- Modelos glTF 2.0 (.glb) sin base y centrados en el origen:
  - `models/eco.glb` (Eco, negro mate)
  - `models/katze.glb` (Katze, contorno 3D con muesca circular + Eco)
  - `models/odoo.glb` (Odoo completo, #714B67 y #8F8F8F)
  - `models/odoo-o.glb` (O morada de Odoo, #714B67)
  - `models/katze-showcase-animated.glb` (animación completa en loop de 24 s, clip llamado `KatzeFullShowcase`, con morph targets de plastilina y trazado progresivo)
- Web Component sin dependencias y con fondo transparente:
  - Archivos requeridos en orden: `js/math3d.js`, `js/logo-geometries.js`, `js/webgl-renderer.js`, `js/choreography.js`, `js/katze-logo-3d.js`
  - Etiqueta: `<katze-logo-3d model="showcase" tone="light" speed="0.44"></katze-logo-3d>` (atributos `model`: `eco | katze | odoo | o | showcase`; `tone`: `light | dark`).

Requisitos de implementación:
1. Mostrar [ELEGIR: "la animación completa de transformación (showcase)" / "solo el logo Eco" / "solo el logo Katze" / "solo Odoo" / "solo la O"] sin pedestal y con fondo 100% transparente para que se integre de forma natural sobre mi fondo [ELEGIR: "claro" / "oscuro"].
2. Mantener la vista isométrica real (proyección ortográfica a 35.3° / 45°), rotación suave y flotación continua.
3. Preferir el método más limpio para mi stack:
   - Si mi proyecto es HTML/JS/Astro/Vue/Webflow o no usa Three.js: integrar el Web Component `<katze-logo-3d>` (0 dependencias, reproduce el morphing de plastilina con cambio suave de color y el trazado 3D exacto) o `<model-viewer>` con `models/katze-showcase-animated.glb`.
   - Si mi proyecto ya usa React Three Fiber / Three.js: cargar `models/katze-showcase-animated.glb` con `useGLTF` + `useAnimations` reproduciendo `KatzeFullShowcase` en un `<Canvas orthographic gl={{ alpha: true }}>` con iluminación de estudio.
4. Asegurar que sea responsivo en móvil y desktop (sin recortar el modelo), pausar el renderizado cuando no esté visible en pantalla, y escribir código simple, claro y fácil de leer.
```
