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

class _Hocr(__import__('html.parser').parser.HTMLParser):
    """Lines → words (bbox + text) out of Tesseract's hOCR."""
    def __init__(self):
        super().__init__(); self.lines = []; self._word = None
    def handle_starttag(self, tag, attrs):
        d = dict(attrs); cls = d.get('class', ''); m = re.search(r'bbox (\d+) (\d+) (\d+) (\d+)', d.get('title', ''))
        if not m: return
        box = tuple(map(int, m.groups()))
        if cls == 'ocr_line' or cls == 'ocr_header' or cls == 'ocr_caption': self.lines.append({'box': box, 'words': []})
        elif cls == 'ocrx_word' and self.lines:
            self._word = {'box': box, 'text': ''}; self.lines[-1]['words'].append(self._word)
    def handle_data(self, data):
        if self._word is not None: self._word['text'] += data.strip()

def _hocr(png, model, psm, base):
    r = subprocess.run(['tesseract', png, '-', *base, '-l', model, '--psm', psm, '-c', 'tessedit_create_hocr=1'], capture_output=True, text=True)
    parser = _Hocr(); parser.feed(r.stdout)
    return parser.lines

def _png_size(png):
    with open(png, 'rb') as fh:
        head = fh.read(24)
    return int.from_bytes(head[16:20], 'big'), int.from_bytes(head[20:24], 'big')

def _main_chars(lines, vertical, size):
    """Body-text characters with page-relative boxes (0–1). Tesseract's own per-character
    boxes are unusable for vertical text, so each *word* box is split evenly along the reading
    direction instead (a vertical "word" is a character or two).

    Words are kept by thickness (across the reading direction) relative to the body text:
    furigana is about half as thick, and the junk Tesseract "reads" out of illustrations is
    far thicker. The body thickness is a median weighted by how much Japanese each word
    holds, so neither kind of noise can drag it."""
    W, H = size
    thick = lambda w: (w['box'][2] - w['box'][0]) if vertical else (w['box'][3] - w['box'][1])
    words = [w for l in lines for w in l['words'] if japanese_chars(w['text']) > 0 and thick(w) > 0]
    if not words: return []
    weighted = sorted((thick(w), japanese_chars(w['text'])) for w in words)
    half, run, body = sum(n for _, n in weighted) / 2, 0, weighted[-1][0]
    for t, n in weighted:
        run += n
        if run >= half: body = t; break
    out = []
    for l in lines:
        for w in l['words']:
            chars = [c for c in w['text'] if not c.isspace()]
            if not chars or not (body * 0.7 <= thick(w) <= body * 1.5): continue
            x1, y1, x2, y2 = w['box']
            for i, ch in enumerate(chars):
                if vertical: cx1, cx2, cy1, cy2 = x1, x2, y1 + (y2 - y1) * i / len(chars), y1 + (y2 - y1) * (i + 1) / len(chars)
                else: cx1, cx2, cy1, cy2 = x1 + (x2 - x1) * i / len(chars), x1 + (x2 - x1) * (i + 1) / len(chars), y1, y2
                out.append({'ch': ch, 'x': round(cx1 / W, 4), 'y': round(cy1 / H, 4), 'w': round((cx2 - cx1) / W, 4), 'h': round((cy2 - cy1) / H, 4)})
    return out

def tesseract_pages(pdf, lang, tessdata):
    """Page text *and* character positions via Tesseract, which — unlike macOS Vision — has a
    model for vertical Japanese (jpn_vert). Each page is rasterised with sips (macOS) and
    read both ways; the reading with more Japanese in it wins. Illustrations add some junk,
    which the reading-based page matching shrugs off. Returns (texts, boxes) or None."""
    if not shutil.which('tesseract') or not shutil.which('sips'): return None
    from pypdf import PdfReader, PdfWriter
    base = ['--tessdata-dir', tessdata] if tessdata else []
    models = [(f'{lang}_vert', '5', True), (lang, '6', False)] if lang == 'jpn' else [(lang, '6', False)]
    texts, boxes = [], []
    with tempfile.TemporaryDirectory() as tmp:
        for i, page in enumerate(PdfReader(pdf).pages):
            one, png = os.path.join(tmp, f'{i}.pdf'), os.path.join(tmp, f'{i}.png')
            w = PdfWriter(); w.add_page(page); w.write(one)
            subprocess.run(['sips', '-s', 'format', 'png', '-Z', '2400', one, '--out', png], capture_output=True)
            best_text, best_boxes = '', []
            for model, psm, vertical in models:
                lines = _hocr(png, model, psm, base)
                text = ''.join(w['text'] for l in lines for w in l['words'])
                if japanese_chars(text) > japanese_chars(best_text):
                    best_text, best_boxes = text, _main_chars(lines, vertical, _png_size(png))
            texts.append(best_text); boxes.append(best_boxes)
    return texts, boxes

def page_vocab(pages, names=(), limit=200):
    """Hint words for Whisper so it spells like the book: the given names first (title,
    author, anything it keeps getting wrong), then the book's kanji/katakana words by how
    often they occur. Frequency matters twice over — recurring names (仁和寺, 石清水八幡宮)
    are exactly what needs fixing, and OCR junk rarely repeats."""
    counts, first = {}, {}
    for text in pages:
        for w in re.findall(r'[\u4e00-\u9fff\u30a0-\u30ff々ー]{2,}', text):
            counts[w] = counts.get(w, 0) + 1
            first.setdefault(w, len(first))
    ranked = sorted((w for w in counts if counts[w] >= 2 or len(pages) < 6), key=lambda w: (-counts[w], first[w]))
    prompt, seen = '', set()
    for w in [*names, *ranked]:
        w = w.strip()
        if not w or w in seen: continue
        if len(prompt) + len(w) + 1 > limit: break
        seen.add(w); prompt += w + '。'
    return prompt

def homophone_fixes(segments, names, pages, kks):
    """Spellings to correct automatically: a kanji/katakana word in the transcript that *reads*
    the same as one of the book's names or recurring words but is written differently gets
    the book's spelling (健康 → 兼好, both けんこう). Short readings are left alone — too many
    unrelated words share them."""
    counts = {}
    for text in pages:
        for w in re.findall(r'[\u4e00-\u9fff\u30a0-\u30ff々ー]{2,}', text): counts[w] = counts.get(w, 0) + 1
    book = {}
    for w in [*[n.strip() for n in names], *sorted((w for w in counts if counts[w] >= 2), key=lambda w: -counts[w])]:
        reading = kana(w, kks)
        if len(w) >= 2 and len(reading) >= 4: book.setdefault(reading, w)
    spoken = ''.join(w['w'] for seg in segments for w in seg['words'])
    fixes = {}
    for run in set(re.findall(r'[\u4e00-\u9fff\u30a0-\u30ff々ー]{2,}', spoken)):
        right = book.get(kana(run, kks))
        if right and right != run and run not in counts: fixes[run] = right
    return fixes

def apply_fixes(segments, fixes):
    """Replace known-wrong spellings (a homophone Whisper insists on), even when the wrong
    text is spread over several timed words: the first word takes the corrected text and
    the span's full duration, the rest are emptied."""
    for seg in segments:
        words = seg['words']
        for wrong, right in fixes.items():
            while True:
                joined = ''.join(w['w'] for w in words)
                at = joined.find(wrong)
                if at < 0 or not wrong: break
                pos, hit = 0, []
                for k, w in enumerate(words):
                    if pos < at + len(wrong) and pos + len(w['w']) > at: hit.append(k)
                    pos += len(w['w'])
                start = sum(len(words[k]['w']) for k in range(hit[0]))
                span = ''.join(words[k]['w'] for k in hit)
                fixed = span[:at - start] + right + span[at - start + len(wrong):]
                words[hit[0]] = {'s': words[hit[0]]['s'], 'e': words[hit[-1]]['e'], 'w': fixed}
                for k in hit[1:]: words[k] = {**words[k], 'w': ''}
                if wrong in right: break

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
    ap.add_argument('--names', default='', help='comma-separated names to hint first: title, author, places')
    ap.add_argument('--fix', default='', help='comma-separated wrong=right spellings to correct in the transcript')
    ap.add_argument('--tessdata', default=os.environ.get('TESSDATA_DIR'), help='folder holding jpn.traineddata / jpn_vert.traineddata')
    ap.add_argument('--upload', help='app base URL to send the timings to, e.g. http://192.168.1.39:3000')
    ap.add_argument('--book', help='Jellyfin id of the Book item (required with --upload)')
    ap.add_argument('--no-hints', action='store_true', help='do not give Whisper the book\'s vocabulary as hint words')
    a = ap.parse_args()

    from pypdf import PdfReader
    pages = [' '.join((p.extract_text() or '').split()) for p in PdfReader(a.pdf).pages]
    # A book whose words are drawn as shapes has page numbers and little else in its text layer.
    thin = sum(1 for t in pages if japanese_chars(t) < 8)
    page_boxes = None   # character positions from OCR, for pages that have no text layer to locate words in
    if thin > len(pages) / 2:
        tess_lang = {'ja': 'jpn'}.get(a.lang, a.lang)
        tess = tesseract_pages(a.pdf, tess_lang, a.tessdata)
        for name, ocr in (('macOS Vision', ocr_pages(a.pdf, a.lang)), ('Tesseract', tess[0] if tess else None)):
            if ocr and len(ocr) == len(pages):
                pages = [o if japanese_chars(o) > japanese_chars(t) else t for o, t in zip(ocr, pages)]
                print(f'text layer is thin ({thin}/{len(pages)} pages) — added {name} OCR', file=sys.stderr)
        if tess and len(tess[1]) == len(pages): page_boxes = tess[1]
    names = [n for n in a.names.split(',') if n.strip()]
    prompt = None if a.no_hints else page_vocab(pages, names)
    fixes = dict(f.split('=', 1) for f in a.fix.split(',') if '=' in f)
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
    import pykakasi
    auto = homophone_fixes(segments, names, pages, pykakasi.kakasi())
    if auto: print('spelling corrected to match the book:', '、'.join(f'{k}→{v}' for k, v in auto.items()), file=sys.stderr)
    apply_fixes(segments, {**auto, **fixes})
    finish(a, pages, segments, duration, page_boxes)

def transcribe(a, prompt):
    from faster_whisper import WhisperModel
    model = WhisperModel(a.model, device='cpu', compute_type='int8', download_root=a.models_dir)
    segs, info = model.transcribe(a.audio, language=a.lang, word_timestamps=True, vad_filter=True,
                                  beam_size=5, condition_on_previous_text=False, hotwords=prompt)
    segments = [{'words': [{'s': round(w.start, 2), 'e': round(w.end, 2), 'w': w.word} for w in (s.words or [])]} for s in segs]
    return segments, round(info.duration, 2)

def finish(a, pages, segments, duration, page_boxes=None):
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
    if page_boxes and placed:
        used = {l['page'] for l in lines}
        result['pageChars'] = {str(i + 1): b for i, b in enumerate(page_boxes) if (i + 1) in used and b}
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
