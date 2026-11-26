+++
title = "The review's fixes on the bench: deployed, then regressed"
date = '2026-11-26T01:40:00+01:00'
draft = false
description = "After the 24-hour soak, the seven fixes from the review of the network paths went onto the bench. The gateway's three files were replaced on 24 November, with a backup and a hash check of every copy. On 26 November the full regression ran with three endpoints: 14 of 14 stages passed. Then the Zynq UltraScale+ board's bridge was replaced by the fixed build, with the old binary kept beside it. What each step was checked against, and one check that says less than it seems to."
weight = 50

[params]
+++

The [review of the Zynq UltraScale+ endpoint](/projects/fpga-soc/microchip-polarfire-soc/aegis/zynq-ultrascale-endpoint/x11-what-the-review-fixed-and-what-stays-open/)
ended with fixes that were tested on the PC and on a branch, and deployed nowhere. They waited for the
[24-hour soak](/projects/fpga-soc/microchip-polarfire-soc/aegis/bench-and-reproduce/k17-a-24-hour-soak-that-passed/),
which had to run on the code it started with. This page is what happened after it: the fixes went onto the gateway
on 24 November 2026, the full regression ran on 26 November, and the board's bridge was replaced the same night.

The work was done in three steps, one change at a time, each with its own way back.

## The seven fixes

All seven are about availability or about a report that trusted too much. None changes a key, a signature or the
protocol.

| Where | Before | After |
|---|---|---|
| The board's bridge | a 5-second timeout on each receive, so a client sending one byte every few seconds held its only worker for hours | one 5-second deadline for the whole request |
| The board's bridge | no timeout on sending | a 5-second send timeout on every connection; the connection is closed if it cannot be set |
| The board's bridge | it sent whatever reply length the secure side reported | a reply longer than its buffer is treated as an error of the secure side |
| The verifier's reads from endpoints | the timeout applied to each receive, so one slow endpoint, or a host answering in its place, held the whole cycle | the timeout covers the whole reply, and a read cannot exceed its limit |
| The gateway's quote service | a 3-second timeout on each receive, so eight slow clients held every slot | one 3-second deadline for the whole request |
| The gateway's quote service | a request could announce up to 1 MiB | a request that announces more than 1 KiB is refused before it is read |
| `fleet.py session` | reported "same session" from values the endpoint sends in clear | reports it only after a heartbeat that verifies under the stored session key |

The third row was found by fuzzing and cannot be reached with the trusted application as it is: it is defence in
depth. The last row is a diagnostic command; admission never depended on it. Each fix has a test that fails without
it. The host test suite has 542 tests with the fixes, against 534 before.

The fixes are on a branch that is not in the public repository yet.

## Step 1: the gateway, 24 November

Three files changed on the gateway: `fleet.py`, `aegisd.py` and `wire.py`.

- **Before.** Both services active, the three live endpoints admitted, the hashes of the three old files recorded,
  and an archive of the gateway's code directories written on the gateway.
- **Copy.** Each file was copied beside the old one under a temporary name, its SHA-256 compared with the PC's
  copy, and only then moved into place. All three matched exactly. Then both services were restarted.
- **After.** Two clean fleet cycles: STM32 board 2, the RW612 and the Zynq UltraScale+ admitted, and the two
  endpoints that were not connected quarantined, as they should be. `fleet.py check` on the signed policy exited 0.
  The policy was not changed or signed again: this was a change of code.

The PC verifier then refused the gateway's next quote:

```text
measurement changed: aegisd_code_sha256
```

That is the same refusal as after
[the first fix to the quote service](/projects/fpga-soc/microchip-polarfire-soc/aegis/attesting-an-endpoint/k04-one-slow-client-stalled-the-service/),
and it is correct: the gateway's quote includes a hash of its code, and the code had changed. The gateway was
enrolled again on purpose, and the next quote was accepted.

One slip belongs here. The old enrolment record was meant to be copied aside first, and the copy took the wrong
file, so there is no saved copy of the record that was replaced. Nothing that matters for a rollback was lost: the
code's way back is the archive on the gateway, and after restoring it the gateway is simply enrolled again.

## Step 2: the regression, 26 November

The boards had been disconnected in between. With them back and all three admitted, the full regression ran from
the branch with the fixes:

```text
tools/regression.sh --board --with-expiry
```

| | Result |
|---|---|
| stages | 14 of 14 passed, 0 failed, in a little over seven minutes |
| host tests | 542 run, OK, 3 skipped |
| endpoints in the board stages | STM32 board 2, RW612, Zynq UltraScale+ |
| expiry check | a 32-second credential on each of the three; after its end each refused the heartbeat and the session query, and each attested again |
| red team against the STM32 | 56 malformed requests, 56 refused |
| red team against the quote service | 160 malformed frames; a valid quote with a half-open client connected, in 0.061 s |

This is the first regression on the bench with the new verifier and quote service running on the gateway. The
verifier's whole-reply timeout is the change with the most room to break something that worked: a timeout that used
to restart with every receive now bounds the whole exchange. Three real endpoints went through the full attestation,
session and expiry stages under it, and none was cut off.

## Step 3: the bridge on the board, 26 November

The bridge is the small Linux program on the Zynq UltraScale+ board that passes each request line to the trusted
application
([lab 62](/projects/fpga-soc/microchip-polarfire-soc/aegis/zynq-ultrascale-endpoint/a15-optee-holds-the-key/)).
It carries three of the seven fixes.

- **Build.** Cross-compiled on the PC as a static AArch64 binary, linked against the static `libteec` from the
  OP-TEE client build. A static binary does not depend on which shared libraries the board's root file system has.
- **Swap.** The live binary was kept beside the new one under another name; the new one was moved into place and
  the service restarted. Going back is one rename and one restart.
- **After.** The service was active. A client that connected and sent nothing was dropped after about 5 seconds.
  The gateway admitted the board on its next cycle.

The bridge is not one of the board's measurements, so the swap needed no new endorsement and no change of policy.
That also means the gateway cannot tell which bridge is running: the swap is known from the bench, not from
attestation.

## What these checks show, and what they do not

- **The silent client does not prove the fix.** The old bridge also had a 5-second timeout on a receive, so a
  client that sends nothing was dropped after about 5 seconds before the swap too. The check shows that the new
  binary runs, serves and times out. The case the fix is for, a client that keeps sending one byte at a time, was
  tested on the PC, where the old code held the connection for 18 seconds and the new code drops it at its deadline. It was not
  repeated against the board.
- **The regression ran before the bridge swap.** It covers the new gateway code with the old bridge. After the
  swap the evidence is the three checks above, not a second regression.
- **The bridge's other two fixes were not exercised on the board.** The over-long reply cannot be produced with
  this trusted application, and a blocked send cannot be produced with replies this small. Both rest on the tests
  on the PC.
- **The fixed services have run for less than two days, not been soaked.** The 24-hour soak ran on the code before these
  fixes.
- **The review's other findings are not closed by this.** The ones that need a change to the protocol or to
  endpoint firmware are proposals, and none of them is deployed.

The regression's logs are kept with the project's evidence. They are not in the public repository yet; the figures
here are taken from them unchanged.

## Lesson

Deploying a fix and checking a fix are two steps, and a check only counts if the old code would have failed it. The
silent client was a fair test that the new bridge works. It was not a test that it is better. The page says which
is which, so that "deployed" is not read as "shown on the board".

## Next

The next planned step is hardening U-Boot on the Zynq UltraScale+ board. It has not started.
