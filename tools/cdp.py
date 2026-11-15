# Minimal Chrome DevTools client for the WebView (no third-party packages).
import socket,json,base64,os,struct,sys,urllib.request,subprocess,re
ADB=os.path.expanduser('~/Library/Android/sdk/platform-tools/adb')
def sh(*a): return subprocess.run([ADB,*a],capture_output=True,text=True).stdout
def connect():
    pid=sh('shell','pidof','app.reader.proto').strip().split()[0]
    sh('forward','tcp:9333','localabstract:webview_devtools_remote_'+pid)
    tabs=json.load(urllib.request.urlopen('http://127.0.0.1:9333/json',timeout=5))
    path=re.sub(r'^ws://[^/]+','',tabs[0]['webSocketDebuggerUrl'])
    s=socket.create_connection(('127.0.0.1',9333),timeout=30)
    key=base64.b64encode(os.urandom(16)).decode()
    s.sendall((f'GET {path} HTTP/1.1\r\nHost: 127.0.0.1:9333\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: {key}\r\nSec-WebSocket-Version: 13\r\n\r\n').encode())
    buf=b''
    while b'\r\n\r\n' not in buf: buf+=s.recv(4096)
    return s
def send(s,obj):
    d=json.dumps(obj).encode(); m=os.urandom(4); h=bytearray([0x81])
    n=len(d)
    if n<126: h.append(0x80|n)
    elif n<65536: h.append(0x80|126); h+=struct.pack('>H',n)
    else: h.append(0x80|127); h+=struct.pack('>Q',n)
    s.sendall(bytes(h)+m+bytes(b^m[i%4] for i,b in enumerate(d)))
def rd(s,n):
    b=b''
    while len(b)<n:
        c=s.recv(n-len(b))
        if not c: raise EOFError
        b+=c
    return b
def recv(s):
    out=b''
    while True:
        h=rd(s,2); fin=h[0]&0x80; n=h[1]&0x7f
        if n==126: n=struct.unpack('>H',rd(s,2))[0]
        elif n==127: n=struct.unpack('>Q',rd(s,8))[0]
        out+=rd(s,n)
        if fin: return json.loads(out.decode('utf-8','replace'))
_id=0
def ev(s,expr,await_=True):
    global _id; _id+=1
    send(s,{'id':_id,'method':'Runtime.evaluate','params':{'expression':expr,'awaitPromise':await_,'returnByValue':True}})
    while True:
        m=recv(s)
        if m.get('id')==_id:
            r=m.get('result',{})
            if 'exceptionDetails' in r: return 'EXC '+json.dumps(r['exceptionDetails'])[:300]
            return r.get('result',{}).get('value')
def gfx(sec):
    sh('shell','dumpsys','gfxinfo','app.reader.proto','reset'); import time; time.sleep(sec)
    o=sh('shell','dumpsys','gfxinfo','app.reader.proto')
    g=lambda k:(re.search(k+r': (\d+)',o) or [0,'?'])[1]
    return f"frames {g('Total frames rendered')} p50 {g('50th percentile')}ms p90 {g('90th percentile')}ms p99 {g('99th percentile')}ms"
if __name__=='__main__':
    s=connect(); print(ev(s,sys.argv[1]))
