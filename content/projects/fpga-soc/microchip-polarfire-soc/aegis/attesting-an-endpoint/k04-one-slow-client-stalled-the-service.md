+++
title = "One slow client could stall the quote service"
date = '2026-11-17T00:30:00+01:00'
draft = false
description = "The red-team harness took almost ten minutes because a client that sent half a frame held the gateway's quote service for its whole read timeout. Found by a long test run, fixed with threads and a short timeout."
weight = 60

[params]
+++

The gateway's quote service answers a PC verifier on TCP port 7443. The red-team harness sends it malformed frames and a client that connects and then says nothing. The first full run of that harness took **9 minutes 45 seconds**. Nothing had failed. Something was slow, and the slowness was the finding.

## Symptom

The harness sends 310 malformed frames: garbage, wrong JSON, a huge length prefix, a bad nonce. Each should be refused in a few milliseconds. In the first run each one took about two seconds, which is the length of the read timeout. After a half-open client, a valid quote request was delayed by the same amount.

## Cause

The service handled connections one at a time. A client that connected and sent half a frame held the only handler until the read timeout expired. Every other client waited behind it. A single idle connection from anywhere on the network was enough to delay every quote.

This does not break any key or signature. It breaks availability, and availability matters here: while the quote service is stalled, a verifier cannot check the gateway.

## Fix

- One thread per connection, at most 8 at once, each with a 3-second timeout.
- The hardware lock that protects the system controller now covers only the read of the system controller, not the whole request, so a slow client cannot hold it.

## Result

| Condition | Before | After |
|---|---|---|
| 310 malformed frames | about 2 s each | answered at once |
| A valid quote with a half-open client connected | delayed by the read timeout | 1 ms on the PC, 72 ms on the board |
| The full harness | 9 min 45 s | not timed on its own; the whole board regression, this harness included, runs in about 90 s |

After the 310 malformed frames the service still produced a valid quote, and with a slow client connected, the quote came back in 0.001 s on the PC.

## A side effect worth knowing

Deploying the fix changed the gateway's own code. The gateway's quote includes a hash of its code, so the PC verifier refused the next quote:

```text
measurement changed: aegisd_code_sha256
```

That is the system working: a changed gateway must be re-enrolled on purpose. The reference was updated and the previous enrolment kept.

## What it means for you

A test that takes much longer than it should is a result. Time your negative tests, and treat a slow one as a failure. And any service that serves one client at a time has a denial of service built into it, however well its parsing is written.
