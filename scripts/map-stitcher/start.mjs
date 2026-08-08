// 地图拼接编辑器 · 本地服务器
// 用法：node scripts/map-stitcher/start.mjs [端口]
// 默认端口 8917；打开 http://127.0.0.1:8917/
//
// 提供三条资源路径（均做了路径穿越防护）：
//   /                    -> scripts/map-stitcher/index.html
//   /assets/maps/*       -> src/assets/maps/*（编辑器“加载项目默认底图”用）
//   /downloads/*         -> D:/浏览器下载/*（新地图文件通常在这里）
//   新图目录可用环境变量 MAP_DOWNLOADS_DIR 覆盖。
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '..', '..');
const MAPS_DIR = path.join(PROJECT_ROOT, 'src', 'assets', 'maps');
const DOWNLOADS_DIR = process.env.MAP_DOWNLOADS_DIR || 'D:/浏览器下载';
const PORT = Number(process.argv[2]) || 8917;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.json': 'application/json; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
};

function safeJoin(root, rel) {
  root = path.resolve(root); // 统一分隔符后再比较，否则 Windows 下 startsWith 误判
  const target = path.resolve(root, rel);
  if (target !== root && !target.startsWith(root + path.sep)) {
    throw new Error('path traversal denied');
  }
  return target;
}

const server = http.createServer((req, res) => {
  let url;
  try {
    url = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  } catch {
    res.writeHead(400); res.end('bad request'); return;
  }
  if (url === '/' || url === '/index.html') {
    serveFile(path.join(__dirname, 'index.html'), res);
    return;
  }
  const routes = [
    { prefix: '/assets/maps/', root: MAPS_DIR },
    { prefix: '/downloads/', root: DOWNLOADS_DIR },
  ];
  for (const r of routes) {
    if (url.startsWith(r.prefix)) {
      const rel = url.slice(r.prefix.length);
      try {
        serveFile(safeJoin(r.root, rel), res);
      } catch {
        res.writeHead(403); res.end('forbidden'); return;
      }
      return;
    }
  }
  res.writeHead(404); res.end('not found');
});

function serveFile(file, res) {
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) {
      res.writeHead(404); res.end('not found: ' + path.basename(file));
      return;
    }
    const ext = path.extname(file).toLowerCase();
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Content-Length': st.size,
      'Cache-Control': 'no-cache',
    });
    fs.createReadStream(file).pipe(res);
  });
}

server.listen(PORT, '127.0.0.1', () => {
  console.log('地图拼接编辑器已启动:');
  console.log('  http://127.0.0.1:' + PORT + '/');
  console.log('  底图目录: ' + MAPS_DIR);
  console.log('  新图目录: ' + DOWNLOADS_DIR);
  console.log('按 Ctrl+C 停止。');
});
