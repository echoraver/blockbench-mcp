# Blockbench MCP

An [MCP](https://modelcontextprotocol.io) server that lets Claude (or any MCP client) build models in [Blockbench](https://www.blockbench.net) out of cubes. The end goal is to have Claude build a whole Minecraft-style scene in Blockbench.

It has two parts:

- **`mcp_bridge.js`**: a Blockbench plugin that runs a small HTTP server on `127.0.0.1:47391` inside the Blockbench desktop app and applies commands to the open project.
- **`server.py`**: a Python MCP server that exposes tools to the client and forwards each call to the bridge.

```
Claude  <-- MCP (stdio) -->  server.py  <-- HTTP 127.0.0.1:47391 -->  mcp_bridge.js (in Blockbench)
```

## Tools

| Tool | What it does |
| --- | --- |
| `add_cube` | Add a cube from an `origin` corner and a `size`, optionally inside a group |
| `list_cubes` | List every cube with its uuid, name, corners and group |
| `list_groups` | List every group with its pivot, parent and children |
| `move_cube` | Move a cube to a new origin, optionally resizing it |
| `delete_cube` | Delete a cube by name or uuid |
| `set_color` | Paint a cube one solid hex colour |
| `add_group` | Create a group and move cubes into it |
| `export_model` | Save the model as `.bbmodel` or `.gltf` to `~/Documents/blockbench/exports` |

Units are pixels, so 16 is one Minecraft block, and Y is up.

## Setup

### 1. Install the Blockbench plugin

1. Open the Blockbench **desktop** app (the web version can't open network sockets).
2. Go to **File > Plugins**, then click **Load Plugin from File** and choose `mcp_bridge.js`.
3. Allow the network permission prompt. You should see "Bridge listening on 127.0.0.1:47391".

### 2. Install the Python server

Requires Python 3.10 or newer.

```
pip install -r requirements.txt
```

### 3. Add it to Claude Desktop

Add a `blockbench` entry to your `claude_desktop_config.json` (see `claude_desktop_config.example.json`), with the path pointing at your copy of `server.py`:

```json
{
  "mcpServers": {
    "blockbench": {
      "command": "python",
      "args": ["C:\\path\\to\\blockbench-mcp\\server.py"]
    }
  }
}
```

Restart Claude Desktop, open a project in Blockbench, and ask Claude to build something.

## Troubleshooting

- **"Can't reach Blockbench"**: Blockbench isn't open, or the plugin isn't loaded. Check **File > Plugins**.
- **Bridge error: EADDRINUSE**: something else is using port 47391, often a second Blockbench window. Close it and reload the plugin.
