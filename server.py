#!/usr/bin/env python3
"""A股分析 H5 - 本地静态服务器 + API代理"""
import http.server
import urllib.request
import urllib.parse
import os
import sys

PORT = 8080
DIRECTORY = os.path.dirname(os.path.abspath(__file__))

class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DIRECTORY, **kwargs)

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)

        # API 代理: /proxy?url=<encoded_url>
        if parsed.path == '/proxy':
            return self.handle_proxy(parsed)

        # 正常静态文件
        return super().do_GET()

    def handle_proxy(self, parsed):
        qs = urllib.parse.parse_qs(parsed.query)
        target_url = qs.get('url', [None])[0]
        if not target_url:
            self.send_error(400, 'Missing url parameter')
            return

        # 安全限制: 只允许已知的数据源域名
        allowed_domains = [
            'money.finance.sina.com.cn',
            'qt.gtimg.cn',
            'smartbox.gtimg.cn',
            'web.ifzq.gtimg.cn',
            'data.gtimg.cn',
        ]
        try:
            parsed_target = urllib.parse.urlparse(target_url)
            host = (parsed_target.hostname or '').lower()
            if not any(host == d or host.endswith('.' + d) for d in allowed_domains):
                self.send_error(403, 'Domain not allowed: ' + host)
                return
        except Exception:
            self.send_error(400, 'Invalid URL')
            return

        try:
            req = urllib.request.Request(target_url, headers={
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Referer': 'https://finance.qq.com',
            })
            with urllib.request.urlopen(req, timeout=12) as resp:
                body = resp.read()
                content_type = resp.headers.get('Content-Type', 'application/json; charset=utf-8')
                # 腾讯API返回GBK编码, 转成UTF-8
                if 'gbk' in content_type.lower() or 'gb2312' in content_type.lower():
                    body = body.decode('gbk', errors='replace').encode('utf-8')
                    content_type = 'application/json; charset=utf-8'
                self.send_response(200)
                self.send_header('Content-Type', content_type)
                self.send_header('Access-Control-Allow-Origin', '*')
                self.send_header('Cache-Control', 'no-cache')
                self.end_headers()
                self.wfile.write(body)
        except urllib.error.HTTPError as e:
            self.send_error(e.code, e.reason)
        except Exception as e:
            self.send_error(502, 'Proxy error: ' + str(e))

    def end_headers(self):
        # 允许跨域 (虽然本地用不到, 但以防万一)
        self.send_header('Access-Control-Allow-Origin', '*')
        super().end_headers()

if __name__ == '__main__':
    print('========================================')
    print('  A股分析 H5 应用 - 本地服务器 (含代理)')
    print('========================================')
    print(f'  目录: {DIRECTORY}')
    print(f'  地址: http://localhost:{PORT}')
    print(f'  代理: http://localhost:{PORT}/proxy?url=<api_url>')
    print('========================================')
    print()

    try:
        server = http.server.HTTPServer(('0.0.0.0', PORT), Handler)
        print(f'  服务已启动, 浏览器打开 http://localhost:{PORT}')
        server.serve_forever()
    except KeyboardInterrupt:
        print('\n  服务已停止')
    except OSError as e:
        if 'address already in use' in str(e).lower():
            print(f'  端口 {PORT} 被占用, 请先关闭占用进程或修改端口')
        else:
            print(f'  启动失败: {e}')
        sys.exit(1)
