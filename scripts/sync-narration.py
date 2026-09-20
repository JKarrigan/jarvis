#!/usr/bin/env python3
"""Build read-along timings for a book: which line is being spoken when, and on which page.

  python scripts/sync-narration.py BOOK.pdf NARRATION.mp3 OUT.json [--lang ja]
      [--upload http://HOST:3000 --book JELLYFIN_BOOK_ID]

Runs offline on a fast machine (not the Pi): transcribes the narration with Whisper
(word timestamps), splits it into lines at pauses and sentence ends, then assigns each
line to a PDF page by comparing *readings* — both sides are reduced to hiragana, so the
transcript's spelling (kanji vs kana) doesn't have to match the book's. The JSON is then
uploaded to the app (PUT /api/jellyfin/books/<id>/sync); playback needs no compute.

Needs: pip install faster-whisper pypdf pykakasi
"""
import argparse, json, os, re, shutil, subprocess, sys, tempfile, difflib

PAUSE_SPLIT = 1.5   # seconds of silence that starts a new line
MAX_LINE = 36       # characters; a longer run is cut at the next breath so captions stay one or two rows
SENTENCE_END = '。！？!?'

def kana(text, kks):
    """Reading of `text` in hiragana, punctuation/spaces/latin dropped."""
    out = ''.join(item['hira'] for item in kks.convert(text))
    return re.sub(r'[^ぁ-ゟー]', '', out)

def japanese_chars(text):
    return len(re.findall(r'[\u3041-\u30ff\u4e00-\u9fff]', text))

def ocr_pages(pdf, lang):
    """Page text via macOS Vision (scripts/ocr-pdf.swift) for PDFs whose text is drawn, not typed.
    Reads horizontal text well; it does not read vertical Japanese."""
    script = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'ocr-pdf.swift')
    try:
        out = subprocess.run(['swift', script, pdf, lang], capture_output=True, timeout=900, check=True).stdout
        return json.loads(out)
    except Exception as e:
        print(f'(ocr unavailable: {e.__class__.__name__})', file=sys.stderr)
        return None

def tesseract_pages(pdf, lang, tessdata):
    """Page text via Tesseract, which — unlike macOS Vision — has a model for *vertical*
    Japanese (jpn_vert). Each page is rasterised with sips (macOS) and read both ways; the
    reading with more Japanese in it wins. Illustrations add some junk, which the
    reading-based page matching shrugs off."""
    if not shutil.which('tesseract') or not shutil.which('sips'): return None
    from pypdf import PdfReader, PdfWriter
    base = ['--tessdata-dir', tessdata] if tessdata else []
    models = [(f'{lang}_vert', '5'), (lang, '6')] if lang == 'jpn' else [(lang, '6')]
    out = []
    with tempfile.TemporaryDirectory() as tmp:
        reader = PdfReader(pdf)
        for i, page in enumerate(reader.pages):
            one, png = os.path.join(tmp, f'{i}.pdf'), os.path.join(tmp, f'{i}.png')
            w = PdfWriter(); w.add_page(page); w.write(one)
            subprocess.run(['sips', '-s', 'format', 'png', '-Z', '2400', one, '--out', png], capture_output=True)
            best = ''
            for model, psm in models:
                r = subprocess.run(['tesseract', png, '-', *base, '-l', model, '--psm', psm], capture_output=True, text=True)
                text = ''.join(r.stdout.split())
                if japanese_chars(text) > japanese_chars(best): best = text
            out.append(best)
    return out

def page_vocab(pages, limit=180):
    """Distinct kanji/katakana words from the book — primes Whisper to spell like the book."""
    seen, words = set(), []
    for text in pages:
        for w in re.findall(r'[一-鿿゠-ヿ々ー]+[ぁ-ゟ]{0,3}', text):
            if w not in seen and len(w) > 1:
                seen.add(w); words.append(w)
    prompt = ''
    for w in words:
        if len(prompt) + len(w) + 1 > limit: break
        prompt += w + '。'
    return prompt

def lines_from_words(segments):
    """Whisper's words → display lines.

    With vocabulary hints Whisper spells like the book but ends every breath with "。", so
    its punctuation can't be trusted for sentence boundaries. Breath-fragments are rebuilt
    from those marks, stutters (an identical fragment repeated faster than speech) are
    dropped, and a new line starts only at a real pause. Fragments inside a line are joined
    with a full-width space — the phrase spacing early-reader Japanese books use anyway.
    """
    words = [w for s in segments for w in s['words'] if w['w'].strip()]
    fragments, cur = [], []
    for w in words:
        cur.append(w)
        if w['w'].strip()[-1:] in SENTENCE_END:
            fragments.append(cur); cur = []
    if cur: fragments.append(cur)

    def text_of(frag): return ''.join(x['w'] for x in frag).strip().rstrip(SENTENCE_END)
    kept = []
    for i, f in enumerate(fragments):
        nxt = fragments[i + 1] if i + 1 < len(fragments) else None
        if nxt and text_of(f) == text_of(nxt) and nxt[0]['s'] - f[0]['s'] < 0.7:
            continue
        kept.append(f)

    lines, cur = [], []
    for i, f in enumerate(kept):
        cur.append(f)
        nxt = kept[i + 1] if i + 1 < len(kept) else None
        too_long = nxt is not None and sum(len(text_of(x)) for x in cur) + len(text_of(nxt)) > MAX_LINE
        if nxt is None or too_long or nxt[0]['s'] - f[-1]['e'] >= PAUSE_SPLIT:
            out_words = []
            for j, frag in enumerate(cur):
                for k, w in enumerate(frag):
                    t = w['w'].strip()
                    for ch in '。': t = t.replace(ch, '')
                    if not t: continue
                    if j > 0 and k == 0: t = '\u3000' + t
                    out_words.append({'s': w['s'], 'e': w['e'], 'w': t})
            if out_words:
                lines.append({'start': out_words[0]['s'], 'end': out_words[-1]['e'],
                              'text': ''.join(x['w'] for x in out_words), 'words': out_words})
            cur = []
    return lines

def assign_pages(lines, page_kana, line_kana):
    """Monotonic best assignment of lines to pages (pages never go backwards)."""
    n, m = len(lines), len(page_kana)
    def score(i, p):
        a, b = line_kana[i], page_kana[p]
        if not a or not b: return 0.0
        sm = difflib.SequenceMatcher(None, a, b, autojunk=False)
        return sum(bl.size for bl in sm.get_matching_blocks()) / len(a)
    S = [[score(i, p) for p in range(m)] for i in range(n)]
    # Weight by line length: a three-kana aside ("Level 0") must not be able to drag the
    # lines around it onto whichever page happens to contain those three kana.
    W = [max(1, len(k)) for k in line_kana]
    NEG = -1e9
    best = [[NEG] * m for _ in range(n)]
    back = [[0] * m for _ in range(n)]
    for p in range(m): best[0][p] = S[0][p] * W[0] - 0.02 * p
    for i in range(1, n):
        run, arg = NEG, 0
        for p in range(m):
            if best[i - 1][p] > run: run, arg = best[i - 1][p], p
            best[i][p] = run + S[i][p] * W[i] - 0.02 * (p - arg)  # mild preference for small jumps
            back[i][p] = arg
    p = max(range(m), key=lambda q: best[n - 1][q])
    pages = [0] * n
    for i in range(n - 1, -1, -1):
        pages[i] = p
        p = back[i][p]
    return pages, S

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('pdf'); ap.add_argument('audio'); ap.add_argument('out')
    ap.add_argument('--lang', default='ja')
    ap.add_argument('--model', default='large-v3-turbo')
    ap.add_argument('--models-dir', default=os.environ.get('WHISPER_MODELS'))
    ap.add_argument('--tessdata', default=os.environ.get('TESSDATA_DIR'), help='folder holding jpn.traineddata / jpn_vert.traineddata')
    ap.add_argument('--upload', help='app base URL to send the timings to, e.g. http://192.168.1.39:3000')
    ap.add_argument('--book', help='Jellyfin id of the Book item (required with --upload)')
    ap.add_argument('--no-hints', action='store_true', help='do not give Whisper the book\'s vocabulary as hint words')
    a = ap.parse_args()

    from pypdf import PdfReader
    pages = [' '.join((p.extract_text() or '').split()) for p in PdfReader(a.pdf).pages]
    # A book whose words are drawn as shapes has page numbers and little else in its text layer.
    thin = sum(1 for t in pages if japanese_chars(t) < 8)
    if thin > len(pages) / 2:
        tess_lang = {'ja': 'jpn'}.get(a.lang, a.lang)
        for name, ocr in (('macOS Vision', ocr_pages(a.pdf, a.lang)), ('Tesseract', tesseract_pages(a.pdf, tess_lang, a.tessdata))):
            if ocr and len(ocr) == len(pages):
                pages = [o if japanese_chars(o) > japanese_chars(t) else t for o, t in zip(ocr, pages)]
                print(f'text layer is thin ({thin}/{len(pages)} pages) — added {name} OCR', file=sys.stderr)
    prompt = None if a.no_hints else page_vocab(pages)
    # The transcription is the slow part; keep it next to the output so line-cutting and page
    # matching can be re-run (or tuned) without transcribing again.
    cache = a.out + '.words.json'
    cached = None
    if os.path.exists(cache) and os.path.getmtime(cache) >= os.path.getmtime(a.audio):
        cached = json.load(open(cache, encoding='utf-8'))
        if cached.get('hints') != prompt: cached = None
    if cached:
        segments, duration = cached['segments'], cached['duration']
    else:
        segments, duration = transcribe(a, prompt)
        json.dump({'hints': prompt, 'duration': duration, 'segments': segments}, open(cache, 'w', encoding='utf-8'), ensure_ascii=False)
    finish(a, pages, segments, duration)

def transcribe(a, prompt):
    from faster_whisper import WhisperModel
    model = WhisperModel(a.model, device='cpu', compute_type='int8', download_root=a.models_dir)
    segs, info = model.transcribe(a.audio, language=a.lang, word_timestamps=True, vad_filter=True,
                                  beam_size=5, condition_on_previous_text=False, hotwords=prompt)
    segments = [{'words': [{'s': round(w.start, 2), 'e': round(w.end, 2), 'w': w.word} for w in (s.words or [])]} for s in segs]
    return segments, round(info.duration, 2)

def finish(a, pages, segments, duration):
    import pykakasi
    kks = pykakasi.kakasi()
    lines = lines_from_words(segments)
    if not lines: sys.exit('no speech found')

    page_kana = [kana(t, kks) for t in pages]
    line_kana = [kana(l['text'], kks) for l in lines]
    assigned, S = assign_pages(lines, page_kana, line_kana)
    for l, p, i in zip(lines, assigned, range(len(lines))):
        l['page'] = p + 1
        l['match'] = round(S[i][p], 2)
    # No confident placement (typically vertical text OCR can't read): keep the captions but
    # mark every page unknown (0) so the reader never turns to a wrong page.
    weights = [max(1, len(k)) for k in line_kana]
    confidence = sum(l['match'] * w for l, w in zip(lines, weights)) / sum(weights)
    placed = confidence >= 0.7
    if not placed:
        for l in lines: l['page'] = 0
        print(f'page matching confidence {confidence:.2f} < 0.70 — captions only, no auto page turns', file=sys.stderr)
    result = {'v': 1, 'duration': duration, 'pages': len(pages), 'lines': lines}
    json.dump(result, open(a.out, 'w', encoding='utf-8'), ensure_ascii=False)
    for l in lines:
        print(f"{l['start']:7.1f}  p{l['page']:<3} {l['match']:.2f}  {l['text']}")
    if a.upload:
        if not a.book: sys.exit('--upload needs --book')
        import urllib.request
        req = urllib.request.Request(f"{a.upload.rstrip('/')}/api/jellyfin/books/{a.book}/sync", method='PUT',
                                     data=json.dumps(result).encode(), headers={'Content-Type': 'application/json'})
        print('uploaded:', urllib.request.urlopen(req, timeout=60).read().decode())

if __name__ == '__main__':
    main()
