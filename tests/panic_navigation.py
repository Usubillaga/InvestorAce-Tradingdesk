"""Smoke-test the packaged desk in real Chrome at phone and desktop widths."""
import functools
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
import shutil
import subprocess
import sys
import tempfile
import threading
from urllib.parse import urlsplit

# Only this loopback test harness uses a frame, to exercise both viewport sizes.
HARNESS = """<!doctype html><meta charset="utf-8"><style>*{margin:0}iframe{height:800px;border:0}</style>
<iframe title="TradingDesk"></iframe><output id="result">waiting</output><script>
const frame=document.querySelector('iframe'), result=document.querySelector('output');
frame.width=new URLSearchParams(location.search).get('width');
frame.src='/index.html?lang=es#overview';
const sleep=()=>new Promise(resolve=>setTimeout(resolve,30));
async function until(check){for(let i=0;i<180;i++){if(check())return;await sleep()}throw Error('Timed out: '+check)}
frame.onload=async()=>{
  try{
    const w=frame.contentWindow, d=w.document, item=()=>d.querySelector('#nav [href="#panic-paper"]');
    await until(()=>item());
    const rect=item().getBoundingClientRect();
    if(!(rect.width && rect.left>=0 && rect.right<=w.innerWidth))throw Error('Panic navigation is off screen');
    if(d.querySelector('.workspace > a'))throw Error('Loose link inside the workspace');
    item().click();
    await until(()=>item().getAttribute('aria-current')==='page' && d.querySelectorAll('#main .pp-books article').length===3);
    if(w.location.pathname!=='/index.html' || w.location.hash!=='#panic-paper')throw Error('Left the desk');
    d.querySelector('#main a[href="#panic-paper/original"]').click();
    await until(()=>d.querySelector('#panic-paper-original')?.open);
    if(!d.querySelector('#panic-paper-original dl'))
      throw Error('Missing journal');
    d.querySelector('#nav a[href="#overview"]').click();
    await until(()=>!d.querySelector('#main .desk-panic'));
    w.history.back();
    await until(()=>d.querySelector('#panic-paper-original')?.open && item().getAttribute('aria-current')==='page');
    result.textContent='PASS';
  }catch(e){result.textContent=String(e)}
};
</script>"""


class Handler(SimpleHTTPRequestHandler):
    def do_GET(self):
        if urlsplit(self.path).path != '/check':
            return super().do_GET()
        body = HARNESS.encode()
        self.send_response(200)
        self.send_header('Content-Type', 'text/html; charset=utf-8')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *_):
        pass


def main(directory):
    chrome = shutil.which('google-chrome') or shutil.which('chromium')
    if not chrome:
        raise RuntimeError('Chrome is required for the TradingDesk navigation smoke test')
    with ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(Handler, directory=directory)) as server:
        threading.Thread(target=server.serve_forever, daemon=True).start()
        for width in (390, 1280):
            with tempfile.TemporaryDirectory() as profile:
                run = subprocess.run([chrome, '--headless', '--disable-gpu', '--no-sandbox', '--no-proxy-server',
                                      '--host-resolver-rules=MAP * ~NOTFOUND', '--window-size=1440,1000',
                                      '--user-data-dir='+profile, '--virtual-time-budget=18000', '--dump-dom',
                                      f'http://127.0.0.1:{server.server_port}/check?width={width}'],
                                     capture_output=True, text=True, timeout=60, check=True)
            if '<output id="result">PASS</output>' not in run.stdout:
                status = run.stdout.partition('<output id="result">')[2].partition('</output>')[0]
                raise AssertionError(f'Navigation at {width}px: {status or run.stderr[-250:]}')
            print(f'PASS: TradingDesk navigation, positions and browser Back at {width}px')
        server.shutdown()


if __name__ == '__main__':
    main(sys.argv[1])
