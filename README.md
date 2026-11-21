# katze_3D_logos

Colección minimalista y lista para producción de los modelos 3D isométricos de **Eco**, **Katze**, **Odoo** y **Odoo · O**, junto con la página interactiva de exhibición, la guía visual de implementación y el archivo 3D animado con la secuencia completa de transformación.

Todo el código del repositorio está escrito en **HTML, CSS y JavaScript estándar (sin bundlers ni dependencias externas)** para que sea fácil de leer, entender y modificar.

---

## Qué contiene el repositorio

```text
katze_3D_logos/
├── index.html                           # Página de exhibición 3D interactiva (con pedestal y sombras)
├── implementacion.html                  # Página visual de cómo implementar cada modelo (sin base, fondo transparente)
├── js/
│   ├── math3d.js                        # Matrices 3D (proyección ortográfica isométrica) y funciones de easing
│   ├── logo-geometries.js               # Geometría 3D de Eco, Katze (con muesca circular), Odoo, morphing y pedestal
│   ├── webgl-renderer.js                # Renderizador PBR WebGL2 (luces de estudio, sombras PCF y modo transparente)
│   ├── choreography.js                  # Coreografía de los 4 logos y sus transiciones (trazado 3D, salida y plastilina)
│   └── katze-logo-3d.js                 # Web Component reutilizable <katze-logo-3d> (0 dependencias)
├── models/
│   ├── eco.glb                          # Modelo 3D individual: Eco (negro mate, 5 capas, sin base)
│   ├── katze.glb                        # Modelo 3D individual: Katze (contorno 3D con muesca circular + Eco, sin base)
│   ├── odoo.glb                         # Modelo 3D individual: Odoo palabra completa (#714B67 y #8F8F8F, sin base)
│   ├── odoo-o.glb                       # Modelo 3D individual: Letra O morada de Odoo (#714B67, sin base)
│   └── katze-showcase-animated.glb      # Modelo 3D completo con toda la animación de transformación (loop de 24 s)
├── README.md                            # Esta guía
└── AGENTS.md                            # Guía técnica para agentes de IA + prompt listo para implementar la animación
```

### Detalle de los modelos 3D (`.glb` / glTF 2.0)

| Archivo | Contenido | Tamaño aprox. | Uso ideal |
| :--- | :--- | :---: | :--- |
| `models/eco.glb` | Logo **Eco** en negro mate (5 piezas en capas escalonadas) | ~34 KB | Web (`<model-viewer>`, Three.js), Blender, Spline |
| `models/katze.glb` | Contorno 3D del gato con muesca circular en oreja derecha + **Eco** adentro | ~249 KB | Web, Blender, Spline |
| `models/odoo.glb` | Palabra **Odoo** en 3D (`#714B67` en la primera `o`, `#8F8F8F` en `d`, `o`, `o`) | ~375 KB | Web, Blender, Spline |
| `models/odoo-o.glb` | Isotipo **O** de Odoo en morado `#714B67` | ~121 KB | Web, Blender, Spline |
| `models/katze-showcase-animated.glb` | Animación completa (`KatzeFullShowcase`, loop 24 s): `Eco → Katze → Odoo → O → Eco` con trazado progresivo y *morph targets* de plastilina | ~982 KB | `<model-viewer autoplay>`, Three.js, React Three Fiber, Blender |

---

## Cómo abrir las páginas

No necesitas instalar paquetes ni compilar nada.

### Opción 1: Directo en el navegador (más rápido)
- **Exhibición 3D completa**: haz doble clic en `index.html`.
- **Guía visual de implementación**: haz doble clic en `implementacion.html`.

*(Todos los scripts locales se cargan con etiquetas `<script>` clásicas para evitar bloqueos de CORS al abrir en `file://`.)*

### Opción 2: Con un servidor local (recomendado si pruebas los archivos `.glb` en `<model-viewer>` o Three.js)
Ejecuta cualquiera de estos comandos dentro de la carpeta del repositorio:

```bash
# Con Python 3
python3 -m http.server 8000

# O con Node.js
npx serve .
```

Luego abre en tu navegador:
- Exhibición: `http://localhost:8000/index.html`
- Implementación: `http://localhost:8000/implementacion.html`

### Controles de la exhibición (`index.html`)
- **Arrastrar con el mouse / dedo**: inspeccionar el modelo desde cualquier ángulo.
- **Rueda del mouse**: acercar o alejar.
- **Pestañas `01 Eco` · `02 Katze` · `03 Odoo` · `04 Odoo · O` (o teclas `1`–`4` / flechas `←` `→`)**: cambiar de pieza manualmente.
- **Botón Pausar / tecla `Espacio`**: pausar o reanudar la rotación y el carrusel automático.
- **Botón Isométrica / doble clic / tecla `R`**: restaurar la vista isométrica exacta (`35.3° / 45.0°`).

---

## Cómo implementar los modelos en cualquier página web

### Forma 1: Con `<model-viewer>` usando los archivos `.glb` (universal)
Funciona en **HTML puro, Webflow, Framer, Shopify, WordPress** y cualquier CMS.

```html
<!-- 1. Incluye model-viewer una sola vez en tu página -->
<script type="module" src="https://ajax.googleapis.com/ajax/libs/model-viewer/3.5.0/model-viewer.min.js"></script>

<!-- 2A. Modelo individual (cambia src por eco.glb, katze.glb, odoo.glb u odoo-o.glb) -->
<model-viewer
  src="models/katze.glb"
  auto-rotate
  rotation-per-second="24deg"
  camera-controls
  disable-zoom
  camera-orbit="45deg 54.7deg 2.5m"
  field-of-view="20deg"
  shadow-intensity="0"
  style="width: 320px; height: 320px; background: transparent;">
</model-viewer>

<!-- 2B. Animación completa de transformación (un solo archivo .glb) -->
<model-viewer
  src="models/katze-showcase-animated.glb"
  autoplay
  animation-name="KatzeFullShowcase"
  camera-controls
  disable-zoom
  camera-orbit="45deg 54.7deg 2.5m"
  field-of-view="20deg"
  shadow-intensity="0"
  style="width: 340px; height: 340px; background: transparent;">
</model-viewer>
```

### Forma 2: Con `<katze-logo-3d>` (0 librerías externas, fondo transparente, shader PBR exacto)
Copia la carpeta `js/` a tu proyecto e inserta el componente directamente en tu HTML:

```html
<script src="js/math3d.js"></script>
<script src="js/logo-geometries.js"></script>
<script src="js/webgl-renderer.js"></script>
<script src="js/choreography.js"></script>
<script src="js/katze-logo-3d.js"></script>

<!-- model puede ser: "eco" | "katze" | "odoo" | "o" | "showcase" -->
<!-- tone puede ser: "light" (fondos claros) o "dark" (fondos oscuros) -->
<katze-logo-3d
  model="showcase"
  tone="light"
  speed="0.44"
  style="width: 320px; height: 320px;">
</katze-logo-3d>
```

Atributos opcionales de `<katze-logo-3d>`:
- `model`: `"eco"`, `"katze"`, `"odoo"`, `"o"` o `"showcase"` (animación completa).
- `tone`: `"light"` (por defecto) o `"dark"` (añade luz de contorno para fondos oscuros).
- `speed`: velocidad de giro en rad/s (por defecto `0.44`; `0` para estático).
- `float`: intensidad de flotación (por defecto `1`; `0` para desactivar).
- `hold`: segundos de pausa por logo cuando `model="showcase"` (por defecto `4.5`).
- `interactive`: `"true"` (por defecto) o `"false"`.
- `paused`: agrega el atributo para iniciar pausado.

### Forma 3: En React / Next.js con Three.js (`@react-three/fiber`)

```jsx
import { Canvas } from '@react-three/fiber';
import { Environment, OrbitControls, useAnimations, useGLTF } from '@react-three/drei';
import { useEffect, useRef } from 'react';

function AnimatedLogos() {
  const group = useRef();
  const { scene, animations } = useGLTF('/models/katze-showcase-animated.glb');
  const { actions } = useAnimations(animations, group);

  useEffect(() => {
    actions['KatzeFullShowcase']?.reset().play();
  }, [actions]);

  return <primitive ref={group} object={scene} />;
}

export function Katze3DWidget() {
  return (
    <Canvas orthographic camera={{ position: [5, 4.08, 5], zoom: 210 }} gl={{ alpha: true }}>
      <Environment preset="studio" />
      <AnimatedLogos />
      <OrbitControls enableZoom={false} enablePan={false} />
    </Canvas>
  );
}
```

---

## ¿Usas un asistente de IA para integrar esto en otro proyecto?
Consulta [AGENTS.md](./AGENTS.md): contiene el contexto técnico compacto para agentes y un **prompt listo para copiar y pegar** para integrar los logos o la animación completa en cualquier componente o página web.
