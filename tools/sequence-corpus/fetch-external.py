"""Fetch externally hosted free sequences (Drive/Dropbox/...), keep only .xsq/.xml, gzip, drop the archive.
usage: python3 -I tools/sequence-corpus/fetch-external.py ext_urls.tsv tools/sequence-corpus/.corpus/raw
(tsv lines: id<TAB>url, the url being where xlightsseq.com/sequences/<slug>.<id>/download redirects)
"""
import gzip, json, os, re, shutil, subprocess, sys, tempfile, zipfile

KEEP = re.compile(r'\.(xsq|xml|xtiming|xmodel|xpreset|lms|las|pgo)$', re.I)
MAX = 1_500_000_000


def direct(url):
    if 'google.com' in url:
        m = re.search(r'/file/d/([\w-]+)', url) or re.search(r'[?&]id=([\w-]+)', url)
        if m:
            return f'https://drive.usercontent.google.com/download?id={m.group(1)}&export=download&confirm=t'
    if 'dropbox.com' in url:
        u = re.sub(r'([?&])dl=0', r'\1dl=1', url)
        return u if 'dl=1' in u else u + ('&' if '?' in u else '?') + 'dl=1'
    if '1drv.ms' in url or 'onedrive' in url:
        return url
    return url


def save(out, rid, name, data):
    d = os.path.join(out, str(rid))
    os.makedirs(d, exist_ok=True)
    safe = '__'.join(name.replace('\\', '/').split('/')[-2:])
    with gzip.open(os.path.join(d, safe + '.gz'), 'wb') as f:
        f.write(data)
    return safe


def handle_zip(path, out, rid, rec, depth=0):
    with zipfile.ZipFile(path) as z:
        for i in z.infolist():
            n = i.filename
            if '__MACOSX' in n or i.is_dir():
                continue
            if KEEP.search(n) and i.file_size < 200_000_000:
                rec['kept'].append(save(out, rid, n, z.read(i)))
            elif re.search(r'\.(zip|xsqz)$', n, re.I) and depth < 2 and i.file_size < 600_000_000:
                inner = os.path.join(os.path.dirname(path), f'inner{depth}.zip')
                with open(inner, 'wb') as f:
                    f.write(z.read(i))
                if zipfile.is_zipfile(inner):
                    handle_zip(inner, out, rid, rec, depth + 1)
                os.remove(inner)


def main(tsv, out):
    for line in open(tsv):
        if not line.strip():
            continue
        rid, url = line.rstrip('\n').split('\t')[:2]
        if os.path.isdir(os.path.join(out, rid)):
            continue
        rec = {'id': int(rid), 'url': url, 'kept': []}
        tmp = tempfile.mkdtemp(dir=os.path.dirname(os.path.abspath(tsv)))
        try:
            if '/folders/' in url:
                rec['err'] = 'drive-folder'
                continue
            path = os.path.join(tmp, 'f.bin')
            if os.path.isfile(url):  # already downloaded (e.g. a Dropbox zip saved by the browser)
                shutil.move(url, path)
                url = 'local:' + os.path.basename(url)
            else:
                r = subprocess.run(['curl', '-sL', '--max-filesize', str(MAX), '-o', path, '-w', '%{http_code} %{content_type}', direct(url)],
                                   capture_output=True, text=True, timeout=1800)
                rec['http'] = r.stdout
            if not os.path.exists(path):
                rec['err'] = 'no-file'
                continue
            rec['size'] = os.path.getsize(path)
            if zipfile.is_zipfile(path):
                handle_zip(path, out, rid, rec)
            else:
                head = open(path, 'rb').read(400)
                if b'<xsequence' in head or head.lstrip().startswith(b'<?xml'):
                    rec['kept'].append(save(out, rid, f'{rid}.xsq', open(path, 'rb').read()))
                else:
                    rec['err'] = 'not-zip:' + head[:60].decode('latin1', 'replace')
        except Exception as e:
            rec['err'] = repr(e)
        finally:
            shutil.rmtree(tmp, ignore_errors=True)
            with open(os.path.join(out, '_ext_log.jsonl'), 'a') as f:
                f.write(json.dumps(rec) + '\n')
            print(json.dumps(rec)[:300], flush=True)


if __name__ == '__main__':
    main(*sys.argv[1:3])
