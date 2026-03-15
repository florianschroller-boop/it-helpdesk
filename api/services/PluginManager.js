/**
 * ============================================
 * Plugin Manager
 * ============================================
 *
 * Plugins leben in /plugins/<plugin-name>/
 * Jedes Plugin braucht:
 *   - plugin.json  (Manifest: name, version, description, author, entryPoint)
 *   - index.js     (Entry: exportiert activate(ctx), deactivate())
 *
 * Plugin-Kontext (ctx):
 *   ctx.registerRoute(method, path, ...handlers)  — Express-Route hinzufügen
 *   ctx.registerSidebarItem(item)                 — Frontend-Sidebar-Eintrag
 *   ctx.registerDashboardWidget(widget)           — Dashboard-Widget
 *   ctx.registerSettingsTab(tab)                   — Settings-Tab
 *   ctx.registerHook(event, handler)              — Event-Hook (ticket.created, etc.)
 *   ctx.db                                         — Datenbank { query, queryOne, insert }
 *   ctx.app                                        — Express App
 *   ctx.pluginDir                                  — Absoluter Pfad zum Plugin-Ordner
 */

const fs = require('fs');
const path = require('path');
const { query, queryOne, insert } = require('../config/database');

class PluginManager {
  constructor() {
    this.plugins = new Map();       // name -> { manifest, instance, active }
    this.sidebarItems = [];
    this.dashboardWidgets = [];
    this.settingsTabs = [];
    this.hooks = new Map();         // event -> [handler, ...]
    this.frontendAssets = [];       // { pluginName, js: [], css: [] }
    this.pluginsDir = path.join(__dirname, '..', '..', 'plugins');
  }

  // Discover and load all plugins
  async loadAll(app) {
    if (!fs.existsSync(this.pluginsDir)) {
      fs.mkdirSync(this.pluginsDir, { recursive: true });
      return;
    }

    const dirs = fs.readdirSync(this.pluginsDir, { withFileTypes: true })
      .filter(d => d.isDirectory())
      .map(d => d.name);

    // Load plugin states from DB
    const states = {};
    try {
      const rows = await query("SELECT key_name, value FROM settings WHERE key_name LIKE 'plugin_%_enabled'");
      for (const r of rows) {
        const name = r.key_name.replace('plugin_', '').replace('_enabled', '');
        states[name] = r.value === 'true' || r.value === '1';
      }
    } catch {}

    for (const dir of dirs) {
      try {
        await this.loadPlugin(dir, app, states[dir] !== false);
      } catch (err) {
        console.error(`[PLUGIN] Error loading ${dir}:`, err.message);
      }
    }

    // Copy plugin frontend assets to public/plugins/ so express.static can serve them
    this.syncFrontendAssets();

    // Register plugin API routes
    this.registerApiRoutes(app);

    console.log(`[PLUGIN] ${this.plugins.size} Plugin(s) geladen`);
  }

  async loadPlugin(dirName, app, enabled = true) {
    const pluginDir = path.join(this.pluginsDir, dirName);
    const manifestPath = path.join(pluginDir, 'plugin.json');

    if (!fs.existsSync(manifestPath)) return;

    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    manifest._dirName = dirName;

    const entryFile = path.join(pluginDir, manifest.entryPoint || 'index.js');
    if (!fs.existsSync(entryFile)) {
      console.warn(`[PLUGIN] ${manifest.name}: Entry point not found`);
      return;
    }

    const pluginModule = require(entryFile);

    this.plugins.set(dirName, {
      manifest,
      module: pluginModule,
      active: enabled,
      dir: pluginDir
    });

    if (enabled) {
      await this.activatePlugin(dirName, app);
    }

    console.log(`[PLUGIN] ${manifest.name} v${manifest.version} ${enabled ? '(aktiv)' : '(inaktiv)'}`);
  }

  async activatePlugin(name, app) {
    const plugin = this.plugins.get(name);
    if (!plugin || !plugin.module.activate) return;

    const ctx = this.createContext(name, plugin, app);

    try {
      await plugin.module.activate(ctx);
      plugin.active = true;
    } catch (err) {
      console.error(`[PLUGIN] ${name} activation error:`, err.message);
      plugin.active = false;
    }
  }

  async deactivatePlugin(name) {
    const plugin = this.plugins.get(name);
    if (!plugin) return;

    if (plugin.module.deactivate) {
      try {
        await plugin.module.deactivate();
      } catch {}
    }

    plugin.active = false;

    // Remove registered items for this plugin
    this.sidebarItems = this.sidebarItems.filter(i => i._plugin !== name);
    this.dashboardWidgets = this.dashboardWidgets.filter(w => w._plugin !== name);
    this.settingsTabs = this.settingsTabs.filter(t => t._plugin !== name);
    this.frontendAssets = this.frontendAssets.filter(a => a.pluginName !== name);

    // Remove hooks
    for (const [event, handlers] of this.hooks) {
      this.hooks.set(event, handlers.filter(h => h._plugin !== name));
    }
  }

  // Create isolated context for a plugin
  createContext(name, plugin, app) {
    const self = this;
    const pluginDir = plugin.dir;
    const express = require('express');

    // Each plugin gets its own Router mounted at /api/plugins/<name>
    if (!plugin._router) {
      plugin._router = express.Router();
      app.use(`/api/plugins/${name}`, plugin._router);
    }

    return {
      pluginName: name,
      pluginDir,
      db: { query, queryOne, insert },
      app,

      // Register an API route on the plugin's sub-router
      registerRoute(method, routePath, ...handlers) {
        plugin._router[method.toLowerCase()](routePath, ...handlers);
        console.log(`  [PLUGIN:${name}] Route: ${method.toUpperCase()} /api/plugins/${name}${routePath}`);
      },

      // Register a sidebar item
      registerSidebarItem(item) {
        self.sidebarItems.push({ ...item, _plugin: name });
      },

      // Register a dashboard widget
      registerDashboardWidget(widget) {
        self.dashboardWidgets.push({ ...widget, _plugin: name });
      },

      // Register a settings tab
      registerSettingsTab(tab) {
        self.settingsTabs.push({ ...tab, _plugin: name });
      },

      // Register an event hook
      registerHook(event, handler) {
        if (!self.hooks.has(event)) self.hooks.set(event, []);
        handler._plugin = name;
        self.hooks.get(event).push(handler);
      },

      // Register frontend assets (JS/CSS files served from plugin dir)
      registerFrontendAsset(type, filename) {
        let entry = self.frontendAssets.find(a => a.pluginName === name);
        if (!entry) {
          entry = { pluginName: name, js: [], css: [] };
          self.frontendAssets.push(entry);
        }
        if (type === 'js') entry.js.push(filename);
        if (type === 'css') entry.css.push(filename);
      },

      // Store plugin-specific settings
      async setSetting(key, value) {
        const k = `plugin_${name}_${key}`;
        const v = typeof value === 'object' ? JSON.stringify(value) : String(value);
        await insert('INSERT INTO settings (key_name, value) VALUES (?, ?) ON DUPLICATE KEY UPDATE value = ?', [k, v, v]);
      },

      async getSetting(key, defaultValue = null) {
        const k = `plugin_${name}_${key}`;
        const row = await queryOne('SELECT value FROM settings WHERE key_name = ?', [k]);
        if (!row) return defaultValue;
        try { return JSON.parse(row.value); } catch { return row.value; }
      }
    };
  }

  // Sync plugin frontend files to public/plugins/ for static serving
  syncFrontendAssets() {
    const publicPlugins = path.join(__dirname, '..', '..', 'public', 'plugins');

    // Clean and recreate
    if (fs.existsSync(publicPlugins)) {
      fs.rmSync(publicPlugins, { recursive: true });
    }
    fs.mkdirSync(publicPlugins, { recursive: true });

    for (const [name, plugin] of this.plugins) {
      if (!plugin.active) continue;

      const srcDir = plugin.dir;
      const destDir = path.join(publicPlugins, name);
      fs.mkdirSync(destDir, { recursive: true });

      // Copy JS, CSS, and image files
      const files = fs.readdirSync(srcDir);
      for (const file of files) {
        const ext = path.extname(file).toLowerCase();
        if (['.js', '.css', '.html', '.png', '.jpg', '.svg', '.gif', '.ico', '.webp'].includes(ext)) {
          fs.copyFileSync(path.join(srcDir, file), path.join(destDir, file));
        }
      }
    }

    console.log(`[PLUGIN] Frontend-Assets synchronisiert → public/plugins/`);
  }

  // Fire an event hook
  async fireHook(event, data) {
    const handlers = this.hooks.get(event) || [];
    const results = [];
    for (const handler of handlers) {
      try {
        const result = await handler(data);
        results.push(result);
      } catch (err) {
        console.error(`[PLUGIN] Hook ${event} error:`, err.message);
      }
    }
    return results;
  }

  // API routes for plugin management
  registerApiRoutes(app) {
    const { authenticate, requireRole } = require('../middleware/auth');
    const express = require('express');
    const multer = require('multer');
    const upload = multer({ dest: path.join(this.pluginsDir, '.tmp') });
    const mgmtRouter = express.Router();

    // GET /api/plugins — list all plugins (admin)
    mgmtRouter.get('/', authenticate, requireRole('admin'), async (req, res) => {
      const list = [];
      for (const [name, plugin] of this.plugins) {
        // Load visibility setting
        const visSetting = await queryOne("SELECT value FROM settings WHERE key_name = ?", [`plugin_${name}_visibility`]);
        const visibility = visSetting ? JSON.parse(visSetting.value) : { user: true, agent: true, admin: true };

        list.push({
          name,
          ...plugin.manifest,
          active: plugin.active,
          visibility,
          dir: undefined, module: undefined
        });
      }
      res.json({ success: true, data: list });
    });

    // POST /api/plugins/:name/visibility — set who can see the plugin
    mgmtRouter.post('/:name/visibility', authenticate, requireRole('admin'), async (req, res) => {
      const name = req.params.name;
      const { user, agent, admin } = req.body;
      const visibility = {
        user: user !== false,
        agent: agent !== false,
        admin: admin !== undefined ? admin : true
      };
      const key = `plugin_${name}_visibility`;
      const val = JSON.stringify(visibility);
      await insert("INSERT INTO settings (key_name, value) VALUES (?, ?) ON DUPLICATE KEY UPDATE value = ?", [key, val, val]);
      res.json({ success: true, message: 'Sichtbarkeit aktualisiert' });
    });

    // GET /api/plugins/frontend — returns assets filtered by user role
    mgmtRouter.get('/frontend', authenticate, async (req, res) => {
      const userRole = req.user?.role || 'user';

      // Load visibility settings for all plugins
      const visRows = await query("SELECT key_name, value FROM settings WHERE key_name LIKE 'plugin_%_visibility'");
      const visMap = {};
      for (const r of visRows) {
        const pluginName = r.key_name.replace('plugin_', '').replace('_visibility', '');
        try { visMap[pluginName] = JSON.parse(r.value); } catch { visMap[pluginName] = { user: true, agent: true, admin: true }; }
      }

      const isVisible = (pluginName) => {
        const vis = visMap[pluginName] || { user: true, agent: true, admin: true };
        return vis[userRole] !== false;
      };

      // Sidebar: filtered by visibility (hide nav items for users)
      const sidebar = this.sidebarItems.filter(i => {
        const p = this.plugins.get(i._plugin);
        return p && p.active && isVisible(i._plugin);
      });

      // Widgets + JS/CSS Assets: ALWAYS load for active plugins
      // (plugins may provide features accessible via other routes, not just sidebar)
      const widgets = this.dashboardWidgets.filter(w => {
        const p = this.plugins.get(w._plugin);
        return p && p.active;
      });
      const assets = this.frontendAssets.filter(a => {
        const p = this.plugins.get(a.pluginName);
        return p && p.active;
      });

      res.json({ success: true, data: { sidebarItems: sidebar, dashboardWidgets: widgets, assets } });
    });

    // POST /api/plugins/:name/enable
    mgmtRouter.post('/:name/enable', authenticate, requireRole('admin'), async (req, res) => {
      const name = req.params.name;
      const plugin = this.plugins.get(name);
      if (!plugin) return res.status(404).json({ success: false, error: 'Plugin nicht gefunden' });

      await this.activatePlugin(name, app);
      await insert("INSERT INTO settings (key_name, value) VALUES (?, 'true') ON DUPLICATE KEY UPDATE value = 'true'",
        [`plugin_${name}_enabled`]);

      res.json({ success: true, message: `${plugin.manifest.name} aktiviert` });
    });

    // POST /api/plugins/:name/disable
    mgmtRouter.post('/:name/disable', authenticate, requireRole('admin'), async (req, res) => {
      const name = req.params.name;
      const plugin = this.plugins.get(name);
      if (!plugin) return res.status(404).json({ success: false, error: 'Plugin nicht gefunden' });

      await this.deactivatePlugin(name);
      await insert("INSERT INTO settings (key_name, value) VALUES (?, 'false') ON DUPLICATE KEY UPDATE value = 'false'",
        [`plugin_${name}_enabled`]);

      res.json({ success: true, message: `${plugin.manifest.name} deaktiviert (Server-Neustart empfohlen)` });
    });

    // POST /api/plugins/install — upload ZIP plugin
    mgmtRouter.post('/install', authenticate, requireRole('admin'), upload.single('file'), async (req, res) => {
      if (!req.file) return res.status(400).json({ success: false, error: 'Keine Datei' });

      try {
        const AdmZip = require('adm-zip');
        const zip = new AdmZip(req.file.path);
        const entries = zip.getEntries();

        // Find plugin.json to determine plugin name
        const manifestEntry = entries.find(e => e.entryName.endsWith('plugin.json') && e.entryName.split('/').length <= 2);
        if (!manifestEntry) {
          fs.unlinkSync(req.file.path);
          return res.status(400).json({ success: false, error: 'Kein plugin.json gefunden' });
        }

        const manifest = JSON.parse(manifestEntry.getData().toString('utf8'));
        const pluginName = manifest.id || manifestEntry.entryName.split('/')[0] || manifest.name.toLowerCase().replace(/\s+/g, '-');

        // Extract to plugins dir
        const targetDir = path.join(this.pluginsDir, pluginName);
        if (fs.existsSync(targetDir)) {
          fs.rmSync(targetDir, { recursive: true });
        }

        zip.extractAllTo(this.pluginsDir, true);
        fs.unlinkSync(req.file.path);

        // Load the plugin
        await this.loadPlugin(pluginName, app, true);
        await insert("INSERT INTO settings (key_name, value) VALUES (?, 'true') ON DUPLICATE KEY UPDATE value = 'true'",
          [`plugin_${pluginName}_enabled`]);

        res.json({ success: true, message: `Plugin "${manifest.name}" installiert. Server-Neustart empfohlen.` });
      } catch (err) {
        if (req.file?.path) fs.unlinkSync(req.file.path);
        res.status(500).json({ success: false, error: err.message });
      }
    });

    // DELETE /api/plugins/:name — uninstall
    mgmtRouter.delete('/:name', authenticate, requireRole('admin'), async (req, res) => {
      const name = req.params.name;
      const plugin = this.plugins.get(name);
      if (!plugin) return res.status(404).json({ success: false, error: 'Plugin nicht gefunden' });

      await this.deactivatePlugin(name);
      this.plugins.delete(name);

      const pluginDir = path.join(this.pluginsDir, name);
      if (fs.existsSync(pluginDir)) {
        fs.rmSync(pluginDir, { recursive: true });
      }

      // Clean settings
      await insert("DELETE FROM settings WHERE key_name LIKE ?", [`plugin_${name}_%`]);

      res.json({ success: true, message: 'Plugin deinstalliert' });
    });

    // Mount management router
    app.use('/api/plugins', mgmtRouter);

    // Plugin static files are served via express.static in index.js (must be before SPA fallback)
  }
}

module.exports = new PluginManager();
