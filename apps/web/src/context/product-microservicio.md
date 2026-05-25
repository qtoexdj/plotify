# Producto - Plotify Microservicio

## 📋 Descripción del Servicio

El **Plotify Microservicio** es un componente especializado en el procesamiento de datos geoespaciales complejos. Su función principal es actuar como un "Traductor de CAD a Web", permitiendo que la plataforma Plotify ingiera archivos de ingeniería (DWG/DXF) y los visualice en mapas web modernos.

---

## 🚀 Capacidades Principales

### 1. Procesamiento CAD Multiformato

El servicio soporta la extracción de geometría desde los estándares más comunes de la industria:

- **DXF (Drawing Exchange Format)**: Soporte nativo para formatos ASCII y Binarios.
- **DWG (AutoCAD Drawing)**: Soporte completo mediante integración con **ODA File Converter**.
- **Versiones Soportadas**: Desde AutoCAD R12 hasta R2018 (vía ODA).

### 2. Transformación Geoespacial

- **Reproyección Automática**: Convierte coordenadas locales (ej. PSAD56, UTM Zona 19S) a **WGS84 (EPSG:4326)**, el estándar para GPS y mapas web.
- **Simplificación Inteligente**: Aplica algoritmos (Douglas-Peucker) para reducir la cantidad de vértices en geometrías complejas sin perder la forma visual, optimizando el rendimiento en el frontend.

### 3. Clasificación Automática de Entidades

El servicio aplica reglas de negocio durante la extracción para categorizar elementos:

| Tipo GeoJSON      | Criterio de Clasificación                                    | Uso en Plotify                      |
| :---------------- | :----------------------------------------------------------- | :---------------------------------- |
| **`LOT`**         | Polígonos cerrados en capas sin keywords especiales.         | Unidades vendibles.                 |
| **`ROAD`**        | Líneas abiertas o capas de vialidad.                         | Visualización de calles y accesos.  |
| **`COMMON_AREA`** | Polígonos con keywords como "plaza", "parque", "área verde". | Zonas de equipamiento no vendibles. |

---

## 🔄 Flujos de Usuario (Input/Output)

### Input (Lo que recibe)

1. **Archivo**: Binario `.dxf` o `.dwg`.
2. **Sistema de Coordenadas (EPSG)**: Código numérico del sistema de origen (ej. `32719` para Chile Central UTM).
3. **ID de Proyecto**: Header `x-project-id` para trazabilidad y aislamiento.

### Output (Lo que entrega)

### Output (Lo que entrega)

Un objeto **`GeoJSON FeatureCollection` extendido**.

```json
{
  "type": "FeatureCollection",
  "features": [
    {
      "type": "Feature",
      "geometry": { ... },
      "properties": {
        "layer": "0",
        "type": "LOT",
        "original_vertex_count": 4
      }
    }
  ],
  // Miembros foráneos (Metadata al nivel raíz)
  "filename": "archivo.dwg",
  "metadata": {
    "project_id": "123",
    "source_epsg": 32719,
    "feature_count": 1
  }
}
```

---

## 🚧 Limitaciones Conocidas

1. **Entidades Soportadas**:
   - Soporte principal para `LWPOLYLINE`, `POLYLINE` y `LINE`.
   - Arcos y Círculos son aproximados o ignorados si no se convierten a polilíneas previas.
   - Textos (MTEXT/TEXT) y Cotas (DIMENSION) son ignorados actualmente.

2. **Dimensiones**:
   - Solo procesa geometría 2D. La coordenada Z (elevación) se descarta/aplana.

3. **Dependencia Externa (DWG)**:
   - El procesamiento de DWG requiere que **ODA File Converter** esté instalado en el servidor host.

---

## 🎯 Objetivos de Calidad

- **Tiempo de Respuesta**: < 5 segundos para archivos de complejidad media (5MB).
- **Precisión**: Desviación < 10cm en transformación de coordenadas.
- **Resiliencia**: Si falla un archivo DWG, debe reportar claramente si es por corrupción del archivo o fallo del conversor.
