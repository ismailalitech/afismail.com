#!/usr/bin/env python3
"""Build the Aegis 1.x figures of this site with the Aegis repository's own renderer.

  tools/aegis-figures/make_figures.py --aegis ~/aegis [--check]

The flow diagrams are in figures.yaml. The console figures are built here from recorded runs, as the Aegis
repository's tools/make_console_figures.py does: every line drawn comes from a file a real run wrote, either in the
Aegis repository's evidence/ or in records/ next to this script (runs on the build PC, each file says what was run
and when). This script only picks the lines, shortens a few long values (marked "...") and adds the callouts.
The SVG files go to static/aegis/diagrams/; with --check nothing is written and the exit status says whether they
are current.
"""
import argparse, importlib.util, json, os, re, sys
import yaml

HERE = os.path.dirname(os.path.abspath(__file__))
SITE = os.path.dirname(os.path.dirname(HERE))
OUT = os.path.join(SITE, 'static', 'aegis', 'diagrams')


def clean(line):
    return ''.join(c for c in line.rstrip('\n') if c == '\t' or ord(c) >= 32).replace('\t', '    ')


def fig(id, title, alt, cmd, lines, callouts, width=1000, step=3.4):
    n = 1 + len(lines)
    return {'id': id, 'type': 'terminal', 'title': title, 'alt': alt, 'width': width, 'step': step,
            'height': 58 + 20 * n + 16 + 70 + 16 * max(0, len(callouts) // 8),
            'lines': [cmd] + lines, 'callouts': callouts}


def short(s, n):
    """s cut at a word boundary to at most n characters, '...' marking the cut."""
    if len(s) <= n:
        return s
    cut = s[:n - 4]
    return cut[:cut.rfind(' ')].rstrip(' ,:') + ' ...'


def wrap(s, n, indent=9):
    """A long log line drawn as several, the continuations indented."""
    out = []
    while len(s) > n:
        i = s[:n].rfind(' ')
        out.append(s[:i]); s = ' ' * indent + s[i + 1:]
    return out + [s]


def consoles(aegis):
    rec = lambda name: [clean(l) for l in open(os.path.join(HERE, 'records', name))]
    ev = lambda *p: [clean(l) for l in open(os.path.join(aegis, 'evidence', *p))]
    figs = []

    # the simulated device, end to end (records/sim-run.txt)
    run = [l for l in rec('sim-run.txt') if l and not l.startswith('# ')]
    figs.append(fig('console-sim-device', 'a device on the Prover SDK, attested on the PC',
        'sdk/examples/simulated-device/run.sh on the build PC: the SDK and a device in one C file are built with the '
        'EAT option, a verifier identity is made, the device is enrolled and admitted with trust software and a session '
        'bound to its quote, a KMAC256 heartbeat verifies, the evidence pack verifies with the standalone checker, an '
        'image with one changed byte is quarantined, and the verifier\'s signed audit log verifies: 11 entries in 3 '
        'signed batches.',
        '$ sdk/examples/simulated-device/run.sh', run,
        [{'lines': [2, 2], 'title': 'Build', 'text': 'libaegis_sdk.a and the device, from the SDK\'s two public headers only.'},
         {'lines': [5, 8], 'title': 'Enrolled and admitted', 'text': 'fleet.py, the code the gateway runs: trust software, a session bound to the quote.'},
         {'lines': [9, 10], 'title': 'Session', 'text': 'Both sides name the same session; a KMAC256 heartbeat with ttl.'},
         {'lines': [11, 11], 'title': 'Evidence pack', 'text': 'The EAT, the signed result and the keys, checked without Aegis code.'},
         {'lines': [12, 12], 'title': 'Changed image', 'text': 'One byte of the image changed: quarantined on its measurement.'},
         {'lines': [13, 13], 'title': 'Audit log', 'text': 'The verifier\'s signed log of all of it.'}], width=1060))

    # the standalone checker on the pack, then on the pack with one bit flipped (records/verify-evidence-*.txt)
    pk = [l.strip() for l in rec('verify-evidence-pack.txt')]
    want = ('"profile": "tag:ietf.org', '"signature": "ML-DSA-65', '"status":', '"aegis.trust":', '"aegis.enrolment":',
            '"aegis.session-binding":', '"aegis.evidence-format":', '"platform":', '"verified":')
    sel = [next(l for l in pk if l.startswith(w)).rstrip(',') for w in want]     # the first of each, in this order
    checks = [l.strip(' ",') for l in pk[pk.index('"checks": [') + 1:pk.index('],')]]
    bad = [l.strip().rstrip(',') for l in rec('verify-evidence-flipped.txt') if l.strip().startswith('"')]
    lines = checks + sel + ['$ tools/verify_evidence.py pack <the same pack, one bit of evidence.cbor flipped> ...'] + bad
    figs.append(fig('console-verify-evidence', 'the standalone checker on an evidence pack',
        'tools/verify_evidence.py on the evidence pack of the simulated device, with the two key thumbprints given on '
        'the command line. It checks that the evidence, the signed attestation result and the manifest speak of the same '
        'device, key, nonce, quote and measurements; both ML-DSA-65 signatures are valid; the result is an EAR with '
        'status warning, because the device has software trust and was enrolled on first use. With one bit of the '
        'evidence flipped the pack is refused.',
        '$ tools/verify_evidence.py pack <pack> --verifier-key <thumbprint> --device-key <thumbprint>', lines,
        [{'lines': [1, len(checks)], 'title': 'One statement', 'text': 'Evidence, result and manifest name the same device, nonce, quote and measurements.'},
         {'lines': [len(checks) + 1, len(checks) + 3], 'title': 'Signed result', 'text': 'An EAR signed with ML-DSA-65 (COSE -49): status warning.'},
         {'lines': [len(checks) + 4, len(checks) + 7], 'title': 'Why warning', 'text': 'Software trust and a key pinned on first use; the session is bound to the quote.'},
         {'lines': [len(lines) - 2, len(lines)], 'title': 'One bit flipped', 'text': 'The pack is refused.'}], width=1000))

    # the audit log: as written, one bit flipped, the end cut off without and with the head (records/verify-audit.txt)
    au = rec('verify-audit.txt')
    blocks, cur = [], None
    for l in au:
        if l.startswith('# exit'):
            continue
        if l.startswith('# '):
            cur = [l[2:], []]; blocks.append(cur)
        elif cur:
            cur[1].append(l.strip().rstrip(','))
    pick = lambda b, keys: [l for l in b[1] if any(l.startswith('"%s"' % k) for k in keys)]
    full, flip, cut, head = blocks
    events = [json.loads('{%s}' % l)['event'] for l in full[1] if l.startswith('"event"')]
    lines = (['"last_batch": 3', '"entries": 11', 'events: ' + ', '.join(events), pick(full, ['verified'])[-1]] +
             ['$ tools/verify_audit.py log <one bit flipped in the second batch> --key identity.json'] + pick(flip, ['verified', 'reason']) +
             ['$ tools/verify_audit.py log <the last batch cut off> --key identity.json'] + pick(cut, ['last_batch', 'entries', 'verified']) +
             ['$ tools/verify_audit.py log <the last batch cut off> --key identity.json --head 3:7760bde4...'] + pick(head, ['verified', 'reason']))
    assert pick(full, ['last_batch']) == ['"last_batch": 3'] and pick(full, ['entries'])[0] == '"entries": 11', 'the record changed'
    figs.append(fig('console-verify-audit', 'the verifier\'s audit log, changed and cut short',
        'tools/verify_audit.py on the audit log the verifier wrote during the simulated-device run: three batches, '
        'eleven entries, verified. One bit flipped in the second batch: its ML-DSA-65 signature does not verify. The '
        'last batch cut off: the rest is a whole, signed, shorter log, and verifies. Given the head of batch 3, as the '
        'gateway prints it in its journal or as an anchor kept off the gateway holds it, the cut is found.',
        '$ tools/verify_audit.py log <audit dir> --key identity.json', lines,
        [{'lines': [1, 4], 'title': 'As written', 'text': 'Three signed batches, eleven entries, from log-start to the quarantine.'},
         {'lines': [5, 7], 'title': 'One bit changed', 'text': 'The batch\'s signature fails.'},
         {'lines': [8, 11], 'title': 'The end cut off', 'text': 'Without an anchor the shorter log is a valid log.'},
         {'lines': [12, 14], 'title': 'With the head', 'text': 'An anchor or the journal\'s head line finds the cut.'}], width=1000))

    # the 3-hour soak (evidence/soak-20261121/events.log and report.md)
    evl = ev('soak-20261121', 'events.log')
    def tidy(l):
        l = re.sub(r'^2026-11-2\dT(\d\d:\d\d:\d\d)\+01:00 ', r'\1 ', l)
        return re.sub(r' {2,}', ' ', l)
    take = lambda pred, n=1: [tidy(l) for l in evl if pred(l)][:n]
    lines = (take(lambda l: 'soak started' in l) +
             take(lambda l: 'regression: start passed' in l) +
             take(lambda l: l.startswith('2026-11-20T22:10:38') and 'renewed' in l, 3) +
             take(lambda l: ' FAIL ' in l) +
             take(lambda l: 'regression: middle passed' in l) +
             take(lambda l: 'regression: end passed' in l))
    lines[0] = short(lines[0], 122)
    rep = ev('soak-20261121', 'report.md')
    rows = [re.sub(r'\s*\|\s*', ' | ', l).strip(' |') for l in rep if l.startswith('| stm32h573-dk-2 |') or l.startswith('| frdm-rw612 |') or l.startswith('| zynqmp-te0808 |')]
    rows = [r for r in rows if 'over' in r]
    lines += ['$ grep -A5 "^## Endpoints" evidence/soak-20261121/report.md   # verdicts, quarantined, renewals, ..., clock rate'] + [short(r, 122) for r in rows]
    figs.append(fig('console-soak', 'the 3-hour soak on three live boards',
        'Lines from the soak runner\'s event log and the endpoint table of its report. The soak started with three '
        'endpoints and a 600 s credential; the regressions at the start, the middle and the end passed; sessions were '
        'renewed every five minutes on each board. At 22:20 the runner estimated the STM32\'s clock at 1.535 s per '
        'gateway second and failed it: a false positive of its estimate, which paired two heartbeats across the change '
        'to the shorter session. Over the whole run each endpoint had 342 verdict lines, no quarantine and 37 renewals.',
        '$ grep -E "started|passed|renewed|FAIL" evidence/soak-20261121/events.log   # times CET', lines,
        [{'lines': [1, 2], 'title': 'Start', 'text': 'Three endpoints, 600 s credentials; the first 14-stage regression passes.'},
         {'lines': [3, 5], 'title': 'Renewals', 'text': 'Every five minutes, on each board.'},
         {'lines': [6, 6], 'title': 'The one FAIL', 'text': 'A false clock-rate estimate of the runner, not of the board.'},
         {'lines': [7, 8], 'title': 'Regressions', 'text': 'Middle and end: PASS.'},
         {'lines': [10, 12], 'title': 'Per endpoint', 'text': '342 verdict lines, 0 quarantined, 37 renewals, no reset.'}], width=1060))

    # transcript v2 on STM32 board 2 (evidence/transcript-v2/)
    def kv(name, keys, n=118):
        out = []
        for l in ev('transcript-v2', name):
            s = l.strip().rstrip(',')
            if any(s.startswith('"%s' % k) for k in keys):
                if ': its ML-KEM key' in s:          # the refusal's explanation, which the article gives in full
                    s = s[:s.index(': its ML-KEM key')] + ' ..."'
                out.append(short(s, n))
        return out
    live = kv('ts-live-b2.txt', ['L1_bound', 'L2_same', 'L2_session', 'L4_credential_without', 'L4_session'])
    swap = kv('ts-realswap-b2.txt', ['S1_recorded', 'S1_credential', 'S2_quote_for', 'S3_new'])
    lines = live + ['$ transcript_swap_check.py ... swap   # after the earlier image 67a452b1 was flashed and the board reset'] + swap
    figs.append(fig('console-transcript-swap', 'one transcript on STM32 board 2',
        'tests/board/transcript_swap_check.py on the gateway against STM32 board 2. With the transcript image, a bound '
        'exchange is accepted; the same quote a second time is refused and the session kept; credentials that do not '
        'name this transcript get -149 from the partition. Then the earlier image, which derives the same device key, '
        'was flashed after the quote was appraised: continuing the recorded quote is refused before a credential is '
        'sent, and so is a new cycle with that image.',
        '$ transcript_swap_check.py ... live   # STM32 board 2, SPE 3183f74a', lines,
        [{'lines': [1, 1], 'title': 'Bound', 'text': 'The exchange continues the quote just appraised.'},
         {'lines': [2, 3], 'title': 'Same quote twice', 'text': 'Refused, and the session is kept.'},
         {'lines': [4, 5], 'title': 'Wrong transcript', 'text': 'The partition refuses the credential: -149.'},
         {'lines': [7, 8], 'title': 'Another image', 'text': 'It cannot continue the appraised quote; no credential is sent.'},
         {'lines': [9, 10], 'title': 'No way around', 'text': 'Another quote for the same challenge, or a new cycle: refused.'}], width=1000))

    # endorsed enrolment, switched on at the bench (evidence/endorsed-enrolment/bench/live-switch.txt)
    sw = ev('endorsed-enrolment', 'bench', 'live-switch.txt')
    keep = [l for l in sw if l and (re.match(r'^\d\d:\d\d:\d\d ', l) or l.startswith('# live') or l.startswith('# key restored')
                                    or l.startswith('# record restored') or l.startswith('# endorse:') or l.startswith('# full board regression afterwards'))]
    lines = []
    for l in keep:
        l = l.replace('  [', ' [')
        if l.startswith('# '):
            l = '  # ' + l[2:]
        lines += wrap(l, 132)
    at = lambda text: next(i for i, l in enumerate(lines) if text in l) + 1     # line number in the figure
    figs.append(fig('console-endorsed-switch', 'endorsement required: a substituted key and a missing record',
        'The gateway journal when its policy began to require an endorsement for the two STM32s and the RW612. The '
        'endorser on the bench PC, whose key is sealed to the PC\'s TPM, had endorsed each device in under a second. All '
        'three are admitted, endorsed by bench-pc. Board 2\'s pinned key replaced by board 1\'s: quarantined, substituted '
        'key. The key restored but the record removed: quarantined, no endorsement record. The record back: admitted. '
        'The full board regression passed 14 of 14 afterwards.',
        '$ journalctl -u aegis-fleet -o cat   # 20 November 2026, with the operator\'s notes', lines,
        [{'lines': [1, 1], 'title': 'Endorsed at the bench', 'text': 'Well under a second per device; the keys are the ones already pinned.'},
         {'lines': [2, 4], 'title': 'Required', 'text': 'All three admitted, endorsed by bench-pc.'},
         {'lines': [at('# live'), at('# key restored') - 1], 'title': 'Substituted key', 'text': 'Board 1\'s key under board 2\'s name: quarantined, credential revoked.'},
         {'lines': [at('# key restored'), at('# record restored') - 1], 'title': 'No record', 'text': 'Quarantined until the record is back.'},
         {'lines': [at('# record restored'), len(lines)], 'title': 'Back', 'text': 'Admitted; the regression passes 14 of 14.'}], width=1140))

    figs += consoles_v12(rec)
    return figs


def consoles_v12(rec):
    """The Aegis 1.2 figures: the bench record (records/v12-bench.txt) and two runs on the build PC
    (records/v12-pack.txt, records/v12-check.txt)."""
    figs = []

    # 1.2 on the bench gateway, 21 November 2026 (the operator's record)
    lines = []
    for l in rec('v12-bench.txt')[2:]:
        if l.startswith('# a 1.2 pack of the bench: '):
            l = '$ ' + l[len('# a 1.2 pack of the bench: '):].replace('<pack>', '<a 1.2 pack of the bench>')
        elif l.startswith('# '):
            l = '  # ' + l[2:]
        if l:
            lines.append(l)
    at = lambda text: next(i for i, l in enumerate(lines) if text in l) + 1
    figs.append(fig('console-v12-bench', 'Aegis 1.2 on the bench: a floor, a switch and a signed export time',
        'The gateway with Aegis 1.2 on 21 November 2026, from the operator\'s record. The board regression passed 14 of '
        '14. With "min_trust": "trustzone" on STM32 board 2 the gateway logged QUARANTINED policy: entry stm32h573-dk-2 '
        'can NEVER meet min_trust trustzone: its trust is trustzone-devkey, and did not contact the board. With '
        '"disabled": true it logged QUARANTINED disabled by policy [credential: revoked]. With "min_trust": '
        '"trustzone-devkey", which the board meets, it was admitted again. A 1.2 pack of the bench verified with '
        '--require-signed-export, its export time signed.',
        '$ journalctl -u aegis-fleet -o cat   # 21 November 2026, Aegis 1.2 on the gateway, with the operator\'s notes', lines,
        [{'lines': [1, 1], 'title': 'Deployed', 'text': 'The board regression with 1.2: 14 of 14.'},
         {'lines': [at('"trustzone" on'), at('did not contact')], 'title': 'A floor it can never meet', 'text': 'Refused as the policy\'s mistake; the board is not contacted.'},
         {'lines': [at('"disabled"'), at('disabled by policy')], 'title': 'Disabled', 'text': 'Quarantined and its session revoked, without being asked.'},
         {'lines': [at('"trustzone-devkey", which'), at('ADMITTED')], 'title': 'A floor it meets', 'text': 'trustzone-devkey: admitted again.'},
         {'lines': [at('$ tools/verify_evidence'), len(lines)], 'title': 'Signed export time', 'text': 'The pack\'s time is the verifier\'s signed statement.'}], width=1060))

    # the simulated device's 1.2 pack: signed, stripped, retimed; its result's head in the audit log (records/v12-pack.txt)
    blocks, cur = {}, None
    for l in rec('v12-pack.txt'):
        if re.match(r'^# [A-D]: ', l):
            cur = l[2]; blocks[cur] = []
        elif cur and not l.startswith('# '):
            blocks[cur].append(l)
    js = {k: json.loads('\n'.join(v)) for k, v in blocks.items()}
    a, b, c, d = js['A'], js['B'], js['C'], js['D']
    vc = a['attestation_result']['verifier_claims']
    q = lambda v: json.dumps(v)
    h8 = lambda s: s[:8] + '...'
    anc = d['anchors'][0]
    lines = (['"aegis.pack-signed": %s' % q(vc['aegis.pack-signed']),
              '"aegis.audit-log": "%s", "aegis.audit-batch": %d, "aegis.audit-head": "%s"' % (h8(vc['aegis.audit-log']), vc['aegis.audit-batch'], h8(vc['aegis.audit-head'])),
              '"aegis.warnings": ['] + ['    %s' % q(w) for w in vc['aegis.warnings']] + [']',
             '"export_time": {"time": %d, "signed": %s}' % (a['export_time']['time'], q(a['export_time']['signed'])),
             '"verified": %s' % q(a['verified']),
             '$ tools/verify_evidence.py pack <the same pack, manifest.cose and "signed_manifest" removed> ...',
             '"verified": %s' % q(b['verified'])] + wrap('"reason": %s' % q(b['reason']), 118, 11) +
            ['$ tools/verify_evidence.py pack <the same pack, "exported" in manifest.json one day earlier> ...',
             '"verified": %s' % q(c['verified']), '"reason": %s' % q(c['reason']),
             '$ tools/verify_audit.py log <audit dir> --key identity.json --result <the pack>/attestation-result.cbor',
             '"last_batch": %d, "entries": %d' % (d['logs'][-1]['last_batch'], d['logs'][-1]['entries']),
             '"anchors": the result names batch %d, head "%s"; its decision: batch %d, entry %d, %s' % (
                 anc['batch'], h8(anc['head']), anc['decision']['batch'], anc['decision']['entry'], anc['decision']['event']),
             '"verified": %s' % q(d['verified'])])
    assert a['verified'] and not b['verified'] and not c['verified'] and d['verified'], 'the record changed'
    at = lambda text: next(i for i, l in enumerate(lines) if text in l) + 1
    figs.append(fig('console-v12-pack', 'a 1.2 evidence pack: signed, stripped, edited',
        'tools/verify_evidence.py on the evidence pack the simulated device left on the build PC with Aegis 1.2 '
        '(main 6bf5b53). The signed result says aegis.pack-signed, names the audit log\'s head (batch 1) and carries '
        'two warnings; with --require-signed-export the export time is reported signed and the pack verifies. With '
        'manifest.cose deleted and the manifest\'s pointer to it removed, as if it were a pack of 1.1, the pack is '
        'refused, because the result says the verifier signs every pack. With the export time moved one day, the '
        'manifest is not the one the verifier signed. verify_audit.py finds the result\'s batch in the log and its '
        'decision, admit, in batch 2.',
        '$ tools/verify_evidence.py pack <pack> --verifier-key <thumbprint> --device-key <thumbprint> --require-signed-export', lines,
        [{'lines': [1, 2], 'title': 'In the signed result', 'text': 'aegis.pack-signed and the audit log\'s head when it was signed.'},
         {'lines': [3, at('"export_time"') - 1], 'title': 'aegis.warnings', 'text': 'An admitted endpoint\'s cautions, in one place.'},
         {'lines': [at('"export_time"'), at('"export_time"') + 1], 'title': 'Signed export time', 'text': 'manifest.cose verifies under the verifier key.'},
         {'lines': [at('"signed_manifest" removed'), at('"exported" in') - 1], 'title': 'Signature stripped', 'text': 'The result says it was there: refused.'},
         {'lines': [at('"exported" in'), at('"exported" in') + 2], 'title': 'Time moved', 'text': 'Not the manifest the verifier signed.'},
         {'lines': [at('--result'), len(lines)], 'title': 'Result as anchor', 'text': 'Batch 1 is in the log; the admit is in batch 2.'}], width=1060))

    # fleet.py check on the simulated device's policy with a floor or the switch (records/v12-check.txt)
    lines = []
    for l in rec('v12-check.txt')[1:]:
        if l.startswith('# entry with '):
            lines.append('  # the entry with ' + l[len('# entry with '):])
        elif l.startswith('# exit'):
            lines.append('  # ' + l[2:])
        elif l.strip() and not l.startswith('  enrolment') and not l.startswith('  credentials') and not l.startswith('  session'):
            lines += wrap(l, 118, 4)
    at = lambda text: next(i for i, l in enumerate(lines) if text in l) + 1
    figs.append(fig('console-v12-check', 'fleet.py check: a floor never met, a floor met, no floor, disabled',
        'gateway/aegisd/fleet.py check on the build PC with Aegis 1.2, on the simulated device\'s policy with one key '
        'added to its entry each time. min_trust device-key, which a Linux device with software trust can never meet: '
        'REFUSED as a policy error, exit status 1. min_trust software: met. min_trust null: refused, since an entry '
        'cannot opt out of a floor. disabled true: DISABLED, not contacted, quarantined every cycle, its session '
        'revoked, exit status 0.',
        '$ fleet.py check <policy> --platform linux   # the simulated device\'s entry, one key added each time', lines,
        [{'lines': [at('"device-key"'), at('"software"') - 1], 'title': 'Never met', 'text': 'Software trust cannot reach device-key: a policy error.'},
         {'lines': [at('"software"'), at('null') - 1], 'title': 'Met', 'text': 'The floor and the label it is met by.'},
         {'lines': [at('null'), at('"disabled"') - 1], 'title': 'No opt-out', 'text': 'null is not "no floor": refused.'},
         {'lines': [at('"disabled"'), len(lines)], 'title': 'Disabled', 'text': 'Not a mistake: exit status 0.'}], width=1060))
    return figs


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--aegis', required=True, help='a checkout of github.com/ismailalitech/aegis')
    ap.add_argument('--check', action='store_true')
    a = ap.parse_args()
    spec = importlib.util.spec_from_file_location('gen_diagrams', os.path.join(a.aegis, 'tools', 'gen_diagrams.py'))
    gd = importlib.util.module_from_spec(spec); spec.loader.exec_module(gd)
    figs = (yaml.safe_load(open(os.path.join(HERE, 'figures.yaml'))) or []) + consoles(os.path.abspath(a.aegis))
    stale = []
    for d in figs:
        svg = gd.Diagram(d).render()
        path = os.path.join(OUT, d['id'] + '.svg')
        cur = open(path).read() if os.path.isfile(path) else None
        if cur != svg:
            stale.append(d['id'])
            if not a.check:
                open(path, 'w').write(svg)
    if a.check:
        print('out of date: %s' % stale if stale else '%d figures current' % len(figs))
        return 1 if stale else 0
    print('%d figures, %d written' % (len(figs), len(stale)))
    return 0


if __name__ == '__main__':
    sys.exit(main())
