"""
Plotify MCP Server.
Proporciona herramientas estandarizadas MCP para explorar proyectos inmobiliarios,
acceder al inventario de lotes y ejecutar el Generador de Textos Legales de Plotify.
"""

import json
import sys
from pathlib import Path
from typing import Any, Dict, List, Optional
from pydantic import Field

# Asegurar que el paquete sea importable
package_root = Path(__file__).resolve().parent.parent
if str(package_root) not in sys.path:
    sys.path.insert(0, str(package_root))

try:
    from mcp.server.mcpserver import MCPServer
    from mcp.types import ToolAnnotations
    mcp = MCPServer(
        "plotify_mcp",
        instructions="Servidor MCP oficial de Plotify para consultar proyectos inmobiliarios, estado de lotes, clientes y generar textos legales para escrituras.",
    )
    READ_ONLY_ANNOTATION = ToolAnnotations(read_only_hint=True, destructive_hint=False, idempotent_hint=True)
except ImportError:
    from mcp.server.fastmcp import FastMCP  # type: ignore
    mcp = FastMCP("plotify_mcp")
    READ_ONLY_ANNOTATION = None

from plotify_mcp import services


@mcp.tool(
    name="plotify_list_projects",
    description="Lista todos los proyectos inmobiliarios registrados en Plotify con métricas de inventario (lotes totales, disponibles, reservados, vendidos), ubicación (comuna, región) y estado.",
    annotations=READ_ONLY_ANNOTATION,
)
def list_projects(
    estado: Optional[str] = Field(
        default=None,
        description="Filtrar por estado del proyecto (ej: 'operational', 'draft', 'active').",
    ),
    search: Optional[str] = Field(
        default=None,
        description="Texto para buscar en el nombre del proyecto, comuna o región.",
    ),
    limit: int = Field(
        default=50,
        description="Cantidad máxima de proyectos a retornar (default 50).",
        ge=1,
        le=200,
    ),
) -> str:
    """Retorna la lista de proyectos inmobiliarios en formato JSON."""
    try:
        data = services.list_projects(estado=estado, search=search, limit=limit)
        return json.dumps({"status": "success", "count": len(data), "projects": data}, ensure_ascii=False, indent=2)
    except Exception as e:
        return json.dumps({"status": "error", "message": str(e)}, ensure_ascii=False)


@mcp.tool(
    name="plotify_get_project",
    description="Obtiene el detalle técnico y legal completo de un proyecto inmobiliario por su ID o por su nombre (métricas de lotes, documentos legales adjuntos, plano matriz, dimensiones de vías y vendedores asignados).",
    annotations=READ_ONLY_ANNOTATION,
)
def get_project(
    project_id: Optional[str] = Field(
        default=None,
        description="UUID del proyecto en Plotify.",
    ),
    project_name: Optional[str] = Field(
        default=None,
        description="Nombre del proyecto (búsqueda parcial insensible a mayúsculas, ej: 'N264', 'Teno').",
    ),
) -> str:
    """Retorna la ficha del proyecto en formato JSON."""
    try:
        data = services.get_project(project_id=project_id, project_name=project_name)
        if not data:
            return json.dumps({"status": "not_found", "message": "Proyecto no encontrado."}, ensure_ascii=False)
        return json.dumps({"status": "success", "project": data}, ensure_ascii=False, indent=2)
    except Exception as e:
        return json.dumps({"status": "error", "message": str(e)}, ensure_ascii=False)


@mcp.tool(
    name="plotify_list_lots",
    description="Lista los lotes de un proyecto con filtros de estado ('disponible', 'reservado', 'vendido'), rango de precio y superficie en m².",
    annotations=READ_ONLY_ANNOTATION,
)
def list_lots(
    project_id: str = Field(
        ...,
        description="UUID del proyecto cuyos lotes se desean consultar.",
    ),
    estado: Optional[str] = Field(
        default=None,
        description="Filtrar por estado del lote: 'disponible', 'reservado', o 'vendido'.",
    ),
    min_price: Optional[float] = Field(
        default=None,
        description="Precio mínimo en pesos ($ CLP).",
    ),
    max_price: Optional[float] = Field(
        default=None,
        description="Precio máximo en pesos ($ CLP).",
    ),
    min_m2: Optional[float] = Field(
        default=None,
        description="Superficie mínima en metros cuadrados.",
    ),
    max_m2: Optional[float] = Field(
        default=None,
        description="Superficie máxima en metros cuadrados.",
    ),
    limit: int = Field(
        default=100,
        description="Cantidad máxima de lotes a retornar (default 100).",
        ge=1,
        le=500,
    ),
    offset: int = Field(
        default=0,
        description="Número de registros a omitir para paginación.",
        ge=0,
    ),
) -> str:
    """Retorna el listado de lotes en formato JSON."""
    try:
        data = services.list_lots(
            project_id=project_id,
            estado=estado,
            min_price=min_price,
            max_price=max_price,
            min_m2=min_m2,
            max_m2=max_m2,
            limit=limit,
            offset=offset,
        )
        return json.dumps({"status": "success", **data}, ensure_ascii=False, indent=2)
    except Exception as e:
        return json.dumps({"status": "error", "message": str(e)}, ensure_ascii=False)


@mcp.tool(
    name="plotify_get_lot",
    description="Obtiene la información integral 360° de un lote: medidas, deslindes oficiales estructurados, servidumbres, rol de avalúo SII (pre-rol/definitivo), ficha de cliente/comprador, estado de firma notarial y registro CBR.",
    annotations=READ_ONLY_ANNOTATION,
)
def get_lot(
    lot_id: Optional[str] = Field(
        default=None,
        description="UUID del lote en Plotify.",
    ),
    project_id: Optional[str] = Field(
        default=None,
        description="UUID del proyecto (requerido si se consulta por numero_lote).",
    ),
    numero_lote: Optional[str] = Field(
        default=None,
        description="Número del lote (ej: '1', '17', 'Lote 24').",
    ),
) -> str:
    """Retorna la ficha integral del lote en formato JSON."""
    try:
        data = services.get_lot(lot_id=lot_id, project_id=project_id, numero_lote=numero_lote)
        if not data:
            return json.dumps({"status": "not_found", "message": "Lote no encontrado."}, ensure_ascii=False)
        return json.dumps({"status": "success", "lot": data}, ensure_ascii=False, indent=2)
    except Exception as e:
        return json.dumps({"status": "error", "message": str(e)}, ensure_ascii=False)


@mcp.tool(
    name="plotify_generate_lot_legal_texts",
    description="Ejecuta el Generador de Textos Legales de Plotify para un lote, generando la redacción notarial oficial de la cláusula de Deslindes (con superficie y números en palabras) y la cláusula de Servidumbre de Tránsito.",
    annotations=READ_ONLY_ANNOTATION,
)
def generate_lot_legal_texts(
    lot_id: Optional[str] = Field(
        default=None,
        description="UUID del lote.",
    ),
    project_id: Optional[str] = Field(
        default=None,
        description="UUID del proyecto (requerido si se usa numero_lote).",
    ),
    numero_lote: Optional[str] = Field(
        default=None,
        description="Número del lote (ej: '1', '10', '24').",
    ),
) -> str:
    """Retorna los textos legales generados en formato JSON."""
    try:
        data = services.generate_lot_legal_texts(lot_id=lot_id, project_id=project_id, numero_lote=numero_lote)
        return json.dumps({"status": "success", **data}, ensure_ascii=False, indent=2)
    except Exception as e:
        return json.dumps({"status": "error", "message": str(e)}, ensure_ascii=False)


@mcp.tool(
    name="plotify_get_lot_legal_variables",
    description="Obtiene las variables legales clave de un lote agrupadas para la redacción de contratos (inmueble, deslindes, servidumbre, roles SII, comparecencia de comprador/vendedor, precios y documentos de títulos).",
    annotations=READ_ONLY_ANNOTATION,
)
def get_lot_legal_variables(
    lot_id: Optional[str] = Field(
        default=None,
        description="UUID del lote.",
    ),
    project_id: Optional[str] = Field(
        default=None,
        description="UUID del proyecto (requerido si se usa numero_lote).",
    ),
    numero_lote: Optional[str] = Field(
        default=None,
        description="Número del lote (ej: '1', '10', '24').",
    ),
) -> str:
    """Retorna las variables legales en formato JSON."""
    try:
        data = services.get_lot_legal_variables(lot_id=lot_id, project_id=project_id, numero_lote=numero_lote)
        return json.dumps({"status": "success", "variables": data}, ensure_ascii=False, indent=2)
    except Exception as e:
        return json.dumps({"status": "error", "message": str(e)}, ensure_ascii=False)


@mcp.tool(
    name="plotify_search_lots",
    description="Búsqueda global de lotes por nombre de cliente, RUN/RUT, Rol de avalúo SII o número de lote.",
    annotations=READ_ONLY_ANNOTATION,
)
def search_lots(
    query: str = Field(
        ...,
        description="Término de búsqueda: nombre de cliente, RUT, Rol SII o número de lote.",
    ),
    project_id: Optional[str] = Field(
        default=None,
        description="Limitar la búsqueda a un proyecto específico.",
    ),
    limit: int = Field(
        default=25,
        description="Máximo de resultados.",
        ge=1,
        le=100,
    ),
) -> str:
    """Retorna los lotes coincidentes en formato JSON."""
    try:
        data = services.search_lots(query=query, project_id=project_id, limit=limit)
        return json.dumps({"status": "success", "count": len(data), "results": data}, ensure_ascii=False, indent=2)
    except Exception as e:
        return json.dumps({"status": "error", "message": str(e)}, ensure_ascii=False)


if __name__ == "__main__":
    mcp.run(transport="stdio")
