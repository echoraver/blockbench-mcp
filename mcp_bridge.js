let server = null;

Plugin.register('mcp_bridge', {
  title: 'MCP Bridge',
  author: 'Echo',
  description: 'Local HTTP bridge for an MCP server',
  icon: 'cable',
  version: '0.1.0',
  variant: 'desktop',
  onload() {
    // Blockbench only lets plugins use 'net' (not 'http'), so we speak a tiny bit of HTTP over raw TCP.
    const options = { message: 'Runs a local server on 127.0.0.1:47391 so an MCP server can control Blockbench.' };
    const net = typeof requireNativeModule === 'function'
      ? requireNativeModule('net', options)
      : require('net', options);
    if (!net) {
      Blockbench.showQuickMessage('Bridge: network permission denied');
      return;
    }

    // Find a cube or group by uuid first, then by name.
    function findNode(id, list) {
      const node = list.find(n => n.uuid === id) || list.find(n => n.name === id);
      if (!node) throw new Error('Nothing named or with uuid "' + id + '"');
      return node;
    }
    const findCube = id => findNode(id, Cube.all);
    const findGroup = id => findNode(id, Group.all);

    function describeCube(c) {
      const parent = c.parent instanceof Group ? c.parent.name : null;
      return { uuid: c.uuid, name: c.name, from: c.from, to: c.to, group: parent };
    }

    // One 16x16 texture per colour, reused across cubes.
    function solidTexture(hex) {
      const name = 'color_' + hex.replace('#', '').toLowerCase();
      const existing = Texture.all.find(t => t.name === name);
      if (existing) return existing;
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = 16;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = hex;
      ctx.fillRect(0, 0, 16, 16);
      return new Texture({ name, mode: 'bitmap', keep_size: true }).fromDataURL(canvas.toDataURL()).add(false);
    }

    const tools = {
      add_cube({ name = 'cube', from = [0, 0, 0], to = [16, 16, 16], group = null }) {
        Undo.initEdit({ elements: [], outliner: true });
        const cube = new Cube({ name, from, to }).init();
        if (group) cube.addTo(findGroup(group));
        Undo.finishEdit('MCP add cube', { elements: [cube], outliner: true });
        Canvas.updateAll();
        return describeCube(cube);
      },
      list_cubes() {
        return Cube.all.map(describeCube);
      },
      list_groups() {
        return Group.all.map(g => ({
          uuid: g.uuid,
          name: g.name,
          origin: g.origin,
          parent: g.parent instanceof Group ? g.parent.name : null,
          children: g.children.map(c => c.name)
        }));
      },
      move_cube({ id, from, size }) {
        const cube = findCube(id);
        size = size || cube.to.map((t, i) => t - cube.from[i]);
        Undo.initEdit({ elements: [cube] });
        cube.from = from.slice();
        cube.to = from.map((f, i) => f + size[i]);
        Undo.finishEdit('MCP move cube');
        Canvas.updateAll();
        return describeCube(cube);
      },
      delete_cube({ id }) {
        const cube = findCube(id);
        const result = describeCube(cube);
        Undo.initEdit({ elements: [cube], outliner: true });
        cube.remove();
        Undo.finishEdit('MCP delete cube', { elements: [], outliner: true });
        Canvas.updateAll();
        return result;
      },
      set_color({ id, color }) {
        if (!/^#[0-9a-fA-F]{6}$/.test(color)) throw new Error('color must look like #ff8800');
        const cube = findCube(id);
        Undo.initEdit({ elements: [cube], textures: [] });
        const texture = solidTexture(color);
        cube.applyTexture(texture, true);
        Undo.finishEdit('MCP set color', { elements: [cube], textures: [texture] });
        Canvas.updateAll();
        return { uuid: cube.uuid, name: cube.name, texture: texture.name };
      },
      add_group({ name = 'group', origin = [0, 0, 0], children = [], parent = null }) {
        Undo.initEdit({ elements: [], outliner: true });
        const group = new Group({ name, origin }).init();
        if (parent) group.addTo(findGroup(parent));
        for (const id of children) findCube(id).addTo(group);
        Undo.finishEdit('MCP add group', { outliner: true });
        Canvas.updateAll();
        return { uuid: group.uuid, name: group.name, children: group.children.map(c => c.name) };
      },
      async export_model({ format = 'bbmodel' }) {
        if (format === 'bbmodel') return Codecs.project.compile();
        if (format === 'gltf') return await Codecs.gltf.compile({ encoding: 'ascii', embed_textures: true });
        throw new Error('format must be "bbmodel" or "gltf"');
      }
    };

    async function handle(body) {
      try {
        const { tool, args } = JSON.parse(body || '{}');
        if (!tools[tool]) throw new Error('Unknown tool: ' + tool);
        return [200, { ok: true, result: await tools[tool](args || {}) }];
      } catch (e) {
        return [500, { ok: false, error: String(e) }];
      }
    }

    server = net.createServer(socket => {
      let buf = '';
      let handled = false;
      socket.on('data', async chunk => {
        buf += chunk.toString('utf8');
        const headerEnd = buf.indexOf('\r\n\r\n');
        if (handled || headerEnd === -1) return;
        const match = buf.slice(0, headerEnd).match(/content-length:\s*(\d+)/i);
        const length = match ? parseInt(match[1]) : 0;
        const body = buf.slice(headerEnd + 4);
        if (new TextEncoder().encode(body).length < length) return;
        handled = true;
        const [status, payload] = await handle(body);
        const json = JSON.stringify(payload);
        socket.end(
          `HTTP/1.1 ${status} ${status === 200 ? 'OK' : 'Error'}\r\n` +
          'Content-Type: application/json\r\n' +
          `Content-Length: ${new TextEncoder().encode(json).length}\r\n` +
          'Connection: close\r\n\r\n' + json
        );
      });
      socket.on('error', () => {});
    });
    server.on('error', e => {
      console.error('[MCP Bridge] server error:', e);
      Blockbench.showQuickMessage('Bridge error: ' + e.code);
    });
    server.listen(47391, '127.0.0.1', () => {
      console.log('[MCP Bridge] listening on 127.0.0.1:47391');
      Blockbench.showQuickMessage('Bridge listening on 127.0.0.1:47391');
    });
  },
  onunload() {
    if (server) { server.close(); server = null; }
  }
});
