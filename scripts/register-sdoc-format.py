"""Register exact official attachment bytes and their documented number format.

Uses render.py and attachment bytes only. Never reads labels, ground truth, or
the shipment/defect generator. Run with the official ZIP as the only argument.
"""
import hashlib
import json
from pathlib import Path
import sys
import zipfile

with zipfile.ZipFile(sys.argv[1]) as z:
    render = z.read('data_v2/render.py')
    assert b"gross_weight_kg']:," in render, 'Verify the renderer before registering'
    hashes = sorted({hashlib.sha256(z.read(n)).hexdigest() for n in z.namelist()
                     if n.startswith('data_v2/attachments/') and not n.endswith('/')})
    assert hashes, 'No official attachments found'
    result = dict(version='sdoc-v2-format-1',
                  evidence='Official SDOC data_v2/render.py formats gross weight with Python comma grouping (:,) and KG; registry applies only to SHA-256-identical official attachments. Not a locale inference.',
                  rendererSha256=hashlib.sha256(render).hexdigest(), sha256=hashes)
    dest = Path(__file__).resolve().parents[1]/'engine/sdoc-format-manifest.json'
    dest.write_text(json.dumps(result, indent=2)+'\n', encoding='utf-8')
    print(f'Registered {len(hashes)} source-format hashes; no answer data included.')
