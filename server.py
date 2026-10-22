"""MCP server that controls Blockbench through the MCP Bridge plugin."""
import json
import urllib.error
import urllib.request
from pathlib import Path
from typing import Literal

from mcp.server.mcpserver import MCPServer
from mcp.server.mcpserver.exceptions import ToolError

BRIDGE_URL = "http://127.0.0.1:47391"
EXPORT_DIR = Path.home() / "Documents" / "blockbench" / "exports"

mcp = MCPServer(
    "blockbench",
    instructions=(
        "Builds models in Blockbench out of cubes. Units are pixels; 16 is one "
        "Minecraft block. Y is up. Cubes and groups can be referred to by name or uuid."
    ),
)


def call_bridge(tool: str, args: dict | None = None):
    """Send one command to the Blockbench bridge plugin and return its result."""
    data = json.dumps({"tool": tool, "args": args or {}}).encode()
    request = urllib.request.Request(BRIDGE_URL, data=data, method="POST")
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            reply = json.loads(response.read())
    except urllib.error.HTTPError as e:
        reply = json.loads(e.read())
    except urllib.error.URLError:
        raise ToolError(
            "Can't reach Blockbench. Is it open with the MCP Bridge plugin loaded?"
        )
    if not reply.get("ok"):
        raise ToolError(reply.get("error", "Unknown bridge error"))
    return reply["result"]


@mcp.tool()
def add_cube(
    name: str = "cube",
    origin: list[float] = [0, 0, 0],
    size: list[float] = [16, 16, 16],
    group: str | None = None,
) -> dict:
    """Add a cube to the Blockbench scene.

    origin is the [x, y, z] corner the cube starts at, and size is its
    [width, height, depth]. group optionally puts the cube inside an existing group.
    """
    to = [o + s for o, s in zip(origin, size)]
    return call_bridge("add_cube", {"name": name, "from": origin, "to": to, "group": group})


@mcp.tool()
def list_cubes() -> list:
    """List every cube in the scene with its uuid, name, from and to corners, and group."""
    return call_bridge("list_cubes")


@mcp.tool()
def list_groups() -> list:
    """List every group with its uuid, name, pivot origin, parent and children."""
    return call_bridge("list_groups")


@mcp.tool()
def move_cube(id: str, origin: list[float], size: list[float] | None = None) -> dict:
    """Move a cube so its starting corner is at origin. Optionally resize it too."""
    return call_bridge("move_cube", {"id": id, "from": origin, "size": size})


@mcp.tool()
def delete_cube(id: str) -> dict:
    """Delete a cube by name or uuid."""
    return call_bridge("delete_cube", {"id": id})


@mcp.tool()
def set_color(id: str, color: str) -> dict:
    """Paint every face of a cube one solid colour, given as a hex string like #ff8800."""
    return call_bridge("set_color", {"id": id, "color": color})


@mcp.tool()
def add_group(
    name: str = "group",
    origin: list[float] = [0, 0, 0],
    children: list[str] = [],
    parent: str | None = None,
) -> dict:
    """Create a group (a folder for parts) and move the named cubes into it.

    origin is the group's pivot point, used later for rotation and animation.
    parent optionally nests the new group inside another group.
    """
    return call_bridge(
        "add_group", {"name": name, "origin": origin, "children": children, "parent": parent}
    )


@mcp.tool()
def export_model(filename: str, format: Literal["bbmodel", "gltf"] = "bbmodel") -> str:
    """Save the current model to Documents/blockbench/exports.

    bbmodel re-opens in Blockbench; gltf imports into Godot, Blender and most engines.
    """
    content = call_bridge("export_model", {"format": format})
    EXPORT_DIR.mkdir(parents=True, exist_ok=True)
    path = EXPORT_DIR / f"{Path(filename).stem}.{format}"
    path.write_text(content, encoding="utf-8")
    return f"Saved {path}"


if __name__ == "__main__":
    mcp.run()
