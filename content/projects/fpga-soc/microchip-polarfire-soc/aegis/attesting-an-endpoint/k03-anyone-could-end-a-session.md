+++
title = "Anyone who could reach the port could end a session"
date = '2026-11-17T00:30:00+01:00'
draft = false
description = "Preparing the negative tests for mutual authentication exposed that a new key-exchange start dropped an established session. The session is now replaced only when a new exchange completes."
weight = 50

[params]
+++

This one was found by writing the tests, not by a failure. While preparing the negative cases for mutual authentication, the question was what an attacker on the network could do to an established session. The answer was: end it.

## The behaviour

The endpoint's prover serves a line protocol on TCP port 7444. A key exchange has two steps: `PQKEMINIT`, which makes a fresh ML-KEM key pair and returns its public part, and `PQKEMFIN`, which completes the exchange with the gateway's ciphertext and credential. A session exists once the second step has succeeded.

The first implementation threw the old session away when `PQKEMINIT` arrived. So anyone who could connect to port 7444 could send that one line and the endpoint would lose the session it had agreed with the real gateway. The next heartbeat would fail and the gateway would re-provision, so this was a denial of service, not a break of the keys. It was also free, repeatable and needed no credentials.

## Fix

The session is replaced only when a **new exchange completes** successfully, which requires a valid credential signed by the gateway's key. A start that is never finished, or that is finished with a credential from the wrong key, leaves the established session untouched.

Two related changes were made at the same time:

- The gateway re-checks the endpoint's session every cycle with a heartbeat (a counter and a hash over the session key and a fresh nonce) and provisions again on a mismatch. The previous query, which asked for the session identifier, was not tied to a fresh challenge and could be replayed.
- The gateway's service reloads its policy file at every cycle. Before this, after an image update it kept quarantining the endpoint against the old measurement until the service was restarted.

## Checks on the real STM32

`tests/board/mutual_auth_checks.py` against the board:

| Case | Result |
|---|---|
| A credential signed by a foreign key, made on the PC | refused, error -149 |
| A credential signed by the real gateway key but bound to another ciphertext | refused, error -149 |
| The established session after both attempts | unchanged; the gateway and the STM32 report the same identifier |

The harness also sends the key-exchange finish without a start; the secure side answers with a bad-state error.

## What it means for you

An authenticated state should only be replaced by a state that is at least as authenticated. If any unauthenticated message can destroy a session, the session is as weak as the weakest message the port accepts. Write the negative test for the state transition before you write the transition.
